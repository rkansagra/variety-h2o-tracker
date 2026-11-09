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
- `src/App.jsx` — providers and routes only.
- `src/UserProvider.jsx` — auth/session, loading profiles and transactions from Supabase,
  gallon adjustments, claim codes, data deletion, and biometric lock. Read it with `useUser()`
  from `src/userContext.js`.
- `src/screens/` — one component per route (`Login`, `ForgotPassword`, `ClaimAccount`,
  `MainApp`), plus `BiometricLockScreen` and `UnlinkedSessionRedirect`.
- `src/screens/tabs/` — MainApp's four tabs: Home (`TrackerTab`), `MenuTab`, `LocationTab`,
  `SettingsTab`.
- `src/admin/` — the admin's customer panel and customer card.
- `src/menu/menuData.js` — menu categories and prices.
- `src/lib/` — pure helpers and hooks (customer mapping/filtering, layout hooks, formatting,
  tiers, biometrics labels, URLs), plus `supabaseClient.js` (Supabase client setup).
- `src/components/` — small shared components.
- `src/styles.js` — the shared inline style objects and CSS string.
- `src/assets/` — static images and branding assets
- `src/index.css` — base styling
- `android/` — native Capacitor wrapper project (there is no `ios/`; iOS ships as a PWA)
- `supabase/schema.sql` — database schema and admin-only transaction functions
- `public/` — public static assets for the web build
- `dist/` — production build output

### Important architectural note
Everything that talks to Supabase for app data lives in `src/UserProvider.jsx`; screens and tabs
call its actions through `useUser()`. Start there to understand behavior, then the screen involved.

## Data flow and business logic

The app uses Supabase as the main source of truth.

- Authentication is handled through Supabase Email/Password auth.
- User and customer data is stored in the `profiles` table.
- Gallon changes are not done ad hoc in the client; they go through the `admin_adjust_gallons(...)` Postgres function.
- Transaction rows are stored in `gallon_transactions` and shown in history screens.
- `UserProvider` (`src/UserProvider.jsx`) is the central state holder for:
  - current user/session
  - user list
  - notifications
  - app loading state
  - password recovery flow

When an admin changes a customer balance, the flow is roughly:

1. The admin panel calls `adjustGallons(...)` from `UserProvider`
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
- Supabase reads and writes are concentrated in `src/UserProvider.jsx`
- Stable DOM IDs are documented in `TEST_IDS.md`
- Native build logic belongs in `android/` and should not be hand-edited unless using Capacitor sync/build steps
- The app is designed around React state, with Supabase as the persistent backend

## Automated tests

Tests import what they need straight from its module: pure helpers from `src/lib/`,
`UserProvider` and `useUser`/`UserContext`, and screens such as `Login` and `ClaimAccount`.

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
covering just the `.from()/.rpc()/.auth.*/.channel()` chain shapes the app actually calls; extend
it if a new test needs a chain shape it doesn't support yet. `src/test/setup.js` also globally
mocks `@capacitor/core`, `@capacitor/app`, and `@aparajita/capacitor-biometric-auth` to
"web platform, no biometry" by default for every test file (partly because these are native-only
plugins with nothing meaningful to do in jsdom, partly because the biometric-auth package's ESM
build doesn't resolve under Vitest at all -- see the comment there). There is currently no E2E
suite against a running app/browser -- `TEST_IDS.md`'s selectors exist for that if it's added
later.

Vitest also runs `supabase/functions/admin-assistant/assistant.test.ts`, the assistant's tool
loop with a fake Anthropic client.

**Database tests** (`supabase/tests/*.test.sql`) check the database side, such as that the
assistant's tools are read-only and admin-only. Each one seeds its own data and rolls back. CI's
`database` job runs them on plain Postgres after `supabase/tests/supabase_stub.sql` (the Supabase
roles, `auth.uid()`, and so on) and `schema.sql`, twice, to prove it re-runs. You can also paste
one into the Supabase SQL editor; it changes nothing.

## Documentation map

- `SUPABASE_SETUP.md` — required auth and database setup for a developer environment
- `TEST_IDS.md` — stable selector IDs used by automation and QA
- `PUSH_NOTIFICATIONS_GUIDE.md` and `SCALING_AND_DATABASE_GUIDE.md` were historical/partial drafts and were removed because they were stale or speculative rather than current project guidance

## When to read what

- Need to understand the app flow? Start with `src/UserProvider.jsx`, then the screen in `src/screens/`
- Need to set up local environment? Read `SUPABASE_SETUP.md`
- Need to target UI selectors in automation? Read `TEST_IDS.md`
- Need to build or lint? Use the package scripts above
- Need to run or extend tests? Read "Automated tests" above, then the test files themselves
