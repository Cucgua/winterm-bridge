package api

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"winterm-bridge/internal/auth"
	"winterm-bridge/internal/config"
)

func adminRequest(method, path string) *http.Request {
	req := httptest.NewRequest(method, path, nil)
	access := &auth.AccessToken{
		Token:     "test-token",
		Role:      auth.RoleAdmin,
		IssuedAt:  time.Now(),
		ExpiresAt: time.Now().Add(time.Hour),
	}
	ctx := context.WithValue(req.Context(), AccessContextKey, access)
	return req.WithContext(ctx)
}

func TestParseProjectIDFromPath(t *testing.T) {
	tests := []struct {
		name string
		path string
		want string
	}{
		{name: "project root", path: "/api/projects/project_mchs", want: "project_mchs"},
		{name: "project sessions", path: "/api/projects/project_mchs/sessions", want: "project_mchs"},
		{name: "invalid prefix", path: "/api/sessions/project_mchs", want: ""},
		{name: "missing id", path: "/api/projects/", want: ""},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := parseProjectIDFromPath(tc.path)
			if got != tc.want {
				t.Fatalf("parseProjectIDFromPath(%q) = %q, want %q", tc.path, got, tc.want)
			}
		})
	}
}

func TestHandleProjectsListsConfiguredProjects(t *testing.T) {
	t.Setenv("HOME", t.TempDir())

	project, err := config.AddProject(config.Project{Name: "mchs", WorkingDir: "/work/mchs"})
	if err != nil {
		t.Fatalf("AddProject() error = %v", err)
	}

	handler := NewHandler(nil, nil, nil, nil, nil)
	recorder := httptest.NewRecorder()
	handler.HandleProjects(recorder, adminRequest(http.MethodGet, "/api/projects"))

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body=%s", recorder.Code, http.StatusOK, recorder.Body.String())
	}

	var response ProjectsResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}
	if len(response.Projects) != 1 {
		t.Fatalf("Projects length = %d, want 1", len(response.Projects))
	}
	if response.Projects[0].ID != project.ID {
		t.Fatalf("Project ID = %q, want %q", response.Projects[0].ID, project.ID)
	}
	if response.Projects[0].Name != "mchs" {
		t.Fatalf("Project Name = %q, want mchs", response.Projects[0].Name)
	}
}

func TestHandleCreateSessionProjectAllowsEmptyName(t *testing.T) {
	t.Setenv("HOME", t.TempDir())

	handler := NewHandler(nil, nil, nil, nil, nil)
	req := adminRequest(http.MethodPost, "/api/sessions/sess_mchs/project")
	req.Body = io.NopCloser(strings.NewReader(`{"name":""}`))
	recorder := httptest.NewRecorder()

	handler.HandleCreateSessionProject(recorder, req)

	if recorder.Code == http.StatusBadRequest {
		t.Fatalf("status = %d, empty name should be allowed; body=%s", recorder.Code, recorder.Body.String())
	}
}
