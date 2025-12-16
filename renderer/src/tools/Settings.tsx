import React, { useEffect, useState } from 'react'
import { invoke } from '../ipc'

type Theme = {
  accent: string
  accentInactive: string
}

type OverlayConfig = {
  autoTimeoutSec: number
  shortcut?: string
  theme?: Partial<Theme>
}

const Settings: React.FC = () => {
  const [sec, setSec] = useState<number>(8)
  const [shortcut, setShortcut] = useState('Control+Alt+Space')
  const [theme, setTheme] = useState<Theme>({
    accent: '#00ab3fff',
    accentInactive: '#006625ff'
  })
  const [saving, setSaving] = useState(false)
  const [recording, setRecording] = useState(false)

  useEffect(() => {
    invoke<OverlayConfig>('overlay/getConfig')
      .then(cfg => {
        if (cfg) {
          if (typeof cfg.autoTimeoutSec === 'number') setSec(cfg.autoTimeoutSec)
          if (cfg.shortcut) setShortcut(cfg.shortcut)
          if (cfg.theme) setTheme(prev => ({ ...prev, ...cfg.theme! }))
        }
      })
      .catch(() => { })
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await invoke('overlay/setAutoTimeout', sec)
      await invoke('overlay/setShortcut', shortcut)
      await invoke('overlay/setTheme', theme)
    } finally {
      setSaving(false)
    }
  }

  const handleShortcutKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!recording) return

    e.preventDefault()
    e.stopPropagation()

    // Ignore single modifier keys
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
      return
    }

    // Build shortcut string
    const parts: string[] = []
    if (e.ctrlKey) parts.push('Control')
    if (e.altKey) parts.push('Alt')
    if (e.shiftKey) parts.push('Shift')
    if (e.metaKey) parts.push('Command')

    // Map key to proper format
    let key = e.key
    if (key === ' ') key = 'Space'
    else if (key.length === 1) key = key.toUpperCase()

    parts.push(key)
    setShortcut(parts.join('+'))
    setRecording(false)
  }

  const handleShortcutFocus = () => {
    setRecording(true)
  }

  const handleShortcutBlur = () => {
    setRecording(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 260, height: '100%', boxSizing: 'border-box' }}>
      <h2 style={{ margin: 0, fontSize: 16 }}>Einstellungen</h2>

      {/* Cooldown */}
      <label style={{ fontSize: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
        Automatisches Zurückschalten (Sekunden)
        <input
          type="number"
          min={1}
          value={sec}
          onChange={e => setSec(parseInt(e.target.value, 10) || 1)}
          style={{
            padding: 4,
            borderRadius: 6,
            border: '1px solid #444',
            background: 'rgba(20,20,20,0.9)',
            color: '#fff'
          }}
        />
      </label>

      {/* Shortcut */}
      <label style={{ fontSize: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
        Shortcut (zum Umschalten)
        <input
          type="text"
          value={recording ? 'Drücke Tastenkombination...' : shortcut}
          readOnly
          onFocus={handleShortcutFocus}
          onBlur={handleShortcutBlur}
          onKeyDown={handleShortcutKeyDown}
          style={{
            padding: 4,
            borderRadius: 6,
            border: recording ? `1px solid ${theme.accent}` : '1px solid #444',
            background: 'rgba(20,20,20,0.9)',
            color: recording ? theme.accent : '#fff',
            cursor: 'pointer'
          }}
          placeholder="Klicke und drücke eine Tastenkombination"
        />
      </label>

      {/* Farben */}
      <label style={{ fontSize: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
        Akzentfarbe (Aktiv)
        <input
          type="color"
          value={theme.accent}
          onChange={e => setTheme(t => ({ ...t, accent: e.target.value }))}
          style={{ width: 40, height: 24, border: 'none', background: 'transparent', cursor: 'pointer' }}
        />
      </label>

      <label style={{ fontSize: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
        Akzentfarbe (Clickthrough)
        <input
          type="color"
          value={theme.accentInactive}
          onChange={e => setTheme(t => ({ ...t, accentInactive: e.target.value }))}
          style={{ width: 40, height: 24, border: 'none', background: 'transparent', cursor: 'pointer' }}
        />
      </label>

      <button
        onClick={save}
        disabled={saving}
        style={{
          alignSelf: 'flex-start',
          padding: '6px 14px',
          borderRadius: 999,
          border: 'none',
          background: '#22c55e',
          color: '#000000ff',
          cursor: 'pointer',
          opacity: saving ? 0.7 : 1,
          marginTop: 8
        }}
      >
        {saving ? 'Speichere…' : 'Speichern'}
      </button>
    </div>
  )
}

export default Settings
