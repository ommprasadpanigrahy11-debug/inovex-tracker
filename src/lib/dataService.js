import { supabase, isSupabaseConfigured, broadcastTelemetryEvent, uploadRecordingToSupabase } from './supabase';

export { uploadRecordingToSupabase };

// Local Storage Keys for Persistent Node & Sprint Data
export const STORAGE_KEYS = {
  NODES: 'inovex_registered_nodes',
  TASKS: 'inovex_active_tasks',
  AUDITS: 'inovex_sprint_audits',
  LOGS: 'inovex_telemetry_logs'
};

function getLocalStore(key, fallback = []) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function setLocalStore(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {}
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

// ==============================================================================
// 1. REGISTER NEW NODE (Founder or Engineer)
// ==============================================================================
export async function registerUser({ name, email, role = 'employee', device_mac_address, biometric_passkey_id }) {
  const cleanEmail = email ? email.trim().toLowerCase() : '';
  const cleanName = name ? name.trim() : (role === 'founder' ? 'Executive Founder' : 'Engineering Operator');
  const mac = (device_mac_address && device_mac_address.trim()) || generateMacAddress();
  const userId = 'usr_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
  const bioKey = biometric_passkey_id || ('BIO-PK-' + Math.random().toString(36).substring(2, 9).toUpperCase());

  const newUser = {
    id: userId,
    name: cleanName,
    email: cleanEmail,
    role: role === 'founder' ? 'founder' : 'employee',
    device_mac_address: mac,
    biometric_passkey_id: bioKey,
    biometric_enrolled: 1,
    is_active: 1,
    created_at: Date.now()
  };

  // 1. Post to Express Server API
  try {
    await fetch('/api/users/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newUser)
    });
  } catch (e) {
    console.warn('Server user registration notice:', e?.message || e);
  }

  // 2. Save to Supabase Cloud (if configured)
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('users').upsert([newUser], { onConflict: 'email' });
    } catch (e) {
      console.warn('Supabase register error:', e);
    }
  }

  // 3. Save to Persistent Local Store
  const existing = getLocalStore(STORAGE_KEYS.NODES, []);
  const updated = existing.filter(u => (cleanEmail && u.email !== cleanEmail) && u.id !== userId);
  updated.push(newUser);
  setLocalStore(STORAGE_KEYS.NODES, updated);

  // Broadcast to other nodes
  await broadcastTelemetryEvent('NODE_REGISTERED', { user: newUser });

  return { success: true, user: newUser };
}

// ==============================================================================
// 2. FETCH USERS (Server API + Supabase Cloud + Local Enclave)
// ==============================================================================
export async function fetchUsers() {
  let serverUsers = [];
  let cloudUsers = [];

  // 1. Fetch from Local Server
  try {
    const res = await fetch('/api/users');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        serverUsers = data;
      }
    }
  } catch (e) {}

  // 2. Fetch from Supabase (if configured)
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: true });

      if (!error && Array.isArray(data)) {
        cloudUsers = data;
      }
    } catch (e) {
      console.warn('Supabase fetchUsers fallback:', e);
    }
  }

  // 3. Fetch local enclave registered nodes
  const localUsers = getLocalStore(STORAGE_KEYS.NODES, []);

  // Merge unique by id & email
  const userMap = new Map();
  serverUsers.forEach(u => userMap.set(u.id, u));
  cloudUsers.forEach(u => userMap.set(u.id, { ...userMap.get(u.id), ...u }));
  localUsers.forEach(u => userMap.set(u.id, { ...userMap.get(u.id), ...u }));

  const merged = Array.from(userMap.values());
  return merged;
}

// ==============================================================================
// 3. FETCH WORKSPACE FOR EMPLOYEE
// ==============================================================================
export async function fetchWorkspaceData(userId) {
  let user = null;
  let task = null;
  let tasks = [];
  let telemetry = null;

  // 1. Fetch from Server
  try {
    const res = await fetch(`/api/workspace/${userId}`);
    if (res.ok) {
      const sData = await res.json();
      if (sData) {
        user = sData.user;
        task = sData.task;
        if (Array.isArray(sData.tasks)) {
          tasks = sData.tasks;
        }
        telemetry = sData.telemetry;
      }
    }
  } catch (e) {}

  // 2. Fallback to Supabase Cloud
  if (isSupabaseConfigured && supabase) {
    try {
      if (!user) {
        const { data: userData } = await supabase
          .from('users')
          .select('*')
          .eq('id', userId)
          .maybeSingle();
        if (userData) user = userData;
      }

      const { data: cloudTasks } = await supabase
        .from('tasks')
        .select('*')
        .eq('assigned_to', userId)
        .order('created_at', { ascending: false });

      if (cloudTasks && cloudTasks.length > 0) {
        tasks = cloudTasks;
        if (!task) {
          task = cloudTasks.find(t => t.status === 'active') || cloudTasks[0];
        }
      }
    } catch (e) {
      console.warn('Supabase fetchWorkspaceData fallback:', e);
    }
  }

  // 3. Fallback to Local Storage
  if (!user) {
    const localUsers = getLocalStore(STORAGE_KEYS.NODES, []);
    user = localUsers.find(u => u.id === userId) || null;
  }

  const localTasks = getLocalStore(STORAGE_KEYS.TASKS, []);
  const userLocalTasks = localTasks.filter(t => t.assigned_to === userId);
  if (userLocalTasks.length > 0 && tasks.length === 0) {
    tasks = userLocalTasks;
  }
  if (!task) {
    task = tasks.find(t => t.status === 'active') || tasks[0] || null;
  }

  return {
    user,
    task,
    tasks: tasks || [],
    telemetry: telemetry || {
      active_window: 'VS Code — workspace.ts',
      keystroke_rate: 42,
      hardware_spoof_flag: 0
    }
  };
}

// ==============================================================================
// 4. FETCH ADMIN DASHBOARD DATA
// ==============================================================================
export async function fetchAdminData() {
  let serverGrid = [];
  let serverMatrix = [];
  let serverLogs = [];
  let serverAudits = [];

  // 1. Fetch from Local Server endpoints
  try {
    const [gridRes, matrixRes, logsRes, auditsRes] = await Promise.all([
      fetch('/api/admin/orchestration-grid').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/api/admin/health-matrix').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/api/admin/telemetry-feed').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/api/admin/sprint-audits').then(r => r.ok ? r.json() : []).catch(() => [])
    ]);

    if (Array.isArray(gridRes)) serverGrid = gridRes;
    if (Array.isArray(matrixRes)) serverMatrix = matrixRes;
    if (Array.isArray(logsRes)) serverLogs = logsRes;
    if (Array.isArray(auditsRes)) serverAudits = auditsRes;
  } catch (e) {}

  // 2. Fetch from Supabase (if configured)
  let cloudUsers = [];
  let cloudTasks = [];
  let cloudLogs = [];
  let cloudAudits = [];

  if (isSupabaseConfigured && supabase) {
    try {
      const [{ data: cUsers }, { data: cTasks }, { data: cLogs }, { data: cAudits }] = await Promise.all([
        supabase.from('users').select('*').order('created_at', { ascending: true }),
        supabase.from('tasks').select('*').order('created_at', { ascending: false }),
        supabase.from('telemetry_logs').select('*').order('timestamp', { ascending: false }).limit(35),
        supabase.from('sprint_audits').select('*').order('created_at', { ascending: false }).limit(25)
      ]);

      if (cUsers) cloudUsers = cUsers;
      if (cTasks) cloudTasks = cTasks;
      if (cLogs) cloudLogs = cLogs;
      if (cAudits) cloudAudits = cAudits;
    } catch (e) {
      console.warn('Supabase fetchAdminData fallback:', e);
    }
  }

  // 3. Local Enclave Store
  const localUsers = getLocalStore(STORAGE_KEYS.NODES, []);
  const localTasks = getLocalStore(STORAGE_KEYS.TASKS, []);
  const localAudits = getLocalStore(STORAGE_KEYS.AUDITS, []);
  const localLogs = getLocalStore(STORAGE_KEYS.LOGS, []);

  // Merge users
  const userMap = new Map();
  serverGrid.forEach(u => userMap.set(u.id, u));
  cloudUsers.forEach(u => userMap.set(u.id, { ...userMap.get(u.id), ...u }));
  localUsers.forEach(u => userMap.set(u.id, { ...userMap.get(u.id), ...u }));
  const finalUsers = Array.from(userMap.values());

  // Merge tasks
  const taskMap = new Map();
  serverMatrix.forEach(t => taskMap.set(t.task_id || t.id, t));
  cloudTasks.forEach(t => taskMap.set(t.id, t));
  localTasks.forEach(t => taskMap.set(t.id, { ...taskMap.get(t.id), ...t }));
  const finalTasks = Array.from(taskMap.values());

  // Merge audits
  const auditMap = new Map();
  serverAudits.forEach(a => auditMap.set(a.id, a));
  cloudAudits.forEach(a => auditMap.set(a.id, a));
  localAudits.forEach(a => auditMap.set(a.id, { ...auditMap.get(a.id), ...a }));
  const finalAudits = Array.from(auditMap.values()).sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

  // Merge telemetry logs
  const finalLogs = [...serverLogs, ...cloudLogs, ...localLogs]
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, 35);

  const gridUsers = finalUsers.map(u => {
    const userTask = finalTasks.find(t => (t.assigned_to === u.id || t.user_id === u.id) && t.status !== 'verified');
    const userLog = finalLogs.find(l => l.user_id === u.id);
    return {
      ...u,
      active_task: userTask || u.active_task || null,
      telemetry: userLog || u.telemetry || {
        active_window: u.role === 'founder' ? 'Command Enclave' : 'Standby',
        keystroke_rate: 0,
        hardware_spoof_flag: 0,
        timestamp: Date.now()
      }
    };
  });

  const formattedAudits = finalAudits.map(a => {
    let parsedAnomalies = a.anomalies;
    if (!parsedAnomalies) {
      try {
        parsedAnomalies = typeof a.anomalies_json === 'string' ? JSON.parse(a.anomalies_json) : (a.anomalies_json || []);
      } catch (e) {
        parsedAnomalies = [];
      }
    }
    let parsedFocus = a.focusBreakdown;
    if (!parsedFocus) {
      try {
        parsedFocus = typeof a.focus_breakdown_json === 'string' ? JSON.parse(a.focus_breakdown_json) : (a.focus_breakdown_json || {});
      } catch (e) {
        parsedFocus = { sprint_work: 85, docs_research: 10, flagged_or_idle: 5 };
      }
    }
    return {
      ...a,
      anomalies: parsedAnomalies || [],
      focusBreakdown: parsedFocus || { sprint_work: 85, docs_research: 10, flagged_or_idle: 5 }
    };
  });

  const activeTasksCount = finalTasks.filter(t => t.status === 'active').length;
  const verifiedTasksCount = finalTasks.filter(t => t.status === 'verified').length;

  return {
    gridUsers,
    telemetryLogs: finalLogs,
    healthMatrix: {
      activeNodes: finalUsers.length,
      activeSprints: activeTasksCount,
      systemIntegrity: finalUsers.length > 0 ? '100%' : 'Idle',
      verifiedOutputs: verifiedTasksCount
    },
    sprintAudits: formattedAudits
  };
}

// ==============================================================================
// 5. DISPATCH AUTONOMOUS SPRINT TASK
// ==============================================================================
export async function dispatchSprintTask(taskTitle, taskDesc, assignedUserId) {
  const taskId = 'tsk_' + Date.now();
  const taskObj = {
    id: taskId,
    title: taskTitle,
    description: taskDesc,
    brief_content: taskDesc,
    assigned_to: assignedUserId,
    status: 'active',
    ai_health_score: 95,
    sprint_started_at: null,
    is_acknowledged: 0,
    screen_tracking_active: 0,
    warning_count: 0,
    session_terminated: 0,
    created_at: Date.now()
  };

  // 1. Server API
  try {
    await fetch('/api/tasks/ai-dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: `${taskTitle}\n${taskDesc}` })
    });
  } catch (e) {}

  // 2. Supabase Cloud (if configured)
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('tasks').insert([taskObj]);
    } catch (e) {
      console.warn('Supabase dispatchTask fallback:', e);
    }
  }

  // 3. Local Persistent Storage
  const localTasks = getLocalStore(STORAGE_KEYS.TASKS, []);
  localTasks.unshift(taskObj);
  setLocalStore(STORAGE_KEYS.TASKS, localTasks);

  // Broadcast realtime event
  await broadcastTelemetryEvent('TASK_DISPATCHED', { task: taskObj });
  return { success: true, task: taskObj };
}

// ==============================================================================
// 6. START 90-MINUTE SPRINT
// ==============================================================================
export async function startSprintSession(taskId, userId) {
  const now = Date.now();
  let finalTaskId = taskId;

  // 1. Notify Server API
  try {
    await fetch('/api/workspace/start-sprint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: finalTaskId, userId })
    });
  } catch (e) {}

  // If no task exists, auto-provision
  if (!finalTaskId) {
    finalTaskId = 'tsk_' + Date.now();
    const autoTask = {
      id: finalTaskId,
      title: 'Autonomous Engineering Sprint #1',
      description: '90-minute locked micro-sprint authorized by physical biometric passkey.',
      brief_content: 'Active micro-sprint session in progress. Biometric presence verified.',
      assigned_to: userId,
      status: 'active',
      ai_health_score: 98,
      sprint_started_at: now,
      is_acknowledged: 1,
      screen_tracking_active: 1,
      warning_count: 0,
      session_terminated: 0,
      created_at: now
    };

    if (isSupabaseConfigured && supabase) {
      try { await supabase.from('tasks').insert([autoTask]); } catch (e) {}
    }
    const localTasks = getLocalStore(STORAGE_KEYS.TASKS, []);
    localTasks.unshift(autoTask);
    setLocalStore(STORAGE_KEYS.TASKS, localTasks);
  } else {
    // Supabase Cloud
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase
          .from('tasks')
          .update({
            sprint_started_at: now,
            screen_tracking_active: 1,
            status: 'active',
            session_terminated: 0,
            warning_count: 0
          })
          .eq('id', finalTaskId);
      } catch (e) {
        console.warn('Supabase startSprint fallback:', e);
      }
    }

    // Local Persistent Storage
    const localTasks = getLocalStore(STORAGE_KEYS.TASKS, []);
    const taskIndex = localTasks.findIndex(t => t.id === finalTaskId);
    if (taskIndex !== -1) {
      localTasks[taskIndex].sprint_started_at = now;
      localTasks[taskIndex].screen_tracking_active = 1;
      localTasks[taskIndex].status = 'active';
      localTasks[taskIndex].session_terminated = 0;
      localTasks[taskIndex].warning_count = 0;
      setLocalStore(STORAGE_KEYS.TASKS, localTasks);
    }
  }

  await broadcastTelemetryEvent('SPRINT_STARTED', {
    taskId: finalTaskId,
    userId,
    startedAt: now
  });

  return { success: true, sprint_started_at: now, taskId: finalTaskId };
}

// ==============================================================================
// 7. SUBMIT PROOF OF WORK (DELIVERABLES)
// ==============================================================================
export async function submitProofOfWork(taskId, userId, prUrl, payloadNotes, bioToken = null) {
  const now = Date.now();
  const deliverable = {
    prUrl,
    payloadNotes,
    bioToken,
    submitted_at: now
  };

  // 1. Server API
  try {
    await fetch('/api/workspace/submit-pow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, userId, proofUrl: prUrl, payloadText: payloadNotes })
    });
  } catch (e) {}

  // 2. Supabase Cloud
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase
        .from('tasks')
        .update({
          status: 'review',
          proof_url: prUrl,
          payload_notes: payloadNotes,
          screen_tracking_active: 0
        })
        .eq('id', taskId);
    } catch (e) {
      console.warn('Supabase submitPoW fallback:', e);
    }
  }

  // 3. Local Persistent Storage
  const localTasks = getLocalStore(STORAGE_KEYS.TASKS, []);
  const taskIndex = localTasks.findIndex(t => t.id === taskId);
  if (taskIndex !== -1) {
    localTasks[taskIndex].status = 'review';
    localTasks[taskIndex].proof_url = prUrl;
    localTasks[taskIndex].payload_notes = payloadNotes;
    localTasks[taskIndex].screen_tracking_active = 0;
    setLocalStore(STORAGE_KEYS.TASKS, localTasks);
  }

  await broadcastTelemetryEvent('POW_SUBMITTED', {
    taskId,
    userId,
    deliverable
  });

  return { success: true, deliverable };
}

// ==============================================================================
// 8. SEND TELEMETRY BEAT (Active Screen Monitoring Stream)
// ==============================================================================
export async function sendTelemetryBeat(userId, taskId, activeWindow, keystrokeRate, hardwareSpoofFlag = 0) {
  const now = Date.now();
  const logEntry = {
    id: 'log_' + now + '_' + Math.random().toString(36).substring(2, 6),
    user_id: userId,
    task_id: taskId || null,
    active_window: activeWindow,
    keystroke_rate: keystrokeRate,
    hardware_spoof_flag: hardwareSpoofFlag,
    timestamp: now
  };

  // 1. Post to Server API
  try {
    fetch('/api/telemetry/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        taskId,
        activeWindow,
        keystrokeRate,
        hardwareSpoofFlag
      })
    }).catch(() => {});
  } catch (e) {}

  // 2. If Supabase configured, insert into telemetry_logs
  if (isSupabaseConfigured && supabase) {
    try {
      supabase.from('telemetry_logs').insert([logEntry]).then(() => {}).catch(() => {});
    } catch (e) {}
  }

  // 3. Save to LocalStore
  const localLogs = getLocalStore(STORAGE_KEYS.LOGS, []);
  localLogs.unshift(logEntry);
  setLocalStore(STORAGE_KEYS.LOGS, localLogs.slice(0, 35));

  // 4. Broadcast
  await broadcastTelemetryEvent('TELEMETRY_UPDATE', { log: logEntry });

  return logEntry;
}

// ==============================================================================
// 9. TRIGGER AI AGENT WARNING & TERMINATION
// ==============================================================================
export async function triggerAiActivityCheck(taskId, userId, currentWarningCount) {
  const newCount = currentWarningCount + 1;
  const isTerminated = newCount >= 3;

  try {
    await fetch('/api/workspace/ai-activity-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskId,
        userId,
        isUnusual: true,
        activeWindow: 'Off-task window focus'
      })
    });
  } catch (e) {}

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase
        .from('tasks')
        .update({
          warning_count: newCount,
          session_terminated: isTerminated ? 1 : 0,
          screen_tracking_active: isTerminated ? 0 : 1
        })
        .eq('id', taskId);
    } catch (e) {
      console.warn('Supabase AI check fallback:', e);
    }
  }

  // Local Storage update
  const localTasks = getLocalStore(STORAGE_KEYS.TASKS, []);
  const taskIndex = localTasks.findIndex(t => t.id === taskId);
  if (taskIndex !== -1) {
    localTasks[taskIndex].warning_count = newCount;
    localTasks[taskIndex].session_terminated = isTerminated ? 1 : 0;
    localTasks[taskIndex].screen_tracking_active = isTerminated ? 0 : 1;
    setLocalStore(STORAGE_KEYS.TASKS, localTasks);
  }

  if (isTerminated) {
    await broadcastTelemetryEvent('SESSION_TERMINATED', {
      userId,
      taskId,
      reason: 'Session terminated automatically by AI Agent after 2 uncorrected warnings.',
      timestamp: Date.now()
    });
    return { success: true, terminated: true, warningCount: 3 };
  } else {
    await broadcastTelemetryEvent('AI_AGENT_WARNING', {
      userId,
      taskId,
      warningNumber: newCount,
      message: newCount === 1 
        ? 'Warning 1/2: Off-sprint window activity detected. Please return to your active sprint directive.'
        : 'Warning 2/2 (FINAL): Off-task activity still detected. Next infraction terminates the sprint session.',
      timestamp: Date.now()
    });
    return {
      success: true,
      warningCount: newCount,
      warning: {
        warningNumber: newCount,
        message: newCount === 1 
          ? 'Warning 1/2: Off-sprint window activity detected.'
          : 'Warning 2/2 (FINAL): Off-task activity still detected.'
      }
    };
  }
}

// ==============================================================================
// 10. SIMULATE HARDWARE SPOOF ANOMALY
// ==============================================================================
export async function simulateHardwareSpoof(targetUser, taskId) {
  const now = Date.now();
  const userName = targetUser?.name || 'Registered Node';
  const targetId = targetUser?.id || 'usr_target';
  const targetMac = targetUser?.device_mac_address || 'A4:83:E7:9B:10:C1';

  const alertPayload = {
    severity: 'CRITICAL',
    log: {
      id: 'log_spoof_' + now,
      user_id: targetId,
      user_name: userName,
      device_mac_address: targetMac,
      task_id: taskId || null,
      timestamp: now,
      active_window: 'SpoofDriver.sys (Virtual Macro Injector)',
      keystroke_rate: 180.5,
      hardware_spoof_flag: 1
    },
    timestamp: now,
    alertTitle: 'SECURITY SENTINEL: HARDWARE SPOOF DETECTED',
    alertMessage: `Simulated spoofing signal intercepted on ${userName} (${targetMac})! Synthetic input entropy detected.`
  };

  // 1. Post to Server API
  try {
    await fetch('/api/telemetry/simulate-spoof', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: targetId, taskId })
    });
  } catch (e) {}

  // 2. Supabase Cloud (if configured)
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('telemetry_logs').insert([alertPayload.log]);
      if (taskId) {
        await supabase.from('tasks').update({ ai_health_score: 22 }).eq('id', taskId);
      }
    } catch (e) {
      console.warn('Supabase spoof insert error:', e);
    }
  }

  // 3. Local Storage
  const localLogs = getLocalStore(STORAGE_KEYS.LOGS, []);
  localLogs.unshift(alertPayload.log);
  setLocalStore(STORAGE_KEYS.LOGS, localLogs.slice(0, 35));

  await broadcastTelemetryEvent('HARDWARE_SPOOF_ALERT', alertPayload);
  return { success: true, alert: alertPayload };
}
