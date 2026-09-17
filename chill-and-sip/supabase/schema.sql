-- VH2O baseline schema for Supabase email auth + gallons tracking.
-- Run this whole file once in the Supabase SQL editor. After it succeeds, follow the
-- "Admin bootstrap" step in chill-and-sip/SUPABASE_SETUP.md to create your real admin
-- profile row (there is no seed admin insert in this file on purpose, so this script is
-- safe to re-run).

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  -- Nullable: imported/legacy customers have no email until they self-serve claim their
  -- account (see claim_profile() below). Postgres allows multiple NULLs in a unique column.
  email text unique,
  role text not null default 'user' check (role in ('admin', 'user')),
  gallons integer not null default 0 check (gallons >= 0),
  name text not null,
  member_since text,
  legacy_id integer unique not null,
  -- Informational only (pricing/tiers are handled by staff at the register, not the app).
  water_type text check (water_type is null or water_type in ('purified', 'remineralized', 'alkaline')),
  -- One-time code an admin hands a customer so they can self-register without staff already
  -- having their email. Single-use: claim_profile() clears it once redeemed.
  claim_code text,
  -- Set only by admin_adjust_gallons(), never by any other profile edit, so "time since last
  -- real transaction" stays meaningful for the app's client-side active/inactive computation.
  last_transaction_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles alter column email drop not null;
alter table public.profiles add column if not exists water_type text;
alter table public.profiles add column if not exists claim_code text;
alter table public.profiles add column if not exists last_transaction_at timestamptz;
alter table public.profiles drop constraint if exists profiles_water_type_check;
alter table public.profiles add constraint profiles_water_type_check
  check (water_type is null or water_type in ('purified', 'remineralized', 'alkaline'));
create unique index if not exists profiles_claim_code_key on public.profiles (claim_code) where claim_code is not null;

create table if not exists public.gallon_transactions (
  id bigint generated always as identity primary key,
  user_profile_id uuid not null references public.profiles(id) on delete cascade,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  amount integer not null,
  previous_balance integer not null check (previous_balance >= 0),
  new_balance integer not null check (new_balance >= 0),
  note text,
  created_at timestamptz not null default now()
);

alter table public.gallon_transactions add column if not exists note text;

create or replace function public.set_profiles_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_profiles_updated_at();

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.auth_user_id = uid and p.role = 'admin'
  );
$$;

alter table public.profiles enable row level security;
alter table public.gallon_transactions enable row level security;

-- Profiles: users can read self, admins can read/manage all.
-- Note: there is no self-update policy. No field on profiles (especially gallons) is
-- editable by the row owner. All balance changes must go through admin_adjust_gallons().
-- auth.uid() is wrapped in (select ...) so Postgres evaluates it once per query instead
-- of once per row (Supabase RLS performance best practice; no behavior change).
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select"
on public.profiles
for select
to authenticated
using (auth_user_id = (select auth.uid()) or public.is_admin((select auth.uid())));

drop policy if exists "profiles_insert_admin" on public.profiles;
create policy "profiles_insert_admin"
on public.profiles
for insert
to authenticated
with check (public.is_admin((select auth.uid())));

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update"
on public.profiles
for update
to authenticated
using (public.is_admin((select auth.uid())))
with check (public.is_admin((select auth.uid())));

-- Transactions: users can read own, admins can read all.
-- Note: there is no insert policy here on purpose. Rows are only ever written by
-- admin_adjust_gallons() (SECURITY DEFINER, bypasses RLS as the table owner), so every
-- transaction is guaranteed to be paired with the matching atomic balance change.
drop policy if exists "transactions_select" on public.gallon_transactions;
create policy "transactions_select"
on public.gallon_transactions
for select
to authenticated
using (
  public.is_admin((select auth.uid()))
  or exists (
    select 1
    from public.profiles p
    where p.id = user_profile_id and p.auth_user_id = (select auth.uid())
  )
);

drop policy if exists "transactions_insert_admin" on public.gallon_transactions;

create index if not exists gallon_transactions_user_profile_id_idx on public.gallon_transactions (user_profile_id);
create index if not exists gallon_transactions_actor_profile_id_idx on public.gallon_transactions (actor_profile_id);

-- Atomically adjust a customer's gallon balance and record the transaction.
-- This is the ONLY supported way to change profiles.gallons. It:
--   1. Re-checks admin status server-side (does not trust the client/RLS alone).
--   2. Locks the target row so concurrent admin actions cannot race each other.
--   3. Rejects any change that would take the balance below zero.
--   4. Updates the balance and inserts the transaction row in one DB transaction.
create or replace function public.admin_adjust_gallons(
  target_profile_id uuid,
  delta integer,
  note text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_profile_id uuid;
  current_balance integer;
  computed_balance integer;
  updated_profile public.profiles;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can adjust gallons';
  end if;

  if delta = 0 then
    raise exception 'Adjustment amount must not be zero';
  end if;

  select id into caller_profile_id from public.profiles where auth_user_id = auth.uid();

  select gallons into current_balance
  from public.profiles
  where id = target_profile_id
  for update;

  if not found then
    raise exception 'Customer profile not found';
  end if;

  computed_balance := current_balance + delta;
  if computed_balance < 0 then
    raise exception 'Insufficient balance: customer has % gallons, cannot debit %', current_balance, -delta;
  end if;

  update public.profiles
  set gallons = computed_balance,
      last_transaction_at = now()
  where id = target_profile_id
  returning * into updated_profile;

  insert into public.gallon_transactions (
    user_profile_id, actor_profile_id, amount, previous_balance, new_balance, note
  ) values (
    target_profile_id, caller_profile_id, delta, current_balance, computed_balance, nullif(trim(note), '')
  );

  return updated_profile;
end;
$$;

revoke all on function public.admin_adjust_gallons(uuid, integer, text) from public;
grant execute on function public.admin_adjust_gallons(uuid, integer, text) to authenticated;

-- The app only ever runs as the `authenticated` role (a signed-in user) or unauthenticated
-- for the public Menu/Locations tabs, which touch neither table. Lock the anon (logged-out)
-- role out of these tables/functions entirely instead of relying solely on RLS, and keep
-- them out of the anon-facing GraphQL/REST schema. Supabase grants EXECUTE on new functions
-- to anon/authenticated by default, so this has to be revoked explicitly per-role, not just
-- from PUBLIC.
revoke all on public.profiles from anon;
revoke all on public.gallon_transactions from anon;
revoke execute on function public.is_admin(uuid) from public, anon;
revoke execute on function public.admin_adjust_gallons(uuid, integer, text) from anon;

-- Admin-only: (re)generate a claim code for a customer who hasn't linked a login yet.
-- Overwrites any previous unused code for that profile.
create or replace function public.admin_generate_claim_code(target_profile_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  new_code text;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can generate claim codes';
  end if;

  if exists (select 1 from public.profiles where id = target_profile_id and auth_user_id is not null) then
    raise exception 'This customer already has a linked login';
  end if;

  new_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  update public.profiles
  set claim_code = new_code
  where id = target_profile_id;

  if not found then
    raise exception 'Customer profile not found';
  end if;

  return new_code;
end;
$$;

revoke all on function public.admin_generate_claim_code(uuid) from public, anon;
grant execute on function public.admin_generate_claim_code(uuid) to authenticated;

-- Customer self-serve: after a customer signs up client-side (email+password, no profile
-- link yet), they call this once with the ID + code an admin handed them. Only links an
-- UNCLAIMED profile (auth_user_id is null) matching both the id and the exact code, and only
-- to a caller who doesn't already have a linked profile. Clears the code so it can't be
-- reused, and adopts the email they just signed up with.
create or replace function public.claim_profile(
  p_legacy_id integer,
  p_claim_code text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_email text;
  target public.profiles;
  updated_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  if exists (select 1 from public.profiles where auth_user_id = auth.uid()) then
    raise exception 'This login is already linked to an account';
  end if;

  select email into caller_email from auth.users where id = auth.uid();
  if caller_email is null then
    raise exception 'Could not determine signed-in email';
  end if;

  select * into target
  from public.profiles
  where legacy_id = p_legacy_id
    and claim_code is not null
    and claim_code = p_claim_code
    and auth_user_id is null
  for update;

  if not found then
    raise exception 'Invalid customer ID or claim code';
  end if;

  update public.profiles
  set auth_user_id = auth.uid(),
      email = lower(caller_email),
      claim_code = null
  where id = target.id
  returning * into updated_profile;

  return updated_profile;
end;
$$;

revoke all on function public.claim_profile(integer, text) from public, anon;
grant execute on function public.claim_profile(integer, text) to authenticated;

