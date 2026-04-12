# Multi-Theme System — Implementation Plan

**Date:** 2026-04-12
**Spec:** `docs/specs/2026-04-12-multi-theme-system.md`

## Phase 1: CSS Infrastructure

### 1.1 Add `--subtle` token
- Add `--subtle: oklch(1 0 0)` to `:root` in `index.css`
- Add `--color-subtle: var(--subtle)` to `@theme inline`

### 1.2 Add light theme tokens
- Add `[data-theme="light"]` selector in `index.css` with overrides for:
  - `--background`, `--foreground`, `--card`, `--card-foreground`
  - `--popover`, `--popover-foreground`
  - `--primary`, `--primary-foreground`
  - `--secondary`, `--secondary-foreground`
  - `--muted`, `--muted-foreground`
  - `--accent`, `--accent-foreground`
  - `--destructive`
  - `--border`, `--input`, `--ring`
  - `--sidebar-*` (all sidebar tokens)
  - `--subtle` → `oklch(0 0 0)`
  - `color-scheme: light`

### 1.3 Theme-aware hardcoded values
- Body gradient: use `html[data-theme="light"] body` selector with light gradient
- Scrollbar: use `color-mix()` or CSS variable for thumb color
- `::selection`: replace hardcoded oklch with `var(--ring)` via `color-mix()`
- `.focus-ring`: replace hardcoded oklch with `var(--ring)`

## Phase 2: Migrate `border-white/*` → `border-subtle/*`

- Grep all `border-white/` occurrences in `apps/client/src/components/**` and `apps/client/src/features/**`
- Replace with `border-subtle/` keeping same opacity value
- Files: ~15 files, ~46 occurrences

## Phase 3: Runtime (ThemeProvider + useTheme)

### 3.1 Create theme context
- File: `apps/client/src/lib/theme/provider.tsx`
  - `ThemeContext` with `{ theme, setTheme, themes }`
  - Reads from `localStorage` key `"theme"`, fallback `"dark"`
  - Sets `document.documentElement.dataset.theme` on mount and change
  - Persists to `localStorage` on change

### 3.2 Create useTheme hook
- File: `apps/client/src/lib/theme/use-theme.ts`
- Re-exports context value with type safety

### 3.3 Create theme constants
- File: `apps/client/src/lib/theme/constants.ts`
  - `THEMES` array with `{ name, label }` entries
  - `DEFAULT_THEME = "dark"`
  - `THEME_STORAGE_KEY = "theme"`

### 3.4 Wire into providers
- Update `apps/client/src/app/providers.tsx`
- Wrap with `ThemeProvider`

## Phase 4: ThemeToggle UI + Integration

### 4.1 ThemeToggle component
- File: `apps/client/src/components/settings/theme-section.tsx`
- Segmented button or dropdown for Dark / Light selection
- Uses `useTheme()` hook

### 4.2 Add to Settings
- Import and render in settings page

### 4.3 Fix third-party integrations
- `Toaster` in `providers.tsx`: wire `theme` prop to `useTheme()`
- PWA manifest: consider dynamic `theme_color` update via meta tag

## Phase 5: Verify

- `pnpm build` — no type/build errors
- Visual check: dark theme unchanged
- Visual check: light theme renders correctly
- Verify localStorage persistence
- Check scrollbar, selection, focus ring in both themes

## File Impact Summary

| File | Action |
|------|--------|
| `apps/client/src/index.css` | Modify (tokens, light theme, hardcoded values) |
| `apps/client/src/lib/theme/constants.ts` | Create |
| `apps/client/src/lib/theme/provider.tsx` | Create |
| `apps/client/src/lib/theme/use-theme.ts` | Create |
| `apps/client/src/app/providers.tsx` | Modify (wrap ThemeProvider) |
| `apps/client/src/components/settings/theme-section.tsx` | Create |
| `apps/client/src/components/layout/header.tsx` | Modify (Toaster theme fix) |
| ~15 component files | Modify (`border-white/*` → `border-subtle/*`) |
