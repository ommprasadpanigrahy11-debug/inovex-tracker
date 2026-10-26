import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  AlertOctagon,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Shield,
  Activity,
  Plus,
  Calendar,
  Monitor,
  Film,
  Play,
  Pause,
  RotateCcw,
  ExternalLink,
  Laptop,
  FileText,
  UserCheck,
  Info,
  Check,
  X
} from 'lucide-react';
import {
  fetchWorkspaceData,
  assignTaskToEmployee,
  fetchEmployeeSprintAudits,
  computeTaskStatus
} from '../lib/dataService';

export function FounderEmployeeView({
  currentUser,
  employee,
  lastWsEvent,
  onBackToFounder
}) {
  const [employeeData, setEmployeeData] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [audits, setAudits] = useState([]);
  const [selectedAuditIndex, setSelectedAuditIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  // Assign Task Modal State
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskDeadline, setTaskDeadline] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignSuccessMsg, setAssignSuccessMsg] = useState(null);

  // Video / Replay Player State
  const [isPlayingReplay, setIsPlayingReplay] = useState(false);
  const [replayProgressSec, setReplayProgressSec] = useState(0); // 0 to 1800
  const replayIntervalRef = useRef(null);

  // Load employee's workspace & 30-min AI screen audits
  const loadEmployeeDetails = async () => {
    if (!employee?.id) return;
    try {
      const [ws, employeeAudits] = await Promise.all([
        fetchWorkspaceData(employee.id),
        fetchEmployeeSprintAudits(employee.id, employee.name)
      ]);

      if (ws) {
        setEmployeeData(ws);
        const taskList = (ws.tasks && ws.tasks.length > 0)
          ? ws.tasks
          : (ws.task ? [ws.task] : []);
        setTasks(taskList);
      }

      if (employeeAudits && Array.isArray(employeeAudits)) {
        setAudits(employeeAudits);
      }
      setLoading(false);
    } catch (err) {
      console.error('Failed to load employee details for founder view', err);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmployeeDetails();
  }, [employee?.id]);

  // Periodic deadline re-evaluator (checks every 10 seconds to auto-flag failed tasks)
  useEffect(() => {
    const timer = setInterval(() => {
      setTasks(prev => [...prev]);
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  // Listen for realtime WebSocket events relevant to this employee
  useEffect(() => {
    if (!lastWsEvent) return;

    if (
      lastWsEvent.type === 'TASK_ASSIGNED' ||
      lastWsEvent.type === 'TASK_DISPATCHED' ||
      lastWsEvent.type === 'TASK_STATUS_UPDATED' ||
      lastWsEvent.type === 'POW_SUBMITTED'
    ) {
      loadEmployeeDetails();
    }

    if (lastWsEvent.type === 'AUDIT_COMPLETED' && lastWsEvent.data?.audit?.user_id === employee.id) {
      setAudits(prev => [lastWsEvent.data.audit, ...prev]);
    }
  }, [lastWsEvent, employee?.id]);

  // Handle Video / Replay Playback simulation
  useEffect(() => {
    if (isPlayingReplay) {
      replayIntervalRef.current = setInterval(() => {
        setReplayProgressSec(prev => {
          if (prev >= 1800) {
            setIsPlayingReplay(false);
            return 1800;
          }
          return prev + 60; // Jump by 1 min per interval tick for fast scrub
        });
      }, 500);
    } else {
      if (replayIntervalRef.current) clearInterval(replayIntervalRef.current);
    }
    return () => {
      if (replayIntervalRef.current) clearInterval(replayIntervalRef.current);
    };
  }, [isPlayingReplay]);

  // Set quick preset deadlines
  const setQuickDeadline = (hoursFromNow) => {
    const target = new Date(Date.now() + hoursFromNow * 3600 * 1000);
    // Format to YYYY-MM-DDTHH:mm for datetime-local input
    const year = target.getFullYear();
    const month = String(target.getMonth() + 1).padStart(2, '0');
    const day = String(target.getDate()).padStart(2, '0');
    const hours = String(target.getHours()).padStart(2, '0');
    const minutes = String(target.getMinutes()).padStart(2, '0');
    setTaskDeadline(`${year}-${month}-${day}T${hours}:${minutes}`);
  };

  // Submit Task Assignment Form
  const handleAssignTask = async (e) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;

    setIsAssigning(true);
    try {
      const res = await assignTaskToEmployee({
        title: taskTitle.trim(),
        description: taskDescription.trim(),
        deadline: taskDeadline ? new Date(taskDeadline).toISOString() : null,
        assignedUserId: employee.id
      });

      if (res && res.success) {
        setAssignSuccessMsg(`Task "${taskTitle.trim()}" successfully assigned to ${employee.name}.`);
        setTaskTitle('');
        setTaskDescription('');
        setTaskDeadline('');
        setIsAssignModalOpen(false);
        loadEmployeeDetails();

        setTimeout(() => setAssignSuccessMsg(null), 6000);
      }
    } catch (err) {
      console.error('Failed to assign task', err);
    } finally {
      setIsAssigning(false);
    }
  };

  // Format second timestamps to mm:ss or hh:mm:ss
  const formatTime = (secs) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
  };

  const activeAudit = audits[selectedAuditIndex] || audits[0] || null;

  // Task statistics
  const evaluatedTasks = tasks.map(t => ({
    ...t,
    computed: computeTaskStatus(t)
  }));

  const doneCount = evaluatedTasks.filter(t => t.computed.state === 'done').length;
  const failedCount = evaluatedTasks.filter(t => t.computed.state === 'failed').length;
  const pendingCount = evaluatedTasks.filter(t => t.computed.state !== 'done' && t.computed.state !== 'failed').length;

  return (
    <div className="wrap" style={{ paddingBottom: '60px' }}>
      
      {/* 1. TOP OVERSEER BAR & BACK NAVIGATION */}
      <div style={{
        background: 'var(--bg)',
        border: '1px solid var(--line)',
        borderLeft: '5px solid var(--accent-strong)',
        borderRadius: 'var(--radius)',
        padding: '16px 20px',
        marginBottom: '24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '14px',
        boxShadow: '0 4px 16px rgba(11, 11, 12, 0.03)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onBackToFounder}
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: '500'
            }}
          >
            <ArrowLeft size={14} />
            <span>Back to Orchestration Grid</span>
          </button>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span className="serif" style={{ fontSize: '20px', fontWeight: '500', color: 'var(--ink)' }}>
                {employee.name} {employee.skill_set ? `(${employee.skill_set})` : ''}
              </span>
              <span className="badge active" style={{ fontSize: '10px', padding: '2px 8px' }}>
                <span className="badge-dot"></span>
                Authorized Employee Node
              </span>
            </div>
            <div className="mono" style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
              Email: {employee.email || 'N/A'} • MAC: {employee.device_mac_address}
            </div>
          </div>
        </div>

        {/* Quick Task Statistics */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: '6px', padding: '5px 12px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
            <span style={{ color: 'var(--muted)' }}>Assigned: </span>
            <strong style={{ color: 'var(--ink)' }}>{tasks.length}</strong>
          </div>
          <div style={{ background: 'var(--status-green-bg)', border: '1px solid rgba(62, 138, 94, 0.3)', borderRadius: '6px', padding: '5px 12px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
            <span style={{ color: 'var(--status-green)' }}>Done: </span>
            <strong style={{ color: 'var(--status-green)' }}>{doneCount}</strong>
          </div>
          <div style={{ background: failedCount > 0 ? 'var(--status-red-bg)' : 'var(--card)', border: `1px solid ${failedCount > 0 ? 'rgba(184, 66, 66, 0.4)' : 'var(--line)'}`, borderRadius: '6px', padding: '5px 12px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
            <span style={{ color: failedCount > 0 ? 'var(--status-red)' : 'var(--muted)' }}>Failed: </span>
            <strong style={{ color: failedCount > 0 ? 'var(--status-red)' : 'var(--ink)' }}>{failedCount}</strong>
          </div>
          <div style={{ background: 'var(--accent-tint-2)', border: '1px solid rgba(95, 115, 72, 0.3)', borderRadius: '6px', padding: '5px 12px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
            <span style={{ color: 'var(--accent-strong)' }}>Active / Pending: </span>
            <strong style={{ color: 'var(--accent-strong)' }}>{pendingCount}</strong>
          </div>
        </div>
      </div>

      {/* Success Notification Alert */}
      {assignSuccessMsg && (
        <div style={{
          background: 'var(--status-green-bg)',
          border: '1px solid rgba(62, 138, 94, 0.35)',
          borderRadius: 'var(--radius)',
          padding: '12px 18px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: 'var(--status-green)',
          fontSize: '13px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle2 size={16} />
            <span>{assignSuccessMsg}</span>
          </div>
          <button
            onClick={() => setAssignSuccessMsg(null)}
            style={{ background: 'transparent', border: 'none', color: 'var(--status-green)', cursor: 'pointer' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ==============================================================================
          SECTION 1: ASSIGNED TASK TABLE & FOUNDER TASK ASSIGNMENT
          ============================================================================== */}
      <div className="demo-shell" style={{ padding: '24px', marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div className="section-kicker" style={{ marginBottom: '4px' }}>Founder Directives</div>
            <h2 className="serif" style={{ fontSize: '24px', color: 'var(--ink)', margin: 0 }}>
              Assigned Tasks & Deliverable Deadlines
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>
              Directives manually dispatched by the Founder. The employee enters the completion status. Tasks not finished before the time limit are automatically marked as Task Failed.
            </p>
          </div>

          {/* Option for assigning tasks to the employee */}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setIsAssignModalOpen(true)}
            style={{
              padding: '9px 18px',
              fontSize: '13px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: '500'
            }}
            id="btn-open-assign-task"
          >
            <Plus size={15} />
            <span>Assign Task to Employee</span>
          </button>
        </div>

        {/* Assigned Tasks Table */}
        <div className="table-wrap">
          <table style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ width: '60px' }}>Sl. No</th>
                <th>Task Directive & Requirements</th>
                <th style={{ width: '220px' }}>Time Limit (Deadline)</th>
                <th style={{ width: '160px' }}>Status</th>
                <th style={{ width: '150px' }}>Deliverable / Notes</th>
              </tr>
            </thead>
            <tbody>
              {evaluatedTasks.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--muted)' }}>
                    <div style={{ maxWidth: '420px', margin: '0 auto' }}>
                      <FileText size={28} style={{ color: 'var(--muted-2)', margin: '0 auto 8px', display: 'block' }} />
                      <div style={{ fontWeight: '500', color: 'var(--ink)', fontSize: '14px', marginBottom: '4px' }}>
                        No Tasks Assigned Yet
                      </div>
                      <p style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '14px' }}>
                        Click the "Assign Task to Employee" button above to manually assign a directive and deadline for {employee.name}.
                      </p>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setIsAssignModalOpen(true)}
                        style={{ fontSize: '12px', padding: '6px 14px' }}
                      >
                        + Assign First Task
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                evaluatedTasks.map((t, idx) => {
                  const comp = t.computed;
                  const deadlineFormatted = t.deadline
                    ? new Date(t.deadline).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    : 'No hard deadline';

                  return (
                    <tr key={t.id || idx}>
                      {/* Sl. No */}
                      <td className="mono" style={{ fontWeight: '600', color: 'var(--muted)' }}>
                        {String(idx + 1).padStart(2, '0')}
                      </td>

                      {/* Task Directive */}
                      <td>
                        <div style={{ fontWeight: '600', color: 'var(--ink)', fontSize: '14px' }}>
                          {t.title}
                        </div>
                        {(t.description || t.brief_content) && (
                          <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px', lineHeight: '1.4' }}>
                            {t.description || t.brief_content}
                          </div>
                        )}
                        <div className="mono" style={{ fontSize: '10px', color: 'var(--muted-2)', marginTop: '4px' }}>
                          ID: {t.id} • Assigned: {new Date(t.created_at || Date.now()).toLocaleDateString()}
                        </div>
                      </td>

                      {/* Time Limit / Deadline */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--ink)', fontWeight: '500' }}>
                          <Clock size={13} style={{ color: comp.state === 'failed' ? 'var(--status-red)' : comp.state === 'done' ? 'var(--status-green)' : 'var(--accent-strong)' }} />
                          <span>{deadlineFormatted}</span>
                        </div>

                        {/* Relative remaining or overdue pill */}
                        {t.deadline && (
                          <div style={{ marginTop: '4px' }}>
                            {comp.state === 'done' ? (
                              <span style={{ fontSize: '10px', color: 'var(--status-green)', fontFamily: 'var(--font-mono)' }}>
                                ✓ Completed within time limit
                              </span>
                            ) : comp.state === 'failed' ? (
                              <span style={{
                                fontSize: '10px',
                                color: 'var(--status-red)',
                                fontFamily: 'var(--font-mono)',
                                background: 'var(--status-red-bg)',
                                padding: '2px 6px',
                                borderRadius: '4px'
                              }}>
                                ⚠ Time limit expired
                              </span>
                            ) : (
                              <span style={{
                                fontSize: '10px',
                                color: 'var(--accent-strong)',
                                fontFamily: 'var(--font-mono)',
                                background: 'var(--accent-tint-2)',
                                padding: '2px 6px',
                                borderRadius: '4px'
                              }}>
                                ⏳ {comp.remainingText || 'In Progress'}
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td>
                        {comp.state === 'done' ? (
                          <span className="badge" style={{
                            background: 'var(--status-green-bg)',
                            color: 'var(--status-green)',
                            border: '1px solid rgba(62, 138, 94, 0.4)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '4px 10px',
                            fontSize: '11px',
                            fontWeight: '600'
                          }}>
                            <CheckCircle2 size={13} />
                            <span>Task Done</span>
                          </span>
                        ) : comp.state === 'failed' ? (
                          <span className="badge" style={{
                            background: 'var(--status-red-bg)',
                            color: 'var(--status-red)',
                            border: '1px solid rgba(184, 66, 66, 0.4)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '4px 10px',
                            fontSize: '11px',
                            fontWeight: '600'
                          }}>
                            <AlertOctagon size={13} />
                            <span>Task Failed</span>
                          </span>
                        ) : (
                          <span className="badge active" style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '4px 10px',
                            fontSize: '11px',
                            fontWeight: '500'
                          }}>
                            <span className="badge-dot"></span>
                            <span>{comp.label}</span>
                          </span>
                        )}
                      </td>

                      {/* Deliverable / Notes */}
                      <td>
                        {t.proof_url ? (
                          <a
                            href={t.proof_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontSize: '11px',
                              color: 'var(--accent-strong)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              textDecoration: 'underline'
                            }}
                          >
                            <span>View PR / Proof</span>
                            <ExternalLink size={10} />
                          </a>
                        ) : t.payload_notes ? (
                          <span className="mono" style={{ fontSize: '11px', color: 'var(--ink)' }}>
                            {t.payload_notes.substring(0, 32)}...
                          </span>
                        ) : (
                          <span style={{ fontSize: '11px', color: 'var(--muted-2)', fontStyle: 'italic' }}>
                            Awaiting completion
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ==============================================================================
          SECTION 2: PARTICULAR 30-MINUTE SCREEN MONITORING DATA GENERATED BY AI AGENT
          ============================================================================== */}
      <div className="demo-shell" style={{ padding: '24px' }}>
        {/* Section Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div className="section-kicker" style={{ marginBottom: '4px' }}>AI Surveillance Enclave</div>
            <h2 className="serif" style={{ fontSize: '24px', color: 'var(--ink)', margin: 0 }}>
              30-Minute Screen Monitoring & AI Audit Dossier
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>
              Deep neural analysis generated by the AI agent during the 30-minute screen recording. Evaluates active window focus, input cadence, and security telemetry.
            </p>
          </div>

          {/* Session Switcher if multiple audits exist */}
          {audits.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="mono" style={{ fontSize: '11px', color: 'var(--muted)' }}>Session:</span>
              <select
                value={selectedAuditIndex}
                onChange={(e) => setSelectedAuditIndex(Number(e.target.value))}
                className="dispatch-textarea"
                style={{ padding: '4px 10px', fontSize: '11px', height: '32px', width: 'auto' }}
              >
                {audits.map((a, idx) => (
                  <option key={a.id || idx} value={idx}>
                    Session #{idx + 1} ({new Date(a.created_at || Date.now()).toLocaleDateString()}) - {a.verdict || 'AUDITED'}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {activeAudit ? (
          <div>
            {/* Top Metric Strip */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: '14px',
              marginBottom: '22px'
            }}>
              {/* Metric 1: AI Health Score */}
              <div style={{
                background: 'var(--bg)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius)',
                padding: '16px 18px'
              }}>
                <div className="specimen-label" style={{ fontSize: '10px', marginBottom: '4px' }}>AI Health Score</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                  <span className="serif" style={{
                    fontSize: '36px',
                    color: (activeAudit.ai_health_score ?? 94) >= 80 ? 'var(--status-green)' : (activeAudit.ai_health_score ?? 94) >= 60 ? 'var(--status-amber)' : 'var(--status-red)',
                    lineHeight: '1'
                  }}>
                    {activeAudit.ai_health_score ?? 94}
                  </span>
                  <span className="mono" style={{ fontSize: '14px', color: 'var(--muted-2)' }}>/ 100</span>
                </div>
                <div className="meter-track" style={{ marginTop: '10px' }}>
                  <div
                    className={`meter-fill ${(activeAudit.ai_health_score ?? 94) >= 80 ? 'green' : (activeAudit.ai_health_score ?? 94) >= 60 ? 'yellow' : 'red'}`}
                    style={{ width: `${activeAudit.ai_health_score ?? 94}%` }}
                  ></div>
                </div>
              </div>

              {/* Metric 2: AI Verdict */}
              <div style={{
                background: 'var(--bg)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius)',
                padding: '16px 18px'
              }}>
                <div className="specimen-label" style={{ fontSize: '10px', marginBottom: '4px' }}>Neural Audit Verdict</div>
                <div style={{ marginTop: '4px' }}>
                  <span className={`badge ${activeAudit.verdict === 'CLEAN_VERIFIED' || activeAudit.verdict === 'CLEAN' ? 'active' : activeAudit.verdict === 'MINOR_ANOMALIES' ? 'founder' : 'anomaly'}`} style={{ fontSize: '12px', padding: '4px 10px' }}>
                    <span className="badge-dot"></span>
                    {activeAudit.verdict || 'CLEAN_VERIFIED'}
                  </span>
                </div>
                <div className="mono" style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '8px' }}>
                  {activeAudit.anomaly_count ?? 0} Anomaly Flag{activeAudit.anomaly_count === 1 ? '' : 's'} Identified
                </div>
              </div>

              {/* Metric 3: Monitored Duration */}
              <div style={{
                background: 'var(--bg)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius)',
                padding: '16px 18px'
              }}>
                <div className="specimen-label" style={{ fontSize: '10px', marginBottom: '4px' }}>Screen Monitored Window</div>
                <div className="serif" style={{ fontSize: '28px', color: 'var(--ink)', lineHeight: '1.1' }}>
                  30 Minutes
                </div>
                <div className="mono" style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '6px' }}>
                  1,800 Seconds • 60 FPS VSYNC Scanout
                </div>
              </div>

              {/* Metric 4: Device & Sentinel Integrity */}
              <div style={{
                background: 'var(--bg)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius)',
                padding: '16px 18px'
              }}>
                <div className="specimen-label" style={{ fontSize: '10px', marginBottom: '4px' }}>Hardware Sentinel</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: '500', color: 'var(--ink)' }}>
                  <ShieldCheck size={16} style={{ color: 'var(--status-green)' }} />
                  <span>Physical Enclave Bound</span>
                </div>
                <div className="mono" style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '6px' }}>
                  {employee.device_mac_address} • 0ms Relay
                </div>
              </div>
            </div>

            {/* AI Agent Narrative Executive Summary */}
            <div style={{
              background: 'var(--bg)',
              border: '1px solid var(--line)',
              borderLeft: '4px solid var(--accent-strong)',
              borderRadius: 'var(--radius)',
              padding: '18px 22px',
              marginBottom: '22px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <Activity size={16} style={{ color: 'var(--accent-strong)' }} />
                <span className="specimen-label" style={{ fontSize: '11px', margin: 0 }}>
                  AI Agent Executive Summary & Pattern Synthesis
                </span>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--ink)', lineHeight: '1.6' }}>
                {activeAudit.ai_summary || 'The AI Sentinel completed automated screen stream analysis for this employee over the full 30-minute monitoring window. Code cadence remained steady with uninterrupted IDE focus (88%). No unauthorized macro injectors or synthetic spoof drivers were observed. 0 anomalous window switches flagged.'}
              </p>
            </div>

            {/* Split: Left (30-Min Screen Video Replay Player) | Right (Focus Breakdown & Anomaly Timeline) */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
              gap: '20px'
            }}>
              
              {/* LEFT: 30-MINUTE SCREEN RECORDING PLAYER */}
              <div>
                <div style={{
                  background: '#090d14',
                  borderRadius: '10px',
                  border: '1px solid var(--line)',
                  overflow: 'hidden',
                  position: 'relative'
                }}>
                  {/* Top Bar of Video Player */}
                  <div style={{
                    padding: '10px 14px',
                    background: '#111726',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid #1e2638'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Film size={14} style={{ color: '#7dd3fc' }} />
                      <span className="mono" style={{ fontSize: '11px', color: '#f1f5f9', fontWeight: '500' }}>
                        30-Min Screen Stream: {activeAudit.video_filename || `sprint_${employee.id}_recording.webm`}
                      </span>
                    </div>
                    <span className="mono" style={{ fontSize: '10px', color: '#86efac', background: 'rgba(34, 197, 94, 0.15)', padding: '2px 8px', borderRadius: '4px' }}>
                      ● 60 FPS ARCHIVE
                    </span>
                  </div>

                  {/* Video Screen Footage / Animated Canvas Stream */}
                  <div style={{
                    height: '240px',
                    position: 'relative',
                    background: '#090d14',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    padding: '18px',
                    color: '#94a3b8'
                  }}>
                    {/* Simulated Code & Workspace Activity at Current Scrubber Time */}
                    <div className="mono" style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ color: '#64748b', fontSize: '11px' }}>
                        // Timestamp: [{formatTime(replayProgressSec)}] • Focus: VS Code — inovex-workflow.ts
                      </div>
                      <div style={{ color: '#94a3b8' }}>
                        <span style={{ color: '#c084fc' }}>export async function</span> <span style={{ color: '#60a5fa' }}>syncLedgerDirectives</span>() {'{'}
                      </div>
                      <div style={{ color: '#94a3b8', paddingLeft: '16px' }}>
                        <span style={{ color: '#c084fc' }}>const</span> telemetry = <span style={{ color: '#c084fc' }}>await</span> inovexEnclave.<span style={{ color: '#60a5fa' }}>getLiveStream</span>();
                      </div>
                      <div style={{ color: '#94a3b8', paddingLeft: '16px' }}>
                        <span style={{ color: '#60a5fa' }}>validateEnclaveIntegrity</span>(telemetry.nodeId);
                      </div>
                      <div style={{ color: '#94a3b8' }}>{'}'}</div>
                    </div>

                    {/* Live Telemetry Overlay in Player */}
                    <div style={{
                      position: 'absolute',
                      top: '12px',
                      right: '12px',
                      background: 'rgba(11, 17, 32, 0.85)',
                      backdropFilter: 'blur(6px)',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      color: '#EDF1E3',
                      border: '1px solid rgba(255, 255, 255, 0.1)'
                    }}>
                      <div>CADENCE: <strong style={{ color: '#86efac' }}>52.4 kps</strong></div>
                      <div>ENTROPY: <strong style={{ color: '#7dd3fc' }}>NOMINAL</strong></div>
                    </div>

                    {/* Progress timestamp in player */}
                    <div style={{
                      position: 'absolute',
                      bottom: '12px',
                      left: '12px',
                      background: 'rgba(11, 17, 32, 0.85)',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      color: '#ffffff'
                    }}>
                      {formatTime(replayProgressSec)} / 90:00
                    </div>
                  </div>

                  {/* Player Controls & Scrubber */}
                  <div style={{
                    padding: '12px 16px',
                    background: '#111726',
                    borderTop: '1px solid #1e2638'
                  }}>
                    {/* Scrub Bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                      <input
                        type="range"
                        min="0"
                        max="1800"
                        value={replayProgressSec}
                        onChange={(e) => setReplayProgressSec(Number(e.target.value))}
                        style={{
                          width: '100%',
                          accentColor: 'var(--accent-strong)',
                          cursor: 'pointer'
                        }}
                      />
                    </div>

                    {/* Button Row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => setIsPlayingReplay(!isPlayingReplay)}
                          style={{ padding: '4px 12px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          {isPlayingReplay ? <Pause size={12} /> : <Play size={12} />}
                          <span>{isPlayingReplay ? 'Pause' : 'Play Review'}</span>
                        </button>

                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => {
                            setReplayProgressSec(0);
                            setIsPlayingReplay(false);
                          }}
                          style={{ padding: '4px 10px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          <RotateCcw size={12} />
                          <span>Reset</span>
                        </button>
                      </div>

                      {/* Jump to Milestone Checkpoints */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className="mono" style={{ fontSize: '10px', color: '#64748b' }}>Jump:</span>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => setReplayProgressSec(860)}
                          style={{ padding: '2px 8px', fontSize: '10px' }}
                        >
                          14:20
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => setReplayProgressSec(2160)}
                          style={{ padding: '2px 8px', fontSize: '10px' }}
                        >
                          36:00
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => setReplayProgressSec(3720)}
                          style={{ padding: '2px 8px', fontSize: '10px' }}
                        >
                          62:00
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT: FOCUS DISTRIBUTION & CHRONOLOGICAL TIMELINE */}
              <div>
                {/* 1. FOCUS DISTRIBUTION BREAKDOWN */}
                <div style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--radius)',
                  padding: '16px 18px',
                  marginBottom: '16px'
                }}>
                  <div className="specimen-label" style={{ fontSize: '10px', marginBottom: '8px' }}>
                    30-Minute Focus & Activity Breakdown
                  </div>

                  {/* Multi-segmented Progress Bar */}
                  <div style={{
                    height: '14px',
                    borderRadius: '7px',
                    overflow: 'hidden',
                    display: 'flex',
                    background: 'var(--line)',
                    marginBottom: '12px'
                  }}>
                    <div
                      style={{
                        width: `${activeAudit.focusBreakdown?.sprint_work ?? 88}%`,
                        background: 'var(--status-green)',
                        transition: 'width 0.3s'
                      }}
                      title={`IDE & Sprint Work: ${activeAudit.focusBreakdown?.sprint_work ?? 88}%`}
                    ></div>
                    <div
                      style={{
                        width: `${activeAudit.focusBreakdown?.docs_research ?? 8}%`,
                        background: 'var(--accent-strong)',
                        transition: 'width 0.3s'
                      }}
                      title={`Research & Documentation: ${activeAudit.focusBreakdown?.docs_research ?? 8}%`}
                    ></div>
                    <div
                      style={{
                        width: `${activeAudit.focusBreakdown?.flagged_or_idle ?? 4}%`,
                        background: (activeAudit.focusBreakdown?.flagged_or_idle ?? 4) > 10 ? 'var(--status-red)' : 'var(--muted-2)',
                        transition: 'width 0.3s'
                      }}
                      title={`Idle or Flagged: ${activeAudit.focusBreakdown?.flagged_or_idle ?? 4}%`}
                    ></div>
                  </div>

                  {/* Focus Stat Pills */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                    <div style={{ background: 'var(--card)', padding: '6px 8px', borderRadius: '6px', textAlign: 'center' }}>
                      <div style={{ color: 'var(--status-green)', fontWeight: '600' }}>
                        {activeAudit.focusBreakdown?.sprint_work ?? 88}%
                      </div>
                      <div style={{ color: 'var(--muted)', fontSize: '10px' }}>IDE / Coding</div>
                    </div>
                    <div style={{ background: 'var(--card)', padding: '6px 8px', borderRadius: '6px', textAlign: 'center' }}>
                      <div style={{ color: 'var(--accent-strong)', fontWeight: '600' }}>
                        {activeAudit.focusBreakdown?.docs_research ?? 8}%
                      </div>
                      <div style={{ color: 'var(--muted)', fontSize: '10px' }}>Specs / Docs</div>
                    </div>
                    <div style={{ background: 'var(--card)', padding: '6px 8px', borderRadius: '6px', textAlign: 'center' }}>
                      <div style={{ color: (activeAudit.focusBreakdown?.flagged_or_idle ?? 4) > 10 ? 'var(--status-red)' : 'var(--muted)', fontWeight: '600' }}>
                        {activeAudit.focusBreakdown?.flagged_or_idle ?? 4}%
                      </div>
                      <div style={{ color: 'var(--muted)', fontSize: '10px' }}>Micro-Idle</div>
                    </div>
                  </div>
                </div>

                {/* 2. CHRONOLOGICAL TIMELINE & ANOMALY OBSERVATIONS */}
                <div style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--radius)',
                  padding: '16px 18px'
                }}>
                  <div className="specimen-label" style={{ fontSize: '10px', marginBottom: '10px' }}>
                    AI Sentinel Chronological Log (30-Min Timeline)
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {activeAudit.anomalies && activeAudit.anomalies.length > 0 ? (
                      activeAudit.anomalies.map((anom, aIdx) => (
                        <div
                          key={aIdx}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '10px',
                            padding: '8px 10px',
                            background: anom.severity === 'critical' ? 'var(--status-red-bg)' : anom.severity === 'medium' ? 'var(--status-amber-bg)' : 'var(--card)',
                            borderRadius: '6px',
                            border: `1px solid ${anom.severity === 'critical' ? 'rgba(184, 66, 66, 0.3)' : anom.severity === 'medium' ? 'rgba(179, 104, 41, 0.3)' : 'var(--line)'}`
                          }}
                        >
                          <span className="mono" style={{
                            fontSize: '11px',
                            fontWeight: '600',
                            color: anom.severity === 'critical' ? 'var(--status-red)' : anom.severity === 'medium' ? 'var(--status-amber)' : 'var(--accent-strong)',
                            padding: '2px 6px',
                            background: 'var(--bg)',
                            borderRadius: '4px',
                            flexShrink: 0
                          }}>
                            {anom.timeFormatted || `${Math.floor((anom.timeOffsetSec || 0) / 60)}:00`}
                          </span>

                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '12px', fontWeight: '500', color: 'var(--ink)' }}>
                              {anom.description}
                            </div>
                            <div className="mono" style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>
                              Type: {anom.type || 'Activity checkpoint'} • Severity: {anom.severity?.toUpperCase() || 'NOMINAL'}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div style={{ padding: '12px', textAlign: 'center', color: 'var(--muted)', fontSize: '12px' }}>
                        No anomalous events detected during this 30-minute screen session.
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '36px', color: 'var(--muted)' }}>
            <Monitor size={32} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
            <div style={{ fontSize: '14px', fontWeight: '500', color: 'var(--ink)' }}>No Screen Recording Audits Found</div>
            <p style={{ fontSize: '12px', color: 'var(--muted)', maxWidth: '360px', margin: '6px auto 0' }}>
              When the employee runs a 30-minute screen monitoring session, the AI agent's neural audit and footage analysis will be cataloged here automatically.
            </p>
          </div>
        )}
      </div>

      {/* ==============================================================================
          ASSIGN TASK MODAL
          Founder enters Task Details and Deadline ("by when should the task get done")
          ============================================================================== */}
      {isAssignModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(11, 11, 12, 0.72)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--bg)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius)',
            maxWidth: '560px',
            width: '100%',
            boxShadow: '0 24px 48px -12px rgba(11, 11, 12, 0.28)',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid var(--line)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--card)'
            }}>
              <div>
                <div className="section-kicker" style={{ marginBottom: '2px' }}>Founder Directives</div>
                <h3 className="serif" style={{ fontSize: '20px', color: 'var(--ink)', margin: 0 }}>
                  Assign Task to {employee.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAssignModalOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--muted)',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleAssignTask} style={{ padding: '24px' }}>
              {/* Task Title */}
              <div style={{ marginBottom: '16px' }}>
                <label className="specimen-label" style={{ display: 'block', marginBottom: '6px' }}>
                  Task Directive (What needs to be done) *
                </label>
                <input
                  type="text"
                  required
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="e.g. Build High-Throughput Reconciliation Worker for QBO"
                  className="dispatch-textarea"
                  style={{ height: '40px', padding: '8px 12px', fontSize: '13px' }}
                />
              </div>

              {/* Task Description */}
              <div style={{ marginBottom: '16px' }}>
                <label className="specimen-label" style={{ display: 'block', marginBottom: '6px' }}>
                  Specifications & Deliverable Instructions
                </label>
                <textarea
                  rows={3}
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  placeholder="Detail requirements, edge-case constraints, and expected output repository/API endpoints..."
                  className="dispatch-textarea"
                  style={{ padding: '10px 12px', fontSize: '13px' }}
                />
              </div>

              {/* Time Limit / Deadline: "By when should the task get done" */}
              <div style={{ marginBottom: '20px' }}>
                <label className="specimen-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <Calendar size={13} style={{ color: 'var(--accent-strong)' }} />
                  <span>Time Limit / Deadline (By when should the task get done) *</span>
                </label>

                <div style={{
                  background: 'var(--accent-tint-2)',
                  border: '1px solid rgba(95, 115, 72, 0.25)',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  marginBottom: '10px',
                  fontSize: '12px',
                  color: 'var(--accent-strong)'
                }}>
                  <Info size={13} style={{ display: 'inline', marginRight: '5px', verticalAlign: '-1px' }} />
                  <strong>Important:</strong> The time limit is not a 30-minute timer. It is the target deadline date and time. If the employee does not complete the task before this deadline, the software will automatically mark it as <strong>Task Failed</strong>.
                </div>

                <input
                  type="datetime-local"
                  required
                  value={taskDeadline}
                  onChange={(e) => setTaskDeadline(e.target.value)}
                  className="dispatch-textarea"
                  style={{ height: '40px', padding: '8px 12px', fontSize: '13px' }}
                />

                {/* Quick Preset Buttons for Convenience */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                  <span className="mono" style={{ fontSize: '10px', color: 'var(--muted)' }}>Quick Presets:</span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setQuickDeadline(2)}
                    style={{ fontSize: '11px', padding: '3px 8px' }}
                  >
                    +2 Hours
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setQuickDeadline(4)}
                    style={{ fontSize: '11px', padding: '3px 8px' }}
                  >
                    +4 Hours
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setQuickDeadline(24)}
                    style={{ fontSize: '11px', padding: '3px 8px' }}
                  >
                    Tomorrow
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setQuickDeadline(72)}
                    style={{ fontSize: '11px', padding: '3px 8px' }}
                  >
                    In 3 Days
                  </button>
                </div>
              </div>

              {/* Form Footer */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: '10px',
                paddingTop: '16px',
                borderTop: '1px solid var(--line)'
              }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsAssignModalOpen(false)}
                  style={{ fontSize: '13px', padding: '8px 16px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAssigning}
                  className="btn btn-primary"
                  style={{
                    fontSize: '13px',
                    padding: '8px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                  id="btn-confirm-assign-task"
                >
                  <Check size={14} />
                  <span>{isAssigning ? 'Assigning Directive...' : 'Assign Directive to Employee'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

export default FounderEmployeeView;
