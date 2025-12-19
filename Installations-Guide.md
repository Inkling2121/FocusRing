# FocusRing - Installations- und Ausführungsanleitung

## 📦 Variante 1: Ausführbare Installation (Empfohlen für Endnutzer)

### Voraussetzungen
- Windows 10 oder höher
- Keine weiteren Abhängigkeiten notwendig

### Installation
1. Datei `FocusRing Setup 0.3.3.exe` herunterladen
2. Setup-Datei ausführen (Doppelklick)
3. Installation erfolgt automatisch in `%LOCALAPPDATA%\Programs\FocusRing`
4. FocusRing wird automatisch gestartet

### Verwendung
- **Overlay umschalten**: `Strg+Alt+Leertaste` (anpassbar in Einstellungen)
- **Tool öffnen**: Auf einen Button im Radialmenü klicken
- **Einstellungen**: Zahnrad-Symbol im Overlay

### Deinstallation
- Windows-Einstellungen → Apps → FocusRing → Deinstallieren

---

## 💻 Variante 2: Entwicklungsumgebung (für Entwickler)

### Voraussetzungen
- **Node.js** v18 oder höher ([Download](https://nodejs.org/))
- **npm** (wird mit Node.js installiert)
- **Git** ([Download](https://git-scm.com/))

### Installation aus Repository

#### 1. Repository klonen oder entpacken
```bash
# Option A: Mit Git klonen
git clone https://github.com/Inkling2121/FocusRing.git
cd FocusRing

# Option B: ZIP-Datei entpacken
# Entpacke FocusRing-v0.3.3-Repository.zip
# Navigiere in den entpackten Ordner
```

#### 2. Abhängigkeiten installieren
```bash
npm install
```

Dies installiert alle erforderlichen Packages:
- `electron` - Desktop-Framework
- `react` & `react-dom` - UI-Framework
- `sql.js` - SQLite-Datenbank
- `vite` - Build-Tool
- `typescript` - Entwicklungssprache

#### 3. Entwicklungsmodus starten
```bash
npm run dev
```

Dies startet:
- Vite Dev-Server auf `http://localhost:5173`
- Electron-App mit Hot-Reload

**Hinweis**: Die App öffnet automatisch mit DevTools für Debugging.

#### 4. Produktions-Build erstellen
```bash
npm run dist
```

Dies erstellt:
- `dist/renderer/` - Kompilierte React-App
- `dist/win-unpacked/` - Entpackte Electron-App (zum Testen)
- `dist/FocusRing Setup X.X.X.exe` - Installer für Endnutzer

---

## 🏗️ Projektstruktur

```
FocusRing/
├── electron/               # Electron Main Process
│   ├── main.js            # Hauptprozess, Fenster-Management
│   ├── db.js              # SQLite-Datenbank, Repositories
│   ├── preload.cjs        # IPC-Bridge (Main ↔ Renderer)
│   └── scheduler.js       # Reminder-Scheduling
│
├── renderer/              # React Renderer Process
│   ├── index.html         # HTML Entry Point
│   └── src/
│       ├── App.tsx        # Haupt-React-Component
│       ├── main.tsx       # React Entry Point
│       ├── ipc.ts         # IPC-Wrapper (TypeScript)
│       ├── components/    # Wiederverwendbare Components
│       │   └── RadialMenu.tsx
│       └── tools/         # Tool-spezifische Components
│           ├── Notes.tsx
│           ├── Timer.tsx
│           ├── Reminder.tsx
│           └── Settings.tsx
│
├── build/                 # Build-Ressourcen
│   └── icon.ico          # App-Icon
│
├── dist/                  # Build-Output (generiert)
│   ├── renderer/         # Kompilierte React-App
│   └── *.exe             # Installer (nach npm run dist)
│
├── package.json           # Projekt-Konfiguration
├── vite.config.ts        # Vite Build-Konfiguration
├── tsconfig.json         # TypeScript-Konfiguration
├── CLAUDE.md             # Projekt-Dokumentation
└── README.md             # Repository-Übersicht
```

---

## 🛠️ Technologie-Stack

### Frontend
- **React 18.3.0** - UI-Framework
- **TypeScript 5.9.3** - Type-Safe Development
- **Vite 7.0.0** - Build-Tool & Dev-Server

### Backend
- **Electron 38.6.0** - Desktop-Framework (Chromium + Node.js)
- **sql.js 1.13.0** - SQLite in JavaScript (WebAssembly)

### Build & Deployment
- **electron-builder 24.6.3** - App-Packaging & Installer-Erstellung
- **NSIS** - Windows Installer-Format

---

## 🔧 Verfügbare npm-Skripte

| Befehl | Beschreibung |
|--------|--------------|
| `npm run dev` | Startet Entwicklungsumgebung (Vite + Electron) |
| `npm run build` | Kompiliert nur Renderer (Vite build) |
| `npm run build:renderer` | Alias für `npm run build` |
| `npm run dist` | Erstellt vollständigen Produktions-Build mit Installer |

---

## 📊 Datenbank-Schema

FocusRing verwendet SQLite mit folgenden Tabellen:

### `app_settings`
```sql
key TEXT PRIMARY KEY
value TEXT
```
Speichert App-Einstellungen (Theme, Shortcuts, Auto-Revert, etc.)

### `windows_state`
```sql
id INTEGER PRIMARY KEY
pos_x INTEGER
pos_y INTEGER
width INTEGER
height INTEGER
overlay_mode TEXT
```
Speichert Overlay-Fenster-Position und -Größe

### `tool_windows`
```sql
tool_id TEXT PRIMARY KEY
pos_x INTEGER
pos_y INTEGER
width INTEGER
height INTEGER
```
Speichert Tool-Fenster-Positionen

### `notes`
```sql
id INTEGER PRIMARY KEY
title TEXT
content TEXT
pinned INTEGER
pos_x INTEGER
pos_y INTEGER
width INTEGER
height INTEGER
updated_at TEXT
```

### `timers`
```sql
id INTEGER PRIMARY KEY
label TEXT
duration_ms INTEGER
remaining_ms INTEGER
state TEXT
paused_at INTEGER
updated_at TEXT
```

### `reminders`
```sql
id INTEGER PRIMARY KEY
message TEXT
fire_at INTEGER
status TEXT
created_at TEXT
```

Datenbank-Speicherort: `%APPDATA%\focusring\db\focusring.sqlite`

---

## 🐛 Troubleshooting

### Problem: App startet nicht nach Installation
**Lösung**:
1. Alte Version deinstallieren
2. `%LOCALAPPDATA%\focusring` Ordner löschen
3. Neu installieren

### Problem: "WASM file not found" Fehler
**Lösung**: Dieser Fehler ist in v0.3.3 behoben. Stelle sicher, dass du die neueste Version verwendest.

### Problem: Overlay reagiert nicht auf Tastenkombination
**Lösung**:
1. Prüfe ob eine andere App die Tastenkombination nutzt
2. Ändere die Tastenkombination in den Einstellungen
3. Starte die App neu

### Problem: Datenbank-Fehler
**Lösung**:
1. App schließen
2. `%APPDATA%\focusring\db\focusring.sqlite` löschen
3. App neu starten (erstellt neue, leere Datenbank)

### Debug-Logs finden
Bei Problemen siehe: `%APPDATA%\focusring\debug.log`

---

## 📝 Entwickler-Hinweise

### Hot Reload
Im Dev-Modus (`npm run dev`) werden Änderungen automatisch übernommen:
- React-Code: Sofortiges Hot-Reload
- Electron Main-Process: Manueller Neustart erforderlich (Strg+R im DevTools)

### IPC-Kommunikation
Die Kommunikation zwischen Main- und Renderer-Process erfolgt über Electron IPC:
1. Handler in `electron/main.js` registrieren (`ipcMain.handle`)
2. Handler in `electron/preload.cjs` exponieren
3. TypeScript-Wrapper in `renderer/src/ipc.ts` erstellen
4. In React-Components verwenden

### Datenbank-Änderungen
Änderungen am Schema in `electron/db.js` → `ensureDb()` Funktion

### Build-Konfiguration
- Electron-Builder: `package.json` → `"build"` Sektion
- Vite: `vite.config.ts`

---

## 📄 Lizenz

MIT License - Siehe LICENSE-Datei

## 👤 Autor

Noah Wirth

## 🔗 Links

- Repository: https://github.com/Inkling2121/FocusRing
- Issues: https://github.com/Inkling2121/FocusRing/issues
- Releases: https://github.com/Inkling2121/FocusRing/releases

---

**Bei Fragen oder Problemen bitte ein Issue auf GitHub öffnen!**
