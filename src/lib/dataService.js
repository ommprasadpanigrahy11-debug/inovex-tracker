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

// Base URL for backend API requests (supports separate backend deployment or same-host proxy)
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const isVercelHost = typeof window !== 'undefined' && window.location.hostname.endsWith('vercel.app');
// On static Vercel host without an external backend URL, bypass local express routes and connect to Supabase
const isStaticCloudOnly = isVercelHost && !API_BASE;

export function getApiUrl(endpoint) {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return API_BASE ? `${API_BASE}${cleanEndpoint}` : cleanEndpoint;
}

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
    skill_set: skill_set || (u.role === 'founder' ? 'Executive Founder' : 'Engineering Operator'),
    is_active: u.is_active ?? 1,
    last_seen_at: u.last_seen_at ?? u.created_at ?? null
  };
}

// ==============================================================================
// 1. AUTHENTICATION & SESSION MANAGEMENT
// ==============================================================================

/**
 * Log in with authorized credentials via backend API or direct cloud fallback
 */
export async function loginUser({ email, password }) {
  const cleanEmail = email ? String(email).trim().toLowerCase() : '';
  const cleanPass = password ? String(password).trim() : '';

  // 1. Try Backend Express API if reachable (Skip on static Vercel host without external API)
  if (!isStaticCloudOnly) {
    try {
      const res = await fetch(getApiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password: cleanPass })
      });

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        if (res.ok && data.success) {
          const formattedUser = formatUserFromDb(data.user);
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
        } else if (res.status === 401 || res.status === 400 || res.status === 403) {
          return { 
            success: false, 
            error: data.error || 'Access Denied: Invalid credentials.' 
          };
        }
      }
    } catch (err) {
      console.warn('[Auth API unreachable, falling back to Supabase Cloud verification]', err);
    }
  }

  // 2. Resilient Cloud Fallback (Supabase Direct)
  if (isSupabaseConfigured && supabase) {
    try {
      const { data: userRecords, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', cleanEmail)
        .limit(1);

      if (!error && userRecords && userRecords.length > 0) {
        const user = formatUserFromDb(userRecords[0]);
        const syntheticToken = 'invx_cloud_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
        
        try {
          localStorage.setItem(STORAGE_KEYS.TOKEN, syntheticToken);
          localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
        } catch (e) {}

        return {
          success: true,
          user,
          token: syntheticToken,
          route: user.role === 'founder' ? '/admin-dashboard' : '/workspace'
        };
      } else {
        return {
          success: false,
          error: 'Access Denied: Node not registered in security directory.'
        };
      }
    } catch (e) {
      console.error('[Supabase Auth Fallback Error]', e);
    }
  }

  return {
    success: false,
    error: 'Cannot reach authentication server. Verify server or Supabase connectivity.'
  };
}

/**
 * Verify currently stored session with server or cloud
 */
export async function verifyStoredSession() {
  const token = getAuthToken();
  if (!token) return null;

  // 1. Try Backend API
  try {
    const res = await fetch(getApiUrl('/api/auth/me'), {
      headers: getAuthHeaders()
    });

    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data.success && data.user) {
        const user = formatUserFromDb(data.user);
        try {
          localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
        } catch (e) {}
        return user;
      }
    } else if (res.status === 401) {
      logoutUser();
      return null;
    }
  } catch (e) {}

  // 2. Resilient Cached Session Restoration
  try {
    const cached = localStorage.getItem(STORAGE_KEYS.USER);
    if (cached) {
      return formatUserFromDb(JSON.parse(cached));
    }
  } catch (err) {}

  return null;
}

/**
 * Invalidate session on server and clear local tokens
 */
export async function logoutUser() {
  try {
    await fetch(getApiUrl('/api/auth/logout'), {
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
 * Register a new node identity via Backend API or direct Cloud Fallback
 */
export async function registerUser({ name, email, password, role = 'employee', skill_set, device_mac_address, bootstrapKey = null }) {
  const cleanEmail = email ? String(email).trim().toLowerCase() : '';
  const cleanName = name ? String(name).trim() : (role === 'founder' ? 'Executive Founder' : 'Engineering Operator');
  const cleanSkill = skill_set ? String(skill_set).trim() : (role === 'founder' ? 'Executive Founder' : 'Engineering Operator');
  const cleanPass = password ? String(password).trim() : '';
  const mac = (device_mac_address && String(device_mac_address).trim()) || generateMacAddress();
  const userId = 'usr_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);

  // 1. Try Backend API (Skip on static Vercel host without external API)
  if (!isStaticCloudOnly) {
    try {
      const res = await fetch(getApiUrl('/api/users/register'), {
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

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        if (res.ok && data.success) {
          const formattedUser = formatUserFromDb(data.user);
          if (data.token) {
            try {
              localStorage.setItem(STORAGE_KEYS.TOKEN, data.token);
              localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(formattedUser));
            } catch (e) {}
          }
          return { success: true, user: formattedUser, token: data.token };
        } else if (res.status === 400 || res.status === 409 || res.status === 403) {
          throw new Error(data.error || 'Registration failed');
        }
      }
    } catch (err) {
      if (err.message && (err.message.includes('already exists') || err.message.includes('restricted') || err.message.includes('required'))) {
        throw err;
      }
      console.warn('[Backend Registration unavailable; engaging direct Supabase cloud persistence]', err);
    }
  }

  // 2. Direct Supabase Cloud Registration Fallback
  if (isSupabaseConfigured && supabase) {
    // Check for duplicate account
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', cleanEmail);

    if (existing && existing.length > 0) {
      throw new Error('An authorized node with this email address already exists. Please sign in instead.');
    }

    // Protect founder registration (permitted if 0 users exist as initial setup)
    if (role === 'founder') {
      const { data: allUsers } = await supabase.from('users').select('id').limit(1);
      const isZeroUsers = !allUsers || allUsers.length === 0;
      const validKey = import.meta.env.VITE_FOUNDER_BOOTSTRAP_KEY || 'INOVEX-FOUNDER-BOOTSTRAP-2026';
      if (!isZeroUsers && (!bootstrapKey || bootstrapKey.trim() !== validKey)) {
        throw new Error('Founder registration requires valid system bootstrap authorization key.');
      }
    }

    const newRecord = {
      id: userId,
      name: `${cleanName} (${cleanSkill})`,
      email: cleanEmail,
      role,
      device_mac_address: mac,
      created_at: Date.now()
    };

    const { data: inserted, error: insertError } = await supabase
      .from('users')
      .insert(newRecord)
      .select();

    if (insertError) {
      console.error('[Supabase Insert Error]', insertError);
      throw new Error(insertError.message || 'Cloud database rejected registration.');
    }

    const formattedUser = formatUserFromDb(inserted && inserted[0] ? inserted[0] : newRecord);
    const token = 'invx_cloud_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
    try {
      localStorage.setItem(STORAGE_KEYS.TOKEN, token);
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(formattedUser));
    } catch (e) {}

    return { success: true, user: formattedUser, token };
  }

  throw new Error('Registration failed: Neither backend server nor Supabase cloud is reachable.');
}

// ==============================================================================
// 2. FETCH USERS DIRECTORY
// ==============================================================================
export async function fetchUsers() {
  // 1. Try Backend API (Skip on static Vercel host without external API)
  if (!isStaticCloudOnly) {
    try {
      const res = await fetch(getApiUrl('/api/users'), {
        headers: getAuthHeaders()
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          return data.map(formatUserFromDb);
        }
      }
    } catch (e) {}
  }

  // 2. Fallback to Supabase Cloud directly (query select('*') to gracefully adapt to table schema)
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: true });

      if (!error && Array.isArray(data) && data.length > 0) {
        return data.map(formatUserFromDb);
      }
    } catch (e) {
      console.warn('[Supabase fetchUsers fallback error]', e);
    }
  }

  return [];
}

// ==============================================================================
// 3. FETCH WORKSPACE FOR EMPLOYEE
// ==============================================================================
export async function fetchWorkspaceData(userId) {
  // 1. Try Backend API
  try {
    const res = await fetch(getApiUrl(`/api/workspace/${userId}`), {
      headers: getAuthHeaders()
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
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

  // 2. Fallback to Supabase Cloud directly
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

  // 1. Try Backend API
  try {
    const headers = getAuthHeaders();
    const [gridRes, matrixRes, logsRes, auditsRes] = await Promise.all([
      fetch(getApiUrl('/api/admin/orchestration-grid'), { headers }).then(r => r.ok && r.headers.get('content-type')?.includes('application/json') ? r.json() : []).catch(() => []),
      fetch(getApiUrl('/api/admin/health-matrix'), { headers }).then(r => r.ok && r.headers.get('content-type')?.includes('application/json') ? r.json() : []).catch(() => []),
      fetch(getApiUrl('/api/admin/telemetry-feed'), { headers }).then(r => r.ok && r.headers.get('content-type')?.includes('application/json') ? r.json() : []).catch(() => []),
      fetch(getApiUrl('/api/admin/sprint-audits'), { headers }).then(r => r.ok && r.headers.get('content-type')?.includes('application/json') ? r.json() : []).catch(() => [])
    ]);

    if (Array.isArray(gridRes) && gridRes.length > 0) gridUsers = gridRes.map(formatUserFromDb);
    if (Array.isArray(matrixRes)) matrixItems = matrixRes;
    if (Array.isArray(logsRes)) telemetryLogs = logsRes;
    if (Array.isArray(auditsRes)) sprintAudits = auditsRes;
  } catch (e) {}

  // 2. Fallback to Supabase if local API offline
  if (gridUsers.length === 0 && isSupabaseConfigured && supabase) {
    try {
      const [{ data: cUsers }, { data: cTasks }, { data: cLogs }, { data: cAudits }] = await Promise.all([
        supabase.from('users').select('*').order('created_at', { ascending: true }),
        supabase.from('tasks').select('*').order('created_at', { ascending: false }),
        supabase.from('telemetry_logs').select('*').order('timestamp', { ascending: false }).limit(35),
        supabase.from('sprint_audits').select('*').order('created_at', { ascending: false }).limit(25)
      ]);

      if (cUsers && Array.isArray(cUsers)) gridUsers = cUsers.map(formatUserFromDb);
      if (cLogs && Array.isArray(cLogs)) telemetryLogs = cLogs;
      if (cAudits && Array.isArray(cAudits)) sprintAudits = cAudits;

      // Construct health matrix from tasks and users
      if (cTasks && cUsers) {
        matrixItems = cTasks.map(t => {
          const u = cUsers.find(user => user.id === t.assigned_to) || {};
          return {
            task_id: t.id,
            node_name: u.name || 'Unassigned',
            node_id: t.assigned_to,
            employee_name: u.name || 'Operator',
            device_mac_address: u.device_mac_address || '00:00:00:00:00:00',
            title: t.title,
            current_window: 'Task In Progress',
            ai_health_score: t.ai_health_score || 85,
            hardware_spoof_flag: false,
            status: t.status || 'active'
          };
        });
      }
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
  // 1. Try Backend API
  try {
    const res = await fetch(getApiUrl('/api/tasks/ai-dispatch'), {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ prompt: `${taskTitle}\n${taskDesc}` })
    });

    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data.success) {
        return { success: true, task: data.task };
      }
    }
  } catch (err) {}

  // 2. Direct Cloud Dispatch Fallback
  if (isSupabaseConfigured && supabase) {
    const newTaskId = 'tsk_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
    const newTask = {
      id: newTaskId,
      title: taskTitle,
      description: taskDesc,
      brief_content: taskDesc,
      assigned_to: assignedUserId,
      status: 'active',
      ai_health_score: 92,
      is_acknowledged: 1,
      screen_tracking_active: 0,
      warning_count: 0,
      session_terminated: 0,
      created_at: Date.now()
    };

    const { data, error } = await supabase.from('tasks').insert(newTask).select();
    if (!error) {
      return { success: true, task: data && data[0] ? data[0] : newTask };
    }
  }

  throw new Error('Task dispatch failed. Neither backend API nor Supabase cloud could be reached.');
}

export async function assignTaskToEmployee({ title, description, deadline, assignedUserId }) {
  // 1. Try Backend API
  try {
    const res = await fetch(getApiUrl('/api/tasks/assign'), {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        title,
        description,
        deadline,
        assignedUserId
      })
    });

    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data.success) {
        return { success: true, task: data.task };
      }
    }
  } catch (err) {}

  // 2. Direct Cloud Fallback
  if (isSupabaseConfigured && supabase) {
    const newTaskId = 'tsk_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
    const newTask = {
      id: newTaskId,
      title,
      description,
      brief_content: description,
      deadline: deadline ? String(deadline) : null,
      assigned_to: assignedUserId,
      status: 'active',
      ai_health_score: 90,
      is_acknowledged: 1,
      screen_tracking_active: 0,
      warning_count: 0,
      session_terminated: 0,
      created_at: Date.now()
    };

    const { data, error } = await supabase.from('tasks').insert(newTask).select();
    if (!error) {
      return { success: true, task: data && data[0] ? data[0] : newTask };
    }
  }

  throw new Error('Task assignment failed.');
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
  // 1. Try Backend API
  try {
    const res = await fetch(getApiUrl('/api/tasks/status'), {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ taskId, status, notes })
    });

    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data.success) {
        return { success: true, task: data.task };
      }
    }
  } catch (err) {}

  // 2. Direct Cloud Fallback
  if (isSupabaseConfigured && supabase) {
    const updatePayload = {
      status,
      completed_at: (status === 'review' || status === 'verified') ? Date.now() : null
    };
    if (notes) updatePayload.payload_notes = notes;

    const { data, error } = await supabase
      .from('tasks')
      .update(updatePayload)
      .eq('id', taskId)
      .select();

    if (!error) {
      return { success: true, task: data && data[0] ? data[0] : { id: taskId, status } };
    }
  }

  throw new Error('Task status update failed.');
}

// ==============================================================================
// 7. SPRINT LIFECYCLE & PROOF OF WORK
// ==============================================================================
export async function startSprintSession(taskId, userId) {
  // 1. Try Backend API
  try {
    const res = await fetch(getApiUrl('/api/workspace/start-sprint'), {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ taskId, userId })
    });

    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data.success) {
        return { success: true, task: data.task, sprint_started_at: data.task?.sprint_started_at || Date.now() };
      }
    }
  } catch (err) {}

  // 2. Direct Cloud Fallback
  if (isSupabaseConfigured && supabase && taskId) {
    const now = Date.now();
    const { data, error } = await supabase
      .from('tasks')
      .update({
        sprint_started_at: now,
        status: 'active',
        screen_tracking_active: 1
      })
      .eq('id', taskId)
      .select();

    if (!error) {
      return { success: true, task: data && data[0] ? data[0] : { id: taskId, sprint_started_at: now }, sprint_started_at: now };
    }
  }

  return { success: true, sprint_started_at: Date.now() };
}

export async function submitProofOfWork(taskId, userId, prUrl, payloadNotes) {
  // 1. Try Backend API
  try {
    const res = await fetch(getApiUrl('/api/workspace/submit-pow'), {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ taskId, proofUrl: prUrl, payloadText: payloadNotes })
    });

    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data.success) {
        return { success: true, deliverable: data.task };
      }
    }
  } catch (err) {}

  // 2. Direct Cloud Fallback
  if (isSupabaseConfigured && supabase && taskId) {
    const { data, error } = await supabase
      .from('tasks')
      .update({
        proof_url: prUrl,
        proof_payload: payloadNotes,
        payload_notes: payloadNotes,
        status: 'review',
        completed_at: Date.now()
      })
      .eq('id', taskId)
      .select();

    if (!error) {
      return { success: true, deliverable: data && data[0] ? data[0] : { id: taskId, status: 'review' } };
    }
  }

  return { success: true, deliverable: { id: taskId, status: 'review' } };
}

export async function fetchEmployeeSprintAudits(userId) {
  // 1. Try Backend API
  try {
    const res = await fetch(getApiUrl(`/api/admin/sprint-audits/${userId}`), {
      headers: getAuthHeaders()
    });

    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (Array.isArray(data)) {
        return data;
      }
    }
  } catch (e) {}

  // 2. Fallback to Supabase Cloud
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

  return [];
}

// ==============================================================================
// 8. TELEMETRY STREAM & HARDWARE SPOOF SENTINEL
// ==============================================================================
export async function sendTelemetryBeat(userId, taskId, activeWindow, keystrokeRate, hardwareSpoofFlag = 0) {
  // 1. Try Backend API
  try {
    const res = await fetch(getApiUrl('/api/telemetry/log'), {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        taskId,
        activeWindow,
        keystrokeRate,
        hardwareSpoofFlag
      })
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      return data.log;
    }
  } catch (e) {}

  // 2. Cloud Realtime Broadcast
  if (isSupabaseConfigured) {
    broadcastTelemetryEvent('TELEMETRY_UPDATE', {
      user_id: userId,
      task_id: taskId,
      active_window: activeWindow,
      keystroke_rate: keystrokeRate,
      hardware_spoof_flag: hardwareSpoofFlag,
      timestamp: Date.now()
    }).catch(() => {});
  }

  return null;
}

export async function triggerAiActivityCheck(taskId, userId, currentWarningCount) {
  // 1. Try Backend API
  try {
    const res = await fetch(getApiUrl('/api/workspace/ai-activity-check'), {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        taskId,
        isUnusual: true,
        activeWindow: 'Off-task window focus',
        infractionReason: 'Window focus deviation during sprint'
      })
    });

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      return data;
    }
  } catch (err) {}

  // 2. Cloud Fallback
  const newCount = (currentWarningCount || 0) + 1;
  const isTerm = newCount >= 2;
  return {
    terminated: isTerm,
    warningCount: newCount,
    warning: {
      message: isTerm 
        ? 'Session terminated automatically due to repeated infractions.' 
        : `AI Sentinel Warning ${newCount}/2: Off-task application detected.`
    }
  };
}

export async function simulateHardwareSpoof(targetUser, taskId) {
  // 1. Try Backend API
  try {
    const res = await fetch(getApiUrl('/api/telemetry/simulate-spoof'), {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        userId: targetUser?.id,
        taskId
      })
    });

    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data.success) {
        return { success: true, alert: data.alert };
      }
    }
  } catch (e) {}

  // 2. Cloud Fallback
  const spoofAlert = {
    id: 'alert_' + Date.now(),
    user_id: targetUser?.id || 'usr_node',
    device_mac_address: targetUser?.device_mac_address || 'A4:C1:38:9B:21:40',
    keystroke_rate: 145.8,
    active_window: 'Synthetic Input Replay Buffer',
    timestamp: Date.now(),
    message: 'HARDWARE INTEGRITY BREACH: Synthetic input automation detected.'
  };

  broadcastTelemetryEvent('HARDWARE_SPOOF_ALERT', spoofAlert).catch(() => {});

  return { success: true, alert: spoofAlert };
}
