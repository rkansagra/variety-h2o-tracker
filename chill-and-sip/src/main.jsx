import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { ScreenOrientation } from '@capacitor/screen-orientation'
import './index.css'
import RewardsApp from './App.jsx'

async function enforcePortraitLock() {
  // Native runtime lock; web is governed by manifest/CSS support and can no-op.
  if (Capacitor.getPlatform() === 'web') {
    return
  }

  try {
    await ScreenOrientation.lock({ orientation: 'portrait' })
  } catch (err) {
    console.warn('Screen orientation lock failed:', err)
  }
}

let appStateChangeListener = null

async function setupLifecycleRelock() {
  if (Capacitor.getPlatform() === 'web') {
    return
  }

  try {
    appStateChangeListener = await CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        void enforcePortraitLock()
      }
    })
  } catch (err) {
    console.warn('App lifecycle listener setup failed:', err)
  }
}

void enforcePortraitLock()
void setupLifecycleRelock()

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (appStateChangeListener) {
      void appStateChangeListener.remove()
      appStateChangeListener = null
    }
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RewardsApp />
  </StrictMode>,
)
