import React, { useEffect, useMemo, useState } from 'react'
import { invoke, onReminder, onSystemResumed } from '../ipc'

type ReminderStatus = 'scheduled' | 'canceled' | 'fired'

type Reminder = {
  id: number
  message: string
  fire_at: number
  status: ReminderStatus
  created_at?: string
}

const accent = '#22c55e'

const Reminders: React.FC = () => {
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [message, setMessage] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [now, setNow] = useState(Date.now())
  const [busy, setBusy] = useState(false)
  const timeInputRef = React.useRef<HTMLInputElement>(null)
  const dateInputRef = React.useRef<HTMLInputElement>(null)

  const loadReminders = async () => {
    const data = await invoke<Reminder[]>('reminder/list')
    const mapped =
      (data || []).map(r => ({
        ...r,
        fire_at:
          typeof r.fire_at === 'string'
            ? Number(r.fire_at)
            : Number(r.fire_at)
      })) || []
    setReminders(mapped)
  }

  useEffect(() => {
    loadReminders()
  }, [])

  useEffect(() => {
    onSystemResumed(() => {
      // Reload reminders after system wake
      loadReminders()
    })
  }, [])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    onReminder(rem => {
      setReminders(prev =>
        prev.map(r =>
          r.id === rem.id
            ? {
                ...r,
                status: 'fired',
                fire_at:
                  typeof rem.fire_at === 'number'
                    ? rem.fire_at
                    : rem.fire_at
                    ? Number(rem.fire_at)
                    : r.fire_at
              }
            : r
        )
      )
    })
  }, [])

  // Verlangsame Scroll-Verhalten in time/date inputs
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' &&
          (target.getAttribute('type') === 'time' || target.getAttribute('type') === 'date')) {
        e.preventDefault()

        // Verlangsame das Scrollen durch throttling
        const input = target as HTMLInputElement
        const currentValue = input.value

        if (!currentValue) return

        if (target.getAttribute('type') === 'time') {
          const [hours, minutes] = currentValue.split(':').map(Number)
          const totalMinutes = hours * 60 + minutes
          const delta = e.deltaY > 0 ? -1 : 1 // Invertiert für natürlichere Richtung
          const newTotalMinutes = Math.max(0, Math.min(1439, totalMinutes + delta))
          const newHours = Math.floor(newTotalMinutes / 60)
          const newMinutes = newTotalMinutes % 60
          input.value = `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`
          setTime(input.value)
        } else if (target.getAttribute('type') === 'date') {
          const currentDate = new Date(currentValue)
          const delta = e.deltaY > 0 ? -1 : 1
          currentDate.setDate(currentDate.getDate() + delta)
          const newValue = currentDate.toISOString().slice(0, 10)
          input.value = newValue
          setDate(newValue)
        }
      }
    }

    const timeInput = timeInputRef.current
    const dateInput = dateInputRef.current

    if (timeInput) {
      timeInput.addEventListener('wheel', handleWheel, { passive: false })
    }
    if (dateInput) {
      dateInput.addEventListener('wheel', handleWheel, { passive: false })
    }

    return () => {
      if (timeInput) {
        timeInput.removeEventListener('wheel', handleWheel)
      }
      if (dateInput) {
        dateInput.removeEventListener('wheel', handleWheel)
      }
    }
  }, [timeInputRef, dateInputRef])

  const buildFireTimestamp = () => {
    const today = new Date()
    const d = date || today.toISOString().slice(0, 10)
    let t = time
    if (!t) {
      const plus5 = new Date(today.getTime() + 5 * 60 * 1000)
      const hh = String(plus5.getHours()).padStart(2, '0')
      const mm = String(plus5.getMinutes()).padStart(2, '0')
      t = `${hh}:${mm}`
    }
    const iso = `${d}T${t}:00`
    const ts = new Date(iso).getTime()
    if (!Number.isFinite(ts)) return null
    if (ts <= Date.now()) return null
    return ts
  }

  const handleCreate = async () => {
    const trimmed = message.trim()
    if (!trimmed) return
    const ts = buildFireTimestamp()
    if (!ts) return
    setBusy(true)
    try {
      const created = await invoke<Reminder>('reminder/create', {
        message: trimmed,
        fire_at: ts
      })
      const mapped = {
        ...created,
        fire_at:
          typeof created.fire_at === 'string'
            ? Number(created.fire_at)
            : Number(created.fire_at)
      }
      // direkt im Log sichtbar
      setReminders(prev => [mapped, ...prev])
      setMessage('')
    } finally {
      setBusy(false)
    }
  }

  // gemeinsame Logik fuer Abbrechen / OK:
  // - scheduled -> Abbrechen: cancel und aus DB löschen
  // - fired / canceled -> OK: aus DB löschen
  const handleAction = async (r: Reminder) => {
    try {
      await invoke('reminder/delete', r.id)
      setReminders(prev => prev.filter(x => x.id !== r.id))
    } catch {
      // ignore
    }
  }

  const formatTime = (ts: number) => {
    if (!ts) return '-'
    const d = new Date(ts)
    const dd = d.toLocaleDateString(undefined, {
      year: '2-digit',
      month: '2-digit',
      day: '2-digit'
    })
    const tt = d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit'
    })
    return `${dd} ${tt}`
  }

  const formatRemaining = (r: Reminder) => {
    if (r.status === 'canceled') return 'Abgebrochen'
    if (r.status === 'fired') return 'Fertig'
    const diff = r.fire_at - now
    if (diff <= 0) return 'Fertig'
    const total = Math.floor(diff / 1000)
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    const pad = (n: number) => String(n).padStart(2, '0')
    if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`
    return `${pad(m)}:${pad(s)}`
  }

  const sortedReminders = useMemo(
    () =>
      reminders
        .slice()
        .sort((a, b) => {
          if (a.status === 'scheduled' && b.status !== 'scheduled') return -1
          if (b.status === 'scheduled' && a.status !== 'scheduled') return 1
          return (a.fire_at || 0) - (b.fire_at || 0)
        }),
    [reminders]
  )

  const createDisabled = busy || !message.trim()

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
          flexDirection: 'column',
          gap: 6
        }}
      >
        <textarea
          placeholder="Erinnerungstext..."
          value={message}
          onChange={e => setMessage(e.target.value)}
          rows={2}
          maxLength={500}
          style={{
            resize: 'none',
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
            gap: 8,
            alignItems: 'center'
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: 4,
              alignItems: 'center',
              fontSize: 12,
              color: '#e5e7eb'
            }}
          >
            <span>Datum</span>
            <input
              ref={dateInputRef}
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              style={{
                padding: '4px 6px',
                borderRadius: 6,
                border: '1px solid #444',
                background: 'rgba(20,20,20,0.9)',
                color: '#f9fafb',
                fontSize: 12
              }}
            />
          </div>
          <div
            style={{
              display: 'flex',
              gap: 4,
              alignItems: 'center',
              fontSize: 12,
              color: '#e5e7eb'
            }}
          >
            <span>Uhrzeit</span>
            <input
              ref={timeInputRef}
              type="time"
              value={time}
              onChange={e => setTime(e.target.value)}
              style={{
                padding: '4px 6px',
                borderRadius: 6,
                border: '1px solid #444',
                background: 'rgba(20,20,20,0.9)',
                color: '#f9fafb',
                fontSize: 12
              }}
            />
          </div>
          <div style={{ flex: 1 }} />
          <button
            onClick={handleCreate}
            disabled={createDisabled}
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              border: 'none',
              background: createDisabled ? 'rgba(34,197,94,0.4)' : accent,
              color: '#0b1120',
              cursor: createDisabled ? 'default' : 'pointer',
              fontSize: 13
            }}
          >
            Reminder anlegen
          </button>
        </div>
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
        {sortedReminders.length === 0 && (
          <div style={{ fontSize: 13, opacity: 0.7, padding: 4 }}>
            Noch keine Reminder angelegt.
          </div>
        )}
        {sortedReminders.map(r => (
          <div
            key={r.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              padding: '6px 8px',
              borderRadius: 8,
              marginBottom: 4,
              background:
                r.status === 'scheduled'
                  ? 'rgba(34,197,94,0.08)'
                  : 'rgba(15,15,15,0.7)',
              border:
                r.status === 'scheduled'
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
                  color: '#e5e7eb',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                  overflow: 'hidden'
                }}
              >
                {r.message || 'Ohne Text'}
              </span>
              <span
                style={{
                  fontSize: 11,
                  opacity: 0.7,
                  color: '#cbd5f5'
                }}
              >
                {formatTime(r.fire_at)} • {formatRemaining(r)}
              </span>
            </div>
            <button
              onClick={() => handleAction(r)}
              style={{
                padding: '4px 10px',
                borderRadius: 999,
                border: 'none',
                background:
                  r.status === 'scheduled'
                    ? '#ef4444'
                    : 'rgba(75,85,99,0.8)',
                color: '#fff',
                cursor: 'pointer',
                fontSize: 12,
                flexShrink: 0
              }}
            >
              {r.status === 'scheduled' ? 'Abbrechen' : 'OK'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Reminders
