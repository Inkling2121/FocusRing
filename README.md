# FocusRing

**Desktop Overlay for Quick Access to Notes, Timers, and Reminders**

[![Version](https://img.shields.io/github/v/release/Inkling2121/FocusRing)](https://github.com/Inkling2121/FocusRing/releases)

## 🎯 About

FocusRing is a desktop overlay application for Windows that provides lightning-fast access to your essential productivity tools. With an elegant radial menu interface and intelligent clickthrough mode, FocusRing stays always accessible without disrupting your workflow.

### ✨ Key Features

- **📝 Quick Notes** - Capture thoughts and ideas instantly without switching windows
- **⏱️ Timers** - Set timers with desktop notifications for better time management
- **🔔 Reminders** - Schedule important tasks and receive timely notifications
- **🎨 Customizable** - Configure themes, keyboard shortcuts, and behavior to your preferences
- **👻 Transparent Overlay** - Clickthrough mode allows uninterrupted work
- **⌨️ Global Shortcuts** - Access from anywhere with `Ctrl+Alt+Space` (customizable)

## 🚀 Installation

### Windows

1. Download the latest version from [Releases](https://github.com/Inkling2121/FocusRing/releases)
2. Run `FocusRing Setup 0.3.5.exe`
3. The application starts automatically after installation
4. Use `Ctrl+Alt+Space` to open the overlay

## 💡 Usage

### Overlay Modes

FocusRing operates in two modes:

- **Clickthrough Mode** (Default): The overlay is visible but mouse clicks pass through
- **Interactive Mode**: Activate with `Ctrl+Alt+Space` for full interaction
- **Auto-Revert**: Automatically returns to clickthrough mode (default: 8 seconds)

### Radial Menu

Press `Ctrl+Alt+Space` to open the radial menu and choose:

- 📝 **Notes** - Create new notes or manage existing ones
- ⏱️ **Timers** - Start and monitor timers
- 🔔 **Reminders** - Schedule and manage reminders
- ⚙️ **Settings** - Customize theme, shortcuts, and behavior
- ❌ **Exit** - Close the application

## 🛠️ Development

### Tech Stack

- **Electron** (v38.6.0) - Desktop framework
- **React** (v18.3.0) - UI rendering
- **TypeScript** (v5.9.3) - Type-safe development
- **Vite** (v7.0.0) - Build tool and dev server
- **SQLite** (sql.js v1.13.0) - Local data storage

### Setup

```bash
# Clone repository
git clone https://github.com/Inkling2121/FocusRing.git
cd FocusRing

# Install dependencies
npm install

# Start development server
npm run dev
