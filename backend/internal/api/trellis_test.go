package api

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestFindTrellisRoot(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	project := filepath.Join(root, "project")
	nested := filepath.Join(project, "backend", "internal")
	if err := os.MkdirAll(filepath.Join(project, ".trellis", "tasks"), 0755); err != nil {
		t.Fatalf("mkdir trellis: %v", err)
	}
	if err := os.MkdirAll(nested, 0755); err != nil {
		t.Fatalf("mkdir nested: %v", err)
	}

	gotProject, gotTrellis, ok, err := findTrellisRoot(nested)
	if err != nil {
		t.Fatalf("findTrellisRoot unexpected error: %v", err)
	}
	if !ok {
		t.Fatalf("findTrellisRoot did not find .trellis")
	}
	if gotProject != project {
		t.Fatalf("project root = %q, want %q", gotProject, project)
	}
	if gotTrellis != filepath.Join(project, ".trellis") {
		t.Fatalf("trellis root = %q, want %q", gotTrellis, filepath.Join(project, ".trellis"))
	}
}

func TestResolvePathWithinTrellisRoot(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "tasks", "example"), 0755); err != nil {
		t.Fatalf("mkdir task: %v", err)
	}

	tests := []struct {
		name      string
		inputPath string
		allowRoot bool
		wantRel   string
		wantErr   bool
	}{
		{name: "root allowed", inputPath: ".", allowRoot: true, wantRel: "."},
		{name: "root disallowed", inputPath: ".", allowRoot: false, wantErr: true},
		{name: "task file", inputPath: "tasks/example/prd.md", allowRoot: false, wantRel: "tasks/example/prd.md"},
		{name: "escape", inputPath: "../AGENTS.md", allowRoot: false, wantErr: true},
		{name: "absolute", inputPath: "/etc/passwd", allowRoot: false, wantErr: true},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			_, rel, err := resolvePathWithinTrellisRoot(root, tc.inputPath, tc.allowRoot)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if rel != tc.wantRel {
				t.Fatalf("rel = %q, want %q", rel, tc.wantRel)
			}
		})
	}
}

func TestIsValidTrellisSourcePathRejectsWorkspaceBodies(t *testing.T) {
	t.Parallel()

	valid := []string{
		"workflow.md",
		"spec/backend/index.md",
		"tasks/06-17-example/prd.md",
		"tasks/archive/2026-06/bootstrap/task.json",
		"tasks/06-17-example/implement.jsonl",
	}
	for _, path := range valid {
		if !isValidTrellisSourcePath(path) {
			t.Fatalf("expected source path %q to be valid", path)
		}
	}

	invalid := []string{
		"",
		"workspace/kangmeng/journal-1.md",
		"workspace/kangmeng/index.md",
		"../AGENTS.md",
		"/etc/passwd",
		"AGENTS.md",
		"spec/backend/index.exe",
		"tasks/06-17-example/blob.bin",
	}
	for _, path := range invalid {
		if isValidTrellisSourcePath(path) {
			t.Fatalf("expected source path %q to be invalid", path)
		}
	}
}

func TestParseTrellisMarkdown(t *testing.T) {
	t.Parallel()

	doc := parseTrellisMarkdown(`# Example Task

## Goal

Build the thing.

## Acceptance Criteria

- [ ] First item
- [x] Done item

## Table

| File | Status |
| --- | --- |
| prd.md | Filled |

## Code

`+"```go"+`
fmt.Println("ok")
`+"```"+`
`, "tasks/example/prd.md")

	if doc.Title != "Example Task" {
		t.Fatalf("title = %q, want Example Task", doc.Title)
	}
	if len(doc.Sections) != 4 {
		t.Fatalf("sections = %d, want 4", len(doc.Sections))
	}
	total, done := countAcceptanceCriteria(doc)
	if total != 2 || done != 1 {
		t.Fatalf("acceptance = %d/%d, want 1/2 done", done, total)
	}
	if doc.Sections[2].Kind != "table" {
		t.Fatalf("table section kind = %q, want table", doc.Sections[2].Kind)
	}
	if doc.Sections[3].Kind != "code" {
		t.Fatalf("code section kind = %q, want code", doc.Sections[3].Kind)
	}
}

func TestTaskSummariesIncludeActiveAndArchive(t *testing.T) {
	t.Parallel()

	trellisRoot := t.TempDir()
	activeTask := filepath.Join(trellisRoot, "tasks", "06-17-example")
	archiveTask := filepath.Join(trellisRoot, "tasks", "archive", "2026-06", "00-bootstrap")
	writeTaskFixture(t, activeTask, `{
  "id": "example",
  "name": "example",
  "title": "Example",
  "status": "planning",
  "priority": "P2",
  "assignee": "kangmeng",
  "relatedFiles": ["a.go"]
}`)
	writeTaskFixture(t, archiveTask, `{
  "id": "bootstrap",
  "name": "bootstrap",
  "title": "Bootstrap",
  "status": "completed",
  "priority": "P1",
  "assignee": "kangmeng",
  "completedAt": "2026-06-17"
}`)

	active, activeWarnings := summarizeActiveTrellisTasks(trellisRoot)
	if len(activeWarnings) != 0 {
		t.Fatalf("active warnings = %v", activeWarnings)
	}
	if len(active) != 1 {
		t.Fatalf("active tasks = %d, want 1", len(active))
	}
	if active[0].AcceptanceTotal != 2 || active[0].AcceptanceDone != 1 {
		t.Fatalf("active acceptance = %d/%d, want 1/2 done", active[0].AcceptanceDone, active[0].AcceptanceTotal)
	}
	if active[0].Readiness.RelatedFilesCount != 1 {
		t.Fatalf("related files = %d, want 1", active[0].Readiness.RelatedFilesCount)
	}

	archived, archiveWarnings := summarizeArchivedTrellisTasks(trellisRoot)
	if len(archiveWarnings) != 0 {
		t.Fatalf("archive warnings = %v", archiveWarnings)
	}
	if len(archived) != 1 || archived[0].ArchiveMonth != "2026-06" || len(archived[0].Tasks) != 1 {
		t.Fatalf("archived groups = %#v", archived)
	}
	if archived[0].Tasks[0].CompletedAt != "2026-06-17" {
		t.Fatalf("completed_at = %q, want 2026-06-17", archived[0].Tasks[0].CompletedAt)
	}
}

func TestSummarizeTrellisWorkspaceDoesNotReadJournalBodies(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	devRoot := filepath.Join(root, "kangmeng")
	if err := os.MkdirAll(devRoot, 0755); err != nil {
		t.Fatalf("mkdir dev: %v", err)
	}
	if err := os.WriteFile(filepath.Join(devRoot, "index.md"), []byte("# Index"), 0644); err != nil {
		t.Fatalf("write index: %v", err)
	}
	if err := os.WriteFile(filepath.Join(devRoot, "journal-1.md"), []byte("secret journal body"), 0644); err != nil {
		t.Fatalf("write journal: %v", err)
	}

	summary := summarizeTrellisWorkspace(root)
	if !summary.Exists {
		t.Fatalf("workspace should exist")
	}
	if len(summary.Developers) != 1 {
		t.Fatalf("developers = %d, want 1", len(summary.Developers))
	}
	dev := summary.Developers[0]
	if dev.Name != "kangmeng" || !dev.HasIndex || dev.JournalCount != 1 {
		t.Fatalf("developer summary = %#v", dev)
	}
}

func TestParseJSONLManifestSkipsExampleAndWarnsMalformed(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	path := filepath.Join(root, "implement.jsonl")
	content := `{"_example":"skip me"}
{"file": ".trellis/spec/backend/index.md", "reason": "Backend guide"}
not-json
`
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatalf("write jsonl: %v", err)
	}

	items, warnings := parseJSONLManifest(path, "implement.jsonl")
	if len(items) != 1 {
		t.Fatalf("items = %d, want 1", len(items))
	}
	if items[0].File != ".trellis/spec/backend/index.md" {
		t.Fatalf("item file = %q", items[0].File)
	}
	if len(warnings) != 1 || warnings[0].Code != "malformed_jsonl" {
		t.Fatalf("warnings = %#v", warnings)
	}
}

func TestBuildTrellisTaskDetailUsesEmptyArraysForOptionalLists(t *testing.T) {
	t.Parallel()

	trellisRoot := t.TempDir()
	taskDir := filepath.Join(trellisRoot, "tasks", "06-17-example")
	writeTaskFixture(t, taskDir, `{
  "id": "example",
  "name": "example",
  "title": "Example",
  "status": "in_progress"
}`)

	detail, warnings := buildTrellisTaskDetail(taskDir, "tasks/06-17-example")
	if len(warnings) != 0 {
		t.Fatalf("warnings = %#v", warnings)
	}
	if detail.Research == nil {
		t.Fatalf("research slice is nil, want empty slice")
	}

	data, err := json.Marshal(detail)
	if err != nil {
		t.Fatalf("marshal detail: %v", err)
	}
	body := string(data)
	if strings.Contains(body, `"research":null`) {
		t.Fatalf("research encoded as null: %s", body)
	}
	if !strings.Contains(body, `"research":[]`) {
		t.Fatalf("research did not encode as empty array: %s", body)
	}
}

func TestSummarizeTrellisSpecsIncludesFrontendAndBackendMarkdownFiles(t *testing.T) {
	t.Parallel()

	trellisRoot := t.TempDir()
	specFiles := map[string]string{
		"spec/backend/index.md":                 "# Backend Guidelines\n",
		"spec/backend/error-handling.md":        "# Error Handling\n",
		"spec/frontend/index.md":                "# Frontend Guidelines\n",
		"spec/frontend/component-guidelines.md": "# Component Guidelines\n",
		"spec/frontend/forms/validation.md":     "# Form Validation\n",
		"spec/guides/index.md":                  "# Shared Guides\n",
	}
	for relPath, content := range specFiles {
		absPath := filepath.Join(trellisRoot, filepath.FromSlash(relPath))
		if err := os.MkdirAll(filepath.Dir(absPath), 0755); err != nil {
			t.Fatalf("mkdir %s: %v", relPath, err)
		}
		if err := os.WriteFile(absPath, []byte(content), 0644); err != nil {
			t.Fatalf("write %s: %v", relPath, err)
		}
	}

	summary, warnings := summarizeTrellisSpecs(trellisRoot)
	if len(warnings) != 0 {
		t.Fatalf("warnings = %#v", warnings)
	}

	paths := map[string]bool{}
	for _, pkg := range summary.Packages {
		if pkg.Name == "guides" {
			t.Fatalf("guides package should not be listed in spec summary: %#v", pkg)
		}
		for _, layer := range pkg.Layers {
			paths[layer.Path] = true
		}
	}

	wantPaths := []string{
		"spec/backend/index.md",
		"spec/backend/error-handling.md",
		"spec/frontend/index.md",
		"spec/frontend/component-guidelines.md",
		"spec/frontend/forms/validation.md",
	}
	for _, path := range wantPaths {
		if !paths[path] {
			t.Fatalf("summary missing %s; got %#v", path, paths)
		}
	}
	if len(paths) != len(wantPaths) {
		t.Fatalf("paths = %#v, want only %#v", paths, wantPaths)
	}
}

func writeTaskFixture(t *testing.T, taskDir string, taskJSON string) {
	t.Helper()
	if err := os.MkdirAll(taskDir, 0755); err != nil {
		t.Fatalf("mkdir task fixture: %v", err)
	}
	if err := os.WriteFile(filepath.Join(taskDir, "task.json"), []byte(taskJSON), 0644); err != nil {
		t.Fatalf("write task.json: %v", err)
	}
	prd := `# PRD

## Acceptance Criteria

- [ ] Todo
- [x] Done
`
	if err := os.WriteFile(filepath.Join(taskDir, "prd.md"), []byte(prd), 0644); err != nil {
		t.Fatalf("write prd: %v", err)
	}
}
