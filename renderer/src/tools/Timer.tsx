import React, { useEffect, useRef, useState } from 'react'
import { invoke } from '../ipc'
import type { Timer } from '../shared/types'

export default function TimerTool() {
  const [t, setT] = useState<Timer>({ label: 'Timer', duration_ms: 25*60*1000, elapsed_ms: 0, state: 'idle' })
  const ref = useRef<number | null>(null)

  useEffect(() => () => { if (ref.current) clearInterval(ref.current) }, [])

  const tick = () => setT(s => ({ ...s, elapsed_ms: Math.min(s.duration_ms, s.elapsed_ms + 1000), state: s.elapsed_ms + 1000 >= s.duration_ms ? 'done' : s.state }))
  const start = () => {
    if (ref.current) return
    ref.current = setInterval(tick, 1000) as unknown as number
    setT(s => ({ ...s, state: 'running' }))
  }
  const pause = () => {
    if (ref.current) { clearInterval(ref.current); ref.current = null }
    setT(s => ({ ...s, state: 'paused' }))
  }
  const reset = () => {
    if (ref.current) { clearInterval(ref.current); ref.current = null }
    setT(s => ({ ...s, elapsed_ms: 0, state: 'idle' }))
  }

  useEffect(() => { invoke('timer/update', t) }, [t])

  const left = Math.max(0, t.duration_ms - t.elapsed_ms)
  const m = Math.floor(left/60000).toString().padStart(2,'0')
  const s = Math.floor((left%60000)/1000).toString().padStart(2,'0')

  return (
    <div style={{ padding: 10, width: 240 }}>
      <input value={t.label} onChange={e => setT({ ...t, label: e.target.value })} />
      <input type="number" value={Math.floor(t.duration_ms/60000)} onChange={e => setT({ ...t, duration_ms: Number(e.target.value)*60000 })} />
      <div style={{ fontSize: 32 }}>{m}:{s}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={start}>Start</button>
        <button onClick={pause}>Pause</button>
        <button onClick={reset}>Reset</button>
      </div>
    </div>
  )
}
