import React, { useEffect, useMemo, useState } from 'react'
import { invoke } from '../ipc'

type TimerStatus = 'running' | 'done' | 'cancelled'

type Timer = {
  id: number
  name: string
  totalSeconds: number
  targetAt: number
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

  useEffect(() => {
    const load = async () => {
      const data = await invoke<Timer[]>('timer/list')
      setTimers(data || [])
    }
    load()
  }, [])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
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

  const handleDelete = async (timer: Timer) => {
    if (timer.status === 'running') {
      const ok = window.confirm(
        `Der Timer "${timer.name || 'Ohne Namen'}" laeuft noch. Wirklich loeschen?`
      )
      if (!ok) return
    }
    await invoke('timer/delete', timer.id)
    setTimers(prev => prev.filter(t => t.id !== timer.id))
  }

  const formatRemaining = (timer: Timer): string => {
    if (timer.status === 'cancelled') return 'Abgebrochen'
    if (timer.status === 'done') return 'Fertig'
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
              textAlign: 'center'
            }}
          />
          <span>:</span>
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
              textAlign: 'center'
            }}
          />
          <span>:</span>
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
              textAlign: 'center'
            }}
          />
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
                t.status === 'running'
                  ? 'rgba(34,197,94,0.08)'
                  : 'rgba(15,15,15,0.7)',
              border:
                t.status === 'running'
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
            <button
              onClick={() => handleDelete(t)}
              style={{
                padding: '4px 10px',
                borderRadius: 999,
                border: 'none',
                background: '#ef4444',
                color: '#fff',
                cursor: 'pointer',
                fontSize: 12,
                flexShrink: 0
              }}
            >
              Loeschen
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default TimerTool
