package api

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"winterm-bridge/internal/config"
	"winterm-bridge/internal/session"
)

type ProjectInfo struct {
	ID             string    `json:"id"`
	Name           string    `json:"name"`
	WorkingDir     string    `json:"working_dir"`
	CreatedAt      time.Time `json:"created_at"`
	LastOpenedAt   time.Time `json:"last_opened_at,omitempty"`
	SessionCounter int       `json:"session_counter"`
	IsArchived     bool      `json:"is_archived"`
}

type ProjectsResponse struct {
	Projects []ProjectInfo `json:"projects"`
}

type ProjectResponse struct {
	Project ProjectInfo `json:"project"`
}

type CreateProjectRequest struct {
	Name             string `json:"name"`
	WorkingDirectory string `json:"working_directory,omitempty"`
}

type CreateSessionProjectRequest struct {
	Name string `json:"name,omitempty"`
}

func projectToInfo(project config.Project) ProjectInfo {
	return ProjectInfo{
		ID:             project.ID,
		Name:           project.Name,
		WorkingDir:     project.WorkingDir,
		CreatedAt:      project.CreatedAt,
		LastOpenedAt:   project.LastOpenedAt,
		SessionCounter: project.SessionCounter,
		IsArchived:     project.IsArchived,
	}
}

func parseProjectIDFromPath(path string) string {
	trimmed := strings.Trim(path, "/")
	if trimmed == "" {
		return ""
	}
	parts := strings.Split(trimmed, "/")
	// Expected: /api/projects/{id} or /api/projects/{id}/sessions
	if len(parts) < 3 || parts[0] != "api" || parts[1] != "projects" {
		return ""
	}
	return strings.TrimSpace(parts[2])
}

func (h *Handler) HandleProjects(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdmin(w, r) {
		return
	}

	switch r.Method {
	case http.MethodGet:
		if err := config.MigratePersistentSessionsToProjects(); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to migrate projects")
			return
		}
		projects := config.GetAllProjects()
		infos := make([]ProjectInfo, 0, len(projects))
		for _, project := range projects {
			infos = append(infos, projectToInfo(project))
		}
		writeJSON(w, http.StatusOK, ProjectsResponse{Projects: infos})

	case http.MethodPost:
		var req CreateProjectRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		project, err := config.AddProject(config.Project{
			Name:       req.Name,
			WorkingDir: req.WorkingDirectory,
		})
		if err != nil {
			if errors.Is(err, config.ErrProjectNameRequired) {
				writeError(w, http.StatusBadRequest, "project name is required")
				return
			}
			writeError(w, http.StatusInternalServerError, "failed to create project")
			return
		}
		writeJSON(w, http.StatusCreated, ProjectResponse{Project: projectToInfo(project)})

	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (h *Handler) HandleProjectByID(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdmin(w, r) {
		return
	}

	projectID := parseProjectIDFromPath(r.URL.Path)
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "missing project ID")
		return
	}

	switch r.Method {
	case http.MethodDelete:
		if err := config.DeleteProject(projectID); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to delete project")
			return
		}
		w.WriteHeader(http.StatusNoContent)

	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (h *Handler) HandleCreateProjectSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if !h.requireAdmin(w, r) {
		return
	}
	if h.registry == nil {
		writeError(w, http.StatusInternalServerError, "session registry is not initialized")
		return
	}

	projectID := parseProjectIDFromPath(r.URL.Path)
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "missing project ID")
		return
	}

	sess, err := h.registry.CreateFromProject(projectID)
	if err != nil {
		if errors.Is(err, config.ErrProjectNotFound) {
			writeError(w, http.StatusNotFound, "project not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to create session")
		return
	}

	writeJSON(w, http.StatusCreated, CreateSessionResponse{Session: sessionToInfo(sess)})
}

func (h *Handler) HandleCreateSessionProject(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if !h.requireAdmin(w, r) {
		return
	}
	if h.registry == nil {
		writeError(w, http.StatusInternalServerError, "session registry is not initialized")
		return
	}

	sessionID := parseSessionIDFromPath(r.URL.Path)
	if sessionID == "" {
		writeError(w, http.StatusBadRequest, "missing session ID")
		return
	}

	var req CreateSessionProjectRequest
	if r.Body != nil {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			if !errors.Is(err, io.EOF) {
				writeError(w, http.StatusBadRequest, "invalid request body")
				return
			}
		}
	}

	project, err := h.registry.CreateProjectFromSession(sessionID, req.Name)
	if err != nil {
		if errors.Is(err, session.ErrSessionNotFound) {
			writeError(w, http.StatusNotFound, "session not found")
			return
		}
		if errors.Is(err, config.ErrProjectNameRequired) {
			writeError(w, http.StatusBadRequest, "project name is required")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to create project")
		return
	}

	writeJSON(w, http.StatusCreated, ProjectResponse{Project: projectToInfo(project)})
}
