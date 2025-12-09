import React, { useEffect, useMemo, useState } from 'react'
import { invoke, onTimerFired, onSystemResumed } from '../ipc'

type TimerStatus = 'running' | 'paused' | 'done' | 'cancelled'

type Timer = {
  id: number
  name: string
  totalSeconds: number
  remainingMs: number
  targetAt: number
  pausedAt?: number | null
  status: TimerStatus
}

const accent = '#22c55e'

const TimerTool: React.FC = () => {
  const [timers, setTimers] = useState<Timer[]>([])
  const [name, setName] = useState('')
  const [h, setH] = useState('0')
  const [m, setM] = useState('0')
  const [s, setS] = useState('0')
  const [now, setNow] = useState(Date.now())
  const [busy, setBusy] = useState(false)

  const loadTimers = async () => {
    const data = await invoke<Timer[]>('timer/list')
    setTimers(data || [])
  }

  useEffect(() => {
    loadTimers()
  }, [])

  useEffect(() => {
    onSystemResumed(() => {
      // Reload timers after system wake
      loadTimers()
    })
  }, [])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    onTimerFired((firedTimer: Timer) => {
      console.log('Timer fired event received:', firedTimer)
      setTimers(prev => {
        const updated = prev.map(t =>
          t.id === firedTimer.id
            ? { ...t, status: 'done' as TimerStatus }
            : t
        )
        console.log('Updated timers:', updated)
        return updated
      })
    })
  }, [])

  const parseIntSafe = (value: string, max: number) => {
    let n = parseInt(value || '0', 10)
    if (Number.isNaN(n) || n < 0) n = 0
    if (n > max) n = max
    return n
  }

  const handleStart = async () => {
    const hh = parseIntSafe(h, 99)
    const mm = parseIntSafe(m, 59)
    const ss = parseIntSafe(s, 59)
    const totalSeconds = hh * 3600 + mm * 60 + ss
    if (totalSeconds <= 0) return
    setBusy(true)
    try {
      const created = await invoke<Timer>('timer/create', {
        name,
        totalSeconds
      })
      setTimers(prev => [created, ...prev])
      setName('')
      setH('0')
      setM('0')
      setS('0')
    } finally {
      setBusy(false)
    }
  }

  const handlePreset = (minutes: number, presetName: string) => {
    setH('0')
    setM(String(minutes))
    setS('0')
    if (!name.trim()) {
      setName(presetName)
    }
  }

  const handlePause = async (timer: Timer) => {
    const updated = await invoke<Timer>('timer/pause', timer.id)
    if (updated) {
      setTimers(prev => prev.map(t => t.id === timer.id ? updated : t))
    }
  }

  const handleResume = async (timer: Timer) => {
    const updated = await invoke<Timer>('timer/resume', timer.id)
    if (updated) {
      setTimers(prev => prev.map(t => t.id === timer.id ? updated : t))
    }
  }

  const handleDelete = async (timer: Timer) => {
    if (timer.status === 'running' || timer.status === 'paused') {
      const ok = window.confirm(
        `Der Timer "${timer.name || 'Ohne Namen'}" ${timer.status === 'running' ? 'läuft noch' : 'ist pausiert'}. Wirklich löschen?`
      )
      if (!ok) return
    }
    await invoke('timer/delete', timer.id)
    setTimers(prev => prev.filter(t => t.id !== timer.id))
  }

  const formatRemaining = (timer: Timer): string => {
    if (timer.status === 'cancelled') return 'Abgebrochen'
    if (timer.status === 'done') return 'Fertig'
    if (timer.status === 'paused') {
      // Show remaining time when paused
      const total = Math.floor((timer.remainingMs || 0) / 1000)
      const hh = Math.floor(total / 3600)
      const mm = Math.floor((total % 3600) / 60)
      const ss = total % 60
      const pad = (n: number, len: number = 2) => String(n).padStart(len, '0')
      return `⏸ ${pad(hh, 2)}:${pad(mm, 2)}:${pad(ss, 2)}`
    }
    const diffMs = timer.targetAt - now
    if (diffMs <= 0) return 'Fertig'
    const total = Math.floor(diffMs / 1000)
    const hh = Math.floor(total / 3600)
    const mm = Math.floor((total % 3600) / 60)
    const ss = total % 60
    const pad = (n: number, len: number = 2) => String(n).padStart(len, '0')
    return `${pad(hh, 2)}:${pad(mm, 2)}:${pad(ss, 2)}`
  }

  const sortedTimers = useMemo(
    () =>
      timers
        .slice()
        .sort((a, b) => {
          // Running first, then paused, then others
          const aActive = a.status === 'running' || a.status === 'paused'
          const bActive = b.status === 'running' || b.status === 'paused'
          if (aActive && !bActive) return -1
          if (bActive && !aActive) return 1
          if (a.status === 'running' && b.status !== 'running') return -1
          if (b.status === 'running' && a.status !== 'running') return 1
          return (b.id || 0) - (a.id || 0)
        }),
    [timers]
  )

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        height: '100%',
        boxSizing: 'border-box'
      }}
    >
      {/* Quick Presets */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          alignItems: 'center',
          flexWrap: 'wrap'
        }}
      >
        <span style={{ fontSize: 12, opacity: 0.7, marginRight: 4 }}>Schnellauswahl:</span>
        <button
          onClick={() => handlePreset(5, 'Kurze Pause')}
          style={{
            padding: '4px 10px',
            borderRadius: 999,
            border: `1px solid ${accent}`,
            background: 'rgba(34,197,94,0.1)',
            color: accent,
            cursor: 'pointer',
            fontSize: 11
          }}
        >
          5 Min
        </button>
        <button
          onClick={() => handlePreset(15, 'Fokus-Session')}
          style={{
            padding: '4px 10px',
            borderRadius: 999,
            border: `1px solid ${accent}`,
            background: 'rgba(34,197,94,0.1)',
            color: accent,
            cursor: 'pointer',
            fontSize: 11
          }}
        >
          15 Min
        </button>
        <button
          onClick={() => handlePreset(30, 'Arbeits-Block')}
          style={{
            padding: '4px 10px',
            borderRadius: 999,
            border: `1px solid ${accent}`,
            background: 'rgba(34,197,94,0.1)',
            color: accent,
            cursor: 'pointer',
            fontSize: 11
          }}
        >
          30 Min
        </button>
        <button
          onClick={() => handlePreset(60, 'Volle Stunde')}
          style={{
            padding: '4px 10px',
            borderRadius: 999,
            border: `1px solid ${accent}`,
            background: 'rgba(34,197,94,0.1)',
            color: accent,
            cursor: 'pointer',
            fontSize: 11
          }}
        >
          1 Std
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'center'
        }}
      >
        <input
          type="text"
          placeholder="Name des Timers"
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={100}
          style={{
            flex: 1,
            padding: '6px 8px',
            borderRadius: 8,
            border: '1px solid #444',
            background: 'rgba(20,20,20,0.9)',
            color: '#f9fafb',
            fontSize: 13
          }}
        />
        <div
          style={{
            display: 'flex',
            gap: 4,
            alignItems: 'center',
            fontSize: 13,
            color: '#e5e7eb'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <button
              onClick={() => setH(String(Math.min(99, parseIntSafe(h, 99) + 1)))}
              style={{
                padding: '2px 8px',
                fontSize: 10,
                borderRadius: 4,
                border: 'none',
                background: 'rgba(34,197,94,0.15)',
                color: '#22c55e',
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(34,197,94,0.25)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(34,197,94,0.15)'}
            >
              ▲
            </button>
            <input
              type="number"
              value={h}
              onChange={e => setH(e.target.value)}
              min={0}
              max={99}
              style={{
                width: 42,
                padding: '4px 6px',
                borderRadius: 6,
                border: '1px solid #444',
                background: 'rgba(20,20,20,0.9)',
                color: '#f9fafb',
                textAlign: 'center',
                fontSize: 13
              }}
            />
            <button
              onClick={() => setH(String(Math.max(0, parseIntSafe(h, 99) - 1)))}
              style={{
                padding: '2px 8px',
                fontSize: 10,
                borderRadius: 4,
                border: 'none',
                background: 'rgba(34,197,94,0.15)',
                color: '#22c55e',
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(34,197,94,0.25)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(34,197,94,0.15)'}
            >
              ▼
            </button>
          </div>
          <span>:</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <button
              onClick={() => setM(String(Math.min(59, parseIntSafe(m, 59) + 1)))}
              style={{
                padding: '2px 8px',
                fontSize: 10,
                borderRadius: 4,
                border: 'none',
                background: 'rgba(34,197,94,0.15)',
                color: '#22c55e',
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(34,197,94,0.25)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(34,197,94,0.15)'}
            >
              ▲
            </button>
            <input
              type="number"
              value={m}
              onChange={e => setM(e.target.value)}
              min={0}
              max={59}
              style={{
                width: 42,
                padding: '4px 6px',
                borderRadius: 6,
                border: '1px solid #444',
                background: 'rgba(20,20,20,0.9)',
                color: '#f9fafb',
                textAlign: 'center',
                fontSize: 13
              }}
            />
            <button
              onClick={() => setM(String(Math.max(0, parseIntSafe(m, 59) - 1)))}
              style={{
                padding: '2px 8px',
                fontSize: 10,
                borderRadius: 4,
                border: 'none',
                background: 'rgba(34,197,94,0.15)',
                color: '#22c55e',
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(34,197,94,0.25)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(34,197,94,0.15)'}
            >
              ▼
            </button>
          </div>
          <span>:</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <button
              onClick={() => setS(String(Math.min(59, parseIntSafe(s, 59) + 1)))}
              style={{
                padding: '2px 8px',
                fontSize: 10,
                borderRadius: 4,
                border: 'none',
                background: 'rgba(34,197,94,0.15)',
                color: '#22c55e',
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(34,197,94,0.25)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(34,197,94,0.15)'}
            >
              ▲
            </button>
            <input
              type="number"
              value={s}
              onChange={e => setS(e.target.value)}
              min={0}
              max={59}
              style={{
                width: 42,
                padding: '4px 6px',
                borderRadius: 6,
                border: '1px solid #444',
                background: 'rgba(20,20,20,0.9)',
                color: '#f9fafb',
                textAlign: 'center',
                fontSize: 13
              }}
            />
            <button
              onClick={() => setS(String(Math.max(0, parseIntSafe(s, 59) - 1)))}
              style={{
                padding: '2px 8px',
                fontSize: 10,
                borderRadius: 4,
                border: 'none',
                background: 'rgba(34,197,94,0.15)',
                color: '#22c55e',
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(34,197,94,0.25)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(34,197,94,0.15)'}
            >
              ▼
            </button>
          </div>
        </div>
        <button
          onClick={handleStart}
          disabled={busy}
          style={{
            padding: '6px 12px',
            borderRadius: 999,
            border: 'none',
            background: accent,
            color: '#0b1120',
            cursor: busy ? 'default' : 'pointer',
            fontSize: 13
          }}
        >
          Start
        </button>
      </div>

      <div
        style={{
          flex: 1,
          borderRadius: 10,
          border: '1px solid #2f3135',
          background: 'rgba(15,15,15,0.9)',
          padding: 6,
          overflow: 'auto'
        }}
      >
        {sortedTimers.length === 0 && (
          <div style={{ fontSize: 13, opacity: 0.7, padding: 4 }}>
            Noch keine Timer angelegt.
          </div>
        )}
        {sortedTimers.map(t => (
          <div
            key={t.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              padding: '6px 8px',
              borderRadius: 8,
              marginBottom: 4,
              background:
                t.status === 'running' || t.status === 'paused'
                  ? 'rgba(34,197,94,0.08)'
                  : 'rgba(15,15,15,0.7)',
              border:
                t.status === 'running' || t.status === 'paused'
                  ? `1px solid ${accent}`
                  : '1px solid #2f3135'
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                overflow: 'hidden'
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#e5e7eb',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                  overflow: 'hidden'
                }}
              >
                {t.name || 'Ohne Namen'}
              </span>
              <span
                style={{
                  fontSize: 12,
                  opacity: 0.7,
                  color: '#cbd5f5'
                }}
              >
                {formatRemaining(t)}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              {t.status === 'running' && (
                <button
                  onClick={() => handlePause(t)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 999,
                    border: `1px solid ${accent}`,
                    background: 'transparent',
                    color: accent,
                    cursor: 'pointer',
                    fontSize: 12
                  }}
                >
                  Pause
                </button>
              )}
              {t.status === 'paused' && (
                <button
                  onClick={() => handleResume(t)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 999,
                    border: 'none',
                    background: accent,
                    color: '#0b1120',
                    cursor: 'pointer',
                    fontSize: 12
                  }}
                >
                  Resume
                </button>
              )}
              <button
                onClick={() => handleDelete(t)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 999,
                  border: 'none',
                  background: '#ef4444',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: 12
                }}
              >
                Löschen
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default TimerTool
