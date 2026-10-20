# Inovex Tracker - Standalone Desktop Agent (No Web Browser Required)

This standalone desktop application enables employees to execute and track their 90-minute work sprints **without opening or running any web browser**.

## Key Features

1. **Fixed 90-Minute Sprint Timer (Non-Pausable)**:
   - Starts a strict 90:00 (5,400s) countdown upon initiation.
   - Per company policy, the sprint cannot be paused or cancelled once started.
2. **Native Screen & Activity Telemetry**:
   - Gathers active application window titles and input entropy using native OS APIs.
   - Transmits telemetry packets securely to the Inovex Tracker server.
3. **Automated AI Agent Video Audit Submission**:
   - At the completion of the 90-minute sprint, the screen recording package is transmitted directly to the AI Agent at `POST /api/recordings/upload`.
   - The AI Agent generates an anomaly detection breakdown and delivers the audit report to the Founder Dashboard in real time.

## Quick Start (Windows)

1. Double-click **`start.bat`** or run:
   ```cmd
   node agent.js
   ```
2. Select your employee account (e.g. `1` for Alex Mercer).
3. Review your assigned sprint directive.
4. Press **ENTER** to lock into the 90-minute sprint.

## Quick Fast-Test (15-Second Test Verification)

To test the full recording compilation and AI Agent submission pipeline without waiting 90 minutes:
```cmd
npm run test-sprint
```
This runs a 15-second simulation, generates the recording bundle, uploads to the AI Agent, and logs the real-time verdict received from the Founder Dashboard.
