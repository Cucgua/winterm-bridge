# Trellis Context API Contract

## Scenario: Read-Only Trellis Context Inspector

### 1. Scope / Trigger

- Trigger: session-scoped REST APIs expose `.trellis/` project context to the frontend.
- Scope: read-only inspection of Trellis workflow, specs, active tasks, archived tasks, task artifacts, and bounded source fallback.
- Non-goals: running Trellis commands, writing `.trellis/`, editing files, reading workspace journal bodies, or calling LLM providers.

### 2. Signatures

Routes are registered under `/api/sessions/{id}/...` and must be wrapped with `AuthMiddleware` plus `requireSessionAccess`.

| Method | Route | Query | Handler |
| --- | --- | --- | --- |
| `GET` | `/api/sessions/{id}/trellis/summary` | none | `HandleSessionTrellisSummary` |
| `GET` | `/api/sessions/{id}/trellis/task` | `path=tasks/<task>` or `path=tasks/archive/<YYYY-MM>/<task>` | `HandleSessionTrellisTask` |
| `GET` | `/api/sessions/{id}/trellis/spec` | `path=spec/<package>/.../<file>.md` | `HandleSessionTrellisSpec` |
| `GET` | `/api/sessions/{id}/trellis/source` | `path=workflow.md`, `spec/**/*.md`, or `tasks/**/*.{md,json,jsonl}` | `HandleSessionTrellisSource` |

### 3. Contracts

Root discovery:

- Resolve the session root through `resolveSessionRootPath(sessionID)`.
- Walk upward from that path until a directory named `.trellis` is found.
- If no root exists, summary returns `200` with `available:false` and `reason:"no_trellis_root"`.

Path rules:

- Client paths are relative to the detected `.trellis/` root.
- Absolute paths are rejected.
- `..` escapes are rejected before filesystem access.
- Symlink-resolved targets and parents must remain under `.trellis/`.
- Workspace paths are summary-only; source fallback must reject `workspace/**` so journal bodies are never returned.

Response shape:

- Backend JSON tags use `snake_case`.
- Frontend types in `frontend/src/shared/core/api.ts` mirror backend fields exactly.
- `task.json` fields that Trellis already stores as camelCase, such as `createdAt`, `completedAt`, and `relatedFiles`, stay camelCase in the response metadata.
- `summary.specs.packages` exposes user-facing coding specs from `spec/backend/**/*.md` and `spec/frontend/**/*.md`; every Markdown file under those two package roots must be listed so the UI can open non-`index.md` guideline documents directly.
- `spec/guides/**` is not included in the user-facing spec package list. Guides remain workflow/context material, not a frontend/backend spec document menu.
- Parse warnings use:

```json
{"code":"missing_artifact","severity":"warning","path":"tasks/example/prd.md","message":"task is missing prd.md"}
```

### 4. Validation & Error Matrix

| Condition | Status | Body |
| --- | --- | --- |
| non-GET method | `405` | plain `method not allowed` from the local route pattern |
| missing session id | `400` | `{"error":"missing session ID"}` |
| invalid or unauthorized token | `401` or `403` | standard auth/session-access error |
| no Trellis root on summary | `200` | `{"available":false,"reason":"no_trellis_root"}` |
| no Trellis root on detail/source | `404` | `{"error":"trellis root not found"}` |
| invalid artifact path | `400` | `{"error":"invalid trellis artifact path"}` |
| path escapes root | `400` | `{"error":"path escapes trellis root"}` |
| task path missing | `404` | `{"error":"task not found"}` |
| task path is not a directory | `400` | `{"error":"task path is not a directory"}` |
| source file missing | `404` | `{"error":"file not found"}` |
| source path is directory | `400` | `{"error":"path is a directory"}` |
| source file too large | `413` | `{"error":"file too large for inline viewing"}` |
| source file is binary | `415` | `{"error":"only text files are supported"}` |

### 5. Good/Base/Bad Cases

- Good: `GET /api/sessions/{id}/trellis/task?path=tasks/06-17-example` returns `task.json` metadata plus parsed PRD/design/implement documents.
- Good: `GET /api/sessions/{id}/trellis/task?path=tasks/archive/2026-06/00-bootstrap-guidelines` renders archived task detail with the same schema as active tasks.
- Base: `GET /api/sessions/{id}/trellis/source?path=spec/backend/index.md` returns bounded text source for fallback review.
- Bad: `GET /api/sessions/{id}/trellis/source?path=workspace/kangmeng/journal-1.md` must return `400`.
- Bad: `GET /api/sessions/{id}/trellis/source?path=../AGENTS.md` must return `400`.

### 6. Tests Required

Backend tests must cover:

- upward `.trellis` root discovery from nested session paths.
- path containment and traversal rejection.
- source allowlist rejection for `workspace/**`.
- active task and archived task discovery.
- `task.json` metadata parsing.
- PRD checklist totals and checked counts.
- Markdown headings, paragraphs, task lists, tables, and fenced code blocks.
- malformed JSONL warnings while preserving valid rows.
- workspace summary returns developer/index/journal counts only.

Frontend validation must cover at minimum:

- `npm run build` so strict TypeScript verifies API contract and translation keys.
- Browser smoke that opens the Trellis panel and sees overview counts, active tasks, archived tasks, spec layers, and workspace counts.

### 7. Wrong vs Correct

#### Wrong

```go
// Reads arbitrary files and can expose workspace journal bodies.
path := r.URL.Query().Get("path")
data, _ := os.ReadFile(filepath.Join(trellisRoot, path))
writeJSON(w, http.StatusOK, map[string]string{"content": string(data)})
```

#### Correct

```go
rawPath := strings.TrimSpace(r.URL.Query().Get("path"))
if !isValidTrellisSourcePath(rawPath) {
    writeError(w, http.StatusBadRequest, "invalid trellis artifact path")
    return
}
absPath, relPath, err := resolvePathWithinTrellisRoot(trellisRoot, rawPath, false)
if err != nil {
    writeError(w, http.StatusBadRequest, err.Error())
    return
}
info, data, err := readTrellisTextFile(absPath)
if err != nil {
    writeTrellisReadError(w, err)
    return
}
writeJSON(w, http.StatusOK, TrellisSourceResponse{
    Path: filepath.ToSlash(relPath),
    Content: string(data),
    Size: int64(len(data)),
    MtimeMS: info.ModTime().UnixMilli(),
})
```

The correct pattern validates the artifact allowlist first, then applies root containment, text-only checks, and the standard JSON error contract.
