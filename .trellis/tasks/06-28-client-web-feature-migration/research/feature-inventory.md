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
| Files | `listSessionFiles`, `getSessionFileContent`, `saveSessionFileContent`, `deleteSessionFile`, `uploadSessionFile`, `downloadSessionFile` | Present as dock panel | Terminal | Right-side overlay drawer above xterm | Phase 1 | Convert existing client `FileManager` from layout-consuming dock to overlay. |
| AI monitor panel | `getAIConfig`, `setAIConfig`, `getAISummaries`, `getWorkflowEvents` | Present as dock panel and Settings tab | Terminal and Settings | Right-side overlay drawer above xterm; Settings config tab | Phase 1 foundation, later deepen | Preserve monitor interval semantics: monitor interval controls scan cadence, not auto-reply cooldown. |
| Auto-reply config and emergency stop | `getAutoConfig`, `setAutoConfig`, `stopAuto`, `getAutoLogs`, `clearAutoLogs` | Partially present in Settings; terminal logs not fully migrated | Settings and Terminal | Settings form plus right-side overlay log drawer | Later | Auto-reply cooldown is separate from AI monitor interval. |
| Email notifications | `getEmailConfig`, `setEmailConfig`, `testEmail` | Present in Settings | Settings | Settings form | Later polish | Keep as backend-owned server config, unlike client-only theme/language. |
| Tmux configuration | `getTmuxConfig`, `setTmuxConfig` | Present in Settings | Settings | Settings form | Phase 1 polish and later parity | Existing form is simplified versus legacy web; advanced options may be restored later. |
| Upload configuration | `getUploadConfig`, `setUploadConfig`, `clearUploadFiles`, `uploadFile` | Present in Settings | Settings and terminal paste flow | Settings form; terminal paste workflow | Later | Do not confuse generic upload config with session file upload. |
| IDE settings and context | `getIDEConfig`, `setIDEConfig`, `getIDEContext`, `testIDEConnection` | Settings config present; context panel not migrated | Settings and Terminal | Settings form plus right-side overlay drawer | Later | Session path/title should guide context matching. |
| Guest access | `createGuestPin`, `listGuestPins`, `revokeGuestPin`, `updateGuestPin` | API and translations present; no new client surface | Settings | Admin-only Settings section | Later | Only visible for admin servers. |
| Trellis browser | `getSessionTrellisSummary`, `getSessionTrellisTask`, `getSessionTrellisSpec`, `getSessionTrellisSource` | Initial read-only terminal overlay present | Terminal | Right-side overlay drawer above xterm | Phase 2 initial | Shows summary, active/archive tasks, specs, structured documents, warnings, and source fallback without resizing xterm. |
| AI request logs and presets | `getAILogs`, `getAILogDates`, `clearAILogs`, `getAIPresets`, `createAIPreset`, `deleteAIPreset`, `applyAIPreset` | API and translations present; not exposed in new client shell | Settings and Terminal AI overlay | Settings controls plus overlay log views | Later | Preserve existing API contracts. |
| Session actions | `enableSessionNotify`, `disableSessionNotify`, `enableSessionAuto`, `disableSessionAuto`, `setSessionGoal`, `persistSession`, `unpersistSession`, `archiveSession`, `unarchiveSession` | Some actions are obsolete under live-session/project model | Workspace and Terminal | Card actions, tab actions, compact confirmation modals | Later | Persistent/archive session concepts should not be reintroduced as primary client IA. |

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
| `TrellisPanel` | New terminal Trellis browser overlay | Built directly with semantic theme tokens and existing `TerminalOverlayDrawer`. | Add visual screenshots after native Windows client smoke testing. |
| Legacy web `frontend/src/shared/components/*` | Existing web components use their own layout/style assumptions | Use as behavior references only. | Rebuild each migrated capability into client style and theme tokens. |
