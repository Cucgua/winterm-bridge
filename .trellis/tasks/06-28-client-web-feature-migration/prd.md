# Client Web Feature Migration

## Goal

Migrate the useful web client capabilities into the Tauri client without
bringing back the old web information architecture or visual style. The client
should keep the current Workspace / Projects / Sessions / Settings / Terminal
model, while reaching functional parity with the web client where the features
still make sense.

## Confirmed Facts

- The current Tauri client already has a distinct Workspace model with Projects,
  live Sessions, Terminal, and embedded Settings.
- The backend API surface already exposes many of the web features to the client
  API layer, including guest access, upload, IDE context, Trellis documents,
  auto action logs, AI logs, AI presets, tmux config, session notification,
  session auto mode, and file operations.
- The current client contains an i18n store and Chinese/English translation
  files, but many client screens still use hard-coded English strings and no
  visible language switcher exists in the new Workspace shell.
- The current theme system is still effectively dark/light/system. Many client
  UI surfaces use raw dark-blue colors instead of theme tokens, so adding more
  themes requires tokenizing those surfaces, not only adding new CSS variables.
- Windows native client rendering is the product baseline. WSLg rendering is
  useful for development but not authoritative for density or window behavior.
- The working tree currently has a modified `client/package-lock.json` that
  should be reviewed before implementation so unrelated dependency churn is not
  mixed into feature commits.

## Product Direction

- Migrate features as functional equivalents under the new client model, not as
  direct copies of the old web UI.
- Preserve the Termius-like operational style: dark layered surfaces, compact
  controls, scan-friendly cards, and low visual noise.
- Treat Windows 150% display scaling as a normal target environment. UI density
  must be judged against native Windows Tauri screenshots, not WSLg screenshots.
- Terminal tools use right-side edge overlay drawers by default. The overlay
  floats above xterm instead of participating in the terminal page layout.
- The first expanded theme set ships as `Midnight`, `Graphite`, `Forest`, and
  `Light`.
- Theme and language preferences are client-internal behavior. They should be
  persisted locally by the client and must not require backend API, tmux, or
  server configuration changes.
- Implementation proceeds in phases. Phase 1 builds the shared foundations:
  overlay host/drawers, conversion of existing Files and AI surfaces to overlay
  behavior, initial theme registry/token work, initial language switch entry,
  and a web-to-client feature inventory. Later phases migrate the remaining web
  features onto that foundation.

## Requirements

### R1. Feature Parity Under New Navigation

The client must provide equivalent access to web-side capabilities that remain
useful for the desktop client:

- AI monitor configuration and status.
- Auto-reply configuration, goals, emergency stop, and action logs.
- Email notification configuration.
- Tmux configuration, including advanced options where still supported.
- Upload configuration and pasted-image upload flow.
- IDE context configuration and session-aware IDE context display.
- Guest access management for admin users.
- Trellis summary, task, spec, and source browsing for sessions.
- Session actions that exist in the web client and fit the new model, such as
  duplicate, restart, notify, auto mode, and copy mode.

### R2. Terminal Tool Surfaces Are Overlays

All terminal-side tool surfaces must float above the xterm surface instead of
resizing or pushing the terminal area.

This applies to:

- Files.
- AI monitor / auto logs.
- Trellis.
- IDE context.
- Session goal editing.
- Any future terminal tool panel or dialog.

The xterm viewport must keep its layout footprint stable when these tools open
or close. Tool overlays should default to right-side edge drawers. Short
confirmation prompts may still use compact modal treatment, but persistent tools
must not participate in the main flex layout in a way that changes terminal
rows/columns.

### R3. Theme System Expansion

The client must support more than the old dark/light pair. Themes should be
first-class named choices exposed in Settings and applied through shared theme
tokens.

Every client component must be governed by the theme system. New components
must use theme registry tokens from the start. Existing components must be
migrated to tokens when they are touched, migrated, or visually accepted during
this work.

The implementation must avoid one-off palettes per component. Raw colors are
allowed only when they are centralized as named theme tokens or documented
semantic status tokens. Any legacy raw colors not converted during Phase 1 must
be tracked in the feature/theme inventory rather than silently preserved.

### R4. Language Switching

The client must expose Chinese/English switching in the new client UI and apply
it consistently across Workspace, Projects, Sessions, Settings, Terminal top
bar, dialogs, overlays, empty states, errors, and destructive confirmations.

Hard-coded user-facing strings should be migrated into the existing i18n
translation system as screens are touched.

### R5. Settings As A Peer Workspace Section

Settings remain a peer section inside the Workspace shell rather than a
separate app-level page. Theme and language belong in Settings, with optional
compact shortcuts only if they do not add duplicate confusing entry points.

### R6. Client-Local Preferences

Theme and language preferences are local client preferences. They should use the
client's persisted preference mechanism and should not introduce backend
storage, sync, or API requirements in Phase 1.

## Out Of Scope

- Recreating the old web desktop layout inside the client.
- Treating WSLg UI density as the design baseline.
- Reintroducing persistent sessions as the primary concept; Projects and live
  Sessions remain separate in the client model.
- Running terminal tools as side panels that shrink xterm.
- Syncing theme or language preferences through the backend.

## Acceptance Criteria

- [ ] Phase 1 is completed before broad feature migration begins: overlay
      foundation, Files/AI overlay conversion, theme/language foundation, and
      feature inventory.
- [ ] A feature inventory maps each web-side capability to a client destination,
      migration status, and intended UI pattern.
- [ ] Terminal tool panels open as right-side edge overlay drawers above xterm
      and do not change the terminal container size, rows, or columns merely by
      opening.
- [ ] Existing client Files and AI surfaces are converted from layout-consuming
      dock panels into overlay-style tools.
- [ ] Settings includes theme selection for `Midnight`, `Graphite`, `Forest`,
      and `Light`.
- [ ] New components and all Phase 1 touched components render through theme
      tokens; remaining legacy raw-color surfaces are listed as follow-up
      inventory items.
- [ ] Settings or Workspace chrome includes a clear Chinese/English language
      switch, and touched screens render through i18n.
- [ ] Theme and language preferences persist locally in the client without
      backend API, backend config, or server-side sync changes.
- [ ] Migrated features follow the current client visual style rather than the
      legacy web UI styling.
- [ ] Windows native Tauri screenshots are used for visual acceptance on common
      scaling such as 150%.
