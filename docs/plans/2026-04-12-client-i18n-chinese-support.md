# Client I18n and Simplified Chinese Support Plan

## Relationship To Spec

This plan implements:

- `docs/specs/2026-04-12-client-i18n-chinese-support.md`

It stays aligned with the current shared Web-first client architecture and does
not modify bridge, relay, SDK, or protocol behavior.

## Implementation Strategy

Implement a lightweight in-repo localization layer for `apps/client` instead of
introducing a large third-party i18n framework in v1.

Recommended stack:

- React context for locale state
- typed TypeScript message catalogs for `en` and `zh-CN`
- `navigator.language` for first-load locale detection
- `localStorage` for persisted user preference
- `Intl.DateTimeFormat` for locale-sensitive absolute date/time formatting
- `Intl.RelativeTimeFormat` for locale-sensitive relative-time formatting

This approach keeps the implementation small, typed, and compatible with the
current client architecture while still covering both component-level text and
shared formatting helpers.

## Phase 1: Add The Client I18n Core

Create a new `src/lib/i18n/` module, for example:

- `types.ts`
- `messages/en.ts`
- `messages/zh-CN.ts`
- `catalog.ts`
- `storage.ts`
- `provider.tsx`
- `use-i18n.ts`
- `formatters.ts`

Responsibilities:

- define supported locales
- detect the initial locale
- persist and restore the explicit user preference
- expose a translation lookup API with English fallback
- provide locale-aware formatting helpers for dates and relative time

## Phase 2: Wire The Provider Into The App Shell

Update `src/app/providers.tsx` to include the locale provider.

Responsibilities:

- make locale state available to the whole routed app
- trigger rerender on locale change without reload
- keep the provider Web-first and browser-safe
- set `document.documentElement.lang` to the active locale

## Phase 3: Add Language Selection To Settings

Add a new settings section, for example:

- `components/settings/language-section.tsx`

Update:

- `components/settings/settings-sheet.tsx`

Responsibilities:

- show the current language
- allow switching between `English` and `简体中文`
- apply the new locale immediately
- persist the selection locally

## Phase 4: Localize Shared Formatters And Helper Modules

Refactor user-facing helper functions so they no longer return hard-coded
English.

Primary targets:

- `src/lib/runtime/connection-utils.ts`
- `src/features/threads/lib/thread-utils.ts`
- `src/features/requests/lib/request-utils.ts`

Responsibilities:

- localize connection labels
- localize thread status labels
- localize request kind labels and request descriptions
- replace English-only relative-time logic with `Intl.RelativeTimeFormat`
- route absolute timestamp formatting through the selected locale

## Phase 5: Localize Active Routed UI Surfaces

Localize all user-facing text in the active routed UI.

Primary targets:

- `src/components/pairing/pairing-screen.tsx`
- `src/components/layout/header.tsx`
- `src/components/layout/connection-indicator.tsx`
- `src/features/requests/components/request-sheet.tsx`
- `src/components/settings/connection-section.tsx`
- `src/components/settings/devices-section.tsx`
- `src/components/settings/settings-sheet.tsx`
- `src/components/common/pwa-update-prompt.tsx`
- `src/components/common/code-block.tsx`
- `src/app/layouts/threads-layout.tsx`
- `src/features/threads/components/thread-list-panel.tsx`
- `src/features/threads/components/thread-detail-panel.tsx`
- `src/features/requests/components/pending-request-list.tsx`

Responsibilities:

- localize titles, labels, placeholders, empty states, alerts, and toasts
- keep Codex-generated message content unchanged
- keep dormant or unrouted legacy components out of scope for this first slice

## Phase 6: Validation And Coverage Review

Validation should include:

- `pnpm --filter @my-codex-app/client typecheck`
- `pnpm --filter @my-codex-app/client build`

Review should include:

- manual first-load locale detection check
- manual Settings language toggle check
- manual persistence check after refresh
- pairing page localization before authentication
- thread list, thread detail, request sheet, and settings localization coverage
- targeted hard-coded-English review of active UI surfaces

## Notes On Scope Control

This plan intentionally targets the currently active routed UI and shared
helpers first. It does not attempt to localize inactive or unused historical
component files in the same pass.
