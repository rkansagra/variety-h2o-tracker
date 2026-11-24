# AGENTS.md

## Scope and repo layout
- The app lives at the repo root (React + Vite + Capacitor mobile shells). It is the only app in
  this repo.
- Planned work, priorities, and settled product decisions live in `ROADMAP.md` -- check it before
  proposing features, and update it when an item ships. Private working notes (owner decisions,
  live-system state) go in `TODO.local.md`, which is git-ignored and never published; this repo
  is mirrored publicly as a portfolio piece, so keep anything private out of tracked files.
- Treat `android/` as the Capacitor native wrapper around the web app. There is no
  native iOS project: iOS ships as an installable PWA (not the App Store), so don't add iOS-only
  native work. If that ever changes, recreate it with `npx cap add ios`.

## Big-picture architecture
- App entry is `src/main.jsx`; it mounts `RewardsApp` from `src/App.jsx`,
  which holds only the providers and routes.
- `main.jsx` locks portrait only on phone-sized native screens (shortest side < 600dp) via
  `@capacitor/screen-orientation`, unlocks on tablets, and re-applies on app foreground
  (`CapacitorApp.addListener('appStateChange', ...)`).
- Layout size classes come from `useSizeClass()` in `src/lib/ui.js` (phone: < 600px wide or < 500px
  tall; tablet: 600-1023px; desktop: >= 1024px), mirrored onto `<html data-size>` for the CSS in
  `src/index.css`. Desktop swaps the logo banner and bottom tab bar for a top bar. Decide layout by
  window size, never by user-agent sniffing.
- Code is split by role under `src/`: `screens/` (one per route, plus `screens/tabs/`
  for MainApp's four tabs), `admin/`, `components/`, `menu/` (menu data), and `lib/` (pure helpers
  and hooks, no Supabase calls). New code goes in the module for its role, not back into `App.jsx`.
- The admin-only "Ask the ledger" assistant is the one server-side piece: a Supabase Edge Function
  (`supabase/functions/admin-assistant/`) that lets Claude call only the read-only
  `assistant_*` Postgres functions. Keep it read-only: never give it a tool that writes, raw SQL, or
  the service-role key. Setup is in `SUPABASE_SETUP.md`.
- `UserProvider.jsx` owns auth/session state, the signed-in user's own profile, and transaction
  notifications, and is the only place that reads or writes app data in Supabase (screens may
  still check the auth session). Components read it with
  `useUser()` from `userContext.js`.
- Routing is minimal (`/`, `/login`, `/forgot-password`, `/no-account`) with `react-router-dom`; in-app navigation is tab
  state (`activeTab` in `screens/MainApp.jsx`) not route-based. State that must survive switching
  tabs (e.g. the admin's customer search) lives in `MainApp`, since a tab unmounts when you leave it.

## Data flow and state model
- Supabase (Postgres + Auth + RLS) is the single source of truth. There is no `localStorage`
  fallback for customers, balances, or transactions -- if Supabase is unreachable, the app shows no
  data rather than risking stale or fabricated numbers.
- `refreshFromSupabase` loads only the signed-in user's own profile and their 5 latest
  transactions. The admin's customer list comes from server-side search (`admin_search_customers`,
  `admin_get_customer`, `admin_customer_summary` via `searchCustomers()` and friends), so no
  browser ever holds every customer; filtering and sorting happen in the database.
- Balance changes never happen ad hoc in the client. `adjustGallons(...)` calls the
  `admin_adjust_gallons(target_profile_id, delta, note)` Postgres RPC, which is `SECURITY DEFINER`,
  admin-only (checked server-side, not just via RLS), atomic (locks the row, so concurrent actions
  can't race or leave a balance change without a matching transaction), and rejects any debit that
  would take a balance below zero.
- Transaction rows live in `gallon_transactions`. The customer's own tracker tab shows the 5 most
  recent; admin can pull a customer's full history via a separate view/RPC.
- Customers sign in with an emailed 6-digit code (or Google on the web); staff use email +
  password (no MFA: several owners share the admin login across devices). Staff add customer
  records with a required email (`admin_add_customer`) and fill in imported customers' emails
  (`admin_set_customer_email`); on first sign-in `link_my_profile()` links the login to the record
  with that confirmed email (never a login that has a password). The browser never writes
  `auth_user_id`. No match → `/no-account` ("ask staff").
- See `SUPABASE_SETUP.md` and `supabase/schema.sql` for the full
  schema, RLS policies, and function definitions -- treat `schema.sql` as the canonical,
  idempotent, from-scratch-runnable source of truth for the database, kept in sync with every
  applied migration.

## Project-specific conventions
- Stable DOM IDs are required and documented in `TEST_IDS.md`; ID changes are test-breaking.
- ID format is `vh2o-<screen>-<section>-<element>[-token]`; use stable tokens (e.g., `user.id`, slugified item names).
- Styling pattern is inline style objects + a CSS string in `src/styles.js` (`styles` and `css`), plus size-class layout rules in `src/index.css`, not component CSS modules.
- Menu/category content is static config arrays in `src/menu/menuData.js` (`MENU_CATEGORIES`, `CATEGORY_SIZE_TIERS`), not API-driven. Treat prices as real business data -- don't change them without confirming against the actual source (e.g. a POS catalog export) first.
- ESLint enforces no unused vars except names matching `^[A-Z_]` (`eslint.config.js`).

## Build, run, and quality workflow
- Work from the repo root for app tasks.
- Core scripts (`package.json`): `npm run dev`, `npm run build`, `npm run lint`, `npm test`, `npm run preview`.
- PWA config is in `vite.config.js` via `vite-plugin-pwa` (standalone manifest, no orientation lock).
- Tests are Vitest + React Testing Library (`src/*.test.jsx`, config in
  `vitest.config.js`, shared mocks in `src/test/`). GitHub Actions
  (`.github/workflows/test.yml`) runs lint, tests, and build on every PR and push to `main`, plus
  the database tests (`supabase/tests/*.test.sql`, on plain Postgres). Database
  security (RLS, admin checks, grants) gets a `.test.sql` test, not just a review. Still
  sanity-check manual flows the tests don't cover (admin login, code sign-in and linking,
  gallons credit/debit, adding a customer, anything native-only).
- `main` is branch-protected -- changes go through a pull request, not a direct push. Netlify only
  auto-builds Deploy Preview builds for open PRs; production (`varietyh2o.com`) is deployed
  manually/deliberately, never automatically on push or merge (see `netlify.toml`'s `ignore` rule).

## Native integration and gotchas
- Capacitor config: `capacitor.config.json` (`webDir: dist`, app id `com.varietyh2o.app`).
- Android wrapper uses `applicationId "com.varietyh2o.app"` (`android/app/build.gradle`) (no orientation lock in the manifest -- see `main.jsx`).
  The application ID is permanent once uploaded to Google Play -- never change it.
- Plugin surface currently includes App, Screen Orientation, and Biometric Auth
  (`@aparajita/capacitor-biometric-auth`) (see `package.json`, `capacitor.build.gradle`).
- Do not hand-edit generated files such as `android/app/capacitor.build.gradle` or `android/app/src/main/assets/public/*`; regenerate through Capacitor build/sync flow.
