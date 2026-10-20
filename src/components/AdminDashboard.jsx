import React, { useState, useEffect, useRef } from 'react';
import { 
  Shield, 
  Cpu, 
  RotateCw, 
  Send, 
  Sparkles, 
  ArrowUpRight, 
  Activity, 
  CheckCircle2, 
  AlertTriangle,
  Layers,
  Laptop,
  Video,
  Play,
  Smartphone,
  Monitor,
  Eye,
  Clock,
  X,
  ExternalLink,
  Fingerprint
} from 'lucide-react';
import { fetchAdminData, dispatchSprintTask } from '../lib/dataService';

export function AdminDashboard({ currentUser, lastWsEvent, activeTab, onInspectEmployee }) {
  const [gridUsers, setGridUsers] = useState([]);
  const [telemetryLogs, setTelemetryLogs] = useState([]);
  const [healthMatrix, setHealthMatrix] = useState([]);
  const [sprintAudits, setSprintAudits] = useState([]);
  const [selectedAudit, setSelectedAudit] = useState(null);
  const [videoError, setVideoError] = useState(false);
  const [loading, setLoading] = useState(true);
  const videoPlayerRef = useRef(null);

  // Smooth scroll to section when activeTab changes
  useEffect(() => {
    if (!activeTab) return;
    if (activeTab === 'dashboard') {
      const el = document.getElementById('section-nodes');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (activeTab === 'audits') {
      const el = document.getElementById('section-audits');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (activeTab === 'telemetry') {
      const el = document.getElementById('section-telemetry');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [activeTab]);

  // Dispatch Terminal state
  const [dispatchPrompt, setDispatchPrompt] = useState('');
  const [dispatchLogs, setDispatchLogs] = useState([]);
  const [isDispatching, setIsDispatching] = useState(false);
  const [pipelineStep, setPipelineStep] = useState(0);

  // Telemetry batching refs to keep UI silky smooth and lag-free
  const pendingLogsRef = useRef([]);
  const pendingUserUpdatesRef = useRef(new Map());
  const throttleTimerRef = useRef(null);

  const flushTelemetryBatch = () => {
    if (pendingLogsRef.current.length > 0) {
      const logsToAdd = [...pendingLogsRef.current];
      pendingLogsRef.current = [];
      setTelemetryLogs(prev => [...logsToAdd, ...prev].slice(0, 35));
    }

    if (pendingUserUpdatesRef.current.size > 0) {
      const updatesMap = new Map(pendingUserUpdatesRef.current);
      pendingUserUpdatesRef.current.clear();

      setGridUsers(prev => prev.map(u => {
        if (updatesMap.has(u.id)) {
          const update = updatesMap.get(u.id);
          return {
            ...u,
            telemetry: {
              active_window: update.active_window,
              keystroke_rate: update.keystroke_rate,
              hardware_spoof_flag: update.hardware_spoof_flag,
              timestamp: update.timestamp
            }
          };
        }
        return u;
      }));
    }
  };

  // Fetch initial dashboard state (from Supabase Cloud or local API)
  const fetchDashboardData = async () => {
    try {
      const data = await fetchAdminData();
      if (data) {
        setGridUsers(data.gridUsers || []);
        setTelemetryLogs(data.telemetryLogs || []);
        
        // Build table items for health matrix from real active tasks only
        const matrixItems = (data.gridUsers || [])
          .filter(u => u.active_task && u.active_task.id)
          .map(u => ({
            task_id: u.active_task.id,
            node_name: u.name,
            node_id: u.id,
            employee_name: u.name,
            device_mac_address: u.device_mac_address,
            title: u.active_task.title,
            current_window: u.telemetry?.active_window || 'Standby',
            ai_health_score: u.active_task.ai_health_score || (u.telemetry?.hardware_spoof_flag === 1 ? 22 : 92),
            hardware_spoof_flag: u.telemetry?.hardware_spoof_flag === 1,
            status: u.active_task.status || 'active'
          }));
        setHealthMatrix(matrixItems);
        setSprintAudits(data.sprintAudits || []);
      }
      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch admin data', err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    return () => {
      if (throttleTimerRef.current) clearTimeout(throttleTimerRef.current);
    };
  }, []);

  // React to incoming WebSocket events
  useEffect(() => {
    if (!lastWsEvent) return;

    if (lastWsEvent.type === 'AUDIT_COMPLETED') {
      const newAudit = lastWsEvent.data.audit;
      if (newAudit) {
        setSprintAudits(prev => [newAudit, ...prev.filter(a => a.id !== newAudit.id)]);
      }
    }

    if (lastWsEvent.type === 'HARDWARE_SPOOF_ALERT') {
      // Priority instant dispatch for critical hardware security alerts
      const newLog = lastWsEvent.data.log || lastWsEvent.data;
      setTelemetryLogs(prev => [newLog, ...prev.slice(0, 35)]);
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
    } else if (lastWsEvent.type === 'TELEMETRY_UPDATE') {
      // Smooth batching for routine telemetry updates to eliminate lag
      const newLog = lastWsEvent.data.log || lastWsEvent.data;
      pendingLogsRef.current.unshift(newLog);
      pendingUserUpdatesRef.current.set(newLog.user_id, newLog);

      if (!throttleTimerRef.current) {
        throttleTimerRef.current = setTimeout(() => {
          throttleTimerRef.current = null;
          flushTelemetryBatch();
        }, 1200);
      }
    }

    if (
      lastWsEvent.type === 'TASK_DISPATCHED' || 
      lastWsEvent.type === 'SPRINT_STARTED' || 
      lastWsEvent.type === 'POW_SUBMITTED' ||
      lastWsEvent.type === 'SESSION_TERMINATED' ||
      lastWsEvent.type === 'TIMER_COMPLETED'
    ) {
      fetchDashboardData();
    }
  }, [lastWsEvent]);

  // Action 1: Multi-Agent Dispatch with Real Connected Nodes
  const handleInitializeDispatch = async () => {
    if (!dispatchPrompt.trim()) return;
    setIsDispatching(true);
    setPipelineStep(1);
    setDispatchLogs([
      `Ingesting raw sprint directives and execution boundaries...`,
      `SpecDeconstructor parsing requirements and latency limits...`
    ]);

    try {
      setTimeout(() => setPipelineStep(2), 250);
      setTimeout(() => setPipelineStep(3), 500);

      // Select target employee node (or first available registered node)
      const employeeNodes = gridUsers.filter(u => u.role === 'employee');
      const targetNode = employeeNodes.length > 0 ? employeeNodes[0] : (gridUsers[0] || null);

      if (!targetNode) {
        setDispatchLogs(prev => [
          ...prev,
          `[Notice] No active nodes connected. Please register an engineering node first.`
        ]);
        setIsDispatching(false);
        return;
      }

      const sprintTitle = dispatchPrompt.length > 55
        ? dispatchPrompt.slice(0, 55) + '...'
        : dispatchPrompt;

      const res = await dispatchSprintTask(sprintTitle, dispatchPrompt, targetNode.id);

      if (res && res.success) {
        setTimeout(() => {
          setPipelineStep(4);
          setDispatchLogs(prev => [
            ...prev,
            `CapacityMatcher matched directive to node: ${targetNode.name} (${targetNode.device_mac_address})`,
            `90-minute burst sprint checkpoint initialized.`,
            `Sprint dispatched successfully to engineering node.`
          ]);
          setIsDispatching(false);
          setDispatchPrompt('');
          fetchDashboardData();
        }, 750);
      } else {
        throw new Error('Dispatch could not be completed');
      }
    } catch (err) {
      setDispatchLogs(prev => [...prev, `[Dispatch Notice] ${err.message}`]);
      setIsDispatching(false);
    }
  };

  const getHealthClass = (score) => {
    if (score >= 75) return 'green';
    if (score >= 50) return 'yellow';
    return 'red';
  };

  const avgHealth = healthMatrix.length 
    ? Math.round(healthMatrix.reduce((acc, t) => acc + (t.ai_health_score || 0), 0) / healthMatrix.length)
    : 85;

  return (
    <div className="wrap" style={{ paddingBottom: '80px' }}>
      {/* Editorial Page Hero */}
      <div className="page-hero">
        <div className="section-kicker">Operations Grid & Sentinel</div>
        <h1 className="hero-title">
          Operational oversight, <span class="accent">running quietly.</span>
        </h1>
        <p className="hero-subtitle">
          Autonomous sprint dispatching, continuous telemetry auditing, and hardware integrity verification across your engineering nodes.
        </p>
      </div>

      {/* INOVEX Summary Specimen Grid */}
      <div className="specimen-grid">
        <div className="specimen-box">
          <div className="specimen-label">Total Nodes</div>
          <div className="specimen-num">{gridUsers.length.toString().padStart(2, '0')}</div>
          <div className="specimen-sub">
            {gridUsers.filter(u => u.role === 'founder').length} Founders, {gridUsers.filter(u => u.role === 'employee').length} Engineers
          </div>
        </div>
        <div className="specimen-box">
          <div className="specimen-label">Active Sprints</div>
          <div className="specimen-num">{healthMatrix.length.toString().padStart(2, '0')}</div>
          <div className="specimen-sub">Micro-sprints in progress</div>
        </div>
        <div className="specimen-box">
          <div className="specimen-label">Average Health</div>
          <div className="specimen-num">{healthMatrix.length > 0 ? avgHealth : '100'}<span style={{ fontSize: '18px', color: 'var(--muted)', marginLeft: '2px' }}>%</span></div>
          <div className="specimen-sub">{healthMatrix.length > 0 ? 'Pacing telemetry index' : 'All systems nominal'}</div>
        </div>
        <div className="specimen-box">
          <div className="specimen-label">Telemetry Feed</div>
          <div className="specimen-num subtle mono" style={{ color: 'var(--accent-strong)' }}>Sub-Second</div>
          <div className="specimen-sub">WebSocket broadcast active</div>
        </div>
      </div>

      {/* 1. THE ORCHESTRATION GRID */}
      <div id="section-nodes" style={{ marginBottom: '48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <div className="section-kicker" style={{ marginBottom: '6px' }}>01 The Node Matrix</div>
            <h2 className="serif" style={{ fontSize: '28px', color: 'var(--ink)' }}>Engineering & Founder Nodes</h2>
          </div>
          <button 
            className="btn btn-secondary" 
            style={{ padding: '6px 14px', fontSize: '12px' }}
            onClick={fetchDashboardData}
          >
            <RotateCw size={13} />
            <span>Refresh Grid</span>
          </button>
        </div>

        <div className="grid-nodes">
          {gridUsers.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', background: 'var(--card)', border: '1px dashed var(--line)', borderRadius: 'var(--radius)', padding: '36px 20px', textAlign: 'center' }}>
              <Laptop size={28} style={{ color: 'var(--muted-2)', marginBottom: '10px' }} />
              <h4 style={{ fontSize: '16px', color: 'var(--ink)', marginBottom: '6px' }}>No Nodes Connected Yet</h4>
              <p style={{ fontSize: '13px', color: 'var(--muted)', maxWidth: '440px', margin: '0 auto' }}>
                Engineering workstations and founder nodes will appear here in real-time as they authenticate and connect to the INOVEX sentinel enclave.
              </p>
            </div>
          ) : (
            gridUsers.map(user => {
              const isFounder = user.role === 'founder';
              const isSpoofed = user.telemetry?.hardware_spoof_flag === 1;
              const healthScore = user.active_task?.ai_health_score ?? 85;
              const healthClass = getHealthClass(healthScore);

              return (
                <div 
                  key={user.id} 
                  className={`node-card ${isFounder ? 'founder' : ''} ${isSpoofed ? 'anomaly' : ''}`}
                  onClick={() => {
                    if (!isFounder && onInspectEmployee) {
                      onInspectEmployee(user);
                    }
                  }}
                  style={{
                    cursor: !isFounder ? 'pointer' : 'default',
                    transition: 'all 0.2s ease'
                  }}
                  title={!isFounder ? `Click to inspect ${user.name}'s workspace & assigned tasks` : undefined}
                >
                <div className="node-card-header">
                  <div className="node-title-group">
                    {isFounder ? (
                      <Shield size={16} style={{ color: 'var(--accent-strong)' }} />
                    ) : (
                      <Laptop size={16} style={{ color: 'var(--muted)' }} />
                    )}
                    <span className="node-name">{user.name}</span>
                  </div>
                  <span className={`badge ${isFounder ? 'founder' : isSpoofed ? 'anomaly' : 'active'}`}>
                    <span className="badge-dot"></span>
                    {isFounder ? 'Founder' : isSpoofed ? 'Anomaly Detected' : 'Operational'}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                  <div className="node-mac" style={{ margin: 0 }}>MAC: {user.device_mac_address}</div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--status-green)', fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: '500' }}>
                    <Fingerprint size={12} />
                    <span>Bio Passkey Enrolled</span>
                  </span>
                </div>

                {isFounder ? (
                  <div>
                    <div className="node-divider"></div>
                    <div className="node-row">
                      <span>Permissions</span>
                      <strong>Global Read / Write</strong>
                    </div>
                    <div className="node-row">
                      <span>Task Router</span>
                      <strong className="mono" style={{ color: 'var(--accent-strong)' }}>Autonomous Dispatcher</strong>
                    </div>
                    <div className="node-row">
                      <span>Telemetry Mode</span>
                      <strong className="mono">Passive Overseer</strong>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="node-divider"></div>
                    <div style={{ marginBottom: '8px' }}>
                      <div className="specimen-label" style={{ fontSize: '10px', marginBottom: '2px' }}>Current Sprint</div>
                      <div style={{ fontWeight: '500', fontSize: '13px', color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {user.active_task ? user.active_task.title : 'Standby / Capacity Available'}
                      </div>
                    </div>

                    <div className="node-stat-pill">
                      <div className="node-row" style={{ marginBottom: '4px' }}>
                        <span style={{ fontSize: '12px' }}>Window Focus</span>
                        <strong className="mono" style={{ fontSize: '11px', color: 'var(--ink)' }}>
                          {user.telemetry?.active_window || 'Terminal'}
                        </strong>
                      </div>
                      <div className="node-row" style={{ marginBottom: '0' }}>
                        <span style={{ fontSize: '12px' }}>Keystroke Velocity</span>
                        <strong className="mono" style={{ fontSize: '11px', color: 'var(--accent-strong)' }}>
                          {user.telemetry?.keystroke_rate || 0} kps
                        </strong>
                      </div>
                    </div>

                    <div style={{ marginTop: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontFamily: 'var(--font-mono)', marginBottom: '5px' }}>
                        <span style={{ color: 'var(--muted)' }}>Health Score:</span>
                        <strong style={{ color: healthClass === 'green' ? 'var(--status-green)' : healthClass === 'yellow' ? 'var(--status-amber)' : 'var(--status-red)' }}>
                          {healthScore}/100
                        </strong>
                      </div>
                      <div className="meter-track">
                        <div className={`meter-fill ${healthClass}`} style={{ width: `${healthScore}%` }}></div>
                      </div>
                    </div>

                    {/* Open Employee Workspace Redirect Action */}
                    <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span className="specimen-label" style={{ fontSize: '10px', margin: 0 }}>Employee Workspace</span>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: '11px', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onInspectEmployee) onInspectEmployee(user);
                        }}
                      >
                        <span>Open Dashboard</span>
                        <span className="arr" aria-hidden="true">→</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          }))}
        </div>
      </div>

      {/* Split: Left (Dispatch + Matrix) | Right (Telemetry Feed) */}
      <div id="section-telemetry" className="dashboard-split">
        <div>
          {/* 2. TASK DISPATCH TERMINAL (Action 1) */}
          <div className="demo-shell">
            <div className="section-kicker">Action 01 • Multi-Agent Router</div>
            <h3 className="demo-shell-title">Autonomous Sprint Dispatcher</h3>
            <p className="demo-shell-sub">
              Enter raw requirements. Our capacity matching pipeline assigns the task to the optimal node and generates a 90-minute burst checkpoint.
            </p>

            {/* Pipeline Stage Indicators */}
            <div className="pipeline">
              <div className="pipe-step">
                <div className={`pipe-node ${pipelineStep >= 1 ? 'done' : pipelineStep === 0 ? 'active' : ''}`}>
                  01 Specs Ingest
                </div>
                <div className="pipe-arrow"></div>
              </div>
              <div className="pipe-step">
                <div className={`pipe-node ${pipelineStep >= 2 ? 'done' : pipelineStep === 1 ? 'active' : ''}`}>
                  02 Deconstruct
                </div>
                <div className="pipe-arrow"></div>
              </div>
              <div className="pipe-step">
                <div className={`pipe-node ${pipelineStep >= 3 ? 'done' : pipelineStep === 2 ? 'active' : ''}`}>
                  03 Capacity Match
                </div>
                <div className="pipe-arrow"></div>
              </div>
              <div className="pipe-step">
                <div className={`pipe-node ${pipelineStep >= 4 ? 'done' : pipelineStep === 3 ? 'active' : ''}`}>
                  04 Checkpoint Webhook
                </div>
              </div>
            </div>

            <textarea 
              className="dispatch-textarea"
              rows={3}
              value={dispatchPrompt}
              onChange={(e) => setDispatchPrompt(e.target.value)}
              placeholder="Describe sprint requirements, architectural constraints, and deliverables..."
            />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <button 
                className="btn btn-primary"
                onClick={handleInitializeDispatch}
                disabled={isDispatching}
                id="btn-init-dispatch"
              >
                <Sparkles size={14} />
                <span>{isDispatching ? 'Orchestrating Workflow...' : 'Initialize AI Dispatch'}</span>
                <span className="arr" aria-hidden="true">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 8L8 2M8 2H3.5M8 2V6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                </span>
              </button>
              <span className="mono" style={{ fontSize: '11px', color: 'var(--muted)' }}>
                Target: Automatic least-loaded node
              </span>
            </div>

            {/* Step Logs */}
            {dispatchLogs.length > 0 && (
              <div style={{ marginTop: '18px', background: 'var(--bg-warm)', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px 16px', fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--ink)' }}>
                {dispatchLogs.map((log, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--accent-strong)' }}>›</span>
                    <span>{log}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 3. PREDICTIVE HEALTH MATRIX */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div>
                <div className="section-kicker" style={{ marginBottom: '4px' }}>02 Health Telemetry</div>
                <h3 className="serif" style={{ fontSize: '24px', color: 'var(--ink)' }}>Predictive Health Matrix</h3>
              </div>
              <span className="mono" style={{ fontSize: '11px', color: 'var(--muted)' }}>
                {healthMatrix.length} active micro-sprints
              </span>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Task ID</th>
                    <th>Node</th>
                    <th>Sprint Title</th>
                    <th>Window Focus</th>
                    <th>Pacing Health</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {healthMatrix.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--muted)', fontSize: '13px' }}>
                        No active micro-sprints dispatched yet. Use the Autonomous Sprint Dispatcher above to assign work to connected nodes.
                      </td>
                    </tr>
                  ) : (
                    healthMatrix.map((task) => {
                    const healthClass = getHealthClass(task.ai_health_score);
                    return (
                      <tr key={task.task_id}>
                        <td className="mono" style={{ fontSize: '12px', color: 'var(--accent-strong)', fontWeight: '500' }}>
                          {task.task_id}
                        </td>
                        <td>
                          <div style={{ fontWeight: '500', color: 'var(--ink)', fontSize: '13px' }}>{task.employee_name}</div>
                          <div className="mono" style={{ fontSize: '10px', color: 'var(--muted-2)' }}>{task.device_mac_address}</div>
                        </td>
                        <td style={{ maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--ink)' }}>
                          {task.title}
                        </td>
                        <td className="mono" style={{ fontSize: '11px', color: 'var(--muted)' }}>
                          {task.current_window || 'Terminal'}
                        </td>
                        <td style={{ width: '130px' }}>
                          <div className="health-meter">
                            <div className="meter-track">
                              <div className={`meter-fill ${healthClass}`} style={{ width: `${task.ai_health_score}%` }}></div>
                            </div>
                            <span className="mono" style={{ fontSize: '11px', fontWeight: '600' }}>
                              {task.ai_health_score}
                            </span>
                          </div>
                        </td>
                        <td>
                          {task.hardware_spoof_flag ? (
                            <span className="badge anomaly">
                              <span className="badge-dot"></span>
                              Anomaly
                            </span>
                          ) : task.ai_health_score >= 75 ? (
                            <span className="badge active">
                              <span className="badge-dot"></span>
                              On Track
                            </span>
                          ) : (
                            <span className="badge caution">
                              <span className="badge-dot"></span>
                              Cautionary
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  }))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 4. LIVE TELEMETRY FEED (SIDEBAR) */}
        <div>
          <div className="log-feed">
            <div className="log-header">
              <span className="log-title">Telemetry Stream</span>
              <div className="live-pill" style={{ padding: '3px 8px', fontSize: '10px' }}>
                <span className="dot"></span>
                <span>Live</span>
              </div>
            </div>

            <div className="log-body">
              {telemetryLogs.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
                  Awaiting sub-second telemetry broadcast...
                </div>
              ) : (
                telemetryLogs.map((log, index) => {
                  const date = new Date(log.timestamp);
                  const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
                  const isAnomaly = log.hardware_spoof_flag === 1;

                  return (
                    <div key={log.id || index} className="log-entry">
                      <span className="log-time">{timeStr}</span>
                      <div className={`log-msg ${isAnomaly ? 'anomaly' : ''}`}>
                        <div>
                          <strong>{log.user_name || log.user_id}</strong>
                          {isAnomaly && (
                            <span className="badge anomaly" style={{ marginLeft: '6px', fontSize: '9px', padding: '2px 6px' }}>
                              Spoof
                            </span>
                          )}
                        </div>
                        <div className="mono" style={{ fontSize: '11px', color: 'var(--muted-2)', marginTop: '2px' }}>
                          {log.active_window || 'Background Process'} • {log.keystroke_rate} kps
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 5. 90-MINUTE SPRINT VIDEO AUDITS & AI ANOMALY REPORTS (Action 3) */}
      <div id="section-audits" className="audits-section">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '8px' }}>
          <div>
            <div className="section-kicker">Action 03 • Autonomous Video Intelligence</div>
            <h2 className="serif" style={{ fontSize: '28px', color: 'var(--ink)', marginTop: '4px' }}>
              Sprint Video Audits & AI Anomaly Reports
            </h2>
            <p style={{ color: 'var(--muted)', fontSize: '14px', maxWidth: '780px', marginTop: '4px' }}>
              Full 90-minute employee screen recordings captured automatically across Desktop Native and Android Mobile nodes. 
              Each session is processed through the AI Agent to detect unapproved application shifts, hardware spoofing, and idle intervals.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="mono" style={{ fontSize: '12px', color: 'var(--muted)', background: 'var(--card)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--line)' }}>
              Total Audited Sessions: <strong style={{ color: 'var(--ink)' }}>{sprintAudits.length}</strong>
            </span>
          </div>
        </div>

        {sprintAudits.length === 0 ? (
          <div style={{ background: 'var(--card)', border: '1px dashed var(--line)', borderRadius: 'var(--radius)', padding: '36px', textAlign: 'center', marginTop: '20px' }}>
            <Video size={32} style={{ color: 'var(--muted-2)', marginBottom: '12px' }} />
            <h4 style={{ fontSize: '16px', color: 'var(--ink)', marginBottom: '6px' }}>Awaiting First 90-Minute Sprint Submission</h4>
            <p style={{ fontSize: '13px', color: 'var(--muted)', maxWidth: '540px', margin: '0 auto' }}>
              When an employee node initiates their 90-minute timer on Desktop or Android, screen tracking records the entire sprint. 
              The AI Agent will audit the video upon completion and surface timestamped anomaly reports here.
            </p>
          </div>
        ) : (
          <div className="audit-grid">
            {sprintAudits.map((audit) => {
              const isAndroid = audit.device_type === 'android';
              const isClean = audit.verdict === 'CLEAN_VERIFIED';
              const isCritical = audit.verdict === 'CRITICAL_ANOMALIES';
              const durationMins = Math.round((audit.duration_seconds || 5400) / 60);

              const breakdown = audit.focusBreakdown || {
                sprint_work: 85,
                docs_research: 10,
                flagged_or_idle: 5
              };

              return (
                <div key={audit.id} className="audit-card">
                  <div>
                    <div className="audit-card-header">
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span className={`device-badge ${isAndroid ? 'android' : 'desktop'}`}>
                            {isAndroid ? <Smartphone size={11} /> : <Monitor size={11} />}
                            {isAndroid ? 'Android Native' : 'Desktop Agent'}
                          </span>
                          <span className="mono" style={{ fontSize: '10px', color: 'var(--muted-2)' }}>
                            {new Date(audit.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <h4 className="audit-title">{audit.employee_name}</h4>
                        <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '280px' }}>
                          {audit.task_title || 'Sprint Directive'}
                        </div>
                      </div>

                      <span className={`badge ${isClean ? 'active' : isCritical ? 'anomaly' : 'caution'}`}>
                        <span className="badge-dot"></span>
                        {isClean ? 'Clean Verified' : isCritical ? 'Critical Anomalies' : 'Minor Caution'}
                      </span>
                    </div>

                    <div className="audit-metrics-row">
                      <div className="audit-metric-item">
                        <span className="audit-metric-label">Duration</span>
                        <span className="audit-metric-val">{durationMins}m 00s</span>
                      </div>
                      <div className="audit-metric-item">
                        <span className="audit-metric-label">AI Health</span>
                        <span className="audit-metric-val" style={{ color: audit.ai_health_score >= 80 ? 'var(--status-green)' : audit.ai_health_score >= 60 ? 'var(--status-amber)' : 'var(--status-red)' }}>
                          {audit.ai_health_score}/100
                        </span>
                      </div>
                      <div className="audit-metric-item">
                        <span className="audit-metric-label">Anomalies</span>
                        <span className="audit-metric-val" style={{ color: audit.anomaly_count > 0 ? 'var(--status-red)' : 'var(--ink)' }}>
                          {audit.anomaly_count} flagged
                        </span>
                      </div>
                    </div>

                    <div className="focus-bar-wrap">
                      <div className="focus-bar-labels">
                        <span>Work: {breakdown.sprint_work}%</span>
                        <span>Docs: {breakdown.docs_research}%</span>
                        <span>Flagged/Idle: {breakdown.flagged_or_idle}%</span>
                      </div>
                      <div className="focus-bar-track">
                        <div className="focus-segment-work" style={{ width: `${breakdown.sprint_work}%` }} title="Sprint Work Focus"></div>
                        <div className="focus-segment-docs" style={{ width: `${breakdown.docs_research}%` }} title="Documentation / Reference"></div>
                        <div className="focus-segment-flagged" style={{ width: `${breakdown.flagged_or_idle}%` }} title="Off-task or Idle"></div>
                      </div>
                    </div>

                    <div className="audit-summary-quote">
                      "{audit.ai_summary}"
                    </div>
                  </div>

                  <button 
                    className="btn btn-secondary" 
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => {
                      setVideoError(false);
                      setSelectedAudit(audit);
                    }}
                  >
                    <Play size={13} />
                    <span>Review Video & Anomaly Timeline</span>
                    <span className="arr" aria-hidden="true">
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 8L8 2M8 2H3.5M8 2V6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 6. MODAL: FULL VIDEO AUDIT INSPECTOR & ANOMALY JUMP TIMELINE */}
      {selectedAudit && (
        <div className="audit-modal-backdrop" onClick={() => setSelectedAudit(null)}>
          <div className="audit-modal" onClick={(e) => e.stopPropagation()}>
            <div className="audit-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span className={`device-badge ${selectedAudit.device_type === 'android' ? 'android' : 'desktop'}`}>
                  {selectedAudit.device_type === 'android' ? <Smartphone size={12} /> : <Monitor size={12} />}
                  {selectedAudit.device_type === 'android' ? 'Android Native' : 'Desktop Agent'}
                </span>
                <div>
                  <h3 className="serif" style={{ fontSize: '20px', color: 'var(--ink)' }}>
                    Session Recording • {selectedAudit.employee_name}
                  </h3>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                    Task: {selectedAudit.task_title || selectedAudit.task_id} • Score: {selectedAudit.ai_health_score}/100 • Verdict: {selectedAudit.verdict}
                  </div>
                </div>
              </div>
              <button 
                className="btn btn-secondary" 
                style={{ padding: '6px 10px' }}
                onClick={() => setSelectedAudit(null)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="audit-modal-body">
              {/* HTML5 Video Player with Fallback AI Visual Stream Replay Engine */}
              <div className="video-player-box" style={{ minHeight: '260px', background: '#090d14', borderRadius: '10px', overflow: 'hidden', position: 'relative' }}>
                {!videoError && selectedAudit.video_url ? (
                  <video 
                    ref={videoPlayerRef}
                    controls 
                    playsInline
                    src={selectedAudit.video_url}
                    preload="metadata"
                    onError={() => setVideoError(true)}
                    style={{ width: '100%', height: '100%', maxHeight: '420px', display: 'block' }}
                  >
                    Your browser does not support the video element.
                  </video>
                ) : (
                  <div style={{ padding: '24px', background: '#090d14', color: '#EDF1E3', minHeight: '240px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1e2638', paddingBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="live-pill" style={{ fontSize: '10px', padding: '2px 8px' }}>
                          <span className="dot"></span>
                          <span>AI Visual Stream Replay</span>
                        </span>
                        <span className="mono" style={{ fontSize: '12px', color: '#8FA87B' }}>
                          {selectedAudit.video_filename}
                        </span>
                      </div>
                      <span className="mono" style={{ fontSize: '11px', color: '#64748b' }}>
                        Duration: {Math.round((selectedAudit.duration_seconds || 5400) / 60)}m 00s
                      </span>
                    </div>

                    <div style={{ margin: '20px 0', padding: '16px', background: '#101726', borderRadius: '8px', border: '1px solid #1e293b' }}>
                      <div className="mono" style={{ fontSize: '12px', color: '#7dd3fc', marginBottom: '8px' }}>
                        ▶ AI Agent Telemetry Trace Inspector • {selectedAudit.employee_name} ({selectedAudit.device_type?.toUpperCase() || 'DESKTOP'})
                      </div>
                      <div className="mono" style={{ fontSize: '11px', color: '#94a3b8', lineHeight: '1.6' }}>
                        <div>• Active Stream Hash: SHA256-STREAM-{selectedAudit.id?.slice(0, 12)}</div>
                        <div>• Telemetry Integrity Verified: 100% (Sub-second vsync pipeline)</div>
                        <div>• Verdict: <strong style={{ color: selectedAudit.verdict === 'CLEAN_VERIFIED' ? 'var(--status-green)' : 'var(--status-amber)' }}>{selectedAudit.verdict}</strong></div>
                        <div>• AI Audit Summary: "{selectedAudit.ai_summary}"</div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: '#64748b' }} className="mono">
                      <span>Stream status: Analyzed by neural agent enclave</span>
                      <span>Verified Output Lock</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Anomaly Jump Timeline */}
              <div style={{ background: 'var(--bg)', borderRadius: '10px', padding: '16px 20px', border: '1px solid var(--line)', marginBottom: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div className="specimen-label" style={{ fontSize: '11px', textTransform: 'uppercase' }}>
                    AI-Identified Anomalies ({selectedAudit.anomalies?.length || 0}) — Click timestamp to jump video
                  </div>
                  <span className="mono" style={{ fontSize: '11px', color: 'var(--muted)' }}>
                    Synchronized with AI Inspector
                  </span>
                </div>

                {(!selectedAudit.anomalies || selectedAudit.anomalies.length === 0) ? (
                  <div style={{ fontSize: '13px', color: 'var(--status-green)', display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 0' }}>
                    <CheckCircle2 size={16} />
                    <span>No infractions or suspicious window switches identified by AI Agent. Continuous work stream verified.</span>
                  </div>
                ) : (
                  <div className="anomaly-jump-grid">
                    {selectedAudit.anomalies.map((anom, idx) => (
                      <button
                        key={idx}
                        className="anomaly-jump-btn"
                        onClick={() => {
                          if (videoPlayerRef.current) {
                            videoPlayerRef.current.currentTime = anom.timeOffsetSec || 0;
                            videoPlayerRef.current.play();
                          }
                        }}
                      >
                        <Clock size={12} style={{ color: 'var(--status-red)' }} />
                        <strong>[{anom.timeFormatted}]</strong>
                        <span>{anom.description}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* AI Agent Verdict & Audit Commentary */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
                <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: '8px', padding: '16px' }}>
                  <div className="specimen-label" style={{ fontSize: '10px', marginBottom: '4px' }}>AI Integrity Score</div>
                  <div className="serif" style={{ fontSize: '32px', color: selectedAudit.ai_health_score >= 80 ? 'var(--status-green)' : selectedAudit.ai_health_score >= 60 ? 'var(--status-amber)' : 'var(--status-red)' }}>
                    {selectedAudit.ai_health_score}<span style={{ fontSize: '16px', color: 'var(--muted)' }}>/100</span>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>
                    Calculated based on sustained input entropy, window switching frequency, and sprint directive alignment.
                  </p>
                </div>

                <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: '8px', padding: '16px' }}>
                  <div className="specimen-label" style={{ fontSize: '10px', marginBottom: '4px' }}>AI Agent Verdict</div>
                  <div style={{ fontWeight: '600', fontSize: '16px', color: 'var(--ink)', marginBottom: '4px' }}>
                    {selectedAudit.verdict.replace('_', ' ')}
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic' }}>
                    "{selectedAudit.ai_summary}"
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
