import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Sparkles, 
  AlertTriangle, 
  ArrowUpRight, 
  Smartphone, 
  Download, 
  Clock, 
  Activity, 
  LayoutGrid, 
  Video, 
  CheckCircle2, 
  Zap, 
  Menu, 
  X, 
  UserCheck, 
  Database,
  LogOut
} from 'lucide-react';
import { isSupabaseConfigured } from '../lib/supabase';

export function SidebarNav({ 
  currentUser, 
  users, 
  onSwitchUser, 
  wsConnected, 
  onSimulateSpoof, 
  onOpenInstallModal, 
  canInstallPwa,
  activeTab,
  onTabChange,
  onLogout
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [latencyMs, setLatencyMs] = useState(12);
  const isFounder = currentUser?.role === 'founder';

  // Live real-time sub-millisecond latency ticker
  useEffect(() => {
    const interval = setInterval(() => {
      // Simulate real ping fluctuation between 8ms and 18ms
      setLatencyMs(prev => Math.max(6, Math.min(22, prev + (Math.random() > 0.5 ? 1 : -1))));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleSelectUser = (e) => {
    onSwitchUser(e.target.value);
  };

  const navItems = isFounder ? [
    { id: 'dashboard', label: 'Orchestration Grid', icon: LayoutGrid },
    { id: 'audits', label: 'Video Audits & AI', icon: Video },
    { id: 'telemetry', label: 'Telemetry Streams', icon: Activity },
  ] : [
    { id: 'workspace', label: 'Sprint Workspace', icon: Clock },
    { id: 'sentinel', label: 'Screen Sentinel', icon: Shield },
  ];

  return (
    <>
      {/* MOBILE COMPACT TOP BAR (Android & Small Screens) */}
      <header className="mobile-topbar">
        <div className="mobile-brand">
          <span className="inovex-wordmark">
            INOVEX<span className="leaf">.</span>
          </span>
          <span className="inovex-version-tag">v2.0</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Quick Install Pill on Mobile */}
          <button 
            className="mobile-install-btn"
            onClick={onOpenInstallModal}
            title="Download App"
          >
            <Smartphone size={14} />
            <span>Install</span>
            {canInstallPwa && <span className="mobile-dot"></span>}
          </button>

          {/* Disconnect / Logout button on mobile */}
          {onLogout && (
            <button 
              className="mobile-menu-toggle"
              onClick={onLogout}
              title="Disconnect Node"
              aria-label="Disconnect Node"
              style={{ width: '38px', height: '38px' }}
            >
              <LogOut size={16} />
            </button>
          )}

          {/* Mobile Menu Hamburger */}
          <button 
            className="mobile-menu-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {/* MOBILE BACKDROP OVERLAY */}
      {mobileMenuOpen && (
        <div 
          className="mobile-drawer-backdrop"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* VERSION 2 SIDEBAR PANEL (Desktop Left Rail & Mobile Slide Drawer) */}
      <aside className={`inovex-sidebar ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="sidebar-inner">
          
          {/* 1. BRAND HEADER */}
          <div className="sidebar-brand-block">
            <div className="sidebar-brand-row">
              <div className="inovex-wordmark">
                INOVEX<span className="leaf">.</span>
              </div>
              <span className="inovex-version-tag">v2.0</span>
            </div>
            <div className="sidebar-brand-subtitle">
              Operations Sentinel • Zero-Latency
            </div>
          </div>

          {/* 2. ACTIVE NODE IDENTITY CARD */}
          <div className="sidebar-identity-card">
            <div className="identity-header">
              <div className="identity-avatar">
                {currentUser?.name ? currentUser.name.split(' ').map(n => n[0]).join('') : 'U'}
              </div>
              <div className="identity-details">
                <span className="identity-name">{currentUser?.name}</span>
                <span className="identity-mac mono">{currentUser?.device_mac_address}</span>
              </div>
              {onLogout && (
                <button
                  type="button"
                  className="sidebar-disconnect-btn"
                  onClick={onLogout}
                  title="Disconnect Node & Sign Out"
                  aria-label="Disconnect Node"
                >
                  <LogOut size={13} />
                </button>
              )}
            </div>

            <div className="identity-meta-row">
              <span className={`badge ${isFounder ? 'founder' : 'waiting'}`} style={{ padding: '2px 8px', fontSize: '10px' }}>
                <span className="badge-dot"></span>
                {isFounder ? 'Founder Node' : 'Engineer Node'}
              </span>

              <button
                type="button"
                className="sidebar-switch-node-btn"
                onClick={onLogout}
                title="Switch to another user account (requires credentials)"
                style={{
                  background: 'transparent',
                  border: '1px solid var(--line)',
                  borderRadius: '6px',
                  padding: '3px 8px',
                  fontSize: '11px',
                  color: 'var(--muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <span>Switch Node</span>
              </button>
            </div>
          </div>

          {/* 3. ZERO-LATENCY TELEMETRY HUD */}
          <div className="sidebar-telemetry-hud">
            <div className="hud-header">
              <div className="hud-title-wrap">
                <Zap size={12} style={{ color: 'var(--accent)' }} />
                <span>Zero-Latency Telemetry</span>
              </div>
              <span className="hud-ping mono">{wsConnected ? `${latencyMs}ms` : 'Offline'}</span>
            </div>

            <div className="hud-status-bar">
              <span className="live-pill" style={{ padding: '3px 8px', fontSize: '10px' }}>
                <span className="dot" style={{ background: wsConnected ? 'var(--status-green)' : 'var(--status-red)' }}></span>
                <span>{wsConnected ? 'Sub-Second Active' : 'Disconnected'}</span>
              </span>
              <span className="hud-engine-tag mono">
                {isSupabaseConfigured ? 'Supabase Realtime' : 'WebSockets Engine'}
              </span>
            </div>
          </div>

          {/* 4. PRIMARY NAVIGATION */}
          <div className="sidebar-nav-section">
            <div className="sidebar-section-kicker">Navigation & Mode</div>
            <nav className="sidebar-nav-list">
              {navItems.map(item => {
                const IconComponent = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      if (onTabChange) onTabChange(item.id);
                      setMobileMenuOpen(false);
                    }}
                  >
                    <IconComponent size={16} />
                    <span>{item.label}</span>
                    {isActive && <span className="nav-active-pip"></span>}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* 5. QUICK ACTIONS & TOOLS */}
          <div className="sidebar-actions-section">
            <div className="sidebar-section-kicker">Sentinel Tools</div>
            
            {/* Install on Android Button */}
            <button 
              className="sidebar-action-btn install"
              onClick={() => {
                onOpenInstallModal();
                setMobileMenuOpen(false);
              }}
            >
              <Smartphone size={15} style={{ color: 'var(--accent)' }} />
              <div style={{ textAlign: 'left', flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '13px', lineHeight: 1.2 }}>Install on Android</div>
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>PWA & Mobile Sets</div>
              </div>
              {canInstallPwa && (
                <span className="badge-dot" style={{ background: 'var(--status-green)' }}></span>
              )}
            </button>

            {/* Simulate Anomaly (Founder testing trigger) */}
            {isFounder && (
              <button 
                className="sidebar-action-btn anomaly"
                onClick={() => {
                  onSimulateSpoof();
                  setMobileMenuOpen(false);
                }}
                title="Test hardware spoof sentinel detection"
              >
                <AlertTriangle size={15} style={{ color: 'var(--status-amber)' }} />
                <div style={{ textAlign: 'left', flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '13px', lineHeight: 1.2 }}>Simulate Anomaly</div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>Security Sentinel Test</div>
                </div>
              </button>
            )}
          </div>

          {/* 6. CLOUD BACKEND STATUS FOOTER */}
          <div className="sidebar-footer">
            <div className="footer-status-pill">
              <Database size={13} style={{ color: isSupabaseConfigured ? 'var(--status-green)' : 'var(--muted)' }} />
              <span style={{ fontSize: '11px', color: 'var(--ink)' }}>
                {isSupabaseConfigured ? 'Supabase Cloud Linked' : 'Local Standalone Mode'}
              </span>
            </div>
            <div className="footer-copyright mono">
              INOVEX Sentinel v2.0 • 2026
            </div>
          </div>

        </div>
      </aside>
    </>
  );
}
