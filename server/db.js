import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbDir = path.join(__dirname, 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'antigravity.db');
const db = new DatabaseSync(dbPath);

// Enable WAL mode & foreign keys for performance and data integrity
db.exec('PRAGMA foreign_keys = ON;');

// 1. Users Table (Strict 6-User Cap: 2 Founders, 4 Employees)
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('founder', 'employee')),
    device_mac_address TEXT NOT NULL,
    is_active INTEGER DEFAULT 1
  );
`);

// 2. Tasks Table
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    assigned_to TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending', 'active', 'review', 'verified')),
    ai_health_score INTEGER DEFAULT 85 CHECK(ai_health_score >= 0 AND ai_health_score <= 100),
    proof_of_work_webhook TEXT,
    checkpoint_timer INTEGER DEFAULT 5400,
    sprint_started_at INTEGER,
    is_acknowledged INTEGER DEFAULT 0,
    brief_content TEXT,
    proof_submission TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// 3. Telemetry Logs Table
db.exec(`
  CREATE TABLE IF NOT EXISTS telemetry_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    task_id TEXT,
    timestamp INTEGER NOT NULL,
    active_window TEXT,
    keystroke_rate REAL DEFAULT 0,
    hardware_spoof_flag INTEGER DEFAULT 0,
    screenshot_url TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// Seed Exact 6 Users if empty
const userCountStmt = db.prepare('SELECT COUNT(*) as count FROM users');
const { count } = userCountStmt.get();

if (count === 0) {
  const insertUser = db.prepare(`
    INSERT INTO users (id, name, role, device_mac_address, is_active)
    VALUES (?, ?, ?, ?, ?)
  `);

  const initialUsers = [
    // 2 Founders (Global Access / God-Mode)
    ['usr_fnd_01', 'Sarah Vance (CEO / Founder)', 'founder', '00:1A:2B:3C:4D:5E', 1],
    ['usr_fnd_02', 'David Chen (CTO / Founder)', 'founder', '00:1A:2B:3C:4D:5F', 1],
    // 4 Employees (Scoped Micro-Sprint Access)
    ['usr_emp_01', 'Alex Mercer (Agentic Eng)', 'employee', 'E4:5F:01:22:98:AA', 1],
    ['usr_emp_02', 'Elena Rostova (Pipeline Eng)', 'employee', 'A2:44:B1:09:67:CC', 1],
    ['usr_emp_03', 'Marcus Brody (Telemetry Systems)', 'employee', 'D6:88:F3:11:00:EE', 1],
    ['usr_emp_04', 'Sophia Lindqvist (Model Ops)', 'employee', 'B0:92:C4:77:31:12', 1]
  ];

  for (const u of initialUsers) {
    insertUser.run(...u);
  }

  // Pre-seed initial tasks for the 4 employees
  const insertTask = db.prepare(`
    INSERT INTO tasks (
      id, assigned_to, title, status, ai_health_score, proof_of_work_webhook,
      checkpoint_timer, sprint_started_at, is_acknowledged, brief_content, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = Date.now();
  const initialTasks = [
    [
      'tsk_001',
      'usr_emp_01',
      'Optimize QBO Transaction Tokenizer Stream',
      'active',
      94,
      'https://api.lexven.internal/v1/pow-hook/tsk_001',
      5400,
      now - 1200000, // started 20 mins ago
      1,
      'Refactor the QuickBooks Online streaming ingestion pipe to handle batched delta syncs. Enforce backpressure handling and ensure telemetry headers are attached to every dispatched worker packet. Verify against rate limit benchmarks.',
      now - 1200000
    ],
    [
      'tsk_002',
      'usr_emp_02',
      'Hardened Micro-Parser for PDF Invoices',
      'active',
      42, // Amber/Red risk score
      'https://api.lexven.internal/v1/pow-hook/tsk_002',
      5400,
      now - 3400000, // started 56 mins ago
      1,
      'Deploy deterministic regex and OCR bounding-box classifier for messy supplier invoice layouts. Current telemetry signals show low keystroke velocity and high idle time in external PDF readers. Pacing at-risk of missing 90m burst.',
      now - 3400000
    ],
    [
      'tsk_003',
      'usr_emp_03',
      'Hardware Anti-Spoofing & Input Entropy Sentinel',
      'pending',
      88,
      'https://api.lexven.internal/v1/pow-hook/tsk_003',
      5400,
      null,
      0, // Not acknowledged yet
      'Implement jitter and entropy calculations on virtual mouse/keyboard input streams to detect macro runners and virtual display simulators. Expose spoof alert flag on telemetry socket payload.',
      now - 600000
    ],
    [
      'tsk_004',
      'usr_emp_04',
      'Vector Memory Cache Warmup for Xero Reconciliation',
      'review',
      78,
      'https://api.lexven.internal/v1/pow-hook/tsk_004',
      5400,
      now - 5000000,
      1,
      'Pre-compute embeddings for historical client chart of accounts. Target p99 lookup latency under 12ms. Proof of work submitted; awaiting Founder sign-off.',
      now - 5000000
    ]
  ];

  for (const t of initialTasks) {
    insertTask.run(...t);
  }

  // Initial Telemetry logs
  const insertLog = db.prepare(`
    INSERT INTO telemetry_logs (id, user_id, task_id, timestamp, active_window, keystroke_rate, hardware_spoof_flag, screenshot_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertLog.run('log_001', 'usr_emp_01', 'tsk_001', now - 30000, 'VS Code - qbo_stream.ts', 48.5, 0, null);
  insertLog.run('log_002', 'usr_emp_02', 'tsk_002', now - 20000, 'Acrobat Reader - invoice_sample.pdf', 8.2, 0, null);
  insertLog.run('log_003', 'usr_emp_03', 'tsk_003', now - 10000, 'Terminal - cargo build --release', 62.1, 0, null);
  insertLog.run('log_004', 'usr_emp_04', 'tsk_004', now - 5000, 'Chrome - PR #302 Xero Memory Index', 24.0, 0, null);
}

export default db;
