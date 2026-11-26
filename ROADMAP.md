# Roadmap

What's next for the Variety H2O app, the decisions already made (so they aren't re-argued), and
what has shipped. Item letters and numbers are stable: code comments cite them ("ROADMAP item E").

## Next, in order
Android 1.1 waits until H and F are done, so the Play app gets every change in one update.

### H. Membership card, and history customers can read
The customer number as a card with a QR code staff scan to open the account. History grouped by
day, showing the staff note.

### F. Counter-first admin screen
The most frequent task is find a customer, enter gallons, choose Filled or Bought. Make that the
admin's main screen: a large search/scan box, buttons for common jug sizes, and an undo window
instead of a confirmation sheet. The assistant moves to its own tab.

### Android 1.1
The Play app still bundles the 1.0 web app: balances and history work, but sign-in is
password-only and its admin "Register user" and claim-code buttons fail against today's database.
1.1 ships everything since (emailed-code sign-in, Add customer, server-side search, the menu
editor, the visual refresh, error reporting), with the reviewer sign-in details updated in Play.
Android builds happen locally (they need the Android SDK and the release key), so the build should
also tag error reports with the local git commit.

### 3. "Ask the ledger" assistant: eval suite
The assistant is live (2026-10-16): owners ask plain-language questions about customers,
balances, and visits, and get answers from the live data. Left: 20-30 realistic owner questions
with known answers against a seeded dataset, run in GitHub Actions, including cases that must be
refused (changing a balance, another customer's data, prompt injection through name fields).

**Rules it's built on, and keeps:**
- Runs in a Supabase Edge Function; the Anthropic API key lives only in its secrets.
- Claude calls a fixed set of read-only, parameterized Postgres functions (`assistant_*`, `STABLE`,
  `SECURITY INVOKER`, admin-only, tested in `assistant_tools.test.sql`). No raw SQL, no write path,
  no service-role key: the function uses the admin's own login.
- Admin only, checked server-side. Every answer shows which lookups ran, with what parameters.
- Logs carry tool names, tokens, and timing, never the question, arguments, or results.
- Definitions: a **visit** is one customer on one store-local day (Tucson) with a fill or purchase;
  **inactive** means no visit in 60 days, including never-visited (the admin screen uses the same
  rule). Lookups match number, name, or email; emails are never sent to the model.
- Out of scope: customer-facing chat, write actions, auto-sent messages. A possible follow-on:
  draft win-back messages for owners to review and send themselves.

## Later
- **Rewards program and in-app reminders**, shelved until the owners want one (intake
  questionnaire in `src/assets/`). In-app only: no SMS (A2P registration, per-message cost), no
  push. The tier badge stays hidden until then.
- **Owner/staff roles:** split owner powers (data deletion, prices, the assistant) from counter
  staff. One admin role covers it for now.
- **Square catalog sync** for menu prices.
- **Native crash reporting** in the Android app (`@sentry/capacitor`); JavaScript errors are
  already reported.

## Decided against
- **Apple Sign-In and a native iOS project:** iOS ships as an installable web app, not through the
  App Store, so neither is needed. Recreate with `npx cap add ios` if that changes.
- **Phone-number login / SMS:** tried and reverted (`ac7e935`); email codes instead.
- **Admin MFA** (PR #37): removed by the owners' choice.
- **Facebook login:** email codes and Google cover sign-in; Facebook needs a Meta developer app and
  possibly business verification.
- **Google sign-in inside the Android app:** Google blocks it in embedded webviews; it's web-only.
- **TanStack Query** (item B): one search list and one details panel didn't justify it.
- **CSS Modules, Tailwind, or a component library** (item I): shared style objects in
  `src/styles.js` are enough at this size; revisit if the screens multiply.

## Done

**At a glance (2026-09-11 to 2026-11-25):**
- **Result:** a family business's paper index-card prepaid-water ledger replaced by a secured,
  tested web app at varietyh2o.com and an Android app on Google Play.
- **Scale:** 163 commits and 52 pull requests; about 400 real customer records migrated; 198 app
  tests and 6 database test suites, run in CI on every PR.
- **Stack:** React + Vite + Capacitor (Android), Supabase (Postgres, Auth, Row Level Security,
  Realtime, Edge Functions), Netlify, Resend, Sentry, GitHub Actions, the Claude API.
- **How it was built:** with Claude Code working against live services through MCP servers
  (Supabase, Netlify, Sentry, WordPress.com) and browser automation. The owner kept every decision
  involving real money, customer data, or production.

The app started as a React + Vite + Capacitor scaffold (2026-04-08) with placeholder data and an
unsecured database.

### Architecture and design audit (2026-11-24 to 11-25)
A review asked how the app would be built from scratch, knowing what we know now. The money parts
stayed (one ledger function, column grants and RLS, `schema.sql` with SQL tests, a read-only
assistant); most of what changed above them dated from the starter template.
- **A. Starter leftovers removed** (PRs #39, #40): starter CSS, an unused notifications plugin, a
  login-linking step that could never work.
- **G. One way to sign up** (PR #41): customers sign in with an emailed 6-digit code (Google too, on
  the web). Staff add a customer with a required email; the first sign-in with that confirmed email
  links the login through a `SECURITY DEFINER` function, so the browser never chooses a record.
  Unknown emails are told to ask staff. Claim codes retired. Staff sign in with a password, so
  admin access never waits on an email. Codes are sent through Resend from `no-reply@varietyh2o.com`.
- **L. Content fixes** (PR #41): facts-only water descriptions the owners approved; the
  balance-based tier badge hidden.
- **B. Server-side admin search** (PR #41): `admin_search_customers` and friends, so no browser
  holds every customer; sign-in loads only the user's own record and 5 latest entries.
- **C. Data model** (PR #44): ledger entries have a `kind` (purchase, fill, correction, forfeit);
  mistakes are fixed with a linked correction, never an edit; `member_since` is a date.
- **D. Real URLs** (PRs #46, #47): every section has its own address, so back, reload, and links
  work; the admin's search text stays out of the URL. A failed history read no longer blocks
  sign-in.
- **E. Menu, prices, and hours in the database** (PR #48): the admin edits them at `/admin/menu`;
  every edit is logged in `menu_changes`; categories stay in code. Offline, the last loaded menu
  shows with its date.
- **I. Visual refresh** (PR #49): light by default, dark when the device is; one brand header;
  left-aligned, calmer type; every color a `--vh2o-*` token.
- **J. Error reporting** (PRs #50, #52, #53): Sentry, errors only, with nothing that identifies a
  customer (no user, IP, cookies, or console output; emails and URL queries scrubbed). A crash shows
  a reload screen. Production builds upload source maps without serving them, and each release is
  tied to its commit.
- **K. Showcase README** (PR #43): product-first README; developer detail in `docs/DEVELOPMENT.md`.

### Earlier phases
- **Secure backend and launch** (2026-09-11 to 09-14): closed an RLS hole that let customers edit
  their own balance; every balance change now goes through one atomic, admin-only function that
  writes a matching ledger entry. Migrated about 400 customers (balances credited in person as each
  paper card is retired). Real menu from the Square catalog. Moved varietyh2o.com from WordPress.com
  to Netlify, keeping the domain's email.
- **Delivery workflow and native groundwork** (09-17 to 09-18): manual production deploys with
  preview builds per PR, branch protection, Realtime balance updates, security advisories fixed,
  the test suite and CI, biometric unlock, the permanent Android app ID, and a Google Play
  organization account.
- **Android release build** (09-26 to 09-27): release signing, a privacy policy page, and a
  toolchain upgrade to Capacitor 8.
- **Google sign-in and a UX overhaul** (09-27 to 09-29): Google sign-in fixed end to end; an
  accessibility and readability pass (keyboard access, labels, contrast, 44px targets, focus-trapped
  dialogs); design tokens; layouts for tablet and desktop (PRs #18-#20).
- **Play submission and hardening** (10-01 to 10-15): brand icons, an account-deletion page and an
  admin "Delete personal data" action that keeps the ledger, `is_admin()` answering only for the
  caller, dependency upgrades, and `App.jsx` split into modules. Android 1.0 went live on Google
  Play (US).
- **Assistant and audit fixes** (10-16 to 11-24): the "Ask the ledger" assistant, Lighthouse fixes,
  admin writes limited to the ledger (`profile_writes.test.sql`), and the app moved to the repo
  root.

## Layout for tablet and desktop
Built in PRs #18-#20; applies to any new or reworked screen.
- Decided by the window's size (`useSizeClass()` in `src/lib/ui.js`, mirrored on
  `<html data-size>`), never by user agent.
- **Phone:** < 600px wide, or any window < ~500px tall. Edge-to-edge, bottom tab bar.
- **Tablet:** 600-1023px. Bottom tab bar, 2-column grids where useful.
- **Desktop:** >= 1024px. Top bar with the logo and tabs; content up to ~1200px (admin ~1400px).
- **Admin:** customer list and the selected customer side by side on desktop and tablet landscape,
  stacked otherwise; search over name, email, and customer number.
- Same data and features at every size; only the arrangement changes. Everything is left-aligned.
- The Android app locks portrait on phones only; the installed web app doesn't lock.
