import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, '../dist');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server });

// WebSocket broadcasting helper
function broadcast(eventType, data) {
  const payload = JSON.stringify({ type: eventType, data, timestamp: Date.now() });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'CONNECTED', message: 'Antigravity Telemetry Socket Active', timestamp: Date.now() }));
});

// -------------------------------------------------------------
// 1. AUTHENTICATION & RBAC LAYER
// Total User Cap: exactly 6 accounts. Query role & route.
// -------------------------------------------------------------
app.get('/api/users', (req, res) => {
  try {
    const users = db.prepare('SELECT id, name, role, device_mac_address, is_active FROM users ORDER BY role DESC, id ASC').all();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { userId } = req.body;
  try {
    const user = db.prepare('SELECT id, name, role, device_mac_address, is_active FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found. System is capped at 6 authorized identities.' });
    }

    const route = user.role === 'founder' ? '/admin-dashboard' : '/workspace';
    res.json({
      success: true,
      user,
      route,
      message: `Authenticated as ${user.name} (${user.role.toUpperCase()})`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 2. FOUNDER VIEW: Orchestration Grid & Live Telemetry Feed
// -------------------------------------------------------------
app.get('/api/admin/orchestration-grid', (req, res) => {
  try {
    const users = db.prepare('SELECT * FROM users ORDER BY role DESC, id ASC').all();

    const grid = users.map(user => {
      if (user.role === 'founder') {
        return {
          ...user,
          status: 'admin_active',
          mode: 'God-Mode Overseer',
          access_level: 'GLOBAL_READ_WRITE',
          active_task: null,
          telemetry: {
            active_window: 'Terminal - Multi-Agent Dispatcher',
            keystroke_rate: 0,
            hardware_spoof_flag: 0,
            last_ping: Date.now()
          }
        };
      }

      // For Employees, get current active or pending task and latest telemetry
      const task = db.prepare(`
        SELECT * FROM tasks 
        WHERE assigned_to = ? 
        ORDER BY created_at DESC LIMIT 1
      `).get(user.id);

      const latestLog = db.prepare(`
        SELECT * FROM telemetry_logs 
        WHERE user_id = ? 
        ORDER BY timestamp DESC LIMIT 1
      `).get(user.id);

      return {
        ...user,
        status: user.is_active ? 'online' : 'offline',
        mode: 'Scoped Sprint Worker',
        access_level: 'SCOPED_EMPLOYEE',
        active_task: task || null,
        telemetry: latestLog || {
          active_window: 'Desktop Idle',
          keystroke_rate: 0,
          hardware_spoof_flag: 0,
          timestamp: Date.now()
        }
      };
    });

    res.json(grid);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Live Telemetry Feed stream data
app.get('/api/admin/telemetry-feed', (req, res) => {
  try {
    const logs = db.prepare(`
      SELECT tl.*, u.name as user_name, u.role, t.title as task_title
      FROM telemetry_logs tl
      JOIN users u ON tl.user_id = u.id
      LEFT JOIN tasks t ON tl.task_id = t.id
      ORDER BY tl.timestamp DESC
      LIMIT 25
    `).all();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Predictive Health Matrix Table
app.get('/api/admin/health-matrix', (req, res) => {
  try {
    const matrix = db.prepare(`
      SELECT 
        t.id as task_id,
        t.title,
        t.status,
        t.ai_health_score,
        t.checkpoint_timer,
        t.sprint_started_at,
        t.is_acknowledged,
        u.id as user_id,
        u.name as employee_name,
        u.device_mac_address,
        (SELECT active_window FROM telemetry_logs WHERE user_id = u.id ORDER BY timestamp DESC LIMIT 1) as current_window,
        (SELECT keystroke_rate FROM telemetry_logs WHERE user_id = u.id ORDER BY timestamp DESC LIMIT 1) as current_kps,
        (SELECT hardware_spoof_flag FROM telemetry_logs WHERE user_id = u.id ORDER BY timestamp DESC LIMIT 1) as hardware_spoof_flag
      FROM tasks t
      JOIN users u ON t.assigned_to = u.id
      ORDER BY t.ai_health_score ASC
    `).all();

    const formatted = matrix.map(row => {
      let pacingStatus = 'on_track';
      if (row.hardware_spoof_flag) {
        pacingStatus = 'critical_anomaly';
      } else if (row.ai_health_score < 50) {
        pacingStatus = 'at_risk';
      } else if (row.ai_health_score < 75) {
        pacingStatus = 'cautionary';
      }

      return {
        ...row,
        pacing_status: pacingStatus
      };
    });

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 3. ACTION 1: INITIALIZE AI DISPATCH TERMINAL
// Multi-Agent breakdown & routing to optimal employee
// -------------------------------------------------------------
app.post('/api/tasks/ai-dispatch', (req, res) => {
  const { prompt } = req.body;
  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: 'Raw project specification required.' });
  }

  try {
    // Multi-agent breakdown logic
    // 1. Find optimal employee with lowest active task burden & best telemetry health
    const employeeWorkloads = db.prepare(`
      SELECT u.id, u.name, 
        COUNT(CASE WHEN t.status IN ('pending', 'active') THEN 1 END) as active_count,
        COALESCE(AVG(t.ai_health_score), 90) as avg_health
      FROM users u
      LEFT JOIN tasks t ON u.id = t.assigned_to
      WHERE u.role = 'employee' AND u.is_active = 1
      GROUP BY u.id
      ORDER BY active_count ASC, avg_health DESC
    `).all();

    const targetEmployee = employeeWorkloads[0] || { id: 'usr_emp_01', name: 'Alex Mercer' };

    // 2. Synthesize AI micro-sprint brief from prompt
    const taskId = 'tsk_' + Math.random().toString(36).substring(2, 8);
    const titleSnippet = prompt.split('\n')[0].substring(0, 48) || 'Autonomous Workflow Micro-Sprint';
    const computedHealth = Math.floor(82 + Math.random() * 15); // Initial healthy pacing score

    const briefContent = `[AUTONOMOUS DISPATCH DIRECTIVE]\nTarget: ${titleSnippet}\n\nSPECIFICATION:\n${prompt}\n\nEXECUTION CONSTRAINTS:\n- 90-minute strict checkpoint burst.\n- Real-time telemetry monitoring enabled.\n- GitHub PR or API payload submission required before checkpoint expiry.`;

    const webhookUrl = `https://api.lexven.internal/v1/pow-hook/${taskId}`;

    const insertTask = db.prepare(`
      INSERT INTO tasks (
        id, assigned_to, title, status, ai_health_score, proof_of_work_webhook,
        checkpoint_timer, sprint_started_at, is_acknowledged, brief_content, created_at
      ) VALUES (?, ?, ?, 'pending', ?, ?, 5400, NULL, 0, ?, ?)
    `);

    insertTask.run(taskId, targetEmployee.id, titleSnippet, computedHealth, webhookUrl, briefContent, Date.now());

    const createdTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);

    // Broadcast AI dispatch event to both Founder & Employee
    broadcast('TASK_DISPATCHED', {
      task: createdTask,
      assignedEmployee: targetEmployee,
      message: `AI Dispatch assigned micro-task to ${targetEmployee.name}`
    });

    res.json({
      success: true,
      taskId,
      assignedTo: targetEmployee,
      task: createdTask,
      dispatchLog: [
        'Agent [Analyzer]: Deconstructed project specs into 1 micro-sprint burst.',
        `Agent [Router]: Evaluated employee telemetry matrix. Assigned to ${targetEmployee.name}.`,
        `Agent [Sentinel]: Seeded 90-minute Checkpoint Timer with Webhook: ${webhookUrl}.`,
        'Status: Queued in employee workspace awaiting acceptance acknowledgment.'
      ]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 4. EMPLOYEE VIEW: Scoped Micro-Sprint Workspace
// -------------------------------------------------------------
app.get('/api/workspace/:userId', (req, res) => {
  const { userId } = req.params;
  try {
    const user = db.prepare('SELECT id, name, role, device_mac_address FROM users WHERE id = ?').get(userId);
    if (!user || user.role !== 'employee') {
      return res.status(403).json({ error: 'Access restricted to authorized Employee nodes.' });
    }

    // Get active or latest assigned task
    let task = db.prepare(`
      SELECT * FROM tasks 
      WHERE assigned_to = ? 
      ORDER BY CASE 
        WHEN status = 'active' THEN 1 
        WHEN status = 'pending' THEN 2 
        WHEN status = 'review' THEN 3 
        ELSE 4 END, 
      created_at DESC LIMIT 1
    `).get(userId);

    const latestLog = db.prepare(`
      SELECT * FROM telemetry_logs WHERE user_id = ? ORDER BY timestamp DESC LIMIT 1
    `).get(userId);

    res.json({
      user,
      task: task || null,
      telemetry: latestLog || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Acknowledge Task Brief & Start 90-minute Timer
app.post('/api/workspace/acknowledge', (req, res) => {
  const { taskId, userId } = req.body;
  try {
    const now = Date.now();
    const update = db.prepare(`
      UPDATE tasks 
      SET is_acknowledged = 1, status = 'active', sprint_started_at = ? 
      WHERE id = ? AND assigned_to = ?
    `);
    const result = update.run(now, taskId, userId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Task not found or unauthorized.' });
    }

    const updatedTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);

    broadcast('SPRINT_STARTED', {
      taskId,
      userId,
      sprint_started_at: now,
      message: `Employee acknowledged brief. 90-Minute Checkpoint Timer initialized.`
    });

    res.json({ success: true, task: updatedTask });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Submit Proof of Work
app.post('/api/workspace/submit-pow', (req, res) => {
  const { taskId, userId, proofUrl, payloadText } = req.body;
  try {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND assigned_to = ?').get(taskId, userId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    const proofData = JSON.stringify({
      proofUrl: proofUrl || 'https://github.com/lexven-internal/pr/942',
      payload: payloadText || 'Automated verification payload package',
      submittedAt: Date.now()
    });

    db.prepare(`
      UPDATE tasks 
      SET status = 'review', proof_submission = ?, ai_health_score = 98 
      WHERE id = ?
    `).run(proofData, taskId);

    const updatedTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);

    // Fire simulated Webhook
    broadcast('POW_SUBMITTED', {
      taskId,
      userId,
      task: updatedTask,
      webhookFired: updatedTask.proof_of_work_webhook,
      message: `Proof-of-work received. Triggered automated validation webhook.`
    });

    res.json({
      success: true,
      message: 'Proof-of-work registered and automated webhook fired.',
      task: updatedTask
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ACTION 3: Lock UI when checkpoint timer hits 00:00 without submission
app.post('/api/workspace/lockout', (req, res) => {
  const { taskId, userId } = req.body;
  try {
    db.prepare(`
      UPDATE tasks 
      SET ai_health_score = 15 
      WHERE id = ? AND assigned_to = ? AND status = 'active'
    `).run(taskId, userId);

    broadcast('BURST_TIMEOUT_LOCKOUT', {
      taskId,
      userId,
      message: `CRITICAL: 90-minute Checkpoint Timer expired without submission! Employee UI Locked.`
    });

    res.json({ success: true, locked: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 5. ACTION 2: TELEMETRY STREAM & HARDWARE SPOOF SENTINEL
// -------------------------------------------------------------
app.post('/api/telemetry/log', (req, res) => {
  const { userId, taskId, activeWindow, keystrokeRate, hardwareSpoofFlag, screenshotUrl } = req.body;
  try {
    const logId = 'log_' + Math.random().toString(36).substring(2, 9);
    const now = Date.now();
    const spoofVal = hardwareSpoofFlag ? 1 : 0;

    db.prepare(`
      INSERT INTO telemetry_logs (
        id, user_id, task_id, timestamp, active_window, keystroke_rate, hardware_spoof_flag, screenshot_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(logId, userId, taskId || null, now, activeWindow || 'Terminal', keystrokeRate || 0, spoofVal, screenshotUrl || null);

    const user = db.prepare('SELECT name, device_mac_address FROM users WHERE id = ?').get(userId);

    const logEntry = {
      id: logId,
      user_id: userId,
      user_name: user?.name,
      device_mac_address: user?.device_mac_address,
      task_id: taskId,
      timestamp: now,
      active_window: activeWindow,
      keystroke_rate: keystrokeRate,
      hardware_spoof_flag: spoofVal
    };

    // ACTION 2 CRITICAL DIRECTIVE:
    // If hardware_spoof_flag is true, instantly broadcast urgent alert to Founders
    if (spoofVal === 1) {
      // Degrade task health score
      if (taskId) {
        db.prepare('UPDATE tasks SET ai_health_score = MAX(10, ai_health_score - 40) WHERE id = ?').run(taskId);
      }

      broadcast('HARDWARE_SPOOF_ALERT', {
        severity: 'CRITICAL',
        log: logEntry,
        timestamp: now,
        alertTitle: 'SECURITY SENTINEL: HARDWARE SPOOF DETECTED',
        alertMessage: `Anomalous hardware signature or virtual input driver detected on ${user?.name} (${user?.device_mac_address}). Window: "${activeWindow}".`
      });
    } else {
      // Standard telemetry broadcast
      broadcast('TELEMETRY_UPDATE', logEntry);
    }

    res.json({ success: true, log: logEntry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper route to trigger spoof test easily for demo
app.post('/api/telemetry/simulate-spoof', (req, res) => {
  const { userId, taskId } = req.body;
  const targetId = userId || 'usr_emp_02';
  const targetTask = taskId || 'tsk_002';

  const user = db.prepare('SELECT name, device_mac_address FROM users WHERE id = ?').get(targetId);

  const logId = 'log_spoof_' + Date.now();
  const now = Date.now();

  db.prepare(`
    INSERT INTO telemetry_logs (
      id, user_id, task_id, timestamp, active_window, keystroke_rate, hardware_spoof_flag, screenshot_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(logId, targetId, targetTask, now, 'SpoofDriver.sys (Virtual Macro Injector)', 180.5, 1, null);

  db.prepare('UPDATE tasks SET ai_health_score = 22 WHERE id = ?').run(targetTask);

  const alertPayload = {
    severity: 'CRITICAL',
    log: {
      id: logId,
      user_id: targetId,
      user_name: user?.name,
      device_mac_address: user?.device_mac_address,
      task_id: targetTask,
      timestamp: now,
      active_window: 'SpoofDriver.sys (Virtual Macro Injector)',
      keystroke_rate: 180.5,
      hardware_spoof_flag: 1
    },
    timestamp: now,
    alertTitle: 'SECURITY SENTINEL: HARDWARE SPOOF DETECTED',
    alertMessage: `Simulated spoofing signal intercepted on ${user?.name} (${user?.device_mac_address})! Synthetic input entropy detected.`
  };

  broadcast('HARDWARE_SPOOF_ALERT', alertPayload);
  res.json({ success: true, alert: alertPayload });
});

// Serve frontend assets from dist (Unified Single Host)
app.use(express.static(distPath));

// Fallback to index.html for SPA routes (excluding /api routes)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(distPath, 'index.html'));
});

server.listen(port, () => {
  console.log(`[Antigravity Backend Engine] Online on http://localhost:${port}`);
  console.log(`[WebSocket Server] Listening for real-time telemetry events`);
});
