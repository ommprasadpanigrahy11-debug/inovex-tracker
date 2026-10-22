import crypto from 'node:crypto';
import db from './db.js';

// Configuration
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const BOOTSTRAP_FOUNDER_KEY = process.env.INITIAL_FOUNDER_KEY || process.env.BOOTSTRAP_TOKEN || null;

/**
 * Checks whether an initial founder bootstrap secret is configured in the environment
 */
export function isBootstrapConfigured() {
  const configuredKey = process.env.INITIAL_FOUNDER_KEY || process.env.BOOTSTRAP_TOKEN || process.env.FOUNDER_BOOTSTRAP_SECRET;
  return typeof configuredKey === 'string' && configuredKey.trim().length > 0;
}

/**
 * Validates bootstrap key using timingSafeEqual; returns false if no key configured or mismatch
 */
export function isBootstrapKeyValid(providedKey) {
  const configuredKey = process.env.INITIAL_FOUNDER_KEY || process.env.BOOTSTRAP_TOKEN || process.env.FOUNDER_BOOTSTRAP_SECRET;
  if (!configuredKey || typeof configuredKey !== 'string' || !configuredKey.trim()) {
    return false;
  }
  if (!providedKey || typeof providedKey !== 'string') {
    return false;
  }
  try {
    const confBuf = Buffer.from(configuredKey.trim());
    const provBuf = Buffer.from(providedKey.trim());
    if (confBuf.length !== provBuf.length) return false;
    return crypto.timingSafeEqual(confBuf, provBuf);
  } catch (e) {
    return false;
  }
}

/**
 * Generate a cryptographically secure random salt
 */
export function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Hash password with scrypt
 */
export function hashPassword(password, salt) {
  if (!password || !salt) throw new Error('Password and salt required');
  const derivedKey = crypto.scryptSync(String(password).normalize(), salt, 64);
  return derivedKey.toString('hex');
}

/**
 * Constant-time password verification
 */
export function verifyPassword(password, storedHash, storedSalt) {
  if (!password || !storedHash || !storedSalt) return false;
  try {
    const computedHash = hashPassword(password, storedSalt);
    const storedBuf = Buffer.from(storedHash, 'hex');
    const computedBuf = Buffer.from(computedHash, 'hex');
    if (storedBuf.length !== computedBuf.length) return false;
    return crypto.timingSafeEqual(storedBuf, computedBuf);
  } catch (err) {
    return false;
  }
}

/**
 * Create a new authenticated session for a user
 */
export function createSession(userId, req = null) {
  const token = 'invx_' + crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;
  const ip = req?.ip || req?.socket?.remoteAddress || '127.0.0.1';
  const userAgent = req?.headers?.['user-agent'] || 'unknown';

  db.prepare(`
    INSERT INTO sessions (token, user_id, ip_address, user_agent, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(token, userId, ip, userAgent.substring(0, 255), now, expiresAt);

  // Update user last seen
  try {
    db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(now, userId);
  } catch (e) {}

  return { token, expiresAt };
}

/**
 * Validate session token and return user
 */
export function validateSessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const cleanToken = token.trim();
  const now = Date.now();

  const session = db.prepare(`
    SELECT s.token, s.user_id, s.expires_at, 
           u.id, u.name, u.role, u.email, u.skill_set, u.device_mac_address, 
           u.is_active, u.last_seen_at, u.created_at,
           u.avatar_url, u.bio, u.phone, u.timezone, u.language, u.theme, u.time_format, u.notification_preferences
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > ?
  `).get(cleanToken, now);

  if (!session) return null;

  // Touch last seen
  try {
    db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(now, session.user_id);
  } catch (e) {}

  return {
    id: session.id,
    name: session.name,
    role: session.role,
    email: session.email,
    skill_set: session.skill_set,
    device_mac_address: session.device_mac_address,
    is_active: session.is_active,
    last_seen_at: session.last_seen_at,
    created_at: session.created_at || null,
    avatar_url: session.avatar_url || null,
    bio: session.bio || '',
    phone: session.phone || '',
    timezone: session.timezone || 'UTC',
    language: session.language || 'en',
    theme: session.theme || 'dark',
    time_format: session.time_format || '24h',
    notification_preferences: session.notification_preferences ? (typeof session.notification_preferences === 'string' ? JSON.parse(session.notification_preferences) : session.notification_preferences) : null
  };
}

/**
 * Invalidate a session (logout)
 */
export function revokeSession(token) {
  if (!token) return false;
  const result = db.prepare('DELETE FROM sessions WHERE token = ?').run(token.trim());
  return result.changes > 0;
}

/**
 * Purge expired sessions
 */
export function cleanupExpiredSessions() {
  try {
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
  } catch (e) {}
}

/**
 * Authentication Middleware: enforces valid session
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.headers['x-session-token']) {
    token = req.headers['x-session-token'];
  } else if (req.query?.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Missing session token.' });
  }

  const user = validateSessionToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
  }

  req.user = user;
  req.sessionToken = token;
  next();
}

/**
 * Founder Role Authorization Middleware
 */
export function requireFounder(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (req.user.role !== 'founder') {
    return res.status(403).json({ error: 'Access denied: Executive Founder privileges required.' });
  }
  next();
}

/**
 * Rate Limiter factory (In-Memory Sliding Window)
 */
export function createRateLimiter({ windowMs = 60000, max = 30, message = 'Too many requests. Please slow down.' } = {}) {
  const requests = new Map();

  return (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    const windowStart = now - windowMs;

    let timestamps = requests.get(ip) || [];
    timestamps = timestamps.filter(t => t > windowStart);

    if (timestamps.length >= max) {
      return res.status(429).json({ error: message, retryAfterSeconds: Math.ceil((timestamps[0] + windowMs - now) / 1000) });
    }

    timestamps.push(now);
    requests.set(ip, timestamps);

    // Periodic cleanup if map grows too large
    if (requests.size > 10000) {
      for (const [key, list] of requests.entries()) {
        const filtered = list.filter(t => t > windowStart);
        if (filtered.length === 0) requests.delete(key);
        else requests.set(key, filtered);
      }
    }

    next();
  };
}

export { BOOTSTRAP_FOUNDER_KEY };
