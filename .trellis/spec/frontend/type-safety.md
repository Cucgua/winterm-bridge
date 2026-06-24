# Frontend Type Safety

## TypeScript Mode

The frontend runs strict TypeScript. `frontend/tsconfig.json` enables:

- `strict`
- `noUnusedLocals`
- `noUnusedParameters`
- `noFallthroughCasesInSwitch`
- `isolatedModules`
- `moduleResolution: "bundler"`

Do not add `as any`, `@ts-ignore`, or `@ts-expect-error` to bypass type errors.
Fix the contract or narrow the type.

## API Types

`frontend/src/shared/core/api.ts` is the frontend source of truth for backend
REST API types and the typed API client.

Rules:

- Mirror backend JSON field names exactly, including `snake_case`.
- Add request/response interfaces before adding API methods.
- Keep backend config structs and frontend interfaces aligned.
- Use narrow string unions for known enum-like fields where the backend returns
  stable values.

Reference pairs:

- `api.SessionInfo` and frontend `SessionInfo`.
- `config.AIMonitorConfig` and frontend `AIConfig`.
- `config.AutoConfig` and frontend `AutoConfig`.
- `config.TmuxConfig` and frontend `TmuxConfig`.
- `monitor.SummaryMessage` and socket `ControlMessage`.

After backend API shape changes, update `api.ts` in the same task.

## API Client Pattern

Use the singleton `api` client. It centralizes:

- Base URL handling for local or remote servers.
- Token provider fallback.
- Authorization header injection.
- JSON response parsing.
- API error extraction from `{"error": "..."}`
- Blob responses for downloads.

Do not add direct component-level `fetch` calls for backend APIs.

Reference:

- `ApiClient.request`
- `ApiClient.handleResponse`
- `api.setTokenProvider`

## WebSocket Message Types

The terminal WebSocket protocol is split:

- Binary frames are PTY data.
- Text frames are JSON control messages.

All frontend control-message types belong in `shared/core/socket.ts`.

Current `ControlMessage.type` values include:

- `resize`, `ping`, `pong`, `error`, `title`, `pause`, `resume`
- `ai_summary`
- `ai_auto_action`
- `ai_workflow_event`
- `ai_goal_misaligned`

When adding a new text control message, update:

1. Backend producer/consumer in `pty` or `monitor`.
2. `ControlMessage` in `socket.ts`.
3. `SocketService.handleControlMessage`.
4. Any store/component consuming it.

## Runtime Validation

There is no Zod/Yup/io-ts validation layer. Runtime checks are local and
minimal:

- `JSON.parse` in socket message handling is wrapped in `try/catch`.
- API error responses are parsed defensively.
- Browser API fallbacks catch clipboard and WebSocket URL failures.

If accepting untrusted structured data from a new external source, either add a
small local type guard or validate at the backend boundary. Do not cast unknown
payloads directly into application state.

## Type Organization

- Shared API/domain types: `shared/core/api.ts`.
- Socket control types: `shared/core/socket.ts`.
- Store-local types: same store file.
- Component-local props and local UI unions: same component file.
- Translation keys and languages: `shared/i18n/translations.ts`.

Avoid creating duplicate interfaces with the same backend fields in component
files.

## Common Mistakes

- Using camelCase in frontend API interfaces for backend `snake_case` fields.
- Extending `ControlMessage` in a component instead of `socket.ts`.
- Persisting partial objects without typing migration/merge behavior.
- Treating caught errors as always `Error`; existing code correctly checks
  `err instanceof Error`.
