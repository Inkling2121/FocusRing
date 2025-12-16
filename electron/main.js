import { app, BrowserWindow, globalShortcut, ipcMain, Notification, powerMonitor } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { ensureDb, notesRepo, timersRepo, remindersRepo, settingsRepo, windowRepo, toolWindowRepo } from './db.js'
import { startScheduler, scheduleReminder, cancelReminder, rescheduleAll } from './scheduler.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const activeTimers = new Map()

// Setup file logging
const logPath = path.join(app.getPath('userData'), 'debug.log')
const logStream = fs.createWriteStream(logPath, { flags: 'a' })

function log(...args) {
  const msg = `[${new Date().toISOString()}] ${args.join(' ')}`
  console.log(...args)
  logStream.write(msg + '\n')
}

function logError(...args) {
  const msg = `[${new Date().toISOString()}] ERROR: ${args.join(' ')}`
  console.error(...args)
  logStream.write(msg + '\n')
}

// Catch all unhandled errors
process.on('uncaughtException', (error) => {
  logError('Uncaught Exception:', error)
})

process.on('unhandledRejection', (reason, promise) => {
  logError('Unhandled Rejection at:', promise, 'reason:', reason)
})

log('=== FocusRing Starting ===')
log('App path:', app.getAppPath())
log('User data path:', app.getPath('userData'))
log('Log file:', logPath)

// Set App User Model ID for Windows notifications
if (process.platform === 'win32') {
  app.setAppUserModelId('ch.noahwirth.focusring')
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance, focus our window instead
    if (overlayWin) {
      if (overlayWin.isMinimized()) overlayWin.restore()
      overlayWin.focus()
    }
  })
}

let overlayWin       // kleines Overlay mit RadialMenu
let toolWin          // eigenes Fenster fuer Tools (Notizen usw.)
let interactive = true           // default: interactive (manuell umschalten)
let autoRevertTimer = null
let autoRevertEnabled = false    // default: AUS (manuelles Umschalten)
let autoTimeoutSec = 8           // default, wird aus Settings geladen
let shortcut = 'Control+Alt+Space' // default shortcut, kann geaendert werden

let theme = {
  accent: '#22c55e',         // Haupt-Akzent (Buttons, Glow)
  accentInactive: '#16a34a', // Akzent im Clickthrough-Modus
  textColor: '#ffffff'       // Text-Farbe im Overlay
}

const createOverlayWindow = async () => {
  log('Creating overlay window...')
  await ensureDb()
  log('Database initialized')

    // auto-revert enabled aus settings laden
  const autoRevertSetting = settingsRepo.get('overlay_auto_revert_enabled')
  if (autoRevertSetting !== null) {
    autoRevertEnabled = autoRevertSetting === 'true'
    log('Auto-revert enabled:', autoRevertEnabled)
  }

    // auto-timeout aus settings laden
  const timeoutSetting = settingsRepo.get('overlay_auto_timeout_s')
  if (timeoutSetting) {
    const parsed = parseInt(timeoutSetting, 10)
    if (!Number.isNaN(parsed) && parsed > 0) {
      autoTimeoutSec = parsed
      log('Auto-timeout:', autoTimeoutSec)
    }
  }

  // shortcut aus settings laden
  const shortcutSetting = settingsRepo.get('overlay_shortcut')
  if (shortcutSetting && typeof shortcutSetting === 'string' && shortcutSetting.trim().length > 0) {
    shortcut = shortcutSetting.trim()
    log('Shortcut:', shortcut)
  }

  // 🎨 Theme aus Settings laden
  const themeSetting = settingsRepo.get('overlay_theme')
  if (themeSetting && typeof themeSetting === 'string') {
    try {
      const parsed = JSON.parse(themeSetting)
      theme = { ...theme, ...parsed }
      log('Theme loaded:', JSON.stringify(theme))
    } catch (e) {
      logError('invalid overlay_theme in settings', e)
    }
  }


  const state = windowRepo.get()
  log('Window state from DB:', state)

  // Validate window position is on a visible screen
  let x = state?.pos_x
  let y = state?.pos_y

  if (x !== undefined && y !== undefined) {
    const { screen } = require('electron')
    const displays = screen.getAllDisplays()
    log('Checking if position', x, y, 'is on screen. Displays:', displays.length)
    const isOnScreen = displays.some(display => {
      const { x: dx, y: dy, width, height } = display.bounds
      return x >= dx && x < dx + width && y >= dy && y < dy + height
    })

    if (!isOnScreen) {
      log('Saved position is off-screen, using default position')
      x = undefined
      y = undefined
    } else {
      log('Position is valid')
    }
  }

  log('Creating BrowserWindow with size:', state?.width || 250, 'x', state?.height || 130, 'at', x, y)

  overlayWin = new BrowserWindow({
    width: state?.width || 250,
    height: state?.height || 130,
    x: x,
    y: y,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    autoHideMenuBar: true,
    show: false,  // Don't show until ready
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: false,
      cache: false
    }
  })

  log('BrowserWindow created')

  // Show window when ready
  overlayWin.once('ready-to-show', () => {
    log('Overlay window ready, showing now')
    const bounds = overlayWin.getBounds()
    log('Window bounds:', JSON.stringify(bounds))
    log('Window visible:', overlayWin.isVisible())

    overlayWin.show()
    overlayWin.focus()
    overlayWin.setAlwaysOnTop(true, 'screen-saver')

    log('After show - visible:', overlayWin.isVisible())
    log('After show - minimized:', overlayWin.isMinimized())

    // Check if this is first launch and send to renderer
    const welcomeShown = settingsRepo.get('first_launch_welcome_shown')
    if (!welcomeShown) {
      log('First launch detected, showing welcome message')
      overlayWin.webContents.send('overlay/firstLaunch', { shortcut })
    }
  })

  // Listen for renderer errors (in both dev and production)
  overlayWin.webContents.on('console-message', (_event, level, message) => {
    if (typeof message === 'string' && (
      message.includes('Request Autofill.enable failed') ||
      message.includes("'Autofill.enable' wasn't found") ||
      message.includes('Request Autofill.setAddresses failed') ||
      message.includes("'Autofill.setAddresses' wasn't found")
    )) return
    const prefix = level === 2 ? 'ERROR' : level === 1 ? 'WARN' : 'LOG'
    log(`[RENDERER ${prefix}] ${message}`)
  })

  overlayWin.webContents.on('crashed', () => {
    logError('[RENDERER] Process crashed!')
  })

  overlayWin.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    logError('[RENDERER] Failed to load:', errorCode, errorDescription)
  })

  if (process.env.VITE_DEV) {
    log('DEV mode: loading from localhost')
    // Retry logic for dev server
    let retries = 5
    let loaded = false
    while (retries > 0 && !loaded) {
      try {
        await overlayWin.loadURL('http://localhost:5173')
        loaded = true
        log('Dev server loaded successfully')
      } catch (error) {
        retries--
        logError('Failed to load dev server, retries left:', retries, error)
        if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        } else {
          throw error
        }
      }
    }
    overlayWin.webContents.openDevTools({ mode: 'detach' })
  } else {
    const htmlPath = path.join(__dirname, '../dist/renderer/index.html')
    log('[MAIN] Loading HTML from:', htmlPath)
    await overlayWin.loadFile(htmlPath)
    log('[MAIN] HTML loaded successfully')
  }

  log('Overlay window created at position:', JSON.stringify(overlayWin.getBounds()))

  // scheduler fuer reminder (Overlay ist unser "Main"-Fenster)
  startScheduler((rem) => {
    const notification = new Notification({ title: 'Reminder', body: rem.message })
    notification.on('click', () => {
      openToolWindow('reminder')
    })
    notification.show()
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
  if (!autoRevertEnabled) return  // Nur wenn auto-revert aktiviert ist
  if (autoRevertTimer) clearTimeout(autoRevertTimer)
  autoRevertTimer = setTimeout(() => {
    interactive = false
    applyInteractState()
  }, autoTimeoutSec * 1000)
}

const toggleInteract = () => {
  interactive = !interactive

  if (interactive && autoRevertEnabled) {
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
  if (!timer || !timer.id) return

  // Clear existing timer if any
  const existing = activeTimers.get(timer.id)
  if (existing) clearTimeout(existing)

  // Don't schedule if paused
  if (timer.status === 'paused') {
    activeTimers.delete(timer.id)
    return
  }

  if (timer.status !== 'running') return

  const now = Date.now()
  const delay = timer.targetAt - now

  if (delay <= 0) {
    const finished = { ...timer, status: 'done', remainingMs: 0 }
    timersRepo.update(finished)
    activeTimers.delete(timer.id)
    const title = timer.name ? `Timer: ${timer.name}` : 'Timer abgelaufen'
    const body = timer.name ? `Dein Timer "${timer.name}" ist abgelaufen.` : 'Dein Timer ist fertig.'
    const notification = new Notification({ title, body })
    notification.on('click', () => {
      openToolWindow('timer')
    })
    notification.show()
    if (overlayWin && !overlayWin.isDestroyed()) {
      overlayWin.webContents.send('timer/fired', finished)
    }
    if (toolWin && !toolWin.isDestroyed()) {
      toolWin.webContents.send('timer/fired', finished)
    }
    return
  }

  const handle = setTimeout(() => {
    const finished = { ...timer, status: 'done', remainingMs: 0 }
    timersRepo.update(finished)
    activeTimers.delete(timer.id)
    const title = timer.name ? `Timer: ${timer.name}` : 'Timer abgelaufen'
    const body = timer.name ? `Dein Timer "${timer.name}" ist abgelaufen.` : 'Dein Timer ist fertig.'
    const notification = new Notification({ title, body })
    notification.on('click', () => {
      openToolWindow('timer')
    })
    notification.show()
    if (overlayWin && !overlayWin.isDestroyed()) {
      overlayWin.webContents.send('timer/fired', finished)
    }
    if (toolWin && !toolWin.isDestroyed()) {
      toolWin.webContents.send('timer/fired', finished)
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
        const finished = { ...t, status: 'done', remainingMs: 0 }
        timersRepo.update(finished)
      }
    } else if (t.status === 'paused') {
      // Paused timers don't need scheduling, just leave them
    }
  })
}


// Tools in eigenem Fenster öffnen
const openToolWindow = async (toolId) => {
  const search = `?tool=${encodeURIComponent(toolId)}`

  // If window exists and is minimized, restore it
  if (toolWin && !toolWin.isDestroyed()) {
    if (toolWin.isMinimized()) {
      toolWin.restore()
    }
    toolWin.focus()

    // Reload with new tool if different
    if (process.env.VITE_DEV) {
      let retries = 5
      let loaded = false
      while (retries > 0 && !loaded) {
        try {
          await toolWin.loadURL(`http://localhost:5173/${search}`)
          loaded = true
        } catch (error) {
          retries--
          if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000))
          } else {
            throw error
          }
        }
      }
    } else {
      await toolWin.loadFile(
        path.join(__dirname, '../dist/renderer/index.html'),
        { search }
      )
    }
    return
  }

  // Create new window
  if (!toolWin || toolWin.isDestroyed()) {
    // Load saved position for this tool
    const saved = toolWindowRepo.get(toolId)

    toolWin = new BrowserWindow({
      width: saved?.width || 600,
      height: saved?.height || 420,
      x: saved?.pos_x,
      y: saved?.pos_y,
      resizable: true,
      alwaysOnTop: false,
      transparent: false,
      frame: true,
      backgroundColor: '#181818',
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        sandbox: false,
        cache: false
      }
    })

    let currentToolId = toolId

    const saveBoundsForTool = () => {
      if (!toolWin || toolWin.isDestroyed()) return
      const b = toolWin.getBounds()
      toolWindowRepo.set(currentToolId, { x: b.x, y: b.y, width: b.width, height: b.height })
    }

    toolWin.on('move', saveBoundsForTool)
    toolWin.on('resize', saveBoundsForTool)
    toolWin.on('closed', () => {
      toolWin = null
    })

    // Store the tool ID so we can track which tool is open
    toolWin.on('page-title-updated', () => {
      // Update currentToolId when the tool changes (if we reuse the window)
    })
  }

  if (process.env.VITE_DEV) {
    let retries = 5
    let loaded = false
    while (retries > 0 && !loaded) {
      try {
        await toolWin.loadURL(`http://localhost:5173/${search}`)
        loaded = true
      } catch (error) {
        retries--
        if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        } else {
          throw error
        }
      }
    }
  } else {
    await toolWin.loadFile(
      path.join(__dirname, '../dist/renderer/index.html'),
      { search }
    )
  }

  toolWin.focus()
}

app.whenReady().then(async () => {
  log('App ready, initializing...')
  try {
    await createOverlayWindow()
    log('Overlay window created successfully')
    registerShortcut()
    log('Shortcuts registered')
    restoreTimers()
    log('Timers restored')

    // Handle system sleep/wake for timers and reminders
    powerMonitor.on('suspend', () => {
      log('System is going to sleep')
    })

    powerMonitor.on('resume', () => {
      log('System woke up from sleep')
      // Recalculate all timers
      restoreTimers()
      // Reschedule all reminders
      rescheduleAll()
      // Notify renderer to refresh
      if (overlayWin && !overlayWin.isDestroyed()) {
        overlayWin.webContents.send('system/resumed')
      }
      if (toolWin && !toolWin.isDestroyed()) {
        toolWin.webContents.send('system/resumed')
      }
    })
  } catch (error) {
    logError('Failed to initialize app:', error)
    logError('Stack:', error.stack)
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

// config fuer auto-timeout + shortcut + auto-revert
ipcMain.handle('overlay/getConfig', () => {
  return { autoTimeoutSec, shortcut, theme, autoRevertEnabled }
})

ipcMain.handle('overlay/setAutoTimeout', (_e, sec) => {
  const n = parseInt(sec, 10)
  if (!Number.isFinite(n) || n <= 0) {
    return { autoTimeoutSec, shortcut, autoRevertEnabled }
  }

  autoTimeoutSec = n
  settingsRepo.set({ key: 'overlay_auto_timeout_s', value: String(autoTimeoutSec) })

  if (interactive && autoRevertEnabled) {
    scheduleAutoRevert()
  }

  return { autoTimeoutSec, shortcut, autoRevertEnabled }
})

ipcMain.handle('overlay/setAutoRevert', (_e, enabled) => {
  autoRevertEnabled = !!enabled
  settingsRepo.set({ key: 'overlay_auto_revert_enabled', value: String(autoRevertEnabled) })

  // Wenn deaktiviert, laufenden Timer stoppen
  if (!autoRevertEnabled && autoRevertTimer) {
    clearTimeout(autoRevertTimer)
    autoRevertTimer = null
  }

  // Wenn aktiviert und interactive, Timer starten
  if (autoRevertEnabled && interactive) {
    scheduleAutoRevert()
  }

  return { autoRevertEnabled }
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
  const updated = { ...timer, status: 'cancelled', remainingMs: 0 }
  timersRepo.update(updated)
  return updated
})

ipcMain.handle('timer/pause', (_e, id) => {
  if (!id) return
  const list = timersRepo.list() || []
  const timer = list.find(t => t.id === id)
  if (!timer || timer.status !== 'running') return timer

  // Calculate remaining time
  const now = Date.now()
  const remainingMs = Math.max(0, timer.targetAt - now)

  // Clear the scheduled timeout
  const existing = activeTimers.get(id)
  if (existing) {
    clearTimeout(existing)
    activeTimers.delete(id)
  }

  // Update to paused state
  const updated = { ...timer, status: 'paused', remainingMs, pausedAt: now }
  timersRepo.update(updated)
  return updated
})

ipcMain.handle('timer/resume', (_e, id) => {
  if (!id) return
  const list = timersRepo.list() || []
  const timer = list.find(t => t.id === id)
  if (!timer || timer.status !== 'paused') return timer

  // Resume with remaining time
  const now = Date.now()
  const updated = {
    ...timer,
    status: 'running',
    targetAt: now + (timer.remainingMs || 0),
    pausedAt: null
  }
  timersRepo.update(updated)
  scheduleTimer(updated)
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

// first launch welcome
ipcMain.handle('overlay/dismissWelcome', () => {
  settingsRepo.set({ key: 'first_launch_welcome_shown', value: 'true' })
  return true
})
