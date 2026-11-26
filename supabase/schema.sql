-- VH2O baseline schema for Supabase email auth + gallons tracking.
-- Run this whole file once in the Supabase SQL editor. After it succeeds, follow the
-- "Admin bootstrap" step in SUPABASE_SETUP.md to create your real admin
-- profile row (there is no seed admin insert in this file on purpose, so this script is
-- safe to re-run).

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  -- Nullable: imported/legacy customers have no email until staff save one at the counter (see
  -- admin_set_customer_email() below). Signing in with that email links the login
  -- (link_my_profile()). Postgres allows multiple NULLs in a unique column.
  email text unique,
  role text not null default 'user' check (role in ('admin', 'user')),
  gallons integer not null default 0 check (gallons >= 0),
  name text not null,
  member_since date,
  legacy_id integer unique not null,
  -- Informational only (pricing/tiers are handled by staff at the register, not the app).
  water_type text check (water_type is null or water_type in ('purified', 'remineralized', 'alkaline')),
  -- Set only by admin_adjust_gallons(), never by any other profile edit, so "time since last
  -- real transaction" stays meaningful for the app's client-side active/inactive computation.
  last_transaction_at timestamptz,
  anonymized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles alter column email drop not null;
alter table public.profiles add column if not exists water_type text;
alter table public.profiles add column if not exists last_transaction_at timestamptz;
-- Set by admin_anonymize_customer(); starts the 3-year clock for purging the row and its
-- transactions (see /delete-account/).
alter table public.profiles add column if not exists anonymized_at timestamptz;

-- member_since is a date (ROADMAP item C); null means unknown, which the app hides. Earlier
-- versions stored free text ("N/A" or a browser-formatted date): anything that isn't an ISO date
-- becomes null.
do $$
begin
  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles' and column_name = 'member_since') = 'text' then
    alter table public.profiles alter column member_since type date
      using case when member_since ~ '^\d{4}-\d{2}-\d{2}$' then member_since::date end;
  end if;
end $$;
alter table public.profiles drop constraint if exists profiles_water_type_check;
alter table public.profiles add constraint profiles_water_type_check
  check (water_type is null or water_type in ('purified', 'remineralized', 'alkaline'));

-- Claim codes were retired for email sign-in (ROADMAP item G). Drop what they left behind.
drop function if exists public.admin_generate_claim_code(uuid);
drop function if exists public.claim_profile(integer, text);
drop index if exists public.profiles_claim_code_key;
alter table public.profiles drop column if exists claim_code;

-- A profile stays linked only to a login that exists: deleting a login (e.g. from the
-- dashboard) unlinks its profile instead of leaving auth_user_id pointing at nothing. Clears any
-- link that already dangles first, or the constraint can't be added.
update public.profiles p
set auth_user_id = null
where p.auth_user_id is not null
  and not exists (select 1 from auth.users u where u.id = p.auth_user_id);
alter table public.profiles drop constraint if exists profiles_auth_user_id_fkey;
alter table public.profiles add constraint profiles_auth_user_id_fkey
  foreign key (auth_user_id) references auth.users (id) on delete set null;

-- Customer numbers come from the database, so two admins adding customers at once can't collide.
-- setval keeps the next number above every existing one, so re-running this file is safe.
create sequence if not exists public.profiles_legacy_id_seq owned by public.profiles.legacy_id;
select setval('public.profiles_legacy_id_seq', greatest((select max(legacy_id) from public.profiles), 100));
alter table public.profiles alter column legacy_id set default nextval('public.profiles_legacy_id_seq');

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

-- Each entry says what it is (ROADMAP item C) instead of leaving it to the sign of amount:
-- purchase (+), fill (-), forfeit (-, the leftover balance when an account is deleted), and
-- correction (reverses one purchase or fill, linked by corrects_transaction_id; written only by
-- admin_correct_transaction()). Older rows get their kind from the sign and the forfeit note.
alter table public.gallon_transactions add column if not exists kind text;
alter table public.gallon_transactions
  add column if not exists corrects_transaction_id bigint references public.gallon_transactions (id);
update public.gallon_transactions
set kind = case
  when note = 'Balance forfeited: account deleted' then 'forfeit'
  when amount > 0 then 'purchase'
  else 'fill'
end
where kind is null;
alter table public.gallon_transactions alter column kind set not null;
alter table public.gallon_transactions drop constraint if exists gallon_transactions_kind_check;
alter table public.gallon_transactions add constraint gallon_transactions_kind_check check (
  (kind = 'purchase' and amount > 0 and corrects_transaction_id is null)
  or (kind = 'fill' and amount < 0 and corrects_transaction_id is null)
  or (kind = 'forfeit' and amount < 0 and corrects_transaction_id is null)
  or (kind = 'correction' and amount <> 0 and corrects_transaction_id is not null)
);
-- An entry can be corrected once.
create unique index if not exists gallon_transactions_corrects_once
  on public.gallon_transactions (corrects_transaction_id) where corrects_transaction_id is not null;

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

-- Only ever answers for the caller: is_admin(<someone else's id>) is false, so a signed-in
-- customer can't probe which accounts are admins. Every caller in this file passes auth.uid().
-- coalesce() matters: with no session, `uid = auth.uid()` is NULL, and `if not NULL` would
-- skip the admin checks in the functions below instead of raising.
-- No MFA requirement (MFA from PR #37 was removed 2026-11-24, by the owners' choice).
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(uid = auth.uid(), false)
    and exists (
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
-- This is the ONLY supported way to change profiles.gallons (apart from the forfeit in
-- admin_anonymize_customer(), which writes its own matching transaction row). It:
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
    user_profile_id, actor_profile_id, amount, previous_balance, new_balance, note, kind
  ) values (
    target_profile_id, caller_profile_id, delta, current_balance, computed_balance, nullif(trim(note), ''),
    case when delta > 0 then 'purchase' else 'fill' end
  );

  return updated_profile;
end;
$$;

revoke all on function public.admin_adjust_gallons(uuid, integer, text) from public;
grant execute on function public.admin_adjust_gallons(uuid, integer, text) to authenticated;

-- Admin-only: reverses one mistaken purchase or fill (say, 50 gallons rung up instead of 5) with a
-- 'correction' entry linked to it and a required note saying why. Like admin_adjust_gallons(), it
-- locks the customer's row, won't take the balance below zero, and writes the balance and the
-- entry together. A correction isn't a visit, so last_transaction_at is left alone. Each entry can
-- be corrected once; corrections and forfeits can't be corrected.
create or replace function public.admin_correct_transaction(p_transaction_id bigint, p_note text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_profile_id uuid;
  original public.gallon_transactions;
  current_balance integer;
  computed_balance integer;
  clean_note text := nullif(trim(p_note), '');
  updated_profile public.profiles;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can correct entries';
  end if;
  if clean_note is null then
    raise exception 'Say why the entry is being corrected';
  end if;

  select * into original from public.gallon_transactions where id = p_transaction_id;
  if not found then
    raise exception 'Ledger entry not found';
  end if;
  if original.kind not in ('purchase', 'fill') then
    raise exception 'Only a purchase or a fill can be corrected';
  end if;

  select id into caller_profile_id from public.profiles where auth_user_id = auth.uid();

  -- Lock the customer first, as admin_adjust_gallons() does, then check for an earlier correction.
  select gallons into current_balance
  from public.profiles
  where id = original.user_profile_id and anonymized_at is null
  for update;
  if not found then
    raise exception 'This customer''s data was deleted';
  end if;
  if exists (select 1 from public.gallon_transactions where corrects_transaction_id = original.id) then
    raise exception 'This entry was already corrected';
  end if;

  computed_balance := current_balance - original.amount;
  if computed_balance < 0 then
    raise exception 'Can''t correct: the balance would go below zero (the customer has % gallons)', current_balance;
  end if;

  update public.profiles
  set gallons = computed_balance
  where id = original.user_profile_id
  returning * into updated_profile;

  insert into public.gallon_transactions (
    user_profile_id, actor_profile_id, amount, previous_balance, new_balance, note, kind, corrects_transaction_id
  ) values (
    original.user_profile_id, caller_profile_id, -original.amount, current_balance, computed_balance, clean_note,
    'correction', original.id
  );

  return updated_profile;
end;
$$;

revoke all on function public.admin_correct_transaction(bigint, text) from public, anon;
grant execute on function public.admin_correct_transaction(bigint, text) to authenticated;

-- The app only ever runs as the `authenticated` role (a signed-in user) or unauthenticated
-- for the public Menu/Locations tabs, which touch neither table. Lock the anon (logged-out)
-- role out of these tables/functions entirely instead of relying solely on RLS, and keep
-- them out of the anon-facing GraphQL/REST schema. Supabase grants EXECUTE on new functions
-- to anon/authenticated by default, so this has to be revoked explicitly per-role, not just
-- from PUBLIC.
revoke all on public.profiles from anon;
revoke all on public.gallon_transactions from anon;
revoke execute on function public.is_admin(uuid) from public, anon;
-- The RLS policies above call it as the signed-in user.
grant execute on function public.is_admin(uuid) to authenticated;
revoke execute on function public.admin_adjust_gallons(uuid, integer, text) from anon;

-- RLS lets the admin write any profiles row, so also limit which columns a signed-in user can
-- write at all. Otherwise an admin session (or a bug in the admin screen) could PATCH gallons,
-- role, or auth_user_id directly, changing a balance with no ledger row or moving one customer's
-- balance to another login. Balances change only through admin_adjust_gallons() and
-- admin_anonymize_customer(), which run as the table owner and aren't limited by these grants.
-- Revoking the table-wide privilege also clears column grants, so this re-runs cleanly, and a
-- new column stays unwritable until it's added here.
revoke insert, update on public.profiles from authenticated;
-- Customers are added through admin_add_customer() and emails set through
-- admin_set_customer_email(), so signed-in users get no INSERT at all. Admin water-type picker:
-- RLS still refuses customers.
grant update (water_type) on public.profiles to authenticated;

-- Shared by the two admin email functions below: lowercased and trimmed, or null when blank.
-- Raises for anything that isn't shaped like an email address.
create or replace function public.normalize_customer_email(p_email text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  normalized text := nullif(lower(trim(p_email)), '');
begin
  if normalized is not null and normalized !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address';
  end if;
  return normalized;
end;
$$;

revoke all on function public.normalize_customer_email(text) from public, anon, authenticated;

-- Admin-only: adds a customer record. The customer number comes from profiles_legacy_id_seq,
-- the balance starts at 0, and the role is 'user'. The email is required: every customer sets up
-- their own sign-in with it (an emailed code), and link_my_profile() connects them.
create or replace function public.admin_add_customer(p_name text, p_email text default null)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_name text := nullif(trim(p_name), '');
  clean_email text;
  created public.profiles;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can add customers';
  end if;

  if clean_name is null then
    raise exception 'Enter the customer''s name';
  end if;

  clean_email := public.normalize_customer_email(p_email);
  if clean_email is null then
    raise exception 'Enter the customer''s email';
  end if;
  if exists (select 1 from public.profiles where lower(email) = clean_email) then
    raise exception 'Another customer already has this email';
  end if;

  -- Rows inserted with an explicit number (e.g. an import) don't advance the sequence, so move
  -- it past the highest number first. Never backwards: last_value covers numbers already handed
  -- out to inserts that haven't committed yet.
  perform setval('public.profiles_legacy_id_seq', greatest(
    (select max(legacy_id) from public.profiles),
    (select last_value from public.profiles_legacy_id_seq)
  ));

  insert into public.profiles (name, email, member_since)
  values (clean_name, clean_email, (now() at time zone 'America/Phoenix')::date)
  returning * into created;

  return created;
end;
$$;

revoke all on function public.admin_add_customer(text, text) from public, anon;
grant execute on function public.admin_add_customer(text, text) to authenticated;

-- Admin-only: saves the email on a customer record that has no login yet (the imported customers
-- start without one). It can be corrected but not cleared. Once a login is linked, the email
-- belongs to that login and can't be changed here.
create or replace function public.admin_set_customer_email(target_profile_id uuid, p_email text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_email text;
  target public.profiles;
  updated_profile public.profiles;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can change customer emails';
  end if;

  select * into target from public.profiles where id = target_profile_id for update;
  if not found then
    raise exception 'Customer profile not found';
  end if;
  if target.role <> 'user' then
    raise exception 'Only customer records have an email set here';
  end if;
  if target.anonymized_at is not null then
    raise exception 'This customer''s data was deleted';
  end if;
  if target.auth_user_id is not null then
    raise exception 'This customer already has a login; their email comes from it';
  end if;

  clean_email := public.normalize_customer_email(p_email);
  if clean_email is null then
    raise exception 'Enter the customer''s email';
  end if;
  if exists (
    select 1 from public.profiles where lower(email) = clean_email and id <> target_profile_id
  ) then
    raise exception 'Another customer already has this email';
  end if;

  update public.profiles
  set email = clean_email
  where id = target_profile_id
  returning * into updated_profile;

  return updated_profile;
end;
$$;

revoke all on function public.admin_set_customer_email(uuid, text) from public, anon;
grant execute on function public.admin_set_customer_email(uuid, text) to authenticated;

-- Any signed-in user: returns the caller's customer record, linking it first if this is their
-- first sign-in. Links the one unlinked customer record whose email matches the login's email,
-- and only when that email is confirmed AND the login has no password:
--   - A confirmed email proves the person reading that inbox signed in (emailed code or Google).
--   - A login with a password is refused even when confirmed. Customers sign in with codes or
--     Google, which never set one, while a password sign-up made straight through the Auth API
--     could be auto-confirmed (if "Confirm email" is off) or could have been planted before the
--     real customer's first code sign-in confirmed it. Either way, its creator knows the password.
-- Returns null when there's nothing to link (the app then asks the customer to see staff).
-- Never links an admin record or a deleted customer's.
create or replace function public.link_my_profile()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  login auth.users;
  linked public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select * into linked from public.profiles where auth_user_id = auth.uid();
  if found then
    return linked;
  end if;

  select * into login from auth.users where id = auth.uid();
  if login.email is null
    or login.email_confirmed_at is null
    or coalesce(login.encrypted_password, '') <> '' then
    return null;
  end if;

  update public.profiles
  set auth_user_id = auth.uid()
  where id = (
    select id from public.profiles
    where lower(email) = lower(login.email)
      and auth_user_id is null
      and role = 'user'
      and anonymized_at is null
    for update
  )
  returning * into linked;

  if found then
    return linked;
  end if;

  -- Two calls at once (the app refreshes on sign-in from two places): the one that waited on
  -- the row lock finds it already linked, by the other call, to this same login.
  select * into linked from public.profiles where auth_user_id = auth.uid();
  if found then
    return linked;
  end if;
  return null;
end;
$$;

revoke all on function public.link_my_profile() from public, anon;
grant execute on function public.link_my_profile() to authenticated;

-- Admin-only: honors an account-deletion request (/delete-account/). Deleting the profile row
-- would cascade to its gallon_transactions, which are kept for 3 years, so instead this
-- removes everything that identifies the customer -- name, email, water type --
-- and deletes their login (auth.users row). The row and transactions stay, no longer linked
-- to a person; anonymized_at marks when the 3-year purge clock started. Any remaining balance
-- is forfeited, as /delete-account/ says, and recorded as a final ledger entry so the balance
-- and transaction history still agree (the one change to gallons outside
-- admin_adjust_gallons()). Admin profiles can't be anonymized (that includes the caller's own).
create or replace function public.admin_anonymize_customer(target_profile_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_profile_id uuid;
  target public.profiles;
  updated_profile public.profiles;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can delete customer data';
  end if;

  select id into caller_profile_id from public.profiles where auth_user_id = auth.uid();

  select * into target
  from public.profiles
  where id = target_profile_id
  for update;

  if not found then
    raise exception 'Customer profile not found';
  end if;

  if target.role = 'admin' then
    raise exception 'Admin accounts cannot be anonymized';
  end if;

  if target.anonymized_at is not null then
    raise exception 'This customer''s data was already deleted';
  end if;

  if target.gallons > 0 then
    insert into public.gallon_transactions (
      user_profile_id, actor_profile_id, amount, previous_balance, new_balance, note, kind
    ) values (
      target.id, caller_profile_id, -target.gallons, target.gallons, 0, 'Balance forfeited: account deleted', 'forfeit'
    );
  end if;

  update public.profiles
  set name = 'Deleted customer',
      email = null,
      auth_user_id = null,
      water_type = null,
      gallons = 0,
      anonymized_at = now()
  where id = target.id
  returning * into updated_profile;

  if target.auth_user_id is not null then
    delete from auth.users where id = target.auth_user_id;
  end if;

  return updated_profile;
end;
$$;

revoke all on function public.admin_anonymize_customer(uuid) from public, anon;
grant execute on function public.admin_anonymize_customer(uuid) to authenticated;

-- Admin customer panel (ROADMAP item B): the database does the searching, so the admin's
-- browser only ever holds the customers a search matched, never the whole list. All three are
-- read-only (STABLE) and SECURITY INVOKER, so RLS applies on top of the admin check. Active means
-- a visit (ledger entry) in the last 60 days, the same rule as the assistant and the app.
-- member_since changed type (item C), and a function's result type can't change in place.
drop function if exists public.admin_search_customers(text, text, text, integer);
create or replace function public.admin_search_customers(
  p_query text,
  p_filter text default 'all',
  p_sort text default 'name',
  p_limit integer default 50
)
returns table (
  id uuid,
  legacy_id integer,
  name text,
  email text,
  gallons integer,
  water_type text,
  has_login boolean,
  member_since date,
  last_transaction_at timestamptz,
  anonymized_at timestamptz,
  total_matches bigint
)
language plpgsql
stable
set search_path = public
as $$
declare
  q text := trim(p_query);
  pattern text;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can search customers';
  end if;
  -- Same rule as the screen: nothing is listed until 3+ characters are typed.
  if q is null or length(q) < 3 or length(q) > 100 then
    raise exception 'Type 3 to 100 characters to search';
  end if;
  if p_filter is null or p_filter not in ('all', 'active', 'inactive', 'nologin') then
    raise exception 'Unknown filter %', p_filter;
  end if;
  if p_sort is null or p_sort not in ('name', 'gallons') then
    raise exception 'Unknown sort %', p_sort;
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'limit must be between 1 and 100';
  end if;

  pattern := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
  select
    p.id,
    p.legacy_id,
    p.name,
    p.email,
    p.gallons,
    p.water_type,
    p.auth_user_id is not null,
    p.member_since,
    p.last_transaction_at,
    p.anonymized_at,
    count(*) over ()
  from public.profiles p
  where p.role = 'user'
    and (
      p.name ilike pattern
      or p.email ilike pattern
      or p.legacy_id::text like pattern
    )
    and case p_filter
      when 'active' then p.last_transaction_at >= now() - interval '60 days'
      when 'inactive' then p.last_transaction_at is null or p.last_transaction_at < now() - interval '60 days'
      when 'nologin' then p.auth_user_id is null and p.anonymized_at is null
      else true
    end
  order by
    case when p_sort = 'gallons' then p.gallons end desc nulls last,
    lower(p.name),
    p.legacy_id
  limit p_limit;
end;
$$;

-- One customer record, for the details panel (by customer number, which is what the panel keeps
-- selected across tabs). Same columns as a search row.
drop function if exists public.admin_get_customer(integer);
create or replace function public.admin_get_customer(p_legacy_id integer)
returns table (
  id uuid,
  legacy_id integer,
  name text,
  email text,
  gallons integer,
  water_type text,
  has_login boolean,
  member_since date,
  last_transaction_at timestamptz,
  anonymized_at timestamptz
)
language plpgsql
stable
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can look up customers';
  end if;

  return query
  select
    p.id, p.legacy_id, p.name, p.email, p.gallons, p.water_type,
    p.auth_user_id is not null, p.member_since, p.last_transaction_at, p.anonymized_at
  from public.profiles p
  where p.role = 'user' and p.legacy_id = p_legacy_id;
end;
$$;

-- The "X active / Y total customers" line.
create or replace function public.admin_customer_summary()
returns table (total_customers bigint, active_customers bigint)
language plpgsql
stable
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can see customer totals';
  end if;

  return query
  select
    count(*),
    count(*) filter (where p.last_transaction_at >= now() - interval '60 days')
  from public.profiles p
  where p.role = 'user';
end;
$$;

revoke all on function public.admin_search_customers(text, text, text, integer) from public, anon;
revoke all on function public.admin_get_customer(integer) from public, anon;
revoke all on function public.admin_customer_summary() from public, anon;
grant execute on function public.admin_search_customers(text, text, text, integer) to authenticated;
grant execute on function public.admin_get_customer(integer) to authenticated;
grant execute on function public.admin_customer_summary() to authenticated;

-- Menu, prices, and store info (ROADMAP item E). Anyone can read them (the menu and Location
-- screens work signed out); only the admin can change them, and only the columns meant to be
-- edited. Categories themselves (names, order, icons, colors) stay as they are seeded: the admin
-- edits a category's size prices, not the category. Every edit made from the app is recorded in
-- menu_changes by a trigger, so it can't be skipped. supabase/seed/menu.sql loads the starting
-- menu (from the shop's POS catalog).

-- A size list: a JSON array of {key, label, price} with a non-empty key and label and a price of
-- 0 or more with at most 2 decimals. Null means "no sizes".
create or replace function public.valid_size_tiers(tiers jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select tiers is null or (
    jsonb_typeof(tiers) = 'array'
    and jsonb_array_length(tiers) between 1 and 6
    and not exists (
      select 1 from jsonb_array_elements(tiers) t
      where jsonb_typeof(t) <> 'object'
         or coalesce(trim(t ->> 'key'), '') = ''
         or coalesce(trim(t ->> 'label'), '') = ''
         or jsonb_typeof(t -> 'price') <> 'number'
         or (t ->> 'price')::numeric < 0
         or (t ->> 'price')::numeric <> round((t ->> 'price')::numeric, 2)
    )
  );
$$;

create table if not exists public.menu_categories (
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  name text not null,
  icon text not null,
  -- A bundled image shown instead of the emoji (e.g. 'bottles'), or null.
  image_key text,
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  sort_order integer not null,
  -- Sizes every item in the category comes in (e.g. Small/Large), unless an item has its own price
  -- or sizes.
  size_tiers jsonb check (public.valid_size_tiers(size_tiers)),
  updated_at timestamptz not null default now()
);

create table if not exists public.menu_items (
  id bigint generated always as identity primary key,
  category_id text not null references public.menu_categories (id),
  name text not null check (length(trim(name)) > 0),
  -- One price for the item. Null means it comes in sizes: its own size_tiers, or its category's.
  price numeric(8, 2) check (price >= 0),
  unit text,
  description text,
  size_tiers jsonb check (public.valid_size_tiers(size_tiers)),
  sort_order integer not null default 0,
  hidden boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists menu_items_category_idx on public.menu_items (category_id, sort_order);

-- The shop's details, as one row.
create table if not exists public.store_info (
  id boolean primary key default true check (id),
  address_line1 text not null,
  address_line2 text not null,
  phone_display text not null,
  phone_tel text not null check (phone_tel ~ '^tel:\+[0-9]{8,15}$'),
  -- [{days, hours}], e.g. [{"days": "Mon - Sat", "hours": "10am - 7pm"}]
  hours jsonb not null check (
    jsonb_typeof(hours) = 'array' and jsonb_array_length(hours) between 1 and 7
  ),
  tagline text,
  welcome text,
  order_url text check (order_url is null or order_url ~ '^https://'),
  facebook_url text check (facebook_url is null or facebook_url ~ '^https://'),
  maps_google_url text check (maps_google_url is null or maps_google_url ~ '^https://'),
  maps_apple_url text check (maps_apple_url is null or maps_apple_url ~ '^https://'),
  updated_at timestamptz not null default now()
);

-- Every menu or store-info edit made from the app: what changed, the old and new values, when,
-- and who. Written only by the trigger below (no client can insert, change, or delete a row).
-- Edits made directly in SQL (migrations, the seed) have no signed-in user and aren't logged.
create table if not exists public.menu_changes (
  id bigint generated always as identity primary key,
  changed_at timestamptz not null default now(),
  changed_by uuid references public.profiles (id) on delete set null,
  table_name text not null,
  row_key text not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  old_values jsonb,
  new_values jsonb
);
create index if not exists menu_changes_changed_at_idx on public.menu_changes (changed_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.log_menu_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_row jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) - 'updated_at' end;
  new_row jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) - 'updated_at' end;
begin
  if auth.uid() is null then
    return null;
  end if;
  -- An update that changes nothing isn't worth a row.
  if tg_op = 'UPDATE' and old_row = new_row then
    return null;
  end if;
  insert into public.menu_changes (changed_by, table_name, row_key, action, old_values, new_values)
  values (
    (select id from public.profiles where auth_user_id = auth.uid()),
    tg_table_name,
    coalesce(new_row ->> 'id', old_row ->> 'id'),
    lower(tg_op),
    old_row,
    new_row
  );
  return null;
end;
$$;

revoke all on function public.log_menu_change() from public, anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['menu_categories', 'menu_items', 'store_info'] loop
    execute format('drop trigger if exists trg_%1$s_touch on public.%1$I', t);
    execute format('create trigger trg_%1$s_touch before update on public.%1$I for each row execute function public.touch_updated_at()', t);
    execute format('drop trigger if exists trg_%1$s_log on public.%1$I', t);
    execute format('create trigger trg_%1$s_log after insert or update or delete on public.%1$I for each row execute function public.log_menu_change()', t);
  end loop;
end $$;

alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.store_info enable row level security;
alter table public.menu_changes enable row level security;

-- Reading: everyone. Hidden items only for the admin. (anon has no EXECUTE on is_admin(), so
-- signed-out visitors get their own policy that never calls it.)
drop policy if exists "menu_categories_read" on public.menu_categories;
create policy "menu_categories_read" on public.menu_categories for select to anon, authenticated using (true);
drop policy if exists "store_info_read" on public.store_info;
create policy "store_info_read" on public.store_info for select to anon, authenticated using (true);
drop policy if exists "menu_items_read_public" on public.menu_items;
create policy "menu_items_read_public" on public.menu_items for select to anon using (not hidden);
drop policy if exists "menu_items_read" on public.menu_items;
create policy "menu_items_read" on public.menu_items for select to authenticated
  using (not hidden or public.is_admin((select auth.uid())));
drop policy if exists "menu_changes_read" on public.menu_changes;
create policy "menu_changes_read" on public.menu_changes for select to authenticated
  using (public.is_admin((select auth.uid())));

-- Writing: the admin only.
drop policy if exists "menu_categories_update" on public.menu_categories;
create policy "menu_categories_update" on public.menu_categories for update to authenticated
  using (public.is_admin((select auth.uid()))) with check (public.is_admin((select auth.uid())));
drop policy if exists "menu_items_insert" on public.menu_items;
create policy "menu_items_insert" on public.menu_items for insert to authenticated
  with check (public.is_admin((select auth.uid())));
drop policy if exists "menu_items_update" on public.menu_items;
create policy "menu_items_update" on public.menu_items for update to authenticated
  using (public.is_admin((select auth.uid()))) with check (public.is_admin((select auth.uid())));
drop policy if exists "menu_items_delete" on public.menu_items;
create policy "menu_items_delete" on public.menu_items for delete to authenticated
  using (public.is_admin((select auth.uid())));
drop policy if exists "store_info_update" on public.store_info;
create policy "store_info_update" on public.store_info for update to authenticated
  using (public.is_admin((select auth.uid()))) with check (public.is_admin((select auth.uid())));

-- Grants, column by column (RLS decides who; these decide what). Revoking first makes this file
-- re-run cleanly, and a new column stays unwritable until it's added here.
revoke all on public.menu_categories, public.menu_items, public.store_info, public.menu_changes from anon, authenticated;
grant select on public.menu_categories, public.menu_items, public.store_info to anon, authenticated;
grant select on public.menu_changes to authenticated;
-- Categories: only their size prices are edited from the app.
grant update (size_tiers) on public.menu_categories to authenticated;
grant insert (category_id, name, price, unit, description, size_tiers, sort_order, hidden) on public.menu_items to authenticated;
grant update (category_id, name, price, unit, description, size_tiers, sort_order, hidden) on public.menu_items to authenticated;
grant delete on public.menu_items to authenticated;
grant update (address_line1, address_line2, phone_display, phone_tel, hours, tagline, welcome,
  order_url, facebook_url, maps_google_url, maps_apple_url) on public.store_info to authenticated;

-- "Ask the ledger" assistant tools (ROADMAP item 3). The admin-assistant Edge Function lets
-- Claude call only these functions, by name, with the admin's own login. Each one is:
--   - read-only: STABLE, so Postgres rejects any INSERT/UPDATE/DELETE inside it, and the Edge
--     Function calls them over GET, which PostgREST runs in a read-only transaction;
--   - SECURITY INVOKER (the default): queries run under the caller's RLS, not as the owner;
--   - admin-only: assistant_require_admin() raises for anyone else.
-- They never return email addresses (lookup can match on one), to keep what reaches the model
-- to what an answer needs.
--
-- A "visit" is one customer on one store-local (Tucson, America/Phoenix) day with at least one
-- purchase or fill that wasn't later corrected. Corrections and forfeits (kind) aren't visits.
create or replace function public.assistant_require_admin()
returns void
language plpgsql
stable
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can use the assistant';
  end if;
end;
$$;

create or replace function public.assistant_balance_summary()
returns table (
  customers integer,
  customers_with_balance integer,
  outstanding_gallons bigint,
  customers_with_login integer,
  customers_never_visited integer,
  deleted_customers integer,
  first_ledger_day date,
  last_ledger_day date
)
language plpgsql
stable
set search_path = public
as $$
begin
  perform public.assistant_require_admin();
  return query
  select
    count(*)::integer,
    (count(*) filter (where p.gallons > 0))::integer,
    coalesce(sum(p.gallons), 0)::bigint,
    (count(*) filter (where p.auth_user_id is not null))::integer,
    (count(*) filter (where p.last_transaction_at is null and p.anonymized_at is null))::integer,
    (count(*) filter (where p.anonymized_at is not null))::integer,
    (select min((t.created_at at time zone 'America/Phoenix')::date) from public.gallon_transactions t),
    (select max((t.created_at at time zone 'America/Phoenix')::date) from public.gallon_transactions t)
  from public.profiles p
  where p.role = 'user';
end;
$$;

create or replace function public.assistant_customers_inactive_since(p_days integer, p_limit integer default 25)
returns table (
  legacy_id integer,
  name text,
  gallons integer,
  last_visit_day date,
  days_since_visit integer,
  total_matching integer
)
language plpgsql
stable
set search_path = public
as $$
begin
  perform public.assistant_require_admin();
  if p_days is null or p_days < 1 or p_days > 3650 then
    raise exception 'days must be between 1 and 3650';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'limit must be between 1 and 100';
  end if;
  -- Customers with no visit at all count as inactive too (last_visit_day and days_since_visit are
  -- null). They're listed after everyone who has visited, so lapsed regulars come first.
  return query
  select
    p.legacy_id,
    p.name,
    p.gallons,
    (p.last_transaction_at at time zone 'America/Phoenix')::date,
    ((now() at time zone 'America/Phoenix')::date - (p.last_transaction_at at time zone 'America/Phoenix')::date),
    (count(*) over ())::integer
  from public.profiles p
  where p.role = 'user'
    and p.anonymized_at is null
    and (p.last_transaction_at is null or p.last_transaction_at < now() - make_interval(days => p_days))
  order by p.last_transaction_at nulls last, p.name
  limit p_limit;
end;
$$;

create or replace function public.assistant_visits_by_day(p_start date, p_end date)
returns table (
  day date,
  weekday text,
  visits integer,
  gallons_filled bigint,
  gallons_purchased bigint
)
language plpgsql
stable
set search_path = public
as $$
begin
  perform public.assistant_require_admin();
  if p_start is null or p_end is null or p_start > p_end then
    raise exception 'start must be on or before end';
  end if;
  if p_end - p_start > 366 then
    raise exception 'range must be at most 366 days';
  end if;
  return query
  with entries as (
    select t.user_profile_id, (t.created_at at time zone 'America/Phoenix')::date as d, t.amount
    from public.gallon_transactions t
    where t.kind in ('purchase', 'fill')
      and not exists (select 1 from public.gallon_transactions c where c.corrects_transaction_id = t.id)
      and t.created_at >= (p_start::timestamp at time zone 'America/Phoenix')
      and t.created_at < ((p_end + 1)::timestamp at time zone 'America/Phoenix')
  )
  select
    g.d::date,
    to_char(g.d, 'Dy'),
    (select count(distinct e.user_profile_id) from entries e where e.d = g.d)::integer,
    (select coalesce(sum(-e.amount), 0) from entries e where e.d = g.d and e.amount < 0)::bigint,
    (select coalesce(sum(e.amount), 0) from entries e where e.d = g.d and e.amount > 0)::bigint
  from generate_series(p_start, p_end, interval '1 day') as g(d)
  order by 1;
end;
$$;

create or replace function public.assistant_top_customers(p_start date, p_end date, p_limit integer default 10)
returns table (
  legacy_id integer,
  name text,
  visits integer,
  gallons_filled bigint,
  gallons_purchased bigint
)
language plpgsql
stable
set search_path = public
as $$
begin
  perform public.assistant_require_admin();
  if p_start is null or p_end is null or p_start > p_end then
    raise exception 'start must be on or before end';
  end if;
  if p_end - p_start > 366 then
    raise exception 'range must be at most 366 days';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception 'limit must be between 1 and 50';
  end if;
  return query
  select
    p.legacy_id,
    p.name,
    count(distinct (t.created_at at time zone 'America/Phoenix')::date)::integer,
    coalesce(sum(-t.amount) filter (where t.amount < 0), 0)::bigint,
    coalesce(sum(t.amount) filter (where t.amount > 0), 0)::bigint
  from public.gallon_transactions t
  join public.profiles p on p.id = t.user_profile_id
  where p.role = 'user'
    and p.anonymized_at is null
    and t.kind in ('purchase', 'fill')
    and not exists (select 1 from public.gallon_transactions c where c.corrects_transaction_id = t.id)
    and t.created_at >= (p_start::timestamp at time zone 'America/Phoenix')
    and t.created_at < ((p_end + 1)::timestamp at time zone 'America/Phoenix')
  group by p.id
  order by 3 desc, 4 desc, p.legacy_id
  limit p_limit;
end;
$$;

-- Matches a customer number exactly, or part of a name or email (case-insensitive).
create or replace function public.assistant_customer_lookup(p_query text, p_limit integer default 10)
returns table (
  legacy_id integer,
  name text,
  gallons integer,
  water_type text,
  has_login boolean,
  last_visit_day date
)
language plpgsql
stable
set search_path = public
as $$
declare
  q text := trim(p_query);
  as_number integer := case when trim(p_query) ~ '^[0-9]{1,9}$' then trim(p_query)::integer end;
  pattern text;
begin
  perform public.assistant_require_admin();
  if q is null or length(q) < 1 or length(q) > 100 then
    raise exception 'query must be 1 to 100 characters';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 25 then
    raise exception 'limit must be between 1 and 25';
  end if;
  pattern := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
  select
    p.legacy_id,
    p.name,
    p.gallons,
    p.water_type,
    p.auth_user_id is not null,
    (p.last_transaction_at at time zone 'America/Phoenix')::date
  from public.profiles p
  where p.role = 'user'
    and p.anonymized_at is null
    and (
      p.legacy_id = as_number
      or p.name ilike pattern
      or p.email ilike pattern
    )
  order by p.legacy_id = as_number desc nulls last, p.name
  limit p_limit;
end;
$$;

-- Gained a kind column (item C); a function's result type can't change in place.
drop function if exists public.assistant_customer_history(integer, integer);
create or replace function public.assistant_customer_history(p_legacy_id integer, p_limit integer default 20)
returns table (
  happened_at timestamp,
  kind text,
  amount integer,
  new_balance integer,
  note text
)
language plpgsql
stable
set search_path = public
as $$
begin
  perform public.assistant_require_admin();
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'limit must be between 1 and 100';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.legacy_id = p_legacy_id and p.role = 'user' and p.anonymized_at is null
  ) then
    raise exception 'No customer with that number';
  end if;
  -- happened_at is store-local time (America/Phoenix), without a zone.
  return query
  select (t.created_at at time zone 'America/Phoenix'), t.kind, t.amount, t.new_balance, t.note
  from public.gallon_transactions t
  join public.profiles p on p.id = t.user_profile_id
  where p.legacy_id = p_legacy_id
  order by t.created_at desc
  limit p_limit;
end;
$$;

revoke all on function public.assistant_require_admin() from public, anon;
revoke all on function public.assistant_balance_summary() from public, anon;
revoke all on function public.assistant_customers_inactive_since(integer, integer) from public, anon;
revoke all on function public.assistant_visits_by_day(date, date) from public, anon;
revoke all on function public.assistant_top_customers(date, date, integer) from public, anon;
revoke all on function public.assistant_customer_lookup(text, integer) from public, anon;
revoke all on function public.assistant_customer_history(integer, integer) from public, anon;
grant execute on function public.assistant_require_admin() to authenticated;
grant execute on function public.assistant_balance_summary() to authenticated;
grant execute on function public.assistant_customers_inactive_since(integer, integer) to authenticated;
grant execute on function public.assistant_visits_by_day(date, date) to authenticated;
grant execute on function public.assistant_top_customers(date, date, integer) to authenticated;
grant execute on function public.assistant_customer_lookup(text, integer) to authenticated;
grant execute on function public.assistant_customer_history(integer, integer) to authenticated;

-- Lets a signed-in customer's client subscribe to their own balance/history changing
-- (via Supabase Realtime `postgres_changes`) so an already-open app updates instantly
-- when an admin adjusts their gallons elsewhere. Realtime enforces the same RLS
-- policies as normal queries, so this doesn't expose any row a client couldn't already
-- select directly.
-- Only adds a table that isn't already published, so this file stays safe to re-run.
do $$
declare
  t text;
begin
  foreach t in array array['profiles', 'gallon_transactions'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- The app only ever talks to Supabase via the REST/postgrest client and Realtime, never
-- GraphQL. With pg_graphql installed, Supabase's default grants make every table any role
-- can SELECT (including profiles/gallon_transactions for `authenticated`) discoverable
-- through /graphql/v1 introspection, regardless of RLS. Since nothing here uses that
-- endpoint, drop the extension outright instead of managing per-table GraphQL grants.
drop extension if exists pg_graphql;

-- rls_auto_enable() is an event-trigger function (see the `ensure_rls` event trigger,
-- managed outside this file) that auto-enables RLS on newly created tables. It's not meant
-- to be called directly, but Supabase's default grants left it invocable via
-- /rest/v1/rpc/rls_auto_enable by anon and authenticated. Revoking EXECUTE closes that RPC
-- surface; the event trigger keeps firing regardless, since event triggers don't check the
-- triggering role's EXECUTE privilege.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

