package api

import "testing"

func TestParseSessionIDFromPath(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		path string
		want string
	}{
		{name: "attach path", path: "/api/sessions/abc123/attach", want: "abc123"},
		{name: "files content path", path: "/api/sessions/abc123/files/content", want: "abc123"},
		{name: "session root path", path: "/api/sessions/abc123", want: "abc123"},
		{name: "invalid path", path: "/api/auth", want: ""},
		{name: "missing id", path: "/api/sessions/", want: ""},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := parseSessionIDFromPath(tc.path)
			if got != tc.want {
				t.Fatalf("parseSessionIDFromPath(%q) = %q, want %q", tc.path, got, tc.want)
			}
		})
	}
}

func TestResolvePathWithinRoot(t *testing.T) {
	t.Parallel()

	root := t.TempDir()

	tests := []struct {
		name      string
		inputPath string
		allowRoot bool
		wantRel   string
		wantErr   bool
	}{
		{name: "root path allowed", inputPath: ".", allowRoot: true, wantRel: ".", wantErr: false},
		{name: "root path disallowed", inputPath: ".", allowRoot: false, wantErr: true},
		{name: "nested file", inputPath: "dir/a.txt", allowRoot: false, wantRel: "dir/a.txt", wantErr: false},
		{name: "escape path", inputPath: "../etc/passwd", allowRoot: false, wantErr: true},
		{name: "absolute path", inputPath: "/etc/passwd", allowRoot: false, wantErr: true},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			_, rel, err := resolvePathWithinRoot(root, tc.inputPath, tc.allowRoot)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("resolvePathWithinRoot(%q) expected error, got nil", tc.inputPath)
				}
				return
			}
			if err != nil {
				t.Fatalf("resolvePathWithinRoot(%q) unexpected error: %v", tc.inputPath, err)
			}
			if rel != tc.wantRel {
				t.Fatalf("resolvePathWithinRoot(%q) rel = %q, want %q", tc.inputPath, rel, tc.wantRel)
			}
		})
	}
}

func TestIsTextContent(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		data []byte
		want bool
	}{
		{name: "utf8 text", data: []byte("hello, world"), want: true},
		{name: "empty content", data: []byte{}, want: true},
		{name: "contains nul", data: []byte{'a', 0, 'b'}, want: false},
		{name: "invalid utf8", data: []byte{0xff, 0xfe, 0xfd}, want: false},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := isTextContent(tc.data)
			if got != tc.want {
				t.Fatalf("isTextContent(%v) = %v, want %v", tc.data, got, tc.want)
			}
		})
	}
}
