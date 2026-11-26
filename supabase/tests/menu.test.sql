-- Tests for the menu and store-info tables (ROADMAP item E): everyone can read them, hidden items
-- only the admin; only the admin can write, and only the editable columns; size lists and prices
-- are validated; every app edit lands in menu_changes with who made it; and the seed loaded the
-- starting menu (CI runs supabase/seed/menu.sql before the tests).
--
-- Self-contained and always rolled back, like the other tests: synthetic profiles use legacy
-- IDs 990801+. Run it as the database owner. Success ends with one row: 'menu tests passed'.

begin;

-- ---------- The seed ----------
do $$
declare
  r record;
begin
  if (select count(*) from public.menu_categories) <> 14 then raise exception 'FAIL seeded categories %', (select count(*) from public.menu_categories); end if;
  if (select count(*) from public.menu_items) <> 150 then raise exception 'FAIL seeded items %', (select count(*) from public.menu_items); end if;
  select * into r from public.menu_items where name = 'Reverse Osmosis Water';
  if r.price <> 0.55 or r.unit <> 'per gallon' then raise exception 'FAIL RO water %', r; end if;
  select * into r from public.menu_items where name = 'Protein Smoothie';
  if r.price is not null or jsonb_array_length(r.size_tiers) <> 2 then raise exception 'FAIL protein smoothie %', r; end if;
  if (select (size_tiers -> 0 ->> 'price')::numeric from public.menu_categories where id = 'ice-cream') <> 3.22 then
    raise exception 'FAIL ice cream single scoop';
  end if;
  if (select image_key from public.menu_categories where id = 'bottles') <> 'bottles' then raise exception 'FAIL bottles image'; end if;
  if (select phone_tel from public.store_info) <> 'tel:+15208121532' then raise exception 'FAIL store phone'; end if;
  -- The seed didn't log anything (no signed-in user).
  if exists (select 1 from public.menu_changes) then raise exception 'FAIL the seed was logged'; end if;
end $$;

-- ---------- Seed ----------
insert into auth.users (id, email)
values
  ('00000000-0000-4000-b000-000000000801', 'admin.menu@example.com'),
  ('00000000-0000-4000-b000-000000000802', 'cust.menu@example.com');
insert into public.profiles (id, auth_user_id, email, role, name, legacy_id, gallons)
values
  ('00000000-0000-4000-a000-000000000801', '00000000-0000-4000-b000-000000000801', 'admin.menu@example.com', 'admin', 'Admin Menu', 990801, 0),
  ('00000000-0000-4000-a000-000000000802', '00000000-0000-4000-b000-000000000802', 'cust.menu@example.com', 'user', 'Cust Menu', 990802, 0);
insert into public.menu_items (category_id, name, price, unit, hidden, sort_order)
values ('snacks', 'Secret Snack', 9.99, 'each', true, 999);

-- ---------- Signed out: read the visible menu, nothing else ----------
select set_config('request.jwt.claims', '', true);
set local role anon;
do $$
begin
  if (select count(*) from public.menu_items) <> 150 then raise exception 'FAIL anon sees % items (hidden included?)', (select count(*) from public.menu_items); end if;
  if (select count(*) from public.store_info) <> 1 then raise exception 'FAIL anon store info'; end if;
  begin
    update public.menu_items set price = 0 where name = 'Reverse Osmosis Water';
    raise exception 'FAIL anon updated an item';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.menu_changes;
    raise exception 'FAIL anon read the change log';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------- A customer: read like anyone, write nothing ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b000-000000000802","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  n integer;
begin
  if exists (select 1 from public.menu_items where name = 'Secret Snack') then raise exception 'FAIL customer sees a hidden item'; end if;
  update public.menu_items set price = 0 where name = 'Reverse Osmosis Water';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL customer updated % items', n; end if;
  update public.store_info set phone_display = 'hacked';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL customer updated store info'; end if;
  if (select count(*) from public.menu_changes) <> 0 then raise exception 'FAIL customer reads the change log'; end if;
  begin
    insert into public.menu_items (category_id, name, price) values ('snacks', 'Free Stuff', 0);
    raise exception 'FAIL customer added an item';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------- The admin ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b000-000000000801","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  new_id bigint;
  change record;
  n integer;
begin
  if not exists (select 1 from public.menu_items where name = 'Secret Snack') then raise exception 'FAIL admin cannot see hidden items'; end if;

  -- Re-price an item: logged with who, and the old and new values.
  update public.menu_items set price = 0.60 where name = 'Reverse Osmosis Water';
  select * into change from public.menu_changes where table_name = 'menu_items' order by id desc limit 1;
  if change.action <> 'update' or change.changed_by <> '00000000-0000-4000-a000-000000000801'
     or (change.old_values ->> 'price')::numeric <> 0.55 or (change.new_values ->> 'price')::numeric <> 0.60 then
    raise exception 'FAIL change log row %', change;
  end if;

  -- Add, hide, and remove an item; each is logged.
  insert into public.menu_items (category_id, name, price, unit, sort_order) values ('snacks', 'Trail Mix', 3.50, 'each', 50)
  returning id into new_id;
  update public.menu_items set hidden = true where id = new_id;
  delete from public.menu_items where id = new_id;
  select count(*) into n from public.menu_changes where row_key = new_id::text;
  if n <> 3 then raise exception 'FAIL add/hide/delete logged % rows', n; end if;

  -- An update that changes nothing isn't logged.
  select count(*) into n from public.menu_changes;
  update public.menu_items set price = 0.60 where name = 'Reverse Osmosis Water';
  if (select count(*) from public.menu_changes) <> n then raise exception 'FAIL a no-op update was logged'; end if;

  -- Size prices on a category, and store info.
  update public.menu_categories
  set size_tiers = '[{"key":"small","label":"Small","price":8.25},{"key":"large","label":"Large","price":10.50}]'
  where id = 'smoothies';
  update public.store_info set hours = '[{"days":"Every day","hours":"10am – 8pm"}]', phone_display = '(520) 812-1532';
  if not exists (select 1 from public.menu_changes where table_name = 'store_info') then raise exception 'FAIL store info edit not logged'; end if;
end $$;

-- The admin can't touch what isn't editable.
do $$
declare
  change text;
begin
  foreach change in array array[
    $q$update public.menu_categories set name = 'Renamed' where id = 'water'$q$,
    $q$update public.menu_categories set color = '#000000' where id = 'water'$q$,
    $q$insert into public.menu_categories (id, name, icon, color, sort_order) values ('new', 'New', 'x', '#000000', 1)$q$,
    $q$delete from public.menu_categories where id = 'water'$q$,
    $q$delete from public.store_info$q$,
    $q$insert into public.menu_changes (table_name, row_key, action) values ('x', 'x', 'insert')$q$,
    $q$delete from public.menu_changes$q$
  ] loop
    begin
      execute change;
      raise exception 'FAIL admin could run: %', change;
    exception when insufficient_privilege then
      null;
    end;
  end loop;
end $$;

-- Bad prices and size lists are refused.
do $$
declare
  bad text;
begin
  foreach bad in array array[
    $q$update public.menu_items set price = -1 where name = 'Reverse Osmosis Water'$q$,
    $q$update public.menu_items set name = '   ' where name = 'Reverse Osmosis Water'$q$,
    $q$update public.menu_categories set size_tiers = '[{"key":"small","label":"Small","price":-1}]' where id = 'smoothies'$q$,
    $q$update public.menu_categories set size_tiers = '[{"key":"","label":"Small","price":1}]' where id = 'smoothies'$q$,
    $q$update public.menu_categories set size_tiers = '[{"key":"small","label":"Small","price":"1.00"}]' where id = 'smoothies'$q$,
    $q$update public.menu_categories set size_tiers = '[{"key":"small","label":"Small","price":1.005}]' where id = 'smoothies'$q$,
    $q$update public.menu_categories set size_tiers = '[]' where id = 'smoothies'$q$,
    $q$update public.store_info set phone_tel = '520-812-1532'$q$,
    $q$update public.store_info set order_url = 'javascript:alert(1)'$q$
  ] loop
    begin
      execute bad;
      raise exception 'FAIL accepted: %', bad;
    exception when check_violation then
      null;
    end;
  end loop;
end $$;

reset role;

select 'menu tests passed' as result;

rollback;
