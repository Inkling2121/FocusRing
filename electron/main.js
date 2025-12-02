import { app, BrowserWindow, globalShortcut, ipcMain, Notification } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { ensureDb, notesRepo, timersRepo, remindersRepo, settingsRepo, windowRepo } from './db.js'
import { startScheduler, scheduleReminder, cancelReminder } from './scheduler.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const activeTimers = new Map()

let overlayWin       // kleines Overlay mit RadialMenu
let toolWin          // eigenes Fenster fuer Tools (Notizen usw.)
let interactive = false          // default: clickthrough
let autoRevertTimer = null
let autoTimeoutSec = 8           // default, wird aus Settings geladen
let shortcut = 'Control+Alt+Space' // default shortcut, kann geaendert werden

let theme = {
  accent: '#22c55e',         // Haupt-Akzent (Buttons, Glow)
  accentInactive: '#16a34a', // Akzent im Clickthrough-Modus
}

const createOverlayWindow = async () => {
  await ensureDb()

    // auto-timeout aus settings laden
  const timeoutSetting = settingsRepo.get('overlay_auto_timeout_s')
  if (timeoutSetting) {
    const parsed = parseInt(timeoutSetting, 10)
    if (!Number.isNaN(parsed) && parsed > 0) {
      autoTimeoutSec = parsed
    }
  }

  // shortcut aus settings laden
  const shortcutSetting = settingsRepo.get('overlay_shortcut')
  if (shortcutSetting && typeof shortcutSetting === 'string' && shortcutSetting.trim().length > 0) {
    shortcut = shortcutSetting.trim()
  }

  // 🎨 Theme aus Settings laden
  const themeSetting = settingsRepo.get('overlay_theme')
  if (themeSetting && typeof themeSetting === 'string') {
    try {
      const parsed = JSON.parse(themeSetting)
      theme = { ...theme, ...parsed }
    } catch (e) {
      console.warn('invalid overlay_theme in settings', e)
    }
  }


  const state = windowRepo.get()

  overlayWin = new BrowserWindow({
    width: state?.width || 230,
    height: state?.height || 130,
    x: state?.pos_x,
    y: state?.pos_y,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: false
    }
  })

  if (process.env.VITE_DEV) {
    await overlayWin.loadURL('http://localhost:5173')
    overlayWin.webContents.openDevTools()
    overlayWin.webContents.on('console-message', (_event, level, message) => {
      if (typeof message === 'string' && (
        message.includes('Request Autofill.enable failed') ||
        message.includes("'Autofill.enable' wasn't found") ||
        message.includes('Request Autofill.setAddresses failed') ||
        message.includes("'Autofill.setAddresses' wasn't found")
      )) return
      const lvl = level === 2 ? 'error' : level === 1 ? 'warn' : 'log'
      console[lvl]?.(`renderer: ${message}`)
    })
  } else {
    await overlayWin.loadFile(path.join(__dirname, '../dist/renderer/index.html'))
  }

  // scheduler fuer reminder (Overlay ist unser "Main"-Fenster)
  startScheduler((rem) => {
    new Notification({ title: 'Reminder', body: rem.message }).show()
    if (overlayWin && !overlayWin.isDestroyed()) {
      overlayWin.webContents.send('scheduler/reminderFired', rem)
    }
  })

  overlayWin.on('move', () => saveBounds())
  overlayWin.on('resize', () => saveBounds())

  // initial: clickthrough
  applyInteractState()
}

const saveBounds = () => {
  if (!overlayWin) return
  const b = overlayWin.getBounds()
  windowRepo.set({
    id: 1,
    pos_x: b.x,
    pos_y: b.y,
    width: b.width,
    height: b.height,
    overlay_mode: interactive ? 'interactive' : 'clickthrough'
  })
}

const applyInteractState = () => {
  if (!overlayWin) return
  overlayWin.setIgnoreMouseEvents(!interactive, { forward: true })
  overlayWin.webContents.send('overlay/state', { interactive })
  saveBounds()
}

const scheduleAutoRevert = () => {
  if (autoRevertTimer) clearTimeout(autoRevertTimer)
  autoRevertTimer = setTimeout(() => {
    interactive = false
    applyInteractState()
  }, autoTimeoutSec * 1000)
}

const toggleInteract = () => {
  interactive = !interactive

  if (interactive) {
    scheduleAutoRevert()
  } else {
    if (autoRevertTimer) {
      clearTimeout(autoRevertTimer)
      autoRevertTimer = null
    }
  }

  applyInteractState()
}

const registerShortcut = () => {
  globalShortcut.unregisterAll()
  if (!shortcut) return
  const ok = globalShortcut.register(shortcut, () => toggleInteract())
  if (!ok) {
    console.warn('Konnte Shortcut nicht registrieren:', shortcut)
  }
}

const scheduleTimer = (timer) => {
  if (!timer || timer.status !== 'running' || !timer.id) return
  const now = Date.now()
  const delay = timer.targetAt - now
  if (delay <= 0) {
    const finished = { ...timer, status: 'done' }
    timersRepo.update(finished)
    activeTimers.delete(timer.id)
    const title = timer.name ? `Timer: ${timer.name}` : 'Timer abgelaufen'
    const body = timer.name ? `Dein Timer "${timer.name}" ist abgelaufen.` : 'Dein Timer ist fertig.'
    new Notification({ title, body }).show()
    if (overlayWin && !overlayWin.isDestroyed()) {
      overlayWin.webContents.send('timer/fired', finished)
    }
    if (toolWin && !toolWin.isDestroyed()) {
      toolWin.webContents.send('timer/fired', finished)
    }
    return
  }
  const existing = activeTimers.get(timer.id)
  if (existing) clearTimeout(existing)
  const handle = setTimeout(() => {
    const finished = { ...timer, status: 'done' }
    timersRepo.update(finished)
    activeTimers.delete(timer.id)
    const title = timer.name ? `Timer: ${timer.name}` : 'Timer abgelaufen'
    const body = timer.name ? `Dein Timer "${timer.name}" ist abgelaufen.` : 'Dein Timer ist fertig.'
    new Notification({ title, body }).show()
    console.log('Timer fired, sending event:', finished)
    if (overlayWin && !overlayWin.isDestroyed()) {
      overlayWin.webContents.send('timer/fired', finished)
      console.log('Sent timer/fired to overlayWin')
    }
    if (toolWin && !toolWin.isDestroyed()) {
      toolWin.webContents.send('timer/fired', finished)
      console.log('Sent timer/fired to toolWin')
    }
  }, delay)
  activeTimers.set(timer.id, handle)
}

const restoreTimers = () => {
  const list = timersRepo.list() || []
  const now = Date.now()
  list.forEach(t => {
    if (t.status === 'running') {
      if (t.targetAt && t.targetAt > now) {
        scheduleTimer(t)
      } else {
        const finished = { ...t, status: 'done' }
        timersRepo.update(finished)
      }
    }
  })
}


// Tools in eigenem Fenster öffnen
const openToolWindow = async (toolId) => {
  const search = `?tool=${encodeURIComponent(toolId)}`

  if (!toolWin || toolWin.isDestroyed()) {
    toolWin = new BrowserWindow({
  width: 600,
  height: 420,
  resizable: true,
  alwaysOnTop: false,
  transparent: false,
  frame: true,
  backgroundColor: '#181818',
  autoHideMenuBar: true,
  webPreferences: {
    preload: path.join(__dirname, 'preload.cjs'),
    contextIsolation: true,
    sandbox: false
  }
})


    toolWin.on('closed', () => {
      toolWin = null
    })
  }

  if (process.env.VITE_DEV) {
    await toolWin.loadURL(`http://localhost:5173/${search}`)
  } else {
    await toolWin.loadFile(
      path.join(__dirname, '../dist/renderer/index.html'),
      { search }
    )
  }

  toolWin.focus()
}

app.whenReady().then(async () => {
  try {
    await createOverlayWindow()
    registerShortcut()
    restoreTimers()
  } catch (error) {
    console.error(error)
  }
})


app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

/**
 * IPC Handler
 */

// overlay mode
ipcMain.handle('overlay/toggleInteract', () => {
  toggleInteract()
  return { interactive }
})

ipcMain.handle('overlay/getState', () => {
  return { interactive }
})

// config fuer auto-timeout + shortcut
ipcMain.handle('overlay/getConfig', () => {
  return { autoTimeoutSec, shortcut, theme }
})

ipcMain.handle('overlay/setAutoTimeout', (_e, sec) => {
  const n = parseInt(sec, 10)
  if (!Number.isFinite(n) || n <= 0) {
    return { autoTimeoutSec, shortcut }
  }

  autoTimeoutSec = n
  settingsRepo.set({ key: 'overlay_auto_timeout_s', value: String(autoTimeoutSec) })

  if (interactive) {
    scheduleAutoRevert()
  }

  return { autoTimeoutSec, shortcut }
})

ipcMain.handle('overlay/setShortcut', (_e, value) => {
  const v = String(value || '').trim()
  if (!v) {
    return { shortcut }
  }

  shortcut = v
  settingsRepo.set({ key: 'overlay_shortcut', value: shortcut })
  registerShortcut()

  return { shortcut }
})

ipcMain.handle('overlay/setTheme', (_e, newTheme) => {
  if (!newTheme || typeof newTheme !== 'object') {
    return { theme }
  }

  theme = { ...theme, ...newTheme }
  settingsRepo.set({
    key: 'overlay_theme',
    value: JSON.stringify(theme)
  })

  // Renderer informieren (Overlay + Tools)
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.webContents.send('overlay/theme', theme)
  }
  if (toolWin && !toolWin.isDestroyed()) {
    toolWin.webContents.send('overlay/theme', theme)
  }

  return { theme }
})

// user activity im Overlay -> timer resetten
ipcMain.handle('overlay/userActivity', () => {
  if (interactive) {
    scheduleAutoRevert()
  }
})

// Tools oeffnen (eigenes Fenster, nicht clickthrough)
ipcMain.handle('tools/open', (_e, toolId) => {
  openToolWindow(toolId)
  return true
})

// notes
ipcMain.handle('notes/list', () => notesRepo.list())
ipcMain.handle('notes/create', (_e, n) => notesRepo.create(n))
ipcMain.handle('notes/update', (_e, n) => notesRepo.update(n))
ipcMain.handle('notes/delete', (_e, id) => notesRepo.remove(id))

// timer
ipcMain.handle('timer/create', (_e, payload) => {
  const totalSeconds = Number(payload?.totalSeconds || 0)
  const name = String(payload?.name || '').trim()
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    throw new Error('invalid duration')
  }
  const created = timersRepo.create({
    name,
    totalSeconds,
    status: 'running'
  })
  scheduleTimer(created)
  return created
})

ipcMain.handle('timer/list', () => {
  return timersRepo.list() || []
})

ipcMain.handle('timer/cancel', (_e, id) => {
  if (!id) return
  const list = timersRepo.list() || []
  const timer = list.find(t => t.id === id)
  if (!timer) return
  const existing = activeTimers.get(id)
  if (existing) {
    clearTimeout(existing)
    activeTimers.delete(id)
  }
  const updated = { ...timer, status: 'cancelled' }
  timersRepo.update(updated)
  return updated
})

ipcMain.handle('timer/delete', (_e, id) => {
  if (!id) return
  const existing = activeTimers.get(id)
  if (existing) {
    clearTimeout(existing)
    activeTimers.delete(id)
  }
  timersRepo.remove(id)
  return true
})



// reminders
ipcMain.handle('reminder/create', (_e, r) => {
  const created = remindersRepo.create(r)
  scheduleReminder(created)
  return created
})
ipcMain.handle('reminder/cancel', (_e, id) => {
  cancelReminder(id)
  return remindersRepo.cancel(id)
})
ipcMain.handle('reminder/delete', (_e, id) => {
  cancelReminder(id)
  return remindersRepo.remove(id)
})
ipcMain.handle('reminder/list', () => remindersRepo.list())

// settings generic
ipcMain.handle('settings/get', (_e, key) => settingsRepo.get(key))
ipcMain.handle('settings/set', (_e, kv) => settingsRepo.set(kv))
