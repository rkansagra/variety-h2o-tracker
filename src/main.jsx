import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { ScreenOrientation } from '@capacitor/screen-orientation'
import './index.css'
import RewardsApp from './App.jsx'

// Phones stay portrait; tablets (shortest screen side >= 600dp, the same line as the app's tablet
// size class) rotate freely. The Android manifest no longer forces portrait, so this is the only
// lock. On the web it's a no-op -- the installed web app has no orientation lock either.
function isPhoneSizedScreen() {
  return Math.min(window.screen.width, window.screen.height) < 600
}

async function enforcePortraitLock() {
  if (Capacitor.getPlatform() === 'web') {
    return
  }

  try {
    if (isPhoneSizedScreen()) {
      await ScreenOrientation.lock({ orientation: 'portrait' })
    } else {
      await ScreenOrientation.unlock()
    }
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
