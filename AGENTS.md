# AGENTS.md

## Scope and repo layout
- Primary product code is in `chill-and-sip/` (React + Vite + Capacitor mobile shells). It is the
  only app in this repo.
- Treat `chill-and-sip/android/` and `chill-and-sip/ios/` as Capacitor native wrappers around the
  web app.

## Big-picture architecture
- App entry is `chill-and-sip/src/main.jsx`; it mounts `RewardsApp` from `chill-and-sip/src/App.jsx`.
- `main.jsx` enforces portrait mode via `@capacitor/screen-orientation` and re-locks on app foreground (`CapacitorApp.addListener('appStateChange', ...)`).
- Almost all business/UI logic lives in one file: `chill-and-sip/src/App.jsx`.
- `UserProvider` (same file) owns auth/session state, the customer/profile list, and transaction
  notifications.
- Routing is minimal (`/`, `/login`, `/claim`) with `react-router-dom`; in-app navigation is tab
  state (`activeTab`) not route-based.

## Data flow and state model
- Supabase (Postgres + Auth + RLS) is the single source of truth. There is no `localStorage`
  fallback for customers, balances, or transactions -- if Supabase is unreachable, the app shows no
  data rather than risking stale or fabricated numbers.
- `refreshFromSupabase` loads customers/profiles; `UserProvider` holds that state for the app.
- Balance changes never happen ad hoc in the client. `adjustGallons(...)` calls the
  `admin_adjust_gallons(target_profile_id, delta, note)` Postgres RPC, which is `SECURITY DEFINER`,
  admin-only (checked server-side, not just via RLS), atomic (locks the row, so concurrent actions
  can't race or leave a balance change without a matching transaction), and rejects any debit that
  would take a balance below zero.
- Transaction rows live in `gallon_transactions`. The customer's own tracker tab shows the 5 most
  recent; admin can pull a customer's full history via a separate view/RPC.
- Imported/legacy customers (no email yet) get a one-time claim code (`admin_generate_claim_code`)
  so they can self-serve link a login via `claim_profile(...)` at `/claim`.
- See `chill-and-sip/SUPABASE_SETUP.md` and `chill-and-sip/supabase/schema.sql` for the full
  schema, RLS policies, and function definitions -- treat `schema.sql` as the canonical,
  idempotent, from-scratch-runnable source of truth for the database, kept in sync with every
  applied migration.

## Project-specific conventions
- Stable DOM IDs are required and documented in `chill-and-sip/TEST_IDS.md`; ID changes are test-breaking.
- ID format is `vh2o-<screen>-<section>-<element>[-token]`; use stable tokens (e.g., `user.id`, slugified item names).
- Styling pattern is inline style objects + a CSS string in `App.jsx` (`styles` and `css` constants), not component CSS modules.
- Menu/category content is static config arrays in `App.jsx` (`MENU_CATEGORIES`, `CATEGORY_SIZE_TIERS`), not API-driven. Treat prices as real business data -- don't change them without confirming against the actual source (e.g. a POS catalog export) first.
- ESLint enforces no unused vars except names matching `^[A-Z_]` (`chill-and-sip/eslint.config.js`).

## Build, run, and quality workflow
- Work from `chill-and-sip/` for app tasks.
- Core scripts (`chill-and-sip/package.json`): `npm run dev`, `npm run build`, `npm run lint`, `npm run preview`.
- PWA config is in `chill-and-sip/vite.config.js` via `vite-plugin-pwa` (standalone + portrait manifest).
- There is no automated test suite configured; practical validation is lint + manual flows (admin login, claim flow, gallons credit/debit, claim-code generation).
- `main` is branch-protected -- changes go through a pull request, not a direct push. Netlify only
  auto-builds Deploy Preview builds for open PRs; production (`varietyh2o.com`) is deployed
  manually/deliberately, never automatically on push or merge (see `netlify.toml`'s `ignore` rule).

## Native integration and gotchas
- Capacitor config: `chill-and-sip/capacitor.config.json` (`webDir: dist`, app id `org.example.varietyh2o`).
- Android wrapper uses `applicationId "org.example.chillandsip"` (`chill-and-sip/android/app/build.gradle`) and portrait lock in manifest.
- iOS also forces portrait in `chill-and-sip/ios/App/App/Info.plist`.
- Plugin surface currently includes App, Local Notifications, and Screen Orientation (see `package.json`, Podfile, `capacitor.build.gradle`).
- Do not hand-edit generated files such as `chill-and-sip/android/app/capacitor.build.gradle` or `chill-and-sip/ios/App/App/public/*`; regenerate through Capacitor build/sync flow.
