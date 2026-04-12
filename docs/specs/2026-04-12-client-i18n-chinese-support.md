# Client I18n and Simplified Chinese Support Spec

## Relationship To Existing Docs

This spec adds client-side localization to `apps/client` and stays aligned with:

- `docs/specs/2026-04-10-codex-mobile-web-platform.md`
- `docs/plans/2026-04-10-codex-mobile-web-platform.md`
- `docs/specs/2026-04-10-client-frontend-rebuild.md`
- `docs/specs/2026-04-12-client-ui-refactor.md`

It does not change the bridge architecture, relay model, Codex integration flow,
local auth model, or shared protocol contracts. It defines how the current
active client UI should support both English and Simplified Chinese.

## Background

`apps/client` is the shared Web-first client that runs in the browser today and
must remain compatible with future Tauri-mobile hosting. The current routed UI
already includes:

- a pairing surface
- a shared application shell with header and settings
- thread list and thread detail views
- pending request handling across thread-level and global surfaces

User-facing copy across those active surfaces is still hard-coded in English.
Text also appears in shared formatting and utility helpers rather than only in
leaf UI components. As a result, adding Chinese support requires a real
localization layer, not a settings-only label change.

## Goals

- Add first-class Simplified Chinese (`zh-CN`) support to `apps/client`.
- Preserve English (`en`) as a supported locale.
- Add a language selector to the existing Settings panel.
- Apply locale changes across the active client UI without requiring a page
  reload when reasonably possible.
- Persist the user-selected locale locally on the current device/browser.
- Make date, time, and relative-time presentation follow the selected locale
  where applicable.
- Keep the solution Web-first and compatible with both browser and future
  Tauri-mobile hosting.

## Non-Goals

- No bridge, relay, SDK, or protocol changes.
- No server-side localization pipeline or remote translation service.
- No automatic translation of Codex thread content, assistant output, or user
  messages.
- No commitment to localize dormant or currently unused historical component
  trees that are not reachable from the active routed UI.
- No large CMS-style translation-management system in this milestone.

## Product Scope

### In Scope

The first localization slice covers user-visible copy reachable from the current
active client routes and shared feedback surfaces, including:

- pairing screen
- header and connection indicator
- settings sheet and settings sections
- request sheet and pending request cards
- thread list and thread detail views
- shared UI feedback such as:
  - toast messages
  - connection labels
  - thread status labels
  - request kind labels and descriptions
  - code-block copy affordances
  - PWA update prompt text
  - empty states and error states
  - relative-time and timestamp formatting helpers

### Out Of Scope

- backend-generated Codex content
- automatic translation of existing thread/message bodies
- inactive or unreachable legacy client surfaces
- advanced localization workflow tooling beyond what is needed for English and
  Simplified Chinese in the current UI

## User Requirements

- A Chinese-speaking user can switch the interface to Simplified Chinese from
  Settings.
- An English-speaking user can continue using the app in English.
- The selected language persists across refresh and reopen on the same device.
- The pairing flow is localized before authentication, not only after entering
  the workspace.
- Switching language does not require re-pairing, reconnecting the bridge, or
  clearing credentials.
- If a translation is missing, the UI fails safely instead of breaking.

## Supported Locales And Preference Model

The initial locale set is:

- `en`
- `zh-CN`

Recommended preference model:

- On first load, detect the preferred language from the browser/device locale.
- If the detected locale starts with `zh`, use `zh-CN`.
- Otherwise use `en`.
- Once the user explicitly selects a language in Settings, persist that choice
  locally and prefer it over auto-detection on subsequent loads.

## UX Requirements

## Settings

The Settings sheet must include a user-visible language preference item.

Expected behavior:

- clearly show the current language
- allow switching between:
  - English
  - 简体中文
- apply the new locale immediately in the current session
- keep the control in the shared Settings surface used on both mobile and
  desktop

## Consistency

The selected locale must affect:

- visible labels
- button text
- helper text
- empty states
- error states
- request action labels
- connection and thread status labels
- relative-time strings
- locale-sensitive date and time formatting

## Design Overview

The client should introduce a centralized localization layer with:

- typed locale state
- locale resource dictionaries for `en` and `zh-CN`
- a shared translation access pattern usable from components and formatting
  helpers
- a local persistence mechanism for the selected locale

Localization remains a client concern layered on top of the existing runtime and
protocol state. The design must not push localization responsibilities into the
bridge, relay, SDK transport, or protocol packages.

## Component And Module Responsibilities

The final design should support two localization access patterns:

1. **Component rendering access**
   - UI components need translated labels, placeholders, helper text, and toast
     content.

2. **Shared formatting/helper access**
   - helper modules that currently build status labels, request descriptions,
     timestamps, and relative-time strings must also be able to produce
     locale-aware output.

The implementation should therefore avoid a design that only works for JSX-local
literal replacement and leaves shared formatting logic behind.

## Persistence And Recovery Requirements

- Locale preference must be stored locally on the client device/browser.
- The locale preference must survive page refresh and browser reopen.
- If stored locale data is missing or invalid, the client must fall back safely
  to the default locale-selection flow.
- Locale changes must not interfere with auth state, pairing state, reconnect
  logic, or request-response flows.

## Error Handling And Fallback

- Unknown locale values fall back to English.
- Missing translation entries should fall back to English rather than rendering
  broken UI.
- Locale-sensitive formatters should degrade safely if a browser environment does
  not support the preferred locale perfectly.

## Compatibility

- The feature must work in standard browsers without Tauri-specific APIs.
- The feature must remain compatible with the current shared Web-first client
  architecture.
- The feature must not require protocol shape changes or bridge API changes.

## Risks

- The active UI is split across newer shell/settings components and older large
  feature panels, so translation coverage is broader than a settings-only
  change.
- Some user-facing copy currently lives in shared helper functions rather than
  directly in components.
- Relative-time presentation is currently English-specific and needs
  locale-aware formatting rather than simple string substitution.

## Acceptance Criteria

- The client supports both English and Simplified Chinese.
- A language selector exists in Settings.
- The selected language persists locally.
- The active routed UI no longer depends on hard-coded English for supported
  interface copy.
- Pairing, thread list, thread detail, request handling, settings, and shared
  feedback surfaces are localized.
- Locale-sensitive timestamps and relative-time strings reflect the selected
  locale.
- The client remains type-correct and buildable without protocol changes.

## Assumptions

- “Chinese support” in this milestone means Simplified Chinese (`zh-CN`).
- The first milestone targets the currently active routed UI rather than every
  historical or unused client file in the repository.
