# Lexven Antigravity Tracker

A telemetry-driven employee operations dashboard and task dispatching platform built with React, Vite, Express, SQLite, and WebSockets.

## ⚡ Features

- **Strict Role-Based Access Control (RBAC)**: Distinct Founder and Employee workspaces with dedicated action sets.
- **Real-Time Telemetry & WebSocket Engine**: Sub-second telemetry updates, live active window monitoring, and keystroke rate statistics.
- **Hardware Spoofing Detection Sentinel**: Instant alert dispatching upon detection of synthetic input or spoofed devices.
- **Autonomous Task Dispatching**: Task lifecycle management with AI health scores and proof-of-work validation.
- **Unified Single-Host Architecture**: Run both the React frontend and Express/WebSocket backend from a single unified port.

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd inovex-tracker

# Install dependencies
npm install
```

### Running Locally

```bash
# Development mode (with live HMR)
npm run dev

# Or start the unified full-stack server
npm run build
npm start
```

Open your browser at **http://localhost:5000/**.

## 🛠️ Tech Stack

- **Frontend**: React 18, Vite, Lucide Icons, Vanilla CSS
- **Backend**: Node.js, Express, WebSocket (`ws`)
- **Database**: Node.js built-in `DatabaseSync` SQLite
- **Network**: Unified reverse proxy and single-host static asset delivery

## 📄 License

MIT
