import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
// CSS is loaded via <link> in index.html for WebKitGTK compatibility.
// Vite's JS-based style injection doesn't work reliably in Tauri's WebKitGTK WebView.

// One-time migration: earlier builds defaulted theme to 'system', which resolves
// to light under WSLg/WebKitGTK and renders the whole UI white. Force-dark any
// persisted 'system' value so users see the intended Termius-style dark UI.
try {
  const raw = localStorage.getItem('winterm-settings');
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed?.state?.theme === 'system') {
      parsed.state.theme = 'dark';
      localStorage.setItem('winterm-settings', JSON.stringify(parsed));
    }
  }
} catch { /* ignore parse errors */ }

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
