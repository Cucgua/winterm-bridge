# Frontend Directory Structure

## Runtime Shape

The frontend lives under `frontend/` and is a React 18 + TypeScript SPA built by
Vite. `npm run build` runs `tsc` first, then emits static assets into
`backend/cmd/server/static/` for Go `embed`.

Reference files:

- `frontend/package.json`
- `frontend/vite.config.ts`
- `backend/cmd/server/main.go`

## Top-Level Source Layout

`frontend/src/App.tsx`

- Owns route-level lazy loading.
- Routes `/desktop/*` to the desktop experience and `/mobile/*` to the mobile
  shell.
- Redirects `/` based on `useDeviceType`.
- Initializes theme through `ThemeInitializer`.

`frontend/src/routes/desktop/`

- Desktop-only shell and route components.
- `DesktopApp.tsx` owns desktop auth/session connection state.
- `DesktopLayout.tsx` owns sidebar, session controls, IDE popover, file panel,
  AI status display, and desktop toolbar composition.
- `DesktopSessionPicker.tsx` is the desktop session selection surface.

`frontend/src/routes/mobile/`

- Mobile-only shell, keyboard, touch, viewport, and terminal composition.
- `MobileShell.tsx` owns mobile auth/session connection state.
- `components/` contains mobile-specific controls such as keyboard panels,
  status bars, touch scrolling, and IME handling.
- `hooks/` contains mobile-only hooks such as connection status.

`frontend/src/shared/`

- Code used by both desktop and mobile.
- `core/api.ts` is the REST API type and client layer.
- `core/socket.ts` is the WebSocket protocol and singleton socket service.
- `components/` contains shared panels and widgets such as `TerminalView`,
  settings dialogs, session picker, file manager, auth screen, and AI status.
- `hooks/` contains shared browser hooks.
- `stores/` contains Zustand stores.
- `i18n/` contains translations and the translation store.
- `utils/` contains small shared helpers.

## Placement Rules

- Put desktop-only UI in `routes/desktop`.
- Put mobile-only UI and mobile browser workarounds in `routes/mobile`.
- Put reusable UI in `shared/components` only when both desktop and mobile can
  reasonably consume it.
- Put all API request/response types and API methods in `shared/core/api.ts`.
- Put WebSocket control-message types and connection behavior in
  `shared/core/socket.ts`.
- Put global client state in `shared/stores`; keep transient component state
  local.
- Put browser integration hooks in `shared/hooks` when shared, otherwise keep
  them route-local.

Avoid adding feature folders that duplicate the route/shared split. The current
codebase organizes by runtime surface first, then shared primitives.

## Naming Conventions

- Component files use `PascalCase.tsx`: `TerminalView.tsx`,
  `SessionPicker.tsx`, `AISettings.tsx`.
- Hooks use `use*.ts`: `useTheme.ts`, `useViewport.ts`.
- Stores use `*Store.ts`: `settingsStore.ts`, `serverStore.ts`.
- Utilities use lower camel case: `clipboard.ts`.
- Component props interfaces should be local unless they are reused across files.

## Build Output Rule

Do not treat `backend/cmd/server/static/` as handwritten source. It is generated
from the frontend build. Product changes should happen under `frontend/src`,
then be built into the backend static directory when a release/build requires
embedded assets.
