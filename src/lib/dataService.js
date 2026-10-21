import { supabase, isSupabaseConfigured, broadcastTelemetryEvent, uploadRecordingToSupabase } from './supabase';

export { uploadRecordingToSupabase };

// Local Storage Keys
export const STORAGE_KEYS = {
  TOKEN: 'inovex_auth_token',
  USER: 'inovex_auth_user',
  NODES: 'inovex_registered_nodes',
  TASKS: 'inovex_active_tasks',
  AUDITS: 'inovex_sprint_audits',
  LOGS: 'inovex_telemetry_logs'
};

export function getAuthToken() {
  try {
    return localStorage.getItem(STORAGE_KEYS.TOKEN) || '';
  } catch (e) {
    return '';
  }
}

export function getAuthHeaders() {
  const token = getAuthToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['X-Session-Token'] = token;
  }
  return headers;
}

export function generateMacAddress() {
  const hex = '0123456789ABCDEF';
  let mac = '';
  for (let i = 0; i < 6; i++) {
    mac += hex[Math.floor(Math.random() * 16)] + hex[Math.floor(Math.random() * 16)];
    if (i < 5) mac += ':';
  }
  return mac;
}

export function formatUserFromDb(u) {
  if (!u) return u;
  let name = u.name || '';
  let skill_set = u.skill_set || '';
  if (!skill_set && name.includes('(') && name.endsWith(')')) {
    const match = name.match(/^(.*?)\s*\((.*?)\)$/);
    if (match) {
      name = match[1].trim();
      skill_set = match[2].trim();
    }
  }
  return {
    ...u,
    name,
    skill_set: skill_set || (u.role === 'founder' ? 'Executive Founder' : 'Engineering Operator')
  };
}

// ==============================================================================
// 1. AUTHENTICATION & SESSION MANAGEMENT
// ==============================================================================

/**
 * Log in with authorized credentials via backend API
 */
export async function loginUser({ email, password }) {
  const cleanEmail = email ? String(email).trim().toLowerCase() : '';
  const cleanPass = password ? String(password).trim() : '';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanEmail, password: cleanPass })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return { 
        success: false, 
        error: data.error || 'Access Denied: Invalid credentials.' 
      };
    }

    const formattedUser = formatUserFromDb(data.user);

    // Save authorized session
    try {
      localStorage.setItem(STORAGE_KEYS.TOKEN, data.token);
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(formattedUser));
    } catch (e) {}

    return {
      success: true,
      user: formattedUser,
      token: data.token,
      route: data.route || (formattedUser.role === 'founder' ? '/admin-dashboard' : '/workspace')
    };
  } catch (err) {
    return {
      success: false,
      error: 'Cannot reach authentication server. Verify the server is running.'
    };
  }
}

/**
 * Verify currently stored session with server
 */
export async function verifyStoredSession() {
  const token = getAuthToken();
  if (!token) return null;

  try {
    const res = await fetch('/api/auth/me', {
      headers: getAuthHeaders()
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.user) {
        const user = formatUserFromDb(data.user);
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
        return user;
      }
    }
    // If invalid or expired, clear session
    logoutUser();
    return null;
  } catch (e) {
    // If network error, return local cache if present
    try {
      const cached = localStorage.getItem(STORAGE_KEYS.USER);
      return cached ? JSON.parse(cached) : null;
    } catch (err) {
      return null;
    }
  }
}

/**
 * Invalidate session on server and clear local tokens
 */
export async function logoutUser() {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: getAuthHeaders()
    });
  } catch (e) {}

  try {
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER);
  } catch (e) {}
}

/**
 * Register a new node identity
 */
export async function registerUser({ name, email, password, role = 'employee', skill_set, device_mac_address, bootstrapKey = null }) {
  const cleanEmail = email ? String(email).trim().toLowerCase() : '';
  const cleanName = name ? String(name).trim() : (role === 'founder' ? 'Executive Founder' : 'Engineering Operator');
  const cleanSkill = skill_set ? String(skill_set).trim() : (role === 'founder' ? 'Executive Founder' : 'Engineering Operator');
  const cleanPass = password ? String(password).trim() : '';
  const mac = (device_mac_address && String(device_mac_address).trim()) || generateMacAddress();

  try {
    const res = await fetch('/api/users/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: cleanName,
        email: cleanEmail,
        password: cleanPass,
        role,
        skill_set: cleanSkill,
        device_mac_address: mac,
        bootstrapKey
      })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Registration failed');
    }

    const formattedUser = formatUserFromDb(data.user);

    if (data.token) {
      try {
        localStorage.setItem(STORAGE_KEYS.TOKEN, data.token);
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(formattedUser));
      } catch (e) {}
    }

    return { success: true, user: formattedUser, token: data.token };
  } catch (err) {
    console.error('Registration error:', err);
    throw err;
  }
}

// ==============================================================================
// 2. FETCH USERS DIRECTORY
// ==============================================================================
export async function fetchUsers() {
  try {
    const res = await fetch('/api/users', {
      headers: getAuthHeaders()
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        return data.map(formatUserFromDb);
      }
    }
  } catch (e) {}

  // Fallback to Supabase Cloud if server unavailable
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, role, skill_set, device_mac_address, is_active, last_seen_at')
        .order('created_at', { ascending: true });

      if (!error && Array.isArray(data) && data.length > 0) {
        return data.map(formatUserFromDb);
      }
    } catch (e) {}
  }

  return [];
}

// ==============================================================================
// 3. FETCH WORKSPACE FOR EMPLOYEE
// ==============================================================================
export async function fetchWorkspaceData(userId) {
  try {
    const res = await fetch(`/api/workspace/${userId}`, {
      headers: getAuthHeaders()
    });
    if (res.ok) {
      const data = await res.json();
      return {
        user: formatUserFromDb(data.user),
        task: data.task || null,
        tasks: data.tasks || [],
        telemetry: data.telemetry || {
          active_window: 'VS Code — workspace',
          keystroke_rate: 0,
          hardware_spoof_flag: 0
        }
      };
    }
  } catch (e) {}

  // Fallback to Supabase
  if (isSupabaseConfigured && supabase) {
    try {
      const [{ data: userData }, { data: tasksData }] = await Promise.all([
        supabase.from('users').select('*').eq('id', userId).maybeSingle(),
        supabase.from('tasks').select('*').eq('assigned_to', userId).order('created_at', { ascending: false })
      ]);

      const activeTask = tasksData?.find(t => t.status === 'active') || tasksData?.[0] || null;

      return {
        user: formatUserFromDb(userData),
        task: activeTask,
        tasks: tasksData || [],
        telemetry: {
          active_window: 'Standby',
          keystroke_rate: 0,
          hardware_spoof_flag: 0
        }
      };
    } catch (e) {}
  }

  return null;
}

// ==============================================================================
// 4. FETCH ADMIN DASHBOARD DATA
// ==============================================================================
export async function fetchAdminData() {
  let gridUsers = [];
  let matrixItems = [];
  let telemetryLogs = [];
  let sprintAudits = [];

  try {
    const headers = getAuthHeaders();
    const [gridRes, matrixRes, logsRes, auditsRes] = await Promise.all([
      fetch('/api/admin/orchestration-grid', { headers }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/api/admin/health-matrix', { headers }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/api/admin/telemetry-feed', { headers }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/api/admin/sprint-audits', { headers }).then(r => r.ok ? r.json() : []).catch(() => [])
    ]);

    if (Array.isArray(gridRes)) gridUsers = gridRes.map(formatUserFromDb);
    if (Array.isArray(matrixRes)) matrixItems = matrixRes;
    if (Array.isArray(logsRes)) telemetryLogs = logsRes;
    if (Array.isArray(auditsRes)) sprintAudits = auditsRes;
  } catch (e) {}

  // Fallback to Supabase if local API offline
  if (gridUsers.length === 0 && isSupabaseConfigured && supabase) {
    try {
      const [{ data: cUsers }, { data: cTasks }, { data: cLogs }, { data: cAudits }] = await Promise.all([
        supabase.from('users').select('*').order('created_at', { ascending: true }),
        supabase.from('tasks').select('*').order('created_at', { ascending: false }),
        supabase.from('telemetry_logs').select('*').order('timestamp', { ascending: false }).limit(35),
        supabase.from('sprint_audits').select('*').order('created_at', { ascending: false }).limit(25)
      ]);

      if (cUsers) gridUsers = cUsers.map(formatUserFromDb);
      if (cLogs) telemetryLogs = cLogs;
      if (cAudits) sprintAudits = cAudits;
    } catch (e) {}
  }

  return {
    gridUsers,
    healthMatrix: matrixItems,
    telemetryLogs,
    sprintAudits
  };
}

// ==============================================================================
// 5. TASK DISPATCH & ASSIGNMENT (AUTHORITATIVE)
// ==============================================================================
export async function dispatchSprintTask(taskTitle, taskDesc, assignedUserId) {
  try {
    const res = await fetch('/api/tasks/ai-dispatch', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ prompt: `${taskTitle}\n${taskDesc}` })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Dispatch request failed');
    }

    return { success: true, task: data.task };
  } catch (err) {
    console.error('Dispatch error:', err);
    throw err;
  }
}

export async function assignTaskToEmployee({ title, description, deadline, assignedUserId }) {
  try {
    const res = await fetch('/api/tasks/assign', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        title,
        description,
        deadline,
        assignedUserId
      })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Assignment failed');
    }

    return { success: true, task: data.task };
  } catch (err) {
    console.error('Task assignment error:', err);
    throw err;
  }
}

// ==============================================================================
// 6. CANONICAL TASK STATUS MODEL
// Canonical states: 'pending', 'active', 'review', 'verified', 'rejected', 'failed'
// ==============================================================================
export function computeTaskStatus(task) {
  if (!task) {
    return { state: 'pending', label: 'Pending', color: 'blue', isOverdue: false, isDone: false };
  }

  const now = Date.now();
  const rawStatus = (task.status || 'pending').toLowerCase();

  // Canonical mapping
  if (rawStatus === 'verified') {
    return {
      state: 'verified',
      label: 'Verified Complete',
      color: 'green',
      isOverdue: false,
      isDone: true,
      completedAt: task.completed_at || task.created_at
    };
  }

  if (rawStatus === 'review' || rawStatus === 'done' || rawStatus === 'completed') {
    return {
      state: 'review',
      label: 'Deliverable Under Review',
      color: 'amber',
      isOverdue: false,
      isDone: false,
      needsReview: true,
      completedAt: task.completed_at || now
    };
  }

  if (rawStatus === 'rejected') {
    return {
      state: 'rejected',
      label: 'Deliverable Rejected',
      color: 'red',
      isOverdue: false,
      isDone: false
    };
  }

  if (rawStatus === 'failed') {
    return {
      state: 'failed',
      label: 'Task Failed',
      color: 'red',
      isOverdue: true,
      isDone: false,
      overdueText: 'Deadline exceeded'
    };
  }

  // Check deadline for active/pending tasks
  if (task.deadline) {
    const deadlineMs = Number(task.deadline) || new Date(task.deadline).getTime();
    if (deadlineMs && !isNaN(deadlineMs)) {
      if (now > deadlineMs) {
        return {
          state: 'failed',
          label: 'Task Failed',
          color: 'red',
          isOverdue: true,
          isDone: false,
          deadlineMs,
          overdueText: 'Time limit exceeded'
        };
      }

      const diffSec = Math.floor((deadlineMs - now) / 1000);
      const hours = Math.floor(diffSec / 3600);
      const mins = Math.floor((diffSec % 3600) / 60);
      const remainingText = hours > 0 ? `${hours}h ${mins}m remaining` : `${Math.max(1, mins)}m remaining`;

      return {
        state: rawStatus === 'active' ? 'active' : 'pending',
        label: rawStatus === 'active' ? 'Sprint In Progress' : 'Pending Acceptance',
        color: rawStatus === 'active' ? 'blue' : 'amber',
        isOverdue: false,
        isDone: false,
        deadlineMs,
        remainingText
      };
    }
  }

  return {
    state: rawStatus === 'active' ? 'active' : 'pending',
    label: rawStatus === 'active' ? 'Sprint In Progress' : 'Pending Acceptance',
    color: rawStatus === 'active' ? 'blue' : 'amber',
    isOverdue: false,
    isDone: false
  };
}

export async function updateTaskStatus(taskId, status, notes = '') {
  try {
    const res = await fetch('/api/tasks/status', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ taskId, status, notes })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Status update failed');
    }

    return { success: true, task: data.task };
  } catch (err) {
    console.error('Task status update error:', err);
    throw err;
  }
}

// ==============================================================================
// 7. SPRINT LIFECYCLE & PROOF OF WORK
// ==============================================================================
export async function startSprintSession(taskId, userId) {
  try {
    const res = await fetch('/api/workspace/start-sprint', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ taskId, userId })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to start sprint');
    }

    return { success: true, task: data.task, sprint_started_at: data.task.sprint_started_at };
  } catch (err) {
    console.error('Sprint start error:', err);
    throw err;
  }
}

export async function submitProofOfWork(taskId, userId, prUrl, payloadNotes) {
  try {
    const res = await fetch('/api/workspace/submit-pow', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ taskId, proofUrl: prUrl, payloadText: payloadNotes })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to submit proof of work');
    }

    return { success: true, deliverable: data.task };
  } catch (err) {
    console.error('Proof submission error:', err);
    throw err;
  }
}

export async function fetchEmployeeSprintAudits(userId) {
  try {
    const res = await fetch(`/api/admin/sprint-audits/${userId}`, {
      headers: getAuthHeaders()
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        return data;
      }
    }
  } catch (e) {}

  if (isSupabaseConfigured && supabase) {
    try {
      const { data } = await supabase
        .from('sprint_audits')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (data && Array.isArray(data)) return data;
    } catch (e) {}
  }

  // Return empty list if no genuine recordings exist (never fabricate fake audits)
  return [];
}

// ==============================================================================
// 8. TELEMETRY STREAM & HARDWARE SPOOF SENTINEL
// ==============================================================================
export async function sendTelemetryBeat(userId, taskId, activeWindow, keystrokeRate, hardwareSpoofFlag = 0) {
  try {
    const res = await fetch('/api/telemetry/log', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        taskId,
        activeWindow,
        keystrokeRate,
        hardwareSpoofFlag
      })
    });
    if (res.ok) {
      const data = await res.json();
      return data.log;
    }
  } catch (e) {}
  return null;
}

export async function triggerAiActivityCheck(taskId, userId, currentWarningCount) {
  try {
    const res = await fetch('/api/workspace/ai-activity-check', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        taskId,
        isUnusual: true,
        activeWindow: 'Off-task window focus',
        infractionReason: 'Window focus deviation during sprint'
      })
    });

    const data = await res.json();
    return data;
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function simulateHardwareSpoof(targetUser, taskId) {
  try {
    const res = await fetch('/api/telemetry/simulate-spoof', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        userId: targetUser?.id,
        taskId
      })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true, alert: data.alert };
    }
  } catch (e) {}
  return { success: false };
}
