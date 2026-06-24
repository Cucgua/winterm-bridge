# Frontend Development Guidelines

These guides describe the React 18 + TypeScript frontend as it exists now:
Vite, Tailwind CSS semantic theme tokens, xterm.js terminal rendering, Zustand
stores, REST API helpers, and a binary/text WebSocket protocol.

## Guidelines Index

| Guide | Description | Status |
| --- | --- | --- |
| [Directory Structure](./directory-structure.md) | Route/shared ownership and file placement | Filled |
| [Component Guidelines](./component-guidelines.md) | Functional components, props, layout, terminal UI patterns | Filled |
| [Hook Guidelines](./hook-guidelines.md) | Custom hook boundaries, browser APIs, data fetching expectations | Filled |
| [State Management](./state-management.md) | Zustand stores, persisted settings, server state, optimistic updates | Filled |
| [Type Safety](./type-safety.md) | Strict TypeScript, API contracts, WebSocket message types | Filled |
| [Quality Guidelines](./quality-guidelines.md) | Build checks, UI review, terminal/mobile/accessibility risks | Filled |

## Pre-Development Checklist

Before editing frontend code, read:

- `directory-structure.md` when adding routes, shared components, hooks, stores,
  utilities, or API helpers.
- `component-guidelines.md` before changing UI structure, terminal views,
  settings panels, session lists, or mobile controls.
- `hook-guidelines.md` before adding browser listeners, viewport/keyboard
  behavior, theme logic, or shared stateful logic.
- `state-management.md` before changing Zustand stores, local storage keys,
  auth/session state, optimistic updates, or server selection.
- `type-safety.md` before changing API responses, config fields, WebSocket
  control messages, or JSON parsing.
- `quality-guidelines.md` before marking UI work complete.

Also read `../guides/index.md` when frontend changes affect backend API structs,
runtime config, WebSocket control messages, or repeated state update patterns.
