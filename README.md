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

- Node.js (v22.5.0 or higher required for native `node:sqlite` `DatabaseSync`)
- npm

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd inovex-tracker

# Install dependencies
npm install

# Run automated security and API regression tests
npm test
```

### Running Locally

```bash
# Start backend server and Vite frontend concurrently
npm run dev

# Or build and run production server
npm run build:web
npm start
```

1. Open your browser at **http://localhost:5173/** (dev) or **http://localhost:3001/** (production server).
2. The entire platform (Founder Dashboard, Employee Workspace, 90-minute sprints, screen sentinel, and live telemetry) is ready immediately.

---

### Downloading & Installing on Android Sets

You have **two straightforward ways** to install on Android sets:

#### Method 1: Instant PWA Install (Direct from Mobile Browser — No App Store Needed)
1. Make sure your Android device is on the same Wi-Fi network as the server host.
2. When the server starts, it prints your local network IP (e.g., `http://192.168.x.x:5000` or `http://10.x.x.x:5000`).
3. Open **Google Chrome**, **Microsoft Edge**, or **Samsung Internet** on your Android phone and visit that URL.
4. Tap the **"Install on Android"** button in the header (or tap Chrome's `⋮` menu > **"Install app"** / **"Add to Home screen"**).
5. The Inovex Tracker will be downloaded and installed into your Android app drawer with a custom home screen icon, splash screen, and full-screen standalone window (no browser address bar).

#### Method 2: Native Android APK (Capacitor)
If you prefer a standalone `.apk` package:
```bash
# 1. Build and copy assets
npm run build

# 2. Open project in Android Studio
npx cap open android
```
- In Android Studio, click **Build > Build Bundle(s) / APK(s) > Build APK(s)** to generate the `.apk` file for direct installation on any Android set.

## 🌐 Live Vercel Production Deployment

- **Live Production URL**: **[https://dist-omega-rosy-35.vercel.app](https://dist-omega-rosy-35.vercel.app)**
- **Vercel Project**: `ommprasadpanigrahy11-2245s-projects/dist`

---

## ⚡ Supabase Cloud Backend Setup

To connect your own free Supabase cloud instance:

1. Create a project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** in Supabase and run the SQL script in [`supabase/schema.sql`](file:///e:/Inovex%20tracker/supabase/schema.sql). This sets up:
   - Tables: `users`, `tasks`, `telemetry_logs`, `sprint_audits`
   - Realtime Publication: broadcasts telemetry and alerts with sub-second latency
   - Cloud Storage: `sprint-recordings` bucket for full 90-minute employee video audits
   - RLS Policies and Initial Seed Data (Founders & Engineering Nodes)
3. Under **Project Settings > API**, copy your **Project URL** and **anon/public key**.
4. In Vercel Project Settings > **Environment Variables**, add:
   - `VITE_SUPABASE_URL` = `https://your-project.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = `your-anon-key`

---

## 🛠️ Tech Stack

- **Frontend**: React 18, Vite, Lucide Icons, Vanilla CSS (Instrument Serif + Lexven Linen Theme)
- **Deployment**: Vercel Edge Network (Auto-SSL, PWA standalone headers)
- **Cloud Backend**: Supabase (PostgreSQL, Realtime WebSocket Broadcast Channels, Cloud Storage)
- **Local Fallback**: Node.js Express, Built-in SQLite, Native Desktop Agent

## 📄 License

MIT
