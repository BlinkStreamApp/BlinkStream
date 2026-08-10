import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { trackWebVitals } from './utils/perf'
import { logEvent } from './utils/eventLog'

if (typeof performance !== 'undefined') {
  if (document.readyState === 'complete') {
    trackWebVitals()
  } else {
    window.addEventListener('load', () => trackWebVitals(), { once: true })
  }
}

logEvent('perf', 'app.boot', { ua: navigator.userAgent.split(' ').slice(-1)[0] })

window.addEventListener('error', (e) => {
  logEvent('error', 'window.error', { msg: e.message, src: e.filename, line: e.lineno })
})
window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason
  logEvent('error', 'unhandledrejection', {
    msg: reason?.message || String(reason),
  })
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
