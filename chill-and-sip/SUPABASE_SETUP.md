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

## 8) Auth history and future plans

Customer/admin auth briefly switched to phone number + password (to avoid email friction and set
up future SMS features), then was reverted back to email + password. That attempt is why you may
see references to it in old commits/PRs -- the current, standing plan going forward is:

- **Email + password stays the primary login method.** No phone number field, no SMS provider.
- **Notifications move in-app instead of SMS.** Any future rewards/spend-threshold reminders (e.g.
  "you're close to your next reward") should be built as in-app notifications the customer sees
  when they open the app -- not text messages. This avoids the SMS provider cost/complexity
  entirely (Twilio A2P 10DLC registration, per-message fees, etc. -- see prior session's cost
  research if you want the numbers) while still reaching the customer.
- **OAuth/social login is additive to email; Google is implemented app-side.** `loginWithGoogle()`
  in `App.jsx` calls `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo:
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
    3. Decide whether to enable Dashboard → Authentication → Settings → "Automatic linking" for
       accounts sharing a verified email. Without it, a customer who already has an email/password
       login gets a *separate* `auth.users` row when they use Google with the same email, which
       won't match their existing `profiles.auth_user_id` -- `refreshFromSupabase()` then treats
       it as an unlinked login (see step 4) and sends them to `/claim`. With it enabled, Supabase resolves both sign-in methods to the same
       `auth.users` row, so the existing profile match just works.
    4. New customers signing in with Google for the first time still need a `profiles` row to land
       on (same as email/password) -- either an admin-created row with a matching email (linked
       automatically on sign-in), or a claim code. For the latter, `refreshFromSupabase()` keeps
       the unlinked session instead of signing it out and sets `unlinkedAuthEmail`;
       `UnlinkedSessionRedirect` sends them to `/claim`, which shows who is signed in and asks only
       for the customer ID + claim code (plus "Use a different account"). `claim_profile()` needs
       no change -- it works for any signed-in user and takes the email from `auth.users`.
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
  - `UserProvider` (`App.jsx`) owns all of it: `biometricAvailable`/`biometryType` (from
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
