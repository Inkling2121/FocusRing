type Invoker = <T = any>(ch: string, payload?: any) => Promise<T>

declare global {
  interface Window {
    focusring?: {
      invoke: Invoker
      onReminder: (cb: (d: any) => void) => void
      onOverlayState: (cb: (d: any) => void) => void
      onTheme: (cb: (d: any) => void) => void
      onTimerFired: (cb: (d: any) => void) => void
    }
    electron?: {
      ipcRenderer: {
        invoke: Invoker
        on: (channel: string, listener: (...args: any[]) => void) => void
      }
    }
  }
}

const hasFR = typeof window !== 'undefined' && !!window.focusring
const hasElec = typeof window !== 'undefined' && !!window.electron?.ipcRenderer

export const invoke = async <T = any>(ch: string, payload?: any): Promise<T> => {
  if (hasFR) return window.focusring!.invoke<T>(ch, payload)
  if (hasElec) return window.electron!.ipcRenderer.invoke<T>(ch, payload)
  throw new Error('ipc not available')
}

export const onReminder = (cb: (d: any) => void): void => {
  if (hasFR) {
    window.focusring!.onReminder(cb)
    return
  }
  if (hasElec) {
    window.electron!.ipcRenderer.on('scheduler/reminderFired', (_e, d) => cb(d))
  }
}

export const onOverlayState = (cb: (d: any) => void): void => {
  if (hasFR) {
    window.focusring!.onOverlayState(cb)
    return
  }
  if (hasElec) {
    window.electron!.ipcRenderer.on('overlay/state', (_e, d) => cb(d))
  }
}

export const onOverlayTheme = (cb: (d: any) => void): void => {
  if (hasFR) {
    window.focusring!.onTheme(cb)
    return
  }
  if (hasElec) {
    window.electron!.ipcRenderer.on('overlay/theme', (_e, d) => cb(d))
  }
}

export const onTimerFired = (cb: (d: any) => void): void => {
  if (hasFR) {
    window.focusring!.onTimerFired(cb)
    return
  }
  if (hasElec) {
    window.electron!.ipcRenderer.on('timer/fired', (_e, d) => cb(d))
  }
}
