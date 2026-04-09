import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './assets/globals.css'

const logRendererEvent = (message: string) => {
  const line = `[RENDERER][${new Date().toISOString()}] ${message}`
  console.log(line)
  void window.electronAPI.appLog(line)
}

const logRendererError = (message: string, error?: unknown) => {
  console.error(message, error)
  void window.electronAPI.appLog(error ? `${message} | ${String(error)}` : message)
}

logRendererEvent('main.tsx BOOTSTRAPPED')

window.addEventListener('beforeunload', () => {
  logRendererEvent('main.tsx BEFOREUNLOAD')
})

window.addEventListener('unhandledrejection', (event) => {
  logRendererError(`[UNHANDLED REJECTION][${new Date().toISOString()}]`, event.reason)
})

window.addEventListener('error', (event) => {
  logRendererError(
    `[UNCAUGHT ERROR][${new Date().toISOString()}] ${event.message} ${event.filename ?? ''} ${event.lineno ?? ''}`.trim()
  )
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
