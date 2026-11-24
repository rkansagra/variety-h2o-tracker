# Developer guide

How the code is organized, how to run it, and how it's tested. For what the app is and why it's
built this way, see the [README](../README.md); for database and auth setup, see
[SUPABASE_SETUP.md](../SUPABASE_SETUP.md).

## Quick start

From the repo root:

```bash
npm install
cp .env.example .env   # then set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

`SUPABASE_SETUP.md` covers creating the database (`supabase/schema.sql`), auth settings, email
delivery, and the admin bootstrap.

## Commands

```bash
npm run dev            # Vite dev server
npm run build          # production build into dist/
npm run preview        # serve the build locally
npm run lint           # ESLint
npm run test           # Vitest + React Testing Library, no backend needed
npm run test:watch
npm run test:coverage
```

## Code map

- `src/main.jsx`: bootstrap. Locks portrait on phone-sized native screens and mounts the app.
- `src/App.jsx`: providers and routes only (`/`, `/login`, `/forgot-password`, `/no-account`).
- `src/UserProvider.jsx`: the only module that reads or writes app data in Supabase. It owns the
  session, the signed-in user's own profile and recent history, every write action, the admin's
  customer search, and the biometric lock. Components read it with `useUser()` from
  `src/userContext.js`.
- `src/screens/`: one component per route (`Login`, `ForgotPassword`, `NoAccount`, `MainApp`),
  plus `BiometricLockScreen` and `UnlinkedSessionRedirect`.
- `src/screens/tabs/`: MainApp's four tabs: Home (`TrackerTab`), `MenuTab`, `LocationTab`,
  `SettingsTab`. In-app navigation is tab state in `MainApp`, not routes.
- `src/admin/`: the admin's customer panel (`AdminPanel`), customer card (`AdminUserRow`), and the
  "Ask the ledger" assistant panel.
- `src/menu/menuData.js`: menu categories and prices (real business data from the POS catalog).
- `src/lib/`: pure helpers and hooks: customer mapping, layout size classes (`useSizeClass()`),
  formatting, store info, URLs, and `supabaseClient.js`.
- `src/styles.js` and `src/index.css`: shared inline style objects, design tokens
  (`--vh2o-*`), and size-class layout rules.
- `supabase/schema.sql`: the whole database, idempotent and runnable from scratch: tables, RLS,
  column grants, and every function. Kept in sync with each applied migration.
- `supabase/functions/admin-assistant/`: the Edge Function behind "Ask the ledger".
- `android/`: the Capacitor wrapper. Don't hand-edit generated files; use `npx cap sync android`.
  There's no `ios/`: iOS ships as an installable PWA.

## Data flow

Supabase (Postgres + Auth + RLS) is the single source of truth; there's no `localStorage`
fallback for customer data.

- **Sign-in:** customers get an emailed 6-digit code (`signInWithOtp` + `verifyOtp`) or use Google
  on the web; staff use email + password. On a first sign-in, `link_my_profile()` links the login
  to the customer record with the same confirmed email (never a login that has a password).
- **Loading:** after sign-in the app reads only the user's own profile and their 5 latest ledger
  entries. Realtime pushes balance changes to an open app.
- **Admin:** the customer list comes from `admin_search_customers()` (3+ characters, filtered and
  sorted in the database), with `admin_get_customer()` for the details panel and
  `admin_customer_summary()` for the totals.
- **Balance changes** go only through `admin_adjust_gallons()`: admin-only, row-locked, never below
  zero, and always paired with a ledger row. Signed-in users can't write `gallons` (or any column
  but `water_type`) directly.

## Tests

**Unit and component tests** (Vitest, `src/*.test.jsx` and the assistant's
`supabase/functions/admin-assistant/assistant.test.ts`) never touch a real Supabase project:

- `src/test/supabaseMock.js` is a hand-built fake of the `supabase-js` calls the app makes
  (`.from()`, `.rpc()`, `.auth.*`, `.channel()`). It records each call with its arguments, so
  tests can check what was read, not just that something was.
- `src/test/fakeAdminServer.js` stands in for the admin search functions with the same rules as
  the SQL.
- `src/test/setup.js` mocks the native Capacitor plugins as "web, no biometry".
- Screen tests render with a fake `UserContext`; `UserProvider.test.jsx` runs the real provider
  against the fake client.

**Database tests** (`supabase/tests/*.test.sql`) check what the client can't: RLS, grants, and the
SECURITY DEFINER functions. Each seeds its own synthetic data and rolls back:

- `profile_writes.test.sql`: signed-in users (even the admin) can't write balances, roles, or
  links directly; the ledger function still works.
- `signup.test.sql`: `link_my_profile()` links only confirmed, password-less logins to unlinked
  customer records; the admin email and add-customer functions refuse bad input and non-admins.
- `admin_lists.test.sql`: search matching, filters, sorting, the 3-character minimum, wildcard
  escaping, and admin-only access.
- `assistant_tools.test.sql`: the assistant's functions are read-only and admin-only.

CI (`.github/workflows/test.yml`) runs lint, the unit tests, and the build, then runs
`supabase/tests/supabase_stub.sql` (Supabase's roles and `auth.uid()`), `schema.sql` twice (to
prove it re-runs), and every `.test.sql` on plain Postgres. You can also paste a test into the
Supabase SQL editor; it changes nothing.

There's no browser E2E suite yet; `TEST_IDS.md` lists the stable DOM IDs for one.

## Conventions

- Stable DOM IDs (`vh2o-<screen>-<section>-<element>[-token]`) are documented in `TEST_IDS.md`;
  changing one is a breaking change for tests.
- New code goes in the module for its role (`screens/`, `admin/`, `components/`, `lib/`), not
  back into `App.jsx`.
- Database security changes get a `.test.sql` test, not just a review.
- `main` is protected: changes go through pull requests, which get a Netlify Deploy Preview.
  Production is deployed manually.

## Documentation map

- [README](../README.md): what the app is, the architecture, and the key decisions.
- [ROADMAP.md](../ROADMAP.md): planned work, settled decisions, and the history of what shipped.
- [SUPABASE_SETUP.md](../SUPABASE_SETUP.md): database, auth, and email setup.
- [TEST_IDS.md](../TEST_IDS.md): stable selector IDs.
- [AGENTS.md](../AGENTS.md): conventions for AI coding agents working in this repo.
