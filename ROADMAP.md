# Roadmap

Planned work for the Variety H2O app, in priority order. Each item records the decisions already
made and why, so they don't get re-litigated. Move items to **Done** (with the PR number) as they
ship; add new items in priority order.

## Architecture and design audit (2026-11-24)

A review of the whole app asked one question: knowing what we know now, how would it be built
from scratch, keeping Supabase and Netlify? The parts that hold money stay as they are: the ledger
function is the only way to change a balance, column grants and RLS back it up, `schema.sql`
plus SQL tests, and a read-only assistant. Most of what
would change sits above the database and goes back to the 2026-04 starter template (a
`localStorage` "rewards app" with a dark neon theme): how data is loaded, how identity works, the
vocabulary, and the look. Items are worked one PR at a time.

**Working order** (set 2026-11-24): A, G, L, B (all done and live), and K (done early, for
interviews); then C, D, E, I, J, H, F.
Sign-up went first because almost no customer had a login yet: of about 400 customer records,
only the Play reviewer's demo account was linked to one.

### A. Remove starter leftovers and dead code -- done (PRs #39, #40)
- Vite starter CSS still in `src/index.css`: a second `:root` palette (purple `--accent`), 56px
  `h1`, `#social`, `.counter`.
- `@capacitor/local-notifications` is installed but unused; it still ships in the Android build.
- `refreshFromSupabase` tries to link a login to a profile by matching email from the browser. The
  column grants and RLS now refuse that update, and the error is ignored, so it never works.
- The admin's own Home shows an avatar and a "Splash" tier badge meant for customers.

### G. One way to sign up: email codes, linked by the email on file -- live (PR #41)
Decided 2026-11-24. Built in PR #41 and live since 2026-11-24 (production deploy, database
migration, Resend SMTP, code templates, "Confirm email" on). Revised the same day: the email is
required when adding a customer, and staff sign in with a password only (see Decided against). Today there are three ways in: staff register a customer with a password staff
choose, claim codes, and (until PR #39) an email match that never worked. No real customer has
used any of them, so nothing needs migrating.
- **Customers sign in with an emailed 6-digit code** (Supabase email OTP). No passwords and no
  reset emails; the session stays on the device.
- **Google sign-in stays on the website**, still hidden in the Android app, where Google blocks it.
- **Linking:** staff save the customer's email on their record at the counter. When someone signs
  in with a code (or Google) for that email, a `SECURITY DEFINER` database function links the login
  to the unlinked record whose email matches the caller's *confirmed* auth email. The code proves
  they own the email; the browser never chooses which record to link.
- **Unknown email:** a screen asking them to see staff at the counter to add their email, with the
  store's hours. Customers can't create accounts themselves.
- **"Add customer"** replaces "Register new user": a name plus a required email, with the customer
  number assigned by a database sequence (this takes the `max + 1` fix from item C). It moves from
  Settings into the customer panel. Staff can add or correct the email on a record that has no
  login yet.
- **Claim codes are retired:** `/claim`, the Generate Claim Code button,
  `admin_generate_claim_code()`, `claim_profile()`, and the `claim_code` column go, and outstanding
  codes are cleared.
- **Staff keep a password** behind a "Staff sign-in" link, so admin access never depends on an
  email arriving. Google Play's reviewer account signs in the same way, since
  reviewers can't receive a code.
- **Onboarding** happens at the counter on each customer's next visit, the same way paper index
  cards are being retired.
- **Email delivery:** Supabase's built-in sender only emails the project's own team, so codes go
  through Resend's SMTP (free tier) from a `no-reply@varietyh2o.com` address, with SPF/DKIM DNS
  records. The domain's mailboxes (MX) are untouched. Auth's email rate limit is raised to fit, and
  "Confirm email" stays on.
- **Data integrity:** `profiles.auth_user_id` gets a foreign key to `auth.users` with
  `on delete set null`, so deleting a login unlinks its record instead of leaving it pointing at
  nothing (one live record was in that state and is unlinked as part of this).
- **Tests:** SQL tests for the link function (confirmed email only, unlinked records only, one
  record per login, never an admin record), and Vitest for code sign-in and the unknown-email
  screen.

### L. Content fixes the owners approved -- live (PR #41)
Decided 2026-11-24 and live since that day's deploy. The badge and the balance-based tier code are
removed (a rewards program would redesign tiers anyway). The owners approved facts-only wording
for both Alkaline Water and Remineralized Water, which made a softer nutrition claim.
- Hide the reward-tier badge until there's a rewards program (see Later). It's based on the
  current balance, so it drops every time a customer fills up, and it unlocks nothing.
- The Alkaline Water description sticks to facts (what it is and how it's made) with no
  health-benefit claims.

### B. Load admin data from the server, one customer at a time -- live (PR #41)
Built in PR #41, live since 2026-11-24: `admin_search_customers`, `admin_get_customer`, and `admin_customer_summary`
(admin-only, read-only, tested in `admin_lists.test.sql`); sign-in loads only the user's own
record and 5 latest transactions; admin edits re-fetch only what's on screen. TanStack Query was
left out: one search list and one details panel didn't justify a new dependency.

Today every sign-in, and every admin action, downloads every customer profile plus the 500 most
recent transactions, then filters in the browser. The 3+ character search gate only hides the
list. Instead: an `admin_search_customers(q)` database function, fetch one customer when it's
selected, and update the screen from what each write returns. A query library (TanStack Query)
handles caching; `UserProvider` keeps only auth.

### C. Data model fixes
- `member_since` becomes a `date`. It's text from `toLocaleDateString()`, so its format depends on
  whose browser wrote it.
- Ledger entries get a `kind` (purchase, fill, correction, forfeit) instead of reading the sign of
  `amount`, so the forfeit row and corrections stop being special cases.
- (Customer numbers from a database sequence moved into item G.)

### D. Real URLs instead of tab state
`/menu`, `/menu/:category`, `/location`, `/account`, `/admin/customers/:id`. This fixes Android's
back button exiting the app, keeps your place on refresh, and makes the menu linkable from
Facebook and search. Admin becomes its own area instead of replacing the customer's Home tab.

### E. Menu, prices, and hours in the database
Decided 2026-11-24: admins edit them in the app. Prices, hours, and the address live in JS today,
so every change needs a developer, a PR, and a deploy. Move them to public-read tables
(`menu_items`, `store_info`) with an admin editing screen. Syncing from the Square catalog is under
Later.

### I. Visual refresh
Decided 2026-11-24: a light theme by default that switches to dark when the phone is in dark mode.
Also one brand header (the login screen still uses emoji and text instead of the logo), one icon
family, a calmer type scale, and left-aligned content. Under it: CSS Modules or Tailwind on the
existing `--vh2o-*` tokens, and about six shared components (Button, Card, Field, Sheet, Pill,
ListRow) to replace hand-styled inline buttons. Clickable prototype first, as with the
tablet/desktop layouts.

### J. Error reporting
Decided 2026-11-24: Sentry's free tier for the website and the Android app. Reports carry no
customer names or emails.

### H. Membership card, and history customers can read
Show the customer number as a card with a QR code that staff scan to open the account. History
groups entries by day and shows the staff note.

### K. Showcase README -- done (PR #43)
The public mirror's README is the first thing a reviewer reads, so it's now about the product and
the design decisions: what problem it solves, a Mermaid architecture diagram, screenshots per size
class (made-up data, captured against a mocked Supabase), how the ledger stays tamper-proof, how
sign-up linking and the assistant stay safe, and how it's tested. The developer detail moved to
`docs/DEVELOPMENT.md`. Retake the screenshots after the visual refresh (item I).

### F. Counter-first admin screen
The most frequent task is find a customer, enter gallons, choose Filled or Bought. Make that the
admin's main screen: a large search/scan box, buttons for common jug sizes, and an undo window
instead of a confirmation sheet. The assistant moves to its own tab. (An owner/staff role split was
considered and isn't needed for now; see Later.)

## Next up

Former items 1 (reward reminders) and 2 (Facebook login) moved to Later and Decided against. The
assistant keeps its number because code comments refer to "ROADMAP item 3".

### 3. "Ask the ledger" assistant (admin only)
Owners type plain-language questions about customers, balances, and visits (e.g. "Who hasn't come
in for 60 days?", "How much prepaid balance is outstanding?", "What were last week's busiest
days?") and get answers grounded in the live data. **Live** (2026-10-16): the database functions,
the `admin-assistant` Edge Function, and the API key are in production, and it was tried on a
Deploy Preview. The admin panel has been on varietyh2o.com since the 2026-11-24 deploy. Still to
do: the eval suite.

**Architecture constraints:**
- Runs in a Supabase Edge Function. The Anthropic API key lives only in Edge Function secrets,
  never in the client bundle.
- Claude uses tool calling against a small, fixed set of **read-only, parameterized** Postgres
  functions. The model never generates or runs raw SQL.
- No tool may call or reach `admin_adjust_gallons()` or any other write path. Read-only functions
  run with the least privilege needed (consider a dedicated read-only role and/or
  `SECURITY INVOKER`) -- verify this explicitly, not just by convention.
- Admin only: gated behind existing auth + RLS, not visible or callable by customer accounts. The
  Edge Function checks the caller's admin status server-side (`is_admin()`).
- Every answer shows which tool(s) were called and with what parameters, so owners can see where
  the numbers came from.

**Subtasks:**
1. ~~Read-only tool set as Postgres functions, with tests.~~ Built: `assistant_balance_summary`,
   `assistant_customers_inactive_since`, `assistant_visits_by_day`, `assistant_top_customers`,
   `assistant_customer_lookup`, `assistant_customer_history` (`schema.sql`). They're `STABLE`
   (Postgres refuses writes inside them) and `SECURITY INVOKER`, and refuse non-admins.
   `supabase/tests/assistant_tools.test.sql` checks all of that in CI.
2. ~~Edge Function~~ Built (`supabase/functions/admin-assistant/`): admin check, tool-use loop with
   an allowlist, argument validation, a 6-step cap, a 60-second timeout, and error handling. It
   uses the admin's own login over read-only GET calls, never the service-role key.
3. ~~Admin UI~~ Built: an "Ask the ledger" panel above the customer list, with example questions,
   follow-ups, and a "Lookups used" disclosure under each answer.
4. Eval suite: 20-30 realistic owner questions with known correct answers against a seeded test
   dataset, run in GitHub Actions alongside the Vitest suite. Include adversarial cases that must
   be refused or handled safely: requests to change a balance, oddly framed requests for another
   customer's data, and prompt injection via customer name fields.
5. ~~Logging~~ Built: one JSON line per request in the function logs (tool names, iterations,
   tokens, latency, outcome), with no question text, arguments, or results.
6. ~~Unit/integration tests~~ Built: Vitest for the loop, UI, and provider; SQL tests for the tools.
7. ~~Go live~~ Done 2026-10-16: `ANTHROPIC_API_KEY` set as an Edge Function secret, the
   `schema.sql` tools applied as migration `add_admin_assistant_tools`, the function deployed with
   JWT verification on, and tried on a Deploy Preview.

**Decisions made while building** (confirmed 2026-11-24):
- A **visit** is one customer on one store-local day (Tucson, `America/Phoenix`) with at least one
  ledger entry, a fill or a purchase. The forfeit written when an account is deleted doesn't count.
- **Customer lookup** matches the customer number, or part of a name or email (no phone column).
  Emails are never sent to the model.
- **Inactive** means no visit in the last 60 days, and includes customers who have never visited
  (decided 2026-10-16). The admin screen's Active/Inactive status now uses the same rule: the
  window went from 31 to 60 days, and a balance alone no longer makes a customer active. Most of the 400
  imported customers have no ledger history yet, so lists put customers who have visited first
  (longest-absent first), and answers say how many have never visited.

**Before implementing:** verify current Anthropic SDK / model names and Supabase Edge Function
conventions against the docs.

**Out of scope for now:** customer-facing chat, any write actions, and auto-sending messages.

**Possible follow-on (separate item):** draft win-back messages for lapsed customers for owners to
review and send manually -- never auto-sent.

## Later
- **Rewards program and in-app reward reminders** (former item 1), shelved 2026-11-24 until the
  owners want a rewards program. The intake questionnaire is ready
  (`src/assets/rewards-program-intake-questionnaire.md`). In-app only: **no SMS** (avoids Twilio
  A2P 10DLC registration and per-message cost) and **no Firebase/FCM push**. The tier badge stays
  hidden until then (item L).
- **Owner/staff roles:** separate owner powers (data deletion, prices, the assistant) from counter
  staff (ledger entries and lookups). Not needed for now (2026-11-24); one admin role covers it.
- **Square catalog sync** for menu prices, after item E.

## Open operational tasks
- **Android 1.1** (`versionCode 4`): the Play app still bundles the 1.0 (pre-PR #41) web app.
  Customer balances and history work, but its sign-in is password-only (no emailed codes), and its
  admin "Register user" and claim-code buttons now fail against the database. 1.1 ships emailed-code
  sign-in, Add customer, server-side admin search, and the plugin removal from PR #39. Update Play's
  reviewer sign-in details with it.

## Decided against
- **Apple Sign-In:** only required by App Store Review Guideline 4.8, and iOS ships as an
  installable PWA, not through the App Store (no $99/yr Apple Developer Program). Revisit only if
  App Store distribution becomes a goal.
- **Native iOS project:** removed for the same reason (PR #7); recreate with `npx cap add ios` if
  ever needed.
- **Phone-number login / SMS:** tried and reverted (`ac7e935`). Email stays primary (codes, per
  item G).
- **Admin MFA** (PR #37), removed 2026-11-24 by the owners' choice: several owners share the one
  admin login across their own devices, and a single authenticator app didn't fit. Sharing one
  authenticator secret across devices, or one admin login per owner, were offered and declined.
  Admin access is the password alone; the trade-off is that a leaked admin password gives full
  access, so it lives in a password manager.
- **Facebook login** (former item 2), dropped 2026-11-24: email codes and Google cover sign-in,
  and Facebook needs a Meta developer app, data-deletion setup, and possibly business
  verification.
- **Google sign-in inside the Android app:** Google blocks OAuth in embedded webviews; the button
  is web-only. Native Google sign-in would need a system-browser/deep-link flow.

## Done

Everything since AI-assisted development began on 2026-09-11 (Claude Code), oldest first. Each entry
cites its commit or PR; setup done in outside dashboards (Supabase, Netlify, Google Cloud, Google
Play, WordPress.com) is noted where it happened.

**At a glance (2026-09-11 to 2026-09-29):**
- **Result:** a family business's paper index-card prepaid-water ledger replaced by a secured,
  tested web app live at varietyh2o.com, plus a signed Android release built for Google Play.
- **Scale:** 51 commits and 21 pull requests; about 399 real customer accounts migrated; automated
  tests grown from 0 to 83 across 8 files, run in CI on every PR.
- **Stack:** React + Vite + Capacitor (Android), Supabase (Postgres, Auth, Row Level Security,
  Realtime), Netlify, GitHub Actions.
- **AI tooling:** Claude Code working directly against live services through MCP servers
  (Supabase, Netlify, WordPress.com) and browser automation (Claude in Chrome for the Google Cloud
  and Supabase consoles), plus the GitHub CLI and the ui-ux-pro-max design plugin. The owner kept
  every decision involving real money, customer data, or production.

**Starting point:** a React + Vite + Capacitor scaffold committed on 2026-04-08 (`05dcaf8`,
`4003428`), with placeholder menu data and an unsecured database.

### Phase 1 -- Secure backend, real data, public launch (2026-09-11 to 09-14)
- **Closed a real security hole and made balances tamper-proof** (`ae5e71a`). The original Row
  Level Security policy let any signed-in customer edit their own row, gallon balance included. All
  balance changes now go through one admin-only, atomic Postgres function,
  `admin_adjust_gallons()`. It locks the row, refuses to go below zero, and always writes a
  matching ledger entry. Anonymous access was revoked, and `schema.sql` became the canonical,
  re-runnable database definition. A corrupted line was found and fixed after checking the live
  function against it.
- **Admin and customer features** (`ae5e71a`): custom credit/debit amounts with notes and a
  confirmation step, full transaction history, water type per customer, an active/inactive status
  computed live from the data, and self-serve account claiming with one-time codes.
- **Migrated about 399 real customers** from the shop's export (`existing_prepaid.csv`). Every
  data decision was confirmed with the owner first:
  - balances start at 0 and are credited in person as each physical index card is retired,
  - names are kept exactly as recorded,
  - customer and catalog CSVs are gitignored and never committed.
- **Admin search gated to 3+ characters** (`fff20e1`), so about 400 customers don't load at once
  and names and balances aren't on show at the counter.
- **Hosting and launch:**
  - Chose Netlify over Vercel, whose Hobby plan forbids commercial use.
  - Deployed the app and cut varietyh2o.com over from its old WordPress.com site through DNS,
    leaving the domain's email (MX) records untouched.
  - Brought the old site's content (tagline, welcome text, Order Online and Facebook links) into
    the app (`fff20e1`).
  - Pinned Node 22 for builds (`bf2f6e7`), fixed the browser-tab title and meta description
    (`6bf03ca`), and kept native folders out of web uploads (`c9649bf`).
- **Real menu and prices** (`eb168b0`, `11af666`):
  - every price rebuilt from the shop's Square POS catalog export, with 9 new product sections,
  - flavors that share a price shown once as size/price pills instead of repeated on every row,
  - a discontinued section retired.
- **Starter clutter removed:** scaffolding and stale documents (`096def9`, `f0bc170`).

### Phase 2 -- Delivery workflow, auth, and native groundwork (2026-09-17 to 09-18)
- **Stopped runaway hosting costs and set up a review workflow.** Every push to `main` triggered a
  production build at 15 build credits each. Production is now deployed manually (`fa69707`), while
  Deploy Previews still build for every PR so changes can be reviewed on a real URL (`b2de2e9`).
  `main` is branch-protected, and all changes go through PRs (#1-#3).
- **Clearer admin wording** (PR #3): the buttons became "Bought Today" / "Filled Today", with
  matching ledger wording and color-coded history.
- **Tried phone-number login, then reverted it** (PR #4, `ac7e935`). It broke admin login in
  production because the Supabase phone provider and SMS setup were never completed. Outcome: email
  and password stay, and reminders will be in-app rather than SMS, which avoids SMS registration
  and per-message costs.
- **Live updates** (`9693452`): a customer's open app now updates its balance and history instantly
  through Supabase Realtime when an admin makes a change. Dead notification code that fired on the
  admin's own device was removed.
- **Deploys fixed at the root:** command-line Netlify deploys had been failing silently because the
  local Node version was too old for the Netlify CLI. After the Node 20 → 22 upgrade, emergency
  deploys no longer need the build-skip rule toggled off and on.
- **Security advisories resolved** (`0d7daca`):
  - dropped the unused `pg_graphql` extension, which exposed table structure through GraphQL,
  - locked down an exposed database function (`rls_auto_enable`),
  - deleted an orphaned Edge Function left over from the phone-login attempt.
- **Google sign-in, app side** (`04a0eec`).
- **iOS without the App Store** (`0cf9077`): Apple Sign-In was evaluated and deliberately skipped,
  because iOS ships as an installable web app with no $99/yr Apple Developer membership. The
  install icons, which had been missing (404), were fixed, and iOS home-screen tags added.
- **Automated test suite** (`9279da8`): Vitest and React Testing Library with a hand-built fake
  Supabase client, so tests never touch real data. It started at 30 tests, and GitHub Actions runs
  lint, tests, and build on every PR.
- **Biometric unlock for the Android app** (`5536a0d`): Face or fingerprint unlock layered over
  the existing session, opt-in per user.
- **Android groundwork:**
  - renamed the app ID from placeholders to the permanent `com.varietyh2o.app` before the first
    upload (`33e37ea`),
  - modernized the build tooling (`a9f09ce`).
- **Google Play:** registered an Organization developer account using the business's D-U-N-S
  number. This skips the closed-testing requirement for new personal accounts (12 testers for 14
  days) and allows a direct production release.

### Phase 3 -- Android release build (2026-09-26 to 09-27)
- **Release signing** (`8107a10`): a release keystore (valid to 2054) and a signing config.
  Signed `.aab` release bundles build and have been verified. The keystore stays off git and must
  be backed up, because it's the only key that can ever sign updates.
- **Privacy policy** (`a566b8d`): a page at `/privacy/` plus in-app links, which Google Play
  requires.
- **Toolchain upgrade** (PR #5): AGP 9.4.1, Gradle 9.8.0, and Capacitor 8, taken before launch
  rather than weeks after it.

### Phase 4 -- Cleanup, Google sign-in go-live, and UX overhaul (2026-09-27 to 09-29)
- **Repo cleanup** (PR #7):
  - removed IntelliJ/Maven leftovers and unused starter assets,
  - moved about 5 MB of logo design masters out of the repo,
  - removed the unused native iOS project.

  Also fixed the two lint errors that blocked CI (PR #6) and set up the GitHub CLI so PRs are
  opened and merged from the terminal.
- **Google sign-in made to work end to end.** This was configured partly by driving the Google Cloud
  and Supabase consoles directly in Chrome:
  - The OAuth app was stuck in "Testing" with 0 test users, so Google refused every sign-in. Its
    branding was completed and the app published.
  - Supabase's Site URL was still `http://localhost:3000`, which sent every account-confirmation
    email to a dead link. It was fixed, and the allowed redirect list set up.
  - PR #8 hides the Google button inside the Android app, where Google blocks it, and sends every
    auth email back to `/login`.
- **Deploy Previews fixed:** they had been rendering a blank page because the Supabase key was set
  for production builds only. It's now set for all deploy contexts.
- **Project docs:** `AGENTS.md` corrected (PR #9), and this `ROADMAP.md` created (PR #10) so
  priorities and settled decisions live with the code.
- **Edge-to-edge phone layout** (PR #11): no frame/padding/rounded corners under 600px wide, full
  screen height, notch/home-indicator safe-area padding (`viewport-fit=cover`); frame styles moved
  to `.vh2o-root`/`.vh2o-phone` in `src/index.css`. Also removed the Vite starter's `#root` edge
  borders and white page background, and fixed login/claim inputs overflowing their screen.
- **Password reset** (PR #12): moved behind a "Forgot password?" link to its own `/forgot-password`
  page. Step 2 (choosing the new password) still happens on `/login` after the email link.
- **UI/UX quality pass** (the ui-ux-pro-max audit of every screen, in six PRs):
  - **Accessibility** (PR #13):
    - keyboard-operable nav tabs and cards (`buttonProps()`: `role="button"`, focusable,
      Enter/Space),
    - `aria-current` on the active tab and a `<nav>` landmark,
    - pop-up sheets marked as dialogs,
    - accessible names on all 18 form fields,
    - decorative emoji hidden from screen readers,
    - a visible `:focus-visible` outline (inputs had `outline: none`),
    - `prefers-reduced-motion` support.
  - **Readability** (PR #14):
    - the secondary gray `#64748b` and nav-label `#475569` replaced with `#8a99ae` (at least 5:1
      on every surface, up from 3.75:1 and 2.4:1),
    - all text 12px or larger (22 sizes of 9-11px),
    - a global 44x44px minimum tap target on buttons, inputs, selects, and `role="button"`,
    - Nunito loaded from `index.html`, so login, forgot-password, and claim use it too.
  - **Structural icons** (PR #15): nav tabs, location/contact cards, map/call sheet options,
    screen-title icons, credit/debit markers, back/expand chevrons, and external-link arrows are
    Lucide SVGs (`lucide-react`, sizes in `ICON_SIZE`). Menu-category and reward-tier emoji, the
    avatar, and the login-title flourish were deliberately kept as illustrative content.
  - **Labels, dialogs, avatar, tier badges** (PR #17):
    - a visible `<label>` above all 18 form fields, with redundant placeholders removed,
    - the four bottom sheets use `useDialog()`: focus moves in, Tab stays inside, Escape closes,
      and focus returns to the opener,
    - the tracker avatar shows the customer's initials,
    - reward-tier badges use Lucide icons (Droplet, Snowflake, MountainSnow, Wind).

    Menu category emoji and the login-title flourish are kept as illustrations.
  - **Design tokens everywhere** (PR #21):
    - 139 inline style values in `App.jsx` now reference `--vh2o-*` tokens (3 new: surface-subtle,
      border-strong, scrim; plus header/avatar gradients),
    - deliberate raw-hex exceptions are documented at the top of `src/index.css`,
    - verified no visual change: computed colors, backgrounds, borders, shadows, and outlines of
      every element matched before/after on 12 phone/desktop screen states.
- **Claim codes for first-time Google users** (PR #16): an unlinked signed-in login is no longer
  signed out; `unlinkedAuthEmail` + `UnlinkedSessionRedirect` send it to `/claim`, which asks only
  for the customer ID + claim code. No database change -- the live `claim_profile()` already
  accepted any session.
- **Tablet and desktop layouts.** These started with a structured requirements Q&A (16 decisions)
  and a clickable prototype
  (https://claude.ai/artifact/TYdGEWUiUwsb2ZjEpFxwBe) reviewed before any code; the decisions are
  in the Reference section below. The build then took three PRs:
  - **Layout foundation** (PR #18):
    - `useSizeClass()` + `<html data-size>`,
    - the framed "phone" box is gone at every size,
    - tablet/desktop show main-app content in a centered column and sign-in screens as a centered
      card,
    - desktop gets a top bar (logo, tabs, account) instead of the banner and bottom tab bar,
    - `--vh2o-*` design tokens in `src/index.css`,
    - rotation: Android locks portrait on phone-sized screens only (manifest lock removed), and the
      web app manifest has no lock.
  - **Admin customers view** (PR #19):
    - search by name, email, or ID; nothing is listed until 3+ characters are typed,
    - filters (All / Active / Inactive / No login yet) and sort (name or gallons) via
      `filterCustomers()`,
    - the selected customer's details sit beside the list on desktop and below it on tablet
      portrait; phone shows list, then details, with "All customers" to go back,
    - the admin view widens to 1400px on desktop.
  - **Customer screens per size class** (PR #20):
    - home profile card centered on tablet, and beside the history on desktop (card top level with
      the first transaction),
    - menu grid of 2/3/4 columns by size, with items in 2 columns, and a category list beside the
      items on desktop (list level with the first item),
    - location cards in 1/2/3 columns, with the address spanning two,
    - settings in a centered 560px column,
    - desktop content 1200px wide.

### Phase 5 -- Menu artwork and production catch-up (2026-10-01 to 10-13)
- **Image icons for menu categories** (PR #23): a category can set an optional `iconSrc` (an
  imported image), shown by `CategoryIcon` in `App.jsx` and sized in `em` so it matches the emoji at
  every spot (category grid, desktop category list, section titles, item rows); the `icon` emoji
  stays as the fallback. Bottles & Jugs is the first, with a 128x128 PNG (`src/assets/bottles.png`,
  6 KB; the source was a 95 KB 512x512 WebP saved as `.png`). The other categories keep their
  emoji.
- **Release keystore backed up** (2026-10-03): `release-key.jks` + `keystore.properties` copied to
  the company Google Drive.
- **Production caught up** (2026-10-13): after a pause for Netlify build credits (out 2026-10-03,
  renewed 2026-10-13), varietyh2o.com was deployed from `main` at `6edb25c`, shipping PRs #8 and
  #11-#24.
- **Account deletion page** (PR #26, deployed 2026-10-15): `/delete-account/` is the Play Data
  safety "Delete account URL". Deletion within 30 days; transaction records kept 3 years, unlinked
  from the customer. Deleting a profile row cascades to its transactions, so honor requests by
  clearing the profile's name/email and auth user rather than deleting the row.
- **Claim flow fix** (PR #27, deployed 2026-10-15): with email confirmation on, `/claim` failed
  with "permission denied for function claim_profile"; it now asks the customer to open the
  confirmation link first.
- **Brand icons** (PR #28, deployed 2026-10-15): the Vite/Capacitor placeholder icons and splash
  were replaced with the "H2O + cone" mark from the logo, on white. Sources are in
  `assets/`; the Android launcher icons and splash are generated from them with
  `npx @capacitor/assets generate --android` (never hand-edited).
- **Google Play submission** (PR #29, submitted 2026-10-15):
  - Android 1.0 was sent to the production track, US only, and goes live when Google approves it.
  - It's `versionCode 3`, because codes 1 and 2 were used by earlier uploads that never shipped,
    and Play never accepts a code twice. Users only see "1.0".
  - Store listing: description, logo feature graphic, app icon, and phone screenshots.
  - Declarations: Data safety (name, email, user IDs, and purchase history collected; nothing
    shared), target audience 13+, and no advertising ID.
  - A demo customer account for Google's reviewers.
- **Security hardening and admin tests** (PR #30):
  - `is_admin(uid)` now answers only for the caller. Before, any signed-in customer could ask
    whether *any* account was an admin. Item 3 relies on it.
  - Account-deletion requests are handled in the admin customer card ("Delete personal data…",
    confirmed by typing the customer ID). This calls a new admin-only
    `admin_anonymize_customer()`, which:
    - clears the name, email, claim code, and water type, and deletes the login;
    - forfeits any remaining balance with a matching ledger entry, as `/delete-account/` says;
    - keeps the row and its transactions, because deleting a profile cascades to its
      transactions, which are kept for 3 years. `anonymized_at` starts that clock.
  - An anonymized customer can't be given a new claim code.
  - New tests cover admin credit/debit with the confirmation step, claim-code generation, data
    deletion, and the signed-out claim flow, against the fake Supabase client (89 → 109 tests).
- **Google sign-in fix** (PR #31): Google returns to `/login`, and a customer whose login was
  already linked stayed on the login form, so Google sign-in looked like it did nothing. The login
  page now goes on to the app once someone is signed in (except mid password reset).
- **Dependency updates:**
  - Patch/minor: Capacitor 8.5.3 and plugins, `@supabase/supabase-js` 2.118, React 19.3.1, and
    others. Capacitor's native side only reaches phones with the next Play upload.
  - Major: Vite 8, `vite-plugin-pwa` 2, ESLint 10. `@vitejs/plugin-react` is at 5.2, not 6: 6
    pulls in Babel 8, which conflicts with the PWA tooling's Babel 7. Retry once workbox moves to
    Babel 8.
  - Remaining `npm audit` findings (3 moderate) are in iOS build tooling (`@capacitor/cli` ->
    `xcode` -> `uuid`), which isn't shipped.
- **Bottom tab bar pinned:** it sat after the page content, so on any screen taller than the phone
  it scrolled out of view. It's now sticky at the bottom, and the app frame uses `overflow: clip`
  instead of `hidden`, which had made the frame its own scroll container and stopped sticky from
  working.
- **Play screenshots retaken** at 1080x1920 (Home, Menu, Ice Cream, Location), replacing the
  500x829 set. Play needs at least 1080px per side for promotion eligibility.
- **Supabase advisor warnings reviewed:** the "signed-in users can execute SECURITY DEFINER
  function" warnings are expected. Customers and admins call those functions, each checks
  permissions itself, and `is_admin` now only answers about the caller. Leaked password protection
  needs the Supabase Pro plan.
- **`App.jsx` split into modules:** the ~3,400-line file is now one module per role: screens, the
  four tabs, the admin panel, menu data, `UserProvider`, styles, and pure helpers in `src/lib/`.
  This is a deliberate change of convention; AGENTS.md describes the new layout. The code moved
  verbatim, so DOM IDs and tests are unchanged. Two small differences: the admin's register-a-
  customer form and an expanded menu item's description now reset when you leave their tab.

### Phase 6 -- Assistant UI, security audit fixes, repo layout (2026-10-16 to 11-24)
- **Assistant UI and the 60-day rule** (PR #34): the "Ask the ledger" panel, and Active/Inactive
  now counts visits only, over 60 days.
- **Lighthouse fixes** (PR #35): the logo shrank from 4439px to 1080px wide (145 KB to 39 KB) with
  fixed dimensions so the page stops jumping, no database reads while signed out, a real
  `robots.txt`, and a theme-color tag.
- **Balances change only through the ledger** (PR #36): the admin's RLS update policy covered
  every column, so an admin session could set `gallons` directly with no ledger row. Signed-in
  users can now update only `water_type`; `profile_writes.test.sql` proves it.
- **Admin MFA** (PR #37): `is_admin()` required an authenticator-verified (`aal2`) session. Live
  briefly on 2026-11-24, then removed (see Decided against).
- **Android 1.0 live on Google Play** (US), approved after the 2026-10-15 submission.
- **Flat repo layout** (PRs #38, #40): the app moved from `chill-and-sip/` (the starter template's
  folder name) to the repo root. CI, Netlify, and the docs follow; file history is kept as
  renames.
- **Starter leftovers and dead code removed** (PRs #39, #40, audit item A):
  - The Vite starter's CSS is gone from `src/index.css`. It also set the default text color to a
    purple-gray (`#6b6375`) on phones in light mode, unreadable on navy; text without its own
    color now uses the app's muted gray.
  - `@capacitor/local-notifications` was uninstalled and the Android Gradle files regenerated with
    `npx cap sync`. It leaves the Android app with the next Play upload.
  - The never-working "link a login by matching email" step is gone from `refreshFromSupabase`;
    logins link only through an admin creating the profile or `claim_profile()`. A test pins it.
  - The admin's Home opens on the customer panel, without a customer's profile card and tier
    badge.
- **Sign-in email** (2026-11-24): Supabase Auth sends through Resend's SMTP from
  `no-reply@varietyh2o.com`, with DKIM, SPF (via Resend's `send` subdomain), and a monitoring-only
  DMARC record; the domain's Google Workspace mail is untouched. Templates send a 6-digit code with
  no link, so mail scanners that open links can't use it up.
- **Email sign-up, admin search, content fixes** (PR #41, live 2026-11-24): roadmap items G, L,
  and B; production deployed and the database migrated the same day (PRs #36, #37, and #41's
  schema in one migration, after a rolled-back dry run on live data).
- **Password-only admin, required customer email** (PR #42): admin MFA removed (several owners
  share the admin login across devices); `admin_add_customer` and `admin_set_customer_email`
  refuse a missing or blank email, so every customer sets up their own sign-in.
- **Showcase README** (PR #43, audit item K): product-first README with an architecture diagram
  and screenshots per size class; developer guide moved to `docs/DEVELOPMENT.md`.

## Reference: tablet and desktop layout
Built in PRs #18-#20. The decisions below still apply to any new or reworked screen.
- **Audience:** customers and admin alike.
- **Mechanism:** based on the actual window size (CSS breakpoints), **not** user-agent/device
  sniffing -- which is unreliable (frozen UA strings, iPads reporting as Macs) and wrong for
  resized or snapped windows.
- **Size classes:**
  - **Phone:** < 600px wide, *or* any window < ~500px tall (so a landscape phone doesn't get the
    cramped tablet layout). Edge-to-edge, bottom tab bar.
  - **Tablet:** 600-1023px wide. Bottom tab bar, 2-column grids where useful.
  - **Desktop:** >= 1024px wide. Top bar (logo + the four tabs), content capped at ~1200px and
    centered; the admin view may go up to ~1400px.
- **Admin, desktop:** two panels -- searchable customer list on the left, selected customer's
  details (balance, credit/debit, history, claim code) on the right.
  - List columns: name (email beneath), gallons, water type, status.
  - One search box over name, email, and legacy ID; nothing is listed until 3+ characters are
    typed (kept from the original admin screen so customer names and balances aren't on show at
    a glance). Sort by name (default) or gallons.
  - Filters: active / inactive / all, plus "no login yet" (customers still needing a claim code).
  - On tablet: side by side in landscape, stacked in portrait.
- **Customer screens:** same content, arranged roomier. Login and claim screens become a centered
  card on tablet/desktop.
- **Alignment** (settled on the prototype, https://claude.ai/artifact/TYdGEWUiUwsb2ZjEpFxwBe):
  - Content blocks and section headings are centered at every size; text inside list rows and
    cards stays left-aligned for scanning.
  - Tablet home (portrait and landscape): the profile/balance card is centered on its own row,
    with the transaction history below.
  - Desktop two-column screens: the section heading sits over the right column only, so the left
    panel's top lines up with the first item on the right -- the profile card with the first
    transaction on home, and the category list with the first item card on the menu.
- **Same data and features at every size** -- only the arrangement changes (e.g. customers still
  see their 5 most recent transactions on desktop). Showing more is a separate decision.
- **Rotation:** the Android app keeps portrait on phones and allows rotation on tablets (lock
  applied only when phone-sized). The installed web app drops its manifest `orientation:
  'portrait'` lock -- a manifest can't lock phones only -- so it may also rotate on phones.
- **Implementation:** `useSizeClass()` in `src/lib/ui.js` is the single source of truth, mirrored onto
  `<html data-size>`; layout CSS lives in `src/index.css` (not the `css` string, which Login and
  ClaimAccount don't render) and keys off `html[data-size=...]`. Existing DOM IDs stay stable;
  new elements (e.g. desktop nav) get new IDs documented in `TEST_IDS.md`.
- **Process:** a private clickable prototype first (fake data only; login, tracker, menu,
  location, settings, admin list+detail; phone/tablet/desktop switcher) for feedback, then PRs:
  1. Size-class foundation + top/bottom navigation -- done (PR #18).
  2. Admin two-panel layout -- done (PR #19).
  3. Customer screens per size class -- done (PR #20).
