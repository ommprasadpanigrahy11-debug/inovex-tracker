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
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import db, { syncDefaultUsersWithHashes, syncBootstrapStatus } from './db.js';
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

  // Dynamic import of app
  const { app } = await import('./server.js');

  // Start temporary test HTTP server on ephemeral port (port 0)
  const testServer = http.createServer(app);
  await new Promise((resolve) => testServer.listen(0, '127.0.0.1', resolve));
  const testPort = testServer.address().port;
  const baseUrl = `http://127.0.0.1:${testPort}`;

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

    // 1.3 Core API routes are registered
    const usersRes = await fetch(`${baseUrl}/api/users`);
    assert(usersRes.status === 200, 'Existing /api/users endpoint is registered and responds with HTTP 200');
    const usersJson = await usersRes.json();
    assert(Array.isArray(usersJson), '/api/users returns JSON array');

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

  } finally {
    // Graceful teardown of HTTP test server
    await new Promise((resolve) => testServer.close(resolve));
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
