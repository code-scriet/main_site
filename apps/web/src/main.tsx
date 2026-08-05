import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installStaleChunkRecovery } from './lib/chunkReload.ts'

// Recover from a redeploy invalidating this tab's lazy-chunk filenames.
// Rate-limited + storage-safe — see lib/chunkReload.ts.
installStaleChunkRecovery()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
