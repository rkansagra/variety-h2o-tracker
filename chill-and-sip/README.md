# Variety H2O app

This repo contains the web/mobile app for Variety H2O, built with React, Vite, and Capacitor.

The active product code lives under `chill-and-sip/`.

## What the app does

- Customer-facing tracker and account status
- Admin dashboard for managing customer gallons and transactions
- Menu and location information
- Claim-code flow for imported or legacy customers to create their own login
- Supabase-backed transaction history and auth
- Native mobile wrappers for Android and iOS via Capacitor

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
- `android/` and `ios/` — native Capacitor wrapper projects
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
```

## Product conventions

- App entry is `src/main.jsx`
- Business logic is concentrated in `src/App.jsx`
- Stable DOM IDs are documented in `TEST_IDS.md`
- Native build logic belongs in `android/` and `ios/` and should not be hand-edited unless using Capacitor sync/build steps
- The app is designed around React state, with Supabase as the persistent backend

## Documentation map

- `SUPABASE_SETUP.md` — required auth and database setup for a developer environment
- `TEST_IDS.md` — stable selector IDs used by automation and QA
- `PUSH_NOTIFICATIONS_GUIDE.md` and `SCALING_AND_DATABASE_GUIDE.md` were historical/partial drafts and were removed because they were stale or speculative rather than current project guidance

## When to read what

- Need to understand the app flow? Start with `src/App.jsx`
- Need to set up local environment? Read `SUPABASE_SETUP.md`
- Need to target UI selectors in automation? Read `TEST_IDS.md`
- Need to build or lint? Use the package scripts above
