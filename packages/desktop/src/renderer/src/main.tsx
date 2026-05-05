import "@xterm/xterm/css/xterm.css"
import React from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App"
import { I18nProvider } from "./app/i18n/I18nProvider"
import "./styles/index.css"

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>,
)
