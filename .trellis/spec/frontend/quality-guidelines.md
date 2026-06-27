# Frontend Quality Guidelines

## Required Checks

For frontend code changes, the minimum useful check is:

```bash
npm run build
```

Run it from `client/`. It performs Tailwind CSS generation, TypeScript
checking, and Vite build.

There is currently no configured frontend test runner. If adding tests, choose
and configure the runner in the task rather than pretending tests already exist.

For docs-only Trellis spec changes, it is acceptable to skip the frontend build
and report it as not executed.

## Terminal And WebSocket Review

Terminal changes need extra review because regressions can look like rendering,
input, paste, resize, or connection bugs.

Check:

- Binary PTY frames still reach xterm as bytes.
- Text frames still parse as `ControlMessage`.
- Keepalive ping/pong remains at the socket layer.
- Stale WebSocket callbacks cannot overwrite current connection state.
- Flow control pause/resume messages still map to backend subscriber pause.
- Reconnect/session switch paths clear or preserve state intentionally.
- Resize events are sent after font load, container resize, viewport changes,
  and reconnects.

Reference:

- `client/src/core/socket.ts`
- `client/src/components/TerminalView.tsx`
- `backend/internal/pty/handler.go`

## Mobile Review

The current client tree is a Tauri desktop shell and has no active mobile route.
If a mobile surface is restored, add a dedicated mobile review checklist in the
same change instead of assuming old mobile files still exist.

## State And Async Review

Check:

- Optimistic updates roll back on API failure.
- Session lifecycle changes refresh full session lists when needed.
- Server switching updates both `api.baseUrl` and `socket.remoteBaseUrl`.
- AI workflow events do not store high-frequency `idle` events.
- Settings persisted through Zustand use `partialize`.

## UI And Accessibility Review

Current UI uses dense operational layouts rather than marketing pages. Keep new
screens task-focused.

Check:

- Use semantic theme tokens for shared surfaces.
- Icon buttons have `title` or visible labels.
- Buttons that trigger row actions call `stopPropagation`.
- Disabled/loading states prevent duplicate async actions.
- Text truncates or wraps within sidebars, cards, and mobile rows.
- Confirm destructive actions unless the backend enforces a safer flow.
- Do not steal terminal focus unintentionally.

## Code Style

- Keep imports ordered external first, then relative imports.
- Keep route-shell workflow logic in `App.tsx` unless a feature becomes large
  enough to justify a new shell boundary.
- Prefer `useCallback` for handlers passed deeply or used in effects.
- Avoid broad refactors when fixing a narrow UI bug.
- Do not introduce additional global state for data already owned by a store.

## Build Artifacts

Do not manually edit generated build assets. If a release build requires
embedded frontend assets, run the client build and review generated output
separately from source changes.

## Common Mistakes

- Updating one page state source while another page still reads stale backend
  data.
- Adding API fields in the backend without updating `api.ts`.
- Breaking terminal paste by bypassing xterm `paste` behavior.
- Adding browser listeners without cleanup.
- Treating a successful Vite build as a browser smoke test; it is a type/build
  check only.
