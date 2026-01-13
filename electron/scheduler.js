import { remindersRepo } from './db.js'

let tickHandle
const pending = new Map()

export const startScheduler = (onFire) => {
  if (tickHandle) return
  tickHandle = setInterval(() => {
    const now = Date.now()
    const list = remindersRepo.getAll().filter(r => r.status === 'scheduled' && r.fire_at <= now)
    for (const r of list) {
      remindersRepo.update(r.id, { ...r, status: 'fired' })
      onFire(r)
      clearPending(r.id)
    }
  }, 500)
}

const clearPending = (id) => {
  const t = pending.get(id)
  if (t) {
    clearTimeout(t)
    pending.delete(id)
  }
}

export const scheduleReminder = (r) => {
  clearPending(r.id)
  const delay = Math.max(0, r.fire_at - Date.now())
  const t = setTimeout(() => {
    remindersRepo.update(r.id, { ...r, status: 'fired' })
  }, delay)
  pending.set(r.id, t)
}

export const cancelReminder = (id) => {
  clearPending(id)
}

export const rescheduleAll = () => {
  // Clear all pending timers
  pending.forEach((t, id) => clearTimeout(t))
  pending.clear()

  // Reschedule all active reminders
  const list = remindersRepo.getAll().filter(r => r.status === 'scheduled')
  const now = Date.now()
  for (const r of list) {
    if (r.fire_at > now) {
      scheduleReminder(r)
    } else {
      // Already passed, mark as fired immediately
      remindersRepo.update(r.id, { ...r, status: 'fired' })
    }
  }
}
