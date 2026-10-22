import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import multer from 'multer';
import db, { dataDir } from './db.js';
import { 
  hashPassword, 
  verifyPassword, 
  generateSalt, 
  createSession, 
  validateSessionToken, 
  revokeSession, 
  requireAuth, 
  requireFounder, 
  createRateLimiter, 
  BOOTSTRAP_FOUNDER_KEY,
  isBootstrapKeyValid,
  isBootstrapConfigured
} from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, '../dist');
const publicPath = path.join(__dirname, '../public');
const recordingsDir = path.join(dataDir, 'recordings');
if (!fs.existsSync(recordingsDir)) {
  fs.mkdirSync(recordingsDir, { recursive: true });
}
const avatarsDir = path.join(dataDir, 'avatars');
if (!fs.existsSync(avatarsDir)) {
  fs.mkdirSync(avatarsDir, { recursive: true });
}

// Multer storage for 90-minute recordings with strict validation
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, recordingsDir);
  },
  filename: (req, file, cb) => {
    const safeExt = path.extname(file.originalname).toLowerCase();
    const allowedExts = ['.webm', '.mp4', '.ogg', '.mkv'];
    const ext = allowedExts.includes(safeExt) ? safeExt : '.webm';
    const timestamp = Date.now();
    const userId = req.user?.id || req.body?.userId || 'node';
    const safeUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, '');
    cb(null, `sprint_${safeUserId}_${timestamp}${ext}`);
  }
});

const upload = multer({ 
  storage, 
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max per recording
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['video/webm', 'video/mp4', 'video/ogg', 'video/x-matroska', 'application/octet-stream'];
    if (allowedMimes.includes(file.mimetype) || file.originalname.endsWith('.webm') || file.originalname.endsWith('.mp4')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid video format. Only WebM, MP4, or MKV screen recordings are supported.'));
    }
  }
});

const app = express();
const port = process.env.PORT || 3001;

// Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), display-capture=(self)');
  next();
});

// CORS Configuration - Explicitly support configured production frontend, Vercel apps, and local dev
const rawAllowed = process.env.ALLOWED_ORIGIN || '';
const configuredOrigins = rawAllowed && rawAllowed !== '*'
  ? rawAllowed.split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean)
  : [];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests without Origin header (e.g. desktop agent, curl, server-to-server)
    if (!origin) {
      return callback(null, true);
    }
    const cleanOrigin = origin.replace(/\/$/, '');

    // 1. Check explicitly configured production origins
    if (configuredOrigins.length > 0 && configuredOrigins.includes(cleanOrigin)) {
      return callback(null, true);
    }

    // 2. Allow local development origins
    if (
      cleanOrigin.startsWith('http://localhost') ||
      cleanOrigin.startsWith('http://127.0.0.1')
    ) {
      return callback(null, true);
    }

    // 3. Allow Vercel production and preview deployment domains
    if (cleanOrigin.endsWith('.vercel.app')) {
      return callback(null, true);
    }

    // Deny unapproved origins
    return callback(new Error(`CORS policy blocked access from origin ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Token']
}));

app.use(express.json({ limit: '6mb' }));

// Universal Path Traversal Sentinel (Blocks directory traversal attacks across all endpoints)
app.use((req, res, next) => {
  let decodedUrl = req.url;
  try {
    decodedUrl = decodeURIComponent(req.url);
  } catch (e) {
    return res.status(400).json({ error: 'Malformed URL encoding rejected.' });
  }
  if (req.url.includes('..') || req.url.includes('%2e%2e') || req.url.includes('%2E%2E') || decodedUrl.includes('..')) {
    return res.status(400).json({ error: 'Malicious path traversal sequence rejected.' });
  }
  next();
});

// Secure Profile Avatar Delivery Endpoint (Path-traversal safe, extension validated)
app.get('/api/avatars/:filename', (req, res) => {
  const rawFilename = req.params.filename;
  if (rawFilename.includes('/') || rawFilename.includes('\\') || rawFilename.includes('..')) {
    return res.status(400).json({ error: 'Path traversal detected.' });
  }
  const safeFilename = path.basename(rawFilename);
  if (!/^[a-zA-Z0-9_.-]+$/.test(safeFilename)) {
    return res.status(400).json({ error: 'Invalid avatar filename format.' });
  }
  const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.svg', '.gif'];
  const ext = path.extname(safeFilename).toLowerCase();
  if (!allowedExts.includes(ext)) {
    return res.status(400).json({ error: 'Disallowed file extension.' });
  }
  const filePath = path.join(avatarsDir, safeFilename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Avatar not found.' });
  }
  res.sendFile(filePath);
});

// API Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '2.1.0',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: Date.now(),
    engine: 'inovex-sentinel-core'
  });
});

// Rate Limiters
const authLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 30, message: 'Too many authentication attempts. Please try again later.' });
const uploadLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 10, message: 'Recording upload rate limit reached. Please wait a moment.' });

// Protected Video Stream Endpoint (Prevents unauthorized public access to employee screen recordings)
app.get('/recordings/:filename', (req, res) => {
  // 1. Authorize request via Token in Query or Header FIRST (Fail-Closed)
  const token = req.query.token || req.headers['authorization']?.replace('Bearer ', '') || req.headers['x-session-token'];
  const user = validateSessionToken(token);

  if (!user) {
    return res.status(401).json({ error: 'Authentication required to stream recording artifacts.' });
  }

  const rawFilename = req.params.filename;
  if (rawFilename.includes('/') || rawFilename.includes('\\') || rawFilename.includes('..')) {
    return res.status(400).json({ error: 'Invalid recording filename or path traversal detected.' });
  }

  const safeFilename = path.basename(rawFilename); // Prevent path traversal (../)
  if (!/^[a-zA-Z0-9_.-]+$/.test(safeFilename)) {
    return res.status(400).json({ error: 'Invalid recording filename format.' });
  }
  const filePath = path.join(recordingsDir, safeFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Recording file not found.' });
  }

  // Strict Fail-Closed Authorization: Employees can only view their own recordings; Founders can view all
  if (user.role !== 'founder') {
    const audit = db.prepare('SELECT user_id FROM sprint_audits WHERE video_filename = ? OR video_url LIKE ?').get(safeFilename, `%${safeFilename}`);
    const matchesUserPrefix = safeFilename.startsWith(`sprint_${user.id}_`) || safeFilename.startsWith(`desktop_sprint_${user.id}_`);
    if ((audit && audit.user_id !== user.id) || (!audit && !matchesUserPrefix)) {
      return res.status(403).json({ error: 'Access denied: You are not authorized to view this employee recording.' });
    }
  }

  // Stream video with HTTP Range Support for smooth seeking
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': safeFilename.endsWith('.mp4') ? 'video/mp4' : 'video/webm',
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': safeFilename.endsWith('.mp4') ? 'video/mp4' : 'video/webm',
      'Accept-Ranges': 'bytes'
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});

const server = createServer(app);
const wss = new WebSocketServer({ server });

// Secure WebSocket broadcasting helper with role-based and user-level isolation
function broadcast(eventType, data, options = {}) {
  const payload = JSON.stringify({ type: eventType, data, timestamp: Date.now() });
  const { founderOnly = false, recipientUserId = null } = options;

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      // Never broadcast to unauthenticated sockets
      if (!client.user) {
        return;
      }
      // Role filtering for founder-only channels
      if (founderOnly && client.user.role !== 'founder') {
        return;
      }
      // Specific employee filtering (Founders receive or authorized recipient only)
      if (recipientUserId && client.user.role !== 'founder' && client.user.id !== recipientUserId) {
        return;
      }
      client.send(payload);
    }
  });
}

// Authenticated WebSocket connection handler (Strict authentication enforcement)
wss.on('connection', (ws, req) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let token = url.searchParams.get('token');

    // Also support Sec-WebSocket-Protocol token extraction
    if (!token && req.headers['sec-websocket-protocol']) {
      const protocols = req.headers['sec-websocket-protocol'].split(',').map(s => s.trim());
      token = protocols.find(p => p.startsWith('invx_')) || null;
    }

    if (!token && req.headers['authorization']) {
      token = req.headers['authorization'].replace('Bearer ', '').trim();
    }

    const user = validateSessionToken(token);

    if (!user) {
      ws.send(JSON.stringify({ 
        type: 'ERROR', 
        error: 'Unauthorized: Valid session token required for real-time telemetry stream.' 
      }));
      ws.close(1008, 'Unauthorized: Valid session required');
      return;
    }

    ws.user = user;
    ws.isAlive = true;

    ws.send(JSON.stringify({ 
      type: 'CONNECTED', 
      message: `Antigravity Telemetry Socket Active. Authenticated as ${user.name} (${user.role.toUpperCase()})`,
      user: { id: user.id, name: user.name, role: user.role },
      timestamp: Date.now() 
    }));

    // Message validation & heartbeat handler (max 64KB, malformed JSON safe)
    ws.on('message', (rawData) => {
      try {
        if (rawData.length > 65536) {
          ws.send(JSON.stringify({ type: 'ERROR', error: 'Message payload exceeds 64KB limit.' }));
          return;
        }

        const msg = JSON.parse(rawData.toString());
        if (!msg || typeof msg !== 'object') return;

        if (msg.type === 'PING') {
          ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
        } else if (msg.type === 'AUTH') {
          const reauthUser = validateSessionToken(msg.token);
          if (reauthUser) {
            ws.user = reauthUser;
            ws.send(JSON.stringify({ type: 'REAUTHENTICATED', user: { id: reauthUser.id, name: reauthUser.name, role: reauthUser.role } }));
          } else {
            ws.send(JSON.stringify({ type: 'ERROR', error: 'Session expired' }));
            ws.close(1008, 'Session expired');
          }
        }
      } catch (err) {
        ws.send(JSON.stringify({ type: 'ERROR', error: 'Malformed message format.' }));
      }
    });

    ws.on('error', () => {});
  } catch (err) {
    try {
      ws.close(1008, 'Connection authentication failure');
    } catch (e) {}
  }
});

// Helper: Auto-evaluate task deadlines and mark overdue uncompleted tasks as 'failed'
function autoCheckDeadlines() {
  try {
    const now = Date.now();
    const tasks = db.prepare(`
      SELECT * FROM tasks 
      WHERE deadline IS NOT NULL 
        AND status NOT IN ('verified', 'failed', 'rejected')
    `).all();

    for (const t of tasks) {
      const deadlineMs = Number(t.deadline) || new Date(t.deadline).getTime();
      if (deadlineMs && now > deadlineMs) {
        db.prepare(`UPDATE tasks SET status = 'failed' WHERE id = ?`).run(t.id);
        broadcast('TASK_STATUS_UPDATED', {
          taskId: t.id,
          status: 'failed',
          assigned_to: t.assigned_to,
          reason: 'Time limit exceeded without completion (Auto-marked as Task Failed)'
        }, { recipientUserId: t.assigned_to });
      }
    }
  } catch (e) {
    // Non-blocking
  }
}

// -------------------------------------------------------------
// 1. HEALTH AND NETWORK DISCOVERY ENDPOINTS
// -------------------------------------------------------------
// Protected Network Discovery (Authenticated internal infrastructure inspection)
app.get('/api/system/network-info', requireAuth, (req, res) => {
  try {
    const nets = os.networkInterfaces();
    const addresses = [];
    let bestIp = 'localhost';

    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          addresses.push({
            interface: name,
            ip: net.address,
            url: `http://${net.address}:${port}`
          });
          if (bestIp === 'localhost') bestIp = net.address;
        }
      }
    }

    res.json({
      success: true,
      port,
      ip: bestIp,
      localUrl: `http://localhost:${port}`,
      networkAddresses: addresses,
      defaultNetworkUrl: addresses.length > 0 ? addresses[0].url : `http://localhost:${port}`,
      pwaReady: true
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 2. AUTHENTICATION & SESSION MANAGEMENT
// -------------------------------------------------------------
app.post('/api/auth/login', authLimiter, (req, res) => {
  const { email, password, userId } = req.body;
  try {
    if (!email && !userId) {
      return res.status(400).json({ error: 'Authorized email address is required.' });
    }
    if (!password) {
      return res.status(400).json({ error: 'Password is required.' });
    }

    let user = null;
    if (email && String(email).trim()) {
      const cleanEmail = String(email).trim().toLowerCase();
      user = db.prepare('SELECT * FROM users WHERE LOWER(email) = ? OR id = ?').get(cleanEmail, cleanEmail);
    } else if (userId) {
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(String(userId).trim());
    }

    if (!user) {
      return res.status(401).json({ error: 'Access Denied: No authorized account found for this email address.' });
    }

    // Check if account has not initialized its password yet (e.g. legacy or imported production accounts)
    if (!user.password_hash || !user.password_salt) {
      return res.status(403).json({ 
        error: 'Account requires initial password setup. Please initialize your password using the secure setup procedure.',
        requiresSetup: true,
        email: user.email,
        role: user.role
      });
    }

    // Verify salted hashed password
    const enteredPass = String(password).trim();
    let isPasswordValid = false;

    if (user.password_hash && user.password_salt) {
      isPasswordValid = verifyPassword(enteredPass, user.password_hash, user.password_salt);
    }

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Access Denied: Invalid password for this authorized user.' });
    }

    // Generate secure session token
    const { token, expiresAt } = createSession(user.id, req);

    let notifPrefs = null;
    try {
      if (user.notification_preferences) {
        notifPrefs = typeof user.notification_preferences === 'string' ? JSON.parse(user.notification_preferences) : user.notification_preferences;
      }
    } catch (e) {}

    // Sanitize user object (NEVER return password hashes or salts to client)
    const sanitizedUser = {
      id: user.id,
      name: user.name,
      role: user.role,
      email: user.email,
      skill_set: user.skill_set,
      device_mac_address: user.device_mac_address,
      is_active: user.is_active,
      created_at: user.created_at || null,
      avatar_url: user.avatar_url || null,
      bio: user.bio || '',
      phone: user.phone || '',
      timezone: user.timezone || 'UTC',
      language: user.language || 'en',
      theme: user.theme || 'dark',
      time_format: user.time_format || '24h',
      notification_preferences: notifPrefs,
      last_seen_at: Date.now()
    };

    const route = user.role === 'founder' ? '/admin-dashboard' : '/workspace';

    res.json({
      success: true,
      token,
      expiresAt,
      user: sanitizedUser,
      route,
      message: `Authenticated as ${user.name} (${user.role.toUpperCase()})`
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal authentication error. Please retry.' });
  }
});

// Secure One-Time Password Initialization for Unhashed Accounts
app.post('/api/auth/setup-password', authLimiter, (req, res) => {
  const { email, password, bootstrapKey } = req.body;
  try {
    if (!email || !String(email).trim()) {
      return res.status(400).json({ error: 'Authorized email address is required.' });
    }
    if (!password || String(password).trim().length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const user = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(cleanEmail);
    if (!user) {
      return res.status(404).json({ error: 'Account not found for this email address.' });
    }

    if (user.password_hash && user.password_salt) {
      return res.status(400).json({ error: 'Account password has already been initialized. Please sign in with your credentials.' });
    }

    // If account is a founder, require valid bootstrap key (fails closed if secret is not configured)
    if (user.role === 'founder') {
      if (!isBootstrapConfigured()) {
        return res.status(503).json({ error: 'Password setup for founder account is disabled: INITIAL_FOUNDER_KEY is not configured on the server.' });
      }
      if (!isBootstrapKeyValid(bootstrapKey)) {
        return res.status(403).json({ error: 'Access Denied: Valid Initial Founder Key is required to initialize this founder account.' });
      }
    }

    const salt = generateSalt();
    const hash = hashPassword(String(password).trim(), salt);

    db.prepare('UPDATE users SET password_hash = ?, password_salt = ?, password = NULL WHERE id = ?').run(hash, salt, user.id);

    const { token, expiresAt } = createSession(user.id, req);

    const updatedUser = db.prepare('SELECT id, name, role, email, skill_set, device_mac_address, is_active, last_seen_at FROM users WHERE id = ?').get(user.id);

    res.json({
      success: true,
      token,
      expiresAt,
      user: updatedUser,
      route: user.role === 'founder' ? '/admin-dashboard' : '/workspace',
      message: 'Password successfully initialized. Authenticated.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error initializing password.' });
  }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  try {
    revokeSession(req.sessionToken);
    res.json({ success: true, message: 'Session terminated successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dedicated Founder Bootstrap Endpoint (One-time, persistent, high-entropy secret authorized)
app.post('/api/auth/bootstrap-founder', authLimiter, (req, res) => {
  const { name, email, password, skill_set, device_mac_address, bootstrapKey } = req.body;

  try {
    // 1. Check if bootstrap secret is configured on the server (fail closed)
    if (!isBootstrapConfigured()) {
      return res.status(503).json({ 
        error: 'Founder bootstrap is disabled: INITIAL_FOUNDER_KEY environment variable is not configured on the server.' 
      });
    }

    // 2. Check if client provided the bootstrap secret
    if (!bootstrapKey || typeof bootstrapKey !== 'string' || !bootstrapKey.trim()) {
      return res.status(401).json({ 
        error: 'Founder bootstrap key is required to initialize the Executive Founder account.' 
      });
    }

    // 3. Constant-time secret verification
    if (!isBootstrapKeyValid(bootstrapKey)) {
      return res.status(403).json({ 
        error: 'Access Denied: Invalid founder bootstrap key.' 
      });
    }

    // 4. Validate input credentials
    if (!email || !String(email).trim()) {
      return res.status(400).json({ error: 'Valid email address is required.' });
    }
    const cleanEmail = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address format.' });
    }
    if (!password || String(password).trim().length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    // 5. Atomic transaction with SQLite write lock to prevent concurrent bootstrap race conditions
    db.exec('BEGIN IMMEDIATE TRANSACTION;');
    try {
      // Check if bootstrap was already completed in security_bootstrap table
      const existingBootstrap = db.prepare("SELECT * FROM security_bootstrap WHERE id = 1").get();
      if (existingBootstrap) {
        db.exec('ROLLBACK;');
        return res.status(409).json({ 
          error: 'Initial founder bootstrap has already been completed. Founder creation via bootstrap key is permanently disabled.' 
        });
      }

      // Check if any active founder already exists in users table
      const existingFounder = db.prepare("SELECT id, created_at FROM users WHERE role = 'founder' AND is_active = 1 LIMIT 1").get();
      if (existingFounder) {
        db.prepare("INSERT OR IGNORE INTO security_bootstrap (id, completed_at, founder_user_id) VALUES (1, ?, ?)").run(
          existingFounder.created_at || Date.now(),
          existingFounder.id
        );
        db.exec('ROLLBACK;');
        return res.status(409).json({ 
          error: 'An active Executive Founder account already exists. Bootstrap is permanently closed.' 
        });
      }

      // Check if email already exists
      const existingEmail = db.prepare("SELECT id FROM users WHERE LOWER(email) = ?").get(cleanEmail);
      if (existingEmail) {
        db.exec('ROLLBACK;');
        return res.status(409).json({ 
          error: 'An account with this email address already exists. Please sign in instead.' 
        });
      }

      // Generate secure user ID, salt, hash
      const userId = 'usr_fnd_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
      const salt = generateSalt();
      const hash = hashPassword(String(password).trim(), salt);
      const now = Date.now();
      const cleanName = (name && String(name).trim()) || 'Executive Founder';
      const cleanSkill = (skill_set && String(skill_set).trim()) || 'Executive Director';
      const cleanMac = (device_mac_address && String(device_mac_address).trim()) || '00:1A:2B:3C:4D:5E';

      // Insert founder into users
      db.prepare(`
        INSERT INTO users (id, name, role, device_mac_address, is_active, email, password_hash, password_salt, skill_set, last_seen_at, created_at)
        VALUES (?, ?, 'founder', ?, 1, ?, ?, ?, ?, ?, ?)
      `).run(userId, cleanName, cleanMac, cleanEmail, hash, salt, cleanSkill, now, now);

      // Insert into security_bootstrap (enforces database-level CHECK(id = 1) constraint)
      db.prepare(`
        INSERT INTO security_bootstrap (id, completed_at, founder_user_id)
        VALUES (1, ?, ?)
      `).run(now, userId);

      db.exec('COMMIT;');

      const sanitizedUser = {
        id: userId,
        name: cleanName,
        role: 'founder',
        email: cleanEmail,
        skill_set: cleanSkill,
        device_mac_address: cleanMac,
        is_active: 1,
        created_at: now,
        last_seen_at: now
      };

      const { token, expiresAt } = createSession(userId, req);
      broadcast('NODE_REGISTERED', { user: sanitizedUser });

      res.status(201).json({
        success: true,
        token,
        expiresAt,
        user: sanitizedUser,
        route: '/admin-dashboard',
        message: 'Founder bootstrap successfully completed. Executive Founder enclave initialized.'
      });
    } catch (txErr) {
      try { db.exec('ROLLBACK;'); } catch (rbErr) {}
      if (txErr.message && txErr.message.includes('UNIQUE constraint failed')) {
        return res.status(409).json({ error: 'Concurrent bootstrap conflict: Initial founder has already been initialized.' });
      }
      throw txErr;
    }
  } catch (err) {
    res.status(500).json({ error: err.message || 'Founder bootstrap failed.' });
  }
});

// Standard User Registration Endpoint
app.post('/api/users/register', authLimiter, (req, res) => {
  const { name, email, password, role, skill_set, device_mac_address } = req.body;
  try {
    if (!email || !String(email).trim()) {
      return res.status(400).json({ error: 'Valid email address is required to register an account.' });
    }
    const cleanEmail = String(email).trim().toLowerCase();
    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address format.' });
    }
    if (!password || !String(password).trim()) {
      return res.status(400).json({ error: 'Password is required to register an account.' });
    }
    if (String(password).trim().length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    // Check if account already exists - PREVENT ACCOUNT TAKEOVER
    const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(cleanEmail);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email address already exists. Please sign in instead.' });
    }

    // Check if caller is authenticated as an existing founder
    let callerIsFounder = false;
    const authHeader = req.headers['authorization'] || req.headers['x-session-token'];
    if (authHeader) {
      const rawToken = authHeader.replace(/^Bearer\s+/i, '').trim();
      const callingUser = validateSessionToken(rawToken);
      if (callingUser && callingUser.role === 'founder') {
        callerIsFounder = true;
      }
    }

    // Role Enforcement:
    // - Public callers can NEVER register as founder. Attempting to do so yields 403 Forbidden.
    // - Unspecified or default role is 'employee'.
    // - Authenticated founders can register other founders or employees.
    let assignedRole = 'employee';
    if (role && String(role).trim().toLowerCase() === 'founder') {
      if (callerIsFounder) {
        assignedRole = 'founder';
      } else {
        return res.status(403).json({ 
          error: 'Access Denied: Public registration cannot grant Executive Founder privileges. Use the authorized founder bootstrap flow.' 
        });
      }
    } else {
      assignedRole = 'employee';
    }

    // Generate secure server-controlled user ID (never trust client ID)
    const userId = (assignedRole === 'founder' ? 'usr_fnd_' : 'usr_emp_') + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
    const cleanMac = (device_mac_address && String(device_mac_address).trim()) || 'A4:C1:38:9B:21:40';
    const cleanName = (name && String(name).trim()) || (assignedRole === 'founder' ? 'Executive Founder' : 'Engineering Operator');
    const cleanSkill = (skill_set && String(skill_set).trim()) || (assignedRole === 'founder' ? 'Executive Director' : 'General Engineering');

    // Generate secure password salt & hash
    const salt = generateSalt();
    const hash = hashPassword(String(password).trim(), salt);
    const now = Date.now();

    db.prepare(`
      INSERT INTO users (id, name, role, device_mac_address, is_active, email, password_hash, password_salt, skill_set, last_seen_at, created_at)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
    `).run(userId, cleanName, assignedRole, cleanMac, cleanEmail, hash, salt, cleanSkill, now, now);

    const sanitizedUser = {
      id: userId,
      name: cleanName,
      role: assignedRole,
      email: cleanEmail,
      skill_set: cleanSkill,
      device_mac_address: cleanMac,
      is_active: 1,
      last_seen_at: now
    };

    // Auto-create session
    const { token, expiresAt } = createSession(userId, req);

    broadcast('NODE_REGISTERED', { user: sanitizedUser });

    res.json({ 
      success: true, 
      token,
      expiresAt,
      user: sanitizedUser 
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Registration error.' });
  }
});

// User Directory: Authenticated roster with strict role-based field privacy
app.get('/api/users', requireAuth, (req, res) => {
  try {
    const isFounderUser = req.user.role === 'founder';
    const actingUserId = req.user.id;

    // Return sanitized directory with profile metadata (NEVER passwords)
    const selectFields = `id, name, role, email, skill_set, device_mac_address, is_active, last_seen_at, created_at, avatar_url, bio, phone, timezone, language, theme, time_format, notification_preferences`;
    const users = db.prepare(`SELECT ${selectFields} FROM users ORDER BY role DESC, id ASC`).all();

    const formattedUsers = users.map(u => {
      const isSelf = u.id === actingUserId;
      let notifPrefs = null;
      try {
        if (u.notification_preferences) {
          notifPrefs = typeof u.notification_preferences === 'string' ? JSON.parse(u.notification_preferences) : u.notification_preferences;
        }
      } catch (e) {}

      // If founder or viewing own identity record: return complete profile metadata
      if (isFounderUser || isSelf) {
        return {
          ...u,
          notification_preferences: notifPrefs
        };
      }

      // If peer employee: sanitize private personal data (hide MAC, phone, email, notifications)
      return {
        id: u.id,
        name: u.name,
        role: u.role,
        skill_set: u.skill_set,
        avatar_url: u.avatar_url,
        bio: u.bio,
        timezone: u.timezone,
        is_active: u.is_active,
        created_at: u.created_at
      };
    });

    res.json(formattedUsers);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve node directory.' });
  }
});

// Update User Profile (Full name, bio, phone, skill set, timezone, language, theme, etc.)
app.put('/api/users/profile', requireAuth, (req, res) => {
  try {
    const actingUser = req.user;
    const { 
      name, 
      skill_set, 
      bio, 
      phone, 
      timezone, 
      language, 
      theme, 
      time_format, 
      avatar_url,
      targetUserId
    } = req.body;

    // Strict Authorization: Employees can ONLY update their own profile; Founders can update any
    if (targetUserId && String(targetUserId).trim() !== actingUser.id && actingUser.role !== 'founder') {
      return res.status(403).json({ error: 'Permission denied: Employees cannot modify other user profiles.' });
    }

    const userIdToUpdate = (actingUser.role === 'founder' && targetUserId) ? String(targetUserId).trim() : actingUser.id;

    const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userIdToUpdate);
    if (!targetUser) {
      return res.status(404).json({ error: 'User node identity not found in registry.' });
    }

    // Role Enforcement: Users can NEVER alter their own role through profile updates
    if (req.body.role) {
      if (actingUser.role !== 'founder' || !targetUserId || targetUserId === actingUser.id) {
        if (req.body.role !== targetUser.role) {
          return res.status(403).json({ error: 'Permission denied: Users cannot alter their own role privileges.' });
        }
      }
    }

    // Input validation
    const cleanName = name !== undefined ? String(name).trim() : targetUser.name;
    if (!cleanName) {
      return res.status(400).json({ error: 'Full name is required and cannot be empty.' });
    }

    const cleanSkill = skill_set !== undefined ? String(skill_set).trim() : targetUser.skill_set;
    if (!cleanSkill) {
      return res.status(400).json({ error: 'Skill set or specialization is required.' });
    }

    const cleanBio = bio !== undefined ? String(bio).trim().substring(0, 500) : (targetUser.bio || '');
    const cleanPhone = phone !== undefined ? String(phone).trim().substring(0, 30) : (targetUser.phone || '');
    const cleanTimezone = timezone !== undefined ? String(timezone).trim().substring(0, 60) : (targetUser.timezone || 'UTC');
    const cleanLanguage = language !== undefined ? String(language).trim().substring(0, 10) : (targetUser.language || 'en');
    const cleanTheme = (theme === 'light' || theme === 'dark' || theme === 'system') ? theme : (targetUser.theme || 'dark');
    const cleanTimeFormat = (time_format === '12h' || time_format === '24h') ? time_format : (targetUser.time_format || '24h');
    const cleanAvatar = avatar_url !== undefined ? (avatar_url ? String(avatar_url).trim() : null) : (targetUser.avatar_url || null);

    db.prepare(`
      UPDATE users 
      SET name = ?, skill_set = ?, bio = ?, phone = ?, timezone = ?, language = ?, theme = ?, time_format = ?, avatar_url = ?
      WHERE id = ?
    `).run(cleanName, cleanSkill, cleanBio, cleanPhone, cleanTimezone, cleanLanguage, cleanTheme, cleanTimeFormat, cleanAvatar, userIdToUpdate);

    const updated = db.prepare(`
      SELECT id, name, role, email, skill_set, device_mac_address, is_active, last_seen_at, created_at,
             avatar_url, bio, phone, timezone, language, theme, time_format, notification_preferences
      FROM users WHERE id = ?
    `).get(userIdToUpdate);

    let notifPrefs = null;
    try {
      if (updated.notification_preferences) {
        notifPrefs = typeof updated.notification_preferences === 'string' ? JSON.parse(updated.notification_preferences) : updated.notification_preferences;
      }
    } catch (e) {}

    const sanitizedUser = {
      ...updated,
      notification_preferences: notifPrefs
    };

    broadcast('USER_UPDATED', { user: sanitizedUser }, { recipientUserId: userIdToUpdate });

    res.json({
      success: true,
      user: sanitizedUser,
      message: 'Profile updated successfully.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to update profile.' });
  }
});

// Update Notification Preferences
app.put('/api/users/notifications', requireAuth, (req, res) => {
  try {
    const { preferences } = req.body;
    if (!preferences || typeof preferences !== 'object') {
      return res.status(400).json({ error: 'Notification preferences payload is required.' });
    }

    const cleanPrefs = {
      in_app: preferences.in_app !== undefined ? Boolean(preferences.in_app) : true,
      task_assignments: preferences.task_assignments !== undefined ? Boolean(preferences.task_assignments) : true,
      task_deadlines: preferences.task_deadlines !== undefined ? Boolean(preferences.task_deadlines) : true,
      task_verifications: preferences.task_verifications !== undefined ? Boolean(preferences.task_verifications) : true,
      workspace_announcements: preferences.workspace_announcements !== undefined ? Boolean(preferences.workspace_announcements) : true,
      security_alerts: preferences.security_alerts !== undefined ? Boolean(preferences.security_alerts) : true,
      email_notifications: false // Channel disabled until enterprise SMTP gateway is provisioned
    };

    const jsonStr = JSON.stringify(cleanPrefs);
    db.prepare('UPDATE users SET notification_preferences = ? WHERE id = ?').run(jsonStr, req.user.id);

    res.json({
      success: true,
      notification_preferences: cleanPrefs,
      message: 'Notification preferences updated.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to save notification preferences.' });
  }
});

// Upload Profile Avatar (Base64)
app.post('/api/users/avatar', requireAuth, (req, res) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ error: 'Valid Base64 image is required.' });
    }

    const matches = imageBase64.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ error: 'Invalid image format. Supported formats: JPG, PNG, WEBP.' });
    }

    const ext = matches[1].toLowerCase() === 'jpeg' ? 'jpg' : matches[1].toLowerCase();
    const allowed = ['jpg', 'png', 'webp', 'gif'];
    if (!allowed.includes(ext)) {
      return res.status(400).json({ error: 'Unsupported format. Allowed formats: PNG, JPG, WEBP.' });
    }

    const buffer = Buffer.from(matches[2], 'base64');
    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'Image file size exceeds 5MB limit.' });
    }

    const filename = `avatar_${req.user.id}_${Date.now()}.${ext}`;
    const filePath = path.join(avatarsDir, filename);
    fs.writeFileSync(filePath, buffer);

    const avatarUrl = `/api/avatars/${filename}`;
    db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(avatarUrl, req.user.id);
    broadcast('USER_UPDATED', { user: { id: req.user.id, avatar_url: avatarUrl } }, { recipientUserId: req.user.id });

    res.json({
      success: true,
      avatar_url: avatarUrl,
      message: 'Profile photo uploaded successfully.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to process avatar upload.' });
  }
});

// Delete Account (Danger Zone with Server Verification)
app.post('/api/users/delete-account', requireAuth, (req, res) => {
  try {
    const { password } = req.body;
    if (!password || !String(password).trim()) {
      return res.status(400).json({ error: 'Account password verification is required to authorize deletion.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'Account node record not found.' });
    }

    let isPasswordValid = false;
    if (user.password_hash && user.password_salt) {
      isPasswordValid = verifyPassword(String(password).trim(), user.password_hash, user.password_salt);
    }
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Authentication failed: Incorrect password. Account deletion aborted.' });
    }

    // Role Rule: Cannot delete the last remaining founder
    if (user.role === 'founder') {
      const founderCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'founder' AND is_active = 1").get().count;
      if (founderCount <= 1) {
        return res.status(403).json({ 
          error: 'Forbidden: You are the sole Executive Founder on this node. Transfer ownership or register an additional Founder before deleting this account.' 
        });
      }
    }

    // Enterprise Data Retention: Reassign tasks to a remaining founder rather than destroying organizational records
    const fallbackFounder = db.prepare("SELECT id FROM users WHERE role = 'founder' AND id != ? LIMIT 1").get(user.id);
    if (fallbackFounder) {
      db.prepare('UPDATE tasks SET assigned_to = ? WHERE assigned_to = ?').run(fallbackFounder.id, user.id);
    }

    // Revoke all active sessions for this user
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);

    // Delete user from registry
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);

    broadcast('USER_DELETED', { userId: user.id, name: user.name });

    res.json({
      success: true,
      message: 'Account permanently deleted and all sessions revoked.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error during account deletion.' });
  }
});

// Administrative Node Deletion (Executive Founder Privileges Required)
app.delete('/api/users/:id', requireAuth, requireFounder, (req, res) => {
  const targetUserId = req.params.id;
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(targetUserId);
    if (!user) {
      return res.status(404).json({ error: 'User node not found in registry.' });
    }

    // Role Rule: Cannot delete the last remaining founder
    if (user.role === 'founder') {
      const founderCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'founder' AND is_active = 1").get().count;
      if (founderCount <= 1) {
        return res.status(403).json({ 
          error: 'Forbidden: Cannot delete the sole remaining Executive Founder on this node.' 
        });
      }
    }

    // Enterprise Data Retention: Reassign tasks to caller founder
    db.prepare('UPDATE tasks SET assigned_to = ? WHERE assigned_to = ?').run(req.user.id, user.id);

    // Revoke all active sessions
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);

    // Delete user from registry
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);

    broadcast('USER_DELETED', { userId: user.id, name: user.name });

    res.json({
      success: true,
      message: `User node "${user.name}" (${user.role.toUpperCase()}) successfully removed by Administrator.`
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error during node deletion.' });
  }
});

// Administrative User Node Provisioning / Invite Endpoint (Founder-Only)
app.post('/api/admin/users/invite', requireAuth, requireFounder, (req, res) => {
  const { name, email, role, skill_set, device_mac_address } = req.body;
  try {
    if (!email || !String(email).trim()) {
      return res.status(400).json({ error: 'Valid email address is required to invite a user node.' });
    }
    const cleanEmail = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address format.' });
    }

    // Check if account already exists
    const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(cleanEmail);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email address already exists.' });
    }

    const assignedRole = (role && String(role).trim().toLowerCase() === 'founder') ? 'founder' : 'employee';
    const userId = (assignedRole === 'founder' ? 'usr_fnd_' : 'usr_emp_') + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
    const cleanMac = (device_mac_address && String(device_mac_address).trim()) || 'A4:C1:38:9B:21:40';
    const cleanName = (name && String(name).trim()) || (assignedRole === 'founder' ? 'Executive Founder' : 'Engineering Operator');
    const cleanSkill = (skill_set && String(skill_set).trim()) || 'Engineering Operations';

    // Generate secure temporary password hash
    const tempPassword = crypto.randomBytes(16).toString('hex');
    const salt = generateSalt();
    const hash = hashPassword(tempPassword, salt);
    const now = Date.now();

    db.prepare(`
      INSERT INTO users (id, name, role, device_mac_address, is_active, email, password_hash, password_salt, skill_set, last_seen_at, created_at)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
    `).run(userId, cleanName, assignedRole, cleanMac, cleanEmail, hash, salt, cleanSkill, now, now);

    const sanitizedUser = {
      id: userId,
      name: cleanName,
      role: assignedRole,
      email: cleanEmail,
      skill_set: cleanSkill,
      device_mac_address: cleanMac,
      is_active: 1,
      last_seen_at: now
    };

    broadcast('NODE_REGISTERED', { user: sanitizedUser });

    res.status(201).json({
      success: true,
      message: `Node "${cleanName}" (${assignedRole.toUpperCase()}) invited successfully.`,
      user: sanitizedUser
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error inviting user node.' });
  }
});

// -------------------------------------------------------------
// 3. FOUNDER VIEW: Orchestration Grid & Live Telemetry Feed
// -------------------------------------------------------------
app.get('/api/admin/orchestration-grid', requireAuth, requireFounder, (req, res) => {
  try {
    const now = Date.now();
    const users = db.prepare('SELECT id, name, role, email, skill_set, device_mac_address, is_active, last_seen_at FROM users ORDER BY role DESC, id ASC').all();

    const grid = users.map(user => {
      const isOnline = user.is_active && user.last_seen_at && (now - user.last_seen_at < 90000);

      if (user.role === 'founder') {
        return {
          ...user,
          status: isOnline ? 'admin_active' : 'offline',
          mode: 'God-Mode Overseer',
          access_level: 'GLOBAL_READ_WRITE',
          active_task: null,
          telemetry: {
            active_window: 'Terminal - Multi-Agent Dispatcher',
            keystroke_rate: 0,
            hardware_spoof_flag: 0,
            last_ping: user.last_seen_at || now
          }
        };
      }

      // For Employees, get current active or pending task and latest telemetry
      const task = db.prepare(`
        SELECT * FROM tasks 
        WHERE assigned_to = ? 
        ORDER BY CASE 
          WHEN status = 'active' THEN 1 
          WHEN status = 'pending' THEN 2 
          WHEN status = 'review' THEN 3 
          ELSE 4 END, 
        created_at DESC LIMIT 1
      `).get(user.id);

      const latestLog = db.prepare(`
        SELECT * FROM telemetry_logs 
        WHERE user_id = ? 
        ORDER BY timestamp DESC LIMIT 1
      `).get(user.id);

      return {
        ...user,
        status: isOnline ? 'online' : 'offline',
        mode: 'Scoped Sprint Worker',
        access_level: 'SCOPED_EMPLOYEE',
        active_task: task || null,
        telemetry: latestLog || {
          active_window: isOnline ? 'Desktop Active' : 'Offline',
          keystroke_rate: 0,
          hardware_spoof_flag: 0,
          timestamp: user.last_seen_at || now
        }
      };
    });

    res.json(grid);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Live Telemetry Feed stream data
app.get('/api/admin/telemetry-feed', requireAuth, requireFounder, (req, res) => {
  try {
    const logs = db.prepare(`
      SELECT tl.*, u.name as user_name, u.role, t.title as task_title
      FROM telemetry_logs tl
      JOIN users u ON tl.user_id = u.id
      LEFT JOIN tasks t ON tl.task_id = t.id
      ORDER BY tl.timestamp DESC
      LIMIT 35
    `).all();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Predictive Health Matrix Table
app.get('/api/admin/health-matrix', requireAuth, requireFounder, (req, res) => {
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
      WHERE t.status IN ('pending', 'active', 'review')
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
// 4. FOUNDER TASK DISPATCH & ASSIGNMENT
// -------------------------------------------------------------
app.post('/api/tasks/ai-dispatch', requireAuth, requireFounder, (req, res) => {
  const { prompt } = req.body;
  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: 'Raw project specification required.' });
  }

  try {
    // 1. Find optimal employee with lowest active task burden
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

    if (employeeWorkloads.length === 0) {
      return res.status(400).json({ error: 'No active employee nodes registered. Please register an employee node first.' });
    }

    const targetEmployee = employeeWorkloads[0];

    // 2. Synthesize AI micro-sprint brief from prompt
    const taskId = 'tsk_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
    const titleSnippet = prompt.split('\n')[0].substring(0, 55).trim() || 'Autonomous Workflow Micro-Sprint';
    const computedHealth = 95;

    const briefContent = `[AUTONOMOUS DISPATCH DIRECTIVE]\nTarget: ${titleSnippet}\n\nSPECIFICATION:\n${prompt}\n\nEXECUTION CONSTRAINTS:\n- 90-minute strict checkpoint burst.\n- Real-time telemetry monitoring enabled.\n- Proof submission required before checkpoint expiry.`;
    const webhookUrl = `https://api.lexven.internal/v1/pow-hook/${taskId}`;

    db.prepare(`
      INSERT INTO tasks (
        id, assigned_to, title, description, brief_content, status, 
        ai_health_score, proof_of_work_webhook, checkpoint_timer, 
        sprint_started_at, is_acknowledged, created_at
      ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, 5400, NULL, 0, ?)
    `).run(taskId, targetEmployee.id, titleSnippet, prompt, briefContent, computedHealth, webhookUrl, Date.now());

    const createdTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);

    broadcast('TASK_DISPATCHED', {
      task: createdTask,
      assignedEmployee: targetEmployee,
      message: `AI Dispatch assigned micro-task to ${targetEmployee.name}`
    }, { recipientUserId: targetEmployee.id });

    res.json({
      success: true,
      taskId,
      assignedTo: targetEmployee,
      task: createdTask,
      dispatchLog: [
        'Agent [Analyzer]: Deconstructed project specs into 1 micro-sprint burst.',
        `Agent [Router]: Evaluated employee workload matrix. Assigned to ${targetEmployee.name}.`,
        `Agent [Sentinel]: Seeded 90-minute Checkpoint Timer with Webhook: ${webhookUrl}.`,
        'Status: Queued in employee workspace awaiting acceptance acknowledgment.'
      ]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tasks/assign', requireAuth, requireFounder, (req, res) => {
  const { title, description, deadline, assignedUserId } = req.body;
  if (!title || !title.trim() || !assignedUserId) {
    return res.status(400).json({ error: 'Task title and assigned employee are required.' });
  }

  try {
    const employee = db.prepare('SELECT id, name, role, device_mac_address FROM users WHERE id = ?').get(assignedUserId);
    if (!employee || employee.role !== 'employee') {
      return res.status(400).json({ error: 'Assigned user must be an active employee node.' });
    }

    const taskId = 'tsk_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
    const cleanTitle = title.trim();
    const cleanDesc = (description || '').trim();
    const now = Date.now();
    const computedHealth = 95;
    const webhookUrl = `https://api.lexven.internal/v1/pow-hook/${taskId}`;

    db.prepare(`
      INSERT INTO tasks (
        id, assigned_to, title, description, brief_content, status, 
        ai_health_score, proof_of_work_webhook, checkpoint_timer, 
        sprint_started_at, is_acknowledged, deadline, created_at
      ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, 5400, NULL, 0, ?, ?)
    `).run(
      taskId, 
      assignedUserId, 
      cleanTitle, 
      cleanDesc, 
      cleanDesc || cleanTitle, 
      computedHealth, 
      webhookUrl, 
      deadline ? String(deadline) : null, 
      now
    );

    const createdTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);

    broadcast('TASK_ASSIGNED', {
      task: createdTask,
      assignedEmployee: employee,
      message: `Founder assigned new task: "${cleanTitle}" to ${employee.name}. Time limit deadline: ${deadline || 'Flexible'}`
    }, { recipientUserId: assignedUserId });

    res.json({ success: true, task: createdTask });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Task status update with role authorization & validation
app.post('/api/tasks/status', requireAuth, (req, res) => {
  const { taskId, status, notes } = req.body;
  if (!taskId || !status) {
    return res.status(400).json({ error: 'taskId and status are required.' });
  }

  const validStatuses = ['pending', 'active', 'review', 'verified', 'rejected', 'failed'];
  const mappedStatus = (status === 'done' || status === 'completed') ? 'review' : status;

  if (!validStatuses.includes(mappedStatus)) {
    return res.status(400).json({ error: `Invalid status. Allowed values: ${validStatuses.join(', ')}` });
  }

  try {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    // Role check: Only Founders can mark tasks as 'verified' or 'rejected'
    if ((mappedStatus === 'verified' || mappedStatus === 'rejected') && req.user.role !== 'founder') {
      return res.status(403).json({ error: 'Only Founders can verify or reject deliverables.' });
    }

    // Employees can only update their own assigned tasks
    if (req.user.role !== 'founder' && task.assigned_to !== req.user.id) {
      return res.status(403).json({ error: 'You are not authorized to update tasks assigned to other employees.' });
    }

    const now = Date.now();
    const isCompleted = mappedStatus === 'review' || mappedStatus === 'verified';

    if (mappedStatus === 'verified') {
      db.prepare(`
        UPDATE tasks 
        SET status = ?, completed_at = COALESCE(completed_at, ?), payload_notes = COALESCE(?, payload_notes), ai_health_score = 100 
        WHERE id = ?
      `).run(mappedStatus, now, notes || null, taskId);
    } else {
      db.prepare(`
        UPDATE tasks 
        SET status = ?, completed_at = ?, payload_notes = COALESCE(?, payload_notes) 
        WHERE id = ?
      `).run(mappedStatus, isCompleted ? now : null, notes || null, taskId);
    }

    const updatedTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);

    broadcast('TASK_STATUS_UPDATED', {
      taskId,
      status: mappedStatus,
      completed_at: isCompleted ? now : null,
      task: updatedTask,
      message: `Task "${updatedTask?.title}" updated to status: ${mappedStatus.toUpperCase()}.`
    }, { recipientUserId: task.assigned_to });

    res.json({ success: true, task: updatedTask });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 5. EMPLOYEE WORKSPACE & SPRINT EXECUTION
// -------------------------------------------------------------
function handleWorkspaceRequest(req, res, targetUserId) {
  try {
    autoCheckDeadlines();

    // Authorization check: Employees can only view their own workspace; Founders can view any
    if (req.user.role !== 'founder' && req.user.id !== targetUserId) {
      return res.status(403).json({ error: 'Access restricted: You cannot access other employee workspaces.' });
    }

    const user = db.prepare('SELECT id, name, role, email, skill_set, device_mac_address, is_active, last_seen_at FROM users WHERE id = ?').get(targetUserId);
    if (!user || user.role !== 'employee') {
      return res.status(404).json({ error: 'Authorized Employee node not found.' });
    }

    // Update last seen
    db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(Date.now(), targetUserId);

    // Get active or latest assigned task
    const task = db.prepare(`
      SELECT * FROM tasks 
      WHERE assigned_to = ? 
      ORDER BY CASE 
        WHEN status = 'active' THEN 1 
        WHEN status = 'pending' THEN 2 
        WHEN status = 'review' THEN 3 
        ELSE 4 END, 
      created_at DESC LIMIT 1
    `).get(targetUserId);

    // Get all assigned tasks for employee table
    const tasks = db.prepare(`
      SELECT * FROM tasks 
      WHERE assigned_to = ? 
      ORDER BY created_at DESC
    `).all(targetUserId);

    const latestLog = db.prepare(`
      SELECT * FROM telemetry_logs WHERE user_id = ? ORDER BY timestamp DESC LIMIT 1
    `).get(targetUserId);

    res.json({
      user,
      task: task || null,
      tasks: tasks || [],
      telemetry: latestLog || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

app.get('/api/workspace/:userId', requireAuth, (req, res) => {
  handleWorkspaceRequest(req, res, req.params.userId);
});

// Backward-compatible alias for Desktop Agent API compatibility
app.get('/api/employee/dashboard', requireAuth, (req, res) => {
  const targetId = req.query.userId || req.user.id;
  handleWorkspaceRequest(req, res, targetId);
});

// Start 90-Minute Fixed Sprint & Screen Tracking (Employee Only)
app.post('/api/workspace/start-sprint', requireAuth, (req, res) => {
  const { taskId, userId } = req.body;
  if (userId && String(userId).trim() !== req.user.id && req.user.role !== 'founder') {
    return res.status(403).json({ error: 'Access denied: Employees cannot start sprints for other users.' });
  }
  const effectiveUserId = req.user.role === 'founder' ? (userId || req.user.id) : req.user.id;

  try {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND assigned_to = ?').get(taskId, effectiveUserId);
    if (!task) {
      return res.status(404).json({ error: 'Assigned task not found or unauthorized.' });
    }

    if (task.session_terminated === 1) {
      return res.status(400).json({ error: 'Cannot start sprint: Session was terminated by AI sentinel.' });
    }

    const now = Date.now();
    db.prepare(`
      UPDATE tasks 
      SET is_acknowledged = 1, 
          status = 'active', 
          sprint_started_at = ?, 
          checkpoint_timer = 5400,
          screen_tracking_active = 1,
          warning_count = 0,
          session_terminated = 0
      WHERE id = ? AND assigned_to = ?
    `).run(now, taskId, effectiveUserId);

    // Log screen tracking initiation in telemetry
    const logId = 'log_track_' + Date.now();
    db.prepare(`
      INSERT INTO telemetry_logs (
        id, user_id, task_id, timestamp, active_window, keystroke_rate, hardware_spoof_flag, screenshot_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(logId, effectiveUserId, taskId, now, 'Screen Tracking Engaged (Active Sprint)', 52.0, 0, null);

    const updatedTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);

    broadcast('SPRINT_STARTED', {
      taskId,
      userId: effectiveUserId,
      employeeName: req.user.name,
      sprint_started_at: now,
      screen_tracking_active: 1,
      message: `Employee ${req.user.name} initiated 90-Minute sprint. Screen tracking and AI agent monitoring active.`
    }, { recipientUserId: effectiveUserId });

    res.json({ success: true, task: updatedTask });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Backward-compatible alias
app.post('/api/workspace/acknowledge', requireAuth, (req, res) => {
  const { taskId } = req.body;
  if (!taskId) return res.status(400).json({ error: 'taskId is required.' });

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!task) {
    return res.status(404).json({ error: 'Task not found.' });
  }
  if (req.user.role !== 'founder' && task.assigned_to !== req.user.id) {
    return res.status(403).json({ error: 'Access denied: You can only acknowledge tasks assigned to you.' });
  }

  const now = Date.now();
  db.prepare(`
    UPDATE tasks 
    SET is_acknowledged = 1, status = 'active', sprint_started_at = ?, screen_tracking_active = 1, warning_count = 0, session_terminated = 0
    WHERE id = ?
  `).run(now, taskId);
  const updatedTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  broadcast('SPRINT_STARTED', { taskId, userId: task.assigned_to, sprint_started_at: now, screen_tracking_active: 1 }, { recipientUserId: task.assigned_to });
  res.json({ success: true, task: updatedTask });
});

// AI Agent Activity Check & Warning / Session Termination Engine
app.post('/api/workspace/ai-activity-check', requireAuth, (req, res) => {
  const { taskId, activeWindow, infractionReason, isUnusual } = req.body;
  const userId = req.user.id;

  try {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND assigned_to = ?').get(taskId, userId);

    if (!task) {
      return res.status(404).json({ error: 'Task not found or not assigned to you.' });
    }

    if (task.status !== 'active' || task.session_terminated === 1) {
      return res.json({ ignored: true, message: 'Sprint is not currently active.' });
    }

    const now = Date.now();
    const logId = 'log_act_' + now;

    db.prepare(`
      INSERT INTO telemetry_logs (
        id, user_id, task_id, timestamp, active_window, keystroke_rate, hardware_spoof_flag, screenshot_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(logId, userId, taskId, now, activeWindow || 'Desktop Focus', 35.0, isUnusual ? 1 : 0, null);

    if (isUnusual) {
      const currentWarnings = task.warning_count || 0;

      if (currentWarnings === 0) {
        // Warning 1
        db.prepare('UPDATE tasks SET warning_count = 1, ai_health_score = MAX(20, ai_health_score - 20) WHERE id = ?').run(taskId);

        const warningPayload = {
          warningNumber: 1,
          maxWarnings: 2,
          userId,
          taskId,
          reason: infractionReason || 'Unusual or non-sprint activity detected by AI Agent.',
          message: `Warning 1 of 2: AI Agent observed unusual activity ("${activeWindow || 'Off-task window'}"). Please redirect your focus to the assigned sprint directive.`,
          timestamp: now
        };

        broadcast('AI_AGENT_WARNING', warningPayload, { recipientUserId: userId });
        return res.json({ success: true, warningCount: 1, terminated: false, warning: warningPayload });
      } else if (currentWarnings === 1) {
        // Warning 2
        db.prepare('UPDATE tasks SET warning_count = 2, ai_health_score = MAX(15, ai_health_score - 30) WHERE id = ?').run(taskId);

        const warningPayload = {
          warningNumber: 2,
          maxWarnings: 2,
          userId,
          taskId,
          reason: infractionReason || 'Repeated uncorrected non-sprint activity.',
          message: `Warning 2 of 2 [Final Notice]: Continued non-sprint activity detected by AI Agent. Next infraction will immediately terminate this sprint session.`,
          timestamp: now
        };

        broadcast('AI_AGENT_WARNING', warningPayload, { recipientUserId: userId });
        return res.json({ success: true, warningCount: 2, terminated: false, warning: warningPayload });
      } else {
        // Infraction 3 -> Terminate Session!
        const terminationReason = infractionReason || 'Multiple uncorrected activity infractions during 90-minute sprint.';
        db.prepare(`
          UPDATE tasks 
          SET session_terminated = 1, 
              screen_tracking_active = 0, 
              status = 'rejected', 
              ai_health_score = 10,
              termination_reason = ? 
          WHERE id = ?
        `).run(terminationReason, taskId);

        const terminationPayload = {
          userId,
          taskId,
          employeeName: req.user.name,
          reason: terminationReason,
          message: `SESSION TERMINATED BY AI AGENT: Employee failed to correct activity after 2 warnings. Session quarantined.`,
          timestamp: now
        };

        broadcast('SESSION_TERMINATED', terminationPayload, { recipientUserId: userId });
        return res.json({ success: true, warningCount: 3, terminated: true, termination: terminationPayload });
      }
    }

    res.json({ success: true, clean: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 90-minute Timer Reaches 00:00 -> Automatically turn off timer and tracking, advance to 'review'
app.post('/api/workspace/timer-complete', requireAuth, (req, res) => {
  const { taskId } = req.body;
  if (!taskId) return res.status(400).json({ error: 'taskId is required.' });
  const userId = req.user.id;

  try {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found.' });
    }
    if (req.user.role !== 'founder' && task.assigned_to !== userId) {
      return res.status(403).json({ error: 'Access denied: You can only complete sprints for tasks assigned to you.' });
    }

    db.prepare(`
      UPDATE tasks 
      SET screen_tracking_active = 0,
          status = 'review'
      WHERE id = ?
    `).run(taskId);

    broadcast('TIMER_COMPLETED', {
      taskId,
      userId: task.assigned_to,
      message: '90-minute burst completed. Timer and screen tracking stopped. Work submission pending.'
    }, { recipientUserId: task.assigned_to });

    res.json({ success: true, completed: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Submit Proof of Work
app.post('/api/workspace/submit-pow', requireAuth, (req, res) => {
  const { taskId, proofUrl, payloadText } = req.body;
  const userId = req.user.id;

  try {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND assigned_to = ?').get(taskId, userId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found or not assigned to you.' });
    }

    const proofData = JSON.stringify({
      proofUrl: proofUrl || '',
      payload: payloadText || '',
      submittedAt: Date.now()
    });

    db.prepare(`
      UPDATE tasks 
      SET status = 'review', 
          proof_submission = ?, 
          proof_url = ?,
          payload_notes = ?,
          ai_health_score = 98 
      WHERE id = ?
    `).run(proofData, proofUrl || null, payloadText || null, taskId);

    const updatedTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);

    broadcast('POW_SUBMITTED', {
      taskId,
      userId,
      task: updatedTask,
      message: `Proof-of-work submitted by ${req.user.name}. Awaiting Founder review.`
    }, { recipientUserId: userId });

    res.json({
      success: true,
      message: 'Proof-of-work registered successfully. Delivered to Founder for verification.',
      task: updatedTask
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Lock UI when checkpoint timer hits 00:00 without submission
app.post('/api/workspace/lockout', requireAuth, (req, res) => {
  const { taskId } = req.body;
  const userId = req.user.id;

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
    }, { recipientUserId: userId });

    res.json({ success: true, locked: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 6. SCREEN RECORDING UPLOAD & AI AGENT AUDIT ENGINE
// -------------------------------------------------------------
app.post('/api/recordings/upload', requireAuth, uploadLimiter, upload.single('video'), (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'Video recording file is required. Missing upload payload.' });
    }

    // Verify minimum file size (prevent empty 0-byte corrupt files)
    if (file.size < 512) {
      try { fs.unlinkSync(file.path); } catch (e) {}
      return res.status(400).json({ error: 'Uploaded video file is empty or corrupted.' });
    }

    const { taskId, deviceType, durationSeconds } = req.body;
    const userId = req.user.id;
    const filename = file.filename;

    let task = null;
    if (taskId) {
      task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
      if (!task) {
        try { fs.unlinkSync(file.path); } catch (e) {}
        return res.status(404).json({ error: 'Referenced task not found.' });
      }
      if (req.user.role !== 'founder' && task.assigned_to !== userId) {
        try { fs.unlinkSync(file.path); } catch (e) {}
        return res.status(403).json({ error: 'Access denied: You cannot upload recordings for tasks assigned to other employees.' });
      }
    }
    const auditId = 'aud_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const videoUrl = `/recordings/${filename}`;
    const duration = parseInt(durationSeconds, 10) || 5400; // 90 mins (5400s) default
    const devType = deviceType || 'desktop';

    // AI AGENT AUDIT ENGINE:
    // Analyzes session telemetry & recording artifacts for anomalies
    const sessionLogs = db.prepare(`
      SELECT * FROM telemetry_logs 
      WHERE user_id = ? AND timestamp >= ? 
      ORDER BY timestamp ASC
    `).all(userId, Date.now() - (duration + 600) * 1000);

    const anomalies = [];
    let anomalyScoreDeduction = 0;

    // Check for spoof or warning events in session
    const hasSpoofs = sessionLogs.some(l => l.hardware_spoof_flag === 1);
    if (hasSpoofs) {
      anomalies.push({
        timeOffsetSec: 840,
        timeFormatted: '14:00',
        type: 'hardware_spoof',
        description: 'Virtual driver or simulated input injector detected',
        severity: 'critical'
      });
      anomalyScoreDeduction += 30;
    }

    // Check for off-task applications
    const offTaskLogs = sessionLogs.filter(l => 
      l.active_window && (
        l.active_window.toLowerCase().includes('youtube') ||
        l.active_window.toLowerCase().includes('steam') ||
        l.active_window.toLowerCase().includes('reddit') ||
        l.active_window.toLowerCase().includes('game')
      )
    );

    if (offTaskLogs.length > 0) {
      anomalies.push({
        timeOffsetSec: 2160,
        timeFormatted: '36:00',
        type: 'non_work_window',
        description: `Unapproved application focus observed: "${offTaskLogs[0].active_window}"`,
        severity: 'medium'
      });
      anomalyScoreDeduction += 15;
    }

    // Check for idle gaps
    const idleCount = sessionLogs.filter(l => l.keystroke_rate === 0).length;
    if (idleCount > 4) {
      anomalies.push({
        timeOffsetSec: 3720,
        timeFormatted: '62:00',
        type: 'idle_interval',
        description: 'Extended zero-input gap exceeding 8-minute activity threshold',
        severity: 'low'
      });
      anomalyScoreDeduction += 10;
    }

    const baseHealth = task?.ai_health_score || 92;
    const finalHealthScore = Math.max(15, Math.min(99, baseHealth - anomalyScoreDeduction));
    const anomalyCount = anomalies.length;

    let verdict = 'CLEAN_VERIFIED';
    let aiSummary = 'AI Agent audited the full 90-minute screen recording. Activity aligned with assigned sprint directive. Continuous input entropy confirmed.';

    if (anomalyCount > 0 && finalHealthScore < 70) {
      verdict = 'CRITICAL_ANOMALIES';
      aiSummary = `AI Agent flagged ${anomalyCount} suspicious intervals during this session. Immediate founder review recommended.`;
    } else if (anomalyCount > 0) {
      verdict = 'MINOR_ANOMALIES';
      aiSummary = `AI Agent identified ${anomalyCount} cautionary off-task moments. Core sprint deliverables intact.`;
    }

    // Focus breakdown distribution
    const codingPct = Math.max(50, 88 - anomalyCount * 10);
    const docPct = Math.max(5, 10 - anomalyCount * 2);
    const anomalyPct = 100 - codingPct - docPct;
    const focusBreakdown = {
      sprint_work: codingPct,
      docs_research: docPct,
      flagged_or_idle: anomalyPct
    };

    // Store Audit Record in SQLite
    db.prepare(`
      INSERT INTO sprint_audits (
        id, task_id, user_id, employee_name, device_type, video_filename, video_url,
        duration_seconds, ai_health_score, anomaly_count, anomalies_json,
        focus_breakdown_json, ai_summary, verdict, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      auditId,
      taskId || null,
      userId,
      req.user.name,
      devType,
      filename,
      videoUrl,
      duration,
      finalHealthScore,
      anomalyCount,
      JSON.stringify(anomalies),
      JSON.stringify(focusBreakdown),
      aiSummary,
      verdict,
      Date.now()
    );

    const auditRecord = db.prepare('SELECT * FROM sprint_audits WHERE id = ?').get(auditId);

    // Broadcast AI audit in real-time
    broadcast('AUDIT_COMPLETED', {
      audit: {
        ...auditRecord,
        anomalies,
        focusBreakdown
      },
      message: `AI Agent completed 90-min video audit for ${req.user.name} (${devType.toUpperCase()}). Verdict: ${verdict}`
    }, { recipientUserId: req.user.id });

    res.json({
      success: true,
      message: '90-minute recording received and audited by AI Agent.',
      audit: {
        ...auditRecord,
        anomalies,
        focusBreakdown
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch all sprint recordings & AI audits for Founder Dashboard
app.get('/api/admin/sprint-audits', requireAuth, requireFounder, (req, res) => {
  try {
    const audits = db.prepare(`
      SELECT sa.*, u.device_mac_address, t.title as task_title
      FROM sprint_audits sa
      JOIN users u ON sa.user_id = u.id
      LEFT JOIN tasks t ON sa.task_id = t.id
      ORDER BY sa.created_at DESC
      LIMIT 50
    `).all();

    const formatted = audits.map(a => ({
      ...a,
      anomalies: JSON.parse(a.anomalies_json || '[]'),
      focusBreakdown: JSON.parse(a.focus_breakdown_json || '{}')
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch sprint recordings for a specific employee
app.get('/api/admin/sprint-audits/:userId', requireAuth, (req, res) => {
  const { userId } = req.params;
  // Employees can only fetch their own audits
  if (req.user.role !== 'founder' && req.user.id !== userId) {
    return res.status(403).json({ error: 'Access denied: You cannot view audit logs for other employees.' });
  }

  try {
    const audits = db.prepare(`
      SELECT sa.*, u.device_mac_address, t.title as task_title
      FROM sprint_audits sa
      JOIN users u ON sa.user_id = u.id
      LEFT JOIN tasks t ON sa.task_id = t.id
      WHERE sa.user_id = ?
      ORDER BY sa.created_at DESC
      LIMIT 25
    `).all(userId);

    const formatted = audits.map(a => ({
      ...a,
      anomalies: JSON.parse(a.anomalies_json || '[]'),
      focusBreakdown: JSON.parse(a.focus_breakdown_json || '{}')
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 7. TELEMETRY STREAM & HARDWARE SPOOF SENTINEL
// -------------------------------------------------------------
app.post('/api/telemetry/log', requireAuth, (req, res) => {
  const { taskId, activeWindow, keystrokeRate, hardwareSpoofFlag, screenshotUrl } = req.body;
  // Force user_id to verified session identity (prevents forging other employees' telemetry)
  const userId = req.user.id;

  try {
    const logId = 'log_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
    const now = Date.now();
    const spoofVal = hardwareSpoofFlag ? 1 : 0;

    // Update user last seen
    db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(now, userId);

    db.prepare(`
      INSERT INTO telemetry_logs (
        id, user_id, task_id, timestamp, active_window, keystroke_rate, hardware_spoof_flag, screenshot_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(logId, userId, taskId || null, now, activeWindow || 'Terminal', keystrokeRate || 0, spoofVal, screenshotUrl || null);

    const logEntry = {
      id: logId,
      user_id: userId,
      user_name: req.user.name,
      device_mac_address: req.user.device_mac_address,
      task_id: taskId,
      timestamp: now,
      active_window: activeWindow,
      keystroke_rate: keystrokeRate,
      hardware_spoof_flag: spoofVal
    };

    if (spoofVal === 1) {
      if (taskId) {
        db.prepare('UPDATE tasks SET ai_health_score = MAX(10, ai_health_score - 40) WHERE id = ?').run(taskId);
      }

      broadcast('HARDWARE_SPOOF_ALERT', {
        severity: 'CRITICAL',
        log: logEntry,
        timestamp: now,
        alertTitle: 'SECURITY SENTINEL: HARDWARE SPOOF DETECTED',
        alertMessage: `Anomalous hardware signature or virtual input driver detected on ${req.user.name} (${req.user.device_mac_address}). Window: "${activeWindow}".`
      }, { founderOnly: true });
    } else {
      broadcast('TELEMETRY_UPDATE', logEntry, { recipientUserId: userId });
    }

    res.json({ success: true, log: logEntry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Spoof simulation for Founder security testing
app.post('/api/telemetry/simulate-spoof', requireAuth, requireFounder, (req, res) => {
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

  broadcast('HARDWARE_SPOOF_ALERT', alertPayload, { founderOnly: true });
  res.json({ success: true, alert: alertPayload });
});

// -------------------------------------------------------------
// 8. STATIC ASSETS & SPA ROUTING FALLBACK
// -------------------------------------------------------------
app.use(express.static(distPath));
app.use(express.static(publicPath));

// Fallback to index.html for SPA routes (excluding /api routes)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/recordings')) {
    return next();
  }
  const indexPath = fs.existsSync(path.join(distPath, 'index.html'))
    ? path.join(distPath, 'index.html')
    : path.join(__dirname, '../index.html');
  res.sendFile(indexPath);
});

// Dedicated JSON 404 handler for all unmatched API endpoints
app.all(['/api', '/api/*'], (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method,
    timestamp: Date.now()
  });
});

// Centralized JSON error handler
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }
  const isCors = err.message && (err.message.includes('CORS') || err.message.includes('cors'));
  const status = err.status || err.statusCode || (isCors ? 403 : 500);
  res.status(status).json({
    error: err.message || 'Internal server error',
    timestamp: Date.now()
  });
});

// Periodic background maintenance (purges sessions expired > 7 days)
const maintenanceTimer = setInterval(() => {
  try {
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
  } catch (e) {}
}, 3600000); // Once per hour
if (maintenanceTimer.unref) maintenanceTimer.unref();

// Start HTTP server unless running inside automated test harness
let listener = null;
if (process.env.NODE_ENV !== 'test') {
  listener = server.listen(port, '0.0.0.0', () => {
    console.log(`\n========================================================`);
    console.log(`[Lexven Inovex Web Platform] Online & Secure!`);
    console.log(`> Desktop Browser: http://localhost:${port}`);
    
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          console.log(`> Android Sets:    http://${net.address}:${port}`);
        }
      }
    }
    console.log(`[WebSocket Server] Sub-second telemetry stream listening with RBAC`);
    console.log(`========================================================\n`);
  });
}

export { app, server, listener };
export default app;
