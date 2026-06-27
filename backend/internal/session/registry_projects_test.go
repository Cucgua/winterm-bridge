package session

import (
	"testing"

	"winterm-bridge/internal/auth"
	"winterm-bridge/internal/config"
	"winterm-bridge/internal/tmux"
)

func TestListAllReturnsOnlyRuntimeSessions(t *testing.T) {
	registry := NewRegistry()

	liveID := auth.DeriveSessionID(tmux.SessionPrefix + "mchs-1")
	live := NewSession(liveID, tmux.SessionPrefix+"mchs-1")
	live.State = SessionDetached

	ghostID := auth.DeriveSessionID(tmux.SessionPrefix + "ghost")
	ghost := NewSession(ghostID, tmux.SessionPrefix+"ghost")
	ghost.IsGhost = true

	terminatedID := auth.DeriveSessionID(tmux.SessionPrefix + "dead")
	terminated := NewSession(terminatedID, tmux.SessionPrefix+"dead")
	terminated.State = SessionTerminated

	registry.sessions[live.ID] = live
	registry.sessions[ghost.ID] = ghost
	registry.sessions[terminated.ID] = terminated

	sessions := registry.ListAll()
	if len(sessions) != 1 {
		t.Fatalf("ListAll() length = %d, want 1", len(sessions))
	}
	if sessions[0].ID != liveID {
		t.Fatalf("ListAll()[0].ID = %q, want %q", sessions[0].ID, liveID)
	}
}

func TestCreateWithTitleDefaultsEmptyWorkingDirToHome(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	var gotWorkingDir string
	originalCreate := createTmuxSession
	originalApply := applyTmuxConfig
	createTmuxSession = func(name, title, workingDir string) error {
		gotWorkingDir = workingDir
		return nil
	}
	applyTmuxConfig = func(name string) error {
		return nil
	}
	defer func() {
		createTmuxSession = originalCreate
		applyTmuxConfig = originalApply
	}()

	registry := NewRegistry()
	if _, err := registry.CreateWithTitle("admin", "scratch", ""); err != nil {
		t.Fatalf("CreateWithTitle() error = %v", err)
	}

	if gotWorkingDir != home {
		t.Fatalf("workingDir = %q, want home %q", gotWorkingDir, home)
	}
}

func TestCreateProjectFromSessionUsesCurrentPathWithoutChangingSession(t *testing.T) {
	t.Setenv("HOME", t.TempDir())

	originalCurrentPath := currentTmuxPath
	currentTmuxPath = func(sessionName string) (string, error) {
		return "/work/mchs", nil
	}
	defer func() {
		currentTmuxPath = originalCurrentPath
	}()

	registry := NewRegistry()
	sess := NewSession("sess_mchs", tmux.SessionPrefix+"scratch")
	registry.sessions[sess.ID] = sess

	project, err := registry.CreateProjectFromSession(sess.ID, "mchs")
	if err != nil {
		t.Fatalf("CreateProjectFromSession() error = %v", err)
	}
	if project.Name != "mchs" {
		t.Fatalf("Project.Name = %q, want mchs", project.Name)
	}
	if project.WorkingDir != "/work/mchs" {
		t.Fatalf("Project.WorkingDir = %q, want /work/mchs", project.WorkingDir)
	}

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if len(cfg.Projects) != 1 {
		t.Fatalf("Projects length = %d, want 1", len(cfg.Projects))
	}
	if sess.ProjectID != "" {
		t.Fatalf("Session.ProjectID = %q, want empty", sess.ProjectID)
	}
	if sess.IsPersistent {
		t.Fatal("Session should not become persistent")
	}
}

func TestCreateProjectFromSessionDefaultsNameToCurrentFolder(t *testing.T) {
	t.Setenv("HOME", t.TempDir())

	originalCurrentPath := currentTmuxPath
	currentTmuxPath = func(sessionName string) (string, error) {
		return "/work/mchs", nil
	}
	defer func() {
		currentTmuxPath = originalCurrentPath
	}()

	registry := NewRegistry()
	sess := NewSession("sess_mchs", tmux.SessionPrefix+"scratch")
	registry.sessions[sess.ID] = sess

	project, err := registry.CreateProjectFromSession(sess.ID, "")
	if err != nil {
		t.Fatalf("CreateProjectFromSession() error = %v", err)
	}

	if project.Name != "mchs" {
		t.Fatalf("Project.Name = %q, want mchs", project.Name)
	}
	if project.WorkingDir != "/work/mchs" {
		t.Fatalf("Project.WorkingDir = %q, want /work/mchs", project.WorkingDir)
	}
}
