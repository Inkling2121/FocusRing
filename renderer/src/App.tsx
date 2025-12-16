import React, { useEffect, useState } from 'react'
import RadialMenu from './components/RadialMenu'
import Notes from './tools/Notes'
import TimerTool from './tools/Timer'
import ReminderTool from './tools/Reminder'
import Settings from './tools/Settings'
import { invoke, onOverlayState, onOverlayTheme, onFirstLaunch } from './ipc'

type ToolId = 'notes' | 'timer' | 'reminder' | 'settings'

type Theme = {
  accent: string
  accentInactive: string
  textColor?: string
}

type OverlayConfig = {
  autoTimeoutSec: number
  shortcut?: string
  theme?: Partial<Theme>
}

const defaultTheme: Theme = {
  accent: '#22c55e',
  accentInactive: '#16a34a',
  textColor: '#ffffff'
}

const App: React.FC = () => {
  const params = new URLSearchParams(window.location.search)
  const initialTool = params.get('tool') as ToolId | null
  const isToolWindow = !!initialTool

  const [interactive, setInteractive] = useState(false)
  const [theme, setTheme] = useState<Theme>(defaultTheme)
  const [tool] = useState<ToolId>(() => initialTool || 'notes')
  const [showWelcome, setShowWelcome] = useState(false)
  const [welcomeShortcut, setWelcomeShortcut] = useState('Control+Alt+Space')

  // Set overlay-mode class on root element if not a tool window
  useEffect(() => {
    const root = document.getElementById('root')
    if (root && !isToolWindow) {
      root.classList.add('overlay-mode')
    }
  }, [isToolWindow])

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

    // Listen for first launch event
    onFirstLaunch(data => {
      if (data?.shortcut) {
        setWelcomeShortcut(data.shortcut)
      }
      setShowWelcome(true)
    })
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

  const handleDismissWelcome = async () => {
    await invoke('overlay/dismissWelcome')
    setShowWelcome(false)
  }

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
      {/* Welcome Message */}
      {showWelcome && (
        <div
          className="no-drag"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 8
          }}
        >
          <div
            style={{
              background: '#212121',
              border: `2px solid ${theme.accent}`,
              borderRadius: 12,
              padding: '12px 16px',
              textAlign: 'center',
              boxShadow: `0 0 20px ${theme.accent}40`,
              maxWidth: '220px'
            }}
          >
            <div style={{ margin: '0 0 8px 0', color: theme.accent, fontSize: 15, fontWeight: 600 }}>
              Willkommen!
            </div>
            <div style={{ margin: '0 0 10px 0', fontSize: 12, lineHeight: 1.4, color: '#ddd' }}>
              Drücke <strong style={{ color: theme.accent }}>{welcomeShortcut}</strong> zum Umschalten
            </div>
            <button
              onClick={handleDismissWelcome}
              style={{
                background: theme.accent,
                color: '#000',
                border: 'none',
                borderRadius: 6,
                padding: '6px 16px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'opacity 0.2s'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              OK
            </button>
          </div>
        </div>
      )}

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
          textColor={theme.textColor || '#ffffff'}
        />
      </div>
    </div>
  )
}

export default App
