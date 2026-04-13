# Multi-Theme System

**Date:** 2026-04-12
**Status:** Draft

## Background

The client application is currently dark-only. All color values are defined as CSS custom properties in `apps/client/src/index.css` using the OKLCH color space, and consumed through semantic tokens (e.g. `bg-card`, `text-foreground`, `border-border`). Components consistently use these tokens with no hardcoded Tailwind color families, providing a solid foundation for multi-theme support.

The goal is to introduce a theme architecture that supports at least one additional theme (light), is easy to extend with more themes in the future, and preserves the current dark experience as the default.

## Goals

1. Build a CSS-variable-based theme system on top of Tailwind CSS v4.
2. Add a **light** theme alongside the existing dark theme.
3. Design the system so that adding future themes requires only a new CSS variable block and a registry entry — no component-level changes.
4. Persist the user's theme choice across sessions.

## Non-Goals

- Per-component or per-section theme customization.
- Automatic `prefers-color-scheme` detection (can be added later).
- Theme transition animations.
- Changing the existing OKLCH color space.

## Theme Switching Mechanism

Use a `data-theme` attribute on `<html>`:

- `:root` keeps the dark theme values (backwards compatible).
- `[data-theme="light"]` overrides all semantic tokens for the light theme.
- Future themes: add a `[data-theme="<name>"]` selector block.

This approach is preferred over class-based switching (`.dark` / `.light`) because:

- It avoids CSS specificity issues when multiple classes are present.
- It scales cleanly to arbitrary named themes.
- It works naturally with Tailwind v4's `@theme inline` mapping.

## CSS Variable Architecture

### New Token: `--subtle`

Introduce a `--subtle` color token to replace all `border-white/*` usages:

| Token      | Dark                   | Light                  |
| ---------- | ---------------------- | ---------------------- |
| `--subtle` | `oklch(1 0 0)` (white) | `oklch(0 0 0)` (black) |

Mapped in `@theme inline` as `--color-subtle`, so components use `border-subtle/8`, `border-subtle/12`, etc. This preserves the opacity-modifier pattern while being theme-aware.

### Light Theme Tokens

All existing `:root` tokens will have `[data-theme="light"]` overrides. Light theme values will be designed to:

- Maintain the same hue family (primary green, secondary amber, destructive red).
- Adjust lightness and chroma for readability on light backgrounds.
- Preserve the visual hierarchy and brand identity.

### Derived Values

The following currently hardcoded values will be converted to CSS variables or theme-aware expressions:

| What                     | Current                                                          | Migration                                                           |
| ------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------- |
| Body gradient background | Hardcoded `#0b0b0d` / `#0f1012` / `#131419` stops + RGBA radials | CSS variables `--bg-gradient-*` or `html[data-theme] body` selector |
| Scrollbar thumb color    | `rgba(71, 71, 78, ...)`                                          | Theme-aware via CSS variable or `color-mix()`                       |
| `::selection` background | Hardcoded `oklch(0.82 0.16 158)` at 38%                          | Use `var(--ring)` with opacity                                      |
| `.focus-ring` outline    | Hardcoded `oklch(0.82 0.16 158 / 0.5)`                           | Use `var(--ring)`                                                   |
| Shadow colors            | `rgba(0, 0, 0, ...)` in components                               | Acceptable in both themes; no change needed                         |

## Runtime Architecture

### ThemeProvider

A React context provider that:

- Reads the initial theme from `localStorage` (key: `theme`).
- Falls back to `"dark"` if no stored preference exists.
- Sets the `data-theme` attribute on `document.documentElement`.
- Provides `{ theme, setTheme, themes }` to children.
- Persists theme changes to `localStorage`.

### useTheme() Hook

Returns the current theme context:

```typescript
interface ThemeContextValue {
  theme: string;
  setTheme: (theme: string) => void;
  themes: { name: string; label: string }[];
}
```

### ThemeToggle Component

A UI control (dropdown or segmented button) placed in the Settings page. Displays available themes and calls `setTheme` on selection.

## Theme Registry

Themes are registered in a central constant:

```typescript
const THEMES = [
  { name: 'dark', label: 'Dark' },
  { name: 'light', label: 'Light' },
] as const;
```

Adding a new theme requires:

1. Adding a `[data-theme="<name>"]` block in `index.css` with all token overrides.
2. Adding an entry to `THEMES`.

No component changes needed.

## Migration: `border-white/*` → `border-subtle/*`

All instances of `border-white/` in component files must be replaced with `border-subtle/` using the same opacity value. This is a mechanical find-and-replace across approximately 46 occurrences in ~15 files.

## Acceptance Criteria

1. App loads in dark theme by default (unchanged behavior).
2. User can switch to light theme via Settings; all colors update correctly.
3. Theme choice persists across page reloads and sessions.
4. No `border-white/*` patterns remain in component files.
5. Adding a new theme requires only CSS variable changes and a registry entry.
6. No visual regressions in dark theme.
7. Light theme is visually coherent: readable text, visible borders, proper contrast.

## Risks and Edge Cases

- **Third-party components:** `Toaster` currently has `theme="light"` hardcoded — must be wired to the theme context.
- **PWA theme color:** The manifest `theme_color` (`#0b0b0d`) should update dynamically based on active theme.
- **Canvas / SVG:** Any hardcoded colors in canvas rendering or SVG icons may need review.
- **OKLCH browser support:** OKLCH is supported in all modern browsers but may not work in older WebView runtimes. Acceptable risk for this project.
