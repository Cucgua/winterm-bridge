# Design: Trellis Context Inspector

## Scope

Add a read-only Trellis context reader to WinTerm Bridge desktop sessions. The feature is session-scoped: it uses the current tmux pane path of the selected session as the starting point, discovers the nearest `.trellis/` ancestor, interprets Trellis artifacts into structured data, and renders that data with native UI components.

This is intentionally separate from the general file manager. The file manager is a broad session-root file tool with write capabilities for admins. The Trellis inspector is a narrow project-context reader with stricter read-only semantics, Trellis-specific parsing, and semantic views for specs/tasks/workflow.

## Existing Code Boundaries

- Backend routing lives in `backend/cmd/server/main.go` using `http.NewServeMux()` and suffix checks under `/api/sessions/{id}/...`.
- Session current path is available through `session.Session.GetCurrentPath()` and is already used by `backend/internal/api/files.go`.
- Session authorization is enforced with `h.requireSessionAccess(w, r, sessionID)`.
- General file APIs already provide useful local patterns:
  - session ID parsing through `parseSessionIDFromPath`
  - root resolution through `resolveSessionRootPath`
  - JSON errors through `writeError`
  - text and size checks through `isTextContent` and `maxEditableFileSize`
  - symlink-aware containment through `isPathInsideRoot`
- Desktop top-bar tools and right-side panels already exist in `frontend/src/routes/desktop/DesktopLayout.tsx` and `frontend/src/shared/components/FileManagerPanel.tsx`.
- API types and fetch helpers live in `frontend/src/shared/core/api.ts`.
- Display strings live in `frontend/src/shared/i18n/translations.ts`.
- Frontend has no Markdown renderer dependency today. MVP should avoid adding one unless there is a clear need.

## Backend API

Add a new backend file, likely `backend/internal/api/trellis.go`, to keep Trellis logic isolated from the general file manager.

### GET `/api/sessions/{id}/trellis/summary`

Returns whether the session is inside a Trellis project and a structured overview.

Response:

```json
{
  "available": true,
  "project_root": "/home/user/project",
  "trellis_root": "/home/user/project/.trellis",
  "current_path": "/home/user/project/backend",
  "capabilities": {
    "workflow": true,
    "spec": true,
    "tasks": true,
    "workspace": true
  },
  "specs": {
    "packages": [
      {
        "name": "frontend",
        "layers": [
          {
            "name": "index",
            "title": "Frontend Guidelines",
            "path": "spec/frontend/index.md",
            "checklist_count": 7,
            "guideline_count": 6
          }
        ]
      }
    ]
  },
  "active_tasks": [
    {
      "id": "trellis-context-inspector",
      "title": "Add Trellis Context Inspector",
      "status": "planning",
      "priority": "P2",
      "assignee": "kangmeng",
      "path": "tasks/06-17-trellis-context-inspector",
      "has_prd": true,
      "has_design": true,
      "has_implement": true,
      "acceptance_total": 13,
      "acceptance_done": 0
    }
  ],
  "archived_tasks": [
    {
      "archive_month": "2026-06",
      "tasks": [
        {
          "id": "00-bootstrap-guidelines",
          "title": "Bootstrap Guidelines",
          "status": "completed",
          "priority": "P1",
          "assignee": "kangmeng",
          "path": "tasks/archive/2026-06/00-bootstrap-guidelines",
          "completed_at": "2026-06-17",
          "has_prd": true,
          "has_design": false,
          "has_implement": false,
          "acceptance_total": 3,
          "acceptance_done": 3
        }
      ]
    }
  ],
  "workflow": {
    "title": "Development Workflow",
    "phases": [
      {
        "name": "Phase 1: Plan",
        "summary": "classify, get task-creation consent, then write planning artifacts",
        "states": ["planning", "planning-inline"]
      }
    ]
  },
  "workspace": {
    "exists": true,
    "developers": [
      {
        "name": "kangmeng",
        "index_path": "workspace/kangmeng/index.md",
        "has_index": true,
        "journal_count": 1
      }
    ]
  },
  "warnings": []
}
```

When no `.trellis/` ancestor is found:

```json
{
  "available": false,
  "current_path": "/tmp",
  "reason": "no_trellis_root"
}
```

### GET `/api/sessions/{id}/trellis/task?path=<task-path>`

Returns one parsed task detail. The `path` must point to either an active task directory under `.trellis/tasks/<task-dir>` or an archived task directory under `.trellis/tasks/archive/<YYYY-MM>/<task-dir>`.

Valid examples:

- `tasks/06-17-trellis-context-inspector`
- `tasks/archive/2026-06/00-bootstrap-guidelines`

Response:

```json
{
  "path": "tasks/06-17-trellis-context-inspector",
  "metadata": {
    "id": "trellis-context-inspector",
    "title": "Add Trellis Context Inspector",
    "status": "planning",
    "priority": "P2",
    "assignee": "kangmeng"
  },
  "prd": {
    "title": "Add Trellis Context Inspector",
    "sections": [
      {
        "title": "Goal",
        "level": 2,
        "kind": "paragraphs",
        "items": [{"text": "When a terminal session..."}]
      },
      {
        "title": "Acceptance Criteria",
        "level": 2,
        "kind": "checklist",
        "items": [
          {
            "text": "The desktop UI exposes a Trellis entry point...",
            "checked": false
          }
        ]
      }
    ],
    "raw_path": "tasks/06-17-trellis-context-inspector/prd.md"
  },
  "design": {
    "sections": []
  },
  "implementation": {
    "sections": []
  },
  "research": [],
  "context_manifests": {
    "implement_count": 0,
    "check_count": 0
  },
  "readiness": {
    "has_prd": true,
    "has_design": true,
    "has_implement": true,
    "has_research": false,
    "research_count": 0,
    "related_files_count": 0,
    "acceptance_total": 13,
    "acceptance_done": 0,
    "implement_context_count": 0,
    "check_context_count": 0
  },
  "warnings": []
}
```

### GET `/api/sessions/{id}/trellis/spec?path=spec/<package>/<file>.md`

Returns one parsed spec or spec index.

Response:

```json
{
  "path": "spec/frontend/index.md",
  "title": "Frontend Guidelines",
  "kind": "spec",
  "sections": [
    {
      "title": "Pre-Development Checklist",
      "level": 2,
      "kind": "checklist",
      "items": [
        {
          "text": "Read component guidelines before editing React components",
          "checked": false
        }
      ]
    }
  ],
  "links": [
    {
      "label": "component-guidelines.md",
      "path": "spec/frontend/component-guidelines.md"
    }
  ],
  "warnings": []
}
```

### GET `/api/sessions/{id}/trellis/source?path=<relative>`

Reads raw text under `.trellis/` for fallback/source view. This is not the primary UI path.

Response:

```json
{
  "path": "tasks/06-17-trellis-context-inspector/prd.md",
  "content": "# Add Trellis Context Inspector\n...",
  "size": 1234,
  "mtime_ms": 1781650000000
}
```

Errors:

| Condition | Status | Message |
| --- | --- | --- |
| no session ID | 400 | `missing session ID` |
| unauthorized session | existing auth response | existing auth response |
| no current path | 400 | `session current_path is unavailable` |
| no `.trellis` ancestor | 404 | `trellis root not found` |
| absolute path | 400 | `absolute path is not allowed` |
| path escapes `.trellis` root | 400 | `path escapes trellis root` |
| invalid task/spec path | 400 | `invalid trellis artifact path` |
| missing file | 404 | `file not found` |
| directory requested as file | 400 | `path is a directory` |
| file too large | 413 | `file too large for inline viewing` |
| binary file | 415 | `only text files are supported` |

## Trellis Root Discovery

Algorithm:

1. Resolve the session current path with existing `resolveSessionRootPath`.
2. If the path is a file, use its parent directory; session current paths are expected to be directories, but this keeps the helper defensive.
3. Walk upward:
   - check `<dir>/.trellis`
   - if it is an existing directory, return it and the project root.
   - stop at filesystem root.
4. Add a maximum walk count as a guardrail, e.g. 64 parent directories.

This mirrors Trellis docs conceptually: current working directory leads to `.trellis/` discovery and then workflow/task/spec context.

## Path Safety

The Trellis inspector should not reuse the session current path as the content root. Its content root is the detected `.trellis/` directory.

Use a helper similar to `resolvePathWithinRoot`, but with Trellis-specific error messages and read-only assumptions:

- trim and clean relative path.
- reject absolute paths.
- reject `..` escapes.
- resolve root symlinks where possible.
- resolve existing target symlinks and require `isPathInsideRoot(rootResolved, resolvedTarget)`.
- source fallback reads only text files and enforces a size cap.

## Trellis Parsing Model

The backend should parse enough Markdown structure to support a useful native UI without taking a full Markdown dependency in MVP.

The MVP parser is deterministic only. It must not call the existing LLM provider, AI monitor, or any external model endpoint. Every rendered field must come from explicit file content and fixed parser rules.

Supported blocks:

- ATX headings: `#`, `##`, `###`, etc.
- unordered lists: `- item`, `* item`
- ordered lists: `1. item`
- task lists: `- [ ] item`, `- [x] item`
- fenced code blocks
- simple pipe tables
- paragraphs
- inline links in the form `[label](relative.md)` for navigation hints

Parser output should be semantic and tolerant:

```go
type TrellisSection struct {
    Title    string               `json:"title"`
    Level    int                  `json:"level"`
    Kind     string               `json:"kind"` // paragraphs, checklist, list, table, code, mixed
    Items    []TrellisSectionItem `json:"items,omitempty"`
    Children []TrellisSection     `json:"children,omitempty"`
    Raw      string               `json:"raw,omitempty"`
}
```

Rules:

- Preserve raw text for unsupported blocks.
- Never fail the whole artifact because one section cannot be parsed.
- Return parser warnings alongside structured data.
- Parse `task.json` with `encoding/json` and treat missing legacy fields as optional.
- Count acceptance criteria by detecting an `Acceptance Criteria` section with task-list items.
- Count completed checklist items from checked task-list markers.
- Parse `implement.jsonl` and `check.jsonl` line by line, skipping `_example` rows.
- Discover active tasks from direct children of `.trellis/tasks/` that contain `task.json`, excluding the `archive` directory.
- Discover archived tasks from `.trellis/tasks/archive/<YYYY-MM>/<task>/task.json` and group them by archive month.
- Compute task readiness strictly from artifact presence, checklist counts, context manifest counts, research file count, and task metadata.
- Discover workspace overview from `.trellis/workspace/<developer>/`, but return only index presence and journal counts. Do not return journal body content in MVP.
- Do not infer status, risk, or completion unless it is directly represented by `task.json`, checklist markers, or explicit artifact text.

## Warnings Model

Every summary/detail response can include warnings. Warnings should be deterministic and actionable:

```json
{
  "code": "missing_artifact",
  "severity": "warning",
  "path": "tasks/example/design.md",
  "message": "design.md is missing"
}
```

Initial warning codes:

- `invalid_task_json`
- `missing_artifact`
- `malformed_jsonl`
- `unresolved_spec_link`
- `unsupported_markdown`
- `invalid_archive_shape`
- `source_too_large`

The frontend should show an aggregate warning center in Overview and local warnings in task/spec detail views.

## Frontend API Types

Add types to `frontend/src/shared/core/api.ts`:

```ts
export interface TrellisSummaryResponse {
  available: boolean;
  project_root?: string;
  trellis_root?: string;
  current_path?: string;
  reason?: string;
  capabilities?: TrellisCapabilities;
  specs?: TrellisSpecSummary;
  active_tasks?: TrellisTaskSummary[];
  archived_tasks?: TrellisArchivedTaskGroup[];
  workflow?: TrellisWorkflowSummary;
  workspace?: TrellisWorkspaceSummary;
  warnings?: TrellisWarning[];
}

export interface TrellisTaskSummary {
  id: string;
  title: string;
  status: string;
  priority?: string;
  assignee?: string;
  path: string;
  has_prd: boolean;
  has_design: boolean;
  has_implement: boolean;
  acceptance_total: number;
  acceptance_done: number;
  completed_at?: string;
  readiness?: TrellisTaskReadiness;
}

export interface TrellisArchivedTaskGroup {
  archive_month: string;
  tasks: TrellisTaskSummary[];
}

export interface TrellisTaskReadiness {
  has_prd: boolean;
  has_design: boolean;
  has_implement: boolean;
  has_research: boolean;
  research_count: number;
  related_files_count: number;
  acceptance_total: number;
  acceptance_done: number;
  implement_context_count: number;
  check_context_count: number;
}

export interface TrellisWarning {
  code: string;
  severity: 'info' | 'warning' | 'error';
  path?: string;
  message: string;
}

export interface TrellisWorkspaceSummary {
  exists: boolean;
  developers: TrellisWorkspaceDeveloper[];
}

export interface TrellisWorkspaceDeveloper {
  name: string;
  index_path?: string;
  has_index: boolean;
  journal_count: number;
}

export interface TrellisDocument {
  title: string;
  sections: TrellisSection[];
  raw_path: string;
  warnings?: string[];
}

export interface TrellisArtifactSourceResponse {
  path: string;
  content: string;
  size: number;
  mtime_ms: number;
}
```

Add API methods:

- `getSessionTrellisSummary(sessionId)`
- `getSessionTrellisTask(sessionId, path)`
- `getSessionTrellisSpec(sessionId, path)`
- `getSessionTrellisSource(sessionId, path)`

## Desktop UI

Add a new component, likely `frontend/src/shared/components/TrellisPanel.tsx`.

Panel behavior:

- Opens from a top-bar button in `DesktopLayout`.
- Closes automatically when `currentSessionId` becomes empty.
- Fetches summary when opened or when the session changes.
- If unavailable, shows a compact non-Trellis state using the current path when available.
- If available:
  - Header shows project basename and a read-only badge.
  - Tabs or segmented controls: `Overview`, `Specs`, `Tasks`, `Workflow`.
  - Overview shows active task cards, recent archived task cards, readiness totals, parse warnings, workspace overview, spec package counts, and workflow phase summary.
  - Specs view shows package/layer cards, supports title/path filtering, and renders selected specs as checklist/table/section UI.
  - Tasks view shows active tasks and archived task groups, supports client-side search/status/priority/month filters, and opens the same task detail view for PRD/design/implement content.
  - Workflow view shows phase blocks and workflow-state snippets as native sections.
  - Raw source is available behind a secondary action, not the default reading path.

Layout:

- Reuse the right-side panel pattern used by `FileManagerPanel`.
- Width should support structured detail, e.g. `w-[520px]` or responsive max width, because task/spec semantic views need more horizontal space than a file list.
- Avoid nested cards; use toolbar bands, list rows, and a viewer pane.
- No Markdown rendering dependency in MVP. Render parsed sections with React components; use monospace raw source only as fallback.

## UI State

Minimum state in `TrellisPanel`:

- `summary`
- `activeTab`
- `selectedTaskPath`
- `selectedSpecPath`
- `taskDetail`
- `specDetail`
- `sourceView`
- `taskSearch`
- `taskStatusFilter`
- `taskPriorityFilter`
- `archiveMonthFilter`
- `specSearch`
- `loadingSummary`
- `loadingDetail`
- `error`

No global Zustand store is needed for MVP because the panel is session-local and transient.

## Routing Integration

Extend the `/api/sessions/` suffix router in `backend/cmd/server/main.go`:

- `/trellis/summary`
- `/trellis/task`
- `/trellis/spec`
- `/trellis/source`

These checks should appear before the generic `/api/sessions/{id}` fallback.

## Security And Privacy

- Reuse existing bearer auth and session access checks.
- Do not require admin for read-only inspector; guest session access is sufficient.
- Do not expose `.trellis/.runtime` in summary or quick links.
- Do not return `.trellis/workspace/**/journal-*.md` body content in MVP.
- Do not expose absolute filesystem paths in the UI unless needed for diagnostics; even if API returns roots, UI should display project basename or relative `.trellis` path.
- Do not execute shell commands.
- Do not write any file.

## Compatibility

- Existing sessions without tmux current path should keep current behavior and return a controlled Trellis status error.
- Projects without Trellis should not affect terminal use.
- The API should work on Linux paths and Windows-mounted paths because it uses Go `filepath`.
- No frontend dependency changes are required for the deterministic parser MVP.

## Tradeoffs

- A small in-house parser will not handle every Markdown edge case, but it is enough for Trellis-generated artifacts and avoids raw HTML/Markdown rendering risk.
- Not running `task.py` means the panel cannot show computed runtime state beyond parsed files and task metadata, but it avoids command side effects and platform differences.
- Not using LLM summarization means the UI will be less "smart" in the first version, but the output is deterministic, testable, fast, and does not require model credentials.
- Returning absolute roots in API helps debugging, but the UI should avoid overexposing them when not needed.

## Rollback

The feature is additive. Rollback is:

- remove Trellis route suffixes from `main.go`
- remove `backend/internal/api/trellis.go` and tests
- remove frontend Trellis API methods/types
- remove `TrellisPanel` and the top-bar button
- remove translation keys

No persisted runtime schema or config migration is involved.
