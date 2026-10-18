import React from 'react';
import { Shield, Sparkles, AlertTriangle, ArrowUpRight } from 'lucide-react';

export function HeaderNav({ currentUser, users, onSwitchUser, wsConnected, onSimulateSpoof }) {
  const isFounder = currentUser?.role === 'founder';

  return (
    <header className="lexven-header">
      <div className="wrap lexven-header-inner">
        {/* Brand & Wordmark */}
        <div className="lexven-brand">
          <div className="lexven-wordmark">
            Lexven<span className="leaf">.</span>
          </div>
          <span className="lexven-badge-tag">Operations Sentinel</span>
        </div>

        {/* Status, RBAC & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          {/* WebSocket Live Telemetry Status */}
          <div className="live-pill">
            <span className="dot" style={{ background: wsConnected ? 'var(--status-green)' : 'var(--status-red)' }}></span>
            <span>{wsConnected ? 'Telemetry: Live' : 'Offline'}</span>
          </div>

          {/* Simulate Spoof Signal Test Action (Founders only) */}
          {isFounder && (
            <button 
              className="btn btn-secondary"
              style={{ padding: '6px 14px', fontSize: '12px', gap: '6px' }}
              onClick={onSimulateSpoof}
              title="Trigger simulated hardware anomaly test (Action 2)"
            >
              <AlertTriangle size={13} style={{ color: 'var(--status-amber)' }} />
              <span>Simulate Anomaly</span>
            </button>
          )}

          {/* Current User Identity */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--ink)' }}>
                {currentUser?.name}
              </span>
              <span className="mono" style={{ fontSize: '10px', color: 'var(--muted-2)' }}>
                {currentUser?.device_mac_address}
              </span>
            </div>

            <span className={`badge ${isFounder ? 'founder' : 'waiting'}`}>
              <span className="badge-dot"></span>
              {isFounder ? 'Founder' : 'Employee'}
            </span>
          </div>

          {/* Account Switcher Dropdown */}
          <div className="switcher-pill">
            <span className="mono" style={{ fontSize: '10px', color: 'var(--muted-2)', textTransform: 'uppercase' }}>
              Role:
            </span>
            <select 
              className="switcher-select"
              value={currentUser?.id || ''}
              onChange={(e) => onSwitchUser(e.target.value)}
              aria-label="Switch User Identity"
            >
              <optgroup label="Founders (Cap: 2)">
                {users.filter(u => u.role === 'founder').map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name} (Founder)
                  </option>
                ))}
              </optgroup>
              <optgroup label="Employees (Cap: 4)">
                {users.filter(u => u.role === 'employee').map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name} (Employee)
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
        </div>
      </div>
    </header>
  );
}
