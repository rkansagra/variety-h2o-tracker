-- Tests for the "ask the ledger" assistant tools in schema.sql (assistant_*).
--
-- Self-contained and always rolled back: it seeds synthetic customers (legacy IDs 990001+,
-- ledger entries dated 2021 so they never overlap real data), signs in as an admin, a customer,
-- and logged-out in turn by setting the JWT claims Supabase's auth.uid() reads, and raises on
-- the first failed check. Run it as the database owner (SQL editor, or psql in CI) after the
-- functions exist; to try function changes before applying them, paste the changed functions
-- between `begin;` and the seed section. Success ends with one row: 'assistant tool tests passed'.

begin;

-- ---------- Seed ----------
insert into public.profiles (id, auth_user_id, email, role, name, legacy_id, gallons, last_transaction_at)
values
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-b000-000000000001', 'admin.test@example.com', 'admin', 'Admin Test', 990001, 0, null);

-- The admin's summary before the customers below exist, to compare against afterwards.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b000-000000000001","role":"authenticated"}', true);
set local role authenticated;
create temporary table summary_before on commit drop as select * from public.assistant_balance_summary();
create temporary table inactive_before on commit drop as select * from public.assistant_customers_inactive_since(60, 1);
reset role;

insert into public.profiles (id, auth_user_id, email, role, name, legacy_id, gallons, water_type, last_transaction_at, anonymized_at)
values
  -- Ana: two visits in March 2021 plus one 3 days ago; has a login.
  ('00000000-0000-4000-a000-000000000101', '00000000-0000-4000-b000-000000000101', 'ana.test@example.com', 'user', 'Ana Test', 990101, 10, 'alkaline', now() - interval '3 days', null),
  -- Ben: one visit, last seen 100 days ago. Name has LIKE wildcards in it on purpose.
  ('00000000-0000-4000-a000-000000000102', null, null, 'user', 'Ben_Test%', 990102, 7, null, now() - interval '100 days', null),
  -- Cal: imported, never visited.
  ('00000000-0000-4000-a000-000000000103', null, null, 'user', 'Cal Test', 990103, 0, null, null, null),
  -- An anonymized customer whose balance was forfeited.
  ('00000000-0000-4000-a000-000000000104', null, null, 'user', 'Deleted customer', 990104, 0, null, '2021-03-02 18:00+00', '2021-03-02 18:00+00');

insert into public.gallon_transactions (user_profile_id, actor_profile_id, amount, previous_balance, new_balance, note, created_at)
values
  -- 2021-03-01 (a Monday): Ana buys 20 and fills 5 (one visit); Ben fills 3.
  ('00000000-0000-4000-a000-000000000101', '00000000-0000-4000-a000-000000000001', 20, 0, 20, null, '2021-03-01 17:00+00'),
  ('00000000-0000-4000-a000-000000000101', '00000000-0000-4000-a000-000000000001', -5, 20, 15, null, '2021-03-01 17:05+00'),
  ('00000000-0000-4000-a000-000000000102', '00000000-0000-4000-a000-000000000001', -3, 10, 7, null, '2021-03-01 20:00+00'),
  -- 06:30 UTC on 03-03 is 23:30 on 03-02 in Tucson, so this is a 03-02 visit.
  ('00000000-0000-4000-a000-000000000101', '00000000-0000-4000-a000-000000000001', -5, 15, 10, 'Filled today', '2021-03-03 06:30+00'),
  -- Forfeit on 03-02: not a visit.
  ('00000000-0000-4000-a000-000000000104', '00000000-0000-4000-a000-000000000001', -4, 4, 0, 'Balance forfeited: account deleted', '2021-03-02 18:00+00'),
  -- Ana, 3 days ago.
  ('00000000-0000-4000-a000-000000000101', '00000000-0000-4000-a000-000000000001', 5, 5, 10, null, now() - interval '3 days');

-- ---------- Static checks: every assistant function is read-only, runs as the caller, and
-- can't be called logged out ----------
do $$
declare
  f record;
  n integer := 0;
begin
  for f in
    select p.oid, p.oid::regprocedure as sig, p.provolatile, p.prosecdef
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname like 'assistant\_%'
  loop
    n := n + 1;
    if f.provolatile <> 's' then raise exception 'FAIL % is not STABLE', f.sig; end if;
    if f.prosecdef then raise exception 'FAIL % is SECURITY DEFINER', f.sig; end if;
    if has_function_privilege('anon', f.oid, 'execute') then raise exception 'FAIL anon can execute %', f.sig; end if;
    if not has_function_privilege('authenticated', f.oid, 'execute') then raise exception 'FAIL authenticated cannot execute %', f.sig; end if;
  end loop;
  if n <> 7 then raise exception 'FAIL expected 7 assistant functions, found %', n; end if;
  -- No tool returns an email column.
  if exists (
    select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname like 'assistant\_%'
      and pg_get_function_result(p.oid) ilike '%email%'
  ) then raise exception 'FAIL an assistant function returns an email column'; end if;
end $$;

-- ---------- A customer is refused by every tool ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b000-000000000101","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  call text;
begin
  foreach call in array array[
    'select * from public.assistant_balance_summary()',
    'select * from public.assistant_customers_inactive_since(30)',
    'select * from public.assistant_visits_by_day(''2021-03-01'', ''2021-03-02'')',
    'select * from public.assistant_top_customers(''2021-03-01'', ''2021-03-02'')',
    'select * from public.assistant_customer_lookup(''Ana'')',
    'select * from public.assistant_customer_history(990101)'
  ] loop
    begin
      execute call;
      raise exception 'FAIL customer was allowed: %', call;
    exception when raise_exception then
      if sqlerrm <> 'Only admins can use the assistant' then raise; end if;
    end;
  end loop;
end $$;

-- ---------- Signed in with no profile (or the claims of a non-admin) is refused too ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b000-0000000000ff","role":"authenticated"}', true);
do $$
begin
  perform * from public.assistant_balance_summary();
  raise exception 'FAIL unlinked login was allowed';
exception when raise_exception then
  if sqlerrm <> 'Only admins can use the assistant' then raise; end if;
end $$;

-- ---------- Admin ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b000-000000000001","role":"authenticated"}', true);

do $$
declare
  b record;
  a record;
begin
  select * into b from summary_before;
  select * into a from public.assistant_balance_summary();
  if a.customers - b.customers <> 4 then raise exception 'FAIL summary customers +%', a.customers - b.customers; end if;
  if a.customers_with_balance - b.customers_with_balance <> 2 then raise exception 'FAIL summary with balance'; end if;
  if a.outstanding_gallons - b.outstanding_gallons <> 17 then raise exception 'FAIL summary outstanding +%', a.outstanding_gallons - b.outstanding_gallons; end if;
  if a.customers_with_login - b.customers_with_login <> 1 then raise exception 'FAIL summary logins'; end if;
  if a.customers_never_visited - b.customers_never_visited <> 1 then raise exception 'FAIL summary never visited +%', a.customers_never_visited - b.customers_never_visited; end if;
  if a.deleted_customers - b.deleted_customers <> 1 then raise exception 'FAIL summary deleted'; end if;
  if a.first_ledger_day > '2021-03-01' then raise exception 'FAIL summary first day %', a.first_ledger_day; end if;
end $$;

do $$
declare
  ids integer[];
  r record;
begin
  -- Ben (last visit 100 days ago) and Cal (never visited) are newly inactive; Ana (3 days ago)
  -- and the deleted customer aren't. Compared with the count before seeding, so real data
  -- doesn't matter.
  if (select coalesce(max(total_matching), 0) from public.assistant_customers_inactive_since(60, 1))
     - (select coalesce(max(total_matching), 0) from inactive_before) <> 2 then
    raise exception 'FAIL inactive 60 days should add Ben and Cal';
  end if;
  select * into r from public.assistant_customers_inactive_since(60, 100) where legacy_id = 990102;
  if r.days_since_visit not between 99 and 101 then raise exception 'FAIL days since visit %', r.days_since_visit; end if;
  -- Customers who have visited are listed before never-visited ones.
  select * into r from public.assistant_customers_inactive_since(60, 1);
  if r.last_visit_day is null then raise exception 'FAIL a never-visited customer is listed first'; end if;
  select * into r from public.assistant_customers_inactive_since(60, 100) where legacy_id = 990103;
  if found and (r.last_visit_day is not null or r.days_since_visit is not null) then
    raise exception 'FAIL never-visited customer has a visit day: %', r;
  end if;
  select array_agg(legacy_id) into ids from public.assistant_customers_inactive_since(1, 100) where legacy_id >= 990000;
  if not (ids @> array[990101, 990102]) or 990104 = any(ids) then
    raise exception 'FAIL inactive 1 day: %', ids;
  end if;
  begin
    perform * from public.assistant_customers_inactive_since(0);
    raise exception 'FAIL days 0 was allowed';
  exception when raise_exception then
    if sqlerrm not like 'days must be%' then raise; end if;
  end;
  begin
    perform * from public.assistant_customers_inactive_since(30, 101);
    raise exception 'FAIL limit 101 was allowed';
  exception when raise_exception then
    if sqlerrm not like 'limit must be%' then raise; end if;
  end;
end $$;

do $$
declare
  d1 record;
  d2 record;
  n integer;
begin
  select count(*) into n from public.assistant_visits_by_day('2021-03-01', '2021-03-03');
  if n <> 3 then raise exception 'FAIL visits_by_day should return every day, got % rows', n; end if;
  select * into d1 from public.assistant_visits_by_day('2021-03-01', '2021-03-02') where day = '2021-03-01';
  select * into d2 from public.assistant_visits_by_day('2021-03-01', '2021-03-02') where day = '2021-03-02';
  if d1.weekday <> 'Mon' or d1.visits <> 2 or d1.gallons_filled <> 8 or d1.gallons_purchased <> 20 then
    raise exception 'FAIL 03-01: %', d1;
  end if;
  -- Ana's late-evening fill counts on 03-02 (store time); the forfeit doesn't count at all.
  if d2.visits <> 1 or d2.gallons_filled <> 5 or d2.gallons_purchased <> 0 then
    raise exception 'FAIL 03-02: %', d2;
  end if;
  begin
    perform * from public.assistant_visits_by_day('2021-03-02', '2021-03-01');
    raise exception 'FAIL reversed range was allowed';
  exception when raise_exception then
    if sqlerrm not like 'start must be%' then raise; end if;
  end;
  begin
    perform * from public.assistant_visits_by_day('2020-01-01', '2021-01-02');
    raise exception 'FAIL 367-day range was allowed';
  exception when raise_exception then
    if sqlerrm not like 'range must be%' then raise; end if;
  end;
end $$;

do $$
declare
  rows_ text;
begin
  select string_agg(format('%s:%s:%s:%s', legacy_id, visits, gallons_filled, gallons_purchased), ' ' order by visits desc, gallons_filled desc)
    into rows_ from public.assistant_top_customers('2021-03-01', '2021-03-02', 10);
  if rows_ is distinct from '990101:2:10:20 990102:1:3:0' then raise exception 'FAIL top customers: %', rows_; end if;
  begin
    perform * from public.assistant_top_customers('2021-03-01', '2021-03-02', 51);
    raise exception 'FAIL top limit 51 was allowed';
  exception when raise_exception then
    if sqlerrm not like 'limit must be%' then raise; end if;
  end;
end $$;

do $$
declare
  ids integer[];
  r record;
begin
  select array_agg(legacy_id) into ids from public.assistant_customer_lookup('990102');
  if ids is distinct from array[990102] then raise exception 'FAIL lookup by number: %', ids; end if;
  -- % and _ are matched literally, not as wildcards.
  select array_agg(legacy_id) into ids from public.assistant_customer_lookup('n_test%') where legacy_id >= 990000;
  if ids is distinct from array[990102] then raise exception 'FAIL lookup with wildcards: %', ids; end if;
  select array_agg(legacy_id) into ids from public.assistant_customer_lookup('_') where legacy_id >= 990000;
  if ids is distinct from array[990102] then raise exception 'FAIL lookup of a lone underscore: %', ids; end if;
  -- Matches on email without returning it.
  select * into r from public.assistant_customer_lookup('ANA.TEST@EXAMPLE') where legacy_id >= 990000;
  if r.legacy_id is distinct from 990101 or not r.has_login or r.water_type <> 'alkaline' then raise exception 'FAIL lookup by email: %', r; end if;
  -- Anonymized customers and admins aren't findable.
  select array_agg(legacy_id) into ids from public.assistant_customer_lookup('990104');
  if ids is not null then raise exception 'FAIL anonymized customer found'; end if;
  select array_agg(legacy_id) into ids from public.assistant_customer_lookup('Admin Test');
  if ids is not null then raise exception 'FAIL admin found by lookup'; end if;
  begin
    perform * from public.assistant_customer_lookup('   ');
    raise exception 'FAIL blank lookup was allowed';
  exception when raise_exception then
    if sqlerrm not like 'query must be%' then raise; end if;
  end;
end $$;

do $$
declare
  n integer;
  r record;
begin
  select count(*) into n from public.assistant_customer_history(990101);
  if n <> 4 then raise exception 'FAIL history rows %', n; end if;
  select * into r from public.assistant_customer_history(990101, 1);
  if r.amount <> 5 then raise exception 'FAIL history should start with the newest entry: %', r; end if;
  select * into r from public.assistant_customer_history(990101) where note = 'Filled today';
  if r.happened_at <> '2021-03-02 23:30' then raise exception 'FAIL history is not in store time: %', r.happened_at; end if;
  begin
    perform * from public.assistant_customer_history(990104);
    raise exception 'FAIL anonymized history was returned';
  exception when raise_exception then
    if sqlerrm <> 'No customer with that number' then raise; end if;
  end;
end $$;

reset role;

select 'assistant tool tests passed' as result;

rollback;
