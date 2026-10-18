import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  Lock, 
  Unlock, 
  CheckCircle, 
  CheckCircle2, 
  GitPullRequest, 
  Send, 
  ShieldCheck, 
  AlertTriangle, 
  AlertOctagon,
  ArrowUpRight,
  Terminal,
  Activity
} from 'lucide-react';

export function EmployeeWorkspace({ currentUser, lastWsEvent }) {
  const [workspaceData, setWorkspaceData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Timer State (90-min bursts = 5400 seconds)
  const [secondsRemaining, setSecondsRemaining] = useState(5400);
  const [isLockedOut, setIsLockedOut] = useState(false);

  // Proof-of-Work form state
  const [prUrl, setPrUrl] = useState('https://github.com/lexven-internal/core/pull/184');
  const [payloadNotes, setPayloadNotes] = useState('Completed unit test suite & verified streaming backpressure under 10k req/sec benchmark.');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);

  // Local simulated telemetry ticker
  const [localKeystrokes, setLocalKeystrokes] = useState(48);
  const [activeApp, setActiveApp] = useState('VS Code - tokenizer.ts');

  const fetchWorkspace = async () => {
    if (!currentUser?.id) return;
    try {
      const res = await fetch(`/api/workspace/${currentUser.id}`);
      const data = await res.json();
      setWorkspaceData(data);

      if (data.task && data.task.is_acknowledged && data.task.sprint_started_at) {
        const elapsedSeconds = Math.floor((Date.now() - data.task.sprint_started_at) / 1000);
        const remaining = Math.max(0, 5400 - elapsedSeconds);
        setSecondsRemaining(remaining);

        if (remaining <= 0 && data.task.status === 'active') {
          setIsLockedOut(true);
        }
      }
      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch workspace', err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkspace();
  }, [currentUser]);

  // WebSocket event listeners
  useEffect(() => {
    if (!lastWsEvent) return;
    if (lastWsEvent.type === 'TASK_DISPATCHED' && lastWsEvent.data?.assignedEmployee?.id === currentUser.id) {
      fetchWorkspace();
    }
    if (lastWsEvent.type === 'BURST_TIMEOUT_LOCKOUT' && lastWsEvent.data?.userId === currentUser.id) {
      setIsLockedOut(true);
    }
  }, [lastWsEvent, currentUser.id]);

  // Countdown Timer Interval
  useEffect(() => {
    if (!workspaceData?.task?.is_acknowledged || workspaceData?.task?.status !== 'active') {
      return;
    }

    const interval = setInterval(() => {
      setSecondsRemaining(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          handleTriggerLockout();
          return 0;
        }
        return prev - 1;
      });

      // Fluctuate local telemetry keystrokes slightly for realism
      setLocalKeystrokes(prev => Math.max(14, Math.min(92, prev + (Math.random() > 0.5 ? 2 : -2))));
    }, 1000);

    return () => clearInterval(interval);
  }, [workspaceData?.task?.is_acknowledged, workspaceData?.task?.status]);

  // Action 3: Trigger Lockout when timer hits 00:00 without submission
  const handleTriggerLockout = async () => {
    setIsLockedOut(true);
    if (workspaceData?.task?.id) {
      try {
        await fetch('/api/workspace/lockout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId: workspaceData.task.id,
            userId: currentUser.id
          })
        });
      } catch (err) {
        console.error('Failed to register lockout', err);
      }
    }
  };

  // Acknowledgment Gate: "I Understand & Accept"
  const handleAcknowledgeBrief = async () => {
    if (!workspaceData?.task?.id) return;
    try {
      const res = await fetch('/api/workspace/acknowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: workspaceData.task.id,
          userId: currentUser.id
        })
      });
      const data = await res.json();
      if (data.success) {
        fetchWorkspace();
      }
    } catch (err) {
      console.error('Failed to acknowledge brief', err);
    }
  };

  // Proof-of-Work Submission
  const handleSubmitProofOfWork = async (e) => {
    e.preventDefault();
    if (!workspaceData?.task?.id) return;
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/workspace/submit-pow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: workspaceData.task.id,
          userId: currentUser.id,
          proofUrl: prUrl,
          payloadText: payloadNotes
        })
      });
      const data = await res.json();
      setIsSubmitting(false);

      if (data.success) {
        setSubmissionSuccess(true);
        fetchWorkspace();
      }
    } catch (err) {
      console.error('Failed to submit PoW', err);
      setIsSubmitting(false);
    }
  };

  // Format seconds into MM:SS
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const currentTask = workspaceData?.task;
  const isAcknowledged = currentTask?.is_acknowledged === 1;
  const isCompletedOrReview = currentTask?.status === 'review' || currentTask?.status === 'verified';

  return (
    <div className="wrap workspace-container" style={{ paddingBottom: '80px' }}>
      {/* ACTION 3: LOCKOUT OVERLAY MODAL */}
      {isLockedOut && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(11, 11, 12, 0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999,
          padding: '24px'
        }}>
          <div style={{
            maxWidth: '520px',
            width: '100%',
            background: 'var(--bg)',
            border: '1px solid var(--line)',
            borderLeft: '5px solid var(--status-red)',
            borderRadius: 'var(--radius)',
            padding: '36px 32px',
            boxShadow: '0 24px 48px -12px rgba(11, 11, 12, 0.25)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <AlertOctagon size={28} style={{ color: 'var(--status-red)' }} />
              <h2 className="serif" style={{ fontSize: '26px', color: 'var(--ink)' }}>
                Sprint Lockout <span style={{ color: 'var(--status-red)', fontStyle: 'italic' }}>Engaged</span>
              </h2>
            </div>
            <p style={{ fontSize: '14px', color: 'var(--muted)', lineHeight: '1.6', marginBottom: '20px' }}>
              The 90-minute checkpoint window elapsed before a verified Proof-of-Work submission was recorded. 
              Engineering session quarantined for administrative review.
            </p>

            <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: '8px', padding: '14px 18px', fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--ink)', marginBottom: '24px' }}>
              <div>Node: {currentUser.name}</div>
              <div>MAC: {currentUser.device_mac_address}</div>
              <div>Task: {currentTask?.id || 'N/A'}</div>
            </div>

            <button 
              className="btn btn-secondary"
              onClick={() => {
                setIsLockedOut(false);
                setSecondsRemaining(5400);
              }}
            >
              Simulate Administrative Unlock
            </button>
          </div>
        </div>
      )}

      {/* Editorial Page Hero */}
      <div className="page-hero">
        <div className="section-kicker">Scoped Engineering Node</div>
        <h1 className="hero-title">
          Focused sprint, <span className="accent">uninterrupted.</span>
        </h1>
        <p className="hero-subtitle">
          Autonomous 90-minute burst sessions with verified cryptographic proof-of-work dispatch.
        </p>
      </div>

      {/* 1. CHECKPOINT TIMER WIDGET */}
      <div className="burst-timer-card">
        <div>
          <div className="specimen-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Clock size={14} style={{ color: 'var(--accent-strong)' }} />
            <span>90-Minute Checkpoint Burst</span>
          </div>
          <div className={`burst-timer-num ${secondsRemaining < 600 ? 'locked' : ''}`}>
            {formatTime(secondsRemaining)}
          </div>
          <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {!isAcknowledged ? (
              <span className="badge caution">
                <span className="badge-dot"></span>
                Timer Standby: Awaiting Acceptance
              </span>
            ) : isCompletedOrReview ? (
              <span className="badge active">
                <span className="badge-dot"></span>
                Sprint Complete • PoW Registered
              </span>
            ) : (
              <span className="badge active">
                <span className="badge-dot"></span>
                Active Sprint In Progress
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end' }}>
          <button 
            className="btn btn-secondary"
            style={{ fontSize: '12px', padding: '6px 14px' }}
            onClick={handleTriggerLockout}
            title="Fast-forward timer to 00:00 to test Action 3 Lockout"
          >
            ⚡ Test 00:00 Lockout Trigger
          </button>
          <span className="mono" style={{ fontSize: '11px', color: 'var(--muted-2)' }}>
            Autoclose at 00:00 without PoW
          </span>
        </div>
      </div>

      {currentTask ? (
        <>
          {/* 2. DIRECTIVE BRIEF CARD */}
          <div className="demo-shell" style={{ marginBottom: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div>
                <div className="section-kicker" style={{ marginBottom: '4px' }}>Task Directive</div>
                <h3 className="serif" style={{ fontSize: '26px', color: 'var(--ink)' }}>
                  {currentTask.title}
                </h3>
              </div>
              <span className={`badge ${currentTask.status === 'active' ? 'active' : 'waiting'}`}>
                <span className="badge-dot"></span>
                {currentTask.status.toUpperCase()}
              </span>
            </div>

            {/* Read-Only Context Brief */}
            <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px', padding: '18px 20px', marginBottom: '20px' }}>
              <div className="specimen-label" style={{ fontSize: '10px', marginBottom: '8px' }}>
                Requirements & Constraints Payload:
              </div>
              <p style={{ fontSize: '14px', color: 'var(--ink)', lineHeight: '1.65', whiteSpace: 'pre-wrap' }}>
                {currentTask.brief_content}
              </p>
            </div>

            {/* Acknowledgment Gate */}
            {!isAcknowledged ? (
              <div style={{ background: 'var(--bg-warm)', border: '1px solid var(--line)', borderRadius: '8px', padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <AlertTriangle size={18} style={{ color: 'var(--accent-strong)' }} />
                  <span style={{ fontSize: '13px', color: 'var(--ink)', fontWeight: '500' }}>
                    Mandatory Acknowledgment: Checkpoint timer starts upon clicking accept.
                  </span>
                </div>
                <button 
                  className="btn btn-primary"
                  onClick={handleAcknowledgeBrief}
                  id="btn-accept-brief"
                >
                  <Unlock size={14} />
                  <span>I Understand & Accept</span>
                  <span className="arr" aria-hidden="true">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 8L8 2M8 2H3.5M8 2V6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  </span>
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--status-green)', fontWeight: '500' }}>
                <CheckCircle size={16} />
                <span>Brief acknowledged. Telemetry audit and 90-minute burst active.</span>
              </div>
            )}
          </div>

          {/* 3. PROOF-OF-WORK FORM CARD */}
          <div className="demo-shell">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <div className="section-kicker" style={{ marginBottom: '4px' }}>Proof of Work</div>
                <h3 className="serif" style={{ fontSize: '26px', color: 'var(--ink)' }}>
                  Verification & Webhook Dispatch
                </h3>
              </div>
              <span className="mono" style={{ fontSize: '11px', color: 'var(--muted-2)' }}>
                Webhook: {currentTask.proof_of_work_webhook}
              </span>
            </div>

            {submissionSuccess || isCompletedOrReview ? (
              <div style={{ background: 'var(--accent-tint-2)', border: '1px solid rgba(95, 115, 72, 0.25)', borderRadius: '8px', padding: '24px', textAlign: 'center' }}>
                <CheckCircle2 size={32} style={{ color: 'var(--accent-strong)', margin: '0 auto 8px' }} />
                <h4 className="serif" style={{ fontSize: '22px', color: 'var(--ink)', marginBottom: '6px' }}>
                  Proof-of-Work Registered Successfully
                </h4>
                <p style={{ fontSize: '14px', color: 'var(--muted)' }}>
                  Payload registered with backend sentinel. Health Score calibrated to 98/100.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitProofOfWork}>
                <div style={{ marginBottom: '16px' }}>
                  <label className="specimen-label" style={{ display: 'block', marginBottom: '6px' }}>
                    Repository PR / Verification URL
                  </label>
                  <input 
                    type="url"
                    required
                    disabled={!isAcknowledged}
                    className="dispatch-textarea"
                    style={{ height: '44px', padding: '10px 14px' }}
                    value={prUrl}
                    onChange={(e) => setPrUrl(e.target.value)}
                    placeholder="https://github.com/..."
                  />
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label className="specimen-label" style={{ display: 'block', marginBottom: '6px' }}>
                    Deliverable Summary & Benchmark Metrics
                  </label>
                  <textarea 
                    rows={3}
                    disabled={!isAcknowledged}
                    className="dispatch-textarea"
                    value={payloadNotes}
                    onChange={(e) => setPayloadNotes(e.target.value)}
                    placeholder="Summarize code delivery, unit test passes, and performance telemetry..."
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                  <button 
                    type="submit"
                    className="btn btn-primary"
                    disabled={!isAcknowledged || isSubmitting}
                    id="btn-submit-pow"
                  >
                    <Send size={14} />
                    <span>{isSubmitting ? 'Dispatching Webhook...' : 'Submit Proof of Work'}</span>
                    <span className="arr" aria-hidden="true">
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 8L8 2M8 2H3.5M8 2V6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    </span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </>
      ) : (
        <div className="demo-shell" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <Activity size={32} style={{ color: 'var(--muted)', margin: '0 auto 12px' }} />
          <h3 className="serif" style={{ fontSize: '24px', color: 'var(--ink)', marginBottom: '8px' }}>
            No Active Micro-Sprint Assigned
          </h3>
          <p style={{ fontSize: '14px', color: 'var(--muted)' }}>
            This node is currently on standby. Sprints will appear here upon autonomous dispatch.
          </p>
        </div>
      )}

      {/* Local Telemetry Status Bar */}
      <div style={{
        marginTop: '24px',
        padding: '14px 20px',
        background: 'var(--card)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '14px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--status-green)', fontWeight: '500' }}>
            <ShieldCheck size={14} />
            Device Verified
          </span>
          <span className="mono" style={{ fontSize: '11px', color: 'var(--muted-2)' }}>
            MAC: {currentUser.device_mac_address}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px', color: 'var(--muted)' }}>
          <span>
            Active Window: <strong style={{ color: 'var(--ink)' }}>{activeApp}</strong>
          </span>
          <span className="mono" style={{ color: 'var(--accent-strong)' }}>
            Velocity: {localKeystrokes} kps
          </span>
        </div>
      </div>
    </div>
  );
}
