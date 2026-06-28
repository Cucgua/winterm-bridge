# Implementation Plan: Trellis Context Inspector

## Preconditions

- Task remains in `planning` until this plan is reviewed and approved.
- Work is inline mode: the main session implements and checks directly.
- Existing dirty files outside this task must be preserved.
- First implementation version is read-only.
- Primary UX is structured Trellis rendering, not a raw Markdown/file browser.
- Parsing is deterministic only: do not use the LLM client, AI monitor, model endpoints, or API-key-backed summarization.

## Step 1: Backend Contract, Parser, And Tests

- Add `backend/internal/api/trellis.go`.
- Implement Trellis response structs.
- Implement helper functions:
  - `findTrellisRoot(startPath string) (projectRoot string, trellisRoot string, ok bool, err error)`
  - `resolvePathWithinTrellisRoot(rootPath string, rawPath string, allowRoot bool) (abs string, rel string, err error)`
  - `summarizeActiveTrellisTasks(tasksRoot string) []TrellisTaskSummary`
  - `summarizeArchivedTrellisTasks(tasksRoot string) []TrellisArchivedTaskGroup`
  - `summarizeTrellisWorkspace(workspaceRoot string) TrellisWorkspaceSummary`
  - `buildTaskReadiness(taskPath string, metadata TrellisTaskMetadata) TrellisTaskReadiness`
  - `parseTrellisMarkdown(content string) TrellisDocument`
  - `parseTaskJSON(path string) TrellisTaskMetadata`
  - `parseJSONLManifest(path string) TrellisContextManifest`
- Add handlers:
  - `HandleSessionTrellisSummary`
  - `HandleSessionTrellisTask`
  - `HandleSessionTrellisSpec`
  - `HandleSessionTrellisSource`
- Add focused Go tests for root discovery, containment, path traversal rejection, symlink escape rejection if practical, non-Trellis behavior, active task summary parsing, archived task summary parsing, task readiness computation, workspace overview without journal body, warning generation, Markdown heading/list/checklist/table extraction, and malformed-content fallback.

Review gate:

- Confirm all new backend endpoints are read-only.
- Confirm summary/task/spec/source all call `requireSessionAccess`.
- Confirm path handling cannot escape detected `.trellis`.
- Confirm structured parse failures return warnings and source fallback instead of a 500.
- Confirm no backend code path calls `internal/llm`, `monitor`, or external AI endpoints for Trellis parsing.
- Confirm workspace output never includes journal body text.

## Step 2: Backend Routing

- Update `backend/cmd/server/main.go` route suffix checks for:
  - `/trellis/summary`
  - `/trellis/task`
  - `/trellis/spec`
  - `/trellis/source`
- Keep route checks before generic session fallback.

Review gate:

- Confirm existing `/files`, `/git`, `/settings`, `/auto`, `/goal`, `/notify`, `/attach`, `/persist`, `/archive` routes still resolve to their original handlers.

## Step 3: Frontend API Surface

- Add Trellis TypeScript interfaces to `frontend/src/shared/core/api.ts`.
- Add API methods:
  - `getSessionTrellisSummary`
  - `getSessionTrellisTask`
  - `getSessionTrellisSpec`
  - `getSessionTrellisSource`
- Reuse `handleResponse` and current auth header patterns.

Review gate:

- Confirm all fields mirror backend JSON snake_case where applicable.
- Confirm no `any`, `@ts-ignore`, or unsafe type assertion is introduced.

## Step 4: Trellis Panel Component

- Add `frontend/src/shared/components/TrellisPanel.tsx`.
- Implement:
  - unavailable state
  - loading and error states
  - overview tab
  - warning center
  - spec package/layer cards
  - spec search/filter
  - active task cards and task detail view
  - archived task groups and archived task detail view
  - task search/status/priority/month filters
  - deterministic readiness indicators
  - workspace overview with developer/index/journal counts only
  - workflow phase/state view
  - parsed section renderer for headings, paragraphs, lists, checklists, tables, and code blocks
  - active task summary list
  - raw source fallback panel
- Keep the panel read-only: no edit, delete, upload, or command buttons.

Review gate:

- Confirm UI does not duplicate FileManager write controls.
- Confirm structured content is constrained and scrollable.
- Confirm long paths and filenames truncate without breaking layout.
- Confirm raw Markdown is not the primary display for supported Trellis artifacts.

## Step 5: Desktop Integration

- Update `frontend/src/routes/desktop/DesktopLayout.tsx`:
  - add Trellis panel open state
  - add a top-bar button
  - render `TrellisPanel` beside the terminal, similar to `FileManagerPanel`
  - close panel when no current session exists
- Decide interaction with the file manager:
  - MVP may allow both panels only if layout remains usable.
  - Prefer closing file panel when opening Trellis panel if horizontal space becomes cramped.

Review gate:

- Confirm terminal remains usable with the panel open.
- Confirm current session switching resets/refreshes Trellis state.

## Step 6: I18n

- Add English and Chinese translation keys in `frontend/src/shared/i18n/translations.ts`.
- Keep labels concise:
  - Trellis
  - Overview
  - Specs
  - Tasks
  - Workflow
  - Archived
  - Readiness
  - Warnings
  - Workspace
  - Acceptance
  - Implementation
  - Validation
  - Source
  - Read only
  - No Trellis project
  - Parse warning

Review gate:

- Confirm no hard-coded user-visible strings remain in the new panel except stable product names like `Trellis`.

## Step 7: Validation

Run the smallest meaningful checks first, then broader build checks:

```bash
cd backend && go test ./internal/api/...
cd backend && go test ./...
cd backend && go build -o /tmp/winterm-bridge-check ./cmd/server
cd frontend && npm run build
```

If `npm run build` is too slow or dependency state is missing, run at least:

```bash
cd frontend && npx tsc --noEmit
```

Manual smoke checks when a dev server is available:

- Open a session inside this repo and open the Trellis panel.
- Confirm Overview shows active task, spec packages, and workflow phase summary.
- Confirm Overview shows parse warnings and workspace overview without journal content.
- Open frontend/backend spec views and confirm checklist/table/section content renders as native UI, not only raw Markdown.
- Use spec search/filter to find one guideline by filename/title.
- Open `06-17-trellis-context-inspector` task and confirm PRD/design/implement sections render semantically.
- Use task search/status/priority filters on active and archived tasks.
- Confirm task cards show PRD/design/implement presence and acceptance progress.
- Open archived task `tasks/archive/2026-06/00-bootstrap-guidelines` and confirm completed metadata plus PRD status checklist render semantically.
- Use source fallback for one artifact and confirm raw text is still available.
- Try a path traversal request manually against `/trellis/source?path=../AGENTS.md` and confirm a 400.
- Open a session in `/tmp` or another non-Trellis directory and confirm unavailable state.
- Confirm Trellis parsing still works with AI settings disabled or no API key configured.

## Step 8: Finish Criteria

- PRD acceptance criteria are satisfied or explicitly marked deferred.
- `trellis-check` review is run after implementation.
- Any reusable implementation lesson is considered for `.trellis/spec/`.
- Current-task changes are separated from pre-existing dirty files before any commit plan.

## Rollback Points

- After Step 2, backend-only changes can be reverted without touching frontend.
- After Step 3, unused frontend API additions can be reverted without UI impact.
- After Step 5, the top-bar integration can be removed while keeping backend APIs for later.
