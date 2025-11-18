export type Note = { id?: number, title: string, content: string, pinned: boolean, pos_x: number, pos_y: number, width: number, height: number, updated_at?: string }
export type Timer = { id?: number, label: string, duration_ms: number, elapsed_ms: number, state: 'idle'|'running'|'paused'|'done', updated_at?: string }
export type Reminder = { id?: number, message: string, fire_at: number, status?: 'scheduled'|'fired'|'canceled', created_at?: string }
