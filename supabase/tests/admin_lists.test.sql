-- Tests for the admin customer panel's functions (ROADMAP item B): admin_search_customers()
-- matches name, email, or customer number, filters and sorts on the server, enforces the
-- 3-character minimum, and reports the total before its limit; admin_get_customer() and
-- admin_customer_summary() answer only admins, like the search.
--
-- Self-contained and always rolled back, like the other tests: synthetic profiles use legacy
-- IDs 990501+ and names starting "Zqv" so searches only see them. Run it as the database owner.
-- Success ends with one row: 'admin list tests passed'.

begin;

-- ---------- Seed ----------
insert into auth.users (id, email)
values
  ('00000000-0000-4000-b000-000000000501', 'admin.lists@example.com'),
  ('00000000-0000-4000-b000-000000000502', 'zq.amy@example.com');

insert into public.profiles (id, auth_user_id, email, role, name, legacy_id, gallons, last_transaction_at, anonymized_at)
values
  ('00000000-0000-4000-a000-000000000501', '00000000-0000-4000-b000-000000000501', 'admin.lists@example.com', 'admin', 'Zqv Admin', 990501, 0, now(), null),
  -- Amy: login, visited last week.
  ('00000000-0000-4000-a000-000000000502', '00000000-0000-4000-b000-000000000502', 'zq.amy@example.com', 'user', 'Zqv Amy', 990502, 40, now() - interval '7 days', null),
  -- Bo: no login, visited 90 days ago.
  ('00000000-0000-4000-a000-000000000503', null, 'bo@example.com', 'user', 'Zqv Bo', 990503, 300, now() - interval '90 days', null),
  -- Cy: no login, never visited.
  ('00000000-0000-4000-a000-000000000504', null, null, 'user', 'zqv cy', 990504, 5, null, null),
  -- A deleted customer: not "no login yet".
  ('00000000-0000-4000-a000-000000000505', null, null, 'user', 'Zqv Deleted', 990505, 0, null, now());

-- Runs the search as whoever is signed in; returns the legacy IDs in order.
create function pg_temp.ids(q text, f text default 'all', s text default 'name', lim integer default 50)
returns integer[] language sql as $$
  select coalesce(array_agg(legacy_id order by ord), '{}')
  from (select legacy_id, row_number() over () as ord from public.admin_search_customers(q, f, s, lim)) r;
$$;

-- ---------- As the admin ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b000-000000000501","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  got integer[];
  total bigint;
  summary record;
  r record;
begin
  -- Customers only (no admin), sorted by name without regard to case ("zqv cy" is lowercase).
  got := pg_temp.ids('Zqv');
  if got <> array[990502, 990503, 990504, 990505] then raise exception 'FAIL name search found %', got; end if;

  -- Email and customer number (part of it) match too.
  if pg_temp.ids('bo@example') <> array[990503] then raise exception 'FAIL email search'; end if;
  if pg_temp.ids('90504') <> array[990504] then raise exception 'FAIL number search'; end if;

  -- LIKE wildcards in the query are literal: unescaped, "v_a" would match "Zqv Amy".
  if pg_temp.ids('v_a') <> '{}' then raise exception 'FAIL wildcard was not escaped: %', pg_temp.ids('v_a'); end if;
  if pg_temp.ids('%%%') <> '{}' then raise exception 'FAIL %% matched everything'; end if;

  -- Filters.
  if pg_temp.ids('Zqv', 'active') <> array[990502] then raise exception 'FAIL active filter'; end if;
  if pg_temp.ids('Zqv', 'inactive') <> array[990503, 990504, 990505] then raise exception 'FAIL inactive filter'; end if;
  if pg_temp.ids('Zqv', 'nologin') <> array[990503, 990504] then raise exception 'FAIL nologin filter'; end if;

  -- Sort by gallons, highest first.
  if pg_temp.ids('Zqv', 'all', 'gallons') <> array[990503, 990502, 990504, 990505] then
    raise exception 'FAIL gallons sort %', pg_temp.ids('Zqv', 'all', 'gallons');
  end if;

  -- The limit cuts the rows, but every row reports the full match count.
  select count(*), max(total_matches) into r from public.admin_search_customers('Zqv', 'all', 'name', 2);
  if r.count <> 2 or r.max <> 4 then raise exception 'FAIL limit: % rows, total %', r.count, r.max; end if;

  -- Columns the panel shows.
  select * into r from public.admin_search_customers('Zqv Amy', 'all', 'name', 1);
  if not r.has_login or r.email <> 'zq.amy@example.com' or r.gallons <> 40 then raise exception 'FAIL row %', r; end if;

  -- Too short or unknown options are refused.
  begin
    perform public.admin_search_customers(' ab ');
    raise exception 'FAIL 2-character search allowed';
  exception when raise_exception then
    if sqlerrm <> 'Type 3 to 100 characters to search' then raise; end if;
  end;
  begin
    perform public.admin_search_customers('Zqv Amy', 'everyone');
    raise exception 'FAIL unknown filter allowed';
  exception when raise_exception then
    if sqlerrm not like 'Unknown filter%' then raise; end if;
  end;

  -- One customer by number; admins aren't customers.
  select * into r from public.admin_get_customer(990503);
  if r.name <> 'Zqv Bo' or r.has_login then raise exception 'FAIL get_customer %', r; end if;
  select count(*) into total from public.admin_get_customer(990501);
  if total <> 0 then raise exception 'FAIL get_customer returned an admin'; end if;

  -- The summary counts customers only, and at least our 4 (other rows may exist).
  select * into summary from public.admin_customer_summary();
  if summary.total_customers < 4 or summary.active_customers < 1 then raise exception 'FAIL summary %', summary; end if;
end $$;

reset role;

-- ---------- Everyone else is refused ----------
create function pg_temp.check_refused(claims text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', claims, true);
  set local role authenticated;
  begin
    perform public.admin_search_customers('Zqv Amy');
    raise exception 'FAIL % searched customers', claims;
  exception when raise_exception then
    if sqlerrm <> 'Only admins can search customers' then raise; end if;
  end;
  begin
    perform public.admin_get_customer(990503);
    raise exception 'FAIL % looked up a customer', claims;
  exception when raise_exception then
    if sqlerrm <> 'Only admins can look up customers' then raise; end if;
  end;
  begin
    perform public.admin_customer_summary();
    raise exception 'FAIL % saw the totals', claims;
  exception when raise_exception then
    if sqlerrm <> 'Only admins can see customer totals' then raise; end if;
  end;
  reset role;
end;
$$;

-- A customer.
select pg_temp.check_refused('{"sub":"00000000-0000-4000-b000-000000000502","role":"authenticated"}');

-- Signed out: no EXECUTE at all.
select set_config('request.jwt.claims', '', true);
set local role anon;
do $$
begin
  perform public.admin_search_customers('Zqv Amy');
  raise exception 'FAIL anon could search';
exception when insufficient_privilege then
  null;
end $$;
reset role;

select 'admin list tests passed' as result;

rollback;
