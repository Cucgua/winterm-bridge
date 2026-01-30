export interface FontInfo {
  name: string;
  url: string;
}

export interface FontsResponse {
  fonts: FontInfo[];
}

export interface SessionInfo {
  id: string;
  state: 'active' | 'detached';
  created_at: string;
  last_active: string;
  title?: string;
  tmux_name?: string;
  tmux_cmd?: string;
  current_path?: string;
  is_persistent?: boolean;
  is_ghost?: boolean;
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
  ws_url: string; // WebSocket URL (relative path)
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

  /**
   * Mark a session as persistent (survives server restart)
   */
  async persistSession(sessionId: string): Promise<void> {
    const response = await fetch(`/api/sessions/${sessionId}/persist`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
    });
    await this.handleResponse<void>(response);
  }

  /**
   * Remove persistence marking from a session
   */
  async unpersistSession(sessionId: string): Promise<void> {
    const response = await fetch(`/api/sessions/${sessionId}/persist`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });
    await this.handleResponse<void>(response);
  }

  /**
   * Get available custom fonts
   */
  async listFonts(): Promise<FontsResponse> {
    try {
      const response = await fetch('/api/fonts', {
        method: 'GET',
      });
      return this.handleResponse<FontsResponse>(response);
    } catch {
      return { fonts: [] };
    }
  }
}

// Font loader utility
let fontsLoaded = false;
let cachedFontName: string | null = null;

export async function loadCustomFonts(): Promise<string | null> {
  // Return cached result if already loaded
  if (fontsLoaded) return cachedFontName;

  try {
    const { fonts } = await api.listFonts();
    if (fonts.length === 0) {
      fontsLoaded = true;
      return null;
    }

    // Load the first available font
    const font = fonts[0];
    const fontName = font.name.replace(/\.(ttf|otf|woff|woff2)$/i, '');

    // Create @font-face rule
    const fontFace = new FontFace(fontName, `url(${font.url})`);
    await fontFace.load();
    document.fonts.add(fontFace);

    fontsLoaded = true;
    cachedFontName = fontName;
    console.log(`[Font] Loaded custom font: ${fontName}`);
    return fontName;
  } catch (e) {
    console.warn('[Font] Failed to load custom fonts:', e);
    fontsLoaded = true;
    return null;
  }
}

// Get cached font name (synchronous, for use after loadCustomFonts resolves)
export function getCachedFontName(): string | null {
  return cachedFontName;
}

export const api = new ApiService();
