export const translations = {
  en: {
    // Common
    app_name: 'WinTerm Bridge',
    loading: 'Loading...',
    connect: 'Connect',
    disconnect: 'Disconnect',
    reconnect: 'Reconnect',
    logout: 'Logout',
    cancel: 'Cancel',
    confirm: 'Confirm',
    delete: 'Delete',
    save: 'Save',
    settings: 'Settings',
    back: 'Back',

    // Auth
    auth_title: 'Enter PIN',
    auth_subtitle: 'Enter the PIN shown on the server',
    auth_placeholder: '000000',
    auth_error: 'Authentication failed',

    // Sessions
    sessions_title: 'Select Session',
    sessions_empty: 'No active sessions found',
    sessions_count: 'Sessions',
    session_name_placeholder: 'Session name (optional)',
    session_create: 'Create New Session',
    session_delete_confirm: 'Are you sure you want to delete this session?',
    session_current: 'Current',
    session_join: 'Join',
    session_revive: 'Revive',
    session_state_active: 'active',
    session_state_idle: 'idle',
    session_state_ghost: 'ghost',
    session_persist_add: 'Mark as persistent',
    session_persist_remove: 'Remove from persistent',
    session_copy_tmux: 'Copy tmux attach command',
    session_copied: 'Tmux command copied to clipboard!',
    session_copy_failed: 'Failed to copy',
    session_new: 'New Session',
    session_switching: 'Switching session...',
    session_connecting: 'Connecting to session...',
    session_disconnected: 'Disconnected',
    session_back: 'Back to Sessions',
    session_cannot_delete_current: 'Cannot delete current session',
    session_refresh: 'Refresh',

    // Desktop
    desktop_mode: 'Desktop',
    desktop_sidebar_expand: 'Expand sidebar',
    desktop_sidebar_collapse: 'Collapse sidebar',

    // Mobile
    mobile_mode: 'Mobile',

    // Status
    status_connected: 'Connected',
    status_connecting: 'Connecting',
    status_disconnected: 'Disconnected',

    // Time
    time_just_now: 'just now',
    time_minutes_ago: '{n}m ago',
    time_hours_ago: '{n}h ago',
    time_days_ago: '{n}d ago',

    // Language
    language: 'Language',
    language_en: 'English',
    language_zh: '中文',
  },
  zh: {
    // Common
    app_name: 'WinTerm Bridge',
    loading: '加载中...',
    connect: '连接',
    disconnect: '断开',
    reconnect: '重新连接',
    logout: '退出登录',
    cancel: '取消',
    confirm: '确认',
    delete: '删除',
    save: '保存',
    settings: '设置',
    back: '返回',

    // Auth
    auth_title: '输入 PIN 码',
    auth_subtitle: '请输入服务器显示的 PIN 码',
    auth_placeholder: '000000',
    auth_error: '认证失败',

    // Sessions
    sessions_title: '选择会话',
    sessions_empty: '暂无可用会话',
    sessions_count: '会话列表',
    session_name_placeholder: '会话名称（可选）',
    session_create: '创建新会话',
    session_delete_confirm: '确定要删除此会话吗？',
    session_current: '当前',
    session_join: '进入',
    session_revive: '恢复',
    session_state_active: '活跃',
    session_state_idle: '空闲',
    session_state_ghost: '幽灵',
    session_persist_add: '标记为持久',
    session_persist_remove: '取消持久标记',
    session_copy_tmux: '复制 tmux 连接命令',
    session_copied: 'Tmux 命令已复制到剪贴板！',
    session_copy_failed: '复制失败',
    session_new: '新建会话',
    session_switching: '切换会话中...',
    session_connecting: '正在连接会话...',
    session_disconnected: '已断开连接',
    session_back: '返回会话列表',
    session_cannot_delete_current: '无法删除当前会话',
    session_refresh: '刷新',

    // Desktop
    desktop_mode: '桌面端',
    desktop_sidebar_expand: '展开侧边栏',
    desktop_sidebar_collapse: '收起侧边栏',

    // Mobile
    mobile_mode: '移动端',

    // Status
    status_connected: '已连接',
    status_connecting: '连接中',
    status_disconnected: '已断开',

    // Time
    time_just_now: '刚刚',
    time_minutes_ago: '{n}分钟前',
    time_hours_ago: '{n}小时前',
    time_days_ago: '{n}天前',

    // Language
    language: '语言',
    language_en: 'English',
    language_zh: '中文',
  },
} as const;

export type Language = keyof typeof translations;
export type TranslationKey = keyof typeof translations.en;
