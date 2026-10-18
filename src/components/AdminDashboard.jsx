import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Cpu, 
  Terminal, 
  AlertTriangle, 
  Activity, 
  Clock, 
  CheckCircle2, 
  ExternalLink,
  Flame,
  Radio,
  Send,
  Sparkles,
  Layers,
  Monitor
} from 'lucide-react';

export function AdminDashboard({ currentUser, lastWsEvent }) {
  const [gridUsers, setGridUsers] = useState([]);
  const [telemetryLogs, setTelemetryLogs] = useState([]);
  const [healthMatrix, setHealthMatrix] = useState([]);
  const [loading, setLoading] = useState(true);

  // Dispatch Terminal state
  const [dispatchPrompt, setDispatchPrompt] = useState(
    'Implement high-throughput Webhook receiver for Gusto payroll events. Validate HMAC-SHA256 signatures, unpack employee delta payloads, and push to event broker with sub-15ms latency.'
  );
  const [dispatchLogs, setDispatchLogs] = useState([]);
  const [isDispatching, setIsDispatching] = useState(false);

  // Fetch initial dashboard state
  const fetchDashboardData = async () => {
    try {
      const [gridRes, feedRes, matrixRes] = await Promise.all([
        fetch('/api/admin/orchestration-grid'),
        fetch('/api/admin/telemetry-feed'),
        fetch('/api/admin/health-matrix')
      ]);

      const gridData = await gridRes.json();
      const feedData = await feedRes.json();
      const matrixData = await matrixRes.json();

      setGridUsers(gridData);
      setTelemetryLogs(feedData);
      setHealthMatrix(matrixData);
      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch admin data', err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // React to incoming WebSocket events
  useEffect(() => {
    if (!lastWsEvent) return;

    if (lastWsEvent.type === 'TELEMETRY_UPDATE' || lastWsEvent.type === 'HARDWARE_SPOOF_ALERT') {
      const newLog = lastWsEvent.data.log || lastWsEvent.data;
      setTelemetryLogs(prev => [newLog, ...prev.slice(0, 30)]);

      // Update grid live card for this user
      setGridUsers(prev => prev.map(u => {
        if (u.id === newLog.user_id) {
          return {
            ...u,
            telemetry: {
              active_window: newLog.active_window,
              keystroke_rate: newLog.keystroke_rate,
              hardware_spoof_flag: newLog.hardware_spoof_flag,
              timestamp: newLog.timestamp
            }
          };
        }
        return u;
      }));
    }

    if (lastWsEvent.type === 'TASK_DISPATCHED' || lastWsEvent.type === 'SPRINT_STARTED' || lastWsEvent.type === 'POW_SUBMITTED') {
      fetchDashboardData();
    }
  }, [lastWsEvent]);

  // Action 1: Initialize AI Dispatch Terminal
  const handleInitializeDispatch = async () => {
    if (!dispatchPrompt.trim()) return;
    setIsDispatching(true);
    setDispatchLogs([
      `[SYS: 00.01s] Ingesting raw project requirements...`,
      `[AI-AGENT: SpecDeconstructor] Parsing syntax, dependencies, and execution limits...`
    ]);

    try {
      const res = await fetch('/api/tasks/ai-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: dispatchPrompt })
      });
      const data = await res.json();

      if (data.success) {
        setTimeout(() => {
          setDispatchLogs(prev => [
            ...prev,
            `[AI-AGENT: CapacityMatcher] Analyzed telemetry velocity & current sprint loads across 4 Employee nodes.`,
            `[AI-AGENT: Router] Target Node confirmed -> ${data.assignedTo.name} (${data.assignedTo.id})`,
            `[AI-SENTINEL: Webhook] Created 90-minute Checkpoint Burst with PoW Webhook: ${data.task.proof_of_work_webhook}`,
            `[STATUS: COMPLETE] Micro-sprint dispatched to employee workspace!`
          ]);
          setIsDispatching(false);
          fetchDashboardData();
        }, 600);
      } else {
        setDispatchLogs(prev => [...prev, `[ERROR] ${data.error}`]);
        setIsDispatching(false);
      }
    } catch (err) {
      setDispatchLogs(prev => [...prev, `[ERROR] Connection failed: ${err.message}`]);
      setIsDispatching(false);
    }
  };

  const getHealthColor = (score) => {
    if (score >= 75) return 'green';
    if (score >= 50) return 'yellow';
    return 'red';
  };

  return (
    <div className="main-content">
      {/* Top Banner & Mode */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 className="heading" style={{ fontSize: '22px', fontWeight: '700', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Shield size={22} style={{ color: '#c084fc' }} />
            GOD-MODE ORCHESTRATION TERMINAL
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            RBAC Level: Founder / Global Overseer • Strict 6-User Telemetry Grid Active
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            className="btn btn-outline"
            onClick={fetchDashboardData}
            title="Refresh Grid Data"
          >
            <Activity size={14} /> Refresh Telemetry
          </button>
        </div>
      </div>

      {/* 1. THE ORCHESTRATION GRID (6-Card Layout: 2 Founders, 4 Employees) */}
      <div style={{ marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            [1] The Orchestration Grid (Strict 6-User Node Matrix)
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--accent-green)' }}>
            ● 2 FOUNDERS (ADMIN) / 4 EMPLOYEES (SCOPED)
          </span>
        </div>

        <div className="grid-6">
          {gridUsers.map(user => {
            const isFounder = user.role === 'founder';
            const isSpoofed = user.telemetry?.hardware_spoof_flag === 1;
            const healthScore = user.active_task?.ai_health_score ?? 85;
            const healthClass = getHealthColor(healthScore);

            return (
              <div 
                key={user.id} 
                className={`card ${isFounder ? 'founder-card' : 'employee-card'} ${isSpoofed ? 'has-spoof' : ''} ${!isFounder && healthScore < 50 ? 'at-risk' : ''}`}
              >
                <div className="card-header">
                  <div className="card-title">
                    {isFounder ? <Shield size={16} color="#c084fc" /> : <Cpu size={16} color="var(--accent-green)" />}
                    <span>{user.name}</span>
                  </div>
                  <span className={`badge ${isFounder ? 'badge-founder' : isSpoofed ? 'badge-risk' : 'badge-employee'}`}>
                    {isFounder ? 'ADMIN' : isSpoofed ? 'SPOOF ALERT' : user.status.toUpperCase()}
                  </span>
                </div>

                <div className="card-mac" style={{ marginBottom: '12px' }}>
                  MAC: {user.device_mac_address}
                </div>

                {isFounder ? (
                  // Founder Card details
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span>Role Level:</span>
                      <strong style={{ color: '#c084fc' }}>God-Mode Overseer</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span>Access:</span>
                      <span className="mono" style={{ fontSize: '11px' }}>GLOBAL_READ_WRITE</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Terminal:</span>
                      <span className="mono" style={{ color: 'var(--accent-cyan)', fontSize: '11px' }}>Active Dispatcher</span>
                    </div>
                  </div>
                ) : (
                  // Employee Card details
                  <div style={{ fontSize: '12px', borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }}>
                    {/* Active Task */}
                    <div style={{ marginBottom: '8px' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                        Current Micro-Sprint:
                      </div>
                      <div style={{ fontWeight: '500', fontSize: '12px', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {user.active_task ? user.active_task.title : 'Idle / Standby'}
                      </div>
                    </div>

                    {/* Telemetry info */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '10px', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                      <div style={{ background: 'var(--bg-elevated)', padding: '5px 8px', borderRadius: '4px' }}>
                        <div style={{ color: 'var(--text-dim)', fontSize: '9px' }}>WINDOW FOCUS</div>
                        <div style={{ color: 'var(--accent-cyan)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {user.telemetry?.active_window || 'None'}
                        </div>
                      </div>
                      <div style={{ background: 'var(--bg-elevated)', padding: '5px 8px', borderRadius: '4px' }}>
                        <div style={{ color: 'var(--text-dim)', fontSize: '9px' }}>KEYSTROKE VELOCITY</div>
                        <div style={{ color: 'var(--accent-green)' }}>
                          {user.telemetry?.keystroke_rate || 0} kps
                        </div>
                      </div>
                    </div>

                    {/* AI Health Score Bar */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontFamily: 'var(--font-mono)', marginBottom: '4px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>AI Health Score:</span>
                        <span style={{ color: healthClass === 'green' ? 'var(--accent-green)' : healthClass === 'yellow' ? 'var(--accent-amber)' : 'var(--accent-crimson)', fontWeight: '700' }}>
                          {healthScore}/100
                        </span>
                      </div>
                      <div className="meter-bar">
                        <div className={`meter-fill ${healthClass}`} style={{ width: `${healthScore}%` }}></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Split: Left (Dispatch + Health Matrix) | Right (Live Telemetry Feed Sidebar) */}
      <div className="admin-split">
        <div>
          {/* 2. TASK DISPATCH TERMINAL (CLI Style) */}
          <div className="dispatch-terminal">
            <div className="terminal-topbar">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="terminal-dots">
                  <div className="terminal-dot red"></div>
                  <div className="terminal-dot yellow"></div>
                  <div className="terminal-dot green"></div>
                </div>
                <span>dispatch@antigravity-kernel:~#</span>
              </div>
              <span>ACTION 1: MULTI-AGENT TASK DISPATCHER</span>
            </div>

            <div className="terminal-body">
              <div className="terminal-prompt">
                <Terminal size={14} />
                <span>Enter Raw Project Specification & Routing Requirements:</span>
              </div>

              <textarea 
                className="terminal-textarea"
                rows={3}
                value={dispatchPrompt}
                onChange={(e) => setDispatchPrompt(e.target.value)}
                placeholder="Describe project feature, requirements, constraints, and delivery goals..."
              />

              <div className="terminal-actions">
                <button 
                  className="btn btn-primary"
                  onClick={handleInitializeDispatch}
                  disabled={isDispatching}
                  id="btn-init-dispatch"
                >
                  <Sparkles size={14} />
                  {isDispatching ? 'Orchestrating Multi-Agent Workflow...' : 'Initialize AI Dispatch'}
                </button>
              </div>

              {/* Terminal Execution Log */}
              {dispatchLogs.length > 0 && (
                <div style={{ marginTop: '14px', background: '#020407', border: '1px solid var(--border-subtle)', borderRadius: '4px', padding: '12px', fontSize: '11px', color: '#38bdf8', lineHeight: '1.6' }}>
                  {dispatchLogs.map((log, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '8px' }}>
                      <span style={{ color: 'var(--accent-green)' }}>›</span>
                      <span>{log}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 3. PREDICTIVE HEALTH MATRIX TABLE */}
          <div className="data-table-container">
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 className="heading" style={{ fontSize: '14px', fontWeight: '600' }}>
                  Predictive Health Matrix
                </h3>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  Active Tasks across 4 Employees • Color-Coded by AI Telemetry Health Pacing
                </p>
              </div>
              <span className="badge badge-active">4 NODES MONITORED</span>
            </div>

            <table className="data-table">
              <thead>
                <tr>
                  <th>Task ID</th>
                  <th>Assigned Node</th>
                  <th>Task Title</th>
                  <th>Active App Focus</th>
                  <th>AI Health Score</th>
                  <th>Pacing Status</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {healthMatrix.map((task) => {
                  const healthColor = getHealthColor(task.ai_health_score);
                  return (
                    <tr key={task.task_id}>
                      <td className="mono" style={{ color: 'var(--accent-cyan)', fontSize: '12px' }}>
                        {task.task_id}
                      </td>
                      <td>
                        <div style={{ fontWeight: '600', fontSize: '12px' }}>{task.employee_name}</div>
                        <div className="mono" style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                          {task.device_mac_address}
                        </div>
                      </td>
                      <td style={{ maxWidth: '240px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {task.title}
                      </td>
                      <td className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {task.current_window || 'Terminal'}
                      </td>
                      <td style={{ width: '160px' }}>
                        <div className="health-meter">
                          <div className="meter-bar">
                            <div className={`meter-fill ${healthColor}`} style={{ width: `${task.ai_health_score}%` }}></div>
                          </div>
                          <span className="mono" style={{ fontSize: '11px', fontWeight: '700' }}>
                            {task.ai_health_score}
                          </span>
                        </div>
                      </td>
                      <td>
                        {task.hardware_spoof_flag ? (
                          <span className="badge badge-risk">CRITICAL ANOMALY</span>
                        ) : task.ai_health_score >= 75 ? (
                          <span className="badge badge-active">ON TRACK</span>
                        ) : task.ai_health_score >= 50 ? (
                          <span className="badge badge-warning">CAUTIONARY</span>
                        ) : (
                          <span className="badge badge-risk">AT RISK</span>
                        )}
                      </td>
                      <td>
                        <span className="mono" style={{ textTransform: 'uppercase', fontSize: '11px', color: task.status === 'active' ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                          {task.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 4. LIVE TELEMETRY FEED (SIDEBAR) */}
        <aside className="telemetry-sidebar">
          <div className="feed-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Radio size={14} style={{ color: 'var(--accent-green)' }} className="status-dot live" />
              <span className="heading" style={{ fontSize: '13px', fontWeight: '600' }}>
                Live Telemetry Stream
              </span>
            </div>
            <span className="mono" style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
              SUB-SECOND SSE
            </span>
          </div>

          <div className="feed-list">
            {telemetryLogs.map((log, index) => {
              const isSpoof = log.hardware_spoof_flag === 1;
              const dateStr = new Date(log.timestamp).toLocaleTimeString();

              return (
                <div key={log.id || index} className={`feed-item ${isSpoof ? 'spoof' : ''}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontWeight: '600', color: isSpoof ? 'var(--accent-crimson)' : 'var(--text-main)', fontSize: '12px' }}>
                      {log.user_name || log.user_id}
                    </span>
                    <span className="mono" style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                      {dateStr}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    <Monitor size={11} />
                    <span className="mono" style={{ color: 'var(--accent-cyan)' }}>
                      {log.active_window || 'Desktop Idle'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>
                    <span style={{ color: 'var(--text-dim)' }}>Rate: {log.keystroke_rate} kps</span>
                    {isSpoof ? (
                      <span style={{ color: 'var(--accent-crimson)', fontWeight: '700' }}>
                        ⚠ HARDWARE SPOOF DETECTED
                      </span>
                    ) : (
                      <span style={{ color: 'var(--accent-green)' }}>[ENTROPY VERIFIED]</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
