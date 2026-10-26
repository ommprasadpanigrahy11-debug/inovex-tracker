import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT);
const dataDir = process.env.DATA_DIR || (isServerless ? path.join('/tmp', 'inovex-data') : path.join(__dirname, 'data'));
if (!fs.existsSync(dataDir)) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
  } catch (e) {}
}

const dbPath = process.env.DB_PATH || path.join(dataDir, 'antigravity.db');
if (isServerless && !fs.existsSync(dbPath)) {
  const seedDb = path.join(__dirname, 'data', 'antigravity.db');
  if (fs.existsSync(seedDb)) {
    try {
      fs.copyFileSync(seedDb, dbPath);
    } catch (e) {}
  }
}
const db = new DatabaseSync(dbPath);

export { dataDir, dbPath };

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
    checkpoint_timer INTEGER DEFAULT 1800,
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

// Dynamic column migrations for Employee Sprint & AI Agent Tracking
try { db.exec('ALTER TABLE tasks ADD COLUMN warning_count INTEGER DEFAULT 0;'); } catch (e) {}
try { db.exec('ALTER TABLE tasks ADD COLUMN session_terminated INTEGER DEFAULT 0;'); } catch (e) {}
try { db.exec('ALTER TABLE tasks ADD COLUMN screen_tracking_active INTEGER DEFAULT 0;'); } catch (e) {}
try { db.exec('ALTER TABLE tasks ADD COLUMN termination_reason TEXT;'); } catch (e) {}
try { db.exec('ALTER TABLE tasks ADD COLUMN proof_url TEXT;'); } catch (e) {}
try { db.exec('ALTER TABLE tasks ADD COLUMN payload_notes TEXT;'); } catch (e) {}
try { db.exec('ALTER TABLE tasks ADD COLUMN deadline TEXT;'); } catch (e) {}
try { db.exec('ALTER TABLE tasks ADD COLUMN completed_at INTEGER;'); } catch (e) {}
try { db.exec('ALTER TABLE tasks ADD COLUMN description TEXT;'); } catch (e) {}

// Migrate tasks table to remove restrictive CHECK constraint on status if present
try {
  const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'").get();
  if (tableInfo && tableInfo.sql && tableInfo.sql.includes("CHECK(status IN ('pending', 'active', 'review', 'verified'))")) {
    db.exec(`
      PRAGMA foreign_keys = OFF;
      CREATE TABLE tasks_new (
        id TEXT PRIMARY KEY,
        assigned_to TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        ai_health_score INTEGER DEFAULT 85,
        proof_of_work_webhook TEXT,
        checkpoint_timer INTEGER DEFAULT 1800,
        sprint_started_at INTEGER,
        is_acknowledged INTEGER DEFAULT 0,
        brief_content TEXT,
        proof_submission TEXT,
        created_at INTEGER NOT NULL,
        deadline TEXT,
        completed_at INTEGER,
        description TEXT,
        warning_count INTEGER DEFAULT 0,
        session_terminated INTEGER DEFAULT 0,
        screen_tracking_active INTEGER DEFAULT 0,
        termination_reason TEXT,
        proof_url TEXT,
        payload_notes TEXT,
        FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE CASCADE
      );
      INSERT INTO tasks_new (id, assigned_to, title, status, ai_health_score, proof_of_work_webhook, checkpoint_timer, sprint_started_at, is_acknowledged, brief_content, proof_submission, created_at, deadline, completed_at, description, warning_count, session_terminated, screen_tracking_active, termination_reason, proof_url, payload_notes)
        SELECT id, assigned_to, title, status, ai_health_score, proof_of_work_webhook, checkpoint_timer, sprint_started_at, is_acknowledged, brief_content, proof_submission, created_at, deadline, completed_at, description, COALESCE(warning_count, 0), COALESCE(session_terminated, 0), COALESCE(screen_tracking_active, 0), termination_reason, proof_url, payload_notes FROM tasks;
      DROP TABLE tasks;
      ALTER TABLE tasks_new RENAME TO tasks;
      PRAGMA foreign_keys = ON;
    `);
  }
} catch (e) {
  console.warn('Tasks table migration note:', e?.message || e);
}

// Dynamic column migrations for Users Biometric Passkeys, Password, and Skill Set
try { db.exec('ALTER TABLE users ADD COLUMN biometric_passkey_id TEXT;'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN biometric_enrolled INTEGER DEFAULT 1;'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN email TEXT;'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN password TEXT;'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT;'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN password_salt TEXT;'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN skill_set TEXT;'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN last_seen_at INTEGER;'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN created_at INTEGER DEFAULT 0;'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN avatar_url TEXT;'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN bio TEXT;'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN phone TEXT;'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN timezone TEXT DEFAULT "UTC";'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN language TEXT DEFAULT "en";'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN theme TEXT DEFAULT "dark";'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN time_format TEXT DEFAULT "24h";'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN notification_preferences TEXT;'); } catch (e) {}

// Sessions table for secure token authentication and revocation
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`);

// Helper to hash passwords using node:crypto scrypt
function hashPasswordInternal(password, salt) {
  return crypto.scryptSync(String(password).normalize(), salt, 64).toString('hex');
}

// Ensure default users have passwords, emails, and skill sets with secure hashes
export function syncDefaultUsersWithHashes() {
  try {
    const usersToUpdate = [
      { id: 'usr_fnd_01', name: 'Sarah Vance', pass: '9901', email: 'sarah.vance@lexven.com', skill: 'Executive Director' },
      { id: 'usr_fnd_02', name: 'David Chen', pass: '9901', email: 'david.chen@lexven.com', skill: 'Executive Director' },
      { id: 'usr_emp_01', name: 'Alex Mercer', pass: '1042', email: 'alex.mercer@lexven.com', skill: 'Agentic Eng' },
      { id: 'usr_emp_02', name: 'Elena Rostova', pass: '1042', email: 'elena.rostova@lexven.com', skill: 'Pipeline Eng' },
      { id: 'usr_emp_03', name: 'Marcus Brody', pass: '1042', email: 'marcus.brody@lexven.com', skill: 'Telemetry Systems' },
      { id: 'usr_emp_04', name: 'Sophia Lindqvist', pass: '1042', email: 'sophia.lindqvist@lexven.com', skill: 'Model Ops' }
    ];

    for (const u of usersToUpdate) {
      const existing = db.prepare('SELECT id, password, password_hash, password_salt FROM users WHERE id = ?').get(u.id);
      if (existing) {
        if (!existing.password_hash) {
          const salt = crypto.randomBytes(16).toString('hex');
          const plainToHash = existing.password || u.pass;
          const hash = hashPasswordInternal(plainToHash, salt);
          db.prepare(`
            UPDATE users 
            SET name = ?, password_hash = ?, password_salt = ?, password = NULL, email = COALESCE(email, ?), skill_set = COALESCE(skill_set, ?)
            WHERE id = ?
          `).run(u.name, hash, salt, u.email, u.skill, u.id);
        }
      }
    }

    // Also migrate any user who has a plaintext password but no password_hash
    const allUsersWithPlaintext = db.prepare("SELECT id, password FROM users WHERE password IS NOT NULL AND (password_hash IS NULL OR password_hash = '')").all();
    for (const u of allUsersWithPlaintext) {
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = hashPasswordInternal(u.password, salt);
      db.prepare('UPDATE users SET password_hash = ?, password_salt = ?, password = NULL WHERE id = ?').run(hash, salt, u.id);
    }

    // Ensure all existing user records have a working password hash
    // Founders default to PIN '9901', Employees default to PIN '1042'
    const unhashedUsers = db.prepare("SELECT id, role, password, email FROM users WHERE password_hash IS NULL OR password_hash = ''").all();
    for (const u of unhashedUsers) {
      const defaultPass = u.password || (u.role === 'founder' ? '9901' : '1042');
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = hashPasswordInternal(defaultPass, salt);
      db.prepare("UPDATE users SET password_hash = ?, password_salt = ?, password = NULL WHERE id = ?").run(hash, salt, u.id);
    }
  } catch (e) {
    console.warn('Password migration note:', e?.message || e);
  }
}
syncDefaultUsersWithHashes();

// Canonicalize legacy task statuses ('done' or 'completed' -> 'review')
try {
  db.prepare("UPDATE tasks SET status = 'review' WHERE status IN ('done', 'completed')").run();
} catch (e) {}

// 4. Sprint Audits Table (Stores 30-Min Recordings & AI Agent Anomaly Audits)
db.exec(`
  CREATE TABLE IF NOT EXISTS sprint_audits (
    id TEXT PRIMARY KEY,
    task_id TEXT,
    user_id TEXT NOT NULL,
    employee_name TEXT,
    device_type TEXT DEFAULT 'desktop',
    video_filename TEXT NOT NULL,
    video_url TEXT NOT NULL,
    duration_seconds INTEGER DEFAULT 1800,
    ai_health_score INTEGER DEFAULT 85,
    anomaly_count INTEGER DEFAULT 0,
    anomalies_json TEXT,
    focus_breakdown_json TEXT,
    ai_summary TEXT,
    verdict TEXT DEFAULT 'CLEAN',
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// 5. Cross-Device Biometric Sessions Table (QR Code Mobile <-> Desktop Bridge)
db.exec(`
  CREATE TABLE IF NOT EXISTS biometric_sessions (
    session_id TEXT PRIMARY KEY,
    confirmed INTEGER DEFAULT 0,
    payload_json TEXT,
    created_at INTEGER NOT NULL,
    confirmed_at INTEGER
  );
`);

// 6. Security Bootstrap Table (Enforces persistent, atomic one-time initial founder registration)
// NOTE: Must not cascade on delete so deleting a founder never reopens bootstrap
db.exec(`
  CREATE TABLE IF NOT EXISTS security_bootstrap (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    completed_at INTEGER NOT NULL,
    founder_user_id TEXT NOT NULL
  );
`);

// Migration: Ensure existing security_bootstrap table does not cascade delete when users are deleted
try {
  const sbInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='security_bootstrap'").get();
  if (sbInfo && sbInfo.sql && (sbInfo.sql.includes('ON DELETE CASCADE') || sbInfo.sql.includes('REFERENCES users'))) {
    db.exec(`
      PRAGMA foreign_keys = OFF;
      CREATE TABLE IF NOT EXISTS security_bootstrap_migrated (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        completed_at INTEGER NOT NULL,
        founder_user_id TEXT NOT NULL
      );
      INSERT OR IGNORE INTO security_bootstrap_migrated (id, completed_at, founder_user_id)
      SELECT id, completed_at, founder_user_id FROM security_bootstrap;
      DROP TABLE security_bootstrap;
      ALTER TABLE security_bootstrap_migrated RENAME TO security_bootstrap;
      PRAGMA foreign_keys = ON;
    `);
  }
} catch (e) {
  console.warn('Migration note for security_bootstrap:', e?.message || e);
}

// Mark bootstrap as permanently completed if an active founder already exists in users table
export function syncBootstrapStatus() {
  try {
    const existingFounder = db.prepare("SELECT id, created_at FROM users WHERE role = 'founder' AND is_active = 1 ORDER BY created_at ASC LIMIT 1").get();
    if (existingFounder) {
      db.prepare("INSERT OR IGNORE INTO security_bootstrap (id, completed_at, founder_user_id) VALUES (1, ?, ?)").run(
        existingFounder.created_at || Date.now(),
        existingFounder.id
      );
    }
  } catch (e) {}
}
syncBootstrapStatus();

// Synchronize production users from Supabase or local backup so real accounts are preserved
export function syncSupabaseProductionUsers() {
  try {
    let usersToSync = [];
    const backupPath = path.join(__dirname, '../scratch/production_supabase_users_backup.json');
    if (fs.existsSync(backupPath)) {
      try {
        usersToSync = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
      } catch (e) {}
    }

    if (Array.isArray(usersToSync) && usersToSync.length > 0) {
      const insertOrIgnore = db.prepare(`
        INSERT OR IGNORE INTO users (id, name, role, email, device_mac_address, is_active, created_at, skill_set)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)
      `);
      for (const u of usersToSync) {
        if (!u || !u.id || !u.email) continue;
        const cleanSkill = u.skill_set || (u.role === 'founder' ? 'Executive Director' : 'Engineering Operator');
        insertOrIgnore.run(
          u.id,
          u.name || (u.role === 'founder' ? 'Executive Founder' : 'Engineering Operator'),
          u.role,
          u.email.toLowerCase(),
          u.device_mac_address || '00:00:00:00:00:00',
          u.created_at || Date.now(),
          cleanSkill
        );
      }
    }
  } catch (err) {
    console.warn('[Sync Production Users Note]', err?.message || err);
  }
}
syncSupabaseProductionUsers();

// Demo seeding is strictly opt-in: it never runs in production, and otherwise
// only when SEED_DEMO_DATA=true is set explicitly. This keeps the database a
// clean slate by default so old dummy data is never reintroduced on startup.
export function canSeedDemoData(env = process.env) {
  if (env.NODE_ENV === 'production') return false;
  return env.SEED_DEMO_DATA === 'true';
}

// Automatic Seed if database has zero users - strictly disabled in production
const userCountStmt = db.prepare('SELECT COUNT(*) as count FROM users');
const { count } = userCountStmt.get();

if (count === 0 && canSeedDemoData()) {
  const insertUser = db.prepare(`
    INSERT INTO users (id, name, role, device_mac_address, is_active, biometric_passkey_id, biometric_enrolled)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);

  const initialUsers = [
    // 2 Founders (Global Access / God-Mode)
    ['usr_fnd_01', 'Sarah Vance (CEO / Founder)', 'founder', '00:1A:2B:3C:4D:5E', 1, 'BIO-PK-FOUNDER-1'],
    ['usr_fnd_02', 'David Chen (CTO / Founder)', 'founder', '00:1A:2B:3C:4D:5F', 1, 'BIO-PK-FOUNDER-2'],
    // 4 Employees (Scoped Micro-Sprint Access)
    ['usr_emp_01', 'Alex Mercer (Agentic Eng)', 'employee', 'E4:5F:01:22:98:AA', 1, 'BIO-PK-EMP-01'],
    ['usr_emp_02', 'Elena Rostova (Pipeline Eng)', 'employee', 'A2:44:B1:09:67:CC', 1, 'BIO-PK-EMP-02'],
    ['usr_emp_03', 'Marcus Brody (Telemetry Systems)', 'employee', 'D6:88:F3:11:00:EE', 1, 'BIO-PK-EMP-03'],
    ['usr_emp_04', 'Sophia Lindqvist (Model Ops)', 'employee', 'B0:92:C4:77:31:12', 1, 'BIO-PK-EMP-04']
  ];

  for (const u of initialUsers) {
    insertUser.run(...u);
  }
  syncDefaultUsersWithHashes();

  const now = Date.now();

  // Pre-seed initial tasks for the 4 employees with deadlines
  const insertTask = db.prepare(`
    INSERT INTO tasks (
      id, assigned_to, title, description, brief_content, status, ai_health_score, proof_of_work_webhook,
      checkpoint_timer, sprint_started_at, is_acknowledged, deadline, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const initialTasks = [
    [
      'tsk_001',
      'usr_emp_01',
      'Optimize QBO Transaction Tokenizer Stream',
      'Refactor the QuickBooks Online streaming ingestion pipe to handle batched delta syncs. Enforce backpressure handling and ensure telemetry headers are attached to every dispatched worker packet. Verify against rate limit benchmarks.',
      'Refactor the QuickBooks Online streaming ingestion pipe to handle batched delta syncs. Enforce backpressure handling.',
      'active',
      94,
      'https://api.lexven.internal/v1/pow-hook/tsk_001',
      1800,
      now - 1200000,
      1,
      new Date(now + 4 * 3600 * 1000).toISOString(), // 4 hours deadline
      now - 1200000
    ],
    [
      'tsk_002',
      'usr_emp_02',
      'Hardened Micro-Parser for PDF Invoices',
      'Deploy deterministic regex and OCR bounding-box classifier for messy supplier invoice layouts.',
      'Deploy deterministic regex and OCR bounding-box classifier for messy supplier invoice layouts.',
      'active',
      42,
      'https://api.lexven.internal/v1/pow-hook/tsk_002',
      1800,
      now - 3400000,
      1,
      new Date(now + 2 * 3600 * 1000).toISOString(), // 2 hours deadline
      now - 3400000
    ],
    [
      'tsk_003',
      'usr_emp_03',
      'Hardware Anti-Spoofing & Input Entropy Sentinel',
      'Implement jitter and entropy calculations on virtual mouse/keyboard input streams to detect macro runners.',
      'Implement jitter and entropy calculations on virtual mouse/keyboard input streams to detect macro runners.',
      'pending',
      88,
      'https://api.lexven.internal/v1/pow-hook/tsk_003',
      1800,
      null,
      0,
      new Date(now + 24 * 3600 * 1000).toISOString(), // 24 hours deadline
      now - 600000
    ],
    [
      'tsk_004',
      'usr_emp_04',
      'Vector Memory Cache Warmup for Xero Reconciliation',
      'Pre-compute embeddings for historical client chart of accounts. Target p99 lookup latency under 12ms.',
      'Pre-compute embeddings for historical client chart of accounts. Target p99 lookup latency under 12ms.',
      'done',
      98,
      'https://api.lexven.internal/v1/pow-hook/tsk_004',
      1800,
      now - 5000000,
      1,
      new Date(now - 1000000).toISOString(), // Completed before deadline
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

  // Pre-seed initial 30-minute screen recording AI audit
  const insertAudit = db.prepare(`
    INSERT INTO sprint_audits (
      id, task_id, user_id, employee_name, device_type, video_filename, video_url,
      duration_seconds, ai_health_score, anomaly_count, anomalies_json,
      focus_breakdown_json, ai_summary, verdict, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertAudit.run(
    'aud_init_01',
    'tsk_001',
    'usr_emp_01',
    'Alex Mercer (Agentic Eng)',
    'desktop',
    'sprint_usr_emp_01_30min.webm',
    '/recordings/sprint_usr_emp_01_30min.webm',
    1800,
    94,
    0,
    JSON.stringify([
      { timeOffsetSec: 860, timeFormatted: '14:20', type: 'cadence_analysis', description: 'Sustained keyboard velocity (54 kps) in VS Code editor', severity: 'nominal' },
      { timeOffsetSec: 2160, timeFormatted: '36:00', type: 'environment_check', description: 'Unit test suite execution in terminal without off-task diversion', severity: 'nominal' },
      { timeOffsetSec: 3720, timeFormatted: '62:00', type: 'telemetry_consistency', description: 'Biometric physical presence validated. Zero macro injection anomalies', severity: 'nominal' },
      { timeOffsetSec: 5310, timeFormatted: '88:30', type: 'sprint_completion', description: 'Sprint deliverable packaged and verified by AI Sentinel', severity: 'nominal' }
    ]),
    JSON.stringify({ sprint_work: 88, docs_research: 8, flagged_or_idle: 4 }),
    'AI Agent completed deep neural inspection of the 30-minute screen recording for Alex Mercer. Continuous IDE development detected (88%) with sustained input entropy and zero unauthorized macro injections.',
    'CLEAN_VERIFIED',
    now - 3600000
  );
}

export default db;
