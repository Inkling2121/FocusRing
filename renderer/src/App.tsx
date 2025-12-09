import React, { useEffect, useState } from 'react'
import RadialMenu from './components/RadialMenu'
import Notes from './tools/Notes'
import TimerTool from './tools/Timer'
import ReminderTool from './tools/Reminder'
import Settings from './tools/Settings'
import { invoke, onOverlayState, onOverlayTheme } from './ipc'

type ToolId = 'notes' | 'timer' | 'reminder' | 'settings'

type Theme = {
  accent: string
  accentInactive: string
}

type OverlayConfig = {
  autoTimeoutSec: number
  shortcut?: string
  theme?: Partial<Theme>
}

const defaultTheme: Theme = {
  accent: '#22c55e',
  accentInactive: '#16a34a'
}

const App: React.FC = () => {
  const params = new URLSearchParams(window.location.search)
  const initialTool = params.get('tool') as ToolId | null
  const isToolWindow = !!initialTool

  const [interactive, setInteractive] = useState(false)
  const [theme, setTheme] = useState<Theme>(defaultTheme)
  const [tool] = useState<ToolId>(() => initialTool || 'notes')

  // 🎨 Theme einmal holen + auf Live-Updates vom Main reagieren
  useEffect(() => {
    invoke<OverlayConfig>('overlay/getConfig')
      .then(cfg => {
        if (cfg?.theme) {
          setTheme(prev => ({ ...prev, ...cfg.theme! }))
        }
      })
      .catch(() => { })

    onOverlayTheme(t => {
      if (t) {
        setTheme(prev => ({ ...prev, ...t }))
      }
    })
  }, [])

  // 🟢 Nur im Overlay-Fenster den Interaktiv-Status syncen
  useEffect(() => {
    if (isToolWindow) return

    onOverlayState(s => {
      if (s && typeof s.interactive === 'boolean') {
        setInteractive(s.interactive)
      }
    })

    invoke<{ interactive: boolean }>('overlay/getState')
      .then(s => setInteractive(!!s.interactive))
      .catch(() => { })
  }, [isToolWindow])

  // TOOL-FENSTER (normale Fenster, kein Clickthrough)
  if (isToolWindow) {
    return (
      <div
        className="no-drag"
        style={{
          userSelect: 'text',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: 10,
          width: '100%',
          height: '100%',
          boxSizing: 'border-box',
          background: '#212121',      // dunkler Hintergrund
          color: '#ffffff',
          fontFamily:
            'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontSize: 14
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div style={{ fontWeight: 600 }}>
            {tool === 'notes' && 'Notizen'}
            {tool === 'timer' && 'Timer / Stoppuhr'}
            {tool === 'reminder' && 'Reminder'}
            {tool === 'settings' && 'Einstellungen'}
          </div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>FocusRing Tool</div>
        </div>

        <div
          className="card"
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            background: '#111111',        // dunkler Inhalt
            border: '1px solid #000000',  // HART schwarzer Rand
            borderRadius: 12,
            boxSizing: 'border-box'
          }}
        >
          {tool === 'notes' && <Notes />}
          {tool === 'timer' && <TimerTool />}
          {tool === 'reminder' && <ReminderTool />}
          {tool === 'settings' && <Settings />}
        </div>

      </div>
    )
  }

  // 🟢 OVERLAY-FENSTER (Halbkreis + Buttons + Clickthrough-Mode)
  const items = [
    { id: 'notes', label: 'Notes', onClick: () => invoke('tools/open', 'notes') },
    { id: 'timer', label: 'Timer', onClick: () => invoke('tools/open', 'timer') },
    { id: 'reminder', label: 'Reminder', onClick: () => invoke('tools/open', 'reminder') },
    { id: 'settings', label: 'Settings', onClick: () => invoke('tools/open', 'settings') }
  ]

  return (
    <div
      className="no-drag"
      onClick={() => {
        // User-Activity im Overlay -> Auto-Cooldown-Reset im Main
        invoke('overlay/userActivity').catch(() => { })
      }}
      style={{
        position: 'relative',
        userSelect: 'none',
        display: 'inline-block',
        paddingTop: 24,
        background: 'transparent'
      }}
    >
      {/* Drag-Bar nur oben und nur im interaktiven Modus */}
      <div
        className={interactive ? 'drag' : 'no-drag'}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: 18,
          cursor: interactive ? 'move' : 'default'
        }}
      />

      {/* Halbkreis + Buttons */}
      <div className="no-drag" style={{ marginTop: 4, marginLeft: 20, marginRight: 10 }}>
        <RadialMenu
          items={items}
          interactive={interactive}
          accentActive={theme.accent}
          accentInactive={theme.accentInactive || theme.accent}
        />
      </div>
    </div>
  )
}

export default App
