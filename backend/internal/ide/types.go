package ide

// ProjectInfo represents the IDE project information
type ProjectInfo struct {
	Name     string `json:"name"`
	BasePath string `json:"basePath"`
}

// FileInfo represents an open file in the IDE
type FileInfo struct {
	Name     string `json:"name"`
	Path     string `json:"path"`
	IsActive bool   `json:"isActive"`
}

// FunctionInfo represents the currently focused function/method
type FunctionInfo struct {
	Name       string `json:"name"`
	Signature  string `json:"signature"`
	ClassName  string `json:"className,omitempty"`
	FilePath   string `json:"filePath"`
	LineNumber int    `json:"lineNumber"`
	Language   string `json:"language"`
}

// ProjectContext represents a single project's context within the IDE
type ProjectContext struct {
	Project         *ProjectInfo  `json:"project,omitempty"`
	OpenFiles       []FileInfo    `json:"openFiles"`
	CurrentFunction *FunctionInfo `json:"currentFunction,omitempty"`
}

// ContextData represents the full IDE context response (multi-project)
type ContextData struct {
	Projects []ProjectContext `json:"projects"`
}

// HealthResponse represents the plugin health check response
type HealthResponse struct {
	Status  string `json:"status"`
	Version string `json:"version"`
}
