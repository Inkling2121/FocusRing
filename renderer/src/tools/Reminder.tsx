import React, { useEffect, useState } from 'react'
import { invoke, onReminder } from '../ipc'
import type { Reminder } from '../shared/types'

export default function ReminderTool() {
  const [message, setMessage] = useState('')
  const [minutes, setMinutes] = useState(5)
  const [list, setList] = useState<Reminder[]>([])

  const load = async () => {
    const res = await invoke<Reminder[]>('reminder/list')
    setList(res ?? [])
  }
  useEffect(() => { load(); onReminder(() => load()) }, [])

  const create = async () => {
    const fire_at = Date.now() + minutes*60*1000
    await invoke('reminder/create', { message, fire_at })
    setMessage('')
    load()
  }
  const cancel = async (id:number) => {
    await invoke('reminder/cancel', id)
    load()
  }

  return (
    <div style={{ padding: 10, width: 280 }}>
      <input placeholder="Text" value={message} onChange={e => setMessage(e.target.value)} />
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input type="number" value={minutes} onChange={e => setMinutes(Number(e.target.value))} />
        <button onClick={create}>Setzen</button>
      </div>
      <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
        {list.map(r => (
          <div key={r.id} style={{ border: '1px solid #ccc', padding: 6, background: 'rgba(255,255,255,0.9)' }}>
            <div>{r.message}</div>
            <div>{new Date(r.fire_at).toLocaleTimeString()} • {r.status}</div>
            {r.status === 'scheduled' && <button onClick={() => cancel(r.id!)}>Cancel</button>}
          </div>
        ))}
      </div>
    </div>
  )
}
