# Client Web Feature Migration Implementation Plan

## Pre-Flight

1. Review `client/package-lock.json` diff before implementation.
   - If it is only Windows/npm install churn, decide whether to revert or keep it
     in a separate dependency-maintenance commit.
   - Do not mix unrelated lockfile churn into UI migration commits.
2. Re-read applicable frontend specs before code edits:
   - `.trellis/spec/frontend/index.md`
   - `.trellis/spec/frontend/component-guidelines.md`
   - `.trellis/spec/frontend/visual-style.md`
   - `.trellis/spec/frontend/state-management.md`
   - `.trellis/spec/frontend/type-safety.md`
   - `.trellis/spec/frontend/quality-guidelines.md`

## Phase 1 Checklist

### 1. Feature Inventory

- Create a planning inventory for legacy web capabilities.
- Map each feature to:
  - target client destination
  - target UI pattern
  - migration phase
  - current client support status
  - API/backend dependency.

### 2. Terminal Overlay Foundation

- Add shared overlay primitives under `client/src/components/`.
- Keep overlay state in `App.tsx` or a narrow local store only if state becomes
  too broad for props.
- Replace current terminal dock-panel layout with overlay rendering above the
  terminal area.
- Preserve terminal focus behavior when closing overlays.

### 3. Convert Existing Files And AI

- Convert `FileManager` display from dock panel to right-side overlay drawer.
- Convert `AIPanel` display from dock panel to right-side overlay drawer.
- Remove layout behavior that changes terminal width when tools open.
- Confirm xterm container dimensions remain stable across open/close.

### 4. Theme Foundation

- Add a theme registry and typed theme ids.
- Add the first expanded theme set: `Midnight`, `Graphite`, `Forest`, and
  `Light`.
- Wire theme selection into Settings.
- Persist the selected theme as a client-local preference only.
- Define app surface, text, border, accent, status, and terminal palette tokens.
- Migrate every new component and every Phase 1 touched component to theme
  tokens.
- Do not add component-local raw color palettes.
- Track any untouched legacy raw-color surfaces in the feature/theme inventory
  with a follow-up phase.

### 5. Language Foundation

- Add a language selector to Settings or the Workspace shell according to the
  final product decision.
- Persist the selected language as a client-local preference only.
- Migrate touched shell strings to `client/src/i18n/translations.ts`.
- Ensure Chinese and English entries remain complete for touched keys.

## Validation

Run from `client/`:

```bash
npm run build
```

Run from `client/src-tauri/` when Rust/Tauri config or capabilities are touched:

```bash
cargo check
```

Also run:

```bash
git diff --check
```

Manual validation on Windows native Tauri is required before accepting visual
behavior:

```powershell
npm run tauri -- dev
```

Acceptance screenshots should include Windows display scaling at 150%.

## Risk Areas

- `TerminalView` and xterm sizing: overlay work must not trigger resize churn.
- `App.tsx`: already owns session, socket, and dock state; keep overlay changes
  narrow and avoid turning it into a catch-all UI store.
- Raw deep-blue colors in current shell: new and touched components must be
  tokenized; untouched legacy surfaces can be split into follow-up work only if
  they are explicitly inventoried.
- i18n migration: avoid partially translated mixed-language screens for touched
  controls.

## Stop Conditions

- If opening an overlay changes terminal rows/columns, stop and fix the overlay
  layout before migrating more tools.
- If full legacy theme tokenization becomes too large for Phase 1, stop and
  split the untouched cleanup into child tasks. New components and touched
  components still cannot bypass theme tokens.
- If a migrated web feature conflicts with the Projects/Sessions model, stop and
  update the PRD instead of copying the old behavior.
- If theme or language work appears to require backend API/config changes, stop
  and keep those preferences inside the client unless the product direction is
  explicitly changed.
