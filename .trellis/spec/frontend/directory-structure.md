# Frontend Directory Structure

## Runtime Shape

The desktop client frontend lives under `client/`. It is a React 18 +
TypeScript SPA built by Vite, styled with Tailwind CSS, and packaged for the
Tauri desktop client.

Reference files:

- `client/package.json`
- `client/vite.config.ts`
- `client/src/App.tsx`
- `client/src/main.tsx`
- `client/src/index.css`

Run `npm run build` from `client/` to perform Tailwind CSS generation,
TypeScript checking, and Vite build. The Go backend and Tauri shell are outside
this directory.

## Top-Level Source Layout

`client/src/App.tsx`

- Owns top-level app state: init/auth/ready, page switching, live session tabs,
  active session, dock panel selection, and save-project dialog state.
- Installs the API token provider from `serverStore`.
- Syncs `api.baseUrl` and `socket.remoteBaseUrl` from the active server.
- Owns WebSocket attach/switch/disconnect behavior through `socket`.
- Polls AI summaries and merges live backend sessions into the top tab list.

`client/src/components/`

- Contains the desktop UI components:
  - `AuthScreen.tsx`
  - `SessionSelectPage.tsx`
  - `TabBar.tsx`
  - `TerminalView.tsx`
  - `DockPanel.tsx`
  - `FileManager.tsx`
  - `AIPanel.tsx`
  - `SettingsDialog.tsx`
  - `SaveProjectDialog.tsx`
- Component-specific subfolders are allowed when a component area becomes large,
  as with `components/settings/`.
- `AIPanel.tsx` owns the AI monitor panel tabs, including workflow events,
  auto-action logs, AI request logs, presets, and per-session AI controls.
  Do not look for or reintroduce a separate `AutoActionLogs.tsx` unless the
  AI panel is intentionally split as a focused refactor.
- `ActivityBar.tsx` and `Sidebar.tsx` are legacy desktop-shell components from
  the older layout. Do not route new work through them unless they are revived
  intentionally.

`client/src/core/`

- `api.ts` is the REST API type and client layer.
- `socket.ts` is the WebSocket protocol and singleton socket service.

`client/src/hooks/`

- Shared React hooks, currently including theme application through
  `useTheme.ts`.
- Add hooks here only when stateful browser logic is reused or materially
  simplifies a component.

`client/src/stores/`

- Zustand stores:
  - `settingsStore.ts`
  - `serverStore.ts`
  - `aiStore.ts`
  - `ideStore.ts`
- Persist only preferences and cross-launch settings. Do not persist live
  server state such as session lists, terminal buffers, or WebSocket state.

`client/src/i18n/`

- Translation tables and i18n store.

`client/src/utils/`

- Small reusable helpers:
  - clipboard helpers
  - status color mapping
  - terminal key utilities
  - time formatting
  - terminal background normalization

## Placement Rules

- Put top-level workflow state in `App.tsx` when it coordinates auth, server,
  socket, session lifecycle, or page routing.
- Put reusable visual units in `components/`.
- Put all API request/response types and API methods in `core/api.ts`.
- Put WebSocket control-message types and connection behavior in
  `core/socket.ts`.
- Put global client state in `stores/`; keep transient component state local.
- Put browser integration hooks in `hooks/` only when the logic is shared or
  complex enough to justify extraction.
- Put small pure helpers in `utils/`.

Avoid adding a second route/shared hierarchy. The current client is a compact
desktop app shell; keep ownership obvious and local unless a feature truly needs
to become a separate subsystem.

## Naming Conventions

- Component files use `PascalCase.tsx`: `TerminalView.tsx`,
  `SessionSelectPage.tsx`, `SaveProjectDialog.tsx`.
- Hooks use `use*.ts`: `useTheme.ts`.
- Stores use `*Store.ts`: `settingsStore.ts`, `serverStore.ts`.
- Utilities use lower camel case: `statusColor.ts`, `terminalKeys.ts`.
- Component props interfaces should be local unless reused across files.

## Generated Output Rule

Do not manually edit generated frontend assets. Product changes should happen
under `client/src`, then `npm run build` should regenerate build artifacts.
