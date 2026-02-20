package api

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"unicode/utf8"
)

const (
	maxEditableFileSize = 1 * 1024 * 1024
	maxSessionUploadMB  = 100 * 1024 * 1024
)

var (
	errSessionFileSessionNotFound  = errors.New("session not found")
	errSessionFilePathUnavailable  = errors.New("session current_path is unavailable")
	errSessionFilePathResolveFault = errors.New("failed to resolve session path")
)

type SessionFileEntry struct {
	Name    string `json:"name"`
	Path    string `json:"path"`
	IsDir   bool   `json:"is_dir"`
	Size    int64  `json:"size"`
	ModTime string `json:"mod_time"`
}

type SessionFileListResponse struct {
	CWD     string             `json:"cwd"`
	Path    string             `json:"path"`
	Entries []SessionFileEntry `json:"entries"`
}

type SessionFileContentResponse struct {
	Path    string `json:"path"`
	Content string `json:"content"`
	Size    int64  `json:"size"`
	MtimeMS int64  `json:"mtime_ms"`
}

type SessionFileOperationResponse struct {
	OK      bool   `json:"ok"`
	Path    string `json:"path,omitempty"`
	Message string `json:"message,omitempty"`
}

func (h *Handler) HandleSessionFiles(w http.ResponseWriter, r *http.Request) {
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

	rootPath, err := h.resolveSessionRootPath(sessionID)
	if err != nil {
		writeSessionRootError(w, err)
		return
	}

	requestPath := r.URL.Query().Get("path")
	absPath, relPath, err := resolvePathWithinRoot(rootPath, requestPath, true)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	info, err := os.Stat(absPath)
	if err != nil {
		if os.IsNotExist(err) {
			writeError(w, http.StatusNotFound, "path not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to stat path")
		return
	}
	if !info.IsDir() {
		writeError(w, http.StatusBadRequest, "path is not a directory")
		return
	}

	entries, err := os.ReadDir(absPath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to read directory")
		return
	}

	showHidden := r.URL.Query().Get("show_hidden") == "true"
	fileEntries := make([]SessionFileEntry, 0, len(entries))
	for _, entry := range entries {
		name := entry.Name()
		if !showHidden && strings.HasPrefix(name, ".") {
			continue
		}

		entryInfo, err := entry.Info()
		if err != nil {
			continue
		}

		entryRelPath := filepath.Join(relPath, name)
		entryRelPath = filepath.ToSlash(filepath.Clean(entryRelPath))
		if entryRelPath == "." {
			entryRelPath = name
		}

		item := SessionFileEntry{
			Name:    name,
			Path:    entryRelPath,
			IsDir:   entry.IsDir(),
			Size:    0,
			ModTime: entryInfo.ModTime().UTC().Format("2006-01-02T15:04:05Z07:00"),
		}
		if !entry.IsDir() {
			item.Size = entryInfo.Size()
		}
		fileEntries = append(fileEntries, item)
	}

	sort.Slice(fileEntries, func(i, j int) bool {
		if fileEntries[i].IsDir != fileEntries[j].IsDir {
			return fileEntries[i].IsDir
		}
		return strings.ToLower(fileEntries[i].Name) < strings.ToLower(fileEntries[j].Name)
	})

	writeJSON(w, http.StatusOK, SessionFileListResponse{
		CWD:     rootPath,
		Path:    filepath.ToSlash(relPath),
		Entries: fileEntries,
	})
}

func (h *Handler) HandleSessionFileContent(w http.ResponseWriter, r *http.Request) {
	sessionID := parseSessionIDFromPath(r.URL.Path)
	if sessionID == "" {
		writeError(w, http.StatusBadRequest, "missing session ID")
		return
	}
	if !h.requireSessionAccess(w, r, sessionID) {
		return
	}

	rootPath, err := h.resolveSessionRootPath(sessionID)
	if err != nil {
		writeSessionRootError(w, err)
		return
	}

	switch r.Method {
	case http.MethodGet:
		rawPath := r.URL.Query().Get("path")
		absPath, relPath, err := resolvePathWithinRoot(rootPath, rawPath, false)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		info, err := os.Stat(absPath)
		if err != nil {
			if os.IsNotExist(err) {
				writeError(w, http.StatusNotFound, "file not found")
				return
			}
			writeError(w, http.StatusInternalServerError, "failed to stat file")
			return
		}
		if info.IsDir() {
			writeError(w, http.StatusBadRequest, "path is a directory")
			return
		}
		if info.Size() > maxEditableFileSize {
			writeError(w, http.StatusRequestEntityTooLarge, "file too large for inline editing")
			return
		}

		data, err := os.ReadFile(absPath)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to read file")
			return
		}
		if int64(len(data)) > maxEditableFileSize {
			writeError(w, http.StatusRequestEntityTooLarge, "file too large for inline editing")
			return
		}
		if !isTextContent(data) {
			writeError(w, http.StatusUnsupportedMediaType, "only text files are supported")
			return
		}

		writeJSON(w, http.StatusOK, SessionFileContentResponse{
			Path:    filepath.ToSlash(relPath),
			Content: string(data),
			Size:    int64(len(data)),
			MtimeMS: info.ModTime().UnixMilli(),
		})
	case http.MethodPut:
		if !h.requireAdmin(w, r) {
			return
		}

		var req struct {
			Path            string `json:"path"`
			Content         string `json:"content"`
			ExpectedMtimeMS int64  `json:"expected_mtime_ms"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}

		absPath, relPath, err := resolvePathWithinRoot(rootPath, req.Path, false)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		contentBytes := []byte(req.Content)
		if int64(len(contentBytes)) > maxEditableFileSize {
			writeError(w, http.StatusRequestEntityTooLarge, "file too large for inline editing")
			return
		}

		parent := filepath.Dir(absPath)
		parentInfo, err := os.Stat(parent)
		if err != nil || !parentInfo.IsDir() {
			writeError(w, http.StatusBadRequest, "parent directory does not exist")
			return
		}

		if req.ExpectedMtimeMS > 0 {
			info, err := os.Stat(absPath)
			if err != nil {
				if os.IsNotExist(err) {
					writeError(w, http.StatusConflict, "file has been changed, please refresh")
					return
				}
				writeError(w, http.StatusInternalServerError, "failed to stat file")
				return
			}
			if info.ModTime().UnixMilli() != req.ExpectedMtimeMS {
				writeError(w, http.StatusConflict, "file has been changed, please refresh")
				return
			}
		}

		if err := os.WriteFile(absPath, contentBytes, 0644); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to write file")
			return
		}

		_, err = os.Stat(absPath)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to stat file")
			return
		}

		writeJSON(w, http.StatusOK, SessionFileOperationResponse{
			OK:   true,
			Path: filepath.ToSlash(relPath),
		})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (h *Handler) HandleSessionFileDirs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if !h.requireAdmin(w, r) {
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

	rootPath, err := h.resolveSessionRootPath(sessionID)
	if err != nil {
		writeSessionRootError(w, err)
		return
	}

	var req struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	absPath, relPath, err := resolvePathWithinRoot(rootPath, req.Path, false)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if _, err := os.Stat(absPath); err == nil {
		writeError(w, http.StatusConflict, "path already exists")
		return
	}

	if err := os.Mkdir(absPath, 0755); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create directory")
		return
	}

	writeJSON(w, http.StatusOK, SessionFileOperationResponse{
		OK:   true,
		Path: filepath.ToSlash(relPath),
	})
}

func (h *Handler) HandleSessionFileMove(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if !h.requireAdmin(w, r) {
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

	rootPath, err := h.resolveSessionRootPath(sessionID)
	if err != nil {
		writeSessionRootError(w, err)
		return
	}

	var req struct {
		FromPath string `json:"from_path"`
		ToPath   string `json:"to_path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	srcAbs, _, err := resolvePathWithinRoot(rootPath, req.FromPath, false)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid from_path")
		return
	}
	dstAbs, dstRel, err := resolvePathWithinRoot(rootPath, req.ToPath, false)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid to_path")
		return
	}

	if _, err := os.Stat(srcAbs); err != nil {
		if os.IsNotExist(err) {
			writeError(w, http.StatusNotFound, "source path not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to stat source path")
		return
	}
	if _, err := os.Stat(dstAbs); err == nil {
		writeError(w, http.StatusConflict, "target path already exists")
		return
	}

	dstParent := filepath.Dir(dstAbs)
	parentInfo, err := os.Stat(dstParent)
	if err != nil || !parentInfo.IsDir() {
		writeError(w, http.StatusBadRequest, "target parent directory does not exist")
		return
	}

	if err := os.Rename(srcAbs, dstAbs); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to move path")
		return
	}

	writeJSON(w, http.StatusOK, SessionFileOperationResponse{
		OK:   true,
		Path: filepath.ToSlash(dstRel),
	})
}

func (h *Handler) HandleSessionFileDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if !h.requireAdmin(w, r) {
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

	rootPath, err := h.resolveSessionRootPath(sessionID)
	if err != nil {
		writeSessionRootError(w, err)
		return
	}

	rawPath := r.URL.Query().Get("path")
	absPath, relPath, err := resolvePathWithinRoot(rootPath, rawPath, false)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	recursive := r.URL.Query().Get("recursive") == "true"

	if filepath.Clean(relPath) == "." {
		writeError(w, http.StatusBadRequest, "cannot delete root directory")
		return
	}

	info, err := os.Lstat(absPath)
	if err != nil {
		if os.IsNotExist(err) {
			writeError(w, http.StatusNotFound, "path not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to stat path")
		return
	}

	deleteErr := error(nil)
	if info.Mode()&os.ModeSymlink != 0 {
		deleteErr = os.Remove(absPath)
	} else if info.IsDir() && recursive {
		deleteErr = os.RemoveAll(absPath)
	} else {
		deleteErr = os.Remove(absPath)
	}

	if deleteErr != nil {
		if os.IsNotExist(deleteErr) {
			writeError(w, http.StatusNotFound, "path not found")
			return
		}
		lowerErr := strings.ToLower(deleteErr.Error())
		if strings.Contains(lowerErr, "directory not empty") || strings.Contains(lowerErr, "not empty") {
			writeError(w, http.StatusConflict, "directory is not empty")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to delete path")
		return
	}

	writeJSON(w, http.StatusOK, SessionFileOperationResponse{
		OK:   true,
		Path: filepath.ToSlash(relPath),
	})
}

func (h *Handler) HandleSessionFileUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if !h.requireAdmin(w, r) {
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

	rootPath, err := h.resolveSessionRootPath(sessionID)
	if err != nil {
		writeSessionRootError(w, err)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxSessionUploadMB)
	if err := r.ParseMultipartForm(maxSessionUploadMB); err != nil {
		writeError(w, http.StatusBadRequest, "file too large or invalid form data")
		return
	}

	dirPath := r.FormValue("path")
	dirAbs, dirRel, err := resolvePathWithinRoot(rootPath, dirPath, true)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	dirInfo, err := os.Stat(dirAbs)
	if err != nil {
		if os.IsNotExist(err) {
			writeError(w, http.StatusNotFound, "target directory not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to stat target directory")
		return
	}
	if !dirInfo.IsDir() {
		writeError(w, http.StatusBadRequest, "target path is not a directory")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "missing file field")
		return
	}
	defer file.Close()

	filename := sanitizeUploadFilename(header.Filename)
	if filename == "" {
		writeError(w, http.StatusBadRequest, "invalid filename")
		return
	}

	targetRel := filepath.ToSlash(filepath.Join(dirRel, filename))
	targetAbs, targetCleanRel, err := resolvePathWithinRoot(rootPath, targetRel, false)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	if _, err := os.Stat(targetAbs); err == nil {
		writeError(w, http.StatusConflict, "target file already exists")
		return
	}

	dst, err := os.OpenFile(targetAbs, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0644)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create target file")
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save uploaded file")
		return
	}

	writeJSON(w, http.StatusOK, SessionFileOperationResponse{
		OK:   true,
		Path: filepath.ToSlash(targetCleanRel),
	})
}

func (h *Handler) HandleSessionFileDownload(w http.ResponseWriter, r *http.Request) {
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

	rootPath, err := h.resolveSessionRootPath(sessionID)
	if err != nil {
		writeSessionRootError(w, err)
		return
	}

	rawPath := r.URL.Query().Get("path")
	absPath, _, err := resolvePathWithinRoot(rootPath, rawPath, false)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	info, err := os.Stat(absPath)
	if err != nil {
		if os.IsNotExist(err) {
			writeError(w, http.StatusNotFound, "file not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to stat file")
		return
	}
	if info.IsDir() {
		writeError(w, http.StatusBadRequest, "path is a directory")
		return
	}

	filename := filepath.Base(absPath)
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filename))
	http.ServeFile(w, r, absPath)
}

func (h *Handler) resolveSessionRootPath(sessionID string) (string, error) {
	sess := h.registry.Get(sessionID)
	if sess == nil {
		return "", errSessionFileSessionNotFound
	}

	rootPath := strings.TrimSpace(sess.GetCurrentPath())
	if rootPath == "" {
		return "", errSessionFilePathUnavailable
	}

	rootAbs, err := filepath.Abs(rootPath)
	if err != nil {
		return "", errSessionFilePathResolveFault
	}
	return filepath.Clean(rootAbs), nil
}

func writeSessionRootError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, errSessionFileSessionNotFound):
		writeError(w, http.StatusNotFound, "session not found")
	case errors.Is(err, errSessionFilePathUnavailable):
		writeError(w, http.StatusBadRequest, "session current_path is unavailable")
	default:
		writeError(w, http.StatusInternalServerError, "failed to resolve session path")
	}
}

func resolvePathWithinRoot(rootPath, rawPath string, allowRoot bool) (string, string, error) {
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
		return "", "", errors.New("path escapes session root")
	}

	rootAbs, err := filepath.Abs(rootPath)
	if err != nil {
		return "", "", errors.New("failed to resolve root path")
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
		return "", "", errors.New("path escapes session root")
	}

	// Additional symlink safety checks:
	// 1) If target exists, resolved target must stay inside root.
	// 2) If target does not exist, resolved parent must stay inside root.
	if resolvedTarget, err := filepath.EvalSymlinks(targetAbs); err == nil {
		if !isPathInsideRoot(rootResolved, resolvedTarget) {
			return "", "", errors.New("path escapes session root")
		}
	} else if !os.IsNotExist(err) {
		return "", "", errors.New("failed to resolve target path")
	}

	if cleanRel != "." {
		parentPath := filepath.Dir(targetAbs)
		if resolvedParent, err := filepath.EvalSymlinks(parentPath); err == nil {
			if !isPathInsideRoot(rootResolved, resolvedParent) {
				return "", "", errors.New("path escapes session root")
			}
		} else if !os.IsNotExist(err) {
			return "", "", errors.New("failed to resolve parent path")
		}
	}

	return targetAbs, filepath.Clean(relToRoot), nil
}

func isPathInsideRoot(rootPath, targetPath string) bool {
	rel, err := filepath.Rel(rootPath, targetPath)
	if err != nil {
		return false
	}
	return rel == "." || (rel != ".." && !strings.HasPrefix(rel, ".."+string(os.PathSeparator)))
}

func sanitizeUploadFilename(name string) string {
	base := filepath.Base(strings.TrimSpace(name))
	if base == "." || base == string(filepath.Separator) || base == "" {
		return ""
	}
	return base
}

func isTextContent(data []byte) bool {
	if len(data) == 0 {
		return true
	}
	if bytes.IndexByte(data, 0) >= 0 {
		return false
	}
	return utf8.Valid(data)
}

// Git integration types

type GitStatusEntry struct {
	Path   string `json:"path"`
	Status string `json:"status"` // M, A, D, ?, R, C, U
}

type GitStatusResponse struct {
	IsRepo  bool             `json:"is_repo"`
	Branch  string           `json:"branch,omitempty"`
	Entries []GitStatusEntry `json:"entries"`
}

type GitDiffResponse struct {
	Path string `json:"path"`
	Diff string `json:"diff"`
}

// HandleSessionGitStatus handles GET /api/sessions/{id}/git/status
func (h *Handler) HandleSessionGitStatus(w http.ResponseWriter, r *http.Request) {
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

	rootPath, err := h.resolveSessionRootPath(sessionID)
	if err != nil {
		writeSessionRootError(w, err)
		return
	}

	// Check if directory is a git repo
	cmd := exec.Command("git", "rev-parse", "--is-inside-work-tree")
	cmd.Dir = rootPath
	if err := cmd.Run(); err != nil {
		writeJSON(w, http.StatusOK, GitStatusResponse{IsRepo: false, Entries: []GitStatusEntry{}})
		return
	}

	// Get branch name
	branchCmd := exec.Command("git", "rev-parse", "--abbrev-ref", "HEAD")
	branchCmd.Dir = rootPath
	branchOut, _ := branchCmd.Output()
	branch := strings.TrimSpace(string(branchOut))

	// Get status
	statusCmd := exec.Command("git", "status", "--porcelain", "-uall")
	statusCmd.Dir = rootPath
	statusOut, err := statusCmd.Output()
	if err != nil {
		writeJSON(w, http.StatusOK, GitStatusResponse{IsRepo: true, Branch: branch, Entries: []GitStatusEntry{}})
		return
	}

	entries := []GitStatusEntry{}
	for _, line := range strings.Split(string(statusOut), "\n") {
		if len(line) < 4 {
			continue
		}
		xy := strings.TrimSpace(line[:2])
		path := strings.TrimSpace(line[3:])
		// Handle renames: "R  old -> new"
		if idx := strings.Index(path, " -> "); idx >= 0 {
			path = path[idx+4:]
		}
		status := "M"
		switch {
		case strings.Contains(xy, "?"):
			status = "?"
		case strings.Contains(xy, "A"):
			status = "A"
		case strings.Contains(xy, "D"):
			status = "D"
		case strings.Contains(xy, "R"):
			status = "R"
		case strings.Contains(xy, "U"):
			status = "U"
		}
		entries = append(entries, GitStatusEntry{Path: path, Status: status})
	}

	writeJSON(w, http.StatusOK, GitStatusResponse{IsRepo: true, Branch: branch, Entries: entries})
}

// HandleSessionGitDiff handles GET /api/sessions/{id}/git/diff?path=
func (h *Handler) HandleSessionGitDiff(w http.ResponseWriter, r *http.Request) {
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

	rootPath, err := h.resolveSessionRootPath(sessionID)
	if err != nil {
		writeSessionRootError(w, err)
		return
	}

	filePath := r.URL.Query().Get("path")
	if filePath == "" {
		// Return full diff
		cmd := exec.Command("git", "diff", "HEAD")
		cmd.Dir = rootPath
		out, err := cmd.Output()
		if err != nil {
			// Try diff without HEAD (for repos with no commits)
			cmd2 := exec.Command("git", "diff")
			cmd2.Dir = rootPath
			out, _ = cmd2.Output()
		}
		writeJSON(w, http.StatusOK, GitDiffResponse{Path: "", Diff: string(out)})
		return
	}

	// Validate path stays within root
	_, relPath, err := resolvePathWithinRoot(rootPath, filePath, false)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Try staged + unstaged diff
	cmd := exec.Command("git", "diff", "HEAD", "--", relPath)
	cmd.Dir = rootPath
	out, err := cmd.Output()
	if err != nil || len(out) == 0 {
		// Fallback: unstaged only
		cmd2 := exec.Command("git", "diff", "--", relPath)
		cmd2.Dir = rootPath
		out, _ = cmd2.Output()
	}
	// If still empty, try showing untracked file content
	if len(out) == 0 {
		cmd3 := exec.Command("git", "diff", "--no-index", "/dev/null", relPath)
		cmd3.Dir = rootPath
		out, _ = cmd3.Output()
	}

	writeJSON(w, http.StatusOK, GitDiffResponse{Path: relPath, Diff: string(out)})
}
