# FocusRing Project Documentation

## Project Overview

**FocusRing** is a desktop overlay application for Windows that provides quick access to notes, timers, and reminders through a radial menu interface. Built with Electron, React, and TypeScript, it operates as a transparent overlay that can be toggled between clickthrough and interactive modes.

## Architecture

### Technology Stack
- **Electron** (v38.6.0): Desktop application framework
- **React** (v18.3.0): UI rendering
- **TypeScript** (v5.9.3): Type-safe development
- **Vite** (v7.0.0): Build tool and dev server
- **sql.js** (v1.13.0): SQLite database for local storage

### Project Structure

```
Focus-Ring/
├── electron/               # Electron main process
│   ├── main.js            # Main process entry, window management
│   ├── db.js              # Database operations and repositories
│   ├── preload.cjs        # Preload script for IPC bridge
│   └── scheduler.js       # Reminder scheduling logic
├── renderer/              # React application
│   ├── index.html         # HTML entry point
│   └── src/
│       ├── App.tsx        # Main React component
│       ├── main.tsx       # React entry point
│       ├── index.css      # Global styles
│       ├── ipc.ts         # IPC communication helpers
│       ├── components/    # React components
│       ├── shared/        # Shared utilities
│       └── tools/         # Tool-specific components
├── build/                 # Build resources (icons, etc.)
├── dist/                  # Built renderer files
└── package.json           # Project configuration

```

## Key Features

### 1. Overlay System
- **Dual-mode operation**: Clickthrough (transparent) and Interactive modes
- **Global shortcut**: Default `Control+Alt+Space` (configurable)
- **Auto-revert**: Automatically returns to clickthrough mode after configurable timeout (default 8s)
- **Radial menu**: Quick access to tools and features

### 2. Core Functionality
- **Notes**: Create and manage quick notes
- **Timers**: Set and track timers with notifications
- **Reminders**: Schedule reminders with notification support
- **Settings**: Customize theme, shortcuts, and behavior
- **Window management**: Separate overlay and tool windows

### 3. Database
Uses SQLite (via sql.js) with repositories for:
- Notes (`notesRepo`)
- Timers (`timersRepo`)
- Reminders (`remindersRepo`)
- Settings (`settingsRepo`)
- Window state (`windowRepo`)

## Development

### Setup
```bash
npm install
```

### Development Mode
```bash
npm run dev
```
Runs Vite dev server (port 5173) and Electron concurrently with hot reload.

### Building
```bash
npm run build          # Build renderer only
npm run dist           # Build and create distributable
```

### Environment Variables
- `VITE_DEV=1`: Enables development mode in Electron

## Key Files

### Electron Main Process

**electron/main.js** (C:\DEV Dataforce\Focus-Ring\electron\main.js)
- Creates overlay and tool windows
- Manages window states (interactive/clickthrough)
- Handles global shortcuts
- IPC communication handlers
- Timer management
- Theme configuration

**electron/db.js** (C:\DEV Dataforce\Focus-Ring\electron\db.js)
- Database initialization
- Repository pattern for data access
- CRUD operations for notes, timers, reminders, settings

**electron/scheduler.js** (C:\DEV Dataforce\Focus-Ring\electron\scheduler.js)
- Reminder scheduling system
- Notification triggers

### Renderer Process

**renderer/src/App.tsx** (C:\DEV Dataforce\Focus-Ring\renderer\src\App.tsx)
- Main React component
- Radial menu UI
- Tool window management

**renderer/src/ipc.ts** (C:\DEV Dataforce\Focus-Ring\renderer\src\ipc.ts)
- IPC communication wrapper
- Type-safe Electron API access

## Configuration

### Build Configuration
- **App ID**: `ch.noahwirth.focusring`
- **Product Name**: FocusRing
- **Version**: 0.2.0
- **Target**: NSIS installer (Windows)
- **Install Type**: One-click, per-user

### Default Settings
- **Overlay timeout**: 8 seconds
- **Global shortcut**: `Control+Alt+Space`
- **Theme accent**: `#22c55e` (green)
- **Theme accent inactive**: `#16a34a` (darker green)

## IPC Communication

The application uses Electron's IPC for communication between main and renderer processes:
- Window state management
- Database operations
- Timer operations
- Notification triggers
- Settings updates

## Design Patterns

### Repository Pattern
Database operations are encapsulated in repository objects:
- Separation of concerns
- Consistent API across data types
- Easy testing and maintenance

### Window Management
- Overlay window: Always-on-top, transparent, frameless
- Tool window: Separate window for detailed interactions
- State management: Coordinated between windows via IPC

## Building for Distribution

The project uses electron-builder with NSIS for Windows distribution:
- One-click installer
- Per-user installation (no admin rights needed)
- Icon: `build/icon.ico`

## Version History

- **0.2.0**: Current version
- Previous commits show iterative development with German commit messages

## Author

Noah Wirth

## Recent Development History

### Session: December 2025

**1. Menu Bar Removal**
- Added `autoHideMenuBar: true` to both overlay and tool windows in `electron/main.js:64,227`
- Removed unwanted File/Edit/View menu bar from all windows

**2. Reminder Deletion Bug Fix**
- Added `remove()` method to `remindersRepo` in `electron/db.js:110`
- Created `reminder/delete` IPC handler in `electron/main.js:415-418`
- Updated `Reminder.tsx:112-119` to properly delete reminders from database
- Fixed issue where reminders persisted after clicking OK/Abbrechen buttons

**3. Scrollbar Styling**
- Added custom webkit scrollbar styles to `renderer/src/index.css:17-33`
- Replaced default white scrollbars with grey rounded design
- Transparent track with semi-transparent grey thumb
- Hover effect increases opacity

**4. Timer Creation Black Screen Fix**
- Fixed invalid hex color `#ffffffff` → `#ffffff` in `App.tsx:82`
- Added ErrorBoundary component to `main.tsx:6-67` to catch React errors gracefully
- Created `runAndGetId()` function in `electron/db.js:42` to fix ID retrieval issue
- Updated all create methods (timers, notes, reminders) to use `runAndGetId()`
- Root cause: `lastId()` was returning null when called after `persist()`

**5. Timer Status Update Bug Fix**
- Added missing `onTimerFired` handler to `electron/preload.cjs:11-12`
- Updated TypeScript definitions in `renderer/src/ipc.ts:10,59-67`
- Added event listener in `Timer.tsx:38-51` to update timer status in real-time
- Fixed issue where completed timers still showed as running with confirmation dialog
- Backend already sent events; missing preload handler broke the event chain

**6. Design Improvements**
- **Date/Time Inputs** (`renderer/src/index.css:74-92`):
  - Added `color-scheme: dark` for proper dark mode rendering
  - Styled calendar/time picker indicators with inverted colors
  - Added hover effects for better UX
- **Timer Number Inputs** (`Timer.tsx:144-304`):
  - Removed default browser arrows with CSS
  - Created custom ▲/▼ buttons with green accent color
  - Hover effects on buttons
  - Consistent with app theme

**7. Keyboard Shortcut Recorder**
- Implemented in `Settings.tsx:23,47-82,109-125`
- Added recording state to capture keypresses
- Input becomes recording mode on focus
- Captures modifier keys (Control, Alt, Shift, Command) + regular keys
- Formats shortcut string automatically (e.g., "Control+Alt+Space")
- Visual feedback: accent-colored border and text during recording
- Read-only input with pointer cursor for better UX

**8. Overlay Window Size Optimization**
- Reduced overlay window size from 340x220 to 230x130 pixels (`electron/main.js:56-57`)
- Changed HTML/CSS sizing from fixed 100% to `inline-block` (`index.css:1-13`)
- Removed fixed width/height from overlay container (`App.tsx:142-148`)
- Added `marginLeft: 20` to RadialMenu container for proper centering (`App.tsx:168`)
- Result: ~2.9x smaller window footprint (29,900 vs. 74,800 pixels²)
- Fixed issue where transparent HTML elements blocked clicks in interactive mode
- Window now only as large as actual content, minimizing screen space usage

**9. Overlay Width Adjustment**
- Increased overlay window width from 230px to 250px (`electron/main.js:71`)
- Added `marginRight: 10` to RadialMenu container (`App.tsx:164`)
- Fixed issue where right button was slightly cut off
- Better visual balance and button visibility

### Critical Fixes Applied

**Database ID Retrieval Pattern**
```javascript
// WRONG - lastId() returns null after persist()
const id = lastId()

// CORRECT - Get ID before persist()
const runAndGetId = (q, p=[]) => {
  const s=db.prepare(q);
  s.bind(p);
  s.step();
  s.free();
  const id = one('select last_insert_rowid() as id')?.id;
  persist();
  return id
}
```

**IPC Event Chain Requirements**
For events to work from main → renderer:
1. Main process sends event: `win.webContents.send('event/name', data)`
2. Preload exposes handler: `onEventName: (cb) => ipcRenderer.on('event/name', (_e, d) => cb(d))`
3. IPC wrapper exports function: `export const onEventName = (cb) => window.focusring!.onEventName(cb)`
4. Component registers listener: `useEffect(() => { onEventName(handler) }, [])`

## Notes for Claude Code

### When Working on This Project:
1. **Read before modifying**: Always read files before suggesting changes
2. **Maintain consistency**: Follow existing patterns (German comments in some places, English in others)
3. **Database changes**: Use repository pattern in db.js
4. **IPC changes**: Update both main.js handlers and ipc.ts wrappers
5. **Window management**: Consider both overlay and tool windows
6. **Theme support**: Use theme object from settings
7. **Testing**: Test in both development and built modes
8. **Error handling**: ErrorBoundary wraps the app to prevent black screens
9. **Database IDs**: Always use `runAndGetId()` for inserts, never `lastId()` after `persist()`
10. **IPC events**: Ensure complete chain: main → preload → ipc.ts → component

### Common Tasks:
- Adding new tools: Create in `renderer/src/tools/`, add to radial menu
- Database changes: Update repositories in `electron/db.js`
- Settings: Add to settings repository, handle in main.js
- Shortcuts: Update shortcut registration in main.js
- UI changes: Modify React components in `renderer/src/`
- Adding IPC events: Update preload.cjs, ipc.ts, and component
- Styling inputs: Check `index.css` for global input styling patterns

### Known Patterns:
- Mixed language comments (German/English)
- Theme stored as JSON string in settings
- Auto-revert timer resets on user interaction
- Global shortcuts registered per display
- Custom scrollbar styling with webkit
- Custom input controls (date/time pickers, number inputs)
- Keyboard event capture for shortcut recording
- ErrorBoundary prevents white/black screen crashes
- Overlay window uses `inline-block` sizing to minimize footprint
- HTML elements sized to content to avoid blocking clicks in interactive mode
