const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('focusring', {
  invoke: (channel, payload) => ipcRenderer.invoke(channel, payload),
  onReminder: (cb) =>
    ipcRenderer.on('scheduler/reminderFired', (_event, data) => cb(data)),
  onOverlayState: (cb) =>
    ipcRenderer.on('overlay/state', (_event, state) => cb(state)),
  onTheme: (cb) =>
    ipcRenderer.on('overlay/theme', (_event, theme) => cb(theme)),
  onTimerFired: (cb) =>
    ipcRenderer.on('timer/fired', (_event, timer) => cb(timer)),
  onFirstLaunch: (cb) =>
    ipcRenderer.on('overlay/firstLaunch', (_event, data) => cb(data))
})

