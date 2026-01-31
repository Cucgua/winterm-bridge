package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// OpenAICompatProvider implements Provider for OpenAI-compatible APIs
// Works with OpenAI, Qwen (DashScope), DeepSeek, and other compatible services
type OpenAICompatProvider struct {
	config Config
	client *http.Client
}

// NewOpenAICompatProvider creates a new OpenAI-compatible provider
func NewOpenAICompatProvider(cfg Config) *OpenAICompatProvider {
	return &OpenAICompatProvider{
		config: cfg,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// chatRequest represents the OpenAI chat completion request
type chatRequest struct {
	Model       string        `json:"model"`
	Messages    []chatMessage `json:"messages"`
	Temperature float64       `json:"temperature,omitempty"`
	MaxTokens   int           `json:"max_tokens,omitempty"`
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// chatResponse represents the OpenAI chat completion response
type chatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
		Type    string `json:"type"`
	} `json:"error,omitempty"`
}

// Summarize implements Provider.Summarize
func (p *OpenAICompatProvider) Summarize(ctx context.Context, content string) (*Summary, error) {
	// Build request
	req := chatRequest{
		Model: p.config.Model,
		Messages: []chatMessage{
			{Role: "system", Content: DefaultPrompt},
			{Role: "user", Content: content},
		},
		Temperature: 0.3,
		MaxTokens:   200,
	}

	reqBody, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	// Determine endpoint
	endpoint := strings.TrimSuffix(p.config.Endpoint, "/")
	if !strings.HasSuffix(endpoint, "/chat/completions") {
		endpoint += "/chat/completions"
	}

	// Create HTTP request
	httpReq, err := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewReader(reqBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+p.config.APIKey)

	// Execute request
	resp, err := p.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	// Read response
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	// Parse response
	var chatResp chatResponse
	if err := json.Unmarshal(body, &chatResp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	// Check for API error
	if chatResp.Error != nil {
		return nil, fmt.Errorf("API error: %s", chatResp.Error.Message)
	}

	// Extract content
	if len(chatResp.Choices) == 0 {
		return nil, fmt.Errorf("no response from model")
	}

	content = strings.TrimSpace(chatResp.Choices[0].Message.Content)

	// Parse JSON response from LLM
	// Handle potential markdown code blocks
	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimPrefix(content, "```")
	content = strings.TrimSuffix(content, "```")
	content = strings.TrimSpace(content)

	// Extract JSON object - find first { and matching }
	jsonContent := extractJSON(content)
	if jsonContent == "" {
		return &Summary{
			Tag:         "错误",
			Description: "AI响应中未找到JSON",
		}, nil
	}

	var summary Summary
	if err := json.Unmarshal([]byte(jsonContent), &summary); err != nil {
		// If parsing fails, return error summary
		return &Summary{
			Tag:         "错误",
			Description: "AI响应解析失败",
		}, nil
	}

	// Validate and sanitize
	if summary.Tag == "" {
		summary.Tag = "未知"
	}
	if len(summary.Tag) > 12 { // Max 4 Chinese characters (3 bytes each)
		summary.Tag = string([]rune(summary.Tag)[:4])
	}
	if len(summary.Description) > 90 { // Max 30 Chinese characters
		summary.Description = string([]rune(summary.Description)[:30]) + "..."
	}

	return &summary, nil
}

// TestConnection tests if the API is reachable and credentials are valid
func (p *OpenAICompatProvider) TestConnection(ctx context.Context) error {
	_, err := p.Summarize(ctx, "echo hello\nhello\n$ ")
	return err
}

// extractJSON extracts the first valid JSON object from a string
// This handles cases where LLM adds extra text before or after the JSON
func extractJSON(s string) string {
	// Find the first '{'
	start := strings.Index(s, "{")
	if start == -1 {
		return ""
	}

	// Find matching '}' by counting braces
	depth := 0
	for i := start; i < len(s); i++ {
		switch s[i] {
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return s[start : i+1]
			}
		}
	}

	// No matching brace found
	return ""
}
