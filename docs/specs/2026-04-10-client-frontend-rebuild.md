# Client Frontend Rebuild Spec

## Relationship To Existing Platform Docs

This spec refines the client-side implementation described in:

- `docs/specs/2026-04-10-codex-mobile-web-platform.md`
- `docs/plans/2026-04-10-codex-mobile-web-platform.md`

It does not replace the broader platform architecture. It defines how `apps/client`
should be rebuilt so the shared Web client is production-ready for both browser and
Tauri-mobile hosting.

## Background

This spec captured the rebuild of `apps/client` from the original manually assembled
Vite prototype into the current standardized frontend application.

Before this rebuild, the client had these problems:

- most UI, routing, state wiring, and event handling live in one top-level file
- the project layout does not match the standard Vite React + TypeScript scaffold
- CSS is handwritten in one large stylesheet
- build output artifacts have leaked into the source tree
- the app does not yet provide a clear mobile-first information architecture

The project goal is to become an excellent open-source product. The rebuild therefore
replaced prototype code with a maintainable, typed, well-structured frontend
application while preserving the existing bridge and SDK integration surface.

## Current Status

The rebuild defined by this spec is now implemented in `apps/client`:

- the client uses a standard Vite React + TypeScript structure
- Tailwind CSS and shadcn are integrated
- route-based `Threads`, `Inbox`, and `Connection` surfaces are implemented
- the SDK remains the source of bridge transport and live thread state

## Goals

- Rebuild `apps/client` from a standard official Vite React + TypeScript scaffold.
- Adopt Tailwind CSS and shadcn as the base UI system.
- Use shadcn CLI-generated components instead of manually maintaining low-level UI primitives.
- Keep the client Web-first so the same application code can run in browser and Tauri mobile.
- Split the app into clear routes, layouts, and feature modules.
- Provide a mobile-first experience that also scales cleanly to desktop.
- Preserve the existing bridge protocol and shared SDK runtime as the source of thread and event state.
- Improve readability, maintainability, consistency, and contributor onboarding.

## Non-Goals

- Redesigning bridge APIs or changing protocol shape during this frontend rebuild.
- Implementing pairing, relay, device management, or settings APIs that do not yet exist in the bridge.
- Moving shared runtime logic out of `packages/sdk`.
- Creating a separate mobile-only UI codebase.
- Building a full design system package in `packages/ui` as part of this work.
- Adding broad new product features outside the current bridge-supported flows.

## Product And UX Principles

- Mobile-first, not desktop-shrunk-down. Primary interaction paths must feel natural on a phone.
- Shared product identity. Browser and Tauri-mobile should feel like the same app.
- Explicit state. Connection state, loading state, mutation state, and pending request state must be visible.
- Fast action surfaces. Sending a message, interrupting a turn, and handling approvals should require minimal navigation.
- Recovery-oriented UX. The UI should communicate reconnecting or stale-state conditions instead of silently freezing.
- Open-source quality. Structure and styling should be understandable to contributors without reverse engineering a prototype.

## Scope

### In Scope

- Rebuild the Vite app shell and client project structure.
- Introduce route-based navigation for thread list/detail, inbox, and connection surfaces.
- Create responsive shared layouts for mobile and desktop.
- Replace hand-built primitive controls with shadcn/Tailwind-based UI.
- Refactor thread list, thread detail, composer, and pending request rendering into modular feature code.
- Keep the existing SDK runtime and protocol contracts, but wrap them in a cleaner client-side provider and hooks layer.
- Add a basic connection and diagnostics page using currently available bridge data.
- Preserve support for opening a selected thread directly from URL state.

### Out Of Scope For This Rebuild

- Pairing flows
- relay flows
- device trust management
- thread renaming, archive management, or settings editors
- direct Tauri-only behavior beyond keeping the app compatible with a Tauri host shell

## Information Architecture

The rebuilt client should expose three first-class product surfaces:

1. `Threads`
2. `Inbox`
3. `Connection`

### Route model

- `/` redirects to `/threads`
- `/threads` shows the thread list and an empty-state or split-view detail shell
- `/threads/:threadId` shows a selected thread
- `/inbox` shows pending requests aggregated across threads
- `/connection` shows bridge connection and diagnostics information

### Deep-link compatibility

The rebuilt client should preserve compatibility with the current `?threadId=...`
deep-link pattern by redirecting it into the route-based thread detail model.

## Navigation Model

### Mobile

- top app bar with current page context and page-level actions
- bottom navigation with `Threads`, `Inbox`, and `Connection`
- thread detail presented as a dedicated route screen
- composer pinned for thumb-friendly message sending

### Desktop

- persistent side navigation for top-level sections
- `Threads` route uses a split layout:
  - thread list on the left
  - thread detail on the right
- `Inbox` and `Connection` render as focused content views within the same shell

## Page Requirements

## Threads

The threads surface must support:

- browsing recent threads
- identifying thread status at a glance
- recognizing pending approvals or user-input requests
- opening a thread quickly
- creating a new thread
- locally filtering visible threads without changing bridge protocol

Thread list cards should present:

- thread title or fallback preview
- status badge
- short preview text
- workspace/cwd context
- updated time
- pending request summary

Thread detail must support:

- visible thread header metadata
- composer for new user messages
- interrupt action when a turn is active
- pending request rendering near the top of the detail view
- turn timeline rendering
- item rendering by item type

## Inbox

The inbox surface must aggregate pending requests across all loaded thread summaries.

It should allow the user to:

- review outstanding approvals and user-input requests without opening each thread first
- understand which thread a request belongs to
- jump directly into the related thread detail
- act on requests from the aggregated view when the required context is already available

## Connection

The connection surface is intentionally limited to currently supported bridge behavior.

It should provide:

- configured bridge base URL
- current connection mode labeling for the current implementation (`local`)
- bridge health status based on the available health endpoint
- token/bootstrap auth presence indicators where possible
- recent event-stream or data-loading status summaries
- recovery guidance when the client is disconnected or misconfigured

This page must be structured so future pairing, relay, and device-management sections
can be added without restructuring the entire application shell.

## Pending Request UX Requirements

Pending request handling is a core product flow, not a secondary debug feature.

The UI must:

- make pending requests visible both at thread level and globally
- visually distinguish command approval, file-change approval, permission requests, and tool user-input requests
- keep request actions explicit
- indicate request response progress while a mutation is pending
- remove or update pending request UI when the bridge resolves the request

### Decision model requirements

Where supported by the existing protocol model, the UI should expose:

- command approval: allow once, allow for session, deny
- file-change approval: allow once, allow for session, deny
- permissions: turn scope vs session scope
- user-input: structured answer collection based on the provided question schema

## Runtime And Data Constraints

- `packages/sdk` remains the authority for bridge transport, snapshot state, and live event merge behavior.
- The client rebuild must not duplicate transport/event stitching logic across page components.
- UI components must not depend directly on raw app-server semantics.
- Thread list and detail views must derive from the SDK snapshot and explicit UI-local state only.
- The bridge remains the synchronization authority after reconnect or reload.

## Visual Design Requirements

- Tailwind tokens and utility composition should replace the current monolithic handwritten CSS.
- shadcn should provide the foundation for interactive primitives.
- Typography should feel deliberate and product-like rather than generic dashboard boilerplate.
- The design should avoid default purple-heavy aesthetic patterns and avoid raw browser-default controls.
- The interface should preserve sufficient contrast and readable density for long-running thread monitoring.
- Commands, diffs, reasoning, and assistant messages should each have distinct but consistent visual treatments.

## Responsive And Interaction Requirements

- The primary target is mobile usage, especially for thread monitoring and approval handling.
- All important actions must remain reachable without hover behavior.
- Safe-area spacing must be respected for bottom navigation and pinned composer behavior.
- Desktop layouts should add density and parallel visibility rather than merely stretching mobile layouts.
- Empty, loading, and error states must be designed for both mobile and desktop form factors.

## Accessibility Requirements

- Navigation, forms, and approval actions must be keyboard reachable in browser mode.
- Interactive components must have visible focus states.
- Form fields and grouped actions must use clear labels.
- Color cannot be the only indicator of status.
- Status and mutation feedback should be screen-reader friendly where practical.

## Engineering Requirements

- The rebuilt app must use the official Vite React + TypeScript scaffold as its starting structure.
- Source and build artifacts must be clearly separated; generated JavaScript must not be emitted into `src/`.
- The client should have clear app, feature, component, and utility boundaries.
- Route state should use React Router instead of manual URL mutation.
- Environment variable handling should be centralized.
- Any shadcn UI primitives used by the app must be added through shadcn CLI, not hand-copied from docs.

## Acceptance Criteria

- `apps/client` is based on a standard Vite React + TypeScript project structure.
- Tailwind CSS and shadcn are integrated and used for core UI primitives.
- The client has route-based navigation with `Threads`, `Inbox`, and `Connection`.
- Thread list/detail flows still work with the existing bridge and SDK.
- Pending requests are visible both in thread detail and in a global inbox view.
- The UI works well on mobile and desktop, with mobile treated as the primary interaction target.
- No build artifacts remain tracked in the client source tree.
- The rebuilt client passes focused validation for type correctness and production build.
