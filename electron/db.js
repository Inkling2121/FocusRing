import path from 'path'
import { app } from 'electron'
import fs from 'fs'
import { fileURLToPath } from 'url'
import Database from 'better-sqlite3'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let db

const dbDir = () => path.join(app.getPath('userData'), 'db')
const dbFile = () => path.join(dbDir(), 'focusring.sqlite')

export const ensureDb = async () => {
  // If already initialized, return immediately
  if (db) {
    console.log('DB: Already initialized, returning cached instance')
    return
  }

  console.log('DB: Initializing better-sqlite3...')

  // Create directory if it doesn't exist
  fs.mkdirSync(dbDir(), { recursive: true })

  const dbPath = dbFile()
  console.log('DB:', dbPath)

  // Open database
  db = new Database(dbPath)

  // Create tables
  db.exec(`
    create table if not exists app_settings (key text primary key, value text);
    create table if not exists windows_state (id integer primary key, pos_x integer, pos_y integer, width integer, height integer, overlay_mode text);
    create table if not exists tool_windows (tool_id text primary key, pos_x integer, pos_y integer, width integer, height integer);
    create table if not exists notes (id integer primary key, title text, content text, pinned integer, pos_x integer, pos_y integer, width integer, height integer, updated_at text);
    create table if not exists timers (id integer primary key, label text, duration_ms integer, remaining_ms integer, state text, paused_at integer, updated_at text);
    create table if not exists reminders (id integer primary key, message text, fire_at integer, status text, created_at text);
  `)

  // Migration: Add remaining_ms and paused_at columns if they don't exist
  try {
    db.exec(`alter table timers add column remaining_ms integer`)
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    db.exec(`alter table timers add column paused_at integer`)
  } catch (e) {
    // Column already exists, ignore
  }

  // Migrate old timers: set remaining_ms = duration_ms for existing running timers
  db.exec(`update timers set remaining_ms = duration_ms where remaining_ms is null and state = 'running'`)
  db.exec(`update timers set remaining_ms = 0 where remaining_ms is null`)

  console.log('DB: Initialized successfully')
}

const one = (q, p=[]) => db.prepare(q).get(...p)
const all = (q, p=[]) => db.prepare(q).all(...p)
const run = (q, p=[]) => db.prepare(q).run(...p)

const runAndGetId = (q, p=[]) => {
  const result = db.prepare(q).run(...p)
  return result.lastInsertRowid
}

const lastId = () => {
  const result = one('select last_insert_rowid() as id')
  return result?.id
}

// Settings Repository
export const settingsRepo = {
  get: (key) => {
    const r = one('select value from app_settings where key = ?', [key])
    return r?.value ?? null
  },
  set: (key, value) => {
    run('insert or replace into app_settings (key, value) values (?, ?)', [key, value])
  },
  delete: (key) => {
    run('delete from app_settings where key = ?', [key])
  }
}

// Window Repository
export const windowRepo = {
  get: () => one('select * from windows_state where id = 1'),
  save: (state) => {
    run(`insert or replace into windows_state (id, pos_x, pos_y, width, height, overlay_mode)
         values (1, ?, ?, ?, ?, ?)`,
      [state.pos_x, state.pos_y, state.width, state.height, state.overlay_mode])
  }
}

// Tool Window Repository
export const toolWindowRepo = {
  get: (toolId) => one('select * from tool_windows where tool_id = ?', [toolId]),
  save: (toolId, state) => {
    run(`insert or replace into tool_windows (tool_id, pos_x, pos_y, width, height)
         values (?, ?, ?, ?, ?)`,
      [toolId, state.pos_x, state.pos_y, state.width, state.height])
  }
}

// Notes Repository
export const notesRepo = {
  getAll: () => all('select * from notes order by pinned desc, updated_at desc'),
  getById: (id) => one('select * from notes where id = ?', [id]),
  create: (note) => {
    const id = runAndGetId(
      `insert into notes (title, content, pinned, pos_x, pos_y, width, height, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?)`,
      [note.title, note.content, note.pinned ? 1 : 0, note.pos_x, note.pos_y, note.width, note.height, new Date().toISOString()]
    )
    return id
  },
  update: (id, note) => {
    run(`update notes set title = ?, content = ?, pinned = ?, pos_x = ?, pos_y = ?, width = ?, height = ?, updated_at = ?
         where id = ?`,
      [note.title, note.content, note.pinned ? 1 : 0, note.pos_x, note.pos_y, note.width, note.height, new Date().toISOString(), id])
  },
  remove: (id) => {
    run('delete from notes where id = ?', [id])
  }
}

// Timers Repository
export const timersRepo = {
  getAll: () => all('select * from timers order by updated_at desc'),
  getById: (id) => one('select * from timers where id = ?', [id]),
  create: (timer) => {
    const id = runAndGetId(
      `insert into timers (label, duration_ms, remaining_ms, state, paused_at, updated_at)
       values (?, ?, ?, ?, ?, ?)`,
      [timer.label, timer.duration_ms, timer.remaining_ms, timer.state, timer.paused_at, new Date().toISOString()]
    )
    return id
  },
  update: (id, timer) => {
    run(`update timers set label = ?, duration_ms = ?, remaining_ms = ?, state = ?, paused_at = ?, updated_at = ?
         where id = ?`,
      [timer.label, timer.duration_ms, timer.remaining_ms, timer.state, timer.paused_at, new Date().toISOString(), id])
  },
  remove: (id) => {
    run('delete from timers where id = ?', [id])
  }
}

// Reminders Repository
export const remindersRepo = {
  getAll: () => all('select * from reminders order by fire_at asc'),
  getById: (id) => one('select * from reminders where id = ?', [id]),
  getPending: () => all('select * from reminders where status = ? order by fire_at asc', ['pending']),
  create: (reminder) => {
    const id = runAndGetId(
      `insert into reminders (message, fire_at, status, created_at)
       values (?, ?, ?, ?)`,
      [reminder.message, reminder.fire_at, reminder.status, new Date().toISOString()]
    )
    return id
  },
  update: (id, reminder) => {
    run(`update reminders set message = ?, fire_at = ?, status = ?
         where id = ?`,
      [reminder.message, reminder.fire_at, reminder.status, id])
  },
  remove: (id) => {
    run('delete from reminders where id = ?', [id])
  }
}
