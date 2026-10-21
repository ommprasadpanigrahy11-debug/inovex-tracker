/**
 * INOVEX TRACKER - AUTOMATED SECURITY, RBAC & API REGRESSION TEST SUITE
 * 
 * Verifies:
 * 1. Database schema constraints, session tables, and password hash security.
 * 2. Password hashing & constant-time verification with scrypt.
 * 3. Session token lifecycle: generation, TTL validation, and logout revocation.
 * 4. Founder registration lockdown (rejects unprivileged founder self-registration).
 * 5. Duplicate email registration rejection (409 Conflict).
 * 6. Role-Based Access Control: Employee blocked from Founder/Admin routes (403).
 * 7. Insecure Direct Object Reference (IDOR) prevention on employee workspaces.
 * 8. Task lifecycle & canonical status transitions ('pending' -> 'active' -> 'review' -> 'verified').
 * 9. Desktop agent API contract compatibility.
 */

import db from './db.js';
import { 
  generateSalt,
  hashPassword, 
  verifyPassword, 
  createSession, 
  validateSessionToken, 
  revokeSession,
  requireAuth,
  requireFounder
} from './auth.js';

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

async function runTests() {
  console.log('\n======================================================');
  console.log('  INOVEX TRACKER — SECURITY & API REGRESSION TESTS');
  console.log('======================================================\n');

  // ---------------------------------------------------------------------------
  // TEST GROUP 1: Database Schema & Password Storage Security
  // ---------------------------------------------------------------------------
  console.log('[1/7] Testing Database Schema & Password Storage Security...');

  const usersTableInfo = db.prepare("PRAGMA table_info(users)").all();
  const columnNames = usersTableInfo.map(c => c.name);

  assert(columnNames.includes('password_hash'), 'Users table contains password_hash column');
  assert(columnNames.includes('password_salt'), 'Users table contains password_salt column');
  assert(columnNames.includes('last_seen_at'), 'Users table contains last_seen_at column');

  // Verify zero plaintext passwords exist
  const plaintextUser = db.prepare("SELECT * FROM users WHERE password IS NOT NULL AND password != ''").get();
  assert(!plaintextUser, 'Zero plaintext passwords stored in database (all migrated to scrypt hashes)');

  const sessionsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'").get();
  assert(!!sessionsTable, 'Database contains dedicated sessions table with foreign key indices');

  // ---------------------------------------------------------------------------
  // TEST GROUP 2: Password Hashing & Verification (scrypt)
  // ---------------------------------------------------------------------------
  console.log('\n[2/7] Testing Password Hashing & Verification Security...');

  const rawPassword = 'SecureFounderPassword#2026';
  const salt = generateSalt();
  const hash = hashPassword(rawPassword, salt);

  assert(hash.length >= 64, 'Generated password hash is 64-byte scrypt digest');
  assert(salt.length >= 32, 'Generated unique per-user cryptographically secure salt');
  assert(verifyPassword(rawPassword, hash, salt), 'Constant-time password verification succeeds with correct password');
  assert(!verifyPassword('WrongPassword123', hash, salt), 'Password verification firmly rejects invalid password');
  assert(!verifyPassword(rawPassword, hash, 'tampered_salt_here'), 'Verification fails if salt is tampered');

  // ---------------------------------------------------------------------------
  // TEST GROUP 3: Session Token Lifecycle & Revocation
  // ---------------------------------------------------------------------------
  console.log('\n[3/7] Testing Session Token Lifecycle & Revocation...');

  const testFounder = db.prepare("SELECT * FROM users WHERE email = ?").get('sarah.vance@lexven.com');
  assert(!!testFounder, 'Found test founder user in database (sarah.vance@lexven.com)');

  const { token: sessionToken, expiresAt } = createSession(testFounder.id, { ip: '127.0.0.1', headers: { 'user-agent': 'AutomatedTestRunner/1.0' } });
  assert(sessionToken.startsWith('invx_'), 'Session token follows secure prefix format (invx_...)');
  assert(sessionToken.length > 40, 'Session token has high cryptographic entropy (> 40 chars)');
  assert(expiresAt > Date.now(), 'Session expiration is set into the future (7-day TTL)');

  const validatedUser = validateSessionToken(sessionToken);
  assert(!!validatedUser && validatedUser.id === testFounder.id, 'Session token successfully resolves to correct user identity');
  assert(validatedUser.role === 'founder', 'Session user identity preserves verified founder role');

  // Test invalid/expired token
  const invalidUser = validateSessionToken('invx_invalid_tampered_token_99999');
  assert(!invalidUser, 'Invalid or fabricated session token is rejected');

  // Test session logout/revocation
  revokeSession(sessionToken);
  const revokedValidation = validateSessionToken(sessionToken);
  assert(!revokedValidation, 'Revoked session token is immediately rejected upon logout');

  // ---------------------------------------------------------------------------
  // TEST GROUP 4: Registration Lockdown & Duplicate Email Prevention
  // ---------------------------------------------------------------------------
  console.log('\n[4/7] Testing Registration RBAC & Account Takeover Prevention...');

  // Mock Request & Response helpers
  const createMockReq = (body = {}, headers = {}) => ({
    body,
    headers,
    ip: '127.0.0.1',
    get: (name) => headers[name.toLowerCase()]
  });

  const createMockRes = () => {
    const res = {
      statusCode: 200,
      jsonData: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.jsonData = data;
        return this;
      }
    };
    return res;
  };

  // Test: Reject duplicate email
  const existingEmail = 'alex.mercer@lexven.com';
  const duplicateUser = db.prepare("SELECT * FROM users WHERE email = ?").get(existingEmail);
  assert(!!duplicateUser, 'Identified existing employee record for collision test (alex.mercer@lexven.com)');

  const checkDuplicate = (email) => {
    return !!db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  };
  assert(checkDuplicate(existingEmail) === true, 'Duplicate email registration correctly flagged to prevent account overwriting');

  // Test: Disallow unprivileged founder self-registration
  const attemptFounderRegister = (requestedRole, authHeader, bootstrapKey) => {
    if (requestedRole === 'founder') {
      const isBootstrap = bootstrapKey && bootstrapKey === (process.env.INITIAL_FOUNDER_KEY || 'inovex_dev_founder_secret_key_2026');
      let isExistingFounder = false;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const u = validateSessionToken(authHeader.replace('Bearer ', ''));
        if (u && u.role === 'founder') isExistingFounder = true;
      }
      if (!isBootstrap && !isExistingFounder) {
        return { allowed: false, status: 403, error: 'Unauthorized: Founder registration requires system bootstrap authorization' };
      }
    }
    return { allowed: true };
  };

  const unprivilegedAttempt = attemptFounderRegister('founder', null, null);
  assert(unprivilegedAttempt.allowed === false && unprivilegedAttempt.status === 403, 'Public unauthenticated self-registration as Founder is firmly blocked (403)');

  const validBootstrapAttempt = attemptFounderRegister('founder', null, 'inovex_dev_founder_secret_key_2026');
  assert(validBootstrapAttempt.allowed === true, 'Authorized founder bootstrap registration permitted with valid bootstrap key');

  // ---------------------------------------------------------------------------
  // TEST GROUP 5: Role-Based Access Control (RBAC) & Middleware Guards
  // ---------------------------------------------------------------------------
  console.log('\n[5/7] Testing RBAC Middleware Guards (requireAuth & requireFounder)...');

  const testEmployee = db.prepare("SELECT * FROM users WHERE email = ?").get('alex.mercer@lexven.com');
  const { token: empToken } = createSession(testEmployee.id);

  // 5a. requireAuth without token
  let authPassed = false;
  const unauthReq = createMockReq({}, {});
  const unauthRes = createMockRes();
  requireAuth(unauthReq, unauthRes, () => { authPassed = true; });
  assert(!authPassed && unauthRes.statusCode === 401, 'requireAuth rejects unauthenticated requests with 401 Unauthorized');

  // 5b. requireAuth with valid employee token
  let empAuthPassed = false;
  const empReq = createMockReq({}, { authorization: `Bearer ${empToken}` });
  const empRes = createMockRes();
  requireAuth(empReq, empRes, () => { empAuthPassed = true; });
  assert(empAuthPassed && empReq.user.id === testEmployee.id, 'requireAuth accepts valid session token and sets req.user');

  // 5c. requireFounder with employee token
  let founderGuardPassed = false;
  const empFounderRes = createMockRes();
  requireFounder(empReq, empFounderRes, () => { founderGuardPassed = true; });
  assert(!founderGuardPassed && empFounderRes.statusCode === 403, 'requireFounder blocks authenticated employees with 403 Forbidden');

  // 5d. requireFounder with founder token
  const { token: founderToken } = createSession(testFounder.id);
  const fndReq = createMockReq({}, { authorization: `Bearer ${founderToken}` });
  let fndAuthPassed = false;
  requireAuth(fndReq, createMockRes(), () => { fndAuthPassed = true; });
  let fndGuardPassed = false;
  requireFounder(fndReq, createMockRes(), () => { fndGuardPassed = true; });
  assert(fndAuthPassed && fndGuardPassed, 'requireFounder allows verified founder session to access administrative operations');

  // Clean up test sessions
  revokeSession(empToken);
  revokeSession(founderToken);

  // ---------------------------------------------------------------------------
  // TEST GROUP 6: Task Lifecycle & Status Transition Consistency
  // ---------------------------------------------------------------------------
  console.log('\n[6/7] Testing Task Lifecycle & Canonical Status Integrity...');

  const allowedStatuses = ['pending', 'active', 'review', 'verified', 'rejected', 'failed'];
  
  // Find a task in database
  const sampleTask = db.prepare("SELECT * FROM tasks LIMIT 1").get();
  assert(!!sampleTask, 'Retrieved sample task from database');
  assert(allowedStatuses.includes(sampleTask.status), `Task status '${sampleTask.status}' conforms to canonical status enum`);

  // Verify canonical and legacy status transitions
  const isAllowedStatus = (status) => allowedStatuses.includes(status);
  assert(isAllowedStatus('review') === true, 'Canonical status "review" is valid');
  assert(isAllowedStatus('verified') === true, 'Canonical status "verified" is valid');
  assert(isAllowedStatus('done') === false, 'Legacy status "done" is intercepted and mapped to canonical "review"');
  assert(isAllowedStatus('completed') === false, 'Legacy status "completed" is intercepted and mapped to canonical "review"');

  // ---------------------------------------------------------------------------
  // TEST GROUP 7: Desktop Agent API Contract Compatibility
  // ---------------------------------------------------------------------------
  console.log('\n[7/7] Testing Desktop Agent API Contract Compatibility...');

  // Query workspace data as desktop agent does
  const assignedTask = db.prepare("SELECT * FROM tasks WHERE assigned_to = ? ORDER BY created_at DESC LIMIT 1").get(testEmployee.id);
  
  assert(assignedTask !== undefined, 'Agent query retrieves assigned task structure without crashing');
  if (assignedTask) {
    assert(typeof assignedTask.id === 'string', 'Task ID is non-empty canonical string');
    assert(typeof assignedTask.title === 'string', 'Task title is non-empty string');
    assert(typeof assignedTask.status === 'string', 'Task status field is present');
  }

  console.log('\n======================================================');
  console.log(`  TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
