package api

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

const maxTrellisSourceFileSize = maxEditableFileSize

type TrellisWarning struct {
	Code     string `json:"code"`
	Severity string `json:"severity"`
	Path     string `json:"path,omitempty"`
	Message  string `json:"message"`
}

type TrellisCapabilities struct {
	Workflow  bool `json:"workflow"`
	Spec      bool `json:"spec"`
	Tasks     bool `json:"tasks"`
	Workspace bool `json:"workspace"`
}

type TrellisSummaryResponse struct {
	Available     bool                       `json:"available"`
	ProjectRoot   string                     `json:"project_root,omitempty"`
	TrellisRoot   string                     `json:"trellis_root,omitempty"`
	CurrentPath   string                     `json:"current_path,omitempty"`
	Reason        string                     `json:"reason,omitempty"`
	Capabilities  TrellisCapabilities        `json:"capabilities,omitempty"`
	Specs         TrellisSpecSummary         `json:"specs,omitempty"`
	ActiveTasks   []TrellisTaskSummary       `json:"active_tasks,omitempty"`
	ArchivedTasks []TrellisArchivedTaskGroup `json:"archived_tasks,omitempty"`
	Workflow      TrellisWorkflowSummary     `json:"workflow,omitempty"`
	Workspace     TrellisWorkspaceSummary    `json:"workspace,omitempty"`
	Warnings      []TrellisWarning           `json:"warnings,omitempty"`
}

type TrellisSpecSummary struct {
	Packages []TrellisSpecPackage `json:"packages"`
}

type TrellisSpecPackage struct {
	Name   string             `json:"name"`
	Layers []TrellisSpecLayer `json:"layers"`
}

type TrellisSpecLayer struct {
	Name           string `json:"name"`
	Title          string `json:"title"`
	Path           string `json:"path"`
	ChecklistCount int    `json:"checklist_count"`
	GuidelineCount int    `json:"guideline_count"`
}

type TrellisTaskSummary struct {
	ID              string               `json:"id"`
	Title           string               `json:"title"`
	Status          string               `json:"status"`
	Priority        string               `json:"priority,omitempty"`
	Assignee        string               `json:"assignee,omitempty"`
	Path            string               `json:"path"`
	CompletedAt     string               `json:"completed_at,omitempty"`
	HasPRD          bool                 `json:"has_prd"`
	HasDesign       bool                 `json:"has_design"`
	HasImplement    bool                 `json:"has_implement"`
	AcceptanceTotal int                  `json:"acceptance_total"`
	AcceptanceDone  int                  `json:"acceptance_done"`
	Readiness       TrellisTaskReadiness `json:"readiness"`
}

type TrellisArchivedTaskGroup struct {
	ArchiveMonth string               `json:"archive_month"`
	Tasks        []TrellisTaskSummary `json:"tasks"`
}

type TrellisTaskReadiness struct {
	HasPRD                bool `json:"has_prd"`
	HasDesign             bool `json:"has_design"`
	HasImplement          bool `json:"has_implement"`
	HasResearch           bool `json:"has_research"`
	ResearchCount         int  `json:"research_count"`
	RelatedFilesCount     int  `json:"related_files_count"`
	AcceptanceTotal       int  `json:"acceptance_total"`
	AcceptanceDone        int  `json:"acceptance_done"`
	ImplementContextCount int  `json:"implement_context_count"`
	CheckContextCount     int  `json:"check_context_count"`
}

type TrellisTaskMetadata struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Title        string   `json:"title"`
	Description  string   `json:"description"`
	Status       string   `json:"status"`
	DevType      string   `json:"dev_type"`
	Scope        string   `json:"scope"`
	Package      string   `json:"package"`
	Priority     string   `json:"priority"`
	Creator      string   `json:"creator"`
	Assignee     string   `json:"assignee"`
	CreatedAt    string   `json:"createdAt"`
	CompletedAt  string   `json:"completedAt"`
	Branch       string   `json:"branch"`
	BaseBranch   string   `json:"base_branch"`
	Commit       string   `json:"commit"`
	PRURL        string   `json:"pr_url"`
	RelatedFiles []string `json:"relatedFiles"`
	Notes        string   `json:"notes"`
}

type TrellisTaskDetailResponse struct {
	Path             string                  `json:"path"`
	Metadata         TrellisTaskMetadata     `json:"metadata"`
	PRD              *TrellisDocument        `json:"prd,omitempty"`
	Design           *TrellisDocument        `json:"design,omitempty"`
	Implementation   *TrellisDocument        `json:"implementation,omitempty"`
	Research         []TrellisResearchEntry  `json:"research"`
	ContextManifests TrellisContextManifests `json:"context_manifests"`
	Readiness        TrellisTaskReadiness    `json:"readiness"`
	Warnings         []TrellisWarning        `json:"warnings,omitempty"`
}

type TrellisResearchEntry struct {
	Name  string `json:"name"`
	Path  string `json:"path"`
	Title string `json:"title,omitempty"`
}

type TrellisContextManifests struct {
	ImplementCount int                   `json:"implement_count"`
	CheckCount     int                   `json:"check_count"`
	Implement      []TrellisManifestItem `json:"implement,omitempty"`
	Check          []TrellisManifestItem `json:"check,omitempty"`
}

type TrellisManifestItem struct {
	File   string `json:"file"`
	Reason string `json:"reason"`
	Type   string `json:"type,omitempty"`
}

type TrellisWorkflowSummary struct {
	Title  string                 `json:"title,omitempty"`
	Phases []TrellisWorkflowPhase `json:"phases,omitempty"`
	States []TrellisWorkflowState `json:"states,omitempty"`
}

type TrellisWorkflowPhase struct {
	Name    string   `json:"name"`
	Summary string   `json:"summary,omitempty"`
	States  []string `json:"states,omitempty"`
}

type TrellisWorkflowState struct {
	Name    string `json:"name"`
	Content string `json:"content"`
}

type TrellisWorkspaceSummary struct {
	Exists     bool                        `json:"exists"`
	Developers []TrellisWorkspaceDeveloper `json:"developers"`
}

type TrellisWorkspaceDeveloper struct {
	Name         string `json:"name"`
	IndexPath    string `json:"index_path,omitempty"`
	HasIndex     bool   `json:"has_index"`
	JournalCount int    `json:"journal_count"`
}

type TrellisDocument struct {
	Title    string           `json:"title"`
	Sections []TrellisSection `json:"sections"`
	RawPath  string           `json:"raw_path"`
	Links    []TrellisLink    `json:"links,omitempty"`
	Warnings []TrellisWarning `json:"warnings,omitempty"`
}

type TrellisSection struct {
	Title    string               `json:"title"`
	Level    int                  `json:"level"`
	Kind     string               `json:"kind"`
	Items    []TrellisSectionItem `json:"items,omitempty"`
	Children []TrellisSection     `json:"children,omitempty"`
	Raw      string               `json:"raw,omitempty"`
}

type TrellisSectionItem struct {
	Text    string   `json:"text,omitempty"`
	Checked *bool    `json:"checked,omitempty"`
	Kind    string   `json:"kind,omitempty"`
	Cells   []string `json:"cells,omitempty"`
}

type TrellisLink struct {
	Label string `json:"label"`
	Path  string `json:"path"`
}

type TrellisSourceResponse struct {
	Path    string `json:"path"`
	Content string `json:"content"`
	Size    int64  `json:"size"`
	MtimeMS int64  `json:"mtime_ms"`
}

func (h *Handler) HandleSessionTrellisSummary(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	sessionID := parseSessionIDFromPath(r.URL.Path)
	if sessionID == "" {
		writeError(w, http.StatusBadRequest, "missing session ID")
		return
	}
	if !h.requireSessionAccess(w, r, sessionID) {
		return
	}

	currentPath, projectRoot, trellisRoot, ok, err := h.resolveTrellisRootForSession(sessionID)
	if err != nil {
		writeSessionRootError(w, err)
		return
	}
	if !ok {
		writeJSON(w, http.StatusOK, TrellisSummaryResponse{
			Available:   false,
			CurrentPath: currentPath,
			Reason:      "no_trellis_root",
		})
		return
	}

	warnings := []TrellisWarning{}
	activeTasks, activeWarnings := summarizeActiveTrellisTasks(trellisRoot)
	warnings = append(warnings, activeWarnings...)
	archivedTasks, archiveWarnings := summarizeArchivedTrellisTasks(trellisRoot)
	warnings = append(warnings, archiveWarnings...)
	specs, specWarnings := summarizeTrellisSpecs(trellisRoot)
	warnings = append(warnings, specWarnings...)
	workflow, workflowWarnings := summarizeTrellisWorkflow(trellisRoot)
	warnings = append(warnings, workflowWarnings...)

	writeJSON(w, http.StatusOK, TrellisSummaryResponse{
		Available:   true,
		ProjectRoot: projectRoot,
		TrellisRoot: trellisRoot,
		CurrentPath: currentPath,
		Capabilities: TrellisCapabilities{
			Workflow:  pathExists(filepath.Join(trellisRoot, "workflow.md")),
			Spec:      pathExists(filepath.Join(trellisRoot, "spec")),
			Tasks:     pathExists(filepath.Join(trellisRoot, "tasks")),
			Workspace: pathExists(filepath.Join(trellisRoot, "workspace")),
		},
		Specs:         specs,
		ActiveTasks:   activeTasks,
		ArchivedTasks: archivedTasks,
		Workflow:      workflow,
		Workspace:     summarizeTrellisWorkspace(filepath.Join(trellisRoot, "workspace")),
		Warnings:      warnings,
	})
}

func (h *Handler) HandleSessionTrellisTask(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	sessionID := parseSessionIDFromPath(r.URL.Path)
	if sessionID == "" {
		writeError(w, http.StatusBadRequest, "missing session ID")
		return
	}
	if !h.requireSessionAccess(w, r, sessionID) {
		return
	}

	_, _, trellisRoot, ok, err := h.resolveTrellisRootForSession(sessionID)
	if err != nil {
		writeSessionRootError(w, err)
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, "trellis root not found")
		return
	}

	taskPath := strings.TrimSpace(r.URL.Query().Get("path"))
	if !isValidTrellisTaskPath(taskPath) {
		writeError(w, http.StatusBadRequest, "invalid trellis artifact path")
		return
	}
	absPath, relPath, err := resolvePathWithinTrellisRoot(trellisRoot, taskPath, true)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	info, err := os.Stat(absPath)
	if err != nil {
		if os.IsNotExist(err) {
			writeError(w, http.StatusNotFound, "task not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to stat task")
		return
	}
	if !info.IsDir() {
		writeError(w, http.StatusBadRequest, "task path is not a directory")
		return
	}

	detail, detailWarnings := buildTrellisTaskDetail(absPath, relPath)
	detail.Warnings = append(detail.Warnings, detailWarnings...)
	writeJSON(w, http.StatusOK, detail)
}

func (h *Handler) HandleSessionTrellisSpec(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	sessionID := parseSessionIDFromPath(r.URL.Path)
	if sessionID == "" {
		writeError(w, http.StatusBadRequest, "missing session ID")
		return
	}
	if !h.requireSessionAccess(w, r, sessionID) {
		return
	}

	_, _, trellisRoot, ok, err := h.resolveTrellisRootForSession(sessionID)
	if err != nil {
		writeSessionRootError(w, err)
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, "trellis root not found")
		return
	}

	specPath := strings.TrimSpace(r.URL.Query().Get("path"))
	if !isValidTrellisSpecPath(specPath) {
		writeError(w, http.StatusBadRequest, "invalid trellis artifact path")
		return
	}
	absPath, relPath, err := resolvePathWithinTrellisRoot(trellisRoot, specPath, false)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	doc, err := readTrellisDocument(absPath, relPath)
	if err != nil {
		writeTrellisReadError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, doc)
}

func (h *Handler) HandleSessionTrellisSource(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	sessionID := parseSessionIDFromPath(r.URL.Path)
	if sessionID == "" {
		writeError(w, http.StatusBadRequest, "missing session ID")
		return
	}
	if !h.requireSessionAccess(w, r, sessionID) {
		return
	}

	_, _, trellisRoot, ok, err := h.resolveTrellisRootForSession(sessionID)
	if err != nil {
		writeSessionRootError(w, err)
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, "trellis root not found")
		return
	}

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
		Path:    filepath.ToSlash(relPath),
		Content: string(data),
		Size:    int64(len(data)),
		MtimeMS: info.ModTime().UnixMilli(),
	})
}

func (h *Handler) resolveTrellisRootForSession(sessionID string) (string, string, string, bool, error) {
	currentPath, err := h.resolveSessionRootPath(sessionID)
	if err != nil {
		return "", "", "", false, err
	}
	projectRoot, trellisRoot, ok, err := findTrellisRoot(currentPath)
	return currentPath, projectRoot, trellisRoot, ok, err
}

func findTrellisRoot(startPath string) (string, string, bool, error) {
	path := strings.TrimSpace(startPath)
	if path == "" {
		return "", "", false, nil
	}

	absPath, err := filepath.Abs(path)
	if err != nil {
		return "", "", false, err
	}
	dir := filepath.Clean(absPath)
	if info, statErr := os.Stat(dir); statErr == nil && !info.IsDir() {
		dir = filepath.Dir(dir)
	}

	for i := 0; i < 64; i++ {
		// Accept both ".trellis" (original) and ".suncode" (compatible fork) as
		// project-root markers — they are the same tool under a different name.
		// ".trellis" takes precedence when both happen to exist.
		for _, marker := range []string{".trellis", ".suncode"} {
			candidate := filepath.Join(dir, marker)
			info, statErr := os.Stat(candidate)
			if statErr == nil && info.IsDir() {
				return dir, filepath.Clean(candidate), true, nil
			}
			if statErr != nil && !os.IsNotExist(statErr) {
				return "", "", false, statErr
			}
		}

		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}

	return "", "", false, nil
}

func resolvePathWithinTrellisRoot(rootPath, rawPath string, allowRoot bool) (string, string, error) {
	path := strings.TrimSpace(rawPath)
	if path == "" {
		path = "."
	}
	if filepath.IsAbs(path) {
		return "", "", errors.New("absolute path is not allowed")
	}

	cleanRel := filepath.Clean(path)
	if cleanRel == "." && !allowRoot {
		return "", "", errors.New("path is required")
	}
	if cleanRel == ".." || strings.HasPrefix(cleanRel, ".."+string(os.PathSeparator)) {
		return "", "", errors.New("path escapes trellis root")
	}

	rootAbs, err := filepath.Abs(rootPath)
	if err != nil {
		return "", "", errors.New("failed to resolve trellis root")
	}
	rootResolved := rootAbs
	if resolved, err := filepath.EvalSymlinks(rootAbs); err == nil {
		rootResolved = resolved
	}
	targetAbs := filepath.Clean(filepath.Join(rootAbs, cleanRel))

	relToRoot, err := filepath.Rel(rootAbs, targetAbs)
	if err != nil {
		return "", "", errors.New("failed to resolve relative path")
	}
	if relToRoot == ".." || strings.HasPrefix(relToRoot, ".."+string(os.PathSeparator)) {
		return "", "", errors.New("path escapes trellis root")
	}

	if resolvedTarget, err := filepath.EvalSymlinks(targetAbs); err == nil {
		if !isPathInsideRoot(rootResolved, resolvedTarget) {
			return "", "", errors.New("path escapes trellis root")
		}
	} else if !os.IsNotExist(err) {
		return "", "", errors.New("failed to resolve target path")
	}

	if cleanRel != "." {
		parentPath := filepath.Dir(targetAbs)
		if resolvedParent, err := filepath.EvalSymlinks(parentPath); err == nil {
			if !isPathInsideRoot(rootResolved, resolvedParent) {
				return "", "", errors.New("path escapes trellis root")
			}
		} else if !os.IsNotExist(err) {
			return "", "", errors.New("failed to resolve parent path")
		}
	}

	return targetAbs, filepath.Clean(relToRoot), nil
}

func summarizeActiveTrellisTasks(trellisRoot string) ([]TrellisTaskSummary, []TrellisWarning) {
	tasksRoot := filepath.Join(trellisRoot, "tasks")
	entries, err := os.ReadDir(tasksRoot)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, []TrellisWarning{newTrellisWarning("missing_artifact", "warning", "tasks", "failed to read tasks directory")}
	}

	summaries := []TrellisTaskSummary{}
	warnings := []TrellisWarning{}
	for _, entry := range entries {
		if !entry.IsDir() || entry.Name() == "archive" {
			continue
		}
		taskAbs := filepath.Join(tasksRoot, entry.Name())
		if !pathExists(filepath.Join(taskAbs, "task.json")) {
			continue
		}
		summary, taskWarnings := buildTrellisTaskSummary(taskAbs, filepath.ToSlash(filepath.Join("tasks", entry.Name())))
		warnings = append(warnings, taskWarnings...)
		if summary.Path != "" {
			summaries = append(summaries, summary)
		}
	}

	sort.Slice(summaries, func(i, j int) bool {
		return summaries[i].Path < summaries[j].Path
	})
	return summaries, warnings
}

func summarizeArchivedTrellisTasks(trellisRoot string) ([]TrellisArchivedTaskGroup, []TrellisWarning) {
	archiveRoot := filepath.Join(trellisRoot, "tasks", "archive")
	months, err := os.ReadDir(archiveRoot)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, []TrellisWarning{newTrellisWarning("invalid_archive_shape", "warning", "tasks/archive", "failed to read archive directory")}
	}

	groups := []TrellisArchivedTaskGroup{}
	warnings := []TrellisWarning{}
	for _, monthEntry := range months {
		if !monthEntry.IsDir() {
			warnings = append(warnings, newTrellisWarning("invalid_archive_shape", "warning", filepath.ToSlash(filepath.Join("tasks", "archive", monthEntry.Name())), "archive entry is not a directory"))
			continue
		}
		month := monthEntry.Name()
		monthAbs := filepath.Join(archiveRoot, month)
		taskEntries, err := os.ReadDir(monthAbs)
		if err != nil {
			warnings = append(warnings, newTrellisWarning("invalid_archive_shape", "warning", filepath.ToSlash(filepath.Join("tasks", "archive", month)), "failed to read archive month"))
			continue
		}

		group := TrellisArchivedTaskGroup{ArchiveMonth: month}
		for _, taskEntry := range taskEntries {
			if !taskEntry.IsDir() {
				continue
			}
			taskAbs := filepath.Join(monthAbs, taskEntry.Name())
			if !pathExists(filepath.Join(taskAbs, "task.json")) {
				warnings = append(warnings, newTrellisWarning("missing_artifact", "warning", filepath.ToSlash(filepath.Join("tasks", "archive", month, taskEntry.Name(), "task.json")), "archived task is missing task.json"))
				continue
			}
			summary, taskWarnings := buildTrellisTaskSummary(taskAbs, filepath.ToSlash(filepath.Join("tasks", "archive", month, taskEntry.Name())))
			warnings = append(warnings, taskWarnings...)
			if summary.Path != "" {
				group.Tasks = append(group.Tasks, summary)
			}
		}
		sort.Slice(group.Tasks, func(i, j int) bool {
			return group.Tasks[i].Path < group.Tasks[j].Path
		})
		groups = append(groups, group)
	}

	sort.Slice(groups, func(i, j int) bool {
		return groups[i].ArchiveMonth > groups[j].ArchiveMonth
	})
	return groups, warnings
}

func summarizeTrellisSpecs(trellisRoot string) (TrellisSpecSummary, []TrellisWarning) {
	specRoot := filepath.Join(trellisRoot, "spec")
	if !pathExists(specRoot) {
		return TrellisSpecSummary{}, nil
	}

	packageMap := map[string][]TrellisSpecLayer{}
	warnings := []TrellisWarning{}
	err := filepath.WalkDir(specRoot, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if entry.IsDir() || !strings.HasSuffix(strings.ToLower(entry.Name()), ".md") {
			return nil
		}
		rel, err := filepath.Rel(specRoot, path)
		if err != nil {
			return nil
		}
		parts := strings.Split(filepath.ToSlash(rel), "/")
		if len(parts) < 2 {
			return nil
		}
		pkg := parts[0]
		if pkg != "backend" && pkg != "frontend" {
			return nil
		}
		layer := strings.TrimSuffix(strings.Join(parts[1:], "/"), filepath.Ext(parts[len(parts)-1]))
		if layer == "" {
			return nil
		}
		doc, err := readTrellisDocument(path, filepath.ToSlash(filepath.Join("spec", rel)))
		if err != nil {
			warnings = append(warnings, newTrellisWarning("missing_artifact", "warning", filepath.ToSlash(filepath.Join("spec", rel)), "failed to parse spec document"))
			return nil
		}
		packageMap[pkg] = append(packageMap[pkg], TrellisSpecLayer{
			Name:           layer,
			Title:          doc.Title,
			Path:           filepath.ToSlash(filepath.Join("spec", rel)),
			ChecklistCount: countChecklistItems(doc),
			GuidelineCount: len(doc.Links),
		})
		return nil
	})
	if err != nil {
		warnings = append(warnings, newTrellisWarning("missing_artifact", "warning", "spec", "failed to walk spec directory"))
	}

	packages := make([]TrellisSpecPackage, 0, len(packageMap))
	for pkg, layers := range packageMap {
		sort.Slice(layers, func(i, j int) bool {
			return layers[i].Path < layers[j].Path
		})
		packages = append(packages, TrellisSpecPackage{Name: pkg, Layers: layers})
	}
	sort.Slice(packages, func(i, j int) bool {
		return packages[i].Name < packages[j].Name
	})

	return TrellisSpecSummary{Packages: packages}, warnings
}

func summarizeTrellisWorkflow(trellisRoot string) (TrellisWorkflowSummary, []TrellisWarning) {
	path := filepath.Join(trellisRoot, "workflow.md")
	if !pathExists(path) {
		return TrellisWorkflowSummary{}, nil
	}

	_, data, err := readTrellisTextFile(path)
	if err != nil {
		return TrellisWorkflowSummary{}, []TrellisWarning{newTrellisWarning("missing_artifact", "warning", "workflow.md", "failed to read workflow")}
	}
	content := string(data)
	doc := parseTrellisMarkdown(content, "workflow.md")
	states := parseWorkflowStates(content)
	phases := parseWorkflowPhases(content, states)
	return TrellisWorkflowSummary{Title: doc.Title, Phases: phases, States: states}, nil
}

func summarizeTrellisWorkspace(workspaceRoot string) TrellisWorkspaceSummary {
	summary := TrellisWorkspaceSummary{Exists: pathExists(workspaceRoot)}
	if !summary.Exists {
		return summary
	}

	entries, err := os.ReadDir(workspaceRoot)
	if err != nil {
		return summary
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		developerRoot := filepath.Join(workspaceRoot, entry.Name())
		dev := TrellisWorkspaceDeveloper{
			Name:         entry.Name(),
			HasIndex:     pathExists(filepath.Join(developerRoot, "index.md")),
			JournalCount: countJournalFiles(developerRoot),
		}
		if dev.HasIndex {
			dev.IndexPath = filepath.ToSlash(filepath.Join("workspace", entry.Name(), "index.md"))
		}
		summary.Developers = append(summary.Developers, dev)
	}
	sort.Slice(summary.Developers, func(i, j int) bool {
		return summary.Developers[i].Name < summary.Developers[j].Name
	})
	return summary
}

func buildTrellisTaskSummary(taskAbs, taskRel string) (TrellisTaskSummary, []TrellisWarning) {
	metadata, warnings := parseTaskJSON(filepath.Join(taskAbs, "task.json"), filepath.ToSlash(filepath.Join(taskRel, "task.json")))
	if metadata.ID == "" && metadata.Title == "" {
		return TrellisTaskSummary{}, warnings
	}
	readiness, readinessWarnings := buildTaskReadiness(taskAbs, metadata)
	warnings = append(warnings, readinessWarnings...)
	title := metadata.Title
	if title == "" {
		title = metadata.Name
	}
	if title == "" {
		title = metadata.ID
	}
	return TrellisTaskSummary{
		ID:              metadata.ID,
		Title:           title,
		Status:          metadata.Status,
		Priority:        metadata.Priority,
		Assignee:        metadata.Assignee,
		Path:            filepath.ToSlash(taskRel),
		CompletedAt:     metadata.CompletedAt,
		HasPRD:          readiness.HasPRD,
		HasDesign:       readiness.HasDesign,
		HasImplement:    readiness.HasImplement,
		AcceptanceTotal: readiness.AcceptanceTotal,
		AcceptanceDone:  readiness.AcceptanceDone,
		Readiness:       readiness,
	}, warnings
}

func buildTrellisTaskDetail(taskAbs, taskRel string) (TrellisTaskDetailResponse, []TrellisWarning) {
	metadata, warnings := parseTaskJSON(filepath.Join(taskAbs, "task.json"), filepath.ToSlash(filepath.Join(taskRel, "task.json")))
	readiness, readinessWarnings := buildTaskReadiness(taskAbs, metadata)
	warnings = append(warnings, readinessWarnings...)

	detail := TrellisTaskDetailResponse{
		Path:             filepath.ToSlash(taskRel),
		Metadata:         metadata,
		Research:         nonNilResearchEntries(listTaskResearch(taskAbs, taskRel)),
		ContextManifests: readTaskContextManifests(taskAbs, taskRel, &warnings),
		Readiness:        readiness,
	}

	if doc := maybeReadTaskDocument(taskAbs, taskRel, "prd.md", &warnings); doc != nil {
		detail.PRD = doc
	}
	if doc := maybeReadTaskDocument(taskAbs, taskRel, "design.md", &warnings); doc != nil {
		detail.Design = doc
	}
	if doc := maybeReadTaskDocument(taskAbs, taskRel, "implement.md", &warnings); doc != nil {
		detail.Implementation = doc
	}

	return detail, warnings
}

func buildTaskReadiness(taskAbs string, metadata TrellisTaskMetadata) (TrellisTaskReadiness, []TrellisWarning) {
	warnings := []TrellisWarning{}
	readiness := TrellisTaskReadiness{
		HasPRD:            pathExists(filepath.Join(taskAbs, "prd.md")),
		HasDesign:         pathExists(filepath.Join(taskAbs, "design.md")),
		HasImplement:      pathExists(filepath.Join(taskAbs, "implement.md")),
		HasResearch:       pathExists(filepath.Join(taskAbs, "research")),
		RelatedFilesCount: len(metadata.RelatedFiles),
	}

	if readiness.HasResearch {
		readiness.ResearchCount = countMarkdownFiles(filepath.Join(taskAbs, "research"))
	}
	readiness.ImplementContextCount = countJSONLManifestEntries(filepath.Join(taskAbs, "implement.jsonl"), nil)
	readiness.CheckContextCount = countJSONLManifestEntries(filepath.Join(taskAbs, "check.jsonl"), nil)

	if readiness.HasPRD {
		doc, err := readTrellisDocument(filepath.Join(taskAbs, "prd.md"), "prd.md")
		if err == nil {
			readiness.AcceptanceTotal, readiness.AcceptanceDone = countAcceptanceCriteria(doc)
		}
	} else {
		warnings = append(warnings, newTrellisWarning("missing_artifact", "warning", filepath.ToSlash(filepath.Join(filepath.Base(taskAbs), "prd.md")), "task is missing prd.md"))
	}
	return readiness, warnings
}

func parseTaskJSON(path, relPath string) (TrellisTaskMetadata, []TrellisWarning) {
	data, err := os.ReadFile(path)
	if err != nil {
		return TrellisTaskMetadata{}, []TrellisWarning{newTrellisWarning("missing_artifact", "warning", relPath, "task.json is missing")}
	}
	var metadata TrellisTaskMetadata
	if err := json.Unmarshal(data, &metadata); err != nil {
		return TrellisTaskMetadata{}, []TrellisWarning{newTrellisWarning("invalid_task_json", "error", relPath, "task.json is not valid JSON")}
	}
	return metadata, nil
}

func readTaskContextManifests(taskAbs, taskRel string, warnings *[]TrellisWarning) TrellisContextManifests {
	implementItems, implementWarnings := parseJSONLManifest(filepath.Join(taskAbs, "implement.jsonl"), filepath.ToSlash(filepath.Join(taskRel, "implement.jsonl")))
	checkItems, checkWarnings := parseJSONLManifest(filepath.Join(taskAbs, "check.jsonl"), filepath.ToSlash(filepath.Join(taskRel, "check.jsonl")))
	*warnings = append(*warnings, implementWarnings...)
	*warnings = append(*warnings, checkWarnings...)
	return TrellisContextManifests{
		ImplementCount: len(implementItems),
		CheckCount:     len(checkItems),
		Implement:      implementItems,
		Check:          checkItems,
	}
}

func parseJSONLManifest(path, relPath string) ([]TrellisManifestItem, []TrellisWarning) {
	file, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, []TrellisWarning{newTrellisWarning("malformed_jsonl", "warning", relPath, "failed to open JSONL manifest")}
	}
	defer file.Close()

	items := []TrellisManifestItem{}
	warnings := []TrellisWarning{}
	scanner := bufio.NewScanner(file)
	lineNo := 0
	for scanner.Scan() {
		lineNo++
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var raw map[string]any
		if err := json.Unmarshal([]byte(line), &raw); err != nil {
			warnings = append(warnings, newTrellisWarning("malformed_jsonl", "warning", relPath, fmt.Sprintf("line %d is not valid JSON", lineNo)))
			continue
		}
		if _, ok := raw["_example"]; ok {
			continue
		}
		item := TrellisManifestItem{}
		if value, ok := raw["file"].(string); ok {
			item.File = value
		}
		if value, ok := raw["reason"].(string); ok {
			item.Reason = value
		}
		if value, ok := raw["type"].(string); ok {
			item.Type = value
		}
		if item.File == "" && item.Reason == "" {
			continue
		}
		items = append(items, item)
	}
	if err := scanner.Err(); err != nil {
		warnings = append(warnings, newTrellisWarning("malformed_jsonl", "warning", relPath, "failed to scan JSONL manifest"))
	}
	return items, warnings
}

func countJSONLManifestEntries(path string, warnings *[]TrellisWarning) int {
	items, parseWarnings := parseJSONLManifest(path, filepath.Base(path))
	if warnings != nil {
		*warnings = append(*warnings, parseWarnings...)
	}
	return len(items)
}

func listTaskResearch(taskAbs, taskRel string) []TrellisResearchEntry {
	researchRoot := filepath.Join(taskAbs, "research")
	if !pathExists(researchRoot) {
		return nil
	}
	entries, err := os.ReadDir(researchRoot)
	if err != nil {
		return nil
	}
	research := []TrellisResearchEntry{}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(strings.ToLower(entry.Name()), ".md") {
			continue
		}
		rel := filepath.ToSlash(filepath.Join(taskRel, "research", entry.Name()))
		item := TrellisResearchEntry{Name: entry.Name(), Path: rel}
		if doc, err := readTrellisDocument(filepath.Join(researchRoot, entry.Name()), rel); err == nil {
			item.Title = doc.Title
		}
		research = append(research, item)
	}
	sort.Slice(research, func(i, j int) bool {
		return research[i].Path < research[j].Path
	})
	return research
}

func nonNilResearchEntries(items []TrellisResearchEntry) []TrellisResearchEntry {
	if items == nil {
		return []TrellisResearchEntry{}
	}
	return items
}

func maybeReadTaskDocument(taskAbs, taskRel, filename string, warnings *[]TrellisWarning) *TrellisDocument {
	absPath := filepath.Join(taskAbs, filename)
	relPath := filepath.ToSlash(filepath.Join(taskRel, filename))
	if !pathExists(absPath) {
		return nil
	}
	doc, err := readTrellisDocument(absPath, relPath)
	if err != nil {
		*warnings = append(*warnings, newTrellisWarning("unsupported_markdown", "warning", relPath, "failed to parse "+filename))
		return nil
	}
	return &doc
}

func readTrellisDocument(absPath, relPath string) (TrellisDocument, error) {
	_, data, err := readTrellisTextFile(absPath)
	if err != nil {
		return TrellisDocument{}, err
	}
	return parseTrellisMarkdown(string(data), relPath), nil
}

func readTrellisTextFile(absPath string) (os.FileInfo, []byte, error) {
	info, err := os.Stat(absPath)
	if err != nil {
		return nil, nil, err
	}
	if info.IsDir() {
		return nil, nil, errTrellisPathIsDir
	}
	if info.Size() > maxTrellisSourceFileSize {
		return nil, nil, errTrellisFileTooLarge
	}
	data, err := os.ReadFile(absPath)
	if err != nil {
		return nil, nil, err
	}
	if int64(len(data)) > maxTrellisSourceFileSize {
		return nil, nil, errTrellisFileTooLarge
	}
	if !isTextContent(data) {
		return nil, nil, errTrellisBinaryFile
	}
	return info, data, nil
}

var (
	errTrellisPathIsDir    = errors.New("path is a directory")
	errTrellisFileTooLarge = errors.New("file too large for inline viewing")
	errTrellisBinaryFile   = errors.New("only text files are supported")
)

func writeTrellisReadError(w http.ResponseWriter, err error) {
	switch {
	case os.IsNotExist(err):
		writeError(w, http.StatusNotFound, "file not found")
	case errors.Is(err, errTrellisPathIsDir):
		writeError(w, http.StatusBadRequest, "path is a directory")
	case errors.Is(err, errTrellisFileTooLarge):
		writeError(w, http.StatusRequestEntityTooLarge, "file too large for inline viewing")
	case errors.Is(err, errTrellisBinaryFile):
		writeError(w, http.StatusUnsupportedMediaType, "only text files are supported")
	default:
		writeError(w, http.StatusInternalServerError, "failed to read file")
	}
}

var (
	headingRe     = regexp.MustCompile(`^(#{1,6})\s+(.+?)\s*$`)
	taskListRe    = regexp.MustCompile(`^\s*[-*]\s+\[([ xX])\]\s+(.+)$`)
	unorderedRe   = regexp.MustCompile(`^\s*[-*]\s+(.+)$`)
	orderedRe     = regexp.MustCompile(`^\s*\d+\.\s+(.+)$`)
	linkRe        = regexp.MustCompile(`\[([^\]]+)\]\(([^)]+)\)`)
	workflowTagRe = regexp.MustCompile(`^\[workflow-state:([^\]]+)\]\s*$`)
	phaseLineRe   = regexp.MustCompile(`^(Phase\s+\d+:[^→]+?)\s*→\s*(.+)$`)
)

func parseTrellisMarkdown(content, rawPath string) TrellisDocument {
	doc := TrellisDocument{RawPath: filepath.ToSlash(rawPath)}
	sections := []TrellisSection{}
	current := -1
	inCode := false
	codeLines := []string{}

	ensureSection := func() int {
		if current >= 0 {
			return current
		}
		sections = append(sections, TrellisSection{Title: "Content", Level: 0, Kind: "paragraphs"})
		current = len(sections) - 1
		return current
	}

	for _, line := range strings.Split(content, "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "```") {
			idx := ensureSection()
			if inCode {
				sections[idx].Items = append(sections[idx].Items, TrellisSectionItem{Kind: "code", Text: strings.Join(codeLines, "\n")})
				codeLines = nil
				inCode = false
			} else {
				inCode = true
			}
			sections[idx].Raw += line + "\n"
			continue
		}
		if inCode {
			codeLines = append(codeLines, line)
			idx := ensureSection()
			sections[idx].Raw += line + "\n"
			continue
		}

		if match := headingRe.FindStringSubmatch(line); match != nil {
			level := len(match[1])
			title := strings.TrimSpace(match[2])
			if level == 1 && doc.Title == "" {
				doc.Title = title
				continue
			}
			sections = append(sections, TrellisSection{Title: title, Level: level, Kind: "paragraphs"})
			current = len(sections) - 1
			continue
		}
		if trimmed == "" {
			if current >= 0 {
				sections[current].Raw += "\n"
			}
			continue
		}

		idx := ensureSection()
		sections[idx].Raw += line + "\n"
		if item, ok := parseMarkdownLineItem(line); ok {
			sections[idx].Items = append(sections[idx].Items, item)
			continue
		}
		if isMarkdownTableSeparatorLine(line) {
			continue
		}
		sections[idx].Items = append(sections[idx].Items, TrellisSectionItem{Kind: "paragraph", Text: trimmed})
	}
	if inCode {
		idx := ensureSection()
		sections[idx].Items = append(sections[idx].Items, TrellisSectionItem{Kind: "code", Text: strings.Join(codeLines, "\n")})
		doc.Warnings = append(doc.Warnings, newTrellisWarning("unsupported_markdown", "warning", rawPath, "unterminated fenced code block"))
	}

	for i := range sections {
		sections[i].Kind = inferSectionKind(sections[i].Items)
		doc.Links = append(doc.Links, extractMarkdownLinks(sections[i].Raw, rawPath)...)
		sections[i].Raw = strings.TrimRight(sections[i].Raw, "\n")
	}
	if doc.Title == "" {
		doc.Title = strings.TrimSuffix(filepath.Base(rawPath), filepath.Ext(rawPath))
	}
	doc.Sections = sections
	return doc
}

func parseMarkdownLineItem(line string) (TrellisSectionItem, bool) {
	if match := taskListRe.FindStringSubmatch(line); match != nil {
		checked := strings.EqualFold(match[1], "x")
		return TrellisSectionItem{Kind: "check", Text: strings.TrimSpace(match[2]), Checked: &checked}, true
	}
	if isMarkdownTableRow(line) {
		cells := splitMarkdownTableRow(line)
		if len(cells) > 0 && !isMarkdownTableSeparator(cells) {
			return TrellisSectionItem{Kind: "table_row", Cells: cells}, true
		}
		return TrellisSectionItem{}, false
	}
	if match := unorderedRe.FindStringSubmatch(line); match != nil {
		return TrellisSectionItem{Kind: "list", Text: strings.TrimSpace(match[1])}, true
	}
	if match := orderedRe.FindStringSubmatch(line); match != nil {
		return TrellisSectionItem{Kind: "list", Text: strings.TrimSpace(match[1])}, true
	}
	return TrellisSectionItem{}, false
}

func inferSectionKind(items []TrellisSectionItem) string {
	classifiedItems := items
	if len(classifiedItems) > 1 && classifiedItems[0].Kind == "paragraph" {
		classifiedItems = classifiedItems[1:]
	}
	if len(classifiedItems) == 0 {
		return "empty"
	}
	counts := map[string]int{}
	for _, item := range classifiedItems {
		counts[item.Kind]++
	}
	if counts["check"] > 0 && counts["check"] == len(classifiedItems) {
		return "checklist"
	}
	if counts["table_row"] > 0 && counts["table_row"] == len(classifiedItems) {
		return "table"
	}
	if counts["list"] > 0 && counts["list"] == len(classifiedItems) {
		return "list"
	}
	if counts["code"] > 0 && counts["code"] == len(classifiedItems) {
		return "code"
	}
	if counts["paragraph"] == len(classifiedItems) {
		return "paragraphs"
	}
	return "mixed"
}

func isMarkdownTableRow(line string) bool {
	trimmed := strings.TrimSpace(line)
	return strings.Contains(trimmed, "|") && strings.HasPrefix(trimmed, "|") && strings.HasSuffix(trimmed, "|")
}

func isMarkdownTableSeparatorLine(line string) bool {
	if !isMarkdownTableRow(line) {
		return false
	}
	return isMarkdownTableSeparator(splitMarkdownTableRow(line))
}

func splitMarkdownTableRow(line string) []string {
	trimmed := strings.Trim(strings.TrimSpace(line), "|")
	parts := strings.Split(trimmed, "|")
	cells := make([]string, 0, len(parts))
	for _, part := range parts {
		cells = append(cells, strings.TrimSpace(part))
	}
	return cells
}

func isMarkdownTableSeparator(cells []string) bool {
	if len(cells) == 0 {
		return false
	}
	for _, cell := range cells {
		cleaned := strings.Trim(cell, " :-")
		if cleaned != "" {
			return false
		}
	}
	return true
}

func extractMarkdownLinks(raw, rawPath string) []TrellisLink {
	matches := linkRe.FindAllStringSubmatch(raw, -1)
	links := []TrellisLink{}
	seen := map[string]bool{}
	for _, match := range matches {
		label := strings.TrimSpace(match[1])
		target := strings.TrimSpace(match[2])
		if label == "" || target == "" || strings.HasPrefix(target, "http://") || strings.HasPrefix(target, "https://") || strings.HasPrefix(target, "#") {
			continue
		}
		if strings.Contains(target, "#") {
			target = strings.SplitN(target, "#", 2)[0]
		}
		normalized := filepath.ToSlash(filepath.Clean(filepath.Join(filepath.Dir(rawPath), target)))
		key := label + "\x00" + normalized
		if seen[key] {
			continue
		}
		seen[key] = true
		links = append(links, TrellisLink{Label: label, Path: normalized})
	}
	return links
}

func parseWorkflowStates(content string) []TrellisWorkflowState {
	lines := strings.Split(content, "\n")
	states := []TrellisWorkflowState{}
	for i := 0; i < len(lines); i++ {
		match := workflowTagRe.FindStringSubmatch(strings.TrimSpace(lines[i]))
		if match == nil {
			continue
		}
		name := match[1]
		endTag := "[/workflow-state:" + name + "]"
		body := []string{}
		for i++; i < len(lines); i++ {
			if strings.TrimSpace(lines[i]) == endTag {
				break
			}
			body = append(body, lines[i])
		}
		states = append(states, TrellisWorkflowState{Name: name, Content: strings.TrimSpace(strings.Join(body, "\n"))})
	}
	return states
}

func parseWorkflowPhases(content string, states []TrellisWorkflowState) []TrellisWorkflowPhase {
	phases := []TrellisWorkflowPhase{}
	for _, line := range strings.Split(content, "\n") {
		trimmed := strings.TrimSpace(line)
		match := phaseLineRe.FindStringSubmatch(trimmed)
		if match == nil {
			continue
		}
		name := strings.TrimSpace(match[1])
		phase := TrellisWorkflowPhase{Name: name, Summary: strings.TrimSpace(match[2])}
		for _, state := range states {
			if stateBelongsToPhase(state.Name, name) {
				phase.States = append(phase.States, state.Name)
			}
		}
		phases = append(phases, phase)
	}
	return phases
}

func stateBelongsToPhase(stateName, phaseName string) bool {
	switch {
	case strings.Contains(phaseName, "Phase 1"):
		return stateName == "planning" || stateName == "planning-inline"
	case strings.Contains(phaseName, "Phase 2"):
		return stateName == "in_progress" || stateName == "in_progress-inline"
	case strings.Contains(phaseName, "Phase 3"):
		return stateName == "completed"
	default:
		return stateName == "no_task"
	}
}

func countAcceptanceCriteria(doc TrellisDocument) (int, int) {
	for _, section := range doc.Sections {
		if strings.Contains(strings.ToLower(section.Title), "acceptance") {
			total := 0
			done := 0
			for _, item := range section.Items {
				if item.Checked == nil {
					continue
				}
				total++
				if *item.Checked {
					done++
				}
			}
			return total, done
		}
	}
	return 0, 0
}

func countChecklistItems(doc TrellisDocument) int {
	count := 0
	for _, section := range doc.Sections {
		for _, item := range section.Items {
			if item.Checked != nil {
				count++
			}
		}
	}
	return count
}

func countMarkdownFiles(root string) int {
	entries, err := os.ReadDir(root)
	if err != nil {
		return 0
	}
	count := 0
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(strings.ToLower(entry.Name()), ".md") {
			count++
		}
	}
	return count
}

func countJournalFiles(root string) int {
	entries, err := os.ReadDir(root)
	if err != nil {
		return 0
	}
	count := 0
	for _, entry := range entries {
		name := strings.ToLower(entry.Name())
		if !entry.IsDir() && strings.HasPrefix(name, "journal") && strings.HasSuffix(name, ".md") {
			count++
		}
	}
	return count
}

func isValidTrellisTaskPath(path string) bool {
	clean := filepath.ToSlash(filepath.Clean(strings.TrimSpace(path)))
	if clean == "." || clean == "" {
		return false
	}
	if clean == "tasks" || clean == "tasks/archive" {
		return false
	}
	return strings.HasPrefix(clean, "tasks/") && !strings.HasSuffix(clean, "/task.json")
}

func isValidTrellisSpecPath(path string) bool {
	clean := filepath.ToSlash(filepath.Clean(strings.TrimSpace(path)))
	return strings.HasPrefix(clean, "spec/") && strings.HasSuffix(strings.ToLower(clean), ".md")
}

func isValidTrellisSourcePath(path string) bool {
	raw := strings.TrimSpace(path)
	if raw == "" || filepath.IsAbs(raw) {
		return false
	}
	clean := filepath.ToSlash(filepath.Clean(raw))
	if clean == "." || clean == ".." || strings.HasPrefix(clean, "../") {
		return false
	}
	lower := strings.ToLower(clean)
	if clean == "workflow.md" {
		return true
	}
	if strings.HasPrefix(clean, "workspace/") {
		return false
	}
	if strings.HasPrefix(clean, "spec/") {
		return strings.HasSuffix(lower, ".md")
	}
	if strings.HasPrefix(clean, "tasks/") {
		return strings.HasSuffix(lower, ".md") ||
			strings.HasSuffix(lower, ".json") ||
			strings.HasSuffix(lower, ".jsonl")
	}
	return false
}

func pathExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func newTrellisWarning(code, severity, path, message string) TrellisWarning {
	return TrellisWarning{
		Code:     code,
		Severity: severity,
		Path:     filepath.ToSlash(path),
		Message:  message,
	}
}
