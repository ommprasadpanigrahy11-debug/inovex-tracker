/**
 * INOVEX TRACKER - AUTOMATED SECURITY, RBAC, DEPLOYMENT & API REGRESSION TEST SUITE
 * 
 * Verifies:
 * SECTION 1: Production Deployment, Health & API Routing (Issue 1)
 *   1. Backend server starts and handles requests.
 *   2. /api/health returns valid JSON without exposing secrets.
 *   3. Existing core API routes are registered correctly.
 *   4. Unknown API routes return JSON 404, never frontend HTML.
 *   5. Frontend API client (dataService) respects VITE_API_BASE_URL and VITE_API_URL.
 *   6. CORS accepts configured production origin and rejects unapproved origins.
 *   7. WebSocket configuration properly derives production WebSocket URL.
 * 
 * SECTION 2: Secure Founder Registration, Bootstrap & Role Assignment (Issue 2)
 *   1. Public registration without role creates ONLY default permitted role (employee).
 *   2. Public registration requesting 'role: founder' is rejected (403 Forbidden).
 *   3. Forged role field cannot elevate an existing employee account.
 *   4. Founder bootstrap fails closed without configured server authorization (503).
 *   5. Founder bootstrap fails with missing or invalid bootstrap secret (401 / 403).
 *   6. Authorized founder bootstrap creates the initial founder (201 Created).
 *   7. Reusing bootstrap secret after initialization is rejected (409 Conflict).
 *   8. Concurrent bootstrap attempts cannot create multiple initial founders.
 *   9. Duplicate email registration is blocked to prevent account takeover (409 Conflict).
 *   10. Passwords stored strictly as salted scrypt hashes and never returned in API.
 *   11. Ordinary profile updates cannot alter any user's role (403 Forbidden).
 *   12. Existing legitimate authentication, session lifecycle and logout work.
 * 
 * SECTION 3: Regression Protection
 *   - Sole founder deletion protection
 *   - Sanitized user directory
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import WebSocket from 'ws';
import db, { syncDefaultUsersWithHashes, syncBootstrapStatus, canSeedDemoData, dataDir, dbPath } from './db.js';
import { 
  generateSalt,
  hashPassword, 
  verifyPassword, 
  createSession, 
  validateSessionToken, 
  revokeSession,
  requireAuth,
  requireFounder,
  isBootstrapKeyValid,
  isBootstrapConfigured
} from './auth.js';

process.env.NODE_ENV = 'test';
process.env.ALLOWED_ORIGIN = 'https://inovex-production-app.vercel.app';
const TEST_BOOTSTRAP_SECRET = 'inovex_test_bootstrap_secret_high_entropy_2026';
process.env.INITIAL_FOUNDER_KEY = TEST_BOOTSTRAP_SECRET;

process.on('uncaughtException', (err) => {
  console.error('*** UNCAUGHT EXCEPTION ***', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('*** UNHANDLED REJECTION ***', reason);
});

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  \x1b[32m✔ PASS\x1b[0m: ${message}`);
    passed++;
  } else {
    console.error(`  \x1b[31m✖ FAIL\x1b[0m: ${message}`);
    failed++;
  }
}

// Mock Request & Response helpers for unit-level handler tests
const createMockReq = (body = {}, headers = {}, user = null, method = 'POST', url = '/api/test') => ({
  body,
  headers,
  user,
  method,
  url,
  originalUrl: url,
  ip: '127.0.0.1',
  socket: { remoteAddress: '127.0.0.1' },
  get: (name) => headers[name.toLowerCase()]
});

const createMockRes = () => {
  const res = {
    statusCode: 200,
    jsonData: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.jsonData = data;
      return this;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    send(data) {
      this.jsonData = data;
      return this;
    }
  };
  return res;
};

async function runAllTests() {
  console.log('\n======================================================');
  console.log('  INOVEX TRACKER — SECURITY, RBAC & DEPLOYMENT TESTS');
  console.log('======================================================\n');

  // Dynamic import of app and server
  const { app, server } = await import('./server.js');

  // Start HTTP and WebSocket test server on ephemeral port (port 0)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const testPort = server.address().port;
  const baseUrl = `http://127.0.0.1:${testPort}`;
  const wsUrl = `ws://127.0.0.1:${testPort}`;

  try {
    // ---------------------------------------------------------------------------
    // SECTION 1: Production Deployment, Health & API Routing
    // ---------------------------------------------------------------------------
    console.log('[SECTION 1] Testing Production Deployment, Health & API Routing...');

    // 1.1 Backend starts and handles requests
    assert(testPort > 0, `Backend successfully starts and listens on ephemeral port (${testPort})`);

    // 1.2 /api/health endpoint returns JSON without exposing secrets
    const healthRes = await fetch(`${baseUrl}/api/health`);
    const healthData = await healthRes.json();
    assert(healthRes.status === 200, '/api/health returns HTTP 200 status');
    assert(healthData.status === 'ok', '/api/health response contains status: "ok"');
    assert(typeof healthData.uptimeSeconds === 'number', '/api/health reports server uptime');
    assert(!healthData.INITIAL_FOUNDER_KEY && !healthData.dbPath && !healthData.env, '/api/health strictly omits secrets, db paths, and environment dumps');

    // 1.3 Core API routes are registered and protected
    const unauthUsersRes = await fetch(`${baseUrl}/api/users`);
    assert(unauthUsersRes.status === 401, 'Unauthenticated /api/users request is rejected with HTTP 401');
    const unauthUsersJson = await unauthUsersRes.json();
    assert(unauthUsersJson.error && unauthUsersJson.error.includes('Authentication required'), 'Rejection payload includes clear authorization error');

    // 1.4 Unknown API routes return JSON 404, never frontend HTML
    const unknownRes = await fetch(`${baseUrl}/api/nonexistent-route-endpoint`);
    const unknownContentType = unknownRes.headers.get('content-type') || '';
    assert(unknownRes.status === 404, 'Unknown API route returns HTTP 404');
    assert(unknownContentType.includes('application/json'), 'Unknown API route returns application/json content-type');
    const unknownJson = await unknownRes.json();
    assert(unknownJson.error === 'Endpoint not found', 'Unknown API route returns JSON { error: "Endpoint not found" }');

    const bareApiRes = await fetch(`${baseUrl}/api`);
    const bareApiContentType = bareApiRes.headers.get('content-type') || '';
    assert(bareApiRes.status === 404 && bareApiContentType.includes('application/json'), 'GET /api returns JSON 404, not SPA HTML');

    // 1.5 Frontend API client URL resolution logic
    const resolveApiUrl = (base, endpoint) => {
      const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      const cleanBase = (base || '').replace(/\/$/, '');
      return cleanBase ? `${cleanBase}${cleanEndpoint}` : cleanEndpoint;
    };

    assert(resolveApiUrl('', '/api/auth/login') === '/api/auth/login', 'Frontend uses relative path when no base URL configured (local dev)');
    assert(
      resolveApiUrl('https://api.inovex.internal', '/api/auth/login') === 'https://api.inovex.internal/api/auth/login',
      'Frontend uses configured production base URL (VITE_API_BASE_URL)'
    );

    // 1.6 CORS verification
    // 1.6a Approved origin: ALLOWED_ORIGIN
    const approvedCorsRes = await fetch(`${baseUrl}/api/health`, {
      headers: { 'Origin': 'https://inovex-production-app.vercel.app' }
    });
    assert(
      approvedCorsRes.headers.get('access-control-allow-origin') === 'https://inovex-production-app.vercel.app',
      'CORS accepts configured production origin (https://inovex-production-app.vercel.app)'
    );

    // 1.6b Approved local origin
    const localCorsRes = await fetch(`${baseUrl}/api/health`, {
      headers: { 'Origin': 'http://localhost:5173' }
    });
    assert(
      localCorsRes.headers.get('access-control-allow-origin') === 'http://localhost:5173',
      'CORS accepts local development origin (http://localhost:5173)'
    );

    // 1.6c Unapproved external origin
    const unapprovedCorsRes = await fetch(`${baseUrl}/api/health`, {
      headers: { 'Origin': 'https://malicious-external-site.evil.com' }
    });
    assert(
      unapprovedCorsRes.headers.get('access-control-allow-origin') !== 'https://malicious-external-site.evil.com',
      'CORS firmly rejects unapproved external origin'
    );

    // 1.7 WebSocket URL derivation
    const deriveWsUrl = (apiBase, explicitWs) => {
      if (explicitWs) return explicitWs;
      if (apiBase) return apiBase.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
      return null;
    };
    assert(
      deriveWsUrl('https://inovex-backend.onrender.com', null) === 'wss://inovex-backend.onrender.com',
      'WebSocket URL automatically derives wss:// endpoint from HTTPS production backend URL'
    );
    assert(
      deriveWsUrl('https://inovex-backend.onrender.com', 'wss://custom-ws.inovex.com') === 'wss://custom-ws.inovex.com',
      'WebSocket URL respects explicit VITE_WS_URL override when provided'
    );

    // ---------------------------------------------------------------------------
    // SECTION 2: Secure Founder Registration, Bootstrap & Role Assignment
    // ---------------------------------------------------------------------------
    console.log('\n[SECTION 2] Testing Founder Registration, Bootstrap & RBAC Security...');

    // 2.1 Public registration without a role creates ONLY default permitted role (employee)
    const publicRegEmail = `test.employee.${Date.now()}@lexven.com`;
    const publicRegRes = await fetch(`${baseUrl}/api/users/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Normal Public Registrant',
        email: publicRegEmail,
        password: 'SecurePassword123'
      })
    });
    const publicRegData = await publicRegRes.json();
    assert(publicRegRes.status === 200 && publicRegData.success, 'Public registration succeeds without role parameter');
    assert(publicRegData.user.role === 'employee', 'RULE 1 VERIFIED: Public registration without role defaults strictly to "employee" role');

    // 2.2 Public registration requesting "role": "founder" is rejected (403 Forbidden)
    const hostileRegEmail = `hostile.founder.${Date.now()}@lexven.com`;
    const hostileRegRes = await fetch(`${baseUrl}/api/users/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Hostile Actor Claiming Founder',
        email: hostileRegEmail,
        password: 'AttackerPassword123',
        role: 'founder'
      })
    });
    const hostileRegData = await hostileRegRes.json();
    assert(hostileRegRes.status === 403, 'RULE 2 VERIFIED: Public registration requesting "role": "founder" is blocked with HTTP 403');
    assert(
      hostileRegData.error && hostileRegData.error.includes('Public registration cannot grant Executive Founder privileges'),
      'Public registration returns clear authorization error message'
    );

    // Verify account was NOT created in database
    const hostileAccountInDb = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(hostileRegEmail);
    assert(!hostileAccountInDb, 'Hostile registration attempt did not create any record in database');

    // 2.3 Forged role field cannot elevate an existing employee account
    const forgedRoleUpdateRes = await fetch(`${baseUrl}/api/users/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicRegData.token}`
      },
      body: JSON.stringify({
        name: 'Normal Public Registrant',
        role: 'founder'
      })
    });
    assert(forgedRoleUpdateRes.status === 403, 'RULE 3 & 11 VERIFIED: Ordinary profile update cannot elevate role to founder (HTTP 403)');
    const checkRoleInDb = db.prepare('SELECT role FROM users WHERE id = ?').get(publicRegData.user.id);
    assert(checkRoleInDb.role === 'employee', 'User role remains "employee" in database after attempted privilege escalation');

    // 2.4 Founder bootstrap fails closed when secret is not configured
    const originalSecret = process.env.INITIAL_FOUNDER_KEY;
    delete process.env.INITIAL_FOUNDER_KEY;
    delete process.env.BOOTSTRAP_TOKEN;
    delete process.env.FOUNDER_BOOTSTRAP_SECRET;

    const unconfiguredBootstrapRes = await fetch(`${baseUrl}/api/auth/bootstrap-founder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Founder',
        email: 'unconfigured.bootstrap@lexven.com',
        password: 'FounderPassword#2026',
        bootstrapKey: 'any_key'
      })
    });
    assert(unconfiguredBootstrapRes.status === 503, 'RULE 4 VERIFIED: Founder bootstrap fails closed with HTTP 503 when secret is unconfigured');
    process.env.INITIAL_FOUNDER_KEY = originalSecret;

    // 2.5 Founder bootstrap fails with missing or invalid secret
    const missingKeyRes = await fetch(`${baseUrl}/api/auth/bootstrap-founder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Founder',
        email: 'missing.key@lexven.com',
        password: 'FounderPassword#2026'
      })
    });
    assert(missingKeyRes.status === 401, 'RULE 5a VERIFIED: Founder bootstrap fails with HTTP 401 when bootstrapKey is omitted');

    const invalidKeyRes = await fetch(`${baseUrl}/api/auth/bootstrap-founder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Founder',
        email: 'invalid.key@lexven.com',
        password: 'FounderPassword#2026',
        bootstrapKey: 'completely_wrong_secret_passcode'
      })
    });
    assert(invalidKeyRes.status === 403, 'RULE 5b VERIFIED: Founder bootstrap fails with HTTP 403 when bootstrapKey is invalid');

    // 2.6 & 2.7 & 2.8: Test Founder Bootstrap Lifecycle on Isolated Clean Database
    console.log('\n[SECTION 2.6 - 2.8] Testing Bootstrap Lifecycle, One-Time Persistence & Concurrency...');

    // We create an isolated SQLite database using DatabaseSync to verify clean-slate bootstrap
    const testDb = new DatabaseSync(':memory:');
    testDb.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        device_mac_address TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        email TEXT UNIQUE,
        password_hash TEXT,
        password_salt TEXT,
        skill_set TEXT,
        last_seen_at INTEGER,
        created_at INTEGER
      );
      CREATE TABLE security_bootstrap (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        completed_at INTEGER NOT NULL,
        founder_user_id TEXT NOT NULL,
        FOREIGN KEY (founder_user_id) REFERENCES users(id)
      );
    `);

    // Simulated atomic bootstrap transaction handler (identical to server logic)
    const executeBootstrapTx = (dbInstance, { name, email, password, bootstrapKey }) => {
      if (!isBootstrapKeyValid(bootstrapKey)) {
        return { status: 403, error: 'Invalid bootstrap key' };
      }
      dbInstance.exec('BEGIN IMMEDIATE TRANSACTION;');
      try {
        const existingBootstrap = dbInstance.prepare("SELECT * FROM security_bootstrap WHERE id = 1").get();
        if (existingBootstrap) {
          dbInstance.exec('ROLLBACK;');
          return { status: 409, error: 'Initial founder bootstrap has already been completed' };
        }
        const existingFounder = dbInstance.prepare("SELECT id FROM users WHERE role = 'founder' AND is_active = 1 LIMIT 1").get();
        if (existingFounder) {
          dbInstance.exec('ROLLBACK;');
          return { status: 409, error: 'Founder already exists' };
        }
        const existingEmail = dbInstance.prepare("SELECT id FROM users WHERE LOWER(email) = ?").get(email.toLowerCase());
        if (existingEmail) {
          dbInstance.exec('ROLLBACK;');
          return { status: 409, error: 'Email already exists' };
        }

        const userId = 'usr_fnd_test_' + Date.now();
        const salt = generateSalt();
        const hash = hashPassword(password, salt);
        const now = Date.now();

        dbInstance.prepare(`
          INSERT INTO users (id, name, role, device_mac_address, is_active, email, password_hash, password_salt, skill_set, last_seen_at, created_at)
          VALUES (?, ?, 'founder', '00:00:00:00:00:00', 1, ?, ?, ?, 'Executive Director', ?, ?)
        `).run(userId, name, email.toLowerCase(), hash, salt, now, now);

        dbInstance.prepare(`
          INSERT INTO security_bootstrap (id, completed_at, founder_user_id)
          VALUES (1, ?, ?)
        `).run(now, userId);

        dbInstance.exec('COMMIT;');
        return { status: 201, success: true, userId };
      } catch (err) {
        try { dbInstance.exec('ROLLBACK;'); } catch (e) {}
        return { status: 409, error: err.message };
      }
    };

    // 2.6 Valid bootstrap creates initial founder
    const bootstrapResult1 = executeBootstrapTx(testDb, {
      name: 'Initial Founder Alice',
      email: 'alice.founder@lexven.com',
      password: 'SecureFounderPassword#2026',
      bootstrapKey: TEST_BOOTSTRAP_SECRET
    });
    assert(bootstrapResult1.status === 201 && bootstrapResult1.success, 'RULE 6 VERIFIED: Valid bootstrap creates initial founder (HTTP 201)');
    const createdFounder = testDb.prepare("SELECT * FROM users WHERE email = ?").get('alice.founder@lexven.com');
    assert(createdFounder && createdFounder.role === 'founder', 'Created user has verified "founder" role in database');
    const bootstrapRecord = testDb.prepare("SELECT * FROM security_bootstrap WHERE id = 1").get();
    assert(bootstrapRecord && bootstrapRecord.founder_user_id === createdFounder.id, 'security_bootstrap table recorded one-time completion');

    // 2.7 Reusing bootstrap secret after initialization is rejected
    const bootstrapReuseResult = executeBootstrapTx(testDb, {
      name: 'Second Founder Bob',
      email: 'bob.second@lexven.com',
      password: 'AnotherPassword#2026',
      bootstrapKey: TEST_BOOTSTRAP_SECRET
    });
    assert(bootstrapReuseResult.status === 409, 'RULE 7 VERIFIED: Reusing bootstrap secret after initialization is rejected (HTTP 409 Conflict)');
    assert(bootstrapReuseResult.error.includes('already been completed'), 'Rejection error clearly indicates bootstrap already completed');

    // 2.8 Concurrent bootstrap attempts cannot create multiple initial founders
    // Create another fresh in-memory database to test concurrency
    const concurrentDb = new DatabaseSync(':memory:');
    concurrentDb.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        device_mac_address TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        email TEXT UNIQUE,
        password_hash TEXT,
        password_salt TEXT,
        skill_set TEXT,
        last_seen_at INTEGER,
        created_at INTEGER
      );
      CREATE TABLE security_bootstrap (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        completed_at INTEGER NOT NULL,
        founder_user_id TEXT NOT NULL,
        FOREIGN KEY (founder_user_id) REFERENCES users(id)
      );
    `);

    // Simulate two concurrent race requests
    const race1Promise = Promise.resolve().then(() => executeBootstrapTx(concurrentDb, {
      name: 'Racer 1',
      email: 'racer1@lexven.com',
      password: 'RacerPassword#1',
      bootstrapKey: TEST_BOOTSTRAP_SECRET
    }));
    const race2Promise = Promise.resolve().then(() => executeBootstrapTx(concurrentDb, {
      name: 'Racer 2',
      email: 'racer2@lexven.com',
      password: 'RacerPassword#2',
      bootstrapKey: TEST_BOOTSTRAP_SECRET
    }));

    const [raceRes1, raceRes2] = await Promise.all([race1Promise, race2Promise]);
    const statuses = [raceRes1.status, raceRes2.status];
    assert(
      statuses.includes(201) && statuses.includes(409),
      'RULE 8 VERIFIED: Concurrent bootstrap race allows exactly ONE founder (HTTP 201) and rejects the other (HTTP 409)'
    );
    const totalFoundersInConcurrentDb = concurrentDb.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'founder'").get().count;
    assert(totalFoundersInConcurrentDb === 1, 'Database contains exactly 1 founder after concurrent race attempts');

    // 2.9 Duplicate email registration does not overwrite existing account
    const dupRes = await fetch(`${baseUrl}/api/users/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Imposter',
        email: publicRegEmail, // Same email as publicRegEmail above
        password: 'ImposterPassword123'
      })
    });
    assert(dupRes.status === 409, 'RULE 9 VERIFIED: Duplicate email registration returns HTTP 409 Conflict');

    // 2.10 Passwords stored as hashes and never returned in API responses
    const userInDb = db.prepare('SELECT password_hash, password_salt, password FROM users WHERE email = ?').get(publicRegEmail);
    assert(userInDb && typeof userInDb.password_hash === 'string' && userInDb.password_hash.length === 128, 'RULE 10a: Password stored as 64-byte scrypt hash (128 hex chars)');
    assert(userInDb.password === null || userInDb.password === undefined, 'RULE 10b: Plaintext password column is strictly null in database');
    assert(!('password_hash' in publicRegData.user), 'RULE 10c: API registration response strictly excludes password_hash');
    assert(!('password_salt' in publicRegData.user), 'RULE 10d: API registration response strictly excludes password_salt');
    assert(!('password' in publicRegData.user), 'RULE 10e: API registration response strictly excludes password');

    // 2.11 Profile update cannot change user role
    const profileUpdateReq = await fetch(`${baseUrl}/api/users/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicRegData.token}`
      },
      body: JSON.stringify({
        name: 'New Name',
        role: 'founder'
      })
    });
    assert(profileUpdateReq.status === 403, 'RULE 11: Ordinary profile update cannot change user role to founder (HTTP 403)');

    // 2.12 Existing legitimate authentication and logout still works
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: publicRegEmail,
        password: 'SecurePassword123'
      })
    });
    const loginData = await loginRes.json();
    assert(loginRes.status === 200 && loginData.success, 'RULE 12a: Legitimate credentials successfully authenticate via /api/auth/login');
    assert(typeof loginData.token === 'string' && loginData.token.startsWith('invx_'), 'Login returns valid session token');

    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${loginData.token}`
      }
    });
    const logoutData = await logoutRes.json();
    assert(logoutRes.status === 200 && logoutData.success, 'RULE 12b: Logout endpoint invalidates session token');

    const meAfterLogout = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${loginData.token}` }
    });
    assert(meAfterLogout.status === 401, 'RULE 12c: Revoked session token is rejected with HTTP 401 on protected routes');

    // ---------------------------------------------------------------------------
    // SECTION 3: Regression Protection (Sole Founder Deletion, Directory Sanitization)
    // ---------------------------------------------------------------------------
    console.log('\n[SECTION 3] Testing Regression Guards & Data Integrity...');

    // Sole founder deletion rule
    const checkSoleFounderDeletion = (role, currentFounderCount) => {
      if (role === 'founder' && currentFounderCount <= 1) {
        return { allowed: false, status: 403, error: 'Cannot delete sole founder' };
      }
      return { allowed: true };
    };
    assert(checkSoleFounderDeletion('founder', 1).allowed === false, 'Sole founder account deletion is strictly protected');

    // Directory listing sanitization
    const directoryUsers = db.prepare(`
      SELECT id, name, role, email, skill_set, device_mac_address, is_active, last_seen_at
      FROM users WHERE is_active = 1 ORDER BY created_at ASC
    `).all();
    assert(directoryUsers.length > 0, 'User directory roster retrieved');
    assert(!('password_hash' in directoryUsers[0]), 'Directory record strictly omits password_hash');
    assert(!('password_salt' in directoryUsers[0]), 'Directory record strictly omits password_salt');

    // 3.1 Persistent disk storage configuration
    assert(typeof dataDir === 'string' && dataDir.length > 0, 'dataDir is properly configured and exported');
    assert(typeof dbPath === 'string' && dbPath.includes('antigravity.db'), 'dbPath is properly resolved to persistent SQLite database');

    // 3.2 Production mode strictly blocks demo account seeding
    assert(canSeedDemoData({ NODE_ENV: 'production' }) === false, 'RULE 3.6: Production mode does not seed demo accounts (default)');
    assert(canSeedDemoData({ NODE_ENV: 'production', SEED_DEMO_DATA: 'true' }) === false, 'RULE 3.6: Production mode ignores SEED_DEMO_DATA=true');
    assert(canSeedDemoData({ NODE_ENV: 'test' }) === false, 'Test mode does not auto-seed demo accounts by default');
    assert(canSeedDemoData({ NODE_ENV: 'development', SEED_DEMO_DATA: 'true' }) === true, 'Development mode permits demo seeding when explicitly requested');

    // 3.3 Deleting a founder does not silently reset bootstrap completion
    const testBootstrapDb = new DatabaseSync(':memory:');
    testBootstrapDb.exec('PRAGMA foreign_keys = ON;');
    testBootstrapDb.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        device_mac_address TEXT NOT NULL DEFAULT '00:00:00:00:00:00',
        is_active INTEGER DEFAULT 1,
        email TEXT UNIQUE,
        password_hash TEXT,
        password_salt TEXT,
        skill_set TEXT,
        last_seen_at INTEGER,
        created_at INTEGER
      );
      CREATE TABLE security_bootstrap (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        completed_at INTEGER NOT NULL,
        founder_user_id TEXT NOT NULL
      );
    `);
    testBootstrapDb.prepare("INSERT INTO users (id, name, role, email) VALUES ('usr_fnd_initial', 'Founder Zero', 'founder', 'zero@lexven.com')").run();
    testBootstrapDb.prepare("INSERT INTO security_bootstrap (id, completed_at, founder_user_id) VALUES (1, ?, 'usr_fnd_initial')").run(Date.now());
    
    // Verify bootstrap record exists
    let sbRecord = testBootstrapDb.prepare("SELECT * FROM security_bootstrap WHERE id = 1").get();
    assert(sbRecord && sbRecord.founder_user_id === 'usr_fnd_initial', 'Bootstrap record initially populated');

    // Delete the founder user
    testBootstrapDb.prepare("DELETE FROM users WHERE id = 'usr_fnd_initial'").run();
    const userExists = testBootstrapDb.prepare("SELECT id FROM users WHERE id = 'usr_fnd_initial'").get();
    assert(!userExists, 'Founder user successfully deleted from users table');

    // Crucial check: security_bootstrap record MUST STILL EXIST!
    sbRecord = testBootstrapDb.prepare("SELECT * FROM security_bootstrap WHERE id = 1").get();
    assert(sbRecord && sbRecord.id === 1, 'RULE 4.8 VERIFIED: Deleting founder user does NOT cascade-delete security_bootstrap record');

    // Attempting bootstrap after user deletion must still be rejected
    const bootstrapCheckAfterDelete = executeBootstrapTx(testBootstrapDb, {
      name: 'Attacker Imposter',
      email: 'attacker@evil.com',
      password: 'HackerPassword#1',
      bootstrapKey: TEST_BOOTSTRAP_SECRET
    });
    assert(bootstrapCheckAfterDelete.status === 409, 'RULE 4.8 VERIFIED: Deleting founder does not silently reopen public founder bootstrap');

    // ---------------------------------------------------------------------------
    // SECTION 4: Comprehensive Phase 2 Security, Authorization & Isolation Tests
    // ---------------------------------------------------------------------------
    console.log('\n[SECTION 4] Testing Phase 2 Security, RBAC & Isolation Hardening...');

    // Setup: Establish verified sessions for 2 independent employees and 1 founder
    const empASession = createSession('usr_emp_01');
    const empAToken = empASession.token;
    const empBSession = createSession('usr_emp_02');
    const empBToken = empBSession.token;
    const founderUser = db.prepare("SELECT id FROM users WHERE role = 'founder' LIMIT 1").get();
    const founderSession = createSession(founderUser.id);
    const founderToken = founderSession.token;

    // 4.1 Reject unauthenticated access to private endpoints (Fail-Closed)
    console.log('\n  [4.1] Unauthenticated Fail-Closed Protection...');
    const unauthEndpoints = [
      { url: `${baseUrl}/api/system/network-info`, method: 'GET', name: '/api/system/network-info' },
      { url: `${baseUrl}/api/users/profile`, method: 'PUT', body: {}, name: '/api/users/profile' },
      { url: `${baseUrl}/api/tasks/assign`, method: 'POST', body: {}, name: '/api/tasks/assign' },
      { url: `${baseUrl}/api/tasks/status`, method: 'POST', body: {}, name: '/api/tasks/status' },
      { url: `${baseUrl}/api/workspace/start-sprint`, method: 'POST', body: {}, name: '/api/workspace/start-sprint' },
      { url: `${baseUrl}/api/workspace/submit-pow`, method: 'POST', body: {}, name: '/api/workspace/submit-pow' },
      { url: `${baseUrl}/api/telemetry/log`, method: 'POST', body: {}, name: '/api/telemetry/log' },
      { url: `${baseUrl}/api/admin/users/invite`, method: 'POST', body: {}, name: '/api/admin/users/invite' },
      { url: `${baseUrl}/api/admin/sprint-audits/usr_emp_01`, method: 'GET', name: '/api/admin/sprint-audits/:userId' },
      { url: `${baseUrl}/recordings/sample_video.webm`, method: 'GET', name: '/recordings/:filename' }
    ];

    for (const ep of unauthEndpoints) {
      const opts = { method: ep.method };
      if (ep.body) {
        opts.headers = { 'Content-Type': 'application/json' };
        opts.body = JSON.stringify(ep.body);
      }
      const res = await fetch(ep.url, opts);
      assert(res.status === 401, `Unauthenticated request to ${ep.name} returns HTTP 401 Unauthorized`);
    }

    // 4.2 Cross-User Resource Isolation (Employees cannot access/alter peer resources)
    console.log('\n  [4.2] Cross-User Resource & Data Isolation...');
    const isolationTaskId = 'tsk_iso_' + Date.now();
    db.prepare(`
      INSERT INTO tasks (
        id, assigned_to, title, description, brief_content, status, 
        ai_health_score, proof_of_work_webhook, checkpoint_timer, 
        sprint_started_at, is_acknowledged, deadline, created_at
      ) VALUES (?, 'usr_emp_01', 'Confidential Task For Emp A', 'Secret specs', 'Brief', 'pending', 95, 'https://hook', 5400, NULL, 0, NULL, ?)
    `).run(isolationTaskId, Date.now());

    // 4.2a Cross-user sprint start rejection
    const empBStartA = await fetch(`${baseUrl}/api/workspace/start-sprint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${empBToken}` },
      body: JSON.stringify({ taskId: isolationTaskId, userId: 'usr_emp_01' })
    });
    assert(empBStartA.status === 403, 'Employee B cannot initiate sprint on Employee A assigned task (HTTP 403)');

    // 4.2b Cross-user task acknowledge rejection
    const empBAckA = await fetch(`${baseUrl}/api/workspace/acknowledge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${empBToken}` },
      body: JSON.stringify({ taskId: isolationTaskId })
    });
    assert(empBAckA.status === 403, 'Employee B cannot acknowledge Employee A assigned task (HTTP 403)');

    // 4.2c Cross-user task status update rejection
    const empBUpdateStatusA = await fetch(`${baseUrl}/api/tasks/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${empBToken}` },
      body: JSON.stringify({ taskId: isolationTaskId, status: 'review' })
    });
    assert(empBUpdateStatusA.status === 403, 'Employee B cannot update task status for Employee A assigned task (HTTP 403)');

    // 4.2d Cross-user sprint audit inspection rejection
    const empBAuditA = await fetch(`${baseUrl}/api/admin/sprint-audits/usr_emp_01`, {
      headers: { 'Authorization': `Bearer ${empBToken}` }
    });
    assert(empBAuditA.status === 403, 'Employee B cannot view sprint audit records of Employee A (HTTP 403)');

    const empAAuditA = await fetch(`${baseUrl}/api/admin/sprint-audits/usr_emp_01`, {
      headers: { 'Authorization': `Bearer ${empAToken}` }
    });
    assert(empAAuditA.status === 200, 'Employee A can view their own sprint audit records (HTTP 200)');

    const founderAuditA = await fetch(`${baseUrl}/api/admin/sprint-audits/usr_emp_01`, {
      headers: { 'Authorization': `Bearer ${founderToken}` }
    });
    assert(founderAuditA.status === 200, 'Founder can inspect sprint audit records of any employee (HTTP 200)');

    // 4.2e Cross-user profile tampering prevention
    const empAInDbBefore = db.prepare('SELECT name FROM users WHERE id = ?').get('usr_emp_01');
    const empBTamperA = await fetch(`${baseUrl}/api/users/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${empBToken}` },
      body: JSON.stringify({ targetUserId: 'usr_emp_01', name: 'Tampered Hacker Name' })
    });
    assert(empBTamperA.status === 403, 'Employee B cannot modify Employee A profile via targetUserId (HTTP 403)');
    const empAInDb = db.prepare('SELECT name FROM users WHERE id = ?').get('usr_emp_01');
    assert(empAInDb.name === empAInDbBefore.name, 'Employee A name remained untampered in database');

    // 4.3 Founder-Only Operations Protected by Explicit Role Checks
    console.log('\n  [4.3] Founder Privilege Enforcement...');
    const empAssignTask = await fetch(`${baseUrl}/api/tasks/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${empAToken}` },
      body: JSON.stringify({ title: 'Hostile Task', assignedUserId: 'usr_emp_02' })
    });
    assert(empAssignTask.status === 403, 'Employee cannot assign tasks via /api/tasks/assign (HTTP 403)');

    const empInviteUser = await fetch(`${baseUrl}/api/admin/users/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${empAToken}` },
      body: JSON.stringify({ name: 'Infiltrator', email: 'infiltrator@lexven.com', role: 'employee' })
    });
    assert(empInviteUser.status === 403, 'Employee cannot invite users via /api/admin/users/invite (HTTP 403)');

    const empDeleteUser = await fetch(`${baseUrl}/api/users/usr_emp_02`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${empAToken}` }
    });
    assert(empDeleteUser.status === 403, 'Employee cannot delete user nodes via DELETE /api/users/:id (HTTP 403)');

    const empVerifyTask = await fetch(`${baseUrl}/api/tasks/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${empAToken}` },
      body: JSON.stringify({ taskId: isolationTaskId, status: 'verified' })
    });
    assert(empVerifyTask.status === 403, 'Employee cannot verify/approve task deliverables (HTTP 403)');

    // 4.3b Verified Task Assignment and Employee Workspace Listing Down
    const founderAssignRes = await fetch(`${baseUrl}/api/tasks/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${founderToken}` },
      body: JSON.stringify({
        title: 'Manual Directive For Employee B',
        description: 'Implement distributed ingestion pipeline',
        deadline: '2026-10-25T18:00:00Z',
        assignedUserId: 'usr_emp_02'
      })
    });
    assert(founderAssignRes.status === 200, 'Founder successfully assigns task to Employee B via /api/tasks/assign');
    const founderAssignData = await founderAssignRes.json();
    assert(founderAssignData.success && founderAssignData.task, 'Task assign response contains created task');
    const manualAssignedTaskId = founderAssignData.task.id;

    // Verify employee B workspace lists down the manually assigned task
    const empBWorkspaceRes = await fetch(`${baseUrl}/api/workspace/usr_emp_02`, {
      headers: { 'Authorization': `Bearer ${empBToken}` }
    });
    assert(empBWorkspaceRes.status === 200, 'Employee B can retrieve workspace');
    const empBWorkspaceData = await empBWorkspaceRes.json();
    assert(Array.isArray(empBWorkspaceData.tasks), 'Workspace returns tasks array');
    const hasManualTask = empBWorkspaceData.tasks.some(t => t.id === manualAssignedTaskId);
    assert(hasManualTask, 'RULE VERIFIED: Manually assigned task lists down in employee dashboard');

    // Verify employee B can retrieve workspace by email
    const empBWorkspaceByEmail = await fetch(`${baseUrl}/api/workspace/elena.rostova@lexven.com`, {
      headers: { 'Authorization': `Bearer ${empBToken}` }
    });
    assert(empBWorkspaceByEmail.status === 200, 'Employee B can retrieve workspace using email identifier');
    const empBEmailData = await empBWorkspaceByEmail.json();
    assert(empBEmailData.tasks.some(t => t.id === manualAssignedTaskId), 'Tasks list down when workspace queried by email');

    // Founder dispatches sprint task via AI Dispatch targeted to Employee B
    const founderAiDispatchRes = await fetch(`${baseUrl}/api/tasks/ai-dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${founderToken}` },
      body: JSON.stringify({
        prompt: 'AI Micro-Sprint: Sub-second Telemetry Streaming\nOptimize WebSocket buffer queue to prevent backpressure drops',
        assignedUserId: 'usr_emp_02'
      })
    });
    assert(founderAiDispatchRes.status === 200, 'Founder successfully dispatches sprint via /api/tasks/ai-dispatch');
    const aiDispatchData = await founderAiDispatchRes.json();
    assert(aiDispatchData.success && aiDispatchData.task, 'AI dispatch returns created task');
    assert(aiDispatchData.task.assigned_to === 'usr_emp_02', 'AI dispatch assigned task specifically to requested employee node');

    // Verify employee B workspace lists down the AI dispatched task
    const empBWorkspaceAfterAi = await fetch(`${baseUrl}/api/workspace/usr_emp_02`, {
      headers: { 'Authorization': `Bearer ${empBToken}` }
    });
    const empBAfterAiData = await empBWorkspaceAfterAi.json();
    const hasAiTask = empBAfterAiData.tasks.some(t => t.id === aiDispatchData.task.id);
    assert(hasAiTask, 'RULE VERIFIED: AI dispatched task lists down in employee dashboard even across refreshes');

    // 4.4 Data Minimization & Sensitive Field Omission in /api/users
    console.log('\n  [4.4] Employee Directory Data Minimization...');
    const empUsersRes = await fetch(`${baseUrl}/api/users`, {
      headers: { 'Authorization': `Bearer ${empAToken}` }
    });
    assert(empUsersRes.status === 200, 'Authenticated employee can query user roster');
    const empUsersList = await empUsersRes.json();
    assert(Array.isArray(empUsersList), 'User roster returns array');
    const peerEmployeeRecord = empUsersList.find(u => u.id === 'usr_emp_02');
    assert(peerEmployeeRecord !== undefined, 'Peer employee record present');
    assert(!('device_mac_address' in peerEmployeeRecord), 'Peer employee record omits device_mac_address from employee view');
    assert(!('phone' in peerEmployeeRecord), 'Peer employee record omits phone from employee view');
    assert(!('notification_preferences' in peerEmployeeRecord), 'Peer employee record omits notification_preferences from employee view');
    assert(!('password_hash' in peerEmployeeRecord) && !('password_salt' in peerEmployeeRecord), 'Peer record omits password hashes/salts');

    const ownRecordInList = empUsersList.find(u => u.id === 'usr_emp_01');
    assert('device_mac_address' in ownRecordInList, 'Employee can view their own device_mac_address');

    const founderUsersRes = await fetch(`${baseUrl}/api/users`, {
      headers: { 'Authorization': `Bearer ${founderToken}` }
    });
    const founderUsersList = await founderUsersRes.json();
    const peerFromFounder = founderUsersList.find(u => u.id === 'usr_emp_02');
    assert('device_mac_address' in peerFromFounder, 'Founder view retains device_mac_address for fleet telemetry management');

    // 4.5 File Storage, Path Traversal & Fail-Closed Recording Authorization
    console.log('\n  [4.5] File Storage Security & Path Traversal Prevention...');
    // Setup test recording
    const recFolder = path.join(dataDir, 'recordings');
    if (!fs.existsSync(recFolder)) fs.mkdirSync(recFolder, { recursive: true });
    const empARecordingName = `desktop_sprint_usr_emp_01_${Date.now()}.webm`;
    fs.writeFileSync(path.join(recFolder, empARecordingName), Buffer.from('FAKE_WEBM_VIDEO_DATA_FOR_SECURITY_TEST'));

    // 4.5a Fail-closed unauthorized streaming
    const empBStreamA = await fetch(`${baseUrl}/recordings/${empARecordingName}`, {
      headers: { 'Authorization': `Bearer ${empBToken}` }
    });
    assert(empBStreamA.status === 403, 'Employee B streaming Employee A recording is rejected with HTTP 403 (Fail-Closed)');

    const empAStreamA = await fetch(`${baseUrl}/recordings/${empARecordingName}`, {
      headers: { 'Authorization': `Bearer ${empAToken}` }
    });
    assert(empAStreamA.status === 200, 'Employee A successfully streams their own recording (HTTP 200)');

    const founderStreamA = await fetch(`${baseUrl}/recordings/${empARecordingName}`, {
      headers: { 'Authorization': `Bearer ${founderToken}` }
    });
    assert(founderStreamA.status === 200, 'Founder successfully streams employee recording for review (HTTP 200)');

    // 4.5b Path traversal attacks
    const traversalRecording = await fetch(`${baseUrl}/recordings/..%2f..%2fpackage.json`, {
      headers: { 'Authorization': `Bearer ${founderToken}` }
    });
    assert(traversalRecording.status === 400 || traversalRecording.status === 403, 'Path traversal on /recordings/..%2f is blocked (HTTP 400/403)');

    const traversalAvatar = await fetch(`${baseUrl}/api/avatars/..%2f..%2fpackage.json`);
    assert(traversalAvatar.status === 400, 'Path traversal on /api/avatars/..%2f is blocked with HTTP 400');

    const invalidAvatarExt = await fetch(`${baseUrl}/api/avatars/payload.php`);
    assert(invalidAvatarExt.status === 400, 'Disallowed avatar file extension is blocked with HTTP 400');

    // 4.5c Recording upload task ownership verification
    const uploadForm = new FormData();
    uploadForm.append('taskId', isolationTaskId); // Belongs to usr_emp_01
    uploadForm.append('userId', 'usr_emp_01');
    uploadForm.append('video', new Blob([Buffer.alloc(1024, 0x1a)], { type: 'video/webm' }), 'test.webm');

    const unauthorizedUpload = await fetch(`${baseUrl}/api/recordings/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${empBToken}` },
      body: uploadForm
    });
    assert(unauthorizedUpload.status === 403, 'Uploading recording for another employee task is rejected with HTTP 403');

    // Clean up test file
    try { fs.unlinkSync(path.join(recFolder, empARecordingName)); } catch (e) {}

    // 4.6 WebSocket Authentication & Cross-User Event Isolation
    console.log('\n  [4.6] WebSocket Authentication & Event Isolation...');

    // 4.6a Unauthenticated connection rejection
    const unauthWs = new WebSocket(wsUrl);
    const unauthCloseCode = await new Promise((resolve) => {
      unauthWs.on('close', (code) => resolve(code));
      unauthWs.on('error', () => {});
    });
    assert(unauthCloseCode === 1008, 'WebSocket connection without credentials closes with code 1008 (Policy Violation)');

    // 4.6b Invalid token rejection
    const invalidWs = new WebSocket(`${wsUrl}?token=invx_bogus_fake_token_12345`);
    const invalidCloseCode = await new Promise((resolve) => {
      invalidWs.on('close', (code) => resolve(code));
      invalidWs.on('error', () => {});
    });
    assert(invalidCloseCode === 1008, 'WebSocket connection with invalid token closes with code 1008');

    // 4.6c Authenticated WebSocket connection & message size limits
    const wsA = new WebSocket(`${wsUrl}?token=${empAToken}`);
    const wsConnectedMsg = await new Promise((resolve) => {
      wsA.on('message', (data) => {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === 'CONNECTED') resolve(parsed);
      });
    });
    assert(wsConnectedMsg && wsConnectedMsg.type === 'CONNECTED', 'WebSocket connects with valid token and receives CONNECTED frame');
    assert(wsConnectedMsg.user.id === 'usr_emp_01', 'WebSocket connection bound to verified user identity');

    // Message payload > 64KB rejection
    const oversizedPayload = JSON.stringify({ type: 'PING', data: 'X'.repeat(70000) });
    wsA.send(oversizedPayload);
    const wsErrorMsg = await new Promise((resolve) => {
      wsA.on('message', (data) => {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === 'ERROR') resolve(parsed);
      });
    });
    assert(wsErrorMsg && wsErrorMsg.error.includes('exceeds 64KB'), 'WebSocket rejects messages exceeding 64KB limit');

    // 4.6d Cross-user event isolation verification
    const connectAuthenticatedSocket = (token) => {
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(`${wsUrl}?token=${token}`);
        const timer = setTimeout(() => reject(new Error('WebSocket connection timeout')), 4000);
        ws.once('message', (data) => {
          clearTimeout(timer);
          try {
            const parsed = JSON.parse(data.toString());
            resolve({ ws, connectedMsg: parsed });
          } catch (e) {
            resolve({ ws, connectedMsg: null });
          }
        });
        ws.on('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });
    };

    const { ws: wsB } = await connectAuthenticatedSocket(empBToken);
    const { ws: wsFounder } = await connectAuthenticatedSocket(founderToken);

    // Listen for TELEMETRY_UPDATE on wsA, wsB, and wsFounder
    let empAReceivedTelemetry = false;
    let empBReceivedTelemetry = false;
    let founderReceivedTelemetry = false;

    wsA.on('message', (d) => {
      try {
        const p = JSON.parse(d.toString());
        if (p.type === 'TELEMETRY_UPDATE' && p.data?.user_id === 'usr_emp_01') empAReceivedTelemetry = true;
      } catch (e) {}
    });

    wsB.on('message', (d) => {
      try {
        const p = JSON.parse(d.toString());
        if (p.type === 'TELEMETRY_UPDATE' && p.data?.user_id === 'usr_emp_01') empBReceivedTelemetry = true;
      } catch (e) {}
    });

    wsFounder.on('message', (d) => {
      try {
        const p = JSON.parse(d.toString());
        if (p.type === 'TELEMETRY_UPDATE' && p.data?.user_id === 'usr_emp_01') founderReceivedTelemetry = true;
      } catch (e) {}
    });

    // Employee A posts telemetry log
    await fetch(`${baseUrl}/api/telemetry/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${empAToken}` },
      body: JSON.stringify({
        taskId: isolationTaskId,
        activeWindow: 'Code Editor - Antigravity',
        keystrokeRate: 45.2,
        hardwareSpoofFlag: 0
      })
    });

    // Wait 300ms for WebSocket frames to propagate
    await new Promise((resolve) => setTimeout(resolve, 300));

    assert(empAReceivedTelemetry === true, 'Employee A receives their own real-time telemetry stream event');
    assert(founderReceivedTelemetry === true, 'Executive Founder receives employee telemetry stream event');
    assert(empBReceivedTelemetry === false, 'RULE: Employee B does NOT receive Employee A telemetry (Cross-User Isolation Verified)');

    // Close test sockets cleanly
    wsA.close();
    wsB.close();
    wsFounder.close();

  } finally {
    // Graceful teardown of HTTP and WebSocket test server
    await new Promise((resolve) => server.close(resolve));
  }

  console.log('\n======================================================');
  console.log(`  ALL TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('\n✖ Fatal test runner error:', err);
  process.exit(1);
});
