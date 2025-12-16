# FocusRing - Vollständige Code-Dokumentation für Einsteiger

## Inhaltsverzeichnis
1. [Was ist FocusRing?](#was-ist-focusring)
2. [Die Grundidee](#die-grundidee)
3. [Technologie-Überblick](#technologie-überblick)
4. [Projektstruktur](#projektstruktur)
5. [Wie startet die Anwendung?](#wie-startet-die-anwendung)
6. [Die Datenbank](#die-datenbank)
7. [Der Electron Main Process](#der-electron-main-process)
8. [Die Kommunikation zwischen Main und Renderer](#die-kommunikation-zwischen-main-und-renderer)
9. [Der React Renderer Process](#der-react-renderer-process)
10. [Die Tools im Detail](#die-tools-im-detail)
11. [Wichtige Konzepte](#wichtige-konzepte)
12. [Entwicklung und Build](#entwicklung-und-build)

---

## Was ist FocusRing?

FocusRing ist eine **Desktop-Overlay-Anwendung** für Windows. Stell dir vor, du hast ein kleines, transparentes Fenster, das immer über allen anderen Fenstern schwebt. Dieses Fenster zeigt ein halbmondförmiges Menü mit Buttons. Mit einer Tastenkombination (Standard: `Strg+Alt+Leertaste`) kannst du das Fenster zwischen zwei Modi umschalten:

- **Clickthrough-Modus**: Das Fenster ist transparent und durchklickbar - Mausklicks gehen durch das Fenster hindurch zu den darunterliegenden Anwendungen
- **Interaktiv-Modus**: Das Fenster ist aktiv und du kannst die Buttons anklicken

Die Buttons öffnen verschiedene Tools:
- **Notes**: Notizen erstellen und verwalten
- **Timer**: Countdown-Timer mit Benachrichtigungen
- **Reminder**: Erinnerungen zu bestimmten Zeiten
- **Settings**: Einstellungen für Shortcuts, Farben und Auto-Timeout

---

## Die Grundidee

### Warum zwei Modi?

Ein normales Overlay würde entweder:
1. **Immer durchklickbar sein** → Du könntest nichts damit machen
2. **Immer Klicks blockieren** → Es würde deine Arbeit stören

FocusRing löst das Problem clever:
- Normalerweise ist es **durchklickbar** (unsichtbar für deine Mausklicks)
- Mit einem Shortcut wird es **interaktiv** (du kannst es bedienen)
- Nach einer konfigurierbaren Zeit (Standard: 8 Sekunden) schaltet es automatisch zurück in den Clickthrough-Modus

### Zwei Arten von Fenstern

1. **Overlay-Fenster**: Das kleine, transparente Fenster mit dem Halbkreis-Menü
2. **Tool-Fenster**: Normale Fenster, die sich öffnen, wenn du auf einen Button klickst

---

## Technologie-Überblick

### Was sind diese Technologien?

**Electron**
- Ein Framework, das es ermöglicht, Desktop-Anwendungen mit Web-Technologien (HTML, CSS, JavaScript) zu bauen
- Es kombiniert Node.js (für Backend-Logik) mit Chromium (für die Benutzeroberfläche)
- Bekannte Anwendungen: VS Code, Slack, Discord

**React**
- Eine JavaScript-Bibliothek für Benutzeroberflächen
- Du beschreibst, wie die UI aussehen soll, und React kümmert sich um das Update
- Arbeitet mit "Komponenten" - wiederverwendbare UI-Bausteine

**TypeScript**
- JavaScript mit Typen
- Hilft, Fehler zu vermeiden, indem es überprüft, ob Variablen die richtigen Datentypen haben

**SQLite (via sql.js)**
- Eine leichtgewichtige Datenbank
- Speichert alle Notizen, Timer, Reminders und Einstellungen
- sql.js ist eine JavaScript-Version von SQLite

**Vite**
- Ein modernes Build-Tool
- Im Entwicklungsmodus: Startet einen lokalen Server mit Hot-Reload (Änderungen werden sofort sichtbar)
- Für Production: Bündelt und optimiert den Code

---

## Projektstruktur

```
Focus-Ring/
├── electron/                    # Backend (Node.js Teil)
│   ├── main.js                  # Hauptprozess - Fensterverwaltung, Shortcuts
│   ├── db.js                    # Datenbank-Logik und Repositories
│   ├── preload.cjs              # Brücke zwischen Main und Renderer
│   └── scheduler.js             # Reminder-Scheduling
│
├── renderer/                    # Frontend (React Teil)
│   ├── index.html               # HTML Entry Point
│   └── src/
│       ├── App.tsx              # Haupt-React-Komponente
│       ├── main.tsx             # React Entry Point
│       ├── index.css            # Globale Styles
│       ├── ipc.ts               # IPC-Kommunikations-Wrapper
│       ├── components/          # React Komponenten
│       │   └── RadialMenu.tsx   # Halbkreis-Menü
│       └── tools/               # Tool-Komponenten
│           ├── Notes.tsx        # Notizen-Tool
│           ├── Timer.tsx        # Timer-Tool
│           ├── Reminder.tsx     # Reminder-Tool
│           └── Settings.tsx     # Einstellungen
│
├── build/                       # Build-Ressourcen (Icons)
├── dist/                        # Gebaute Dateien
├── package.json                 # Projekt-Konfiguration
└── vite.config.ts               # Vite-Konfiguration
```

### Warum diese Trennung?

Electron-Apps haben **zwei Prozesse**:

1. **Main Process** (`electron/`)
   - Hat Zugriff auf Node.js und das Betriebssystem
   - Erstellt Fenster, verwaltet Shortcuts, greift auf die Dateisystem zu
   - Pro App gibt es einen Main Process

2. **Renderer Process** (`renderer/`)
   - Läuft in jedem Fenster
   - Hat nur eingeschränkten Zugriff (aus Sicherheitsgründen)
   - Zeigt die Benutzeroberfläche an
   - Pro Fenster gibt es einen Renderer Process

---

## Wie startet die Anwendung?

### Start-Ablauf

```
1. npm run dev
   ↓
2. package.json führt aus: "concurrently -k \"vite\" \"wait-on http://localhost:5173 && cross-env VITE_DEV=1 electron .\""
   ↓
3. Vite startet Dev-Server auf Port 5173 (für React)
   ↓
4. Electron wartet, bis Server bereit ist
   ↓
5. electron/main.js wird ausgeführt
   ↓
6. createOverlayWindow() erstellt Overlay-Fenster
   ↓
7. Fenster lädt React-App von http://localhost:5173
   ↓
8. React rendert in main.tsx → App.tsx
   ↓
9. App läuft!
```

### Was passiert in `electron/main.js` beim Start?

```javascript
app.whenReady().then(async () => {
  try {
    await createOverlayWindow()  // Erstellt das Overlay-Fenster
    registerShortcut()            // Registriert Strg+Alt+Space
    restoreTimers()               // Stellt laufende Timer wieder her
  } catch (error) {
    console.error(error)
  }
})
```

**Schritt für Schritt:**

1. **`ensureDb()`**: Datenbank wird initialisiert oder geladen
2. **Settings laden**: Auto-Timeout, Shortcut, Theme aus DB holen
3. **Fenster erstellen**: Mit `new BrowserWindow({...})`
   - 270x130 Pixel groß
   - Ohne Rahmen (`frame: false`)
   - Transparent (`transparent: true`)
   - Immer im Vordergrund (`alwaysOnTop: true`)
4. **Content laden**:
   - Dev: `http://localhost:5173` (Vite Dev Server)
   - Prod: Lokale HTML-Datei aus `dist/`
5. **Scheduler starten**: Für Reminder-Benachrichtigungen
6. **Initial Mode**: Clickthrough-Modus aktivieren

---

## Die Datenbank

### Grundkonzept

Die Anwendung nutzt **SQLite** - eine Datei-basierte Datenbank. Die Datenbankdatei liegt in:
```
C:\Users\[Benutzername]\AppData\Roaming\focusring\db\focusring.sqlite
```

### Datenbank-Tabellen

**`electron/db.js` definiert diese Tabellen:**

```sql
-- Einstellungen (Key-Value Store)
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Fenster-Status (Position, Größe)
CREATE TABLE windows_state (
  id INTEGER PRIMARY KEY,
  pos_x INTEGER,
  pos_y INTEGER,
  width INTEGER,
  height INTEGER,
  overlay_mode TEXT
);

-- Notizen
CREATE TABLE notes (
  id INTEGER PRIMARY KEY,
  title TEXT,
  content TEXT,
  pinned INTEGER,
  pos_x INTEGER,
  pos_y INTEGER,
  width INTEGER,
  height INTEGER,
  updated_at TEXT
);

-- Timer
CREATE TABLE timers (
  id INTEGER PRIMARY KEY,
  label TEXT,
  duration_ms INTEGER,
  remaining_ms INTEGER,
  state TEXT,
  paused_at INTEGER,
  updated_at TEXT
);

-- Reminders
CREATE TABLE reminders (
  id INTEGER PRIMARY KEY,
  message TEXT,
  fire_at INTEGER,
  status TEXT,
  created_at TEXT
);
```

### Repository Pattern

Statt direkt SQL zu schreiben, gibt es **Repositories** - Objekte, die die Datenbank-Operationen kapseln:

```javascript
export const notesRepo = {
  list: () => all('select * from notes order by updated_at desc'),
  create: (n) => { /* ... */ },
  update: (n) => { /* ... */ },
  remove: (id) => { /* ... */ }
}
```

**Vorteile:**
- Konsistente API
- Einfacher zu nutzen
- Leichter zu testen
- Logik ist an einem Ort

### Wichtige Helper-Funktionen

```javascript
// Führt Query aus, gibt EINE Zeile zurück
const one = (q, p=[]) => { /* ... */ }

// Führt Query aus, gibt ALLE Zeilen zurück
const all = (q, p=[]) => { /* ... */ }

// Führt Query aus ohne Rückgabe (INSERT, UPDATE, DELETE)
const run = (q, p=[]) => { /* ... */ }

// Führt INSERT aus und gibt die neue ID zurück
const runAndGetId = (q, p=[]) => { /* ... */ }

// Speichert Änderungen in Datei
const persist = () => { /* ... */ }
```

**Wichtig:** `runAndGetId()` muss verwendet werden, wenn man nach einem INSERT die ID braucht. Die ID **vor** `persist()` holen, sonst ist sie verloren!

---

## Der Electron Main Process

Die Datei `electron/main.js` ist das Herzstück der Anwendung. Hier passiert die gesamte Backend-Logik.

### Globale Variablen

```javascript
let overlayWin              // Das Overlay-Fenster
let toolWin                 // Das Tool-Fenster (wenn geöffnet)
let interactive = false     // Aktueller Modus
let autoRevertTimer = null  // Timer für Auto-Zurückschalten
let autoTimeoutSec = 8      // Sekunden bis Auto-Zurückschalten
let shortcut = 'Control+Alt+Space'  // Tastenkombination
let theme = { accent: '...', accentInactive: '...' }  // Farben
```

### Fenster-Erstellung

**Overlay-Fenster** (`createOverlayWindow()`):
```javascript
overlayWin = new BrowserWindow({
  width: 230,
  height: 130,
  frame: false,          // Kein Fensterrahmen
  transparent: true,     // Transparenter Hintergrund
  resizable: false,      // Nicht größenveränderbar
  alwaysOnTop: true,     // Immer im Vordergrund
  skipTaskbar: false,    // In Taskbar sichtbar
  autoHideMenuBar: true, // Menüleiste verstecken
  webPreferences: {
    preload: path.join(__dirname, 'preload.cjs'),
    contextIsolation: true,  // Sicherheit
    sandbox: false
  }
})
```

**Tool-Fenster** (`openToolWindow()`):
```javascript
toolWin = new BrowserWindow({
  width: 600,
  height: 420,
  resizable: true,        // Größenveränderbar
  alwaysOnTop: false,     // Nicht immer vorne
  transparent: false,     // Nicht transparent
  frame: true,            // Normaler Fensterrahmen
  backgroundColor: '#181818',
  autoHideMenuBar: true,
  // ... gleiche webPreferences
})
```

### Modi-Umschaltung

**Clickthrough vs. Interaktiv:**

```javascript
const applyInteractState = () => {
  if (!overlayWin) return
  // setIgnoreMouseEvents(true) = Mausklicks gehen durch
  // setIgnoreMouseEvents(false) = Mausklicks werden abgefangen
  overlayWin.setIgnoreMouseEvents(!interactive, { forward: true })

  // Renderer informieren (für visuelle Anpassungen)
  overlayWin.webContents.send('overlay/state', { interactive })

  saveBounds()
}
```

**Auto-Revert-Timer:**

```javascript
const scheduleAutoRevert = () => {
  // Alten Timer löschen
  if (autoRevertTimer) clearTimeout(autoRevertTimer)

  // Neuen Timer starten
  autoRevertTimer = setTimeout(() => {
    interactive = false
    applyInteractState()
  }, autoTimeoutSec * 1000)
}
```

Jedes Mal, wenn der Nutzer etwas im Overlay macht, wird dieser Timer **zurückgesetzt** (via `overlay/userActivity` IPC-Call).

### Globale Shortcuts

```javascript
const registerShortcut = () => {
  // Alle vorherigen Shortcuts entfernen
  globalShortcut.unregisterAll()

  if (!shortcut) return

  // Neuen Shortcut registrieren
  const ok = globalShortcut.register(shortcut, () => toggleInteract())

  if (!ok) {
    console.warn('Konnte Shortcut nicht registrieren:', shortcut)
  }
}
```

Wenn der Nutzer `Strg+Alt+Space` drückt, wird `toggleInteract()` aufgerufen, was `interactive` umschaltet.

### Timer-Management

Timer werden **zweimal** verwaltet:
1. In der Datenbank (Persistenz)
2. Im Speicher (`activeTimers` Map mit `setTimeout` Handles)

**Timer erstellen:**
```javascript
ipcMain.handle('timer/create', (_e, payload) => {
  const totalSeconds = Number(payload?.totalSeconds || 0)
  const name = String(payload?.name || '').trim()

  // In DB speichern
  const created = timersRepo.create({
    name,
    totalSeconds,
    status: 'running'
  })

  // Im Speicher schedulen
  scheduleTimer(created)

  return created
})
```

**Timer ablaufen lassen:**
```javascript
const scheduleTimer = (timer) => {
  const delay = timer.targetAt - Date.now()

  if (delay <= 0) {
    // Timer ist schon abgelaufen -> sofort fertig machen
    finishTimer(timer)
    return
  }

  // setTimeout für den Rest
  const handle = setTimeout(() => {
    finishTimer(timer)
  }, delay)

  activeTimers.set(timer.id, handle)
}
```

**Warum wird das gemacht?**
Wenn die App neu startet, müssen laufende Timer wiederhergestellt werden:

```javascript
const restoreTimers = () => {
  const list = timersRepo.list() || []
  const now = Date.now()

  list.forEach(t => {
    if (t.status === 'running') {
      if (t.targetAt && t.targetAt > now) {
        // Timer läuft noch -> neu schedulen
        scheduleTimer(t)
      } else {
        // Timer ist abgelaufen -> als fertig markieren
        const finished = { ...t, status: 'done' }
        timersRepo.update(finished)
      }
    }
  })
}
```

### Reminder-Scheduling

Ähnlich wie Timer, aber in `electron/scheduler.js`:

```javascript
let tickHandle

export const startScheduler = (onFire) => {
  // Alle 500ms prüfen, ob ein Reminder fällig ist
  tickHandle = setInterval(() => {
    const now = Date.now()
    const list = remindersRepo.list().filter(
      r => r.status === 'scheduled' && r.fire_at <= now
    )

    for (const r of list) {
      remindersRepo.fired(r.id)  // Status in DB ändern
      onFire(r)                  // Callback aufrufen (zeigt Notification)
    }
  }, 500)
}
```

**Warum nicht setTimeout?**
- Bei vielen Reminders wäre das ineffizient
- Ein zentraler Interval ist einfacher zu verwalten

### IPC Handler

**IPC = Inter-Process Communication** - Kommunikation zwischen Main und Renderer.

Alle Handler sind am Ende von `main.js`:

```javascript
// Overlay Modus umschalten
ipcMain.handle('overlay/toggleInteract', () => {
  toggleInteract()
  return { interactive }
})

// Notizen laden
ipcMain.handle('notes/list', () => notesRepo.list())

// Notiz erstellen
ipcMain.handle('notes/create', (_e, n) => notesRepo.create(n))

// Timer erstellen
ipcMain.handle('timer/create', (_e, payload) => { /* ... */ })

// Tool-Fenster öffnen
ipcMain.handle('tools/open', (_e, toolId) => {
  openToolWindow(toolId)
  return true
})
```

**Muster:**
```javascript
ipcMain.handle('channel/name', (event, ...args) => {
  // event = Event-Objekt (meist ungenutzt)
  // args = Parameter vom Renderer

  // Logik ausführen
  const result = doSomething(args)

  // Resultat zurückgeben
  return result
})
```

Im Renderer kann man dann aufrufen:
```javascript
const result = await invoke('channel/name', args)
```

---

## Die Kommunikation zwischen Main und Renderer

### Warum braucht man das?

Der **Renderer Process** (React) hat aus Sicherheitsgründen **keinen direkten Zugriff** auf:
- Das Dateisystem
- Die Datenbank
- Betriebssystem-APIs
- Node.js-Module

Daher muss er über **IPC** (Inter-Process Communication) mit dem Main Process kommunizieren.

### Die drei Schichten

**1. Main Process** (`electron/main.js`)
```javascript
ipcMain.handle('notes/list', () => notesRepo.list())
```

**2. Preload Script** (`electron/preload.cjs`)
```javascript
contextBridge.exposeInMainWorld('focusring', {
  invoke: (channel, payload) => ipcRenderer.invoke(channel, payload),
  // ...
})
```

**3. IPC Wrapper** (`renderer/src/ipc.ts`)
```javascript
export const invoke = async <T = any>(ch: string, payload?: any): Promise<T> => {
  if (hasFR) return window.focusring!.invoke<T>(ch, payload)
  // ...
}
```

**4. React Component** (`renderer/src/tools/Notes.tsx`)
```javascript
const data = await invoke<Note[]>('notes/list')
```

### Preload Script - Die Brücke

`electron/preload.cjs` ist das **einzige Bindeglied** zwischen Main und Renderer.

```javascript
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('focusring', {
  // Für Requests (Renderer → Main)
  invoke: (channel, payload) => ipcRenderer.invoke(channel, payload),

  // Für Events (Main → Renderer)
  onReminder: (cb) =>
    ipcRenderer.on('scheduler/reminderFired', (_event, data) => cb(data)),
  onOverlayState: (cb) =>
    ipcRenderer.on('overlay/state', (_event, state) => cb(state)),
  onTheme: (cb) =>
    ipcRenderer.on('overlay/theme', (_event, theme) => cb(theme)),
  onTimerFired: (cb) =>
    ipcRenderer.on('timer/fired', (_event, timer) => cb(timer))
})
```

**`contextBridge.exposeInMainWorld`**:
- Erstellt ein globales Objekt `window.focusring`
- Sicher, weil nur explizit freigegebene Funktionen verfügbar sind

### Requests vs. Events

**Requests (Renderer fragt Main):**
```javascript
// Renderer
const result = await invoke('notes/list')

// Main
ipcMain.handle('notes/list', () => {
  return notesRepo.list()
})
```
→ Synchrone Frage-Antwort-Kommunikation

**Events (Main sendet an Renderer):**
```javascript
// Main
overlayWin.webContents.send('timer/fired', timer)

// Preload
onTimerFired: (cb) =>
  ipcRenderer.on('timer/fired', (_event, timer) => cb(timer))

// Renderer
useEffect(() => {
  onTimerFired((timer) => {
    console.log('Timer fired:', timer)
  })
}, [])
```
→ Asynchrone Push-Benachrichtigungen

### Die Event-Kette im Detail

**Beispiel: Timer ist abgelaufen**

1. **Main Process** (`electron/main.js:178-193`):
   ```javascript
   setTimeout(() => {
     const finished = { ...timer, status: 'done' }
     timersRepo.update(finished)

     // Event an BEIDE Fenster senden
     if (overlayWin && !overlayWin.isDestroyed()) {
       overlayWin.webContents.send('timer/fired', finished)
     }
     if (toolWin && !toolWin.isDestroyed()) {
       toolWin.webContents.send('timer/fired', finished)
     }
   }, delay)
   ```

2. **Preload** (`electron/preload.cjs:11-12`):
   ```javascript
   onTimerFired: (cb) =>
     ipcRenderer.on('timer/fired', (_event, timer) => cb(timer))
   ```

3. **IPC Wrapper** (`renderer/src/ipc.ts:60-68`):
   ```javascript
   export const onTimerFired = (cb: (d: any) => void): void => {
     if (hasFR) {
       window.focusring!.onTimerFired(cb)
       return
     }
     // ...
   }
   ```

4. **React Component** (`renderer/src/tools/Timer.tsx:38-51`):
   ```javascript
   useEffect(() => {
     onTimerFired((firedTimer: Timer) => {
       setTimers(prev => prev.map(t =>
         t.id === firedTimer.id
           ? { ...t, status: 'done' }
           : t
       ))
     })
   }, [])
   ```

**Wichtig:** Alle 4 Schritte müssen korrekt sein, sonst funktioniert das Event nicht!

---

## Der React Renderer Process

### Einstiegspunkt

**`renderer/index.html`** → **`renderer/src/main.tsx`** → **`renderer/src/App.tsx`**

### main.tsx - Der React-Start

```javascript
import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// ErrorBoundary fängt React-Fehler ab
class ErrorBoundary extends React.Component { /* ... */ }

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)
```

**ErrorBoundary:**
- Verhindert, dass die komplette App abstürzt bei einem Fehler
- Zeigt stattdessen eine Fehler-Nachricht
- Nutzer kann "Neu laden" klicken

### App.tsx - Die Haupt-Komponente

**Zwei Modi:**
1. **Overlay-Modus**: `?tool` ist NICHT in der URL
2. **Tool-Modus**: `?tool=notes` ist in der URL

```javascript
const params = new URLSearchParams(window.location.search)
const initialTool = params.get('tool') as ToolId | null
const isToolWindow = !!initialTool
```

**Wenn Tool-Fenster:**
```javascript
if (isToolWindow) {
  return (
    <div className="no-drag" style={{ /* ... */ }}>
      <div>Titel</div>
      <div className="card">
        {tool === 'notes' && <Notes />}
        {tool === 'timer' && <TimerTool />}
        {tool === 'reminder' && <ReminderTool />}
        {tool === 'settings' && <Settings />}
      </div>
    </div>
  )
}
```

**Wenn Overlay-Fenster:**
```javascript
return (
  <div className="no-drag" onClick={() => invoke('overlay/userActivity')}>
    {/* Drag-Bar oben */}
    <div className={interactive ? 'drag' : 'no-drag'} style={{ /* ... */ }} />

    {/* Halbkreis-Menü */}
    <RadialMenu
      items={items}
      interactive={interactive}
      accentActive={theme.accent}
      accentInactive={theme.accentInactive}
    />
  </div>
)
```

**Wichtige Details:**

1. **Drag-Bar**: Nur im interaktiven Modus kann das Fenster verschoben werden
   ```javascript
   <div className={interactive ? 'drag' : 'no-drag'} />
   ```
   `.drag` hat CSS: `-webkit-app-region: drag`

2. **User Activity**: Jeder Klick im Overlay meldet an Main, dass der Nutzer aktiv ist
   ```javascript
   onClick={() => invoke('overlay/userActivity')}
   ```
   → Setzt Auto-Revert-Timer zurück

3. **Theme Sync**: Theme wird vom Main geladen und live-updates empfangen
   ```javascript
   useEffect(() => {
     invoke<OverlayConfig>('overlay/getConfig')
       .then(cfg => {
         if (cfg?.theme) {
           setTheme(prev => ({ ...prev, ...cfg.theme! }))
         }
       })

     onOverlayTheme(t => {
       if (t) {
         setTheme(prev => ({ ...prev, ...t }))
       }
     })
   }, [])
   ```

### RadialMenu.tsx - Das Halbkreis-Menü

Die Komponente zeichnet:
1. Ein SVG mit einem Halbkreis-Path
2. Buttons auf dem Halbkreis verteilt

**SVG Path:**
```javascript
<path
  d={`M 0 0 L ${2 * r} 0 A ${r} ${r} 0 0 1 0 0 Z`}
  fill={withAlpha(edgeColor, fillBase)}
  stroke={withAlpha(edgeColor, strokeAlpha)}
  strokeWidth={2}
/>
```
- `M 0 0`: Startpunkt oben links
- `L ${2 * r} 0`: Linie nach oben rechts
- `A ${r} ${r} 0 0 1 0 0`: Kreisbogen zurück zu (0,0)
- `Z`: Pfad schließen

**Button-Platzierung:**
```javascript
const angles = items.map((_, i) =>
  startAngle + (i * (endAngle - startAngle)) / (items.length - 1)
)

angles.map((theta, i) => {
  const x = r + r * Math.cos(theta)
  const y = r * Math.sin(theta)

  return (
    <button
      style={{
        position: 'absolute',
        left: x - btnSize / 2,
        top: paddingTop + y - btnSize / 2,
        // ...
      }}
    />
  )
})
```

**Visuelles Feedback:**
- Im Clickthrough-Modus: Halbtransparent, kein Hover
- Im Interaktiv-Modus: Voll sichtbar, Hover-Effekt, anklickbar

---

## Die Tools im Detail

### Notes.tsx - Notizen-Verwaltung

**Layout:**
```
┌─────────────────────────────────────────┐
│ [Neue Notiz]  [Suchen...]               │
│ ┌──────────┐  ┌───────────────────────┐│
│ │  Liste   │  │  Editor               ││
│ │          │  │  [Titel]              ││
│ │ • Note 1 │  │  [Pin] [Löschen]      ││
│ │   Note 2 │  │  ┌─────────────────┐  ││
│ │   Note 3 │  │  │ Content...      │  ││
│ │          │  │  │                 │  ││
│ │          │  │  └─────────────────┘  ││
│ └──────────┘  └───────────────────────┘│
└─────────────────────────────────────────┘
```

**State Management:**
```javascript
const [notes, setNotes] = useState<Note[]>([])     // Alle Notizen
const [selectedId, setSelectedId] = useState<number>()  // Ausgewählte ID
const [filter, setFilter] = useState('')            // Suchfilter
```

**Optimistic Updates:**
Wenn der Nutzer etwas eingibt, wird die Änderung **sofort** im UI angezeigt (optimistisch), noch bevor die Datenbank antwortet.

```javascript
const updateNote = async (partial: Partial<Note>) => {
  const updated: Note = { ...selected, ...partial }

  // ERST lokaler State
  setNotes(prev => prev.map(n => (n.id === updated.id ? updated : n)))

  // DANN Datenbank
  try {
    await invoke('notes/update', updated)
  } catch {
    // Bei Fehler könnte man reloaden
  }
}
```

**Pinning:**
Gepinnte Notizen werden oben angezeigt:
```javascript
const filteredNotes = useMemo(() => {
  return notes
    .slice()
    .sort(
      (a, b) =>
        Number(b.pinned ? 1 : 0) - Number(a.pinned ? 1 : 0) ||
        (b.id || 0) - (a.id || 0)
    )
}, [notes, filter])
```

### Timer.tsx - Countdown-Timer

**State:**
```javascript
const [timers, setTimers] = useState<Timer[]>([])  // Alle Timer
const [name, setName] = useState('')               // Name-Input
const [h, setH] = useState('0')                    // Stunden-Input
const [m, setM] = useState('0')                    // Minuten-Input
const [s, setS] = useState('0')                    // Sekunden-Input
const [now, setNow] = useState(Date.now())         // Aktuelle Zeit
```

**Live-Update der Restzeit:**
```javascript
useEffect(() => {
  const id = setInterval(() => setNow(Date.now()), 500)
  return () => clearInterval(id)
}, [])
```
Alle 500ms wird `now` aktualisiert → `formatRemaining()` rechnet neue Restzeit aus

**Custom Number Inputs:**
Browser-Standard-Pfeile werden entfernt, eigene Buttons hinzugefügt:

```javascript
<div style={{ display: 'flex', flexDirection: 'column' }}>
  {/* ▲ Button */}
  <button onClick={() => setH(String(Math.min(99, parseInt(h) + 1)))}>
    ▲
  </button>

  {/* Input */}
  <input type="number" value={h} onChange={e => setH(e.target.value)} />

  {/* ▼ Button */}
  <button onClick={() => setH(String(Math.max(0, parseInt(h) - 1)))}>
    ▼
  </button>
</div>
```

**Event Listening:**
```javascript
useEffect(() => {
  onTimerFired((firedTimer: Timer) => {
    setTimers(prev => prev.map(t =>
      t.id === firedTimer.id
        ? { ...t, status: 'done' }
        : t
    ))
  })
}, [])
```

Wenn ein Timer abläuft, sendet der Main Process ein Event. Der Timer wird in der Liste automatisch auf "Fertig" gesetzt.

### Reminder.tsx - Erinnerungen

**Ähnlich wie Timer, aber:**
- Statt Dauer: Fixer Zeitpunkt (Datum + Uhrzeit)
- Status: `scheduled`, `fired`, `canceled`

**Zeitpunkt-Berechnung:**
```javascript
const buildFireTimestamp = () => {
  const d = date || today.toISOString().slice(0, 10)  // Datum
  let t = time  // Uhrzeit
  if (!t) {
    // Default: +5 Minuten
    const plus5 = new Date(Date.now() + 5 * 60 * 1000)
    t = `${plus5.getHours()}:${plus5.getMinutes()}`
  }

  const iso = `${d}T${t}:00`
  const ts = new Date(iso).getTime()

  // Validation
  if (!Number.isFinite(ts)) return null
  if (ts <= Date.now()) return null

  return ts
}
```

**Date/Time Inputs:**
```html
<input type="date" value={date} onChange={e => setDate(e.target.value)} />
<input type="time" value={time} onChange={e => setTime(e.target.value)} />
```

Diese Inputs haben Custom-Styling in `index.css` für Dark Mode:
```css
input[type="date"],
input[type="time"] {
  color-scheme: dark;  /* Browser rendert dunkle Variante */
}
```

### Settings.tsx - Einstellungen

**Konfigurierbare Werte:**
1. Auto-Timeout (Sekunden)
2. Shortcut (Tastenkombination)
3. Theme (Farben)

**Shortcut Recorder:**
Ein clever implementierter Keyboard-Recorder:

```javascript
const [recording, setRecording] = useState(false)

const handleShortcutKeyDown = (e: React.KeyboardEvent) => {
  if (!recording) return

  e.preventDefault()

  // Nur Modifier-Keys ignorieren
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
    return
  }

  // Kombination zusammenbauen
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Control')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Command')

  let key = e.key
  if (key === ' ') key = 'Space'
  else if (key.length === 1) key = key.toUpperCase()

  parts.push(key)
  setShortcut(parts.join('+'))
  setRecording(false)
}
```

**Workflow:**
1. User klickt in Input → `recording = true`
2. Input zeigt "Drücke Tastenkombination..."
3. User drückt z.B. `Strg+Shift+X`
4. Code baut String: `Control+Shift+X`
5. `recording = false`, String wird angezeigt

**Theme Picker:**
```javascript
<input
  type="color"
  value={theme.accent}
  onChange={e => setTheme(t => ({ ...t, accent: e.target.value }))}
/>
```

Einfacher HTML5 Color-Picker. Der Wert ist ein Hex-String (`#22c55e`).

**Speichern:**
```javascript
const save = async () => {
  setSaving(true)
  try {
    await invoke('overlay/setAutoTimeout', sec)
    await invoke('overlay/setShortcut', shortcut)
    await invoke('overlay/setTheme', theme)
  } finally {
    setSaving(false)
  }
}
```

Der Main Process:
- Speichert die Werte in der DB
- Wendet sie sofort an (registriert neuen Shortcut, etc.)
- Sendet Theme-Update-Events an alle Fenster

---

## Wichtige Konzepte

### 1. Clickthrough-Technologie

**Problem:** Ein Overlay-Fenster würde normalerweise alle Mausklicks abfangen.

**Lösung:** `setIgnoreMouseEvents(true)`
```javascript
overlayWin.setIgnoreMouseEvents(!interactive, { forward: true })
```

- `true`: Mausklicks gehen durch das Fenster hindurch
- `false`: Fenster fängt Mausklicks ab
- `{ forward: true }`: Klicks werden an darunterliegende Fenster weitergeleitet

**HTML/CSS-Optimierung:**
Ursprünglich war das Overlay 340x220px, aber nur die Mitte war sichtbar. Die transparenten Bereiche haben trotzdem Klicks blockiert im interaktiven Modus.

**Lösung:**
```css
#root {
  display: inline-block;  /* Nur so groß wie Inhalt */
}
```

Fenster auf 250x130px verkleinert → ~67% weniger Fläche → weniger Störung
Zusätzlich `marginRight: 10` im RadialMenu-Container für bessere Zentrierung

### 2. Auto-Revert-Mechanismus

**Warum?** Damit der Nutzer nicht manuell zurückschalten muss.

**Wie?**
```javascript
// Bei jedem Toggle in interaktiv:
scheduleAutoRevert()

// Bei jeder User-Aktivität:
invoke('overlay/userActivity')  // → scheduleAutoRevert()

// Nach X Sekunden ohne Aktivität:
setTimeout(() => {
  interactive = false
  applyInteractState()
}, autoTimeoutSec * 1000)
```

### 3. State-Synchronisation

**Problem:** Zwei Fenster (Overlay + Tool) müssen den gleichen Status zeigen.

**Lösung:** Events vom Main an beide Fenster
```javascript
if (overlayWin && !overlayWin.isDestroyed()) {
  overlayWin.webContents.send('timer/fired', timer)
}
if (toolWin && !toolWin.isDestroyed()) {
  toolWin.webContents.send('timer/fired', timer)
}
```

**React-Seite:** `useEffect` registriert Event-Listener einmalig
```javascript
useEffect(() => {
  onTimerFired(timer => {
    setTimers(prev => /* update */)
  })
}, [])  // ← Leeres Dependency-Array = nur beim Mount
```

### 4. Optimistic Updates

**Prinzip:** UI sofort updaten, Datenbank asynchron im Hintergrund.

**Vorteil:** App fühlt sich sofort responsiv an.

**Risiko:** Bei Fehler ist UI inkonsistent zur DB.

**In FocusRing:** Wird bei Notizen verwendet, weniger kritisch bei Timern/Reminders.

### 5. ErrorBoundary

**Ohne ErrorBoundary:**
React-Fehler → Weißer/Schwarzer Bildschirm → App unbrauchbar

**Mit ErrorBoundary:**
React-Fehler → Fehler-Nachricht → "Neu laden"-Button → App wieder benutzbar

```javascript
class ErrorBoundary extends React.Component {
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return <div>Fehler! <button onClick={reload}>Neu laden</button></div>
    }
    return this.props.children
  }
}
```

### 6. Repository Pattern

**Statt:**
```javascript
db.prepare('select * from notes').step()...
```

**Besser:**
```javascript
notesRepo.list()
```

**Vorteile:**
- Keine SQL-Syntax im Geschäftslogik-Code
- Einfacher zu testen (Mock das Repo)
- Konsistente API
- Zentraler Ort für Datenbank-Queries

### 7. CSS App-Region für Dragging

**Problem:** Transparente, rahmenlose Fenster können nicht verschoben werden.

**Lösung:** CSS-Property `-webkit-app-region: drag`

```css
.drag {
  -webkit-app-region: drag;
}
```

```javascript
<div className={interactive ? 'drag' : 'no-drag'}
     style={{ height: 18, cursor: 'move' }}>
  {/* Dieser Bereich ist zum Greifen */}
</div>
```

**Wichtig:** Alle Buttons/Inputs brauchen `.no-drag`, sonst sind sie nicht klickbar!

---

## Entwicklung und Build

### Development

**Starten:**
```bash
npm run dev
```

**Was passiert:**
1. Vite startet Dev-Server auf Port 5173
2. Electron startet und lädt `http://localhost:5173`
3. Hot-Reload: Änderungen am Code → automatisches Neuladen
4. DevTools sind automatisch offen

**Environment:**
```javascript
if (process.env.VITE_DEV) {
  await overlayWin.loadURL('http://localhost:5173')
  overlayWin.webContents.openDevTools()
}
```

### Production Build

**Build:**
```bash
npm run dist
```

**Schritte:**
1. `vite build`: Renderer-Code wird gebündelt → `dist/renderer/`
2. `electron-builder`: Erstellt Windows-Installer → `dist/FocusRing Setup 0.2.0.exe`

**Build-Konfiguration** (`package.json`):
```json
{
  "build": {
    "appId": "ch.noahwirth.focusring",
    "productName": "FocusRing",
    "win": {
      "target": "nsis",
      "icon": "build/icon.ico"
    },
    "nsis": {
      "oneClick": true,
      "perMachine": false
    }
  }
}
```

**NSIS:**
- Windows-Installer-System
- `oneClick: true`: Kein Setup-Wizard, sofort installieren
- `perMachine: false`: Pro-User-Installation (keine Admin-Rechte nötig)

### Vite-Konfiguration

```javascript
export default {
  plugins: [react()],
  root: 'renderer',                    // Wo liegt der Source?
  build: {
    outDir: '../dist/renderer',        // Wo soll gebaut werden?
    emptyOutDir: true
  }
}
```

**Warum `root: 'renderer'`?**
Vite erwartet normalerweise `index.html` im Projekt-Root. Mit `root: 'renderer'` sucht es dort.

### Debugging

**Main Process:**
- Console.log in `electron/main.js`
- Output erscheint im Terminal, wo `npm run dev` läuft

**Renderer Process:**
- Console.log in React-Komponenten
- Output erscheint in den DevTools (F12)

**IPC Debugging:**
```javascript
// Main
ipcMain.handle('test', (e, data) => {
  console.log('Received:', data)
  return { ok: true }
})

// Renderer
const result = await invoke('test', { foo: 'bar' })
console.log('Result:', result)
```

### Datenbank-Dateipfad

**Entwicklung und Production:**
```javascript
const dbDir = () => path.join(app.getPath('userData'), 'db')
```

`app.getPath('userData')` zeigt auf:
```
C:\Users\[Username]\AppData\Roaming\focusring\
```

Dort liegt `focusring.sqlite`.

**Löschen zum Testen:**
1. App schließen
2. Datei löschen
3. App neu starten → Frische DB

---

## Zusammenfassung: Wie funktioniert alles zusammen?

### Start der App

```
1. User startet FocusRing.exe
   ↓
2. Electron Main Process läuft los (main.js)
   ↓
3. Datenbank wird geladen oder erstellt (db.js)
   ↓
4. Overlay-Fenster wird erstellt
   ↓
5. React-App wird im Fenster geladen (App.tsx)
   ↓
6. RadialMenu wird gerendert
   ↓
7. Globaler Shortcut wird registriert
   ↓
8. Laufende Timer werden wiederhergestellt
   ↓
9. Reminder-Scheduler startet
   ↓
10. App ist bereit!
```

### User öffnet Notizen

```
1. User drückt Strg+Alt+Space
   ↓
2. Overlay wird interaktiv
   ↓
3. User klickt "Notes"-Button
   ↓
4. React ruft auf: invoke('tools/open', 'notes')
   ↓
5. IPC-Call geht zu Main Process
   ↓
6. openToolWindow('notes') erstellt neues Fenster
   ↓
7. Fenster lädt React mit ?tool=notes
   ↓
8. App.tsx erkennt Tool-Modus
   ↓
9. <Notes /> wird gerendert
   ↓
10. Notes.tsx ruft auf: invoke('notes/list')
   ↓
11. IPC geht zu Main → notesRepo.list()
   ↓
12. Daten kommen zurück
   ↓
13. setNotes(data) → React rendert Liste
```

### User erstellt Timer

```
1. User gibt ein: "Mittagspause", 15 Min
   ↓
2. Klickt "Start"
   ↓
3. React: invoke('timer/create', { name: '...', totalSeconds: 900 })
   ↓
4. Main: timersRepo.create(...) → DB-Insert
   ↓
5. Main: scheduleTimer(timer) → setTimeout
   ↓
6. Timer-Objekt kommt zurück
   ↓
7. React: setTimers(prev => [created, ...prev])
   ↓
8. UI zeigt neuen Timer mit Countdown
   ↓
   [15 Minuten später...]
   ↓
9. setTimeout wird ausgelöst
   ↓
10. Main: timersRepo.update({ status: 'done' })
   ↓
11. Main: new Notification(...).show()
   ↓
12. Main: overlayWin.webContents.send('timer/fired', timer)
   ↓
13. Preload: ipcRenderer.on('timer/fired', ...)
   ↓
14. React: onTimerFired callback
   ↓
15. React: setTimers mit status='done'
   ↓
16. UI zeigt "Fertig"
```

### Datenfluss-Diagramm

```
┌──────────────────┐
│   React (UI)     │
│  Timer.tsx       │
└────────┬─────────┘
         │ invoke('timer/create', ...)
         ↓
┌──────────────────┐
│   IPC Bridge     │
│  ipc.ts          │
│  preload.cjs     │
└────────┬─────────┘
         ↓
┌──────────────────┐
│   Main Process   │
│  main.js         │
│  ipcMain.handle  │
└────────┬─────────┘
         │ timersRepo.create(...)
         ↓
┌──────────────────┐
│   Database       │
│  db.js           │
│  SQL INSERT      │
└────────┬─────────┘
         │ return { id, name, ... }
         ↓
         [zurück über IPC]
         ↓
┌──────────────────┐
│   React (UI)     │
│  setTimers(...)  │
└──────────────────┘
```

---

## Häufige Fragen

**Q: Warum Electron und nicht eine Webapp?**
A: Desktop-Apps haben Zugriff auf System-APIs (Notifications, Shortcuts, Overlay-Fenster), die Webapps nicht haben.

**Q: Warum sql.js und nicht eine andere Datenbank?**
A: sql.js ist perfekt für lokale Desktop-Apps - keine Installation nötig, pure JavaScript.

**Q: Warum werden Timer im Speicher UND in der DB gespeichert?**
A: DB = Persistenz (überleben App-Restart), Speicher = setTimeout-Handles (müssen laufen, um Notifications zu triggern).

**Q: Was passiert, wenn die App während eines Timers geschlossen wird?**
A: Beim nächsten Start lädt `restoreTimers()` alle laufenden Timer und schedulet sie neu.

**Q: Warum ist das Overlay transparent?**
A: Um nicht störend zu sein. Es soll sich in den Workflow integrieren, nicht darüber legen.

**Q: Kann man FocusRing auf Mac/Linux nutzen?**
A: Der Code ist theoretisch kompatibel, aber `electron-builder` ist auf Windows konfiguriert. Mit Anpassungen in `package.json` sollte es gehen.

**Q: Wo werden die Einstellungen gespeichert?**
A: In der SQLite-Datenbank in `app_settings` Tabelle als Key-Value-Paare.

**Q: Kann man das Design anpassen?**
A: Ja! In den Settings können Akzentfarben geändert werden. Für tiefere Anpassungen muss man den Code editieren.

---

## Tipps für eigene Änderungen

### Neues Tool hinzufügen

1. Erstelle `renderer/src/tools/MeinTool.tsx`
2. Füge Button in `App.tsx` zum `items`-Array hinzu
3. Füge Render-Logic in `App.tsx` hinzu (Tool-Fenster-Bereich)
4. Erstelle DB-Tabelle in `db.js` (falls nötig)
5. Erstelle Repository in `db.js`
6. Füge IPC-Handler in `main.js` hinzu

### Neue Einstellung hinzufügen

1. In `Settings.tsx`: UI-Element hinzufügen
2. In `Settings.tsx`: State hinzufügen und in `save()` inkludieren
3. In `main.js`: Handler für `overlay/setSomething` hinzufügen
4. In `main.js`: Beim Start Settings laden

### Neues IPC-Event hinzufügen

1. In `main.js`: `ipcMain.handle('channel/name', ...)`
2. In `preload.cjs`: Event in `exposeInMainWorld` hinzufügen (falls Event)
3. In `ipc.ts`: Export-Funktion hinzufügen
4. In React-Komponente: `invoke('channel/name', ...)` oder `onEventName(...)` verwenden

### Styling ändern

**Globale Styles:** `renderer/src/index.css`

**Komponenten-Styles:** Inline in `.tsx`-Dateien (via `style={{ ... }}`)

**Theme-Farben:** Werden aus Settings geladen, sind in `theme`-Objekt verfügbar

---

## Fazit

FocusRing ist eine gut strukturierte Electron-App mit klarer Trennung von Verantwortlichkeiten:

- **Electron Main**: System-Integration, Datenbank, Scheduling
- **React Renderer**: UI, User-Interaktion
- **IPC**: Saubere Kommunikation zwischen beiden

Die Architektur ist erweiterbar und wartbar. Das Repository-Pattern macht Datenbank-Operationen einfach. Die Event-basierte Kommunikation hält die Fenster synchron.

Das Projekt ist ein gutes Beispiel für eine moderne Desktop-App mit modernen Web-Technologien!
