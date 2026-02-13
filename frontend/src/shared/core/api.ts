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
  is_archived?: boolean;
}

export interface AuthResponse {
  token: string;
  expires_at: string;
  role: 'admin' | 'guest';
  allowed_session_ids?: string[];
}

export interface ValidateResponse {
  valid: boolean;
  role?: 'admin' | 'guest';
  allowed_session_ids?: string[];
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

export interface GuestPinGrant {
  id: string;
  pin?: string;
  masked_pin?: string;
  session_ids: string[];
  created_at: string;
  revoked_at?: string;
  active: boolean;
}

export interface GuestPinListResponse {
  grants: GuestPinGrant[];
}

export interface CreateGuestPinRequest {
  session_ids: string[];
}

export interface CreateGuestPinResponse {
  grant: GuestPinGrant;
}

export interface UpdateGuestPinRequest {
  session_ids: string[];
}

export interface UpdateGuestPinResponse {
  grant: GuestPinGrant;
}

export interface CreateSessionOptions {
  title?: string;
  workingDirectory?: string;
}

// AI Monitor types
export interface AIConfig {
  enabled: boolean;
  endpoint: string;
  api_key: string;
  model: string;
  lines: number;
  interval: number;
  extra_params?: string; // JSON string for custom API parameters
  running?: boolean;
}

export interface AIConfigResponse extends AIConfig {
  running: boolean;
}

export interface AITestRequest {
  endpoint: string;
  api_key: string;
  model: string;
}

export interface AITestResponse {
  ok: boolean;
  error?: string;
}

export interface AISummaryItem {
  tag: string;
  description: string;
  timestamp: number;
}

export interface AISummariesResponse {
  summaries: Record<string, AISummaryItem>;
}

// Email notification types
export interface EmailConfig {
  enabled: boolean;
  smtp_host: string;
  smtp_port: number;
  username: string;
  password: string;
  from_address: string;
  to_address: string;
  notify_delay: number;
  notify_tags?: string[];
}

export interface SessionSettings {
  notify_enabled: boolean;
  auto_enabled: boolean;
  is_persistent: boolean;
  session_goal: string;
}

// Auto-reply types
export interface AutoConfig {
  model: string;
  context_lines: number;
  confidence_min: number;
  cooldown_ms: number;
  goal: string;
  allow_tags: string[];
  deny_keywords: string[];
  extra_params?: string; // JSON string for custom API parameters (independent from AI Monitor)
}

// Tmux configuration types
export interface TmuxConfig {
  // Common settings
  mouse: boolean;
  set_clipboard: boolean;
  set_titles: boolean;
  set_titles_string: string;
  status: boolean;
  right_click_menu: boolean;
  // Advanced settings
  history_limit: number;
  escape_time: number;
  scroll_speed: number;
  aggressive_resize: boolean;
  focus_events: boolean;
  base_index: number;
  pane_base_index: number;
  renumber_windows: boolean;
  visual_activity: boolean;
  visual_bell: boolean;
  monitor_activity: boolean;
}

export interface TmuxConfigResponse extends TmuxConfig {
  ok: boolean;
  applied: boolean;
  warnings?: string[];
}

// IDE integration types
export interface IDEConfig {
  enabled: boolean;
  endpoint: string;
  poll_interval: number;
  show_fields: string[];
  copy_template: string;
}

export interface IDEProjectInfo {
  name: string;
  basePath: string;
}

export interface IDEFileInfo {
  name: string;
  path: string;
  isActive: boolean;
}

export interface IDEFunctionInfo {
  name: string;
  signature: string;
  className?: string;
  filePath: string;
  lineNumber: number;
  language: string;
}

export interface IDEProjectContext {
  project?: IDEProjectInfo;
  openFiles: IDEFileInfo[];
  currentFunction?: IDEFunctionInfo;
}

export interface IDEContextResponse {
  projects: IDEProjectContext[];
  matchedIndex: number;
  fallbackIndex: number;
}

export interface IDETestResponse {
  ok: boolean;
  error?: string;
  version?: string;
}

// Upload configuration types
export interface UploadConfig {
  enabled: boolean;
  dir: string;
  ttl_minutes: number;
  max_size_mb: number;
}

// AI Preset types
export interface AIPreset {
  name: string;
  ai_monitor?: AIConfig;
  ai_auto?: AutoConfig;
  created_at: number;
}

export interface AutoActionLog {
  id: string;
  session_id: string;
  session_name: string;
  tag: string;
  description: string;
  actions: { type: string; value: string }[];
  confidence: number;
  evidence: string[];
  reasoning?: string;
  action_keywords?: string[];
  context?: string;
  timestamp: number;
  success: boolean;
  error?: string;
}

export interface AIRequestLog {
  id: string;
  timestamp: string;
  type: string; // "summarize" or "decide_action"
  model: string;
  session_id?: string;
  system_prompt: string;
  user_content: string;
  raw_response?: string;
  parsed_json?: string;
  error?: string;
  duration_ms: number;
}

// Workflow event types
export type WorkflowEventType =
  | 'context_changed'   // 上下文变化
  | 'state_analyzed'    // 状态分析完成
  | 'analysis_failed'   // AI分析失败
  | 'action_queued'     // 动作入队
  | 'action_executed'   // 动作执行(入口)
  | 'action_start'      // 动作步骤开始
  | 'action_end'        // 动作步骤结束
  | 'action_success'    // 动作成功
  | 'action_failed'     // 动作失败
  | 'action_removed'    // 动作移除
  | 'action_skipped'    // AI决策后跳过
  | 'idle'              // 休眠中(轮询等待)
  | 'state_analysis_start'   // 状态分析开始
  | 'action_analysis_start'  // 动作分析开始
  | 'action_analysis_end';   // 动作分析结束

export interface WorkflowEvent {
  id: string;
  session_id: string;
  event_type: WorkflowEventType;
  timestamp_ms: number;
  seq: number;  // Sequence number for stable ordering
  duration_ms?: number;
  tag?: string;
  description?: string;
  action_sig?: string;
  action_kind?: string;  // auto_reply / notify
  success?: boolean;
  error?: string;
  reason?: string;  // skip reason: tag_not_allowed/validation_failed/no_actions/cooldown
  reasoning?: string;  // 操作总结(如"同意xx请求")
}

export interface WorkflowEventsResponse {
  events: WorkflowEvent[];
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
   * Create a guest PIN authorization bound to specific sessions (admin only)
   */
  async createGuestPin(request: CreateGuestPinRequest): Promise<CreateGuestPinResponse> {
    const response = await fetch('/api/auth/guest-pins', {
      method: 'POST',
      headers: this.getAuthHeaders(true),
      body: JSON.stringify(request),
    });
    return this.handleResponse<CreateGuestPinResponse>(response);
  }

  /**
   * List guest PIN authorizations (admin only)
   */
  async listGuestPins(): Promise<GuestPinListResponse> {
    const response = await fetch('/api/auth/guest-pins', {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse<GuestPinListResponse>(response);
  }

  /**
   * Revoke a guest PIN authorization (admin only)
   */
  async revokeGuestPin(grantId: string): Promise<void> {
    const response = await fetch(`/api/auth/guest-pins/${grantId}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });
    await this.handleResponse<void>(response);
  }

  /**
   * Update authorized sessions for a guest PIN authorization (admin only)
   */
  async updateGuestPin(grantId: string, request: UpdateGuestPinRequest): Promise<UpdateGuestPinResponse> {
    const response = await fetch(`/api/auth/guest-pins/${grantId}`, {
      method: 'PUT',
      headers: this.getAuthHeaders(true),
      body: JSON.stringify(request),
    });
    return this.handleResponse<UpdateGuestPinResponse>(response);
  }

  /**
   * Get session list
   */
  async listSessions(): Promise<SessionsResponse> {
    const response = await fetch('/api/sessions', {
      method: 'GET',
      headers: this.getAuthHeaders(),
      cache: 'no-store',
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
   * Archive a persistent session (hide from sidebar but keep in session picker)
   */
  async archiveSession(sessionId: string): Promise<void> {
    const response = await fetch(`/api/sessions/${sessionId}/archive`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
    });
    await this.handleResponse<void>(response);
  }

  /**
   * Unarchive a session (restore to sidebar)
   */
  async unarchiveSession(sessionId: string): Promise<void> {
    const response = await fetch(`/api/sessions/${sessionId}/archive`, {
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

  /**
   * Get AI monitor configuration
   */
  async getAIConfig(): Promise<AIConfigResponse> {
    const response = await fetch('/api/ai/config', {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse<AIConfigResponse>(response);
  }

  /**
   * Update AI monitor configuration
   */
  async setAIConfig(config: Partial<AIConfig>): Promise<{ ok: boolean; running: boolean }> {
    const response = await fetch('/api/ai/config', {
      method: 'POST',
      headers: this.getAuthHeaders(true),
      body: JSON.stringify(config),
    });
    return this.handleResponse<{ ok: boolean; running: boolean }>(response);
  }

  /**
   * Test AI API connection
   */
  async testAIConnection(req: AITestRequest): Promise<AITestResponse> {
    const response = await fetch('/api/ai/test', {
      method: 'POST',
      headers: this.getAuthHeaders(true),
      body: JSON.stringify(req),
    });
    return this.handleResponse<AITestResponse>(response);
  }

  /**
   * Get AI summaries for all sessions
   */
  async getAISummaries(): Promise<AISummariesResponse> {
    const response = await fetch('/api/ai/summaries', {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse<AISummariesResponse>(response);
  }

  /**
   * Get email notification configuration
   */
  async getEmailConfig(): Promise<EmailConfig> {
    const response = await fetch('/api/email/config', {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse<EmailConfig>(response);
  }

  /**
   * Update email notification configuration
   */
  async setEmailConfig(config: Partial<EmailConfig>): Promise<{ ok: boolean }> {
    const response = await fetch('/api/email/config', {
      method: 'POST',
      headers: this.getAuthHeaders(true),
      body: JSON.stringify(config),
    });
    return this.handleResponse<{ ok: boolean }>(response);
  }

  /**
   * Test email configuration
   */
  async testEmail(): Promise<{ ok: boolean; error?: string }> {
    const response = await fetch('/api/email/test', {
      method: 'POST',
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse<{ ok: boolean; error?: string }>(response);
  }

  /**
   * Get session settings (notify + persist)
   */
  async getSessionSettings(sessionId: string): Promise<SessionSettings> {
    const response = await fetch(`/api/sessions/${sessionId}/settings`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse<SessionSettings>(response);
  }

  /**
   * Enable notification for a session
   */
  async enableSessionNotify(sessionId: string): Promise<void> {
    const response = await fetch(`/api/sessions/${sessionId}/notify`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
    });
    await this.handleResponse<void>(response);
  }

  /**
   * Disable notification for a session
   */
  async disableSessionNotify(sessionId: string): Promise<void> {
    const response = await fetch(`/api/sessions/${sessionId}/notify`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });
    await this.handleResponse<void>(response);
  }

  /**
   * Enable auto-reply for a session
   */
  async enableSessionAuto(sessionId: string, goal?: string): Promise<void> {
    const response = await fetch(`/api/sessions/${sessionId}/auto`, {
      method: 'POST',
      headers: this.getAuthHeaders(true),
      body: JSON.stringify({ goal: goal || '' }),
    });
    await this.handleResponse<void>(response);
  }

  /**
   * Disable auto-reply for a session
   */
  async disableSessionAuto(sessionId: string): Promise<void> {
    const response = await fetch(`/api/sessions/${sessionId}/auto`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });
    await this.handleResponse<void>(response);
  }

  /**
   * Set session goal
   */
  async setSessionGoal(sessionId: string, goal: string): Promise<void> {
    const response = await fetch(`/api/sessions/${sessionId}/goal`, {
      method: 'PUT',
      headers: this.getAuthHeaders(true),
      body: JSON.stringify({ goal }),
    });
    await this.handleResponse<void>(response);
  }

  /**
   * Get auto-reply configuration
   */
  async getAutoConfig(): Promise<AutoConfig> {
    const response = await fetch('/api/auto/config', {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse<AutoConfig>(response);
  }

  /**
   * Update auto-reply configuration
   */
  async setAutoConfig(config: Partial<AutoConfig>): Promise<{ ok: boolean }> {
    const response = await fetch('/api/auto/config', {
      method: 'POST',
      headers: this.getAuthHeaders(true),
      body: JSON.stringify(config),
    });
    return this.handleResponse<{ ok: boolean }>(response);
  }

  /**
   * Emergency stop auto-reply
   */
  async stopAuto(): Promise<{ ok: boolean }> {
    const response = await fetch('/api/auto/stop', {
      method: 'POST',
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse<{ ok: boolean }>(response);
  }

  /**
   * Get auto-reply action logs
   */
  async getAutoLogs(sessionId?: string): Promise<{ logs: AutoActionLog[] }> {
    const url = sessionId ? `/api/auto/logs?session_id=${sessionId}` : '/api/auto/logs';
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse<{ logs: AutoActionLog[] }>(response);
  }

  /**
   * Clear auto-reply action logs
   */
  async clearAutoLogs(): Promise<{ ok: boolean }> {
    const response = await fetch('/api/auto/logs', {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse<{ ok: boolean }>(response);
  }

  /**
   * Get workflow events for a session
   */
  async getWorkflowEvents(sessionId: string, limit = 100): Promise<WorkflowEventsResponse> {
    const response = await fetch(`/api/workflow-events?session_id=${sessionId}&limit=${limit}`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse<WorkflowEventsResponse>(response);
  }

  /**
   * Get AI request log configuration
   */
  async getAILogConfig(): Promise<{ enabled: boolean; log_dir: string }> {
    const response = await fetch('/api/ai/log-config', {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse<{ enabled: boolean; log_dir: string }>(response);
  }

  /**
   * Set AI request log configuration
   */
  async setAILogConfig(enabled: boolean): Promise<{ ok: boolean }> {
    const response = await fetch('/api/ai/log-config', {
      method: 'POST',
      headers: this.getAuthHeaders(true),
      body: JSON.stringify({ enabled }),
    });
    return this.handleResponse<{ ok: boolean }>(response);
  }

  /**
   * Get AI request logs
   */
  async getAILogs(options?: { date?: string; limit?: number }): Promise<{ logs: AIRequestLog[] }> {
    const params = new URLSearchParams();
    if (options?.date) params.set('date', options.date);
    if (options?.limit) params.set('limit', String(options.limit));
    const url = `/api/ai/logs${params.toString() ? '?' + params.toString() : ''}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse<{ logs: AIRequestLog[] }>(response);
  }

  /**
   * Get available AI log dates
   */
  async getAILogDates(): Promise<{ dates: string[] }> {
    const response = await fetch('/api/ai/logs?dates=true', {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse<{ dates: string[] }>(response);
  }

  /**
   * Clear AI request logs
   */
  async clearAILogs(): Promise<{ ok: boolean }> {
    const response = await fetch('/api/ai/logs', {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse<{ ok: boolean }>(response);
  }

  /**
   * Get tmux configuration
   */
  async getTmuxConfig(): Promise<TmuxConfig> {
    const response = await fetch('/api/tmux/config', {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse<TmuxConfig>(response);
  }

  /**
   * Update tmux configuration
   */
  async setTmuxConfig(config: Partial<TmuxConfig>): Promise<TmuxConfigResponse> {
    const response = await fetch('/api/tmux/config', {
      method: 'POST',
      headers: this.getAuthHeaders(true),
      body: JSON.stringify(config),
    });
    return this.handleResponse<TmuxConfigResponse>(response);
  }

  /**
   * Upload a file (multipart/form-data)
   */
  async uploadFile(file: Blob): Promise<{ path: string }> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/upload', {
      method: 'POST',
      headers: this.getAuthHeaders(false),
      body: formData,
    });
    return this.handleResponse<{ path: string }>(response);
  }

  /**
   * Get upload configuration
   */
  async getUploadConfig(): Promise<UploadConfig> {
    const response = await fetch('/api/upload/config', {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse<UploadConfig>(response);
  }

  /**
   * Update upload configuration
   */
  async setUploadConfig(config: Partial<UploadConfig>): Promise<{ ok: boolean }> {
    const response = await fetch('/api/upload/config', {
      method: 'POST',
      headers: this.getAuthHeaders(true),
      body: JSON.stringify(config),
    });
    return this.handleResponse<{ ok: boolean }>(response);
  }

  /**
   * Clear all uploaded files
   */
  async clearUploadFiles(): Promise<{ ok: boolean; deleted: number }> {
    const response = await fetch('/api/upload/files', {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse<{ ok: boolean; deleted: number }>(response);
  }

  /**
   * Get IDE integration configuration
   */
  async getIDEConfig(): Promise<IDEConfig> {
    const response = await fetch('/api/ide/config', {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse<IDEConfig>(response);
  }

  /**
   * Update IDE integration configuration
   */
  async setIDEConfig(config: Partial<IDEConfig>): Promise<{ ok: boolean }> {
    const response = await fetch('/api/ide/config', {
      method: 'POST',
      headers: this.getAuthHeaders(true),
      body: JSON.stringify(config),
    });
    return this.handleResponse<{ ok: boolean }>(response);
  }

  /**
   * Get current IDE context (proxied through backend)
   */
  async getIDEContext(sessionPath?: string, sessionTitle?: string): Promise<IDEContextResponse> {
    const params = new URLSearchParams();
    if (sessionPath) params.set('session_path', sessionPath);
    if (sessionTitle) params.set('session_title', sessionTitle);
    const qs = params.toString();
    const url = `/api/ide/context${qs ? '?' + qs : ''}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse<IDEContextResponse>(response);
  }

  /**
   * Test IDE plugin connection
   */
  async testIDEConnection(endpoint?: string): Promise<IDETestResponse> {
    const response = await fetch('/api/ide/test', {
      method: 'POST',
      headers: this.getAuthHeaders(true),
      body: JSON.stringify({ endpoint: endpoint || '' }),
    });
    return this.handleResponse<IDETestResponse>(response);
  }

  /**
   * Get AI configuration presets
   */
  async getAIPresets(): Promise<{ presets: AIPreset[] }> {
    const response = await fetch('/api/ai/presets', {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse<{ presets: AIPreset[] }>(response);
  }

  /**
   * Create/update an AI preset from current active config
   */
  async createAIPreset(name: string): Promise<{ ok: boolean }> {
    const response = await fetch('/api/ai/presets', {
      method: 'POST',
      headers: this.getAuthHeaders(true),
      body: JSON.stringify({ name }),
    });
    return this.handleResponse<{ ok: boolean }>(response);
  }

  /**
   * Delete an AI preset
   */
  async deleteAIPreset(name: string): Promise<{ ok: boolean }> {
    const response = await fetch(`/api/ai/presets/${encodeURIComponent(name)}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse<{ ok: boolean }>(response);
  }

  /**
   * Apply an AI preset to active configuration
   */
  async applyAIPreset(name: string): Promise<{ ok: boolean }> {
    const response = await fetch(`/api/ai/presets/${encodeURIComponent(name)}/apply`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse<{ ok: boolean }>(response);
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
