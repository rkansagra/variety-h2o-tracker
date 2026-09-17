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
- `vh2o-login-username-input`
- `vh2o-login-password-input`
- `vh2o-login-submit`
- `vh2o-login-error`
- `vh2o-login-reset-email-input`
- `vh2o-login-reset-request-btn`
- `vh2o-login-reset-status`
- `vh2o-login-recovery-title`
- `vh2o-login-recovery-password-input`
- `vh2o-login-recovery-confirm-password-input`
- `vh2o-login-recovery-submit`

## Claim account (public self-serve signup)

- `vh2o-claim-root`
- `vh2o-claim-phone`
- `vh2o-claim-content`
- `vh2o-claim-title`
- `vh2o-claim-legacy-id-input`
- `vh2o-claim-code-input`
- `vh2o-claim-email-input`
- `vh2o-claim-password-input`
- `vh2o-claim-confirm-password-input`
- `vh2o-claim-submit`
- `vh2o-claim-error`
- `vh2o-claim-success`

## App shell

- `vh2o-app-root`
- `vh2o-app-phone`
- `vh2o-app-header`
- `vh2o-app-header-logo`
- `vh2o-app-content`

## Bottom nav

- `vh2o-bottom-nav`
- `vh2o-bottom-nav-tracker`
- `vh2o-bottom-nav-menu`
- `vh2o-bottom-nav-locations`
- `vh2o-bottom-nav-settings`

## Tracker (user)

- `vh2o-tracker-section`
- `vh2o-tracker-avatar-ring`
- `vh2o-tracker-user-name`
- `vh2o-tracker-member-since`
- `vh2o-tracker-water-type`
- `vh2o-tracker-points-pill`
- `vh2o-tracker-history-title`
- `vh2o-tracker-history-empty`

Dynamic transaction rows:

- `vh2o-tracker-notification-card-<notifId>`
- `vh2o-tracker-notification-icon-<notifId>`
- `vh2o-tracker-notification-amount-<notifId>`
- `vh2o-tracker-notification-time-<notifId>`

## Tracker (admin)

- `vh2o-admin-manage-users`
- `vh2o-admin-manage-users-title`
- `vh2o-admin-active-summary`
- `vh2o-admin-user-search-input`
- `vh2o-admin-user-search-hint`

Dynamic customer rows:

- `vh2o-admin-user-card-<userId>`
- `vh2o-admin-user-name-<userId>`
- `vh2o-admin-user-gallons-<userId>`
- `vh2o-admin-user-status-<userId>`
- `vh2o-admin-user-water-type-select-<userId>`
- `vh2o-admin-user-generate-code-btn-<userId>`
- `vh2o-admin-user-claim-code-<userId>`
- `vh2o-admin-user-claim-code-error-<userId>`
- `vh2o-admin-user-amount-input-<userId>`
- `vh2o-admin-user-note-input-<userId>`
- `vh2o-admin-user-credit-btn-<userId>`
- `vh2o-admin-user-debit-btn-<userId>`
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

Dynamic history rows:

- `vh2o-admin-history-row-<transactionId>`

## Menu

- `vh2o-menu-section`
- `vh2o-menu-tagline`
- `vh2o-menu-welcome`
- `vh2o-menu-title`
- `vh2o-menu-categories-grid`
- `vh2o-menu-back-btn`

Dynamic category cards:

- `vh2o-menu-category-card-<categoryId>`
- `vh2o-menu-category-name-<categoryId>`

Dynamic item rows:

- `vh2o-menu-item-card-<categoryId>-<itemSlug>`
- `vh2o-menu-item-name-<categoryId>-<itemSlug>`
- `vh2o-menu-item-price-<categoryId>-<itemSlug>` (only rendered for items with no size tiers, i.e. `item.flatPrice` or a flat `item.price`, AND whose price isn't shared with any other item in the category -- see consolidated pricing below)
- `vh2o-menu-item-description-<categoryId>-<itemSlug>`
- `vh2o-menu-item-size-btn-<categoryId>-<itemSlug>-<tierKey>` -- `tierKey` comes from the item's tier list (`CATEGORY_SIZE_TIERS[categoryId]`, or the item's own `customTiers`): `small`/`large` for Smoothies, Milkshakes, Snowcones; `single`/`double`/`triple` for Ice Cream. Only rendered when this item's exact price/tier combination isn't shared with any other item in the category.

Consolidated pricing (when 2+ items in a category share the exact same price or tier set, e.g. every Milkshake flavor is $8.05/$10.12 by size): the shared price/tiers render once as a pricing bar instead of once per item, and those items render as plain name-only chips with no `vh2o-menu-item-price-*` or `vh2o-menu-item-size-btn-*` id (their `vh2o-menu-item-card-*` / `vh2o-menu-item-name-*` ids are unaffected). A price/tier set held by only one item in the category still gets its own full card as before.

- `vh2o-menu-group-pricing-<categoryId>-<groupIndex>` -- the once-per-group pricing bar; `groupIndex` is the 0-based order the price group first appears in the category's item list (not a stable per-price key -- don't assume a given flavor's group index stays fixed if the catalog reorders).

## Locations

- `vh2o-locations-section`
- `vh2o-locations-title`
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

Admin registration:

- `vh2o-settings-admin-register-form`
- `vh2o-settings-admin-register-name`
- `vh2o-settings-admin-register-username`
- `vh2o-settings-admin-register-password`
- `vh2o-settings-admin-register-confirm-password`
- `vh2o-settings-admin-register-submit`
- `vh2o-settings-admin-register-error`
- `vh2o-settings-admin-register-success`

## Maintenance rules

- Keep IDs stable; changing IDs is a breaking change for tests.
- Prefer semantic tokens over indexes for dynamic IDs.
- If you replace a selector, add the new selector here in the same PR.
- Keep one unique `id` per rendered element state.

