# Client Web Feature Migration Design

## Architecture Direction

The Tauri client remains the product shell. Legacy web components may be used
as behavior references, but migrated capabilities must be rebuilt into the
current client structure:

- `client/src/App.tsx` owns top-level session, terminal, and overlay state.
- Workspace navigation remains in `SessionSelectPage`.
- Terminal chrome remains in `TabBar`.
- Long-running terminal tools render through a shared overlay host above xterm.
- Settings remain embedded inside the Workspace shell.
- Client-only preferences stay in Zustand persisted stores.
- Theme and language are client-only preferences. They do not require backend
  API, server config, tmux state, or cross-device sync in Phase 1.

## Phase 1 Foundation

Phase 1 establishes shared UI and state patterns before broad feature migration:

1. Add terminal overlay primitives:
   - `TerminalOverlayHost`
   - `TerminalOverlayDrawer`
   - a small overlay state model for active tool, close behavior, and focus
     return.
2. Convert current Files and AI surfaces from layout-consuming dock panels to
   right-side overlay drawers.
3. Start a theme registry:
   - named theme metadata
   - app surface tokens
   - terminal color tokens
   - the first theme set: `Midnight`, `Graphite`, `Forest`, and `Light`
   - migration path away from raw deep-blue colors
   - inventory tracking for any legacy raw-color surfaces not converted in
     Phase 1.
4. Add language switching to the client shell and Settings.
5. Create a feature inventory that maps legacy web capabilities to client
   destinations, migration phase, and UI pattern.

## Terminal Overlay Contract

Opening a terminal tool must not resize the xterm container. Tool surfaces float
inside the terminal page stacking context. The terminal can be visually dimmed,
but its DOM layout footprint stays stable.

Default treatment:

- Compact right-side edge drawers for narrow tools such as Files, AI, IDE
  context, and logs.
- Wide terminal document overlays for Trellis-style browsing. Trellis needs
  enough horizontal density for a left index plus a right reading/source area,
  and it keeps a separate persisted width preference from Files/AI.
- Compact centered modal for short confirmations and goal editing if a drawer is
  unnecessarily heavy.
- No bottom shelf by default because it hides the newest terminal output.

The overlay host should own escape-to-close and click-outside behavior where it
does not conflict with terminal mouse interaction.

## Theme Design

Themes should be data-driven rather than implemented as one-off component
branches. A theme registry should define:

- stable theme id
- display labels for English and Chinese
- dark/light classification when needed by terminal/xterm behavior
- CSS variable values for app surfaces, text, borders, accent, and status colors
- terminal palette or terminal theme mapping.

The first expanded theme set is:

- `Midnight`: current Termius-like dark blue/black default.
- `Graphite`: neutral dark gray theme.
- `Forest`: low-saturation green/cyan theme.
- `Light`: restrained light theme; terminal colors may remain controlled by a
  dark terminal palette when readability requires it.

Theme governance is mandatory:

- All new components must use theme tokens from the start.
- Existing components must be migrated to tokens when touched, migrated, or
  visually accepted during this work.
- Raw colors are not allowed as component-local palettes. Status colors,
  accents, terminal palettes, and tool-specific colors must be centralized in
  the theme registry or semantic CSS variables.
- Terminal overlays, existing Files/AI tools, future web-feature migrations,
  Settings, Workspace, Project, Session, and Terminal chrome all follow the same
  theme contract.
- Any untouched legacy raw-color surfaces that cannot reasonably be converted in
  Phase 1 must be listed in the feature/theme inventory with a follow-up phase,
  so they do not become hidden exceptions.

Existing raw colors in `SessionSelectPage`, `TabBar`, `SettingsDialog`, and
overlay surfaces should be migrated to tokens as those screens are touched.
Phase 1 may split untouched legacy cleanup into follow-up work, but it must not
introduce new un-themed UI.

## Language Design

The existing i18n store is retained. User-facing strings touched in Phase 1
should move into `client/src/i18n/translations.ts`.

Language selection should be visible in Settings. A compact Workspace shortcut
is allowed only if it does not create duplicate competing settings entry points.

The selected language is persisted locally by the client. Theme selection uses
the same client-local preference boundary. Neither setting should be sent to the
backend or treated as a server-owned runtime value.

The first migration target is shell-level text:

- Workspace / Projects / Sessions / Settings labels.
- Terminal top bar tool titles.
- Overlay drawer titles and empty states.
- Theme and language setting labels.
- Destructive confirmations touched during the work.

## Feature Inventory Shape

The inventory should be a living planning document, not runtime code. It should
record:

- legacy web feature name
- current client status
- target client location
- target UI pattern
- phase
- backend/API dependency
- notes or risk.

This inventory prevents accidental omission while still allowing the client UI
to differ from the old web UI.

## Compatibility Notes

- Windows native Tauri at 150% display scaling is the primary visual target.
- WSLg visual output is not authoritative for density decisions.
- Existing client project/session separation remains authoritative.
- Theme and language are intentionally not synced through the backend in this
  phase.
- `client/package-lock.json` currently has an unrelated local modification and
  must be reviewed before implementation commits.
