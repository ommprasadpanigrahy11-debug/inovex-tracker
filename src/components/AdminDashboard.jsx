import React, { useState, useEffect } from 'react';
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
  Laptop
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
  const [pipelineStep, setPipelineStep] = useState(0);

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
      setTelemetryLogs(prev => [newLog, ...prev.slice(0, 35)]);

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

  // Action 1: Multi-Agent Dispatch with Pipeline Animation
  const handleInitializeDispatch = async () => {
    if (!dispatchPrompt.trim()) return;
    setIsDispatching(true);
    setPipelineStep(1);
    setDispatchLogs([
      `08:00 Ingesting raw project requirements specification...`,
      `08:01 SpecDeconstructor agent parsing syntax and execution limits...`
    ]);

    try {
      setTimeout(() => setPipelineStep(2), 300);
      setTimeout(() => setPipelineStep(3), 600);

      const res = await fetch('/api/tasks/ai-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: dispatchPrompt })
      });
      const data = await res.json();

      if (data.success) {
        setTimeout(() => {
          setPipelineStep(4);
          setDispatchLogs(prev => [
            ...prev,
            `08:02 CapacityMatcher analyzed live telemetry velocity across 4 engineering nodes.`,
            `08:03 Target Node selected: ${data.assignedTo.name} (${data.assignedTo.id})`,
            `08:04 Checkpoint burst initiated. PoW Webhook: ${data.task.proof_of_work_webhook}`,
            `08:05 Micro-sprint dispatched to employee workspace successfully.`
          ]);
          setIsDispatching(false);
          fetchDashboardData();
        }, 900);
      } else {
        setDispatchLogs(prev => [...prev, `[Error] ${data.error}`]);
        setIsDispatching(false);
      }
    } catch (err) {
      setDispatchLogs(prev => [...prev, `[Connection Error] ${err.message}`]);
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

      {/* Lexven Summary Specimen Grid */}
      <div className="specimen-grid">
        <div className="specimen-box">
          <div className="specimen-label">Total Nodes</div>
          <div className="specimen-num">06</div>
          <div className="specimen-sub">2 Founders, 4 Employees</div>
        </div>
        <div className="specimen-box">
          <div className="specimen-label">Active Sprints</div>
          <div className="specimen-num">{healthMatrix.length}</div>
          <div className="specimen-sub">Micro-sprints in progress</div>
        </div>
        <div className="specimen-box">
          <div className="specimen-label">Average Health</div>
          <div className="specimen-num">{avgHealth}<span style={{ fontSize: '18px', color: 'var(--muted)', marginLeft: '2px' }}>%</span></div>
          <div className="specimen-sub">Pacing telemetry index</div>
        </div>
        <div className="specimen-box">
          <div className="specimen-label">Telemetry Feed</div>
          <div className="specimen-num subtle mono" style={{ color: 'var(--accent-strong)' }}>Sub-Second</div>
          <div className="specimen-sub">WebSocket broadcast active</div>
        </div>
      </div>

      {/* 1. THE ORCHESTRATION GRID */}
      <div style={{ marginBottom: '48px' }}>
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
          {gridUsers.map(user => {
            const isFounder = user.role === 'founder';
            const isSpoofed = user.telemetry?.hardware_spoof_flag === 1;
            const healthScore = user.active_task?.ai_health_score ?? 85;
            const healthClass = getHealthClass(healthScore);

            return (
              <div 
                key={user.id} 
                className={`node-card ${isFounder ? 'founder' : ''} ${isSpoofed ? 'anomaly' : ''}`}
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

                <div className="node-mac">MAC: {user.device_mac_address}</div>

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
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Split: Left (Dispatch + Matrix) | Right (Telemetry Feed) */}
      <div className="dashboard-split">
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
                  {healthMatrix.map((task) => {
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
                  })}
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
    </div>
  );
}
