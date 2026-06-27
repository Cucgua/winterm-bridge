package config

import (
	"testing"
	"time"
)

func withTempHome(t *testing.T) {
	t.Helper()
	t.Setenv("HOME", t.TempDir())
}

func TestMigratePersistentSessionsToProjects(t *testing.T) {
	withTempHome(t)

	createdAt := time.Date(2026, 6, 27, 10, 0, 0, 0, time.UTC)
	if err := Save(&Config{
		PersistentSessions: []PersistentSession{
			{
				ID:         "sess_mchs",
				Title:      "mchs",
				WorkingDir: "/work/mchs",
				CreatedAt:  createdAt,
			},
		},
	}); err != nil {
		t.Fatalf("Save() error = %v", err)
	}

	if err := MigratePersistentSessionsToProjects(); err != nil {
		t.Fatalf("MigratePersistentSessionsToProjects() error = %v", err)
	}

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if len(cfg.PersistentSessions) != 0 {
		t.Fatalf("PersistentSessions length = %d, want 0", len(cfg.PersistentSessions))
	}
	if len(cfg.Projects) != 1 {
		t.Fatalf("Projects length = %d, want 1", len(cfg.Projects))
	}

	project := cfg.Projects[0]
	if project.Name != "mchs" {
		t.Fatalf("Project.Name = %q, want mchs", project.Name)
	}
	if project.WorkingDir != "/work/mchs" {
		t.Fatalf("Project.WorkingDir = %q, want /work/mchs", project.WorkingDir)
	}
	if project.SessionCounter != 0 {
		t.Fatalf("Project.SessionCounter = %d, want 0", project.SessionCounter)
	}
	if project.CreatedAt.IsZero() {
		t.Fatal("Project.CreatedAt should be preserved or initialized")
	}
}

func TestNextProjectSessionTitleIncrementsCounter(t *testing.T) {
	withTempHome(t)

	project, err := AddProject(Project{Name: "mchs", WorkingDir: "/work/mchs"})
	if err != nil {
		t.Fatalf("AddProject() error = %v", err)
	}

	first, workingDir, err := NextProjectSessionTitle(project.ID)
	if err != nil {
		t.Fatalf("NextProjectSessionTitle(first) error = %v", err)
	}
	second, _, err := NextProjectSessionTitle(project.ID)
	if err != nil {
		t.Fatalf("NextProjectSessionTitle(second) error = %v", err)
	}

	if first != "mchs-1" {
		t.Fatalf("first title = %q, want mchs-1", first)
	}
	if second != "mchs-2" {
		t.Fatalf("second title = %q, want mchs-2", second)
	}
	if workingDir != "/work/mchs" {
		t.Fatalf("workingDir = %q, want /work/mchs", workingDir)
	}

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.Projects[0].SessionCounter != 2 {
		t.Fatalf("SessionCounter = %d, want 2", cfg.Projects[0].SessionCounter)
	}
	if cfg.Projects[0].LastOpenedAt.IsZero() {
		t.Fatal("LastOpenedAt should be set")
	}
}

func TestAddProjectRequiresName(t *testing.T) {
	withTempHome(t)

	if _, err := AddProject(Project{WorkingDir: "/work/mchs"}); err == nil {
		t.Fatal("AddProject() expected error for empty name")
	}
}
