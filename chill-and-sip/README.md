# Variety H2O app

This repo contains the web/mobile app for Variety H2O, built with React, Vite, and Capacitor.

The active product code lives under `chill-and-sip/`.

## What the app does

- Customer-facing tracker and account status
- Admin dashboard for managing customer gallons and transactions
- Menu and location information
- Claim-code flow for imported or legacy customers to create their own login
- Supabase-backed transaction history and auth
- Native Android wrapper via Capacitor; iOS users install the PWA from Safari

## Directory breakdown

### `chill-and-sip/`
This is the real application codebase.

- `src/main.jsx` — app bootstrap. Locks portrait orientation on mobile and mounts the main app.
- `src/App.jsx` — this is the main business logic and UI file. It contains:
  - auth/session management
  - user/profile loading from Supabase
  - gallon adjustments and transaction history
  - admin flow and claim-code flow
  - menu/location/settings screens
  - notification handling
- `src/lib/supabaseClient.js` — Supabase client setup and auth configuration
- `src/assets/` — static images and branding assets
- `src/index.css` — base styling
- `android/` — native Capacitor wrapper project (there is no `ios/`; iOS ships as a PWA)
- `supabase/schema.sql` — database schema and admin-only transaction functions
- `public/` — public static assets for the web build
- `dist/` — production build output

### Important architectural note
Nearly all of the app's real logic lives in `chill-and-sip/src/App.jsx`. If you are trying to understand behavior, start there before looking elsewhere.

## Data flow and business logic

The app uses Supabase as the main source of truth.

- Authentication is handled through Supabase Email/Password auth.
- User and customer data is stored in the `profiles` table.
- Gallon changes are not done ad hoc in the client; they go through the `admin_adjust_gallons(...)` Postgres function.
- Transaction rows are stored in `gallon_transactions` and shown in history screens.
- `UserProvider` in `App.jsx` is the central state holder for:
  - current user/session
  - user list
  - notifications
  - app loading state
  - password recovery flow

When an admin changes a customer balance, the flow is roughly:

1. UI calls `adjustGallons(...)` in `App.jsx`
2. Client invokes Supabase RPC `admin_adjust_gallons`
3. Postgres validates admin privilege and balance rules
4. Balance and transaction record are updated atomically
5. The app refreshes state and sends a local notification to the affected customer

## Quick start

From the repo root:

```bash
cd chill-and-sip
npm install
cp .env.example .env
```

Then set:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

See `SUPABASE_SETUP.md` for the complete database and auth setup steps.

## Common developer commands

```bash
npm run dev
npm run build
npm run lint
npm run preview
npm run test           # unit/component tests (Vitest + React Testing Library), no backend required
npm run test:watch
npm run test:coverage
```

## Product conventions

- App entry is `src/main.jsx`
- Business logic is concentrated in `src/App.jsx`
- Stable DOM IDs are documented in `TEST_IDS.md`
- Native build logic belongs in `android/` and should not be hand-edited unless using Capacitor sync/build steps
- The app is designed around React state, with Supabase as the persistent backend

## Automated tests

`src/App.jsx` exports its pure helper functions (`mapProfileToUser`, `isActiveCustomer`,
`slugify`, `getTier`, etc.), `UserContext`/`UserProvider`/`useUser`, and the `Login`/`ClaimAccount`
components specifically so they're testable in isolation -- Vite's Fast Refresh lint rule is
disabled for this one file in `eslint.config.js` to allow it (see the comment there).

- `src/App.pure.test.jsx` — pure logic: active/inactive window math, notification capping,
  profile/transaction mapping, reward tiers.
- `src/Login.test.jsx` — component-level: renders `<Login />` with a hand-fed fake
  `UserContext` value (not the real `UserProvider`), so it tests Login's own rendering/event
  logic without touching Supabase at all.
- `src/UserProvider.test.jsx` — integration-level: renders the real `UserProvider` against a
  mocked Supabase client (`src/test/supabaseMock.js`) to exercise `login()`'s actual
  profile-linking logic, including the `authLinkError` path an OAuth sign-in with no matching
  `profiles` row takes.
- `src/BiometricAuth.test.jsx` — integration-level: the biometric lock preference/gate logic
  (`enableBiometricLock`/`unlockWithBiometrics`/`disableBiometricLock`, and locking on sign-in
  when the preference was already on) against mocked `@capacitor/core` and
  `@aparajita/capacitor-biometric-auth`.

None of these hit a real Supabase project -- `src/test/supabaseMock.js` is a hand-built fake
covering just the `.from()/.rpc()/.auth.*/.channel()` chain shapes App.jsx actually calls; extend
it if a new test needs a chain shape it doesn't support yet. `src/test/setup.js` also globally
mocks `@capacitor/core`, `@capacitor/app`, and `@aparajita/capacitor-biometric-auth` to
"web platform, no biometry" by default for every test file (partly because these are native-only
plugins with nothing meaningful to do in jsdom, partly because the biometric-auth package's ESM
build doesn't resolve under Vitest at all -- see the comment there). There is currently no E2E
suite against a running app/browser -- `TEST_IDS.md`'s selectors exist for that if it's added
later.

## Documentation map

- `SUPABASE_SETUP.md` — required auth and database setup for a developer environment
- `TEST_IDS.md` — stable selector IDs used by automation and QA
- `PUSH_NOTIFICATIONS_GUIDE.md` and `SCALING_AND_DATABASE_GUIDE.md` were historical/partial drafts and were removed because they were stale or speculative rather than current project guidance

## When to read what

- Need to understand the app flow? Start with `src/App.jsx`
- Need to set up local environment? Read `SUPABASE_SETUP.md`
- Need to target UI selectors in automation? Read `TEST_IDS.md`
- Need to build or lint? Use the package scripts above
- Need to run or extend tests? Read "Automated tests" above, then the test files themselves
