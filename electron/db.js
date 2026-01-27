import path from 'path'
import { app } from 'electron'
import fs from 'fs'
import { fileURLToPath } from 'url'
import initSqlJs from 'sql.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let SQL
let db

const dbDir = () => path.join(app.getPath('userData'), 'db')
const dbFile = () => path.join(dbDir(), 'focusring.sqlite')

const persist = () => {
  const data = db.export()
  fs.mkdirSync(dbDir(), { recursive: true})
  fs.writeFileSync(dbFile(), Buffer.from(data))
}

export const ensureDb = async () => {
  // In production (asar), use path relative to the electron directory
  // In dev, use node_modules
  const wasmPath = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'sql.js', 'dist')
    : path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist')

  SQL = await initSqlJs({
    locateFile: f => path.join(wasmPath, f)
  })
  if (fs.existsSync(dbFile())) {
    const buf = fs.readFileSync(dbFile())
    db = new SQL.Database(new Uint8Array(buf))
  } else {
    db = new SQL.Database()
  }

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

  persist()
  console.log('DB:', dbFile())
}

const one = (q, p=[]) => { const s=db.prepare(q); s.bind(p); const r=s.step()?s.getAsObject():null; s.free(); return r }
const all = (q, p=[]) => { const s=db.prepare(q); s.bind(p); const a=[]; while(s.step()) a.push(s.getAsObject()); s.free(); return a }
const run = (q, p=[]) => { const s=db.prepare(q); s.bind(p); s.step(); s.free(); persist() }
const runAndGetId = (q, p=[]) => { const s=db.prepare(q); s.bind(p); s.step(); s.free(); const id = one('select last_insert_rowid() as id')?.id; persist(); return id }
const lastId = () => one('select last_insert_rowid() as id')?.id

export const settingsRepo = {
  get: (key) => one('select value from app_settings where key=?',[key])?.value ?? null,
  set: ({ key, value }) => { run('insert into app_settings(key,value) values(?,?) on conflict(key) do update set value=excluded.value',[key,value]); return true }
}
export const windowRepo = {
  get: () => one('select * from windows_state where id=1') || null,
  set: (s) => { run('insert into windows_state(id,pos_x,pos_y,width,height,overlay_mode) values(1,?,?,?,?,?) on conflict(id) do update set pos_x=excluded.pos_x,pos_y=excluded.pos_y,width=excluded.width,height=excluded.height,overlay_mode=excluded.overlay_mode',[s.pos_x,s.pos_y,s.width,s.height,s.overlay_mode]); return true }
}
export const notesRepo = {
  list: () => all('select * from notes order by updated_at desc'),
  getAll: () => all('select * from notes order by updated_at desc'),
  getById: (id) => one('select * from notes where id=?', [id]),
  create: (n) => { const now=new Date().toISOString(); const id=runAndGetId('insert into notes(title,content,pinned,pos_x,pos_y,width,height,updated_at) values(?,?,?,?,?,?,?,?)',[n.title||'',n.content||'',n.pinned?1:0,n.pos_x||50,n.pos_y||50,n.width||200,n.height||160,now]); return one('select * from notes where id=?',[id]) },
  update: (n) => { const now=new Date().toISOString(); run('update notes set title=?,content=?,pinned=?,pos_x=?,pos_y=?,width=?,height=?,updated_at=? where id=?',[n.title||'',n.content||'',n.pinned?1:0,n.pos_x,n.pos_y,n.width,n.height,now,n.id]); return one('select * from notes where id=?',[n.id]) },
  remove: (id) => { run('delete from notes where id=?',[id]); return true }
}

const mapTimerRow = (row) => {
  if (!row) return null
  const durMs = row.duration_ms || 0
  const remainingMs = row.remaining_ms !== null && row.remaining_ms !== undefined ? row.remaining_ms : durMs
  const totalSeconds = Math.floor(durMs / 1000)
  const baseTime = row.updated_at ? new Date(row.updated_at).getTime() : Date.now()
  const targetAt = baseTime + remainingMs
  const pausedAt = row.paused_at || null
  return {
    id: row.id,
    name: row.label || '',
    totalSeconds,
    remainingMs,
    targetAt,
    pausedAt,
    status: row.state || 'idle'
  }
}

export const timersRepo = {
  list: () => {
    const rows = all('select * from timers order by updated_at desc')
    return rows.map(mapTimerRow).filter(Boolean)
  },
  getAll: () => {
    const rows = all('select * from timers order by updated_at desc')
    return rows.map(mapTimerRow).filter(Boolean)
  },
  getById: (id) => {
    const row = one('select * from timers where id=?', [id])
    return mapTimerRow(row)
  },
  create: (t) => {
    const now = new Date().toISOString()
    const durMs = (t.totalSeconds || 0) * 1000
    const id = runAndGetId(
      'insert into timers(label,duration_ms,remaining_ms,state,paused_at,updated_at) values(?,?,?,?,?,?)',
      [t.name || '', durMs, durMs, t.status || 'running', null, now]
    )
    const row = one('select * from timers where id=?', [id])
    return mapTimerRow(row)
  },
  update: (idOrTimer, dataOrUndefined) => {
    // Support both (id, data) and (timer) signatures
    const t = dataOrUndefined ? { id: idOrTimer, ...dataOrUndefined } : idOrTimer
    const now = new Date().toISOString()
    const durMs = (t.totalSeconds || 0) * 1000
    const remainingMs = t.remainingMs !== undefined ? t.remainingMs : durMs
    const pausedAt = t.pausedAt !== undefined ? t.pausedAt : null
    run(
      'update timers set label=?,duration_ms=?,remaining_ms=?,state=?,paused_at=?,updated_at=? where id=?',
      [t.name || '', durMs, remainingMs, t.status || 'idle', pausedAt, now, t.id]
    )
    const row = one('select * from timers where id=?', [t.id])
    return mapTimerRow(row)
  },
  remove: (id) => {
    run('delete from timers where id=?', [id])
    return true
  }
}

export const remindersRepo = {
  list: () => all('select * from reminders order by fire_at asc'),
  getAll: () => all('select * from reminders order by fire_at asc'),
  getById: (id) => one('select * from reminders where id=?', [id]),
  create: (r) => { const now=new Date().toISOString(); const ts=typeof r.fire_at==='number'?r.fire_at:new Date(r.fire_at).getTime(); const id=runAndGetId('insert into reminders(message,fire_at,status,created_at) values(?,?,?,?)',[r.message||'',ts,r.status||'scheduled',now]); return one('select * from reminders where id=?',[id]) },
  update: (id, data) => { run('update reminders set message=?, fire_at=?, status=? where id=?', [data.message, data.fire_at, data.status, id]); return one('select * from reminders where id=?', [id]) },
  cancel: (id) => { run('update reminders set status=? where id=?',['canceled',id]); return true },
  fired: (id) => { run('update reminders set status=? where id=?',['fired',id]) },
  remove: (id) => { run('delete from reminders where id=?', [id]); return true }
}

export const toolWindowRepo = {
  get: (toolId) => one('select * from tool_windows where tool_id=?', [toolId]) || null,
  save: (toolId, bounds) => {
    run(
      'insert into tool_windows(tool_id,pos_x,pos_y,width,height) values(?,?,?,?,?) on conflict(tool_id) do update set pos_x=excluded.pos_x,pos_y=excluded.pos_y,width=excluded.width,height=excluded.height',
      [toolId, bounds.pos_x, bounds.pos_y, bounds.width, bounds.height]
    )
    return true
  }
}
