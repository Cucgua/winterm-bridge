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
			Timeout: 180 * time.Second, // Reasoning models can take longer
		},
	}
}

// chatRequest represents the OpenAI chat completion request
type chatRequest struct {
	Model       string        `json:"model"`
	Messages    []chatMessage `json:"messages"`
	Temperature float64       `json:"temperature,omitempty"`
	MaxTokens   int           `json:"max_tokens,omitempty"`
	Stream      bool          `json:"stream"`
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// chatResponse represents the OpenAI chat completion response
type chatResponse struct {
	Choices []struct {
		Message struct {
			Content          *string `json:"content"`           // Can be null for reasoning models
			ReasoningContent string  `json:"reasoning_content"` // GLM-4.7 and other reasoning models use this
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
		Type    string `json:"type"`
	} `json:"error,omitempty"`
}

// Summarize implements Provider.Summarize
func (p *OpenAICompatProvider) Summarize(ctx context.Context, content string) (*Summary, error) {
	startTime := time.Now()
	logger := GetRequestLogger()

	// Build request - start with extra params so they appear first in JSON
	reqMap := make(map[string]interface{})

	// Merge extra params first (e.g., thinking config)
	if p.config.ExtraParams != "" {
		var extra map[string]interface{}
		if err := json.Unmarshal([]byte(p.config.ExtraParams), &extra); err == nil {
			for k, v := range extra {
				reqMap[k] = v
			}
		}
	}

	// Then add standard params (won't override extra params with same key)
	if _, exists := reqMap["model"]; !exists {
		reqMap["model"] = p.config.Model
	}
	reqMap["messages"] = []map[string]string{
		{"role": "system", "content": DefaultPrompt},
		{"role": "user", "content": content},
	}
	if _, exists := reqMap["temperature"]; !exists {
		reqMap["temperature"] = 0.3
	}
	if _, exists := reqMap["max_tokens"]; !exists {
		reqMap["max_tokens"] = 2000
	}
	reqMap["stream"] = false

	reqBody, err := json.Marshal(reqMap)
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
		// Log error
		if logger.IsEnabled() {
			logger.Log(AIRequestLog{
				Type:          "summarize",
				Model:         p.config.Model,
				SystemPrompt:  DefaultPrompt,
				UserContent:   content,
				RequestParams: string(reqBody),
				ExtraParams:   p.config.ExtraParams,
				Error:         err.Error(),
				DurationMs:    time.Since(startTime).Milliseconds(),
			})
		}
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
		if logger.IsEnabled() {
			logger.Log(AIRequestLog{
				Type:          "summarize",
				Model:         p.config.Model,
				SystemPrompt:  DefaultPrompt,
				UserContent:   content,
				RequestParams: string(reqBody),
				ExtraParams:   p.config.ExtraParams,
				RawResponse:   string(body),
				Error:         chatResp.Error.Message,
				DurationMs:    time.Since(startTime).Milliseconds(),
			})
		}
		return nil, fmt.Errorf("API error: %s", chatResp.Error.Message)
	}

	// Extract content
	if len(chatResp.Choices) == 0 {
		return nil, fmt.Errorf("no response from model")
	}

	// Handle both standard and reasoning model response formats
	// Reasoning models (like GLM-4.7) return content=null with reasoning_content
	var responseContent string
	if chatResp.Choices[0].Message.Content != nil {
		responseContent = strings.TrimSpace(*chatResp.Choices[0].Message.Content)
	} else if chatResp.Choices[0].Message.ReasoningContent != "" {
		responseContent = strings.TrimSpace(chatResp.Choices[0].Message.ReasoningContent)
	}

	if responseContent == "" {
		return nil, fmt.Errorf("empty response from model")
	}

	// Parse JSON response from LLM
	// Handle potential markdown code blocks
	cleanContent := responseContent
	cleanContent = strings.TrimPrefix(cleanContent, "```json")
	cleanContent = strings.TrimPrefix(cleanContent, "```")
	cleanContent = strings.TrimSuffix(cleanContent, "```")
	cleanContent = strings.TrimSpace(cleanContent)

	// Extract JSON object - find first { and matching }
	jsonContent := extractJSON(cleanContent)
	if jsonContent == "" {
		if logger.IsEnabled() {
			logger.Log(AIRequestLog{
				Type:          "summarize",
				Model:         p.config.Model,
				SystemPrompt:  DefaultPrompt,
				UserContent:   content,
				RequestParams: string(reqBody),
				ExtraParams:   p.config.ExtraParams,
				RawResponse:   responseContent,
				Error:         "no JSON found in response",
				DurationMs:    time.Since(startTime).Milliseconds(),
			})
		}
		return &Summary{
			Tag:         "错误",
			Description: "AI响应中未找到JSON",
		}, nil
	}

	var summary Summary
	if err := json.Unmarshal([]byte(jsonContent), &summary); err != nil {
		// If parsing fails, return error summary
		if logger.IsEnabled() {
			logger.Log(AIRequestLog{
				Type:          "summarize",
				Model:         p.config.Model,
				SystemPrompt:  DefaultPrompt,
				UserContent:   content,
				RequestParams: string(reqBody),
				ExtraParams:   p.config.ExtraParams,
				RawResponse:   responseContent,
				Error:         "JSON parse error: " + err.Error(),
				DurationMs:    time.Since(startTime).Milliseconds(),
			})
		}
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

	// Log successful request
	if logger.IsEnabled() {
		logger.Log(AIRequestLog{
			Type:          "summarize",
			Model:         p.config.Model,
			SystemPrompt:  DefaultPrompt,
			UserContent:   content,
			RequestParams: string(reqBody),
			ExtraParams:   p.config.ExtraParams,
			RawResponse:   responseContent,
			ParsedJSON:    jsonContent,
			DurationMs:    time.Since(startTime).Milliseconds(),
		})
	}

	return &summary, nil
}

// TestConnection tests if the API is reachable and credentials are valid
func (p *OpenAICompatProvider) TestConnection(ctx context.Context) error {
	_, err := p.Summarize(ctx, "echo hello\nhello\n$ ")
	return err
}

// extractJSON extracts the first valid JSON object from a string that contains actual data
// This handles cases where LLM adds extra text before or after the JSON
// For reasoning models, it skips template JSON (containing placeholder values like "状态标签")
func extractJSON(s string) string {
	// Find all potential JSON objects
	start := 0
	for {
		idx := strings.Index(s[start:], "{")
		if idx == -1 {
			break
		}
		start = start + idx

		// Find matching '}' by counting braces
		depth := 0
		end := -1
		for i := start; i < len(s); i++ {
			switch s[i] {
			case '{':
				depth++
			case '}':
				depth--
				if depth == 0 {
					end = i
					break
				}
			}
			if end != -1 {
				break
			}
		}

		if end == -1 {
			break
		}

		jsonStr := s[start : end+1]

		// Skip template JSON that contains placeholder values from prompt
		// These indicate the model is echoing the format description, not the actual answer
		if strings.Contains(jsonStr, `"状态标签"`) ||
			strings.Contains(jsonStr, `"简短描述"`) ||
			strings.Contains(jsonStr, `"tag":"状态标签"`) {
			start = end + 1
			continue
		}

		return jsonStr
	}

	// No matching brace found
	return ""
}

// DecideAction implements Provider.DecideAction
func (p *OpenAICompatProvider) DecideAction(ctx context.Context, req DecideActionRequest) (*DecideActionResponse, error) {
	startTime := time.Now()
	logger := GetRequestLogger()

	// Build prompt with deny keywords and goal
	prompt := DecideActionPromptTemplate
	prompt = strings.ReplaceAll(prompt, "{{deny_keywords}}", req.DenyKeywords)
	if req.Goal != "" {
		prompt = strings.ReplaceAll(prompt, "{{goal}}", req.Goal)
	} else {
		prompt = strings.ReplaceAll(prompt, "{{goal}}", "无特殊方向，按默认策略处理")
	}
	sessionGoalText := "未设置会话目标"
	if req.SessionGoal != "" {
		sessionGoalText = req.SessionGoal
	}
	prompt = strings.ReplaceAll(prompt, "{{session_goal}}", sessionGoalText)

	// Build request - start with extra params so they appear first in JSON
	reqMap := make(map[string]interface{})

	// Merge extra params first (e.g., thinking config)
	if p.config.ExtraParams != "" {
		var extra map[string]interface{}
		if err := json.Unmarshal([]byte(p.config.ExtraParams), &extra); err == nil {
			for k, v := range extra {
				reqMap[k] = v
			}
		}
	}

	// Then add standard params
	if _, exists := reqMap["model"]; !exists {
		reqMap["model"] = p.config.Model
	}
	reqMap["messages"] = []map[string]string{
		{"role": "system", "content": prompt},
		{"role": "user", "content": req.Context},
	}
	if _, exists := reqMap["temperature"]; !exists {
		reqMap["temperature"] = 0.2
	}
	if _, exists := reqMap["max_tokens"]; !exists {
		reqMap["max_tokens"] = 2000
	}
	reqMap["stream"] = false

	reqBody, err := json.Marshal(reqMap)
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
		if logger.IsEnabled() {
			logger.Log(AIRequestLog{
				Type:          "decide_action",
				Model:         p.config.Model,
				SessionID:     req.SessionID,
				SystemPrompt:  prompt,
				UserContent:   req.Context,
				RequestParams: string(reqBody),
				ExtraParams:   p.config.ExtraParams,
				Error:         err.Error(),
				DurationMs:    time.Since(startTime).Milliseconds(),
			})
		}
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
		if logger.IsEnabled() {
			logger.Log(AIRequestLog{
				Type:          "decide_action",
				Model:         p.config.Model,
				SessionID:     req.SessionID,
				SystemPrompt:  prompt,
				UserContent:   req.Context,
				RequestParams: string(reqBody),
				ExtraParams:   p.config.ExtraParams,
				RawResponse:   string(body),
				Error:         chatResp.Error.Message,
				DurationMs:    time.Since(startTime).Milliseconds(),
			})
		}
		return nil, fmt.Errorf("API error: %s", chatResp.Error.Message)
	}

	// Extract content
	if len(chatResp.Choices) == 0 {
		return nil, fmt.Errorf("no response from model")
	}

	// Handle both standard and reasoning model response formats
	// Reasoning models (like GLM-4.7) return content=null with reasoning_content
	var responseContent string
	if chatResp.Choices[0].Message.Content != nil {
		responseContent = strings.TrimSpace(*chatResp.Choices[0].Message.Content)
	} else if chatResp.Choices[0].Message.ReasoningContent != "" {
		responseContent = strings.TrimSpace(chatResp.Choices[0].Message.ReasoningContent)
	}

	if responseContent == "" {
		return nil, fmt.Errorf("empty response from model")
	}

	// Parse JSON response from LLM
	// Handle potential markdown code blocks
	cleanContent := responseContent
	cleanContent = strings.TrimPrefix(cleanContent, "```json")
	cleanContent = strings.TrimPrefix(cleanContent, "```")
	cleanContent = strings.TrimSuffix(cleanContent, "```")
	cleanContent = strings.TrimSpace(cleanContent)

	// Extract JSON object
	jsonContent := extractJSON(cleanContent)
	if jsonContent == "" {
		if logger.IsEnabled() {
			logger.Log(AIRequestLog{
				Type:          "decide_action",
				Model:         p.config.Model,
				SessionID:     req.SessionID,
				SystemPrompt:  prompt,
				UserContent:   req.Context,
				RequestParams: string(reqBody),
				ExtraParams:   p.config.ExtraParams,
				RawResponse:   responseContent,
				Error:         "no JSON found in response",
				DurationMs:    time.Since(startTime).Milliseconds(),
			})
		}
		return &DecideActionResponse{
			Tag:         "错误",
			Description: "AI响应中未找到JSON",
			Actions:     []ActionStep{},
			Confidence:  0,
			Evidence:    []string{},
		}, nil
	}

	var decision DecideActionResponse
	if err := json.Unmarshal([]byte(jsonContent), &decision); err != nil {
		if logger.IsEnabled() {
			logger.Log(AIRequestLog{
				Type:          "decide_action",
				Model:         p.config.Model,
				SessionID:     req.SessionID,
				SystemPrompt:  prompt,
				UserContent:   req.Context,
				RequestParams: string(reqBody),
				ExtraParams:   p.config.ExtraParams,
				RawResponse:   responseContent,
				Error:         "JSON parse error: " + err.Error(),
				DurationMs:    time.Since(startTime).Milliseconds(),
			})
		}
		return &DecideActionResponse{
			Tag:         "错误",
			Description: "AI响应解析失败",
			Actions:     []ActionStep{},
			Confidence:  0,
			Evidence:    []string{},
		}, nil
	}

	// Ensure actions is never nil
	if decision.Actions == nil {
		decision.Actions = []ActionStep{}
	}
	if decision.Evidence == nil {
		decision.Evidence = []string{}
	}
	if decision.ActionKeywords == nil {
		decision.ActionKeywords = []string{}
	}

	// Log successful request
	if logger.IsEnabled() {
		logger.Log(AIRequestLog{
			Type:          "decide_action",
			Model:         p.config.Model,
			SessionID:     req.SessionID,
			SystemPrompt:  prompt,
			UserContent:   req.Context,
			RequestParams: string(reqBody),
			ExtraParams:   p.config.ExtraParams,
			RawResponse:   responseContent,
			ParsedJSON:    jsonContent,
			DurationMs:    time.Since(startTime).Milliseconds(),
		})
	}

	return &decision, nil
}
