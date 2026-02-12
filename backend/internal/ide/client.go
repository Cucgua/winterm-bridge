package ide

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// Client is an HTTP client for the IDEA Context Server plugin
type Client struct {
	endpoint   string
	httpClient *http.Client
}

// NewClient creates a new IDE plugin client
func NewClient(endpoint string) *Client {
	return &Client{
		endpoint: endpoint,
		httpClient: &http.Client{
			Timeout: 2 * time.Second,
		},
	}
}

// SetEndpoint updates the endpoint URL
func (c *Client) SetEndpoint(endpoint string) {
	c.endpoint = endpoint
}

// FetchContext retrieves the current IDE context from the plugin
func (c *Client) FetchContext() (*ContextData, error) {
	resp, err := c.httpClient.Get(c.endpoint + "/api/context")
	if err != nil {
		return nil, fmt.Errorf("failed to connect to IDE plugin: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("IDE plugin returned status %d", resp.StatusCode)
	}

	var data ContextData
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, fmt.Errorf("failed to decode IDE context: %w", err)
	}

	return &data, nil
}

// CheckHealth checks if the IDE plugin is running and reachable
func (c *Client) CheckHealth() (*HealthResponse, error) {
	resp, err := c.httpClient.Get(c.endpoint + "/api/health")
	if err != nil {
		return nil, fmt.Errorf("failed to connect to IDE plugin: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("IDE plugin returned status %d", resp.StatusCode)
	}

	var health HealthResponse
	if err := json.NewDecoder(resp.Body).Decode(&health); err != nil {
		return nil, fmt.Errorf("failed to decode health response: %w", err)
	}

	return &health, nil
}
