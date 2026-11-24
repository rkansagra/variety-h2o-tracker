-- Tests for email sign-up (ROADMAP item G): link_my_profile() links a login to the customer
-- record with the same email only when the email is confirmed, the login has no password, and
-- the record is an unlinked, undeleted customer; admin_set_customer_email() and
-- admin_add_customer() are admin-only and keep emails unique and normalized; and deleting a login
-- unlinks its record.
--
-- Self-contained and always rolled back, like the other tests: synthetic profiles use legacy
-- IDs 990401+. Run it as the database owner. Success ends with one row: 'signup tests passed'.

begin;

-- ---------- Seed ----------
-- Logins. "code" logins are confirmed with no password, like an emailed-code or Google sign-in.
insert into auth.users (id, email, email_confirmed_at, encrypted_password)
values
  ('00000000-0000-4000-b000-000000000401', 'admin.signup@example.com', now(), 'hashed'),
  ('00000000-0000-4000-b000-000000000402', 'dana.signup@example.com', now(), null),   -- code login
  ('00000000-0000-4000-b000-000000000403', 'eve.signup@example.com', null, null),     -- unconfirmed
  ('00000000-0000-4000-b000-000000000404', 'mal.signup@example.com', now(), 'hashed'), -- has a password
  ('00000000-0000-4000-b000-000000000405', 'nobody.signup@example.com', now(), ''),   -- no record has this email
  ('00000000-0000-4000-b000-000000000406', 'gone.signup@example.com', now(), null),   -- record was deleted
  ('00000000-0000-4000-b000-000000000407', 'boss.signup@example.com', now(), null),   -- record is an admin's
  ('00000000-0000-4000-b000-000000000408', 'linked.signup@example.com', now(), null), -- already linked
  ('00000000-0000-4000-b000-000000000409', 'late.signup@example.com', now(), null);   -- email added later

insert into public.profiles (id, auth_user_id, email, role, name, legacy_id, gallons, anonymized_at)
values
  ('00000000-0000-4000-a000-000000000401', '00000000-0000-4000-b000-000000000401', 'admin.signup@example.com', 'admin', 'Admin Signup', 990401, 0, null),
  -- Mixed case on purpose: matching ignores case.
  ('00000000-0000-4000-a000-000000000402', null, 'Dana.Signup@Example.com', 'user', 'Dana Signup', 990402, 40, null),
  ('00000000-0000-4000-a000-000000000403', null, 'eve.signup@example.com', 'user', 'Eve Signup', 990403, 0, null),
  ('00000000-0000-4000-a000-000000000404', null, 'mal.signup@example.com', 'user', 'Victim Signup', 990404, 80, null),
  ('00000000-0000-4000-a000-000000000406', null, 'gone.signup@example.com', 'user', 'Deleted customer', 990406, 0, now()),
  ('00000000-0000-4000-a000-000000000407', null, 'boss.signup@example.com', 'admin', 'Boss Signup', 990407, 0, null),
  ('00000000-0000-4000-a000-000000000408', '00000000-0000-4000-b000-000000000408', 'linked.signup@example.com', 'user', 'Linked Signup', 990408, 3, null),
  ('00000000-0000-4000-a000-000000000409', null, null, 'user', 'Late Signup', 990409, 12, null);

-- Calls link_my_profile() as the given login; returns the linked record's legacy_id or null.
create function pg_temp.link_as(login_suffix text) returns integer language plpgsql as $$
declare
  r public.profiles;
begin
  perform set_config('request.jwt.claims',
    format('{"sub":"00000000-0000-4000-b000-000000000%s","role":"authenticated"}', login_suffix), true);
  set local role authenticated;
  r := public.link_my_profile();
  reset role;
  return r.legacy_id;
end;
$$;

-- ---------- link_my_profile() ----------
do $$
declare
  got integer;
  linked_to uuid;
begin
  got := pg_temp.link_as('402');
  if got is distinct from 990402 then raise exception 'FAIL code login linked to %', got; end if;
  select auth_user_id into linked_to from public.profiles where legacy_id = 990402;
  if linked_to <> '00000000-0000-4000-b000-000000000402' then raise exception 'FAIL 990402 not linked'; end if;

  -- Signing in again returns the same record.
  got := pg_temp.link_as('402');
  if got is distinct from 990402 then raise exception 'FAIL second sign-in returned %', got; end if;

  if pg_temp.link_as('403') is not null then raise exception 'FAIL unconfirmed email was linked'; end if;
  if pg_temp.link_as('404') is not null then raise exception 'FAIL login with a password was linked'; end if;
  if pg_temp.link_as('405') is not null then raise exception 'FAIL unknown email linked something'; end if;
  if pg_temp.link_as('406') is not null then raise exception 'FAIL deleted customer was linked'; end if;
  if pg_temp.link_as('407') is not null then raise exception 'FAIL admin record was linked'; end if;

  got := pg_temp.link_as('408');
  if got is distinct from 990408 then raise exception 'FAIL already-linked login returned %', got; end if;

  select auth_user_id into linked_to from public.profiles where legacy_id = 990404;
  if linked_to is not null then raise exception 'FAIL victim record was linked'; end if;
end $$;

-- Signed out: refused.
select set_config('request.jwt.claims', '', true);
set local role anon;
do $$
begin
  perform public.link_my_profile();
  raise exception 'FAIL anon could call link_my_profile';
exception when insufficient_privilege then
  null;
end $$;
reset role;

-- ---------- Admin email and add-customer functions refuse non-admins ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b000-000000000402","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    perform public.admin_set_customer_email('00000000-0000-4000-a000-000000000409', 'late.signup@example.com');
    raise exception 'FAIL customer set an email';
  exception when raise_exception then
    if sqlerrm <> 'Only admins can change customer emails' then raise; end if;
  end;
  begin
    perform public.admin_add_customer('Sneaky Signup', 'sneaky@example.com');
    raise exception 'FAIL customer added a customer';
  exception when raise_exception then
    if sqlerrm <> 'Only admins can add customers' then raise; end if;
  end;
end $$;
reset role;

-- ---------- As the admin ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b000-000000000401","role":"authenticated"}', true);
set local role authenticated;

-- Expects `call` to raise exactly `message`.
create function pg_temp.expect_error(call text, message text) returns void language plpgsql as $$
begin
  execute call;
  raise exception 'FAIL no error from %', call;
exception when raise_exception then
  if sqlerrm = message then return; end if;
  if sqlerrm like 'FAIL%' then raise; end if;
  raise exception 'FAIL % raised "%" instead of "%"', call, sqlerrm, message;
end;
$$;

do $$
declare
  r public.profiles;
  first_number integer;
begin
  -- Saving an email normalizes it.
  r := public.admin_set_customer_email('00000000-0000-4000-a000-000000000409', '  Late.Signup@Example.COM ');
  if r.email <> 'late.signup@example.com' then raise exception 'FAIL email saved as %', r.email; end if;

  perform pg_temp.expect_error(
    $q$select public.admin_set_customer_email('00000000-0000-4000-a000-000000000409', 'not-an-email')$q$,
    'Enter a valid email address');
  perform pg_temp.expect_error(
    $q$select public.admin_set_customer_email('00000000-0000-4000-a000-000000000409', 'EVE.signup@example.com')$q$,
    'Another customer already has this email');
  perform pg_temp.expect_error(
    $q$select public.admin_set_customer_email('00000000-0000-4000-a000-000000000402', 'new.dana@example.com')$q$,
    'This customer already has a login; their email comes from it');
  perform pg_temp.expect_error(
    $q$select public.admin_set_customer_email('00000000-0000-4000-a000-000000000406', 'back@example.com')$q$,
    'This customer''s data was deleted');
  perform pg_temp.expect_error(
    $q$select public.admin_set_customer_email('00000000-0000-4000-a000-000000000407', 'boss2@example.com')$q$,
    'Only customer records have an email set here');

  -- An email can be corrected but not cleared.
  perform pg_temp.expect_error(
    $q$select public.admin_set_customer_email('00000000-0000-4000-a000-000000000403', '  ')$q$,
    'Enter the customer''s email');

  -- Adding customers: numbers come from the sequence, one after another; the email is required.
  r := public.admin_add_customer('  First Added  ', 'first.added@example.com');
  if r.name <> 'First Added' or r.email <> 'first.added@example.com' or r.gallons <> 0 then raise exception 'FAIL added %', r; end if;
  if r.member_since !~ '^[A-Z][a-z]+ [0-9]{4}$' then raise exception 'FAIL member_since %', r.member_since; end if;
  first_number := r.legacy_id;
  r := public.admin_add_customer('Second Added', 'Second.Added@example.com');
  if r.legacy_id <> first_number + 1 then raise exception 'FAIL numbers % then %', first_number, r.legacy_id; end if;
  if r.email <> 'second.added@example.com' then raise exception 'FAIL added email %', r.email; end if;

  perform pg_temp.expect_error($q$select public.admin_add_customer('   ', 'blank.name@example.com')$q$, 'Enter the customer''s name');
  perform pg_temp.expect_error($q$select public.admin_add_customer('No Email', null)$q$, 'Enter the customer''s email');
  perform pg_temp.expect_error($q$select public.admin_add_customer('No Email', '  ')$q$, 'Enter the customer''s email');
  perform pg_temp.expect_error($q$select public.admin_add_customer('Dup', 'DANA.signup@example.com')$q$, 'Another customer already has this email');
  perform pg_temp.expect_error($q$select public.admin_add_customer('Bad', 'bad@')$q$, 'Enter a valid email address');
end $$;

reset role;

-- The email staff saved now links that customer's code sign-in.
do $$
begin
  if pg_temp.link_as('409') is distinct from 990409 then raise exception 'FAIL email saved by staff did not link'; end if;
end $$;

-- ---------- Deleting a login unlinks its record ----------
delete from auth.users where id = '00000000-0000-4000-b000-000000000408';
do $$
declare
  linked_to uuid;
begin
  select auth_user_id into linked_to from public.profiles where legacy_id = 990408;
  if linked_to is not null then raise exception 'FAIL deleted login still linked'; end if;
end $$;

select 'signup tests passed' as result;

rollback;
