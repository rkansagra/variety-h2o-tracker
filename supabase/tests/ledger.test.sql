-- Tests for ledger entry kinds and corrections (ROADMAP item C): admin_adjust_gallons() writes
-- purchases and fills, admin_anonymize_customer() a forfeit, and admin_correct_transaction()
-- reverses one purchase or fill with a linked correction -- admin-only, with a note, once, never
-- below zero. A check constraint keeps kind and amount consistent, corrections aren't visits, and
-- member_since is a date.
--
-- Self-contained and always rolled back, like the other tests: synthetic profiles use legacy
-- IDs 990601+. Run it as the database owner. Success ends with one row: 'ledger tests passed'.

begin;

-- ---------- Seed ----------
insert into auth.users (id, email)
values
  ('00000000-0000-4000-b000-000000000601', 'admin.ledger@example.com'),
  ('00000000-0000-4000-b000-000000000602', 'cust.ledger@example.com');

insert into public.profiles (id, auth_user_id, email, role, name, legacy_id, gallons)
values
  ('00000000-0000-4000-a000-000000000601', '00000000-0000-4000-b000-000000000601', 'admin.ledger@example.com', 'admin', 'Admin Ledger', 990601, 0),
  ('00000000-0000-4000-a000-000000000602', '00000000-0000-4000-b000-000000000602', 'cust.ledger@example.com', 'user', 'Cust Ledger', 990602, 0),
  ('00000000-0000-4000-a000-000000000603', null, 'gone.ledger@example.com', 'user', 'Gone Ledger', 990603, 30);

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

-- ---------- Static: the column types ----------
do $$
begin
  if (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'member_since') <> 'date' then
    raise exception 'FAIL member_since is not a date';
  end if;
end $$;

-- ---------- As the admin ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b000-000000000601","role":"authenticated"}', true);
set local role authenticated;

create temporary table ids (label text primary key, id bigint) on commit drop;

do $$
declare
  r public.profiles;
  purchase_id bigint;
  fill_id bigint;
  big_fill_id bigint;
  correction record;
  last_visit timestamptz;
begin
  -- Purchases and fills get their kind from the sign.
  perform public.admin_adjust_gallons('00000000-0000-4000-a000-000000000602', 100, 'Paid for 100');
  perform public.admin_adjust_gallons('00000000-0000-4000-a000-000000000602', -5, null);
  r := public.admin_adjust_gallons('00000000-0000-4000-a000-000000000602', -50, null);  -- meant 5
  if r.gallons <> 45 then raise exception 'FAIL balance before correction %', r.gallons; end if;
  select id into purchase_id from public.gallon_transactions where user_profile_id = r.id and amount = 100 and kind = 'purchase';
  select id into fill_id from public.gallon_transactions where user_profile_id = r.id and amount = -5 and kind = 'fill';
  select id into big_fill_id from public.gallon_transactions where user_profile_id = r.id and amount = -50 and kind = 'fill';
  if purchase_id is null or fill_id is null or big_fill_id is null then raise exception 'FAIL kinds not set by admin_adjust_gallons'; end if;
  select last_transaction_at into last_visit from public.profiles where id = r.id;

  -- Correcting the 50-gallon fill gives the 50 back, as a linked correction with the note.
  r := public.admin_correct_transaction(big_fill_id, '  Rang up 50 instead of 5  ');
  if r.gallons <> 95 then raise exception 'FAIL balance after correction %', r.gallons; end if;
  select * into correction from public.gallon_transactions where corrects_transaction_id = big_fill_id;
  if correction.kind <> 'correction' or correction.amount <> 50 or correction.previous_balance <> 45
     or correction.new_balance <> 95 or correction.note <> 'Rang up 50 instead of 5' then
    raise exception 'FAIL correction row %', correction;
  end if;
  if (select last_transaction_at from public.profiles where id = r.id) is distinct from last_visit then
    raise exception 'FAIL a correction counted as a visit';
  end if;

  insert into ids values ('purchase', purchase_id), ('fill', fill_id), ('correction', correction.id);
end $$;

-- Refusals.
select pg_temp.expect_error(format('select public.admin_correct_transaction(%s, %L)', (select id from ids where label = 'fill'), '   '),
  'Say why the entry is being corrected');
select pg_temp.expect_error(format('select public.admin_correct_transaction(%s, %L)',
  (select corrects_transaction_id from public.gallon_transactions where id = (select id from ids where label = 'correction')), 'again'),
  'This entry was already corrected');
select pg_temp.expect_error(format('select public.admin_correct_transaction(%s, %L)', (select id from ids where label = 'correction'), 'undo the undo'),
  'Only a purchase or a fill can be corrected');
select pg_temp.expect_error('select public.admin_correct_transaction(-1, ''nope'')', 'Ledger entry not found');

-- Reversing the 100-gallon purchase would leave 95 - 100 < 0.
select pg_temp.expect_error(format('select public.admin_correct_transaction(%s, %L)', (select id from ids where label = 'purchase'), 'wrong customer'),
  'Can''t correct: the balance would go below zero (the customer has 95 gallons)');

-- A forfeit is written with its kind, and can't be corrected.
do $$
declare
  forfeit_id bigint;
begin
  perform public.admin_anonymize_customer('00000000-0000-4000-a000-000000000603');
  select id into forfeit_id from public.gallon_transactions
  where user_profile_id = '00000000-0000-4000-a000-000000000603' and kind = 'forfeit' and amount = -30;
  if forfeit_id is null then raise exception 'FAIL forfeit not written with its kind'; end if;
  insert into ids values ('forfeit', forfeit_id);
end $$;
select pg_temp.expect_error(format('select public.admin_correct_transaction(%s, %L)', (select id from ids where label = 'forfeit'), 'bring it back'),
  'Only a purchase or a fill can be corrected');

-- New customers get today's date (store time) as member_since.
do $$
declare
  r public.profiles;
begin
  r := public.admin_add_customer('Dated Ledger', 'dated.ledger@example.com');
  if r.member_since is distinct from (now() at time zone 'America/Phoenix')::date then
    raise exception 'FAIL member_since %', r.member_since;
  end if;
end $$;

-- The assistant counts the purchase and the 5-gallon fill, not the corrected fill or its correction.
do $$
declare
  d record;
begin
  select * into d from public.assistant_visits_by_day((now() at time zone 'America/Phoenix')::date, (now() at time zone 'America/Phoenix')::date);
  if d.gallons_filled < 5 then raise exception 'FAIL fills %', d.gallons_filled; end if;
  if exists (
    select 1 from public.assistant_customer_history(990602) h where h.kind = 'correction' and h.amount = 50
  ) is not true then
    raise exception 'FAIL customer_history does not show the correction';
  end if;
  -- 5 filled today by this customer, not 55: the corrected 50 isn't counted.
  if (select gallons_filled from public.assistant_top_customers(
        (now() at time zone 'America/Phoenix')::date, (now() at time zone 'America/Phoenix')::date, 50)
      where legacy_id = 990602) <> 5 then
    raise exception 'FAIL top_customers counted a corrected fill';
  end if;
end $$;

reset role;

-- ---------- A customer can't correct anything ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-b000-000000000602","role":"authenticated"}', true);
set local role authenticated;
select pg_temp.expect_error(format('select public.admin_correct_transaction(%s, %L)', (select id from ids where label = 'fill'), 'mine'),
  'Only admins can correct entries');
reset role;

-- ---------- The kind constraint (even the table owner can't write an inconsistent row) ----------
do $$
declare
  bad text;
begin
  foreach bad in array array[
    $q$('purchase', -5, null)$q$,
    $q$('fill', 5, null)$q$,
    $q$('forfeit', 5, null)$q$,
    $q$('correction', 5, null)$q$,
    $q$('refund', 5, null)$q$
  ] loop
    begin
      execute format(
        'insert into public.gallon_transactions (user_profile_id, amount, previous_balance, new_balance, kind, corrects_transaction_id) '
        'select %L, v.amount, 10, 10, v.kind, v.corrects::bigint from (values %s) as v(kind, amount, corrects)',
        '00000000-0000-4000-a000-000000000602', bad);
      raise exception 'FAIL inconsistent row accepted: %', bad;
    exception when check_violation then
      null;
    end;
  end loop;
end $$;

select 'ledger tests passed' as result;

rollback;
