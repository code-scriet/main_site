import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Stale-chunk recovery: after a redeploy, Vite's content-hashed lazy chunks are
// replaced, so an already-open tab navigating to a not-yet-loaded route asks for
// a filename that no longer exists. Reloading picks up the new index.html + chunk
// map.
//
// The guard stores the last reload INSTANT rather than a boolean: a boolean
// cleared on boot would re-arm every reload (so a genuinely missing asset —
// bad deploy, offline, CDN failure — loops forever), while a never-cleared
// boolean would block recovery from a later deploy. With a timestamp, a repeat
// failure inside the cooldown surfaces in the error boundary instead of
// reloading, and a deploy hours later still recovers automatically.
const RELOAD_GUARD_KEY = 'chunk-reload-at'
const RELOAD_COOLDOWN_MS = 30_000

window.addEventListener('vite:preloadError', (event) => {
  const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0)
  if (Date.now() - last < RELOAD_COOLDOWN_MS) return // just tried — let the error surface
  event.preventDefault()
  sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()))
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
