export interface SessionInfo {
  id: string;
  state: 'active' | 'detached';
  created_at: string;
  last_active: string;
  title?: string;
  tmux_name?: string;
  tmux_cmd?: string;
}

export interface AuthResponse {
  token: string;
  expires_at: string;
}

export interface ValidateResponse {
  valid: boolean;
}

export interface SessionsResponse {
  sessions: SessionInfo[];
}

export interface CreateSessionResponse {
  session: SessionInfo;
}

export interface AttachResponse {
  attachment_token: string;
  expires_in: number;
  ttyd_url: string; // ttyd WebSocket URL (relative path)
}

export interface ApiError {
  error: string;
}

export interface CreateSessionOptions {
  title?: string;
  workingDirectory?: string;
}

class ApiService {
  private getAuthHeaders(includeContentType = false): HeadersInit {
    const token = localStorage.getItem('winterm_token');
    const headers: HeadersInit = {};

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (includeContentType) {
      headers['Content-Type'] = 'application/json';
    }

    return headers;
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP error ${response.status}`);
    }
    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T;
    }
    return response.json();
  }

  /**
   * Authenticate with PIN
   */
  async authenticate(pin: string): Promise<AuthResponse> {
    const response = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    return this.handleResponse<AuthResponse>(response);
  }

  /**
   * Validate current token
   */
  async validateToken(): Promise<ValidateResponse> {
    const token = localStorage.getItem('winterm_token');
    if (!token) {
      return { valid: false };
    }

    try {
      const response = await fetch('/api/auth/validate', {
        method: 'POST',
        headers: this.getAuthHeaders(),
      });
      return this.handleResponse<ValidateResponse>(response);
    } catch {
      return { valid: false };
    }
  }

  /**
   * Get session list
   */
  async listSessions(): Promise<SessionsResponse> {
    const response = await fetch('/api/sessions', {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse<SessionsResponse>(response);
  }

  /**
   * Create a new session
   */
  async createSession(options?: CreateSessionOptions): Promise<CreateSessionResponse> {
    const body: Record<string, string> = {};
    if (options?.title) {
      body.title = options.title;
    }
    if (options?.workingDirectory) {
      body.working_directory = options.workingDirectory;
    }

    const response = await fetch('/api/sessions', {
      method: 'POST',
      headers: this.getAuthHeaders(true),
      body: JSON.stringify(body),
    });
    return this.handleResponse<CreateSessionResponse>(response);
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<void> {
    const response = await fetch(`/api/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });
    await this.handleResponse<void>(response);
  }

  /**
   * Get attachment token for WebSocket connection
   */
  async attachSession(sessionId: string): Promise<AttachResponse> {
    const response = await fetch(`/api/sessions/${sessionId}/attach`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse<AttachResponse>(response);
  }
}

export const api = new ApiService();
