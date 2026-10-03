# Roadmap

Planned work for the Variety H2O app, in priority order. Each item records the decisions already
made and why, so they don't get re-litigated. Move items to **Done** (with the PR number) as they
ship; add new items in priority order.

## Next up

### 1. In-app reward reminders
E.g. "you're close to your next reward", shown when the customer opens the app. **No SMS** (avoids
Twilio A2P 10DLC registration and per-message cost) and **no Firebase/FCM push** -- in-app only.

### 2. Facebook login (optional)
Only if wanted. Would follow the Google pattern (`signInWithOAuth({ provider: 'facebook' })`, web
only) plus a Meta for Developers app and Supabase provider config.

## Open operational tasks
- **Production deploy:** PRs #8 and #11-#23 (Google button + auth redirects, edge-to-edge phones,
  forgot-password page, accessibility/readability/icons/labels, claim codes for Google users,
  tablet/desktop layouts, menu category image icons) are merged but not live -- production deploys are manual (see
  `netlify.toml`). Also needs an Android rebuild for the native app changes.
- **Test Google sign-in end to end** on varietyh2o.com once deployed: a Google account matching an
  existing customer's email should land in their tracker.
- **Google Play release:** build a fresh signed `.aab` from `main` (after the deploy above) and
  publish it to the production track in the Play Console.
- **Back up the release keystore** (`android/app/release-key.jks` + `android/keystore.properties`,
  local-only and git-ignored) somewhere durable off this machine -- it's the only key that can ever
  sign updates to `com.varietyh2o.app`.

## Decided against
- **Apple Sign-In:** only required by App Store Review Guideline 4.8, and iOS ships as an
  installable PWA, not through the App Store (no $99/yr Apple Developer Program). Revisit only if
  App Store distribution becomes a goal.
- **Native iOS project:** removed for the same reason (PR #7); recreate with `npx cap add ios` if
  ever needed.
- **Phone-number login / SMS:** tried and reverted (`ac7e935`); email + password stays primary.
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

### Phase 5 -- Menu artwork (2026-10-01 to 10-03)
- **Image icons for menu categories** (PR #23): a category can set an optional `iconSrc` (an
  imported image), shown by `CategoryIcon` in `App.jsx` and sized in `em` so it matches the emoji at
  every spot (category grid, desktop category list, section titles, item rows); the `icon` emoji
  stays as the fallback. Bottles & Jugs is the first, with a 128x128 PNG (`src/assets/bottles.png`,
  6 KB; the source was a 95 KB 512x512 WebP saved as `.png`). The other categories keep their
  emoji.

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
- **Implementation:** `useSizeClass()` in `App.jsx` is the single source of truth, mirrored onto
  `<html data-size>`; layout CSS lives in `src/index.css` (not the `css` string, which Login and
  ClaimAccount don't render) and keys off `html[data-size=...]`. Existing DOM IDs stay stable;
  new elements (e.g. desktop nav) get new IDs documented in `chill-and-sip/TEST_IDS.md`.
- **Process:** a private clickable prototype first (fake data only; login, tracker, menu,
  location, settings, admin list+detail; phone/tablet/desktop switcher) for feedback, then PRs:
  1. Size-class foundation + top/bottom navigation -- done (PR #18).
  2. Admin two-panel layout -- done (PR #19).
  3. Customer screens per size class -- done (PR #20).
