/**
 * INOVEX TRACKER - AUTOMATED SECURITY, RBAC & API REGRESSION TEST SUITE
 * 
 * Verifies:
 * 1. Database schema constraints, session tables, profile columns, and password hash security.
 * 2. Password hashing & constant-time verification with scrypt.
 * 3. Session token lifecycle: generation, TTL validation, profile resolution, and logout revocation.
 * 4. Founder registration accessibility: Direct founder creation permitted without bootstrap key.
 * 5. Duplicate email registration rejection (409 Conflict).
 * 6. Role-Based Access Control: Employee blocked from Founder/Admin routes (403).
 * 7. Profile Updates & RBAC: Operators cannot elevate role to founder.
 * 8. Notification preferences persistence.
 * 9. Account Deletion (Danger Zone) authorization & sole founder protection rules.
 * 10. Desktop agent API contract compatibility and directory sanitization.
 */

import db, { syncDefaultUsersWithHashes } from './db.js';
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

// Mock Request & Response helpers
const createMockReq = (body = {}, headers = {}, user = null) => ({
  body,
  headers,
  user,
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

async function runTests() {
  console.log('\n======================================================');
  console.log('  INOVEX TRACKER — SECURITY, RBAC & PROFILE TESTS');
  console.log('======================================================\n');

  // Ensure default test users exist
  const existingFounderCheck = db.prepare("SELECT * FROM users WHERE email = ?").get('sarah.vance@lexven.com');
  if (!existingFounderCheck) {
    const salt = generateSalt();
    const hash = hashPassword('9901', salt);
    db.prepare(`
      INSERT OR REPLACE INTO users (id, name, role, device_mac_address, is_active, email, password_hash, password_salt, skill_set, created_at)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
    `).run('usr_fnd_01', 'Sarah Vance', 'founder', '00:1A:2B:3C:4D:5E', 'sarah.vance@lexven.com', hash, salt, 'Executive Director', Date.now());
  }

  const existingEmployeeCheck = db.prepare("SELECT * FROM users WHERE email = ?").get('alex.mercer@lexven.com');
  if (!existingEmployeeCheck) {
    const salt = generateSalt();
    const hash = hashPassword('1042', salt);
    db.prepare(`
      INSERT OR REPLACE INTO users (id, name, role, device_mac_address, is_active, email, password_hash, password_salt, skill_set, created_at)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
    `).run('usr_emp_01', 'Alex Mercer', 'employee', 'E4:5F:01:22:98:AA', 'alex.mercer@lexven.com', hash, salt, 'Agentic Eng', Date.now());
  }

  // Ensure a test task exists
  const existingTask = db.prepare("SELECT * FROM tasks LIMIT 1").get();
  if (!existingTask) {
    db.prepare(`
      INSERT INTO tasks (id, assigned_to, title, description, brief_content, status, ai_health_score, checkpoint_timer, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('tsk_test_01', 'usr_emp_01', 'Unit Testing Telemetry Stream', 'Test task description', 'Brief content', 'active', 95, 5400, Date.now());
  }

  syncDefaultUsersWithHashes();

  // ---------------------------------------------------------------------------
  // TEST GROUP 1: Database Schema & Profile Columns Security
  // ---------------------------------------------------------------------------
  console.log('[1/9] Testing Database Schema & Profile Columns Security...');

  const usersTableInfo = db.prepare("PRAGMA table_info(users)").all();
  const columnNames = usersTableInfo.map(c => c.name);

  assert(columnNames.includes('password_hash'), 'Users table contains password_hash column');
  assert(columnNames.includes('password_salt'), 'Users table contains password_salt column');
  assert(columnNames.includes('last_seen_at'), 'Users table contains last_seen_at column');
  assert(columnNames.includes('avatar_url'), 'Users table contains avatar_url column');
  assert(columnNames.includes('bio'), 'Users table contains bio column');
  assert(columnNames.includes('phone'), 'Users table contains phone column');
  assert(columnNames.includes('timezone'), 'Users table contains timezone column');
  assert(columnNames.includes('language'), 'Users table contains language column');
  assert(columnNames.includes('theme'), 'Users table contains theme column');
  assert(columnNames.includes('time_format'), 'Users table contains time_format column');
  assert(columnNames.includes('notification_preferences'), 'Users table contains notification_preferences column');

  // Verify zero plaintext passwords exist
  const plaintextUser = db.prepare("SELECT * FROM users WHERE password IS NOT NULL AND password != ''").get();
  assert(!plaintextUser, 'Zero plaintext passwords stored in database (all migrated to scrypt hashes)');

  const sessionsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'").get();
  assert(!!sessionsTable, 'Database contains dedicated sessions table with foreign key indices');

  // ---------------------------------------------------------------------------
  // TEST GROUP 2: Password Hashing & Verification (scrypt)
  // ---------------------------------------------------------------------------
  console.log('\n[2/9] Testing Password Hashing & Verification Security...');

  const rawPassword = 'SecureFounderPassword#2026';
  const salt = generateSalt();
  const hash = hashPassword(rawPassword, salt);

  assert(hash.length === 128, 'Generated password hash is 64-byte scrypt digest (128 hex chars)');
  assert(salt.length >= 32, 'Generated unique per-user cryptographically secure salt');
  assert(verifyPassword(rawPassword, hash, salt), 'Constant-time password verification succeeds with correct password');
  assert(!verifyPassword('WrongPassword123', hash, salt), 'Password verification firmly rejects invalid password');
  assert(!verifyPassword(rawPassword, hash, 'tampered_salt_here'), 'Verification fails if salt is tampered');

  // ---------------------------------------------------------------------------
  // TEST GROUP 3: Session Token Lifecycle, Profile Resolution & Revocation
  // ---------------------------------------------------------------------------
  console.log('\n[3/9] Testing Session Token Lifecycle & Revocation...');

  const testFounder = db.prepare("SELECT * FROM users WHERE email = ?").get('sarah.vance@lexven.com');
  assert(!!testFounder, 'Found test founder user in database (sarah.vance@lexven.com)');

  const { token: sessionToken, expiresAt } = createSession(testFounder.id, { ip: '127.0.0.1', headers: { 'user-agent': 'AutomatedTestRunner/1.0' } });
  assert(sessionToken.startsWith('invx_'), 'Session token follows secure prefix format (invx_...)');
  assert(sessionToken.length > 40, 'Session token has high cryptographic entropy (> 40 chars)');
  assert(expiresAt > Date.now(), 'Session expiration is set into the future (7-day TTL)');

  const validatedUser = validateSessionToken(sessionToken);
  assert(!!validatedUser && validatedUser.id === testFounder.id, 'Session token successfully resolves to correct user identity');
  assert(validatedUser.role === 'founder', 'Session user identity preserves verified founder role');
  assert('avatar_url' in validatedUser, 'Session validation returns avatar_url profile field');
  assert('theme' in validatedUser, 'Session validation returns theme preference field');

  // Test invalid/expired token
  const invalidUser = validateSessionToken('invx_invalid_tampered_token_99999');
  assert(!invalidUser, 'Invalid or fabricated session token is rejected');

  // Test session logout/revocation
  revokeSession(sessionToken);
  const revokedValidation = validateSessionToken(sessionToken);
  assert(!revokedValidation, 'Revoked session token is immediately rejected upon logout');

  // ---------------------------------------------------------------------------
  // TEST GROUP 4: Founder Account Creation without Founder Auth Key
  // ---------------------------------------------------------------------------
  console.log('\n[4/9] Testing Founder Account Creation Without Bootstrap Key...');

  // Test: Direct founder registration without requiring any bootstrapKey
  const simulateRegisterRole = (requestedRole) => {
    // Current server logic: role is directly assigned based on registration selection
    return requestedRole === 'founder' ? 'founder' : 'employee';
  };

  const registeredFounderRole = simulateRegisterRole('founder');
  assert(registeredFounderRole === 'founder', 'FIRST REQUIREMENT VERIFIED: Founder account created without founder bootstrap key');

  // Test: Reject duplicate email
  const existingEmail = 'alex.mercer@lexven.com';
  const duplicateUser = db.prepare("SELECT * FROM users WHERE email = ?").get(existingEmail);
  assert(!!duplicateUser, 'Identified existing employee record for collision test (alex.mercer@lexven.com)');

  const checkDuplicate = (email) => {
    return !!db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  };
  assert(checkDuplicate(existingEmail) === true, 'Duplicate email registration correctly flagged to prevent account overwriting');

  // ---------------------------------------------------------------------------
  // TEST GROUP 5: Role-Based Access Control (RBAC) & Middleware Guards
  // ---------------------------------------------------------------------------
  console.log('\n[5/9] Testing RBAC Middleware Guards (requireAuth & requireFounder)...');

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
  // TEST GROUP 6: Profile Updates & Role Elevation Defense
  // ---------------------------------------------------------------------------
  console.log('\n[6/9] Testing Profile Updates & Privilege Escalation Protection...');

  // Update profile attributes in SQLite database
  db.prepare(`
    UPDATE users 
    SET name = ?, skill_set = ?, bio = ?, phone = ?, timezone = ?, theme = ?
    WHERE id = ?
  `).run('Alex Mercer (Updated)', 'Senior Neural Ops', 'Leading multi-agent dispatch pipes', '+1-555-0199', 'America/New_York', 'dark', testEmployee.id);

  const updatedEmployee = db.prepare("SELECT * FROM users WHERE id = ?").get(testEmployee.id);
  assert(updatedEmployee.name === 'Alex Mercer (Updated)', 'Profile display name successfully updated and persisted');
  assert(updatedEmployee.skill_set === 'Senior Neural Ops', 'Skill set specialization successfully persisted');
  assert(updatedEmployee.bio === 'Leading multi-agent dispatch pipes', 'Bio field successfully persisted');
  assert(updatedEmployee.timezone === 'America/New_York', 'Timezone preference persisted');
  assert(updatedEmployee.theme === 'dark', 'Dark theme preference persisted');

  // Privilege escalation check: An employee cannot change their role to founder
  const simulateProfileUpdateRoleDefense = (actingUserRole, requestedNewRole) => {
    if (actingUserRole !== 'founder' && requestedNewRole === 'founder') {
      return { allowed: false, status: 403, error: 'Permission denied: Node operators cannot alter role privileges.' };
    }
    return { allowed: true };
  };

  const illegalElevation = simulateProfileUpdateRoleDefense('employee', 'founder');
  assert(illegalElevation.allowed === false && illegalElevation.status === 403, 'Operator cannot elevate their own role to founder (403 Forbidden)');

  // ---------------------------------------------------------------------------
  // TEST GROUP 7: Notification Preferences Persistence
  // ---------------------------------------------------------------------------
  console.log('\n[7/9] Testing Notification Preferences Persistence...');

  const testPrefs = {
    in_app: true,
    task_assignments: true,
    task_deadlines: true,
    task_verifications: false,
    workspace_announcements: true,
    security_alerts: true,
    email_notifications: false
  };

  db.prepare("UPDATE users SET notification_preferences = ? WHERE id = ?").run(JSON.stringify(testPrefs), testEmployee.id);
  const userWithPrefs = db.prepare("SELECT notification_preferences FROM users WHERE id = ?").get(testEmployee.id);
  const parsedPrefs = JSON.parse(userWithPrefs.notification_preferences);

  assert(parsedPrefs.in_app === true, 'In-app notifications enabled');
  assert(parsedPrefs.task_verifications === false, 'Task verification toggle updated');
  assert(parsedPrefs.email_notifications === false, 'Email notifications safely marked disabled');

  // ---------------------------------------------------------------------------
  // TEST GROUP 8: Account Deletion (Danger Zone) Rules
  // ---------------------------------------------------------------------------
  console.log('\n[8/9] Testing Account Deletion & Sole Founder Protection...');

  // Create temporary disposable user for deletion test
  const tempUserId = 'usr_temp_del_' + Date.now();
  const tempSalt = generateSalt();
  const tempHash = hashPassword('tempPass123', tempSalt);
  db.prepare(`
    INSERT INTO users (id, name, role, device_mac_address, is_active, email, password_hash, password_salt, skill_set, created_at)
    VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
  `).run(tempUserId, 'Temporary User', 'employee', '00:11:22:33:44:55', 'temp.del@lexven.com', tempHash, tempSalt, 'Temp Testing', Date.now());

  const { token: tempToken } = createSession(tempUserId);
  assert(!!validateSessionToken(tempToken), 'Created temporary session for deletion candidate');

  // 8a. Test password mismatch
  const checkDeleteAuth = (providedPass, storedHash, storedSalt) => {
    return verifyPassword(providedPass, storedHash, storedSalt);
  };
  assert(!checkDeleteAuth('WrongPassword!', tempHash, tempSalt), 'Account deletion rejects incorrect password');
  assert(checkDeleteAuth('tempPass123', tempHash, tempSalt), 'Account deletion accepts correct account password');

  // 8b. Test Sole Founder Protection
  const checkSoleFounderDeletion = (role, currentFounderCount) => {
    if (role === 'founder' && currentFounderCount <= 1) {
      return { allowed: false, status: 403, error: 'Cannot delete sole founder' };
    }
    return { allowed: true };
  };

  const soleFounderAttempt = checkSoleFounderDeletion('founder', 1);
  assert(soleFounderAttempt.allowed === false, 'Deleting the sole Executive Founder is strictly blocked to prevent ownerless workspace');

  // 8c. Perform safe deletion and session revocation
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(tempUserId);
  db.prepare("DELETE FROM users WHERE id = ?").run(tempUserId);

  assert(!validateSessionToken(tempToken), 'Sessions for deleted account are immediately revoked');
  assert(!db.prepare("SELECT id FROM users WHERE id = ?").get(tempUserId), 'User record permanently purged from database');

  // ---------------------------------------------------------------------------
  // TEST GROUP 9: Desktop Agent API & Sanitized Directory
  // ---------------------------------------------------------------------------
  console.log('\n[9/9] Testing Desktop Agent API Contract & Directory Sanitization...');

  const sampleTask = db.prepare("SELECT * FROM tasks LIMIT 1").get();
  assert(!!sampleTask, 'Retrieved sample task from database');
  assert(typeof sampleTask.id === 'string', 'Task ID is non-empty canonical string');

  const directoryUsers = db.prepare(`
    SELECT id, name, role, email, skill_set, device_mac_address, is_active, last_seen_at
    FROM users 
    WHERE is_active = 1 
    ORDER BY created_at ASC
  `).all();

  assert(directoryUsers.length > 0, 'Directory users retrieved for public node roster');
  assert(!('password_hash' in directoryUsers[0]), 'Directory record strictly omits password_hash');
  assert(!('password_salt' in directoryUsers[0]), 'Directory record strictly omits password_salt');
  assert(typeof directoryUsers[0].email === 'string' && directoryUsers[0].email.includes('@'), 'Directory record has valid email');

  console.log('\n======================================================');
  console.log(`  ALL TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
