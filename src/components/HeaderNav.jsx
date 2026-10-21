import React from 'react';
import { Shield, Sparkles, AlertTriangle, ArrowUpRight, Smartphone, Download } from 'lucide-react';

export function HeaderNav({ currentUser, users, onSwitchUser, wsConnected, onSimulateSpoof, onOpenInstallModal, canInstallPwa }) {
  const isFounder = currentUser?.role === 'founder';

  return (
    <header className="lexven-header">
      <div className="wrap lexven-header-inner">
        {/* Brand & Wordmark */}
        <div className="lexven-brand">
          <div className="lexven-wordmark inovex-wordmark">
            INOVEX<span className="leaf">.</span>
          </div>
          <span className="lexven-badge-tag inovex-badge-tag">Operations Sentinel</span>
        </div>

        {/* Status, RBAC & Actions */}
        <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Download & Install on Android Button */}
          <button 
            className="btn btn-secondary install-app-btn"
            style={{ padding: '6px 13px', fontSize: '12px', gap: '6px' }}
            onClick={onOpenInstallModal}
            title="Download & Install Inovex Tracker on Android phone or Desktop"
          >
            <Smartphone size={13} style={{ color: 'var(--accent)' }} />
            <span>Install on Android</span>
            {canInstallPwa && (
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--status-green)', display: 'inline-block' }}></span>
            )}
          </button>

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

          <div className="switcher-pill">
            <span className="mono" style={{ fontSize: '10px', color: 'var(--muted-2)', textTransform: 'uppercase' }}>
              Enclave: Verified Node
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
