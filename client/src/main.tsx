import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
// CSS is loaded via <link> in index.html for WebKitGTK compatibility.
// Vite's JS-based style injection doesn't work reliably in Tauri's WebKitGTK WebView.

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
