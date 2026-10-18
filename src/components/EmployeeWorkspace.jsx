import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  Lock, 
  Unlock, 
  CheckCircle, 
  GitPullRequest, 
  UploadCloud, 
  ShieldCheck, 
  AlertOctagon, 
  Terminal, 
  Send,
  Zap,
  Activity,
  CheckCircle2,
  AlertTriangle
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
      setLocalKeystrokes(prev => Math.max(12, Math.min(95, prev + (Math.random() > 0.5 ? 2 : -2))));
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
    <div className="main-content" style={{ maxWidth: '1000px', margin: '0 auto' }}>
      {/* ACTION 3: LOCKOUT OVERLAY MODAL IF CHECKPOINT REACHES 00:00 WITHOUT SUBMISSION */}
      {isLockedOut && (
        <div className="lockout-overlay">
          <div style={{ maxWidth: '580px', background: '#120508', border: '2px solid var(--accent-crimson)', borderRadius: '12px', padding: '36px', boxShadow: '0 0 50px rgba(255, 42, 85, 0.5)' }}>
            <AlertOctagon size={64} color="var(--accent-crimson)" style={{ margin: '0 auto 16px' }} />
            <h2 className="heading" style={{ fontSize: '24px', color: 'var(--accent-crimson)', fontWeight: '700', marginBottom: '8px' }}>
              SPRINT LOCKOUT // BURST EXPIRED
            </h2>
            <p className="mono" style={{ fontSize: '13px', color: '#fda4af', marginBottom: '20px', lineHeight: '1.6' }}>
              Action 3 Sentinel Triggered: The 90-minute Checkpoint Timer reached 00:00 without a verified Proof-of-Work submission. 
              Local IDE credentials quarantined. Founder notification dispatched.
            </p>
            <div style={{ background: '#240a10', padding: '12px', borderRadius: '6px', fontSize: '11px', fontFamily: 'var(--font-mono)', color: '#fca5a5', marginBottom: '24px' }}>
              <div>NODE: {currentUser.name} ({currentUser.device_mac_address})</div>
              <div>TASK ID: {currentTask?.id || 'N/A'}</div>
              <div>STATUS: HARD LOCKED - PENDING GOD-MODE REVIEW</div>
            </div>
            <button 
              className="btn btn-outline" 
              style={{ borderColor: 'var(--border-active)' }}
              onClick={() => {
                setIsLockedOut(false);
                setSecondsRemaining(5400);
              }}
            >
              Simulate Founder Override Unlock
            </button>
          </div>
        </div>
      )}

      {/* Scope Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span className="badge badge-employee">SCOPED WORKSPACE NODE</span>
            <span className="mono" style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
              NODE ID: {currentUser.id}
            </span>
          </div>
          <h1 className="heading" style={{ fontSize: '22px', fontWeight: '700' }}>
            Active Micro-Sprint Focused Terminal
          </h1>
        </div>

        {/* Psychological Accountability & Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', color: 'var(--accent-green)', fontFamily: 'var(--font-mono)' }}>
              ● DEVICE VERIFIED
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
              MAC: {currentUser.device_mac_address}
            </div>
          </div>
        </div>
      </div>

      {/* 1. THE CHECKPOINT TIMER WIDGET (Persistent 90-Minute Bursts) */}
      <div className="timer-widget">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <Clock size={16} color={secondsRemaining < 600 ? 'var(--accent-crimson)' : 'var(--accent-cyan)'} />
          <span className="mono" style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            90-Minute Checkpoint Countdown Burst
          </span>
        </div>

        <div className={`timer-digits ${secondsRemaining < 600 ? 'danger' : secondsRemaining < 1800 ? 'warning' : ''}`}>
          {formatTime(secondsRemaining)}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '12px' }}>
          {!isAcknowledged ? (
            <span className="mono" style={{ fontSize: '12px', color: 'var(--accent-amber)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Lock size={13} /> TIMER LOCKED: AWAITING BRIEF ACCEPTANCE
            </span>
          ) : isCompletedOrReview ? (
            <span className="mono" style={{ fontSize: '12px', color: 'var(--accent-green)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CheckCircle2 size={13} /> SPRINT COMPLETED // PROOF REGISTERED
            </span>
          ) : (
            <span className="mono" style={{ fontSize: '12px', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Zap size={13} /> ACTIVE PACING SPRINT IN PROGRESS
            </span>
          )}

          {/* Quick Demo button to test Action 3 Lockout without waiting 90 real minutes */}
          <button 
            className="btn btn-outline"
            style={{ fontSize: '11px', padding: '4px 10px', borderColor: 'var(--accent-crimson)', color: 'var(--accent-crimson)' }}
            onClick={handleTriggerLockout}
            title="Fast-forward timer to 00:00 to test Action 3 Lockout"
          >
            ⚡ Test 00:00 Lockout (Action 3)
          </button>
        </div>
      </div>

      {currentTask ? (
        <>
          {/* 2. CONTEXT BRIEF & ACKNOWLEDGMENT GATE */}
          <div className="card" style={{ marginBottom: '24px', background: '#090d14' }}>
            <div className="card-header">
              <div className="card-title">
                <Terminal size={16} color="var(--accent-cyan)" />
                <span>Micro-Sprint Brief: {currentTask.title}</span>
              </div>
              <span className={`badge ${currentTask.status === 'active' ? 'badge-active' : 'badge-warning'}`}>
                STATUS: {currentTask.status.toUpperCase()}
              </span>
            </div>

            {/* Read-Only Context Brief Content */}
            <div style={{ background: '#04060a', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '16px', marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginBottom: '8px' }}>
                DIRECTIVE PAYLOAD & REQUIREMENTS:
              </div>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'var(--font-mono)', fontSize: '13px', color: '#e2e8f0', lineHeight: '1.6' }}>
                {currentTask.brief_content}
              </pre>
            </div>

            {/* Acknowledgment Gate Button */}
            {!isAcknowledged ? (
              <div style={{ background: 'rgba(255, 183, 3, 0.08)', border: '1px solid var(--accent-amber)', borderRadius: '6px', padding: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <AlertTriangle size={18} color="var(--accent-amber)" />
                  <span style={{ fontSize: '12px', color: '#fed7aa', fontFamily: 'var(--font-mono)' }}>
                    Mandatory Acknowledgment: The 90-minute timer will start immediately upon acceptance.
                  </span>
                </div>
                <button 
                  className="btn btn-primary"
                  onClick={handleAcknowledgeBrief}
                  id="btn-accept-brief"
                >
                  <Unlock size={14} />
                  I Understand & Accept
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--accent-green)', fontFamily: 'var(--font-mono)' }}>
                <CheckCircle size={15} />
                Brief acknowledged. Real-time telemetry monitoring and 90-minute burst engaged.
              </div>
            )}
          </div>

          {/* 3. PROOF-OF-WORK TERMINAL */}
          <div className="card" style={{ marginBottom: '24px' }}>
            <div className="card-header">
              <div className="card-title">
                <GitPullRequest size={16} color="var(--accent-green)" />
                <span>Proof-of-Work Terminal & Webhook Dispatch</span>
              </div>
              <span className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                WEBHOOK: {currentTask.proof_of_work_webhook}
              </span>
            </div>

            {submissionSuccess || isCompletedOrReview ? (
              <div style={{ background: 'rgba(0, 255, 157, 0.08)', border: '1px solid var(--accent-green)', borderRadius: '6px', padding: '16px', textAlign: 'center' }}>
                <CheckCircle2 size={32} color="var(--accent-green)" style={{ margin: '0 auto 8px' }} />
                <h4 className="heading" style={{ fontSize: '16px', color: 'var(--accent-green)', marginBottom: '4px' }}>
                  Proof-of-Work Verified & Webhook Fired
                </h4>
                <p className="mono" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Payload registered with backend sentinel. Health Score calibrated to 98/100.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitProofOfWork}>
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: '6px' }}>
                    GITHUB PR LINK / COMMIT REPO:
                  </label>
                  <input 
                    type="url"
                    required
                    disabled={!isAcknowledged}
                    className="terminal-textarea"
                    style={{ minHeight: '40px', padding: '10px 12px' }}
                    value={prUrl}
                    onChange={(e) => setPrUrl(e.target.value)}
                    placeholder="https://github.com/..."
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: '6px' }}>
                    VERIFICATION METRICS & OUTPUT PAYLOAD:
                  </label>
                  <textarea 
                    rows={3}
                    disabled={!isAcknowledged}
                    className="terminal-textarea"
                    value={payloadNotes}
                    onChange={(e) => setPayloadNotes(e.target.value)}
                    placeholder="Enter test suite results, API payload response, or benchmarking log..."
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                  <button 
                    type="submit"
                    className="btn btn-success"
                    disabled={!isAcknowledged || isSubmitting}
                    id="btn-submit-pow"
                  >
                    <Send size={14} />
                    {isSubmitting ? 'Firing PoW Webhook...' : 'Submit Proof of Work'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </>
      ) : (
        <div className="card" style={{ padding: '36px', textAlign: 'center' }}>
          <Activity size={32} color="var(--text-dim)" style={{ margin: '0 auto 12px' }} />
          <h3 className="heading" style={{ fontSize: '16px', color: 'var(--text-muted)' }}>
            No Active Micro-Sprint Assigned
          </h3>
          <p className="mono" style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
            Standby node ready. Awaiting autonomous AI dispatch from Founder command.
          </p>
        </div>
      )}

      {/* 4. LOCAL TELEMETRY STATUS BAR (PSYCHOLOGICAL ACCOUNTABILITY) */}
      <div className="telemetry-footer" style={{ borderRadius: '8px', border: '1px solid var(--border-subtle)', marginTop: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-green)' }}>
            <ShieldCheck size={14} />
            [DEVICE VERIFIED: {currentUser.device_mac_address}]
          </span>
          <span style={{ color: 'var(--text-dim)' }}>•</span>
          <span style={{ color: 'var(--accent-cyan)' }}>
            [AES-256 TLS 1.3]
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ color: 'var(--text-muted)' }}>
            ACTIVE APP: <strong style={{ color: '#ffffff' }}>{activeApp}</strong>
          </span>
          <span style={{ color: 'var(--text-dim)' }}>•</span>
          <span style={{ color: 'var(--accent-green)' }}>
            VELOCITY: {localKeystrokes} KPS
          </span>
        </div>
      </div>
    </div>
  );
}
