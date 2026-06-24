# Frontend State Management

## Store Library

The project uses Zustand. Persisted stores use `zustand/middleware` `persist`.
There is no Redux, Context-based app state, React Query, SWR, or schema
normalization layer.

Reference stores:

- `frontend/src/shared/stores/settingsStore.ts`
- `frontend/src/shared/stores/serverStore.ts`
- `frontend/src/shared/stores/aiStore.ts`
- `frontend/src/shared/stores/keyboardStore.ts`
- `frontend/src/shared/stores/ideStore.ts`
- `frontend/src/shared/i18n/i18nStore.ts`

## State Categories

Local component state:

- Auth UI state, loading/error flags, modal visibility, optimistic toggles, and
  form inputs stay in the component that owns the workflow.
- Examples: `DesktopApp.tsx`, `DesktopLayout.tsx`, `SessionPicker.tsx`,
  `MobileShell.tsx`.

Global persisted state:

- User preferences and cross-session client settings.
- Examples: `useSettingsStore` persisted as `winterm-settings`,
  `useServerStore` persisted as `winterm-servers`,
  `useI18n` persisted as `winterm-i18n`.

Global runtime state:

- AI summaries/workflow events, modifier-key latch state, IDE context.
- Examples: `useAIStore`, `useKeyboardStore`, `useIDEStore`.

Server state:

- Session lists, config forms, file listings, and git status are fetched through
  `api` and usually held by the route/component that displays them.
- There is no global server-state cache.

## Persisted Store Rules

Persist only fields that should survive reloads. Use `partialize` to avoid
accidentally persisting actions or volatile runtime state.

Reference:

- `settingsStore.ts` persists settings fields only.
- `serverStore.ts` persists configured servers and active server ID.
- `i18nStore.ts` persists language only.

When changing a persisted store:

- Keep the storage key stable unless intentionally migrating.
- Add `merge` or migration behavior when existing local storage may miss a
  required field, as `serverStore` does for the local server entry.
- Avoid persisting large logs, terminal buffers, file contents, or WebSocket
  state.

## Auth And Server Selection

Desktop multi-server auth uses `useServerStore` as the token source:

- `DesktopApp.tsx` installs `api.setTokenProvider`.
- `api.baseUrl` and `socket.remoteBaseUrl` are synced from the active server.
- Tokens and roles are stored per server entry.

Mobile still has legacy direct `localStorage` usage for `winterm_token` and
`winterm_session`. Treat that as current reality when editing mobile auth; do
not assume mobile already uses `serverStore`.

Reference:

- `frontend/src/routes/desktop/DesktopApp.tsx`
- `frontend/src/routes/mobile/MobileShell.tsx`
- `frontend/src/shared/core/api.ts`
- `frontend/src/shared/stores/serverStore.ts`

## Optimistic Updates

Optimistic updates are common for session persistence, archive state,
notification toggles, and auto-reply toggles.

Required pattern:

1. Update UI immediately.
2. Call the API.
3. Roll back to the previous value on failure.
4. Refresh full session state when identity or lifecycle may have changed.

Reference:

- `DesktopApp.handleTogglePersist`
- `DesktopApp.handleArchiveSession`
- `DesktopLayout.handleToggleNotify`
- `SessionPicker.handleToggleNotify`

## AI State

`useAIStore` keeps:

- `summaries` keyed by session ID.
- `aiEnabled`.
- Global `autoConfig`.
- Last 100 auto actions.
- Per-session workflow events, excluding high-frequency `idle` events.
- Per-session goals.

When handling socket control messages, route AI updates through this store. Do
not create separate AI summary state per component unless it is strictly
temporary UI state.

## Common Mistakes

- Persisting server responses that should be refreshed from the backend.
- Adding a new localStorage key when a Zustand store already owns the setting.
- Forgetting to reset AI or IDE state when switching sessions/servers.
- Updating optimistic UI without rollback.
- Treating mobile auth storage and desktop server storage as unified when they
  are not yet unified.
