import React from 'react';
import { Shield, Zap, Terminal, AlertTriangle, Cpu, Laptop, RefreshCw } from 'lucide-react';

export function HeaderNav({ currentUser, users, onSwitchUser, wsConnected, onSimulateSpoof }) {
  const isFounder = currentUser?.role === 'founder';

  return (
    <header className="hud-header">
      <div className="hud-brand">
        <div className="hud-logo-icon">
          <Zap size={18} />
        </div>
        <div>
          <div className="hud-title">ANTIGRAVITY // TELEMETRY & RBAC</div>
          <div className="hud-subtitle">Autonomous Micro-Sprint Orchestrator</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        {/* WebSocket Live Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
          <span className={`status-dot ${wsConnected ? 'live' : 'danger'}`}></span>
          <span style={{ color: wsConnected ? 'var(--accent-green)' : 'var(--accent-crimson)' }}>
            {wsConnected ? 'TELEMETRY: LIVE' : 'WS DISCONNECTED'}
          </span>
        </div>

        {/* Demo Spoof Injector Button (Founder Only) */}
        {isFounder && (
          <button 
            className="btn btn-outline" 
            style={{ borderColor: 'var(--accent-crimson)', color: 'var(--accent-crimson)', padding: '5px 10px', fontSize: '11px' }}
            onClick={onSimulateSpoof}
            title="Inject simulated hardware spoof flag on Employee 2 to test Action 2 Alert"
          >
            <AlertTriangle size={13} />
            Inject Spoof Signal (Test Action 2)
          </button>
        )}

        {/* Current User Identity & Role Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '12px', fontWeight: '600' }}>{currentUser?.name}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
              MAC: {currentUser?.device_mac_address}
            </div>
          </div>

          <span className={`badge ${isFounder ? 'badge-founder' : 'badge-employee'}`}>
            {isFounder ? <Shield size={12} /> : <Cpu size={12} />}
            {isFounder ? 'FOUNDER [GOD-MODE]' : 'EMPLOYEE [SCOPED]'}
          </span>
        </div>

        {/* 6-User RBAC Account Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>IDENTITY:</span>
          <select 
            className="switcher-select"
            value={currentUser?.id || ''}
            onChange={(e) => onSwitchUser(e.target.value)}
          >
            <optgroup label="Founders (Cap: 2) -> /admin-dashboard">
              {users.filter(u => u.role === 'founder').map(u => (
                <option key={u.id} value={u.id}>
                  👑 {u.name} (Founder)
                </option>
              ))}
            </optgroup>
            <optgroup label="Employees (Cap: 4) -> /workspace">
              {users.filter(u => u.role === 'employee').map(u => (
                <option key={u.id} value={u.id}>
                  ⚡ {u.name} (Employee)
                </option>
              ))}
            </optgroup>
          </select>
        </div>
      </div>
    </header>
  );
}
