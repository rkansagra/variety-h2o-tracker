# Supabase setup

This document is the main local setup guide for the app. It covers the Supabase configuration the app expects to run correctly.

Customers sign in with an emailed 6-digit code (Supabase email OTP) or Google; staff sign in with
email + password. Postgres is the source of truth for customers,
gallon balances, and transactions.

## Before you begin

If you are new to the repo, start with `README.md` (what the app is and why it's built this way)
and `docs/DEVELOPMENT.md` (where the code lives and how it's tested).

## 1) Add environment variables

Create `.env` from `.env.example` and set:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## 2) Create database schema

1. Open your Supabase project's SQL Editor.
2. Run `supabase/schema.sql` in full.
3. This creates `profiles`, `gallon_transactions`, row-level security policies, and the
   `admin_adjust_gallons(...)` function that the app uses for every credit/debit. The script is
   idempotent and safe to re-run.

## 3) Auth configuration

In Supabase Dashboard → Authentication:

- **Email provider on, "Confirm email" ON.** Code sign-ins confirm the email themselves. With it
  off, a password sign-up made straight through the API would count as confirmed without anyone
  proving they own the address. (`link_my_profile()` also refuses any login that has a password,
  so customer records stay safe even if this is ever switched off, but leave it on.)
- **Custom SMTP (required for customers).** Supabase's built-in sender only emails members of the
  project's team, at a few messages an hour. This project uses Resend (free tier):
  1. In Resend, add the domain (e.g. `varietyh2o.com`) and add the records it lists wherever
     the domain's DNS lives (WordPress.com here): a DKIM TXT at `resend._domainkey`, CNAMEs at
     `send` and `rsend`, and a DMARC TXT at `_dmarc` (`v=DMARC1; p=none;`). Leave the existing MX
     (mailbox) records alone. Turn off click/open tracking, which rewrites links.
     Then create a sending-only API key limited to the domain; it's the SMTP password below.
  2. Authentication → SMTP Settings: enable custom SMTP with host `smtp.resend.com`, port `465`,
     username `resend`, the API key as the password; sender `no-reply@varietyh2o.com`, name
     "Variety H2O + Ice Cream".
  3. Authentication → Rate Limits: raise the email limit (custom SMTP starts at 30 an hour).
- **Email templates (Authentication → Email Templates)** must send the code, not just a link.
  Put `{{ .Token }}` in both **Magic Link** (returning customers) and **Confirm signup** (a
  customer's very first sign-in), with no link: some mail scanners open links automatically,
  which would use up the code. **Email OTP Length** must be 6 (the app accepts only 6 digits).
  For example:

  ```html
  <h2>Your Variety H2O sign-in code</h2>
  <p>Enter this code in the app: <strong>{{ .Token }}</strong></p>
  <p>It expires in an hour. If you didn't ask for it, you can ignore this email.</p>
  ```
- **Redirect allow-list** (used by Google sign-in and the staff password reset): add the app's
  login URL(s), for example `http://localhost:5173/login` and `https://your-domain.com/login`.

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

4. Log into the app with "Staff sign-in" and that email/password; you land as admin.
   - **No authenticator step.** Admin MFA (PR #37) was removed on 2026-11-24 because several owners
     share the one admin login across their own devices. Admin access is the password alone, so
     use a long, unique password, and share it only through a password manager.

## 5) App behavior notes

- **Customers** sign in with an emailed 6-digit code (`signInWithOtp` + `verifyOtp`), or Google on
  the website. There are no customer passwords.
- **Staff** use "Staff sign-in" on the login screen: email + password.
  "Forgot password?" there uses `supabase.auth.resetPasswordForEmail(...)`; the recovery link
  returns to `/login`, where the app shows in-place new-password fields on `PASSWORD_RECOVERY`.
- All gallon credits/debits go through a single Postgres function (`admin_adjust_gallons`) that is
  admin-only, atomic (locks the row, so concurrent actions can't race each other or leave a balance
  change without a matching transaction record), and rejects any debit that would take a balance
  below zero. There is no other way to change a balance — regular customers cannot update their own
  `gallons` value even by calling the Supabase API directly (no RLS policy permits it).
- Every credit/debit can include an optional note, and requires a confirmation step in the UI before
  it's applied.
- The customer's own Home tab shows their 5 most recent transactions; admin can open a customer's
  full transaction history from the customer panel for reconciliation or disputes.
- There is no localStorage fallback for customers/balances/transactions — if Supabase is unreachable,
  the app shows no data rather than risking stale or fabricated numbers.

## 6) Adding customers and linking their logins

Customer records come from staff, never from sign-up:

1. **Add customer** (customer panel on Home): a name and an email, both required (every customer
   sets up their own sign-in with their email). It calls
   `admin_add_customer(...)`, which assigns the next customer number from
   `profiles_legacy_id_seq` with a 0 balance. Imported customers already have records.
2. **Imported customers** (no email yet) get theirs at the counter: the "Email for app sign-in"
   field on a customer with no login. It calls `admin_set_customer_email(...)`, which keeps emails
   lowercase and unique; an email can be corrected but not cleared.
3. The customer signs in with a code sent to that email (or Google with that address). On the first
   sign-in the app calls `link_my_profile()`, which links the login to the one unlinked customer
   record with that email, only if the email is confirmed and the login has no password. It never
   links an admin or deleted record.
4. Someone whose email isn't on any record lands on `/no-account`, which asks them to have staff
   add it and offers **Check again**.

The browser never writes `auth_user_id`: signed-in users have no INSERT on `profiles` and can
UPDATE only `water_type` (admins, through RLS). `profiles.auth_user_id` references `auth.users`
with `on delete set null`, so deleting a login unlinks its record.

## 7) Water type and active/inactive status

- `profiles.water_type` (`purified` / `remineralized` / `alkaline` / null) is informational only —
  shown in Manage Users and on the customer's own tracker — so staff can see at a glance what to
  charge at the register. It has no effect on gallons math; pricing/tiers are handled by staff.
- Active/Inactive is never stored — the app computes it live: active means `last_transaction_at`
  within the last 60 days. Visits only: a balance alone doesn't count, which matches the assistant.
  `last_transaction_at` is set only by `admin_adjust_gallons(...)`, never by editing water type or
  an email, so it always reflects real purchase activity.

## 8) "Ask the ledger" assistant (admin only)

Admins can ask plain-language questions about customers, balances, and visits from the Home tab.
The pieces:

- **Read-only tools**: the `assistant_*` functions in `schema.sql`. They're `STABLE`, so they can't
  write, and `SECURITY INVOKER`, so they run under the caller's RLS. Each one refuses anyone who
  isn't an admin. They never return email addresses.
- **Edge Function** `supabase/functions/admin-assistant/`: checks the caller is an admin, then runs
  Claude with only those tools (`assistant.ts`). It calls the database with the caller's own login
  over read-only GET requests, never with the service-role key. It logs tool names, token counts,
  and timing to the function logs, but no questions, arguments, or results.
- **UI**: `src/admin/AssistantPanel.jsx`, through `askAssistant()` in `UserProvider.jsx`.

To set it up on a project:

1. Run `schema.sql` (it includes the tools).
2. Add the Edge Function secret `ANTHROPIC_API_KEY` (Dashboard -> Edge Functions -> Secrets).
   Optionally set `ASSISTANT_MODEL` (default `claude-sonnet-5-5`).
3. Deploy: `supabase functions deploy admin-assistant` (JWT verification stays on).

Without the API key the function answers "The assistant isn't set up yet (no API key)".

## 9) Auth history and future plans

Customer/admin auth briefly switched to phone number + password (to avoid email friction and set
up future SMS features), then was reverted back to email + password, and in 2026-11 customers
moved to emailed codes (ROADMAP item G; claim codes were retired). The standing plan:

- **Email stays the primary login method** (codes for customers, password for staff). No phone number field, no SMS provider.
- **Notifications move in-app instead of SMS.** Any future rewards/spend-threshold reminders (e.g.
  "you're close to your next reward") should be built as in-app notifications the customer sees
  when they open the app -- not text messages. This avoids the SMS provider cost/complexity
  entirely (Twilio A2P 10DLC registration, per-message fees, etc. -- see prior session's cost
  research if you want the numbers) while still reaching the customer.
- **OAuth/social login is additive to email; Google is implemented app-side.** `loginWithGoogle()`
  in `src/UserProvider.jsx` calls `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo:
  authRedirectUrl() } })`, and the Login page has a "Continue with Google" button that triggers it.
  The button is **web/PWA only** -- it's hidden in the Capacitor native app, because Google rejects
  OAuth inside embedded webviews (`Error 403: disallowed_useragent`).
  - `authRedirectUrl()` is also used for password-reset and sign-up confirmation emails. It returns
    `<current origin>/login` on the web and `https://varietyh2o.com/login` in the native app, whose
    own origin (`https://localhost`) no browser can reach. Supabase's Redirect URLs allow list has
    `https://varietyh2o.com/login`, `https://deploy-preview-*--papaya-ganache-217e68.netlify.app/login`
    and `http://localhost:5173/login`; the Site URL is `https://varietyh2o.com`.
  The redirect-back is handled automatically -- `supabaseClient.js` already has
  `detectSessionInUrl: true`, so the returning session flows through the existing
  `onAuthStateChange` → `refreshFromSupabase()` path the same as any other sign-in.
  - **This app-code half is only useful once the Supabase/Google Cloud half is configured**,
    which is dashboard/console work this file can't do for you:
    1. Google Cloud Console: create an OAuth client (Web application type). Authorized redirect
       URI is your Supabase project's callback, e.g. `https://<project-ref>.supabase.co/auth/v1/callback`.
    2. Supabase Dashboard → Authentication → Providers → Google: paste that Client ID + Secret,
       enable the provider.
    3. A Google sign-in with the same email as a code sign-in resolves to the same `auth.users`
       row (Supabase links identities that share a verified email), so either method lands on
       the same customer record.
    4. A first-time Google sign-in links like a code sign-in: `link_my_profile()` matches the
       Google account's (confirmed) email to the record staff saved, or the customer sees
       `/no-account`.
  - **Apple Sign-In was deliberately not built.** It'd otherwise follow the same app-side pattern
    (`provider: 'apple'`) plus its own Apple Developer Program setup (a **Services ID** --
    reverse-domain, not the same as Google's Client ID -- plus a `.p8` signing key rotated every 6
    months). The only reason to add it would be Apple App Store Review Guideline 4.8 (offering one
    third-party login obligates offering Apple's too) -- but this project distributes to iOS as an
    installable PWA (Add to Home Screen in Safari) instead of through the App Store, specifically
    to avoid the $99/year Apple Developer Program membership. No App Store submission means
    Guideline 4.8 doesn't apply. Revisit only if App Store distribution becomes a goal again.
  - Facebook/etc. would follow the same app-side pattern (`provider: 'facebook'`) plus that
    provider's own console + Dashboard config.
- **Biometric login (Face ID / Touch ID / Android biometric) is implemented, native only.** A
  device-level convenience layer on top of the existing Supabase session -- not a separate auth
  method, and it never replaces email/password or OAuth. The underlying account is unchanged;
  biometrics just gate whether the already-signed-in session is shown after the app launches or
  returns to the foreground.
  - Uses [`@aparajita/capacitor-biometric-auth`](https://github.com/aparajita/capacitor-biometric-auth)
    (Capacitor 7-compatible), **not** `capacitor-native-biometric` as originally sketched here --
    that package still pins `@capacitor/core@^3.4.3` (unmaintained for over a year), which would
    have installed a second, incompatible copy of Capacitor's core alongside this project's v7.
  - `UserProvider` (`src/UserProvider.jsx`) owns all of it: `biometricAvailable`/`biometryType` (from
    `BiometricAuth.checkBiometry()`, native platforms only -- always false/none on web, so this
    never shows up in the PWA), `biometricLockEnabled` (this user's own opt-in, persisted in
    `localStorage` keyed by `auth_user_id` since more than one account could sign into the same
    device), and `isBiometricLocked` (the moment-to-moment "show the lock screen" flag, set
    whenever a signed-in user with the preference on cold-starts the app or backgrounds/
    foregrounds it via `@capacitor/app`'s `appStateChange`).
  - `enableBiometricLock()` requires one successful `authenticate()` before persisting the
    preference, so nobody can lock themselves out by enabling it somewhere biometrics don't
    actually work for them. `unlockWithBiometrics()` (used by `BiometricLockScreen`, which
    auto-prompts on mount) and `disableBiometricLock()` round out the pair.
  - Native permissions: `USE_BIOMETRIC`/`USE_FINGERPRINT` in
    `android/app/src/main/AndroidManifest.xml`.
  - `npx cap sync android` has been run and Android is fully wired (Gradle plugin registration
    confirmed). There is no native iOS project (iOS ships as a PWA); if one is ever added with
    `npx cap add ios`, it will also need `NSFaceIDUsageDescription` in `ios/App/App/Info.plist`
    and a `pod install` on a Mac.
