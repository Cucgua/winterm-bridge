# Web To Client Feature Inventory

## Purpose

Track which legacy web-side capabilities should be available in the Tauri
client, where they belong in the new Workspace / Projects / Sessions /
Terminal model, and which UI pattern should be used.

This inventory is planning evidence. It is not runtime code.

## Capability Map

| Capability | Backend/API evidence | Current client status | Target client location | UI pattern | Phase | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Live sessions | `client/src/core/api.ts` `listSessions`, `createSession`, `deleteSession`, `attachSession` | Present | Workspace Sessions, Terminal tabs | Workspace cards and top tabs | Existing | Sessions are live-only. Closing a session kills the tmux session after confirmation. |
| Projects | `listProjects`, `createProject`, `deleteProject`, `createProjectSession`, `createProjectFromSession` | Present | Workspace Projects | Project cards; clicking project creates a new live session | Existing | Projects remain separate from live sessions. |
| Files | `listSessionFiles`, `getSessionFileContent`, `saveSessionFileContent`, `deleteSessionFile`, `uploadSessionFile`, `downloadSessionFile` | Migrated | Terminal | Right-side overlay drawer above xterm | Done | Existing client `FileManager` now renders through terminal overlay behavior and no longer consumes terminal layout width. |
| AI monitor panel | `getAIConfig`, `setAIConfig`, `getAISummaries`, `getWorkflowEvents` | Migrated | Terminal and Settings | Right-side overlay drawer above xterm; Settings config tab | Done | Monitor config, connection test, request log toggle, workflow events, and status summaries are available. Monitor interval remains separate from auto-reply cooldown. |
| Auto-reply config and emergency stop | `getAutoConfig`, `setAutoConfig`, `stopAuto`, `getAutoLogs`, `clearAutoLogs` | Migrated | Settings and Terminal | Settings form plus AI overlay tabs | Done | Global config, allowed tags, deny keywords, extra params, emergency stop, auto-action logs, and clear action are available. |
| Email notifications | `getEmailConfig`, `setEmailConfig`, `testEmail` | Migrated | Settings | Settings form | Done | Backend-owned server config remains in Settings; this is intentionally not a client-local preference. |
| Tmux configuration | `getTmuxConfig`, `setTmuxConfig` | Migrated | Settings | Settings form | Done | Common and advanced options are exposed, including title format, history, escape time, indices, focus/events/activity/bell settings. |
| Upload configuration | `getUploadConfig`, `setUploadConfig`, `clearUploadFiles`, `uploadFile` | Migrated | Settings and terminal paste flow | Settings form; terminal paste workflow | Done | Settings exposes upload config and clear files. User confirmed pasted-image upload/copy flow works in the client. Do not confuse generic upload config with session file upload. |
| IDE settings and context | `getIDEConfig`, `setIDEConfig`, `getIDEContext`, `testIDEConnection` | Migrated | Settings and Terminal | Settings form plus right-side overlay drawer | Done | Settings exposes config/test controls; terminal IDE context overlay is session path/title aware and supports copy actions. |
| Guest access | `createGuestPin`, `listGuestPins`, `revokeGuestPin`, `updateGuestPin` | Migrated | Settings | Admin-only Settings section | Done | Admin-only Settings section supports PIN generation, authorization editing, and revocation. |
| Trellis browser | `getSessionTrellisSummary`, `getSessionTrellisTask`, `getSessionTrellisSpec`, `getSessionTrellisSource` | Migrated | Terminal | Wide document overlay above xterm | Done | Shows summary, active/archive tasks, specs, structured documents, warnings, and source fallback with left index + right reading/source area, without resizing xterm. |
| AI request logs and presets | `getAILogs`, `getAILogDates`, `clearAILogs`, `getAIPresets`, `createAIPreset`, `deleteAIPreset`, `applyAIPreset` | Migrated | Settings and Terminal AI overlay | Settings controls plus AI overlay log/preset tabs | Done | Request logs, date filter, clear action, and preset create/apply/delete are exposed in client style. |
| Session controls | `enableSessionNotify`, `disableSessionNotify`, `enableSessionAuto`, `disableSessionAuto`, `setSessionGoal` | Migrated | Terminal AI overlay | AI overlay session control tab | Done | Notify, auto mode, and per-session goal editing are retained because they fit the live-session model. |
| Legacy session actions | `persistSession`, `unpersistSession`, `archiveSession`, `unarchiveSession`; web-era duplicate/restart/tmux-copy/copy-mode UI | Not migrated by decision | None | Out of scope | Not planned | User confirmed these actions are no longer needed. Persist/archive are legacy compatibility APIs after the product model moved to Projects as durable entities and live Sessions as runtime state. |

## Theme Inventory

All new and touched components must use theme tokens. Existing raw-color debt
that is not converted in Phase 1 must remain visible here.

| Surface | Evidence | Phase 1 treatment | Follow-up |
| --- | --- | --- | --- |
| `TabBar` terminal chrome | Raw `#101426`, `#11182b`, white alpha utilities | Converted touched top-bar/menu surfaces to theme tokens while adding overlays. | Audit remaining status accent classes when adding deeper tab actions. |
| `SettingsDialog` embedded page | Raw `#080d1d`, `#0f1628`, `#101729`, `#1a2135` | Converted Settings shell, Appearance controls, and touched config form controls to theme tokens. | Continue token review as individual config tabs are deepened. |
| `SessionSelectPage` workspace cards | Raw `#080d1d`, `#0f1628`, `#101729`, `#1a2135`, `#202841` plus project/session palettes | Converted workspace shell, cards, dialogs, and card icon treatment to theme tokens. | Visual acceptance screenshots for all four themes on native Windows. |
| Project/session card icon tiles | Previously local palettes, then incorrectly tied to theme `accent` | Restored stable identity color behavior through centralized `workspaceIdentity.ts`. | Keep identity tiles stable across themes; theme chrome icons still follow tokens. |
| `FileManager` and `AIPanel` | Dock-specific borders and local headers | Removed duplicated dock chrome where hosted inside overlay drawer; inner surfaces use theme tokens. | Replace emoji/event icon styling with theme-governed icon treatment later. |
| `TrellisPanel` | New terminal Trellis browser overlay | Built directly with semantic theme tokens, existing `TerminalOverlayDrawer`, and a separate wide overlay width preference. | Add visual screenshots after native Windows client smoke testing. |
| Legacy web `frontend/src/shared/components/*` | Existing web components use their own layout/style assumptions | Use as behavior references only. | Rebuild each migrated capability into client style and theme tokens. |
