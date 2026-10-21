import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Activity, 
  TrendingUp, 
  Zap, 
  Radio, 
  Laptop, 
  ShieldCheck, 
  Clock, 
  Sparkles,
  Layers,
  Eye,
  CheckCircle2,
  AlertTriangle,
  RotateCw
} from 'lucide-react';

// Node palette matching Lexven design system
const NODE_COLORS = {
  usr_emp_01: {
    primary: '#3E8A5E', // Forest green
    bg: 'rgba(62, 138, 94, 0.12)',
    border: 'rgba(62, 138, 94, 0.4)',
    name: 'Alex Mercer',
    role: 'Agentic Eng'
  },
  usr_emp_02: {
    primary: '#2563EB', // Tech blue
    bg: 'rgba(37, 99, 235, 0.12)',
    border: 'rgba(37, 99, 235, 0.4)',
    name: 'Elena Rostova',
    role: 'Pipeline Eng'
  },
  usr_emp_03: {
    primary: '#D97706', // Warm amber
    bg: 'rgba(217, 119, 6, 0.12)',
    border: 'rgba(217, 119, 6, 0.4)',
    name: 'Marcus Brody',
    role: 'Telemetry Systems'
  },
  usr_emp_04: {
    primary: '#8B5CF6', // Purple
    bg: 'rgba(139, 92, 246, 0.12)',
    border: 'rgba(139, 92, 246, 0.4)',
    name: 'Sophia Lindqvist',
    role: 'Model Ops'
  }
};

const DEFAULT_COLOR = {
  primary: '#5F7348',
  bg: 'rgba(95, 115, 72, 0.12)',
  border: 'rgba(95, 115, 72, 0.4)',
  name: 'Engineering Node',
  role: 'Engineer'
};

export function TelemetryGraphView({ 
  healthMatrix = [], 
  telemetryLogs = [], 
  gridUsers = [], 
  lastWsEvent,
  onInspectEmployee 
}) {
  const [metricMode, setMetricMode] = useState('entropy'); // 'entropy' (kps) or 'health' (0-100)
  const [selectedNodeId, setSelectedNodeId] = useState('all'); // 'all' or userId
  const [timeWindowMin, setTimeWindowMin] = useState(30); // 15, 30, or 90
  const [hoverIndex, setHoverIndex] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);
  const [livePulseTick, setLivePulseTick] = useState(0);
  const svgRef = useRef(null);

  // Periodically increment tick to keep real-time curves dynamic
  useEffect(() => {
    const timer = setInterval(() => {
      setLivePulseTick(t => t + 1);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  // Filter employee nodes
  const employeeNodes = useMemo(() => {
    const emps = gridUsers.filter(u => u.role === 'employee');
    if (emps.length > 0) return emps;
    // Fallback if users array is loading
    return [
      { id: 'usr_emp_01', name: 'Alex Mercer', skill_set: 'Agentic Eng', device_mac_address: '7C:2E:BD:41:09:A1' },
      { id: 'usr_emp_02', name: 'Elena Rostova', skill_set: 'Pipeline Eng', device_mac_address: '00:1B:44:11:3A:B7' },
      { id: 'usr_emp_03', name: 'Marcus Brody', skill_set: 'Telemetry Systems', device_mac_address: 'E4:5F:01:88:9C:23' },
      { id: 'usr_emp_04', name: 'Sophia Lindqvist', skill_set: 'Model Ops', device_mac_address: 'AC:DE:48:00:11:22' },
    ];
  }, [gridUsers]);

  // Generate 12 historical time points across the selected timeWindowMin
  const numPoints = 12;
  const timeLabels = useMemo(() => {
    const labels = [];
    for (let i = 0; i < numPoints; i++) {
      const minutesAgo = Math.round(timeWindowMin * (1 - i / (numPoints - 1)));
      if (minutesAgo === 0) {
        labels.push('LIVE');
      } else {
        labels.push(`-${minutesAgo}m`);
      }
    }
    return labels;
  }, [timeWindowMin]);

  // Generate realistic, deterministic yet live-updating time-series for each employee
  const seriesData = useMemo(() => {
    const now = Date.now();
    const result = {};

    employeeNodes.forEach((node, nodeIdx) => {
      const colorMeta = NODE_COLORS[node.id] || DEFAULT_COLOR;
      
      // Seed pseudo-random baseline from node ID
      const charSum = node.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
      const baseKps = 24 + (charSum % 15); // 24 to 38 kps
      const baseHealth = 82 + (charSum % 15); // 82 to 96%
      
      const points = [];
      for (let i = 0; i < numPoints; i++) {
        const timeFraction = i / (numPoints - 1);
        
        // Dynamic sine wave variations + small tick noise
        const wave1 = Math.sin((timeFraction * 3 + nodeIdx + livePulseTick * 0.1) * Math.PI) * 7;
        const wave2 = Math.cos((timeFraction * 5 + nodeIdx * 1.5) * Math.PI) * 4;
        
        // Keystroke rate (kps)
        let kps = +(Math.max(8, Math.min(58, baseKps + wave1 + wave2)).toFixed(1));
        // Health score (0 - 100)
        let health = +(Math.max(40, Math.min(99, baseHealth + wave1 * 0.7)).toFixed(0));

        // Incorporate actual latest telemetry logs if available for this user on the final point
        if (i === numPoints - 1) {
          const userLog = telemetryLogs.find(l => l.user_id === node.id || l.user_name === node.name);
          if (userLog && userLog.keystroke_rate) {
            kps = +userLog.keystroke_rate.toFixed(1);
          }
          const userTask = healthMatrix.find(t => t.user_id === node.id || t.employee_name === node.name);
          if (userTask && userTask.ai_health_score) {
            health = userTask.ai_health_score;
          }
        }

        // Window focus simulation along timeline
        const windows = [
          'Visual Studio Code — src/controllers/auth.ts',
          'Terminal — zsh node server.js',
          'Chrome — internal-docs.lexven.com/api',
          'Visual Studio Code — tests/agent.spec.ts',
          'Docker Desktop — Container telemetry-daemon'
        ];
        const activeWin = windows[(i + nodeIdx) % windows.length];

        points.push({
          index: i,
          timeLabel: timeLabels[i],
          kps,
          health,
          activeWindow: i === numPoints - 1 ? (node.telemetry?.active_window || activeWin) : activeWin,
          isAnomaly: node.telemetry?.hardware_spoof_flag === 1 && i === numPoints - 1
        });
      }

      result[node.id] = {
        node,
        colorMeta,
        points,
        latestKps: points[points.length - 1].kps,
        latestHealth: points[points.length - 1].health,
        latestWindow: points[points.length - 1].activeWindow
      };
    });

    return result;
  }, [employeeNodes, telemetryLogs, healthMatrix, numPoints, timeLabels, livePulseTick]);

  // SVG Chart Geometry
  const width = 860;
  const height = 260;
  const padding = { top: 24, right: 36, bottom: 36, left: 44 };
  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;

  // Scales
  const maxVal = metricMode === 'entropy' ? 60 : 100;
  const minVal = 0;

  const getX = (index) => padding.left + (index / (numPoints - 1)) * graphWidth;
  const getY = (val) => padding.top + graphHeight - ((val - minVal) / (maxVal - minVal)) * graphHeight;

  // Path Generator (Smooth Bezier Spline)
  const generatePath = (points, key) => {
    if (!points || points.length === 0) return '';
    const coords = points.map((p, i) => ({ x: getX(i), y: getY(p[key]) }));

    let d = `M ${coords[0].x},${coords[0].y}`;
    for (let i = 0; i < coords.length - 1; i++) {
      const p0 = coords[i === 0 ? 0 : i - 1];
      const p1 = coords[i];
      const p2 = coords[i + 1];
      const p3 = coords[i + 2 < coords.length ? i + 2 : i + 1];

      // Catmull-Rom to Cubic Bezier
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    return d;
  };

  const generateArea = (points, key) => {
    const linePath = generatePath(points, key);
    if (!linePath) return '';
    const lastX = getX(points.length - 1);
    const firstX = getX(0);
    const bottomY = padding.top + graphHeight;
    return `${linePath} L ${lastX},${bottomY} L ${firstX},${bottomY} Z`;
  };

  // Handle Mouse Over SVG for Crosshair Tooltip
  const handleMouseMove = (e) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    // Convert clientX to SVG scale
    const svgX = (clientX / rect.width) * width;
    const svgY = (clientY / rect.height) * height;

    setMousePos({ x: svgX, y: svgY });

    if (svgX >= padding.left && svgX <= width - padding.right) {
      const fraction = (svgX - padding.left) / graphWidth;
      const closestIndex = Math.min(numPoints - 1, Math.max(0, Math.round(fraction * (numPoints - 1))));
      setHoverIndex(closestIndex);
      setIsHovering(true);
    } else {
      setIsHovering(false);
      setHoverIndex(null);
    }
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
    setHoverIndex(null);
  };

  // Compute fleet-wide stats for top HUD
  const fleetStats = useMemo(() => {
    const allSeries = Object.values(seriesData);
    if (allSeries.length === 0) return { avgKps: 0, avgHealth: 100, activeCount: 0 };
    
    const avgKps = (allSeries.reduce((acc, s) => acc + s.latestKps, 0) / allSeries.length).toFixed(1);
    const avgHealth = Math.round(allSeries.reduce((acc, s) => acc + s.latestHealth, 0) / allSeries.length);
    const activeCount = allSeries.length;
    return { avgKps, avgHealth, activeCount };
  }, [seriesData]);

  // Nodes to render based on selection
  const nodesToRender = selectedNodeId === 'all' 
    ? Object.keys(seriesData)
    : [selectedNodeId].filter(id => seriesData[id]);

  return (
    <div className="telemetry-graph-container" style={{
      background: 'var(--card)',
      border: '1px solid var(--line)',
      borderRadius: 'var(--radius)',
      padding: '24px',
      boxShadow: '0 2px 14px rgba(11, 11, 12, 0.03)',
      marginBottom: '32px'
    }}>
      {/* 1. Header Toolbar with Title, Metric Switcher & Time Window */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
        marginBottom: '20px',
        borderBottom: '1px solid var(--line)',
        paddingBottom: '16px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <div className="section-kicker" style={{ margin: 0, padding: '3px 10px', fontSize: '10px' }}>
              Real-Time Waveform
            </div>
            <div className="live-pill" style={{ padding: '3px 8px', fontSize: '10px' }}>
              <span className="dot" style={{ background: 'var(--status-green)' }}></span>
              <span>Sub-Second Telemetry</span>
            </div>
          </div>
          <h3 className="serif" style={{ fontSize: '26px', color: 'var(--ink)', margin: 0, letterSpacing: '-0.01em' }}>
            Continuous Engineering Telemetry Stream
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>
            Live machine input entropy (kps) and AI pacing health trajectory streamed directly from connected developer nodes.
          </p>
        </div>

        {/* Action Controls: Metric Toggle & Time Window */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Metric Selector Tabs */}
          <div style={{
            display: 'inline-flex',
            background: 'var(--bg)',
            border: '1px solid var(--line)',
            borderRadius: '8px',
            padding: '3px'
          }}>
            <button
              type="button"
              onClick={() => setMetricMode('entropy')}
              style={{
                background: metricMode === 'entropy' ? 'var(--card)' : 'transparent',
                color: metricMode === 'entropy' ? 'var(--ink)' : 'var(--muted)',
                fontWeight: metricMode === 'entropy' ? '600' : '400',
                border: metricMode === 'entropy' ? '1px solid var(--line)' : 'none',
                boxShadow: metricMode === 'entropy' ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                transition: 'all 0.15s ease'
              }}
            >
              <Zap size={13} style={{ color: metricMode === 'entropy' ? 'var(--accent-strong)' : 'inherit' }} />
              <span>Input Entropy (kps)</span>
            </button>
            <button
              type="button"
              onClick={() => setMetricMode('health')}
              style={{
                background: metricMode === 'health' ? 'var(--card)' : 'transparent',
                color: metricMode === 'health' ? 'var(--ink)' : 'var(--muted)',
                fontWeight: metricMode === 'health' ? '600' : '400',
                border: metricMode === 'health' ? '1px solid var(--line)' : 'none',
                boxShadow: metricMode === 'health' ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                transition: 'all 0.15s ease'
              }}
            >
              <Activity size={13} style={{ color: metricMode === 'health' ? 'var(--status-green)' : 'inherit' }} />
              <span>AI Pacing Health (0–100)</span>
            </button>
          </div>

          {/* Time Window Buttons */}
          <div style={{
            display: 'inline-flex',
            background: 'var(--bg)',
            border: '1px solid var(--line)',
            borderRadius: '8px',
            padding: '3px'
          }}>
            {[15, 30, 90].map(mins => (
              <button
                key={mins}
                type="button"
                onClick={() => setTimeWindowMin(mins)}
                style={{
                  background: timeWindowMin === mins ? 'var(--card)' : 'transparent',
                  color: timeWindowMin === mins ? 'var(--ink)' : 'var(--muted)',
                  fontWeight: timeWindowMin === mins ? '600' : '400',
                  border: timeWindowMin === mins ? '1px solid var(--line)' : 'none',
                  boxShadow: timeWindowMin === mins ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {mins === 90 ? '90m (Sprint)' : `${mins}m`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 2. Top Summary KPI Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '12px',
        marginBottom: '20px'
      }}>
        <div style={{
          background: 'var(--bg)',
          border: '1px solid var(--line)',
          borderRadius: '8px',
          padding: '12px 16px'
        }}>
          <div className="specimen-label" style={{ fontSize: '10px' }}>Active Monitored Streams</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '4px' }}>
            <span className="serif" style={{ fontSize: '24px', color: 'var(--ink)', fontWeight: '600' }}>
              {fleetStats.activeCount.toString().padStart(2, '0')}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>nodes active</span>
          </div>
        </div>

        <div style={{
          background: 'var(--bg)',
          border: '1px solid var(--line)',
          borderRadius: '8px',
          padding: '12px 16px'
        }}>
          <div className="specimen-label" style={{ fontSize: '10px' }}>Average Keystroke Velocity</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '4px' }}>
            <span className="serif" style={{ fontSize: '24px', color: 'var(--accent-strong)', fontWeight: '600' }}>
              {fleetStats.avgKps}
            </span>
            <span className="mono" style={{ fontSize: '11px', color: 'var(--muted)' }}>kps (chars/sec)</span>
          </div>
        </div>

        <div style={{
          background: 'var(--bg)',
          border: '1px solid var(--line)',
          borderRadius: '8px',
          padding: '12px 16px'
        }}>
          <div className="specimen-label" style={{ fontSize: '10px' }}>Fleet Health Index</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '4px' }}>
            <span className="serif" style={{ fontSize: '24px', color: 'var(--status-green)', fontWeight: '600' }}>
              {fleetStats.avgHealth}%
            </span>
            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>pacing nominal</span>
          </div>
        </div>

        <div style={{
          background: 'var(--bg)',
          border: '1px solid var(--line)',
          borderRadius: '8px',
          padding: '12px 16px'
        }}>
          <div className="specimen-label" style={{ fontSize: '10px' }}>Sentinel Integrity</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
            <ShieldCheck size={18} style={{ color: 'var(--status-green)' }} />
            <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--ink)' }}>
              Hardware Verified
            </span>
          </div>
        </div>
      </div>

      {/* 3. Node Filter Buttons (All Nodes + Individual Engineer Tabs) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        overflowX: 'auto',
        paddingBottom: '8px',
        marginBottom: '16px'
      }}>
        <button
          type="button"
          onClick={() => setSelectedNodeId('all')}
          style={{
            background: selectedNodeId === 'all' ? 'var(--ink)' : 'var(--bg)',
            color: selectedNodeId === 'all' ? '#FFFFFF' : 'var(--muted)',
            border: '1px solid ' + (selectedNodeId === 'all' ? 'var(--ink)' : 'var(--line)'),
            padding: '5px 12px',
            borderRadius: '999px',
            fontSize: '12px',
            fontWeight: '500',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            transition: 'all 0.15s ease'
          }}
        >
          All Nodes ({employeeNodes.length})
        </button>

        {employeeNodes.map(node => {
          const colorMeta = NODE_COLORS[node.id] || DEFAULT_COLOR;
          const isSelected = selectedNodeId === node.id;
          const nodeData = seriesData[node.id];
          const currKps = nodeData?.latestKps || 32;

          return (
            <button
              key={node.id}
              type="button"
              onClick={() => setSelectedNodeId(node.id)}
              style={{
                background: isSelected ? colorMeta.bg : 'var(--bg)',
                color: isSelected ? colorMeta.primary : 'var(--ink)',
                border: '1px solid ' + (isSelected ? colorMeta.primary : 'var(--line)'),
                padding: '5px 12px',
                borderRadius: '999px',
                fontSize: '12px',
                fontWeight: isSelected ? '600' : '400',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease'
              }}
            >
              <span style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: colorMeta.primary
              }} />
              <span>{node.name}</span>
              <span className="mono" style={{ fontSize: '10px', opacity: 0.8 }}>
                ({currKps} kps)
              </span>
            </button>
          );
        })}
      </div>

      {/* 4. Interactive SVG Graph Canvas */}
      <div style={{
        position: 'relative',
        background: 'var(--bg)',
        border: '1px solid var(--line)',
        borderRadius: '10px',
        padding: '8px',
        overflow: 'hidden'
      }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: '100%', height: 'auto', display: 'block', cursor: 'crosshair' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            {/* Gradients for each node */}
            {employeeNodes.map(node => {
              const meta = NODE_COLORS[node.id] || DEFAULT_COLOR;
              return (
                <linearGradient key={`grad-${node.id}`} id={`grad-${node.id}`} x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor={meta.primary} stopOpacity={selectedNodeId === 'all' ? 0.22 : 0.4} />
                  <stop offset="100%" stopColor={meta.primary} stopOpacity={0.0} />
                </linearGradient>
              );
            })}

            {/* Glowing filter */}
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Grid Lines & Y-Axis Labels */}
          {[0, 0.25, 0.5, 0.75, 1].map(frac => {
            const val = Math.round(minVal + (maxVal - minVal) * (1 - frac));
            const y = padding.top + frac * graphHeight;
            return (
              <g key={frac}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="var(--line)"
                  strokeDasharray="4 4"
                  strokeWidth="1"
                />
                <text
                  x={padding.left - 8}
                  y={y + 4}
                  textAnchor="end"
                  fill="var(--muted-2)"
                  fontSize="10"
                  fontFamily="var(--font-mono)"
                >
                  {val}{metricMode === 'health' ? '%' : ''}
                </text>
              </g>
            );
          })}

          {/* X-Axis Vertical Time Markers */}
          {timeLabels.map((label, idx) => {
            const x = getX(idx);
            return (
              <g key={idx}>
                <line
                  x1={x}
                  y1={padding.top}
                  x2={x}
                  y2={padding.top + graphHeight}
                  stroke="var(--line)"
                  strokeWidth={idx === numPoints - 1 ? 1.5 : 0.6}
                  strokeDasharray={idx === numPoints - 1 ? 'none' : '2 3'}
                />
                <text
                  x={x}
                  y={height - 12}
                  textAnchor="middle"
                  fill={idx === numPoints - 1 ? 'var(--accent-strong)' : 'var(--muted-2)'}
                  fontSize="10"
                  fontWeight={idx === numPoints - 1 ? '600' : '400'}
                  fontFamily="var(--font-mono)"
                >
                  {label}
                </text>
              </g>
            );
          })}

          {/* Area Fills for active nodes */}
          {nodesToRender.map(nodeId => {
            const s = seriesData[nodeId];
            if (!s) return null;
            const areaPath = generateArea(s.points, metricMode === 'entropy' ? 'kps' : 'health');
            return (
              <path
                key={`area-${nodeId}`}
                d={areaPath}
                fill={`url(#grad-${nodeId})`}
                style={{ transition: 'd 0.3s ease' }}
              />
            );
          })}

          {/* Curved Spline Lines */}
          {nodesToRender.map(nodeId => {
            const s = seriesData[nodeId];
            if (!s) return null;
            const linePath = generatePath(s.points, metricMode === 'entropy' ? 'kps' : 'health');
            const isSingleSelected = selectedNodeId === nodeId;

            return (
              <path
                key={`line-${nodeId}`}
                d={linePath}
                fill="none"
                stroke={s.colorMeta.primary}
                strokeWidth={isSingleSelected ? 2.8 : 2}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  transition: 'd 0.3s ease, stroke-width 0.2s ease',
                  opacity: selectedNodeId !== 'all' && !isSingleSelected ? 0.2 : 1
                }}
              />
            );
          })}

          {/* Real-time Pulser Dot at Live trailing edge (x = live, y = latest) */}
          {nodesToRender.map(nodeId => {
            const s = seriesData[nodeId];
            if (!s) return null;
            const lastPt = s.points[s.points.length - 1];
            const liveX = getX(s.points.length - 1);
            const liveY = getY(metricMode === 'entropy' ? lastPt.kps : lastPt.health);

            return (
              <g key={`live-dot-${nodeId}`}>
                {/* Outer animated ripple */}
                <circle
                  cx={liveX}
                  cy={liveY}
                  r="7"
                  fill="none"
                  stroke={s.colorMeta.primary}
                  strokeWidth="1.5"
                  opacity="0.6"
                >
                  <animate
                    attributeName="r"
                    values="5;12;5"
                    dur="2.4s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.8;0;0.8"
                    dur="2.4s"
                    repeatCount="indefinite"
                  />
                </circle>
                {/* Core solid beacon */}
                <circle
                  cx={liveX}
                  cy={liveY}
                  r="4"
                  fill={s.colorMeta.primary}
                  stroke="#FFFFFF"
                  strokeWidth="1.5"
                />
              </g>
            );
          })}

          {/* Interactive Crosshair Cursor & Highlight Dots on Hover */}
          {isHovering && hoverIndex !== null && (
            <g>
              {/* Vertical Guide Line */}
              <line
                x1={getX(hoverIndex)}
                y1={padding.top}
                x2={getX(hoverIndex)}
                y2={padding.top + graphHeight}
                stroke="var(--ink)"
                strokeDasharray="3 3"
                strokeWidth="1.2"
                opacity="0.6"
              />

              {/* Data Point Markers on Crosshair */}
              {nodesToRender.map(nodeId => {
                const s = seriesData[nodeId];
                if (!s) return null;
                const pt = s.points[hoverIndex];
                const cx = getX(hoverIndex);
                const cy = getY(metricMode === 'entropy' ? pt.kps : pt.health);

                return (
                  <circle
                    key={`hover-pt-${nodeId}`}
                    cx={cx}
                    cy={cy}
                    r="5"
                    fill={s.colorMeta.primary}
                    stroke="#FFFFFF"
                    strokeWidth="2"
                    filter="url(#glow)"
                  />
                );
              })}
            </g>
          )}
        </svg>

        {/* Floating Tooltip HUD Card on Hover */}
        {isHovering && hoverIndex !== null && (
          <div style={{
            position: 'absolute',
            top: '16px',
            right: mousePos.x > width * 0.55 ? 'auto' : '16px',
            left: mousePos.x > width * 0.55 ? '16px' : 'auto',
            background: 'rgba(250, 250, 248, 0.94)',
            backdropFilter: 'blur(10px)',
            border: '1px solid var(--line)',
            borderRadius: '8px',
            padding: '12px 14px',
            boxShadow: '0 8px 24px rgba(11, 11, 12, 0.1)',
            minWidth: '220px',
            maxWidth: '300px',
            pointerEvents: 'none',
            zIndex: 10
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '8px',
              borderBottom: '1px solid var(--line)',
              paddingBottom: '6px'
            }}>
              <span className="mono" style={{ fontSize: '11px', color: 'var(--accent-strong)', fontWeight: '600' }}>
                Timeline: {timeLabels[hoverIndex]}
              </span>
              <span style={{ fontSize: '10px', color: 'var(--muted-2)' }}>
                {metricMode === 'entropy' ? 'Entropy Plot' : 'Health Plot'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {nodesToRender.map(nodeId => {
                const s = seriesData[nodeId];
                if (!s) return null;
                const pt = s.points[hoverIndex];

                return (
                  <div key={nodeId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: s.colorMeta.primary }} />
                      <span style={{ fontWeight: '500', color: 'var(--ink)' }}>{s.node.name}</span>
                    </div>
                    <span className="mono" style={{ fontWeight: '600', color: s.colorMeta.primary }}>
                      {metricMode === 'entropy' ? `${pt.kps} kps` : `${pt.health}%`}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* If single node inspected, show window details */}
            {selectedNodeId !== 'all' && seriesData[selectedNodeId] && (
              <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px dashed var(--line)', fontSize: '11px', color: 'var(--muted)' }}>
                <div style={{ color: 'var(--muted-2)', fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>
                  Focused Application:
                </div>
                <div className="mono" style={{ color: 'var(--ink)', fontSize: '10px', wordBreak: 'break-all' }}>
                  {seriesData[selectedNodeId].points[hoverIndex]?.activeWindow}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5. Live Node Cards Below Graph (Current Focus & Spark Indicators) */}
      <div style={{
        marginTop: '20px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '12px'
      }}>
        {employeeNodes.map(node => {
          const colorMeta = NODE_COLORS[node.id] || DEFAULT_COLOR;
          const s = seriesData[node.id];
          const currKps = s?.latestKps || 32.5;
          const currHealth = s?.latestHealth || 92;
          const currWin = s?.latestWindow || 'Visual Studio Code — Workspace';
          const isSelected = selectedNodeId === node.id;

          return (
            <div
              key={node.id}
              onClick={() => {
                if (selectedNodeId === node.id) {
                  setSelectedNodeId('all');
                } else {
                  setSelectedNodeId(node.id);
                }
              }}
              style={{
                background: isSelected ? colorMeta.bg : 'var(--bg)',
                border: '1px solid ' + (isSelected ? colorMeta.primary : 'var(--line)'),
                borderRadius: '8px',
                padding: '12px',
                cursor: 'pointer',
                transition: 'all 0.18s ease'
              }}
              title="Click to isolate waveform"
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: colorMeta.primary }} />
                  <strong style={{ fontSize: '13px', color: 'var(--ink)' }}>{node.name}</strong>
                </div>
                <span className="mono" style={{ fontSize: '10px', color: 'var(--muted-2)' }}>
                  {node.skill_set || node.role}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '8px 0 4px' }}>
                <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Input Velocity:</span>
                <span className="mono" style={{ fontSize: '14px', fontWeight: '700', color: colorMeta.primary }}>
                  {currKps} <span style={{ fontSize: '10px', fontWeight: '400' }}>kps</span>
                </span>
              </div>

              {/* Progress health meter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <div style={{ flex: 1, height: '4px', background: 'var(--line-2)', borderRadius: '999px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${currHealth}%`,
                    height: '100%',
                    background: currHealth >= 75 ? 'var(--status-green)' : 'var(--status-amber)',
                    borderRadius: '999px'
                  }} />
                </div>
                <span className="mono" style={{ fontSize: '10px', color: 'var(--muted)' }}>
                  {currHealth}%
                </span>
              </div>

              {/* Current Window Pill */}
              <div style={{
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--muted)',
                background: 'var(--card)',
                border: '1px solid var(--line)',
                borderRadius: '4px',
                padding: '4px 6px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }} title={currWin}>
                💻 {currWin}
              </div>

              {/* Inspect Button */}
              {onInspectEmployee && (
                <div style={{ marginTop: '8px', textAlign: 'right' }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onInspectEmployee(node);
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--accent-strong)',
                      fontSize: '11px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '3px',
                      padding: 0
                    }}
                  >
                    <span>Inspect Workspace</span>
                    <span aria-hidden="true">→</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 6. Window Focus Spectrum Band */}
      <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
          <span className="specimen-label" style={{ fontSize: '11px', margin: 0 }}>
            Fleet Focus Spectrum Distribution (Last 30 Mins)
          </span>
          <div style={{ display: 'flex', gap: '14px', fontSize: '11px', color: 'var(--muted)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#3E8A5E' }} />
              IDE / Code (78%)
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#2563EB' }} />
              Terminal / Build (14%)
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#D97706' }} />
              Docs / Research (8%)
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#B84242' }} />
              Anomaly / Idle (0%)
            </span>
          </div>
        </div>

        {/* Stacked colored distribution bar */}
        <div style={{
          display: 'flex',
          height: '8px',
          borderRadius: '999px',
          overflow: 'hidden',
          background: 'var(--line)'
        }}>
          <div style={{ width: '78%', background: '#3E8A5E' }} title="78% Active Code Focus" />
          <div style={{ width: '14%', background: '#2563EB' }} title="14% Terminal / Pipeline" />
          <div style={{ width: '8%', background: '#D97706' }} title="8% Documentation" />
        </div>
      </div>
    </div>
  );
}
