-- The parts of a Supabase database that schema.sql relies on, for running it and the SQL tests
-- on plain Postgres in CI (.github/workflows/test.yml). Not for a real Supabase project, which
-- already has all of this.

create role anon nologin;
create role authenticated nologin;

-- Supabase's default privileges: the API roles can use new public tables (RLS then decides
-- which rows) and execute new functions, unless schema.sql revokes it.
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;

create schema auth;
grant usage on schema auth to anon, authenticated;

create table auth.users (
  id uuid primary key,
  email text
);

-- Same contract as Supabase's auth.uid(): the `sub` claim of the request's JWT, or null.
create function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      current_setting('request.jwt.claims', true)::jsonb ->> 'sub'
    ),
    ''
  )::uuid;
$$;
grant execute on function auth.uid() to anon, authenticated;

create publication supabase_realtime;

-- Stand-in for Supabase's RLS auto-enable event-trigger function, which schema.sql revokes.
create function public.rls_auto_enable() returns void language sql as $$ select $$;
