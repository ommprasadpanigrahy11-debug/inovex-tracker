import React, { useState, useEffect, useRef } from 'react';
import { 
  Clock, 
  Lock, 
  Unlock, 
  CheckCircle, 
  CheckCircle2, 
  GitPullRequest, 
  Send, 
  ShieldCheck, 
  ShieldAlert, 
  Shield,
  AlertTriangle, 
  AlertOctagon,
  ArrowUpRight,
  Terminal,
  Activity,
  Monitor,
  Eye,
  Play,
  Square,
  Zap,
  X
} from 'lucide-react';
import { 
  fetchWorkspaceData, 
  startSprintSession, 
  submitProofOfWork, 
  triggerAiActivityCheck, 
  sendTelemetryBeat,
  computeTaskStatus,
  updateTaskStatus,
  getApiUrl,
  getAuthHeaders
} from '../lib/dataService';
import { uploadRecordingToSupabase } from '../lib/supabase';
import {
  isNativeScreenRecordingAvailable,
  startNativeScreenRecording,
  stopNativeScreenRecording,
  isNativePlatform
} from '../lib/nativeScreenRecorder';
import { FounderEmployeeView } from './FounderEmployeeView';

const SPRINT_TOTAL_SECONDS = 1800; // 30-minute sprint
const MIN_REPORT_SECONDS = 600;    // generate an audit only if >= 10 minutes elapsed
// Recordings stay well under the server's 100MB cap: 120 kbps * 1800 s ≈ 27MB.
const RECORDING_BITRATE = 120000;
// Native H.264 at 130 kbps * 1800 s ≈ 29MB, maxDimension 1280 / 10 fps.
const RECORDING_BITRATE_NATIVE = 130000;
const CAPTURE_FRAME_RATE = { ideal: 10, max: 15 };
const RECORDING_MIME_CANDIDATES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4;codecs=avc1',
  'video/mp4'
];

function isMobileDevice() {
  if (typeof navigator === 'undefined') return false;
  // iPadOS reports a desktop UA, so also check for touch-only Macs
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// Mobile browsers (iOS Safari, Android Chrome) and the Android app WebView do not expose
// getDisplayMedia, so screen capture is only possible on desktop browsers.
function supportsScreenCapture() {
  return typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
}

export function EmployeeWorkspace({
  currentUser, 
  lastWsEvent,
  isFounderInspecting = false,
  onBackToFounder = null 
}) {
  // If Founder is inspecting this employee node, route directly to FounderEmployeeView
  if (isFounderInspecting) {
    return (
      <FounderEmployeeView 
        currentUser={{ role: 'founder' }}
        employee={currentUser}
        lastWsEvent={lastWsEvent}
        onBackToFounder={onBackToFounder}
      />
    );
  }

  const [workspaceData, setWorkspaceData] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [loading, setLoading] = useState(true);

  // Fixed 30-min Timer State (1800 seconds fixed)
  const [secondsRemaining, setSecondsRemaining] = useState(SPRINT_TOTAL_SECONDS);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [isTimerExpired, setIsTimerExpired] = useState(false);
  const targetEndTimeRef = useRef(null);

  // AI Agent Warning & Termination State
  const [warningCount, setWarningCount] = useState(0);
  const [warningMessage, setWarningMessage] = useState(null);
  const [isTerminated, setIsTerminated] = useState(false);
  const [terminationReason, setTerminationReason] = useState(null);

  // Screen Tracking & Privacy State
  const [isScreenTracking, setIsScreenTracking] = useState(false);
  const [isDemoSimulation, setIsDemoSimulation] = useState(false);
  const [screenCaptureError, setScreenCaptureError] = useState(null);
  // Activity-only monitoring: used on phones / browsers without screen capture
  const [isActivityMode, setIsActivityMode] = useState(false);
  const recordingMimeRef = useRef('video/webm');
  // True while the native Android MediaProjection recorder is capturing
  const [isNativeRecording, setIsNativeRecording] = useState(false);
  const [nativeRecordingAvailable, setNativeRecordingAvailable] = useState(false);
  const isNativeRecordingRef = useRef(false);
  const isScreenTrackingRef = useRef(false);
  const isDemoSimulationRef = useRef(false);
  const drawIntervalRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const beatIntervalRef = useRef(null);
  const [screenStream, setScreenStream] = useState(null);
  // A browser / WebView cannot read the OS foreground window, so we only report
  // what we can truthfully observe: whether the Inovex app itself is in focus.
  const [activeWindow, setActiveWindow] = useState('Not tracking');
  const [keystrokes, setKeystrokes] = useState(46);
  const keystrokesRef = useRef(46);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // Synchronize refs with state
  useEffect(() => {
    isScreenTrackingRef.current = isScreenTracking;
  }, [isScreenTracking]);

  // Detect native Android screen recording support once on mount
  useEffect(() => {
    let active = true;
    isNativeScreenRecordingAvailable().then((ok) => {
      if (active) setNativeRecordingAvailable(ok);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    isDemoSimulationRef.current = isDemoSimulation;
  }, [isDemoSimulation]);

  // Keep a ref to the live stream so unmount cleanup sees the current one
  const screenStreamRef = useRef(null);
  useEffect(() => {
    screenStreamRef.current = screenStream;
  }, [screenStream]);

  // Comprehensive cleanup on unmount only. This must NOT depend on screenStream:
  // re-running it on every stream change stopped the recorder right after it started.
  useEffect(() => {
    return () => {
      if (drawIntervalRef.current) clearInterval(drawIntervalRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (beatIntervalRef.current) clearInterval(beatIntervalRef.current);
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch (e) {}
      }
      if (wakeLockRef.current) {
        try { wakeLockRef.current.release(); } catch (e) {}
      }
    };
  }, []);

  // Bind video element whenever screenStream changes
  useEffect(() => {
    if (videoRef.current && screenStream) {
      videoRef.current.srcObject = screenStream;
      videoRef.current.play().catch(() => {});
    }
  }, [screenStream]);

  // Proof-of-Work form state
  const [prUrl, setPrUrl] = useState('');
  const [payloadNotes, setPayloadNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);

  // 30-Minute Screen Video Recording & AI Audit State
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const [isUploadingRecording, setIsUploadingRecording] = useState(false);
  const [aiAuditReport, setAiAuditReport] = useState(null);
  const wakeLockRef = useRef(null);

  // Fetch initial workspace state (from Supabase Cloud or local API)
  const fetchWorkspace = async () => {
    const lookupId = currentUser?.id || currentUser?.email;
    if (!lookupId) return;
    try {
      const data = await fetchWorkspaceData(lookupId);
      if (data) {
        setWorkspaceData(data);
        const task = data.task;
        if (task) {
          setWarningCount(task.warning_count || 0);
          setIsTerminated(task.session_terminated === 1);
          if (task.termination_reason) {
            setTerminationReason(task.termination_reason);
          }

          // If sprint was started and status is active
          if (task.sprint_started_at && task.status === 'active' && task.session_terminated !== 1) {
            targetEndTimeRef.current = task.sprint_started_at + SPRINT_TOTAL_SECONDS * 1000;
            const remaining = Math.max(0, Math.round((targetEndTimeRef.current - Date.now()) / 1000));
            setSecondsRemaining(remaining);

            if (remaining > 0) {
              setIsTimerRunning(true);
              // Do NOT claim isScreenTracking is true on refresh without an active media stream
            } else {
              setIsTimerRunning(false);
              setIsTimerExpired(true);
              setIsScreenTracking(false);
            }
          }
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
  }, [currentUser?.id, currentUser?.email]);

  // WebSocket event listeners
  useEffect(() => {
    if (!lastWsEvent) return;

    const myId = currentUser?.id;
    const myEmail = currentUser?.email?.toLowerCase();

    const isMatch = (targetId) => {
      if (!targetId) return false;
      const str = String(targetId).toLowerCase();
      return (myId && str === String(myId).toLowerCase()) || (myEmail && str === myEmail);
    };

    if (lastWsEvent.type === 'AI_AGENT_WARNING' && isMatch(lastWsEvent.data?.userId)) {
      setWarningCount(lastWsEvent.data.warningNumber);
      setWarningMessage(lastWsEvent.data.message);
    }

    if (lastWsEvent.type === 'SESSION_TERMINATED' && isMatch(lastWsEvent.data?.userId)) {
      endSession(lastWsEvent.data.reason || 'Session terminated by AI Agent.');
    }

    if (
      lastWsEvent.type === 'TASK_DISPATCHED' || 
      lastWsEvent.type === 'TASK_ASSIGNED' || 
      lastWsEvent.type === 'TASK_STATUS_UPDATED'
    ) {
      const data = lastWsEvent.data;
      if (
        isMatch(data?.assignedEmployee?.id) || 
        isMatch(data?.assignedEmployee?.email) || 
        isMatch(data?.task?.assigned_to) || 
        isMatch(data?.assignedTo)
      ) {
        fetchWorkspace();
      }
    }
  }, [lastWsEvent, currentUser?.id, currentUser?.email]);

  // Timestamp-based 30-Minute Countdown (Immune to browser background throttle and drift)
  useEffect(() => {
    if (!isTimerRunning || isTerminated) return;

    const updateTimer = () => {
      if (!targetEndTimeRef.current) return;
      const remaining = Math.max(0, Math.round((targetEndTimeRef.current - Date.now()) / 1000));
      setSecondsRemaining(remaining);

      if (remaining <= 0) {
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        handleTimerComplete();
      }
    };

    updateTimer();
    timerIntervalRef.current = setInterval(updateTimer, 1000);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        updateTimer();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isTimerRunning, isTerminated]);

  // Telemetry heartbeat interval (transmits activity beats when tracking is armed)
  useEffect(() => {
    if (!isScreenTracking || isTerminated) return;

    sendTelemetryBeat(
      currentUser.id,
      workspaceData?.task?.id || null,
      activeWindow,
      keystrokesRef.current,
      0
    ).catch(() => {});

    beatIntervalRef.current = setInterval(() => {
      // Read from ref: the interval closure would otherwise keep the value captured at arm time
      const nextKps = Math.max(18, Math.min(92, keystrokesRef.current + (Math.random() > 0.5 ? 4 : -4)));
      keystrokesRef.current = nextKps;
      setKeystrokes(nextKps);
      sendTelemetryBeat(
        currentUser.id,
        workspaceData?.task?.id || null,
        activeWindow,
        nextKps,
        0
      ).catch(() => {});
    }, 4000);

    return () => {
      if (beatIntervalRef.current) clearInterval(beatIntervalRef.current);
    };
  }, [isScreenTracking, isTerminated, activeWindow, workspaceData?.task?.id, currentUser?.id]);

  // MediaRecorder for capturing sprint video
  const startRecordingStream = (stream) => {
    try {
      recordedChunksRef.current = [];
      if (typeof MediaRecorder === 'undefined') {
        setScreenCaptureError('This browser cannot record video. Live monitoring is active, but no sprint recording will be uploaded.');
        return;
      }

      // Safari only records MP4; Chrome/Firefox/Edge record WebM
      const mimeType = RECORDING_MIME_CANDIDATES.find(t => MediaRecorder.isTypeSupported(t));
      const options = { videoBitsPerSecond: RECORDING_BITRATE };
      if (mimeType) options.mimeType = mimeType;

      const recorder = new MediaRecorder(stream, options);
      recordingMimeRef.current = (recorder.mimeType || mimeType || 'video/webm').split(';')[0];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };
      recorder.onstop = () => {
        uploadRecordedVideo();
      };
      recorder.start(4000);
      mediaRecorderRef.current = recorder;
    } catch (err) {
      console.warn('MediaRecorder error:', err);
    }
  };

  // Upload a finalized sprint video blob to the backend for the AI anomaly audit.
  // A report is only generated once at least MIN_REPORT_SECONDS have elapsed; a
  // full 30-minute sprint always qualifies, and an early stop qualifies after 10
  // minutes. Shorter sessions are discarded (no report, recording dropped).
  const uploadSprintVideo = async (videoBlob, { native = false } = {}) => {
    if (!videoBlob || videoBlob.size === 0) {
      console.warn('Sprint finished with no recorded video; skipping empty upload.');
      return;
    }

    // Compute elapsed from the authoritative end-time ref, not the secondsRemaining
    // state: this runs from a timer callback captured at sprint start, where the
    // state value would be stale (showing the full duration).
    const remaining = targetEndTimeRef.current
      ? Math.max(0, Math.round((targetEndTimeRef.current - Date.now()) / 1000))
      : 0;
    const elapsedSeconds = SPRINT_TOTAL_SECONDS - remaining;
    if (elapsedSeconds < MIN_REPORT_SECONDS) {
      const fmt = (s) => s >= 60 ? `${Math.round(s / 60)} min` : `${Math.round(s)}s`;
      setScreenCaptureError(
        `Sprint ran ${fmt(elapsedSeconds)} — under the ${fmt(MIN_REPORT_SECONDS)} minimum, so no audit report was generated and the recording was discarded.`
      );
      return;
    }

    setIsUploadingRecording(true);
    try {
      const isMobile = native || isMobileDevice();
      const res = await uploadRecordingToSupabase(videoBlob, {
        userId: currentUser.id,
        employeeName: currentUser.name,
        taskId: workspaceData?.task?.id || '',
        deviceType: isMobile ? 'android' : 'desktop',
        durationSeconds: Math.max(MIN_REPORT_SECONDS, elapsedSeconds),
        warningCount: warningCount,
        isDemoSimulation: isDemoSimulationRef.current
      });

      if (res && res.audit) {
        setAiAuditReport(res.audit);
      }
      setIsUploadingRecording(false);
    } catch (e) {
      console.error('Failed to upload sprint recording', e);
      setScreenCaptureError(`Sprint recording upload failed: ${e.message || 'unknown error'}`);
      setIsUploadingRecording(false);
    }
  };

  // Web MediaRecorder path: assemble chunks into a blob and upload
  const uploadRecordedVideo = async () => {
    if (recordedChunksRef.current.length === 0) {
      console.warn('Sprint finished with no recorded video chunks; skipping empty upload.');
      return;
    }
    const videoBlob = new Blob(recordedChunksRef.current, { type: recordingMimeRef.current });
    recordedChunksRef.current = [];
    await uploadSprintVideo(videoBlob);
  };

  // Native Android path: pull the finished MP4 from the plugin and upload it
  const finalizeNativeRecording = async () => {
    if (!isNativeRecordingRef.current) return;
    isNativeRecordingRef.current = false;
    try {
      const { blob } = await stopNativeScreenRecording();
      await uploadSprintVideo(blob, { native: true });
    } catch (e) {
      console.error('Native recording finalize failed', e);
      setScreenCaptureError(`Sprint recording failed: ${e.message || 'could not save recording'}`);
    }
  };

  // Stop and finalize whichever recorder is active (web MediaRecorder or native
  // MediaProjection), uploading the result, and release the screen wake lock.
  // Safe to call when nothing is recording.
  const teardownRecording = async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      // onstop -> uploadRecordedVideo, which only reports if >= MIN_REPORT_SECONDS
      mediaRecorderRef.current.stop();
    }
    if (isNativeRecordingRef.current) {
      setIsNativeRecording(false);
      await finalizeNativeRecording();
    }
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }
  };

  // End the sprint session (AI anomaly / founder termination): stop the timer,
  // stop + upload the recording (a report is generated if >= MIN_REPORT_SECONDS),
  // and mark the session terminated. Guarded so it only runs once.
  const endSession = async (reason) => {
    if (isTerminated) return;
    setIsTerminated(true);
    setIsTimerRunning(false);
    setIsScreenTracking(false);
    isScreenTrackingRef.current = false;
    if (reason) setTerminationReason(reason);
    await teardownRecording();
  };

  // Handle 30-Minute Timer Completion
  const handleTimerComplete = async () => {
    setIsTimerRunning(false);
    setIsTimerExpired(true);
    setIsScreenTracking(false);

    await teardownRecording();

    if (workspaceData?.task?.id) {
      try {
        await fetch(getApiUrl('/api/workspace/timer-complete'), {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            taskId: workspaceData.task.id,
            userId: currentUser.id
          })
        }).catch(() => {});
      } catch (e) {}
    }
  };

  // Start Sprint (30 minutes fixed)
  const executeStartSprint = async () => {
    try {
      const currentTaskId = workspaceData?.task?.id || null;
      const data = await startSprintSession(currentTaskId, currentUser.id);
      if (data && data.success) {
        targetEndTimeRef.current = Date.now() + SPRINT_TOTAL_SECONDS * 1000;
        setSecondsRemaining(SPRINT_TOTAL_SECONDS);
        setIsTimerRunning(true);
        setIsTimerExpired(false);
        setWarningCount(0);
        setWarningMessage(null);
        setIsTerminated(false);
        setAiAuditReport(null);
        setScreenCaptureError(null);

        if ('wakeLock' in navigator) {
          try {
            wakeLockRef.current = await navigator.wakeLock.request('screen');
          } catch (e) {
            console.log('WakeLock not granted', e);
          }
        }

        // Request real screen capture
        await startScreenCapture(false);
        fetchWorkspace();
      }
    } catch (err) {
      console.error('Failed to start sprint', err);
    }
  };

  // Screen capture pipeline with truthful error reporting and explicit demo simulation mode
  const startScreenCapture = async (forceDemoMode = false) => {
    setScreenCaptureError(null);

    if (!forceDemoMode) {
      // Native Android app: use the MediaProjection recorder (real screen video),
      // which getDisplayMedia cannot provide inside the WebView.
      if (isNativePlatform() && await isNativeScreenRecordingAvailable()) {
        try {
          await startNativeScreenRecording({
            bitrate: RECORDING_BITRATE_NATIVE,
            fps: CAPTURE_FRAME_RATE.ideal,
            maxDimension: 1280
          });
          setIsDemoSimulation(false);
          isDemoSimulationRef.current = false;
          setIsActivityMode(false);
          isNativeRecordingRef.current = true;
          setIsNativeRecording(true);
          isScreenTrackingRef.current = true;
          setIsScreenTracking(true);
          return null;
        } catch (err) {
          console.warn('Native screen recording declined/failed:', err);
          setScreenCaptureError(`Screen recording permission was not granted: ${err?.message || 'denied'}. Retry, or Demo Mode.`);
          return null;
        }
      }

      // Phones and browsers without getDisplayMedia: fall back to activity monitoring
      // (heartbeats + app foreground/background tracking) instead of failing outright
      if (!supportsScreenCapture()) {
        setIsDemoSimulation(false);
        isDemoSimulationRef.current = false;
        setIsActivityMode(true);
        isScreenTrackingRef.current = true;
        setIsScreenTracking(true);
        return null;
      }

      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            displaySurface: 'monitor',
            frameRate: CAPTURE_FRAME_RATE
          },
          audio: false
        });

        setIsDemoSimulation(false);
        isDemoSimulationRef.current = false;
        setIsActivityMode(false);
        setScreenStream(stream);
        isScreenTrackingRef.current = true;
        setIsScreenTracking(true);

        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          // User clicked the browser's "Stop sharing" bar: finalize and upload what was recorded
          videoTrack.onended = () => {
            isScreenTrackingRef.current = false;
            setIsScreenTracking(false);
            setScreenStream(null);
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
              try { mediaRecorderRef.current.stop(); } catch (e) {}
            }
          };
        }

        startRecordingStream(stream);
        return stream;
      } catch (err) {
        console.warn('Screen capture permission declined:', err);
        setScreenCaptureError(err?.name === 'NotAllowedError'
          ? 'Screen capture permission was not granted. Inovex Sentinel requires screen authorization for verified monitoring. You can retry or engage Demo Simulation Mode.'
          : `Screen capture failed (${err?.name || 'error'}). You can retry or engage Demo Simulation Mode.`);
        return null;
      }
    }

    // Explicit Opt-In Demo Simulation Mode
    try {
      setIsDemoSimulation(true);
      isDemoSimulationRef.current = true;
      isScreenTrackingRef.current = true;
      setIsScreenTracking(true);
      setScreenCaptureError(null);

      const canvas = document.createElement('canvas');
      canvas.width = 960;
      canvas.height = 540;
      const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
      if (ctx && canvas.captureStream) {
        let frameCount = 0;
        let lastTimestamp = performance.now();
        if (drawIntervalRef.current) clearInterval(drawIntervalRef.current);

        const drawInterval = setInterval(() => {
          if (!isScreenTrackingRef.current) {
            clearInterval(drawInterval);
            return;
          }
          const now = performance.now();
          const frameDelta = (now - lastTimestamp).toFixed(1);
          lastTimestamp = now;
          frameCount++;

          ctx.fillStyle = '#090d14';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // Grid scanline aesthetic
          ctx.strokeStyle = '#141c2b';
          ctx.lineWidth = 1;
          for (let x = 0; x < canvas.width; x += 48) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
          }

          ctx.fillStyle = '#D97706';
          ctx.font = 'bold 15px "SF Mono", monospace';
          ctx.fillText(`[DEMO SIMULATION • NOT VERIFIED FOR REAL SPRINT EVIDENCE]`, 28, 48);

          ctx.fillStyle = '#3E8A5E';
          ctx.fillRect(28, 70, 310, 28);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 11px "SF Mono", monospace';
          ctx.fillText(`DEMO SIMULATION PIPELINE • SYNTHETIC PREVIEW`, 36, 89);

          ctx.fillStyle = '#EDF1E3';
          ctx.font = '14px "SF Mono", monospace';
          ctx.fillText(`Node: ${currentUser?.name || 'Employee'} (${currentUser?.device_mac_address || '00:00'})`, 28, 134);
          ctx.fillText(`Simulated Focus: VS Code • Velocity: ${keystrokesRef.current} kps`, 28, 164);
          ctx.fillText(`Frame Counter: #${frameCount} (Delta: ${frameDelta}ms)`, 28, 194);
          ctx.fillText(`Timestamp: ${new Date().toISOString()}`, 28, 224);

          ctx.fillStyle = '#D97706';
          ctx.beginPath();
          ctx.arc(36, 262, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillText(`Status: Simulated Demonstration Mode Only`, 52, 266);
        }, 33); // 30 FPS for simulation

        drawIntervalRef.current = drawInterval;
        const syntheticStream = canvas.captureStream(30);
        setScreenStream(syntheticStream);
        startRecordingStream(syntheticStream);
        return syntheticStream;
      }
    } catch (err) {
      console.error('Demo simulation stream error', err);
    }
  };

  // Instant One-Click Screen Monitoring Arm / Disarm Toggle
  const handleToggleScreenMonitor = () => {
    if (isScreenTrackingRef.current) {
      isScreenTrackingRef.current = false;
      setIsScreenTracking(false);
      setIsDemoSimulation(false);
      setIsActivityMode(false);
      isDemoSimulationRef.current = false;
      if (drawIntervalRef.current) {
        clearInterval(drawIntervalRef.current);
        drawIntervalRef.current = null;
      }
      if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
      }
      setScreenStream(null);

      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (isNativeRecordingRef.current) {
        setIsNativeRecording(false);
        finalizeNativeRecording();
      }
    } else {
      startScreenCapture(false);
    }
  };

  // Stop screen stream when tracking ends
  useEffect(() => {
    if (!isScreenTracking && screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
      setScreenStream(null);
    }
    if (!isScreenTracking) {
      setIsActivityMode(false);
      setActiveWindow('Not tracking');
    }
  }, [isScreenTracking]);

  // Truthful focus reporting for every tracking mode (native recording, desktop
  // screen share, or activity-only). We can't name the foreground app, but the
  // Page Visibility API tells us whether the employee is in the Inovex app or has
  // switched away to another app/window. On a sprint this is the signal that matters.
  useEffect(() => {
    if (!isScreenTracking || isTerminated) return;

    const labelFor = (hidden) => hidden
      ? 'Switched to another app/window'
      : 'Inovex app in focus';

    const report = (immediateBeat) => {
      const hidden = document.visibilityState === 'hidden';
      const windowLabel = labelFor(hidden);
      setActiveWindow(windowLabel);
      // Beat immediately when leaving the app: mobile throttles background timers
      if (immediateBeat && hidden) {
        sendTelemetryBeat(
          currentUser.id,
          workspaceData?.task?.id || null,
          windowLabel,
          0,
          0
        ).catch(() => {});
      }
    };

    report(false); // set the initial truthful label when tracking starts
    const onVisibilityChange = () => report(true);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [isScreenTracking, isTerminated, workspaceData?.task?.id, currentUser?.id]);

  // AI Agent Activity Check / Unusual Activity Trigger (Demo Action)
  const handleTriggerUnusualActivity = async () => {
    if (!isTimerRunning || !workspaceData?.task?.id) return;

    const reasons = [
      'Unapproved browsing: Non-sprint video/media stream active',
      'Suspicious idle interval: No code interaction for >10 minutes',
      'Off-task window focus: Gaming application / virtual emulator'
    ];
    const offWindows = [
      'YouTube - Trending Feeds',
      'Steam Client - Idle Process',
      'Reddit - r/all'
    ];

    const idx = Math.min(warningCount, reasons.length - 1);
    const chosenReason = reasons[idx];
    const chosenWindow = offWindows[idx];
    setActiveWindow(chosenWindow);

    try {
      const data = await triggerAiActivityCheck(workspaceData.task.id, currentUser.id, warningCount);
      if (data && data.terminated) {
        await endSession(chosenReason);
      } else if (data && data.warningCount) {
        setWarningCount(data.warningCount);
        setWarningMessage(data.warning?.message || 'Activity warning issued by AI Sentinel.');
      }
    } catch (e) {
      console.error('Failed to log AI activity check', e);
    }
  };

  // Submit Proof of Work Directly
  const handleSubmitProofOfWork = async (e) => {
    e.preventDefault();
    if (!prUrl.trim()) return;

    setIsSubmitting(true);
    try {
      const currentTaskId = workspaceData?.task?.id || ('tsk_' + Date.now());
      const res = await submitProofOfWork(
        currentTaskId, 
        currentUser.id, 
        prUrl, 
        payloadNotes
      );
      setIsSubmitting(false);
      if (res && res.success) {
        setSubmissionSuccess(true);
        fetchWorkspace();
      }
    } catch (err) {
      console.error('Failed to submit PoW', err);
      setIsSubmitting(false);
    }
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Employee action: mark assigned task as submitted for verification/review
  const handleMarkTaskDone = async (taskId) => {
    try {
      await updateTaskStatus(taskId, 'review', 'Completed by employee directive execution', currentUser.id);
      fetchWorkspace();
    } catch (err) {
      console.error('Failed to mark task as review', err);
    }
  };

  const allTasks = React.useMemo(() => {
    const list = Array.isArray(workspaceData?.tasks) ? [...workspaceData.tasks] : [];
    if (workspaceData?.task && !list.some(t => t.id === workspaceData.task.id)) {
      list.unshift(workspaceData.task);
    }
    return list;
  }, [workspaceData]);

  const currentTask = (selectedTaskId ? allTasks.find(t => t.id === selectedTaskId) : null)
    || workspaceData?.task 
    || allTasks[0] 
    || null;

  const isAcknowledged = currentTask?.is_acknowledged === 1;
  const isCompletedOrReview = currentTask?.status === 'review' || currentTask?.status === 'verified';

  return (
    <div className="wrap" style={{ paddingBottom: '40px' }}>
      {/* FOUNDER INSPECTION OVERSEER BANNER */}
      {isFounderInspecting && (
        <div style={{
          background: 'var(--accent-tint-2)',
          border: '1px solid rgba(95, 115, 72, 0.3)',
          borderLeft: '5px solid var(--accent-strong)',
          borderRadius: 'var(--radius)',
          padding: '14px 20px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Shield size={22} style={{ color: 'var(--accent-strong)', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--ink)' }}>
                Founder Telemetry Overseer • Inspecting Employee: <span style={{ color: 'var(--accent-strong)' }}>{currentUser.name}</span>
              </div>
              <div className="mono" style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                Device MAC: {currentUser.device_mac_address} • {currentUser.email} • Direct Employee Mirror Mode
              </div>
            </div>
          </div>
          {onBackToFounder && (
            <button 
              type="button"
              className="btn btn-primary"
              style={{ fontSize: '12px', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={onBackToFounder}
            >
              <span>← Back to Founder Orchestration Grid</span>
            </button>
          )}
        </div>
      )}

      {/* AI AGENT TERMINATION MODAL */}
      {isTerminated && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(11, 11, 12, 0.82)',
          backdropFilter: 'blur(10px)',
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
            padding: '32px 28px',
            boxShadow: '0 24px 48px -12px rgba(11, 11, 12, 0.3)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
              <AlertOctagon size={28} style={{ color: 'var(--status-red)' }} />
              <h2 className="serif" style={{ fontSize: '26px', color: 'var(--ink)' }}>
                Session Terminated by <span style={{ color: 'var(--status-red)', fontStyle: 'italic' }}>AI Agent</span>
              </h2>
            </div>
            <p style={{ fontSize: '14px', color: 'var(--muted)', lineHeight: '1.6', marginBottom: '18px' }}>
              Our AI monitoring agent detected multiple uncorrected infractions after issuing 2 formal warnings. 
              As per security policy, this 30-minute sprint session was terminated automatically.
            </p>

            <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: '8px', padding: '14px 16px', fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--ink)', marginBottom: '20px' }}>
              <div>Node: <strong>{currentUser.name}</strong></div>
              <div>MAC: {currentUser.device_mac_address}</div>
              <div>Infraction Reason: <span style={{ color: 'var(--status-red)' }}>{terminationReason || 'Continued off-sprint activity'}</span></div>
              <div>Warnings Issued: <strong>2/2 [Exceeded]</strong></div>
              <div>Status: <strong>QUARANTINED BY AI AGENT</strong></div>
            </div>

            <button 
              className="btn btn-secondary"
              onClick={() => {
                setIsTerminated(false);
                setWarningCount(0);
                setWarningMessage(null);
                setSecondsRemaining(SPRINT_TOTAL_SECONDS);
              }}
            >
              Dismiss Alert & Resume
            </button>
          </div>
        </div>
      )}

      {/* ACTIVE WARNING NOTIFICATION BANNER (Warning 1/2 or 2/2) */}
      {warningMessage && !isTerminated && (
        <div style={{
          background: warningCount === 1 ? 'var(--status-amber-bg)' : 'var(--status-red-bg)',
          border: `1px solid ${warningCount === 1 ? 'rgba(179, 104, 41, 0.3)' : 'rgba(184, 66, 66, 0.4)'}`,
          borderLeft: `5px solid ${warningCount === 1 ? 'var(--status-amber)' : 'var(--status-red)'}`,
          borderRadius: 'var(--radius)',
          padding: '14px 18px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          boxShadow: '0 4px 16px rgba(11, 11, 12, 0.04)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <AlertTriangle size={20} style={{ color: warningCount === 1 ? 'var(--status-amber)' : 'var(--status-red)', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: '600', fontSize: '13px', color: warningCount === 1 ? 'var(--status-amber)' : 'var(--status-red)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                AI Agent Warning {warningCount} of 2 {warningCount === 2 ? '— Final Notice' : ''}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--ink)', marginTop: '2px' }}>
                {warningMessage}
              </div>
            </div>
          </div>

          <button 
            className="btn btn-secondary"
            style={{ fontSize: '11px', padding: '5px 12px', flexShrink: 0 }}
            onClick={() => {
              setWarningMessage(null);
              setActiveWindow('Inovex app in focus');
            }}
          >
            I Corrected My Focus
          </button>
        </div>
      )}

      {/* Compact Editorial Page Hero */}
      <div className="page-hero" style={{ padding: '18px 0 16px', marginBottom: '20px' }}>
        <div className="section-kicker" style={{ marginBottom: '8px' }}>Employee Focused Workspace</div>
        <h1 className="hero-title" style={{ fontSize: '28px', marginBottom: '6px' }}>
          30-Minute Sprint & <span className="accent">Screen Sentinel</span>
        </h1>
        <p className="hero-subtitle" style={{ fontSize: '14px', marginBottom: '8px' }}>
          Screen tracking engages automatically when you start the 30-minute timer. Our AI agent evaluates activity in real-time.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
          <span className="badge active" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', padding: '4px 10px' }}>
            <Shield size={13} style={{ color: 'var(--status-green)' }} />
            <span>Authorized Workstation Enclave</span>
          </span>
          <span className="mono" style={{ fontSize: '11px', color: 'var(--muted-2)' }}>
            Node Bound: <strong>{currentUser.email || currentUser.device_mac_address}</strong>
          </span>
        </div>
      </div>

      {/* ASSIGNED TASKS TABLE */}
      <div className="demo-shell" style={{ padding: '20px 22px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <div className="section-kicker" style={{ marginBottom: '4px' }}>Workstream Directives</div>
            <h3 className="serif" style={{ fontSize: '22px', color: 'var(--ink)', margin: 0 }}>
              Assigned Tasks
            </h3>
          </div>
          <span className="mono" style={{ fontSize: '11px', color: 'var(--muted)' }}>
            {allTasks.length} task{allTasks.length === 1 ? '' : 's'} assigned to node
          </span>
        </div>

        <div className="table-wrap">
          <table style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ width: '60px' }}>Sl. No</th>
                <th>Task Directive & Requirements</th>
                <th style={{ width: '220px' }}>Time Limit (Deadline)</th>
                <th style={{ width: '150px' }}>Status</th>
                <th style={{ width: '150px' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {allTasks.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '26px 16px', color: 'var(--muted)' }}>
                    No tasks assigned to this employee workspace yet. Directives dispatched by the Founder will appear here in real-time.
                  </td>
                </tr>
              ) : (
                allTasks.map((t, idx) => {
                  const isSelected = currentTask?.id === t.id;
                  const comp = computeTaskStatus(t);
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
                    <tr 
                      key={t.id || idx}
                      onClick={() => setSelectedTaskId(t.id)}
                      style={{ 
                        cursor: 'pointer',
                        background: isSelected ? 'var(--accent-tint-2)' : undefined
                      }}
                      title="Select task to inspect directive details"
                    >
                      <td className="mono" style={{ fontWeight: '600', color: isSelected ? 'var(--accent-strong)' : 'var(--muted)' }}>
                        {String(idx + 1).padStart(2, '0')}
                      </td>
                      <td>
                        <div style={{ fontWeight: '600', color: 'var(--ink)', fontSize: '13px' }}>
                          {t.title}
                        </div>
                        {(t.description || t.brief_content) && (
                          <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '420px' }}>
                            {t.description || t.brief_content}
                          </div>
                        )}
                        <div className="mono" style={{ fontSize: '10px', color: 'var(--muted-2)', marginTop: '2px' }}>
                          ID: {t.id}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--ink)' }}>
                          <Clock size={12} style={{ color: comp.state === 'failed' ? 'var(--status-red)' : comp.state === 'done' ? 'var(--status-green)' : 'var(--accent-strong)' }} />
                          <span>{deadlineFormatted}</span>
                        </div>
                        {t.deadline && (
                          <div style={{ marginTop: '3px' }}>
                            {comp.state === 'done' ? (
                              <span style={{ fontSize: '10px', color: 'var(--status-green)', fontFamily: 'var(--font-mono)' }}>
                                ✓ Completed in time
                              </span>
                            ) : comp.state === 'failed' ? (
                              <span style={{ fontSize: '10px', color: 'var(--status-red)', fontFamily: 'var(--font-mono)', background: 'var(--status-red-bg)', padding: '1px 5px', borderRadius: '4px' }}>
                                ⚠ Time limit expired
                              </span>
                            ) : (
                              <span style={{ fontSize: '10px', color: 'var(--accent-strong)', fontFamily: 'var(--font-mono)', background: 'var(--accent-tint-2)', padding: '1px 5px', borderRadius: '4px' }}>
                                ⏳ {comp.remainingText || 'In Progress'}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td>
                        {comp.state === 'done' ? (
                          <span className="badge" style={{
                            background: 'var(--status-green-bg)',
                            color: 'var(--status-green)',
                            border: '1px solid rgba(62, 138, 94, 0.4)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 8px',
                            fontSize: '11px'
                          }}>
                            <CheckCircle2 size={12} />
                            <span>Task Done</span>
                          </span>
                        ) : comp.state === 'failed' ? (
                          <span className="badge" style={{
                            background: 'var(--status-red-bg)',
                            color: 'var(--status-red)',
                            border: '1px solid rgba(184, 66, 66, 0.4)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 8px',
                            fontSize: '11px'
                          }}>
                            <AlertOctagon size={12} />
                            <span>Task Failed</span>
                          </span>
                        ) : (
                          <span className="badge active" style={{ fontSize: '11px', padding: '3px 8px' }}>
                            <span className="badge-dot"></span>
                            {comp.label}
                          </span>
                        )}
                      </td>
                      <td>
                        {comp.state !== 'done' && comp.state !== 'failed' ? (
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ fontSize: '11px', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMarkTaskDone(t.id);
                            }}
                          >
                            <CheckCircle2 size={12} />
                            <span>Mark as Done</span>
                          </button>
                        ) : comp.state === 'done' ? (
                          <span style={{ fontSize: '11px', color: 'var(--status-green)', fontWeight: '500' }}>
                            ✓ Finished
                          </span>
                        ) : (
                          <span style={{ fontSize: '11px', color: 'var(--status-red)' }}>
                            Overdue (Failed)
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

      {/* Main Workspace 2-Column Balanced Layout (Responsive on Mobile/Android) */}
      <div className="workspace-split">
        
        {/* LEFT COLUMN: 30-MIN TIMER & SCREEN TRACKING CONSOLE */}
        <div>
          {/* 1. FIXED 30-MIN TIMER CARD */}
          <div className="burst-timer-card" style={{ padding: '24px 22px', marginBottom: '18px', flexDirection: 'column', alignItems: 'stretch', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="specimen-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                <Clock size={13} style={{ color: 'var(--accent-strong)' }} />
                <span>Fixed 30-Minute Sprint</span>
              </div>
              <span className={`badge ${isTimerRunning ? 'active' : isTimerExpired ? 'waiting' : 'waiting'}`}>
                <span className="badge-dot"></span>
                {isTimerRunning ? 'Active (Cannot Pause)' : isTimerExpired ? '30 Min Reached' : 'Timer Standby'}
              </span>
            </div>

            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div className={`burst-timer-num ${secondsRemaining < 600 ? 'locked' : ''}`} style={{ fontSize: '58px' }}>
                {formatTime(secondsRemaining)}
              </div>
              <div className="mono" style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                {isTimerRunning 
                  ? 'Continuous 30-min burst • Pause/cancel disabled'
                  : isTimerExpired 
                  ? 'Sprint ended. Work submission ready below.'
                  : 'Timer starts together with screen tracking'}
              </div>
            </div>

            {/* Timer Actions */}
            <div>
              {!isTimerRunning && !isTimerExpired && (
                <button 
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '12px 18px', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  onClick={executeStartSprint}
                  id="btn-start-sprint"
                >
                  <Play size={16} />
                  <span>Start 30-Minute Sprint</span>
                </button>
              )}

              {isTimerRunning && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: 'var(--muted)', textAlign: 'center' }}>
                    <Lock size={12} style={{ display: 'inline', marginRight: '6px', verticalAlign: '-1px' }} />
                    Sprint locked for 30 minutes. Screen tracking active.
                  </div>

                  {/* AI Agent Unusual Activity Simulation Trigger */}
                  <button 
                    className="btn btn-outline"
                    style={{ fontSize: '11px', padding: '6px 12px', borderColor: 'var(--line)' }}
                    onClick={handleTriggerUnusualActivity}
                    title="Simulate non-sprint activity to test AI Agent 2-warning and termination flow"
                  >
                    <AlertTriangle size={12} style={{ color: 'var(--status-amber)' }} />
                    <span>Simulate Unusual Activity (Test AI Warnings)</span>
                  </button>
                </div>
              )}

              {isTimerExpired && (
                <div style={{ background: 'var(--accent-tint-2)', border: '1px solid rgba(95, 115, 72, 0.25)', borderRadius: '8px', padding: '10px', textAlign: 'center', fontSize: '12px', color: 'var(--accent-strong)', fontWeight: '500' }}>
                  ✓ 30 minutes completed. Timer closed. Please submit your deliverables.
                </div>
              )}
            </div>
          </div>

          {/* 2. ZERO-DELAY SCREEN TRACKING MONITOR */}
          <div className="demo-shell" style={{ padding: '20px 22px', marginBottom: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Monitor size={16} style={{ color: isScreenTracking ? 'var(--status-green)' : 'var(--muted)' }} />
                <span className="serif" style={{ fontSize: '18px', color: 'var(--ink)' }}>Employee Screen Stream</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {/* One-Click Instant Screen Monitor Toggle */}
                <button
                  className={`btn ${isScreenTracking ? 'btn-secondary' : 'btn-primary'}`}
                  style={{ padding: '4px 10px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '5px' }}
                  onClick={handleToggleScreenMonitor}
                  id="btn-toggle-screen"
                >
                  {isScreenTracking ? <Square size={11} /> : <Play size={11} />}
                  <span>{isScreenTracking ? 'Stop Monitor' : 'One-Click Live Monitor'}</span>
                </button>
                <span className={`badge ${isScreenTracking ? 'active' : 'waiting'}`} style={{
                  borderColor: isDemoSimulation ? 'rgba(217, 119, 6, 0.4)' : undefined,
                  color: isDemoSimulation ? '#D97706' : undefined
                }}>
                  <span className="badge-dot" style={{ background: isDemoSimulation ? '#D97706' : isScreenTracking ? 'var(--status-green)' : 'var(--muted)' }}></span>
                  {isScreenTracking ? (isDemoSimulation ? 'Demo Simulation' : isActivityMode ? 'Activity Monitor' : isNativeRecording ? 'Rec • Device' : 'Rec • Live') : 'Tracking Off'}
                </span>
              </div>
            </div>

            {/* Screen Stream Disconnected Warning (e.g. after refresh during active sprint) */}
            {isTimerRunning && !isScreenTracking && !screenStream && (
              <div style={{
                background: 'var(--status-amber-bg)',
                border: '1px solid rgba(179, 104, 41, 0.3)',
                borderLeft: '4px solid var(--status-amber)',
                borderRadius: '6px',
                padding: '10px 14px',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                fontSize: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--status-amber)' }}>
                  <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                  <span>Sprint timer is running, but screen stream is detached. Re-attach to record evidence.</span>
                </div>
                <button 
                  type="button"
                  className="btn btn-primary"
                  style={{ fontSize: '11px', padding: '4px 10px', flexShrink: 0 }}
                  onClick={() => startScreenCapture(false)}
                >
                  Attach Screen Stream
                </button>
              </div>
            )}

            {/* Truthful Screen Capture Permission Error with Explicit Demo Opt-In */}
            {screenCaptureError && (
              <div style={{
                background: 'var(--status-amber-bg)',
                border: '1px solid rgba(179, 104, 41, 0.3)',
                borderLeft: '4px solid var(--status-amber)',
                borderRadius: '6px',
                padding: '10px 14px',
                marginBottom: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                fontSize: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--status-amber)' }}>
                  <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                  <span>{screenCaptureError}</span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    type="button" 
                    className="btn btn-primary"
                    style={{ fontSize: '11px', padding: '4px 10px' }}
                    onClick={() => startScreenCapture(false)}
                  >
                    Retry Capture
                  </button>
                  <button 
                    type="button" 
                    className="btn btn-secondary"
                    style={{ fontSize: '11px', padding: '4px 10px' }}
                    onClick={() => startScreenCapture(true)}
                  >
                    Engage Demo Mode
                  </button>
                </div>
              </div>
            )}

            {/* Live Video / Canvas Screen Preview */}
            <div style={{
              width: '100%',
              height: '210px',
              background: '#090d14',
              borderRadius: '8px',
              border: '1px solid var(--line)',
              overflow: 'hidden',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {isScreenTracking ? (
                screenStream ? (
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    muted 
                    style={{ 
                      width: '100%', 
                      height: '100%', 
                      objectFit: 'contain',
                      background: '#090d14',
                      transform: 'translateZ(0)',
                      WebkitTransform: 'translateZ(0)',
                      willChange: 'transform',
                      backfaceVisibility: 'hidden'
                    }}
                  />
                ) : isNativeRecording ? (
                  <div style={{ width: '100%', height: '100%', padding: '14px 16px 36px', background: '#090d14', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '8px', boxSizing: 'border-box', textAlign: 'center' }}>
                    <Monitor size={22} style={{ color: 'var(--status-green)', margin: '0 auto' }} />
                    <div className="mono" style={{ fontSize: '12px', color: '#EDF1E3' }}>Recording device screen</div>
                    <div className="mono" style={{ fontSize: '11px', color: '#94a3b8', maxWidth: '360px', margin: '0 auto', lineHeight: 1.5 }}>
                      Your Android screen is being recorded for this sprint. Android shows a recording indicator in the status bar. The video uploads for the AI audit when the sprint ends. (No live preview inside the app.)
                    </div>
                  </div>
                ) : isActivityMode ? (
                  <div style={{ width: '100%', height: '100%', padding: '14px 16px 36px', background: '#090d14', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '8px', boxSizing: 'border-box', textAlign: 'center' }}>
                    <Activity size={22} style={{ color: '#7dd3fc', margin: '0 auto' }} />
                    <div className="mono" style={{ fontSize: '12px', color: '#EDF1E3' }}>● {activeWindow}</div>
                    <div className="mono" style={{ fontSize: '11px', color: '#94a3b8', maxWidth: '360px', margin: '0 auto', lineHeight: 1.5 }}>
                      This device can't share its screen from the browser or app, so the sentinel is tracking sprint activity instead: heartbeats every few seconds and every time you leave or return to the app. For a video-verified sprint, use a desktop browser.
                    </div>
                  </div>
                ) : (
                  <div style={{ width: '100%', height: '100%', padding: '12px 14px', background: '#090d14', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '6px', borderBottom: '1px solid #1e2638' }}>
                      <span className="mono" style={{ fontSize: '11px', color: '#7dd3fc', fontWeight: '500' }}>● {activeWindow}</span>
                      <span className="mono" style={{ fontSize: '9px', color: '#64748b' }}>SENTINEL ACTIVE • 60 FPS</span>
                    </div>
                    <div style={{ paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '5px', flex: 1, overflow: 'hidden' }}>
                      <div className="mono" style={{ fontSize: '11px', color: '#94a3b8' }}>
                        <span style={{ color: '#c084fc' }}>import</span> {'{ telemetryDispatcher }'} <span style={{ color: '#c084fc' }}>from</span> <span style={{ color: '#86efac' }}>'@inovex/core'</span>;
                      </div>
                      <div className="mono" style={{ fontSize: '11px', color: '#94a3b8' }}>
                        <span style={{ color: '#60a5fa' }}>const</span> stream = telemetryDispatcher.createSession({'{'} user: <span style={{ color: '#fde047' }}>'{currentUser.id}'</span> {'}'});
                      </div>
                      <div className="mono" style={{ fontSize: '10px', color: '#475569' }}>
                        // Tracking window entropy: {activeWindow}
                      </div>
                      <div className="mono" style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ color: '#60a5fa' }}>await</span> stream.processSubsecondBatch();
                        <span className="sim-cursor"></span>
                      </div>
                    </div>
                  </div>
                )
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--muted-2)', padding: '20px' }}>
                  <Eye size={24} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                  <div style={{ fontSize: '13px', fontWeight: '500', color: 'var(--ink)' }}>0ms Delay Screen Sentinel Disarmed</div>
                  <div className="mono" style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px', maxWidth: '320px', margin: '4px auto 12px' }}>
                    {(supportsScreenCapture() || nativeRecordingAvailable)
                      ? 'Records your screen during the sprint for the AI audit. You approve the capture when it starts.'
                      : "Screen video isn't available on this device. Activity monitoring will be used instead."}
                  </div>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '6px 14px', fontSize: '11px', margin: '0 auto' }}
                    onClick={handleToggleScreenMonitor}
                  >
                    <Play size={12} />
                    <span>Arm 0ms Live Monitor Now</span>
                  </button>
                </div>
              )}

              {isScreenTracking && (
                <div style={{
                  position: 'absolute',
                  bottom: '8px',
                  left: '8px',
                  background: 'rgba(11, 11, 12, 0.82)',
                  backdropFilter: 'blur(6px)',
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  color: '#EDF1E3',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  border: '1px solid rgba(255, 255, 255, 0.1)'
                }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isDemoSimulation ? '#D97706' : isActivityMode ? '#7dd3fc' : 'var(--status-green)' }}></span>
                  <span>{isDemoSimulation ? 'DEMO SIMULATION • NOT PRODUCTION EVIDENCE' : isActivityMode ? 'ACTIVITY MONITOR • NO SCREEN VIDEO ON THIS DEVICE' : isNativeRecording ? 'RECORDING DEVICE SCREEN' : 'RECORDING SCREEN • LIVE'}</span>
                </div>
              )}
            </div>

            {/* Telemetry Stream Telemetrics */}
            <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
              <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '6px', padding: '6px 10px' }}>
                <div style={{ color: 'var(--muted-2)', fontSize: '9px', textTransform: 'uppercase' }}>Focus Window</div>
                <div style={{ color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: '500' }}>
                  {isScreenTracking ? activeWindow : 'Idle'}
                </div>
              </div>
              <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '6px', padding: '6px 10px' }}>
                <div style={{ color: 'var(--muted-2)', fontSize: '9px', textTransform: 'uppercase' }}>Key Velocity</div>
                <div style={{ color: 'var(--accent-strong)', fontWeight: '600' }}>
                  {isScreenTracking ? `${keystrokes} kps` : '0 kps'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: TASK DIRECTIVE & PROOF OF WORK */}
        <div>
          {currentTask ? (
            <>
              {/* DIRECTIVE BRIEF */}
              <div className="demo-shell" style={{ padding: '24px', marginBottom: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div>
                    <div className="section-kicker" style={{ marginBottom: '4px' }}>Sprint Objective</div>
                    <h3 className="serif" style={{ fontSize: '24px', color: 'var(--ink)', lineHeight: '1.2' }}>
                      {currentTask.title}
                    </h3>
                  </div>
                  <span className={`badge ${currentTask.status === 'active' ? 'active' : isCompletedOrReview ? 'founder' : 'waiting'}`}>
                    <span className="badge-dot"></span>
                    {currentTask.status.toUpperCase()}
                  </span>
                </div>

                {/* Brief Content */}
                <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '8px', padding: '16px 18px', marginBottom: '16px' }}>
                  <div className="specimen-label" style={{ fontSize: '10px', marginBottom: '6px' }}>
                    Specification Payload:
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--ink)', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                    {currentTask.brief_content}
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', color: 'var(--muted)' }}>
                  <span>Sprint Duration: <strong>30 Minutes Fixed</strong></span>
                  <span className="mono" style={{ fontSize: '11px' }}>Task ID: {currentTask.id}</span>
                </div>
              </div>

              {/* PROOF OF WORK SUBMISSION CARD */}
              <div className="demo-shell" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <div>
                    <div className="section-kicker" style={{ marginBottom: '4px' }}>Deliverable Submission</div>
                    <h3 className="serif" style={{ fontSize: '22px', color: 'var(--ink)' }}>
                      Submit Completed Work
                    </h3>
                  </div>
                  <span className="mono" style={{ fontSize: '11px', color: 'var(--muted-2)' }}>
                    Webhook: {currentTask.proof_of_work_webhook}
                  </span>
                </div>

                {submissionSuccess || isCompletedOrReview ? (
                  <div style={{ background: 'var(--accent-tint-2)', border: '1px solid rgba(95, 115, 72, 0.25)', borderRadius: '8px', padding: '20px', textAlign: 'center' }}>
                    <CheckCircle2 size={30} style={{ color: 'var(--accent-strong)', margin: '0 auto 6px' }} />
                    <h4 className="serif" style={{ fontSize: '20px', color: 'var(--ink)', marginBottom: '4px' }}>
                      Proof of Work Submitted & Verified
                    </h4>
                    <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '14px' }}>
                      Sprint deliverables registered. Automated validation webhook triggered.
                    </p>

                    {/* AI Agent Audit Summary Badge */}
                    <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px 16px', textAlign: 'left', marginTop: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span className="specimen-label" style={{ margin: 0 }}>AI Agent 30-Min Video Audit</span>
                        <span className="badge active">Submitted to Founder</span>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--ink)', lineHeight: '1.5' }}>
                        {aiAuditReport?.ai_summary || '30-minute screen footage analyzed by AI Sentinel. Activity patterns, focus distribution, and zero-loss input entropy submitted to Founder Dashboard.'}
                      </div>
                      <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--muted-2)' }}>
                        <span>Anomalies Flagged: <strong style={{ color: 'var(--accent-strong)' }}>{aiAuditReport?.anomaly_count ?? 0}</strong></span>
                        <span>•</span>
                        <span>AI Integrity: <strong style={{ color: 'var(--status-green)' }}>{aiAuditReport?.ai_health_score ?? 94}%</strong></span>
                        <span>•</span>
                        <span>Device: <strong style={{ color: 'var(--ink)' }}>{aiAuditReport?.device_type?.toUpperCase() || 'DESKTOP'}</strong></span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSubmitProofOfWork}>
                    <div style={{ marginBottom: '14px' }}>
                      <label className="specimen-label" style={{ display: 'block', marginBottom: '6px' }}>
                        GitHub Pull Request / Repository URL
                      </label>
                      <input 
                        type="url"
                        required
                        className="dispatch-textarea"
                        style={{ height: '40px', padding: '8px 12px', fontSize: '13px' }}
                        value={prUrl}
                        onChange={(e) => setPrUrl(e.target.value)}
                        placeholder="https://github.com/..."
                      />
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                      <label className="specimen-label" style={{ display: 'block', marginBottom: '6px' }}>
                        Deliverables & Unit Benchmark Summary
                      </label>
                      <textarea 
                        rows={3}
                        className="dispatch-textarea"
                        style={{ fontSize: '13px', padding: '10px 12px' }}
                        value={payloadNotes}
                        onChange={(e) => setPayloadNotes(e.target.value)}
                        placeholder="Summarize deliverables, test outputs, and functionality completed..."
                      />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span className="mono" style={{ fontSize: '11px', color: 'var(--muted-2)' }}>
                        {isTimerRunning ? 'You can submit early or at the 30-min mark' : 'Submission required after 30 mins'}
                      </span>
                      <button 
                        type="submit"
                        className="btn btn-primary"
                        disabled={isSubmitting}
                        id="btn-submit-pow"
                      >
                        <Send size={14} />
                        <span>{isSubmitting ? 'Submitting...' : 'Submit Work'}</span>
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
            <div className="demo-shell" style={{ textAlign: 'center', padding: '40px 20px' }}>
              <Activity size={28} style={{ color: 'var(--muted)', margin: '0 auto 10px' }} />
              <h3 className="serif" style={{ fontSize: '22px', color: 'var(--ink)', marginBottom: '6px' }}>
                No Active Sprint Assigned
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--muted)' }}>
                Your node is on standby. A micro-sprint will appear here when dispatched by the Founder.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* FOOTER AUDIT STATUS */}
      <div style={{
        marginTop: '20px',
        padding: '12px 18px',
        background: 'var(--card)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        fontSize: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--status-green)' }}>
          <ShieldCheck size={14} />
          <span>Device Verified Node: <strong>{currentUser.device_mac_address}</strong></span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px', color: 'var(--muted)' }}>
          <span>
            Active Window: <strong style={{ color: 'var(--ink)' }}>{activeWindow}</strong>
          </span>
          <span className="mono" style={{ color: 'var(--accent-strong)' }}>
            Velocity: {keystrokes} kps
          </span>
        </div>
      </div>

    </div>
  );
}
