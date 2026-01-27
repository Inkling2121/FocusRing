import { app, BrowserWindow, globalShortcut, ipcMain, Notification, powerMonitor, screen } from 'electron'
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
let snapTimer = null             // Timer for snap-to-top delay
let lastPosition = null          // Last known position to detect actual movement

let theme = {
  accent: '#22c55e',         // Haupt-Akzent (Buttons, Glow)
  accentInactive: '#16a34a', // Akzent im Clickthrough-Modus
  textColor: '#ffffff',      // Text-Farbe im Overlay
  semicircleColor: '#22c55e', // Halbkreis Farbe
  buttonColor: '#22c55e',    // Button Farbe
  iconColor: '#ffffff'       // Icon Farbe
}

const createOverlayWindow = async () => {
  log('Creating overlay window...')
  try {
    await ensureDb()
    log('Database initialized')
  } catch (error) {
    logError('Database initialization failed:', error)
    throw error
  }

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

  // Reset window size - force new default size (ignore saved size temporarily)
  let width = 380
  let height = 180
  // Temporarily ignore saved size to apply new default
  // if (state?.width && state.width <= 270) {
  //   width = state.width
  // }
  // if (state?.height && state.height <= 150) {
  //   height = state.height
  // }

  log('Creating BrowserWindow with size:', width, 'x', height, 'at', x, y)

  const preloadPath = path.join(__dirname, 'preload.cjs')
  log('Preload path:', preloadPath)
  log('Preload exists:', fs.existsSync(preloadPath))

  overlayWin = new BrowserWindow({
    width: width,
    height: height,
    x: x,
    y: y,
    frame: false,
    transparent: true,
    resizable: false,
    minimizable: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    autoHideMenuBar: true,
    show: process.env.VITE_DEV ? true : false,  // Show immediately in dev mode to prevent auto-close
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: false,
      cache: false
    }
  })

  // Completely disable menu bar
  overlayWin.setMenuBarVisibility(false)

  log('BrowserWindow created')

  // Prevent closing in dev mode until content is loaded
  if (process.env.VITE_DEV) {
    overlayWin.setClosable(false)
    log('Window set to non-closable in dev mode')
  }

  // Debug: Log window events
  overlayWin.on('close', (e) => {
    log('Overlay window "close" event fired')
    const stack = new Error().stack
    log('Stack trace:', stack)
    // Prevent close during dev mode debugging
    if (process.env.VITE_DEV) {
      log('PREVENTING CLOSE in dev mode for debugging')
      e.preventDefault()
      logError('Something tried to close the window! Stack:', stack)
    }
  })
  overlayWin.on('closed', () => {
    log('Overlay window "closed" event fired')
  })
  overlayWin.webContents.on('render-process-gone', (event, details) => {
    logError('Render process gone:', details)
  })
  overlayWin.on('unresponsive', () => {
    logError('Window became unresponsive')
  })
  overlayWin.webContents.on('did-finish-load', () => {
    log('WebContents finished loading')
  })
  overlayWin.webContents.on('dom-ready', () => {
    log('WebContents DOM ready')
  })

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

    // Try to load - with retries if needed
    let loaded = false
    for (let i = 0; i < 5 && !loaded; i++) {
      // Check if window is still alive before attempting to load
      if (overlayWin.isDestroyed()) {
        logError('Window was destroyed before load attempt', i + 1)
        break
      }

      try {
        log(`Attempt ${i + 1}: Loading http://127.0.0.1:5173`)
        log('Window destroyed before loadURL?', overlayWin.isDestroyed())
        await overlayWin.loadURL('http://127.0.0.1:5173')
        loaded = true
        log('Successfully loaded!')
      } catch (err) {
        logError(`Attempt ${i + 1} failed:`, err.message)
        log('Window destroyed after error?', overlayWin.isDestroyed())

        if (overlayWin.isDestroyed()) {
          logError('Window was destroyed after failed load attempt!')
          break
        }

        if (i < 4) {
          log('Waiting 1 second before retry...')
          await new Promise(resolve => setTimeout(resolve, 1000))
          log('Done waiting, window destroyed?', overlayWin.isDestroyed())
        }
      }
    }

    if (loaded && !overlayWin.isDestroyed()) {
      overlayWin.setClosable(true)
      log('Window set to closable after successful load')
    } else {
      logError('Failed to load after all retries or window was destroyed')
      // Re-enable closing even on failure
      if (!overlayWin.isDestroyed()) {
        overlayWin.setClosable(true)
      }
    }
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

  // Track when drag ends (mouse button released)
  overlayWin.on('moved', () => {
    // Mouse button was released after dragging
    if (snapTimer) {
      clearTimeout(snapTimer)
    }

    // Snap after 50ms delay
    snapTimer = setTimeout(() => {
      if (!overlayWin) return
      const bounds = overlayWin.getBounds()
      const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y })

      // Snap to top of current display
      overlayWin.setBounds({
        x: bounds.x,
        y: display.bounds.y,
        width: bounds.width,
        height: bounds.height
      })

      saveBounds()
    }, 50)
  })

  overlayWin.on('move', () => {
    // Just save bounds during move, don't snap
    saveBounds()
  })
  overlayWin.on('resize', () => saveBounds())

  // initial: clickthrough
  applyInteractState()
}

const saveBounds = () => {
  if (!overlayWin) return
  const b = overlayWin.getBounds()
  windowRepo.save({
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

  // Always register default shortcut first
  const defaultShortcut = 'Control+Alt+Space'
  const defaultOk = globalShortcut.register(defaultShortcut, () => toggleInteract())
  if (!defaultOk) {
    console.warn('Konnte Standard-Shortcut nicht registrieren:', defaultShortcut)
  } else {
    log('Standard-Shortcut registriert:', defaultShortcut)
  }

  // Register custom shortcut if different from default
  if (shortcut && shortcut !== defaultShortcut) {
    const ok = globalShortcut.register(shortcut, () => toggleInteract())
    if (!ok) {
      console.warn('Konnte Custom-Shortcut nicht registrieren:', shortcut)
    } else {
      log('Custom-Shortcut registriert:', shortcut)
    }
  }
}

const scheduleTimer = (timer) => {
  if (!timer || !timer.id) return

  // Clear existing timer if any
  const existing = activeTimers.get(timer.id)
  if (existing && existing.handle) clearTimeout(existing.handle)

  // Don't schedule if paused
  if (timer.status === 'paused') {
    activeTimers.delete(timer.id)
    return
  }

  if (timer.status !== 'running') return

  const now = Date.now()
  const delay = timer.targetAt - now

  const finishTimer = () => {
    const dbTimer = timersRepo.getById(timer.id)
    if (dbTimer) {
      timersRepo.update(timer.id, {
        ...dbTimer,
        state: 'done',
        remaining_ms: 0
      })
    }
    const finished = { ...timer, status: 'done', remainingMs: 0 }
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
  }

  if (delay <= 0) {
    finishTimer()
    return
  }

  const handle = setTimeout(finishTimer, delay)
  activeTimers.set(timer.id, { handle, targetAt: timer.targetAt })
}

const restoreTimers = () => {
  const dbTimers = timersRepo.getAll() || []
  const now = Date.now()
  dbTimers.forEach(dbTimer => {
    if (dbTimer.state === 'running') {
      const targetAt = now + dbTimer.remaining_ms
      if (dbTimer.remaining_ms > 0) {
        const frontendTimer = {
          id: dbTimer.id,
          name: dbTimer.label,
          totalSeconds: Math.round(dbTimer.duration_ms / 1000),
          status: 'running',
          remainingMs: dbTimer.remaining_ms,
          targetAt
        }
        scheduleTimer(frontendTimer)
      } else {
        timersRepo.update(dbTimer.id, {
          ...dbTimer,
          state: 'done',
          remaining_ms: 0
        })
      }
    }
    // Paused timers don't need scheduling, just leave them
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
          await toolWin.loadURL(`http://127.0.0.1:5173/${search}`)
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
      width: saved?.width || 500,
      height: saved?.height || 600,
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

    // Completely disable menu bar
    toolWin.setMenuBarVisibility(false)

    let currentToolId = toolId

    const saveBoundsForTool = () => {
      if (!toolWin || toolWin.isDestroyed()) return
      const b = toolWin.getBounds()
      toolWindowRepo.save(currentToolId, { pos_x: b.x, pos_y: b.y, width: b.width, height: b.height })
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
        await toolWin.loadURL(`http://127.0.0.1:5173/${search}`)
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
  // In dev mode, don't quit when windows are closed - allows debugging
  if (process.env.VITE_DEV) {
    log('All windows closed in dev mode, but not quitting')
    return
  }
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
  settingsRepo.set({ key: 'overlay_theme', value: JSON.stringify(theme) })

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
ipcMain.handle('notes/list', () => notesRepo.getAll())
ipcMain.handle('notes/create', (_e, n) => {
  const note = notesRepo.create(n)
  return note
})
ipcMain.handle('notes/update', (_e, n) => {
  return notesRepo.update(n)
})
ipcMain.handle('notes/delete', (_e, id) => notesRepo.remove(id))

// timer
ipcMain.handle('timer/create', (_e, payload) => {
  const totalSeconds = Number(payload?.totalSeconds || 0)
  const name = String(payload?.name || '').trim()
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    throw new Error('invalid duration')
  }
  const now = Date.now()
  const duration_ms = totalSeconds * 1000
  const id = timersRepo.create({
    label: name,
    duration_ms,
    remaining_ms: duration_ms,
    state: 'running',
    paused_at: null
  })
  const created = {
    id,
    name,
    totalSeconds,
    status: 'running',
    remainingMs: duration_ms,
    targetAt: now + duration_ms
  }
  scheduleTimer(created)
  return created
})

ipcMain.handle('timer/list', () => {
  const dbTimers = timersRepo.getAll() || []
  // Convert DB format to frontend format
  return dbTimers.map(t => ({
    id: t.id,
    name: t.label,
    totalSeconds: Math.round(t.duration_ms / 1000),
    status: t.state,
    remainingMs: t.remaining_ms,
    targetAt: t.state === 'running' ? Date.now() + t.remaining_ms : null,
    pausedAt: t.paused_at
  }))
})

ipcMain.handle('timer/cancel', (_e, id) => {
  if (!id) return
  const dbTimer = timersRepo.getById(id)
  if (!dbTimer) return
  const existing = activeTimers.get(id)
  if (existing && existing.handle) {
    clearTimeout(existing.handle)
    activeTimers.delete(id)
  }
  timersRepo.update(id, {
    ...dbTimer,
    state: 'cancelled',
    remaining_ms: 0
  })
  return {
    id: dbTimer.id,
    name: dbTimer.label,
    totalSeconds: Math.round(dbTimer.duration_ms / 1000),
    status: 'cancelled',
    remainingMs: 0
  }
})

ipcMain.handle('timer/pause', (_e, id) => {
  if (!id) return
  const dbTimer = timersRepo.getById(id)
  if (!dbTimer || dbTimer.state !== 'running') return

  // Calculate remaining time from the activeTimer
  const existing = activeTimers.get(id)
  const now = Date.now()
  let remainingMs = dbTimer.remaining_ms

  if (existing) {
    // Timer is active, calculate actual remaining time
    if (existing.targetAt) {
      remainingMs = Math.max(0, existing.targetAt - now)
    }
    if (existing.handle) {
      clearTimeout(existing.handle)
    }
    activeTimers.delete(id)
  }

  // Update to paused state
  timersRepo.update(id, {
    ...dbTimer,
    state: 'paused',
    remaining_ms: remainingMs,
    paused_at: now
  })

  return {
    id: dbTimer.id,
    name: dbTimer.label,
    totalSeconds: Math.round(dbTimer.duration_ms / 1000),
    status: 'paused',
    remainingMs,
    pausedAt: now
  }
})

ipcMain.handle('timer/resume', (_e, id) => {
  if (!id) return
  const dbTimer = timersRepo.getById(id)
  if (!dbTimer || dbTimer.state !== 'paused') return

  // Resume with remaining time
  const now = Date.now()
  timersRepo.update(id, {
    ...dbTimer,
    state: 'running',
    paused_at: null
  })

  const frontendTimer = {
    id: dbTimer.id,
    name: dbTimer.label,
    totalSeconds: Math.round(dbTimer.duration_ms / 1000),
    status: 'running',
    remainingMs: dbTimer.remaining_ms,
    targetAt: now + dbTimer.remaining_ms,
    pausedAt: null
  }
  scheduleTimer(frontendTimer)
  return frontendTimer
})

ipcMain.handle('timer/delete', (_e, id) => {
  if (!id) return
  const existing = activeTimers.get(id)
  if (existing && existing.handle) {
    clearTimeout(existing.handle)
    activeTimers.delete(id)
  }
  timersRepo.remove(id)
  return true
})



// reminders
ipcMain.handle('reminder/create', (_e, r) => {
  const id = remindersRepo.create({ ...r, status: 'scheduled' })
  const created = remindersRepo.getById(id)
  scheduleReminder(created)
  return created
})
ipcMain.handle('reminder/cancel', (_e, id) => {
  cancelReminder(id)
  const reminder = remindersRepo.getById(id)
  if (reminder) {
    remindersRepo.update(id, { ...reminder, status: 'canceled' })
  }
  return remindersRepo.getById(id)
})
ipcMain.handle('reminder/delete', (_e, id) => {
  cancelReminder(id)
  remindersRepo.remove(id)
  return true
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
