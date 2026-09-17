# Supabase setup

This document is the main local setup guide for the app. It covers the Supabase configuration the app expects to run correctly.

This app uses Supabase Email/Password auth, with Postgres as the source of truth for customers, gallon balances, and transactions.

## Before you begin

If you are new to the repo, start with the project overview in `README.md`. That file explains where the app code lives and where the real business logic exists.

## 1) Add environment variables

Create `chill-and-sip/.env` from `chill-and-sip/.env.example` and set:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## 2) Create database schema

1. Open your Supabase project's SQL Editor.
2. Run `chill-and-sip/supabase/schema.sql` in full.
3. This creates `profiles`, `gallon_transactions`, row-level security policies, and the
   `admin_adjust_gallons(...)` function that the app uses for every credit/debit. The script is
   idempotent and safe to re-run.

## 3) Auth configuration

In Supabase Dashboard → Authentication → Settings:

- Enable the **Email** provider.
- Turn **off** "Confirm email". This app only creates accounts through admin registration (in
  Settings, while logged in as admin) — the admin sets a temporary password for the new customer
  right there, and the customer needs to be able to log in with it immediately, without first
  clicking a confirmation link in an email they may not check. Because account creation is gated
  to admins in the app (enforced by the `profiles_insert_admin` RLS policy), an unconfirmed signup
  from outside the app creates an orphaned auth user with no linked profile and zero gallons — it
  cannot access or affect anyone's balance.
- Add your app's login URL(s) to the Auth redirect allow-list (used by the "Forgot Password" flow),
  for example:
  - `http://localhost:5173/login`
  - your production login URL, e.g. `https://your-domain.com/login`

## 4) Admin bootstrap

1. In Dashboard → Authentication → Users, create your own admin user (email + password).
2. Copy that user's UUID.
3. In the SQL Editor, run (replace the placeholder values with your real UUID and email):

```sql
insert into public.profiles (auth_user_id, email, role, gallons, name, member_since, legacy_id)
values ('PASTE-YOUR-ADMIN-AUTH-UUID-HERE', 'you@example.com', 'admin', 0, 'Your Name', 'N/A', 1)
on conflict (email) do update
set role = excluded.role,
    name = excluded.name,
    legacy_id = excluded.legacy_id;
```

4. Log into the app with that email/password — you should land as admin.

## 5) App behavior notes

- Login expects **email + password**.
- Admin registers new customers from Settings: sets their name, email, and a temporary password.
  The customer can change their password later from the login screen's "Forgot Password" flow.
- All gallon credits/debits go through a single Postgres function (`admin_adjust_gallons`) that is
  admin-only, atomic (locks the row, so concurrent actions can't race each other or leave a balance
  change without a matching transaction record), and rejects any debit that would take a balance
  below zero. There is no other way to change a balance — regular customers cannot update their own
  `gallons` value even by calling the Supabase API directly (no RLS policy permits it).
- Every credit/debit can include an optional note, and requires a confirmation step in the UI before
  it's applied.
- The customer's own Tracker tab shows their 5 most recent transactions; admin can open a customer's
  full transaction history from Manage Users for reconciliation or disputes.
- "Forgot Password" uses `supabase.auth.resetPasswordForEmail(...)`. The recovery link redirects to
  `/login`; when Supabase emits `PASSWORD_RECOVERY`, the app shows in-place new-password fields.
- There is no localStorage fallback for customers/balances/transactions — if Supabase is unreachable,
  the app shows no data rather than risking stale or fabricated numbers.

## 6) Imported/legacy customers and self-serve account setup

Customers imported in bulk (e.g. from a legacy prepaid list) have no email and no login yet —
`profiles.email` is nullable for exactly this reason. To let one of them set up their own login
without staff already having their email:

1. In Manage Users, find the customer and click **Generate Claim Code**. This shows an 8-character
   code once (stored server-side; not re-displayed if you navigate away — regenerate if needed).
2. Give the customer their Customer ID + that code (verbally, on a receipt, etc.).
3. The customer visits `/claim`, enters their Customer ID + code + picks their own email/password.
   The `claim_profile(...)` function links their new login to their existing profile in one atomic,
   single-use step (admin-only `admin_generate_claim_code(...)` generates the code; both are
   SECURITY DEFINER functions gated the same way as `admin_adjust_gallons`).
4. Add your production claim URL (e.g. `https://your-domain.com/claim`) to the Auth redirect
   allow-list alongside `/login` if you ever add email-link flows to it (not required for the
   current code-based flow, which does not use email redirects).

## 7) Water type and active/inactive status

- `profiles.water_type` (`purified` / `remineralized` / `alkaline` / null) is informational only —
  shown in Manage Users and on the customer's own tracker — so staff can see at a glance what to
  charge at the register. It has no effect on gallons math; pricing/tiers are handled by staff.
- Active/Inactive is never stored — the app computes it live from `gallons > 0 OR last_transaction_at
  within the last 31 days`. `last_transaction_at` is set only by `admin_adjust_gallons(...)`, never by
  editing water type or generating a claim code, so it always reflects real purchase activity.
