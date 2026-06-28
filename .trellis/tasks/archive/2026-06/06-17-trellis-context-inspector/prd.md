# Add Trellis Context Inspector

## Goal

When a terminal session is currently inside a Trellis-managed repository, WinTerm Bridge should detect the nearest `.trellis/` directory, interpret Trellis artifacts into structured project context, and render that context with native WinTerm Bridge UI components.

The first version is a read-only Trellis context reader, not a Trellis command runner and not just a Markdown file browser. It should help the user quickly understand specs, tasks, workflow state, and planning artifacts without needing to manually open raw `.md` files.

## Requirements

- Detect Trellis context per terminal session by walking upward from the session's current tmux pane path until a `.trellis/` directory is found.
- Expose read-only backend APIs that parse Trellis files into structured responses:
  - project/context summary
  - spec packages, layers, guideline indexes, checklists, and links
  - active task summaries from `.trellis/tasks/<task>/`
  - archived task summaries from `.trellis/tasks/archive/<YYYY-MM>/<task>/`
  - task detail for both active and archived tasks, including `task.json`, PRD, design, implementation plan, research, and context manifests
  - workflow phase/state summary from `.trellis/workflow.md`
- Surface the feature in the desktop terminal UI as a Trellis dashboard/panel that can be opened from the top bar.
- Show a clear non-Trellis state when the current session path has no `.trellis/` ancestor.
- Render interpreted Trellis content as first-class UI, not as raw Markdown by default:
  - specs as package/layer cards, checklists, guideline tables, and linked detail sections
  - active tasks as status cards with title, priority, assignee, branch, dates, related files, and progress
  - archived tasks grouped by archive month with completed date, status, related files, and preserved PRD/detail content
  - PRD/design/implement files as semantic sections such as Goal, Requirements, Acceptance Criteria, Design, Implementation Steps, Validation, Risks, and Open Questions
  - workflow as phase/state blocks extracted from `.trellis/workflow.md`
- Provide search and filtering so the structured view remains useful as Trellis content grows:
  - task title keyword search
  - task status filter
  - task priority filter
  - archived task month grouping and filtering
  - spec package/layer/file title filtering
- Show deterministic task readiness/completeness indicators:
  - PRD/design/implement presence
  - acceptance criteria total and checked count
  - `implement.jsonl` and `check.jsonl` entry counts
  - `research/` presence and file count
  - `relatedFiles` count
  - completed date for archived tasks
- Provide a parse warning center for project maintenance:
  - invalid `task.json`
  - malformed JSONL rows
  - missing task artifacts
  - unresolved spec links
  - unsupported Markdown sections that fell back to source
  - unexpected archive directory shape
- Include a workspace overview without exposing journal bodies:
  - workspace directory exists
  - developer workspace directories
  - each developer `index.md` presence
  - journal file counts only
- Preserve a "view source" or raw text fallback for unsupported or malformed sections.
- Preserve existing auth and session access rules:
  - admin can inspect any admin-visible session.
  - guest can inspect only sessions granted to that guest.
- Keep all operations read-only in the first version:
  - no `task.py` execution
  - no task creation/start/archive/finish
  - no file editing
  - no command execution through the Trellis panel
- Prevent arbitrary file reads and path escapes:
  - request paths must be relative.
  - resolved paths must stay under the detected `.trellis/` directory after symlink resolution.
  - source fallback reads must be limited to text files and bounded by a size cap.
- Keep parsing conservative:
  - support Trellis's common Markdown heading/list/task-list/table/code-block shapes.
  - do not need a full Markdown engine for MVP.
  - malformed content should degrade to raw source blocks and warnings instead of failing the whole dashboard.
- Use deterministic structured parsing only in the first version:
  - no LLM calls
  - no AI-generated summaries
  - no model/API-key configuration dependency
  - no probabilistic interpretation in acceptance-critical UI
- Do not copy Trellis implementation code. Use official docs and GitHub only as behavioral/reference material.

## Acceptance Criteria

- [ ] A session whose current path is inside this repository reports Trellis as available and returns detected `.trellis` metadata.
- [ ] A session outside any Trellis project reports Trellis as unavailable without a broken panel or server error.
- [ ] The desktop UI exposes a Trellis entry point for the current session and renders a structured dashboard rather than only a Markdown file viewer.
- [ ] Specs render as navigable package/layer/guideline sections with extracted checklists, links, and guideline tables where present.
- [ ] Active tasks render as task cards and detail views with parsed metadata, requirements, acceptance criteria, design sections, implementation steps, validation commands, and raw fallback when needed.
- [ ] Archived tasks under `.trellis/tasks/archive/<YYYY-MM>/` render in a separate archived section grouped by month and can open the same structured task detail view as active tasks.
- [ ] Workflow renders as phase/state summaries extracted from `.trellis/workflow.md`.
- [ ] Tasks and specs can be searched or filtered without a backend round trip.
- [ ] Task cards show deterministic readiness/completeness indicators based on artifact presence and checklist counts.
- [ ] Parse warnings are surfaced in a dedicated warning area and linked back to the affected artifact where possible.
- [ ] Workspace overview shows developer workspace presence and journal counts without rendering journal body text.
- [ ] The UI shows loading, empty, parse-warning, fallback, and error states.
- [ ] Path traversal attempts such as `../AGENTS.md`, absolute paths, or symlink escapes are rejected by the backend.
- [ ] Non-text or oversized source fallback files return a controlled error instead of dumping binary data.
- [ ] Guest tokens cannot inspect Trellis content for sessions outside their allowed session IDs.
- [ ] The implementation does not run Trellis CLI commands and does not write under `.trellis/`.
- [ ] The implementation does not call an LLM or require model/API-key configuration for Trellis parsing.
- [ ] Existing file manager, git status, terminal, and IDE context flows continue to work.
- [ ] Backend tests cover root detection, path containment, task JSON parsing, Markdown section extraction, checklist extraction, table extraction, and malformed-content fallback behavior.
- [ ] Frontend build/type-check and backend Go tests/build pass, or any skipped validation is explicitly documented.

## Out of Scope

- Editing Trellis files from the UI.
- Creating, starting, finishing, archiving, or syncing Trellis tasks.
- Running `task.py`, `trellis`, git commands, hooks, or platform commands from the panel.
- Full Markdown rendering as the primary UX.
- A complete CommonMark parser.
- Mobile UI integration.
- Cross-server aggregation of Trellis contexts.
- Workspace journal editing or broad memory search.
- Workspace journal body rendering.
- AI summarization of Trellis content.
- Heuristic status/risk judgments that cannot be derived from deterministic Trellis file structure.

## Product Decision

首版只做确定性结构化解析。Trellis 文件结构本身足够稳定，`task.json`、Markdown 标题、清单、表格、代码块、workflow-state block、JSONL manifest 都可以用固定解析规则转换成页面数据。这样可以保持功能可测试、无模型成本、无密钥依赖、响应更快，也避免把 spec/task 审阅结果变成不可复现的 AI 摘要。

## Reference Notes

- Trellis official docs describe `.trellis/spec/`, `.trellis/tasks/`, `.trellis/workspace/`, and `.trellis/workflow.md` as durable project context read by AI sessions.
- Trellis docs describe per-turn context discovery as `cwd -> find .trellis/ -> resolve active task/workflow state`, which matches the user expectation that "if my current directory has Trellis content, the project can link to it."
- Trellis docs describe task artifacts as PRD, design, implementation plan, research, context manifests, and task metadata. The UI should therefore render artifact meaning, not just file contents.
- The official GitHub repository positions Trellis as a repo-persisted specs/tasks/memory layer and uses an AGPL-3.0 license, so this task should implement compatible behavior in WinTerm Bridge without copying Trellis source.

## Notes

- Official docs: https://docs.trytrellis.app/
- How It Works: https://docs.trytrellis.app/start/how-it-works
- Commands, Tasks & Specs: https://docs.trytrellis.app/start/everyday-use
- GitHub: https://github.com/mindfold-ai/Trellis
