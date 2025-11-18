import path from 'path'
import { app } from 'electron'
import fs from 'fs'
import initSqlJs from 'sql.js'

let SQL
let db

const dbDir = () => path.join(app.getPath('userData'), 'db')
const dbFile = () => path.join(dbDir(), 'focusring.sqlite')

const persist = () => {
  const data = db.export()
  fs.mkdirSync(dbDir(), { recursive: true })
  fs.writeFileSync(dbFile(), Buffer.from(data))
}

export const ensureDb = async () => {
  SQL = await initSqlJs({ locateFile: f => path.join(process.cwd(), 'node_modules/sql.js/dist', f) })
  if (fs.existsSync(dbFile())) {
    const buf = fs.readFileSync(dbFile())
    db = new SQL.Database(new Uint8Array(buf))
  } else {
    db = new SQL.Database()
  }

  db.exec(`
    create table if not exists app_settings (key text primary key, value text);
    create table if not exists windows_state (id integer primary key, pos_x integer, pos_y integer, width integer, height integer, overlay_mode text);
    create table if not exists notes (id integer primary key, title text, content text, pinned integer, pos_x integer, pos_y integer, width integer, height integer, updated_at text);
    create table if not exists timers (id integer primary key, label text, duration_ms integer, elapsed_ms integer, state text, updated_at text);
    create table if not exists reminders (id integer primary key, message text, fire_at integer, status text, created_at text);
  `)

  persist()
  console.log('DB:', dbFile())
}

const one = (q, p=[]) => { const s=db.prepare(q); s.bind(p); const r=s.step()?s.getAsObject():null; s.free(); return r }
const all = (q, p=[]) => { const s=db.prepare(q); s.bind(p); const a=[]; while(s.step()) a.push(s.getAsObject()); s.free(); return a }
const run = (q, p=[]) => { const s=db.prepare(q); s.bind(p); s.step(); s.free(); persist() }
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
  create: (n) => { const now=new Date().toISOString(); run('insert into notes(title,content,pinned,pos_x,pos_y,width,height,updated_at) values(?,?,?,?,?,?,?,?)',[n.title||'',n.content||'',n.pinned?1:0,n.pos_x||50,n.pos_y||50,n.width||200,n.height||160,now]); return one('select * from notes where id=?',[lastId()]) },
  update: (n) => { const now=new Date().toISOString(); run('update notes set title=?,content=?,pinned=?,pos_x=?,pos_y=?,width=?,height=?,updated_at=? where id=?',[n.title||'',n.content||'',n.pinned?1:0,n.pos_x,n.pos_y,n.width,n.height,now,n.id]); return one('select * from notes where id=?',[n.id]) },
  remove: (id) => { run('delete from notes where id=?',[id]); return true }
}
export const timersRepo = {
  list: () => all('select * from timers order by updated_at desc'),
  create: (t) => { const now=new Date().toISOString(); run('insert into timers(label,duration_ms,elapsed_ms,state,updated_at) values(?,?,?,?,?)',[t.label||'',t.duration_ms||0,t.elapsed_ms||0,t.state||'idle',now]); return one('select * from timers where id=?',[lastId()]) },
  update: (t) => { const now=new Date().toISOString(); run('update timers set label=?,duration_ms=?,elapsed_ms=?,state=?,updated_at=? where id=?',[t.label||'',t.duration_ms||0,t.elapsed_ms||0,t.state||'idle',now,t.id]); return one('select * from timers where id=?',[t.id]) }
}
export const remindersRepo = {
  list: () => all('select * from reminders order by fire_at asc'),
  create: (r) => { const now=new Date().toISOString(); const ts=typeof r.fire_at==='number'?r.fire_at:new Date(r.fire_at).getTime(); run('insert into reminders(message,fire_at,status,created_at) values(?,?,?,?)',[r.message||'',ts,'scheduled',now]); return one('select * from reminders where id=?',[lastId()]) },
  cancel: (id) => { run('update reminders set status=? where id=?',['canceled',id]); return true },
  fired: (id) => { run('update reminders set status=? where id=?',['fired',id]) }
}
