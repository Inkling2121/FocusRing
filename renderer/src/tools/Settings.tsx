import React, { useEffect, useState } from 'react'
import { invoke } from '../ipc'

type Theme = {
  accent: string
  accentInactive: string
  textColor?: string
  semicircleColor?: string
  buttonColor?: string
  iconColor?: string
}

type OverlayConfig = {
  autoTimeoutSec: number
  shortcut?: string
  theme?: Partial<Theme>
  autoRevertEnabled?: boolean
}

const Settings: React.FC = () => {
  const [sec, setSec] = useState<number>(8)
  const [shortcut, setShortcut] = useState('Control+Alt+Space')
  const [autoRevertEnabled, setAutoRevertEnabled] = useState(false)
  const [theme, setTheme] = useState<Theme>({
    accent: '#00ab3fff',
    accentInactive: '#006625ff',
    textColor: '#ffffff',
    semicircleColor: '#22c55e',
    buttonColor: '#22c55e',
    iconColor: '#ffffff'
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordedKeys, setRecordedKeys] = useState<string[]>([])

  useEffect(() => {
    invoke<OverlayConfig>('overlay/getConfig')
      .then(cfg => {
        if (cfg) {
          if (typeof cfg.autoTimeoutSec === 'number') setSec(cfg.autoTimeoutSec)
          if (cfg.shortcut) setShortcut(cfg.shortcut)
          if (cfg.theme) setTheme(prev => ({ ...prev, ...cfg.theme! }))
          if (typeof cfg.autoRevertEnabled === 'boolean') setAutoRevertEnabled(cfg.autoRevertEnabled)
        }
      })
      .catch(() => { })
  }, [])

  // Global keyboard listener for recording
  useEffect(() => {
    if (!recording) return

    const handleKeyDown = (e: KeyboardEvent) => {
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
      const newShortcut = parts.join('+')

      // Replace the recorded keys (only keep the latest combo)
      setRecordedKeys([newShortcut])
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [recording])

  const save = async () => {
    // Stop recording if still active and get the final shortcut
    let finalShortcut = shortcut
    if (recording) {
      setRecording(false)
      // Use the last recorded key as the shortcut
      if (recordedKeys.length > 0) {
        finalShortcut = recordedKeys[recordedKeys.length - 1]
        setShortcut(finalShortcut)
      }
    }

    setSaving(true)
    setSaved(false)
    try {
      await invoke('overlay/setAutoRevert', autoRevertEnabled)
      await invoke('overlay/setAutoTimeout', sec)
      await invoke('overlay/setShortcut', finalShortcut)
      await invoke('overlay/setTheme', theme)
      setSaved(true)
      // Feedback nach 2 Sekunden ausblenden
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const startRecording = () => {
    setRecordedKeys([])
    setRecording(true)
  }

  const stopRecording = () => {
    setRecording(false)
    // Use the last recorded key as the shortcut
    if (recordedKeys.length > 0) {
      setShortcut(recordedKeys[recordedKeys.length - 1])
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 260, height: '100%', boxSizing: 'border-box' }}>
      <h2 style={{ margin: 0, fontSize: 16 }}>Einstellungen</h2>

      {/* Auto-Revert Toggle */}
      <label style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={autoRevertEnabled}
          onChange={e => setAutoRevertEnabled(e.target.checked)}
          style={{ cursor: 'pointer' }}
        />
        Automatisches Zurückschalten aktivieren
      </label>

      {/* Cooldown - nur sichtbar wenn auto-revert aktiviert */}
      {autoRevertEnabled && (
        <label style={{ fontSize: 14, display: 'flex', flexDirection: 'column', gap: 4, marginLeft: 24 }}>
          Timeout (Sekunden)
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
              color: '#fff',
              width: 80
            }}
          />
        </label>
      )}

      {/* Shortcut */}
      <div style={{ fontSize: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Shortcut (zum Umschalten)</span>
          <span style={{ fontSize: 11, color: '#888' }}>Standart immer verfügbar: Control+Alt+Space</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            value={recording ? (recordedKeys.length > 0 ? recordedKeys[recordedKeys.length - 1] : 'Warte auf Tasteneingabe...') : shortcut}
            readOnly
            style={{
              flex: 1,
              padding: 4,
              borderRadius: 6,
              border: recording ? `1px solid ${theme.accent}` : '1px solid #444',
              background: 'rgba(20,20,20,0.9)',
              color: recording ? theme.accent : '#fff',
              cursor: 'default'
            }}
            placeholder="Kein Shortcut aufgezeichnet"
          />
          <button
            onClick={recording ? stopRecording : startRecording}
            style={{
              padding: '4px 12px',
              borderRadius: 6,
              border: 'none',
              background: recording ? '#ef4444' : '#22c55e',
              color: '#000000',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              whiteSpace: 'nowrap'
            }}
          >
            {recording ? 'Stop' : 'Aufnehmen'}
          </button>
        </div>
      </div>

      {/* Farben */}
      <div style={{ fontSize: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
        Halbkreis-Farbe
        <input
          type="color"
          value={theme.semicircleColor || '#22c55e'}
          onChange={e => setTheme(t => ({ ...t, semicircleColor: e.target.value }))}
          style={{ width: 40, height: 24, border: 'none', background: 'transparent', cursor: 'pointer' }}
        />
      </div>

      <div style={{ fontSize: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
        Button-Farbe
        <input
          type="color"
          value={theme.buttonColor || '#22c55e'}
          onChange={e => setTheme(t => ({ ...t, buttonColor: e.target.value }))}
          style={{ width: 40, height: 24, border: 'none', background: 'transparent', cursor: 'pointer' }}
        />
      </div>

      <div style={{ fontSize: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
        Icon-Farbe
        <input
          type="color"
          value={theme.iconColor || '#ffffff'}
          onChange={e => setTheme(t => ({ ...t, iconColor: e.target.value }))}
          style={{ width: 40, height: 24, border: 'none', background: 'transparent', cursor: 'pointer' }}
        />
      </div>

      <div style={{ position: 'relative', alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={save}
          disabled={saving}
          style={{
            padding: '6px 14px',
            borderRadius: 999,
            border: 'none',
            background: '#22c55e',
            color: '#000000ff',
            cursor: 'pointer',
            opacity: saving ? 0.7 : 1
          }}
        >
          {saving ? 'Speichere…' : 'Speichern'}
        </button>

        {/* Save Feedback */}
        {saved && (
          <div
            style={{
              background: '#22c55e',
              color: '#000',
              padding: '6px 12px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              animation: 'slideIn 0.2s ease-out',
              whiteSpace: 'nowrap'
            }}
          >
            ✓ Gespeichert!
          </div>
        )}
      </div>
    </div>
  )
}

export default Settings
