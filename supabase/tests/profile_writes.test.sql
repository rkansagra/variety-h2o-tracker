-- Tests that balances only change through the ledger: a signed-in user, even the admin, can
-- write only the profiles column schema.sql grants (water_type on update) and can't insert
-- rows at all, while admin_adjust_gallons() and admin_add_customer() keep working.
--
-- Self-contained and always rolled back, like assistant_tools.test.sql: synthetic profiles use
-- legacy IDs 990201+, and it signs in by setting the JWT claims auth.uid() reads. Run it as the
-- database owner. Success ends with one row: 'profile write tests passed'.

begin;

-- ---------- Seed ----------
insert into auth.users (id, email)
values
  ('00000000-0000-4000-b000-000000000201', 'admin.writes@example.com'),
  ('00000000-0000-4000-b000-000000000202', 'cust.writes@example.com');

insert into public.profiles (id, auth_user_id, email, role, name, legacy_id, gallons)
values
  ('00000000-0000-4000-a000-000000000201', '00000000-0000-4000-b000-000000000201', 'admin.writes@example.com', 'admin', 'Admin Writes', 990201, 0),
  ('00000000-0000-4000-a000-000000000202', '00000000-0000-4000-b000-000000000202', 'cust.writes@example.com', 'user', 'Cust Writes', 990202, 10),
  ('00000000-0000-4000-a000-000000000203', null, null, 'user', 'Unlinked Writes', 990203, 5);

-- ---------- Static checks: no table-wide write privilege, only the granted column ----------
do $$
declare
  cols text;
begin
  if has_table_privilege('authenticated', 'public.profiles', 'UPDATE') then
    raise exception 'FAIL authenticated has table-wide UPDATE on profiles';
  end if;
  if has_table_privilege('authenticated', 'public.profiles', 'INSERT') then
    raise exception 'FAIL authenticated has table-wide INSERT on profiles';
  end if;

  select string_agg(attname, ',' order by attname) into cols
  from pg_attribute
  where attrelid = 'public.profiles'::regclass and attnum > 0 and not attisdropped
    and has_column_privilege('authenticated', 'public.profiles', attname, 'UPDATE');
  if cols is distinct from 'water_type' then
    raise exception 'FAIL updatable columns are %', cols;
  end if;

  -- Customers are added only through admin_add_customer().
  select string_agg(attname, ',' order by attname) into cols
  from pg_attribute
  where attrelid = 'public.profiles'::regclass and attnum > 0 and not attisdropped
    and has_column_privilege('authenticated', 'public.profiles', attname, 'INSERT');
  if cols is not null then
    raise exception 'FAIL insertable columns are %', cols;
  end if;
end $$;

-- ---------- The admin can't write balances, roles, links, or emails directly ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b000-000000000201","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  change text;
begin
  foreach change in array array[
    'gallons = 500',
    'role = ''admin''',
    'auth_user_id = ''00000000-0000-4000-b000-000000000201''',
    'email = ''other@example.com''',
    'legacy_id = 1',
    'last_transaction_at = now()',
    'anonymized_at = now()'
  ] loop
    begin
      execute format('update public.profiles set %s where id = %L', change, '00000000-0000-4000-a000-000000000202');
      raise exception 'FAIL admin could set %', change;
    exception when insufficient_privilege then
      null;
    end;
  end loop;

  begin
    insert into public.profiles (email, name, gallons)
    values ('rich.writes@example.com', 'Rich Writes', 500);
    raise exception 'FAIL admin could insert a customer with a balance';
  exception when insufficient_privilege then
    null;
  end;

  begin
    insert into public.profiles (name) values ('Plain Writes');
    raise exception 'FAIL admin could insert a profile row directly';
  exception when insufficient_privilege then
    null;
  end;
end $$;

-- What the admin screen does still works.
do $$
declare
  r public.profiles;
  n integer;
begin
  update public.profiles set water_type = 'alkaline' where id = '00000000-0000-4000-a000-000000000202';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL admin water-type update changed % rows', n; end if;

  r := public.admin_add_customer('New Writes', 'New.Writes@Example.com');
  if r.gallons <> 0 or r.role <> 'user' or r.auth_user_id is not null then
    raise exception 'FAIL new customer defaults: %', r;
  end if;
  if r.email <> 'new.writes@example.com' then raise exception 'FAIL email not normalized: %', r.email; end if;
  if r.legacy_id <= 990203 then raise exception 'FAIL new customer number % not above existing ones', r.legacy_id; end if;

  r := public.admin_adjust_gallons('00000000-0000-4000-a000-000000000202', 15, 'test credit');
  if r.gallons <> 25 then raise exception 'FAIL adjust gave %', r.gallons; end if;
  select count(*) into n from public.gallon_transactions
  where user_profile_id = '00000000-0000-4000-a000-000000000202' and amount = 15 and new_balance = 25;
  if n <> 1 then raise exception 'FAIL adjust wrote % ledger rows', n; end if;
end $$;

reset role;

-- ---------- A customer can't write their own profile, even the granted column ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b000-000000000202","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  n integer;
begin
  begin
    update public.profiles set gallons = 9999 where id = '00000000-0000-4000-a000-000000000202';
    raise exception 'FAIL customer could set gallons';
  exception when insufficient_privilege then
    null;
  end;

  -- Granted column, but RLS has no customer update policy: nothing changes.
  update public.profiles set water_type = 'purified' where id = '00000000-0000-4000-a000-000000000202';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL customer updated % rows', n; end if;

  begin
    insert into public.profiles (name) values ('Self Writes');
    raise exception 'FAIL customer could insert a profile';
  exception when insufficient_privilege then
    null;
  end;
end $$;

reset role;

select 'profile write tests passed' as result;

rollback;
