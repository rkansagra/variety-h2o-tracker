# TEST IDs

This document defines the stable DOM `id` values used throughout the app. These IDs are intentionally kept consistent so UI tests and automation remain stable across refactors.

The app uses a `vh2o-<screen>-<section>-<element>[-token]` naming convention, and it is important not to change these values casually because they are part of the UI contract for test automation.

## Naming convention

- Prefix: `vh2o-`
- Pattern: `vh2o-<screen>-<section>-<element>[-<dynamic-token>]`
- Use lowercase and dashes only.
- Dynamic tokens should come from stable values (for example: `user.id`, `notif.id`, `category.id`, or a slug of item name).
- Do not use style classes or XPath in tests when an `id` exists.

## Selector map

## Login

- `vh2o-login-root`
- `vh2o-login-phone`
- `vh2o-login-content`
- `vh2o-login-store-name`
- `vh2o-login-privacy-link`
- `vh2o-login-error`
- `vh2o-login-notice` (e.g. "We sent a new code.")

Customer sign-in (emailed code), the default:

- `vh2o-login-code-request-form`
- `vh2o-login-email-input`
- `vh2o-login-send-code-btn`
- `vh2o-login-google-btn` (web only; not rendered in the native apps)
- `vh2o-login-code-verify-form` (after a code is sent)
- `vh2o-login-code-sent-to`
- `vh2o-login-code-input`
- `vh2o-login-verify-code-btn`
- `vh2o-login-resend-code-btn`
- `vh2o-login-change-email-btn`
- `vh2o-login-staff-link`

Staff sign-in (password; also shown for a password-reset session):

- `vh2o-login-staff-form`
- `vh2o-login-staff-title`
- `vh2o-login-username-input`
- `vh2o-login-password-input`
- `vh2o-login-submit`
- `vh2o-login-forgot-link` (hidden while setting a new password)
- `vh2o-login-customer-link` (hidden while setting a new password)
- `vh2o-login-reset-status`
- `vh2o-login-recovery-title`
- `vh2o-login-recovery-password-input`
- `vh2o-login-recovery-confirm-password-input`
- `vh2o-login-recovery-submit`

## Forgot password (`/forgot-password`)

- `vh2o-forgot-root`
- `vh2o-forgot-phone`
- `vh2o-forgot-content`
- `vh2o-forgot-title`
- `vh2o-forgot-email-input`
- `vh2o-forgot-submit`
- `vh2o-forgot-error`
- `vh2o-forgot-status`
- `vh2o-forgot-back-link`
- `vh2o-forgot-privacy-link`

## No account (signed in, but no customer record has this email)

- `vh2o-no-account-root`
- `vh2o-no-account-phone`
- `vh2o-no-account-content`
- `vh2o-no-account-title`
- `vh2o-no-account-message`
- `vh2o-no-account-store` (only once the store details have loaded)
- `vh2o-no-account-check-again-btn`
- `vh2o-no-account-still-missing` (after Check again finds nothing)
- `vh2o-no-account-different-email-btn`
- `vh2o-no-account-privacy-link`

## App shell

- `vh2o-app-root`
- `vh2o-app-phone`
- `vh2o-app-header` (phone and tablet only)
- `vh2o-app-header-logo` (phone and tablet only)
- `vh2o-app-header-account` (phone and tablet, signed in only: the initials, opens Settings)
- `vh2o-app-content`

## Top nav (desktop only)

- `vh2o-top-nav`
- `vh2o-top-nav-logo`
- `vh2o-top-nav-tracker` (Home for customers, Customers for the admin)
- `vh2o-top-nav-menu`
- `vh2o-top-nav-locations`
- `vh2o-top-nav-settings`
- `vh2o-top-nav-account`
- `vh2o-top-nav-login-btn` (signed out only)

## Bottom nav (phone and tablet only)

- `vh2o-bottom-nav`
- `vh2o-bottom-nav-tracker` (Home for customers, Customers for the admin)
- `vh2o-bottom-nav-menu`
- `vh2o-bottom-nav-locations`
- `vh2o-bottom-nav-settings`

## Tracker (user)

- `vh2o-tracker-home` (wraps profile + history; class `vh2o-home` for customers)
- `vh2o-tracker-profile`
- `vh2o-tracker-section`
- `vh2o-tracker-user-name` (the "Hi, <first name>" greeting)
- `vh2o-tracker-member-since` (only when the join date is known)
- `vh2o-tracker-water-type`
- `vh2o-tracker-points-pill` (the balance card)
- `vh2o-tracker-history-title`
- `vh2o-tracker-history` (customers: wraps the transaction rows / empty message)
- `vh2o-tracker-history-empty`
- `vh2o-tracker-signed-out` (Home tapped while signed out; opening the site signed out lands on the menu)
- `vh2o-tracker-login-btn`
- `vh2o-tracker-browse-menu-btn`
- `vh2o-tracker-history-unavailable` (the history couldn't be loaded; the balance still shows)

Dynamic transaction rows:

- `vh2o-tracker-notification-card-<notifId>`
- `vh2o-tracker-notification-icon-<notifId>`
- `vh2o-tracker-notification-amount-<notifId>`
- `vh2o-tracker-notification-time-<notifId>`
- `vh2o-tracker-notification-note-<notifId>` (corrections only)

## Tracker (admin)

Admin sections switcher (above every admin page):

- `vh2o-admin-subnav`
- `vh2o-admin-subnav-customers` / `vh2o-admin-subnav-menu` (`aria-pressed` on the current one)

- `vh2o-admin-manage-users`
- `vh2o-admin-manage-users-title`
- `vh2o-admin-active-summary`
- `vh2o-admin-add-customer-btn`
- `vh2o-admin-add-customer-form` (while adding)
- `vh2o-admin-add-customer-name-input`
- `vh2o-admin-add-customer-email-input`
- `vh2o-admin-add-customer-submit`
- `vh2o-admin-add-customer-cancel-btn`
- `vh2o-admin-add-customer-error`
- `vh2o-admin-user-search-input`
- `vh2o-admin-user-search-hint` (shown until 3+ characters are typed)
- `vh2o-admin-customer-searching` (while the current search is loading)
- `vh2o-admin-customer-search-error` (the server refused or failed the search)
- `vh2o-admin-customer-list` (hidden on phone while a customer's details are open)
- `vh2o-admin-filter-all` / `-active` / `-inactive` / `-nologin`
- `vh2o-admin-sort-select`
- `vh2o-admin-customer-count` (only while searching)
- `vh2o-admin-customer-empty`
- `vh2o-admin-customer-row-<userId>` (`aria-current="true"` when selected, tablet/desktop)
- `vh2o-admin-customer-detail`
- `vh2o-admin-customer-detail-empty` (nothing selected yet)
- `vh2o-admin-back-btn` (phone only)

"Ask the ledger" assistant (above the customer panels):

- `vh2o-admin-assistant`
- `vh2o-admin-assistant-toggle` (`aria-expanded`)
- `vh2o-admin-assistant-body` (only while open)
- `vh2o-admin-assistant-example-<index>` (only before the first question)
- `vh2o-admin-assistant-turns`
- `vh2o-admin-assistant-turn-<index>`
- `vh2o-admin-assistant-question-<index>`
- `vh2o-admin-assistant-answer-<index>`
- `vh2o-admin-assistant-tools-<index>` (lookups used; absent when there were none)
- `vh2o-admin-assistant-loading`
- `vh2o-admin-assistant-error`
- `vh2o-admin-assistant-input`
- `vh2o-admin-assistant-submit`
- `vh2o-admin-assistant-clear`

Dynamic customer rows:

- `vh2o-admin-user-card-<userId>`
- `vh2o-admin-user-name-<userId>`
- `vh2o-admin-user-gallons-<userId>`
- `vh2o-admin-user-status-<userId>`
- `vh2o-admin-user-water-type-select-<userId>`
- `vh2o-admin-user-email-form-<userId>` (customers with no login yet, not deleted)
- `vh2o-admin-user-email-input-<userId>`
- `vh2o-admin-user-email-save-btn-<userId>`
- `vh2o-admin-user-email-saved-<userId>`
- `vh2o-admin-user-email-error-<userId>`
- `vh2o-admin-user-amount-input-<userId>`
- `vh2o-admin-user-note-input-<userId>`
- `vh2o-admin-user-credit-btn-<userId>`
- `vh2o-admin-user-debit-btn-<userId>`
- `vh2o-admin-user-data-deleted-<userId>` (pill shown once a customer's data was deleted)
- `vh2o-admin-user-delete-data-btn-<userId>`
- `vh2o-admin-user-delete-data-confirm-<userId>`
- `vh2o-admin-user-delete-data-input-<userId>`
- `vh2o-admin-user-delete-data-cancel-btn-<userId>`
- `vh2o-admin-user-delete-data-confirm-btn-<userId>`
- `vh2o-admin-user-delete-data-error-<userId>`
- `vh2o-admin-user-history-btn-<userId>`

Credit/debit confirmation sheet:

- `vh2o-admin-confirm-overlay`
- `vh2o-admin-confirm-sheet`
- `vh2o-admin-confirm-message`
- `vh2o-admin-confirm-error`
- `vh2o-admin-confirm-submit`
- `vh2o-admin-confirm-cancel`

Full transaction history sheet:

- `vh2o-admin-history-overlay`
- `vh2o-admin-history-sheet`
- `vh2o-admin-history-title`
- `vh2o-admin-history-empty`
- `vh2o-admin-history-close-btn`
- `vh2o-admin-history-corrected-<txId>` (an entry a correction reversed)
- `vh2o-admin-history-correct-btn-<txId>` (uncorrected purchases and fills only)
- `vh2o-admin-history-correct-form-<txId>` (while correcting)
- `vh2o-admin-history-correct-note-<txId>`
- `vh2o-admin-history-correct-submit-<txId>`
- `vh2o-admin-history-correct-cancel-<txId>`
- `vh2o-admin-history-correct-error`

Dynamic history rows:

- `vh2o-admin-history-row-<transactionId>`

## Menu & hours editor (admin, `/admin/menu`)

`<itemId>` is the `menu_items` id; `<categoryId>` is the category id (e.g. `smoothies`); `<key>` is a
size's key (e.g. `large`).

- `vh2o-admin-menu`
- `vh2o-admin-menu-loading` / `vh2o-admin-menu-unavailable` (no live menu, so no editing)
- `vh2o-admin-store-form`
- `vh2o-admin-store-address1` / `-address2` / `-phone` / `-tagline` / `-welcome`
- `vh2o-admin-store-orderUrl` / `-facebookUrl` / `-mapsGoogleUrl` / `-mapsAppleUrl`
- `vh2o-admin-store-hours-days-<index>` / `vh2o-admin-store-hours-hours-<index>`
- `vh2o-admin-store-hours-remove-<index>`
- `vh2o-admin-store-hours-add` (while fewer than 7 lines)
- `vh2o-admin-store-save`
- `vh2o-admin-store-result`
- `vh2o-admin-menu-category-select`
- `vh2o-admin-menu-category-<categoryId>-sizes` (categories with size prices)
- `vh2o-admin-menu-category-<categoryId>-size-<key>-label` / `-price`
- `vh2o-admin-menu-category-<categoryId>-sizes-save` / `-sizes-result`
- `vh2o-admin-menu-items`
- `vh2o-admin-menu-item-<itemId>`
- `vh2o-admin-menu-item-hidden-<itemId>` (the Hidden tag)
- `vh2o-admin-menu-item-edit-<itemId>`
- `vh2o-admin-menu-item-form-<itemId>` (while editing)
- `vh2o-admin-menu-item-name-<itemId>` / `-price-<itemId>` / `-unit-<itemId>` / `-description-<itemId>`
- `vh2o-admin-menu-item-hidden-toggle-<itemId>`
- `vh2o-admin-menu-item-<itemId>-size-<key>-label` / `-price` (items with their own sizes)
- `vh2o-admin-menu-item-<itemId>-sizes-save` / `-sizes-result`
- `vh2o-admin-menu-item-save-<itemId>` / `-cancel-<itemId>`
- `vh2o-admin-menu-item-delete-<itemId>`, then `vh2o-admin-menu-item-delete-confirm-<itemId>`
- `vh2o-admin-menu-item-result-<itemId>`
- `vh2o-admin-menu-add-form`
- `vh2o-admin-menu-add-name` / `-price` / `-unit` / `-description`
- `vh2o-admin-menu-add-submit`
- `vh2o-admin-menu-add-result`
- `vh2o-admin-menu-history`
- `vh2o-admin-menu-history-empty`
- `vh2o-admin-menu-history-<changeId>`

## Menu

- `vh2o-menu-section`
- `vh2o-menu-loading` / `vh2o-menu-unavailable` (instead of the menu; unavailable = it can't load and
  this device has no saved copy)
- `vh2o-menu-cached-note` (offline: showing this device's saved copy, with its date)
- `vh2o-menu-tagline` (only when the store details have one)
- `vh2o-menu-welcome` (only when the store details have one)
- `vh2o-menu-title`
- `vh2o-menu-categories-grid` (phone and tablet only; a list of category rows)
- `vh2o-menu-back-btn` (phone and tablet only)
- `vh2o-menu-items` (the selected category's items)
- `vh2o-menu-category-list` (desktop only; the first category is selected by default)
- `vh2o-menu-category-title` (desktop only)

Dynamic category rows (phone and tablet only):

- `vh2o-menu-category-card-<categoryId>`
- `vh2o-menu-category-name-<categoryId>`

Dynamic category links (desktop only; `aria-current="true"` on the selected one):

- `vh2o-menu-category-link-<categoryId>`

Dynamic item rows:

- `vh2o-menu-item-card-<categoryId>-<itemSlug>`
- `vh2o-menu-item-name-<categoryId>-<itemSlug>`
- `vh2o-menu-item-price-<categoryId>-<itemSlug>` (only rendered for items with no size tiers, i.e. `item.flatPrice` or a flat `item.price`, AND whose price isn't shared with any other item in the category -- see consolidated pricing below)
- `vh2o-menu-item-description-<categoryId>-<itemSlug>` (only for items with a description; always shown)
- `vh2o-menu-item-size-btn-<categoryId>-<itemSlug>-<tierKey>` -- a size and its price (a label, not a button, despite the name) -- `tierKey` comes from the item's sizes (its category's `size_tiers`, or the item's own): `small`/`large` for Smoothies, Milkshakes, Snowcones; `single`/`double`/`triple` for Ice Cream. Only rendered when this item's exact price/tier combination isn't shared with any other item in the category.

Consolidated pricing (when 2+ items in a category share the exact same price or tier set, e.g. every Milkshake flavor is $8.05/$10.12 by size): the shared price/tiers render once as a pricing bar instead of once per item, and those items render as plain name-only chips with no `vh2o-menu-item-price-*` or `vh2o-menu-item-size-btn-*` id (their `vh2o-menu-item-card-*` / `vh2o-menu-item-name-*` ids are unaffected). A price/tier set held by only one item in the category still gets its own full card as before.

- `vh2o-menu-group-pricing-<categoryId>-<groupIndex>` -- the once-per-group pricing bar; `groupIndex` is the 0-based order the price group first appears in the category's item list (not a stable per-price key -- don't assume a given flavor's group index stays fixed if the catalog reorders).

## Locations

- `vh2o-locations-section`
- `vh2o-locations-loading` / `vh2o-locations-unavailable` (instead of the cards)
- `vh2o-locations-title`
- `vh2o-locations-cards` (grid of the cards below)
- `vh2o-locations-address-card`
- `vh2o-locations-call-card`
- `vh2o-locations-hours-card`
- `vh2o-locations-order-now-card`
- `vh2o-locations-facebook-card`

Map sheet:

- `vh2o-map-options-overlay`
- `vh2o-map-options-sheet`
- `vh2o-map-options-google-link`
- `vh2o-map-options-apple-link`
- `vh2o-map-options-cancel-btn`

Call sheet:

- `vh2o-call-options-overlay`
- `vh2o-call-options-sheet`
- `vh2o-call-options-link`
- `vh2o-call-options-cancel-btn`

## Settings

- `vh2o-settings-section`
- `vh2o-settings-title`
- `vh2o-settings-login-btn`
- `vh2o-settings-logout-btn`
- `vh2o-settings-privacy-link`

Biometric unlock (only rendered when the device reports biometry is available -- native only, never on web/PWA):

- `vh2o-settings-biometric-title`
- `vh2o-settings-biometric-toggle-btn`
- `vh2o-settings-biometric-error`

## Crash screen (shown if the app crashes)

- `vh2o-crash`
- `vh2o-crash-reload-btn`

## Biometric lock screen

Rendered instead of the app shell when a signed-in user has biometric lock enabled and the app has just launched or returned to the foreground.

- `vh2o-biometric-lock-root`
- `vh2o-biometric-lock-phone`
- `vh2o-biometric-lock-message`
- `vh2o-biometric-lock-unlock-btn`
- `vh2o-biometric-lock-error`
- `vh2o-biometric-lock-logout-btn`

## Maintenance rules

- Keep IDs stable; changing IDs is a breaking change for tests.
- Prefer semantic tokens over indexes for dynamic IDs.
- If you replace a selector, add the new selector here in the same PR.
- Keep one unique `id` per rendered element state.

