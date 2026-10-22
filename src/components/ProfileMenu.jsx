import React, { useState, useEffect, useRef } from 'react';
import { 
  User, 
  Settings, 
  Bell, 
  HelpCircle, 
  LogOut, 
  ShieldCheck, 
  Cpu, 
  X,
  AlertTriangle
} from 'lucide-react';
import { ProfileAvatar } from './ProfileAvatar';

export function ProfileMenu({ 
  currentUser, 
  onNavigate, 
  onLogout,
  align = 'right' 
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);

  const isFounder = currentUser?.role === 'founder';
  const roleLabel = isFounder ? 'Executive Founder' : 'Engineering Operator';

  // Close on Click Outside or Escape Key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target) && !triggerRef.current?.contains(e.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  const handleAction = (tabKey, sectionKey) => {
    setIsOpen(false);
    if (onNavigate) {
      onNavigate(tabKey, sectionKey);
    }
  };

  const handleTriggerLogout = () => {
    setIsOpen(false);
    setShowLogoutConfirm(true);
  };

  const handleConfirmLogout = () => {
    setShowLogoutConfirm(false);
    if (onLogout) onLogout();
  };

  return (
    <div className="profile-menu-wrapper" ref={menuRef}>
      {/* Avatar Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        className="profile-avatar-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label={`Open account menu for ${currentUser?.name || 'User'}`}
        title={`${currentUser?.name || 'User'} (${roleLabel})`}
      >
        <ProfileAvatar user={currentUser} size="sm" />
      </button>

      {/* Backdrop overlay for mobile screens */}
      {isOpen && (
        <div 
          className="profile-dropdown-backdrop" 
          onClick={() => setIsOpen(false)}
          aria-hidden="true" 
        />
      )}

      {/* Dropdown Menu Popover */}
      {isOpen && (
        <div 
          className="profile-dropdown-menu"
          style={align === 'left' ? { right: 'auto', left: 0 } : {}}
          role="menu"
          aria-orientation="vertical"
        >
          {/* Header Info */}
          <div className="profile-dropdown-header">
            <ProfileAvatar user={currentUser} size="md" />
            <div className="profile-dropdown-meta">
              <div className="profile-dropdown-name" title={currentUser?.name}>
                {currentUser?.name || 'Node Operator'}
              </div>
              <div className="profile-dropdown-email mono" title={currentUser?.email}>
                {currentUser?.email || 'unassigned@lexven.internal'}
              </div>
              <span className={`badge ${isFounder ? 'founder' : 'waiting'} profile-dropdown-role`}>
                <span className="badge-dot"></span>
                <span>{roleLabel}</span>
              </span>
            </div>
          </div>

          {/* Action List */}
          <div className="profile-dropdown-list">
            <button
              type="button"
              className="profile-dropdown-item"
              role="menuitem"
              onClick={() => handleAction('profile', 'overview')}
            >
              <User size={16} />
              <span>View Profile</span>
            </button>

            <button
              type="button"
              className="profile-dropdown-item"
              role="menuitem"
              onClick={() => handleAction('profile', 'settings')}
            >
              <Settings size={16} />
              <span>Account Settings</span>
            </button>

            <button
              type="button"
              className="profile-dropdown-item"
              role="menuitem"
              onClick={() => handleAction('profile', 'notifications')}
            >
              <Bell size={16} />
              <span>Notification Preferences</span>
            </button>

            <button
              type="button"
              className="profile-dropdown-item"
              role="menuitem"
              onClick={() => handleAction('profile', 'help')}
            >
              <HelpCircle size={16} />
              <span>Help & Support</span>
            </button>

            <div className="profile-dropdown-divider" role="separator" />

            <button
              type="button"
              className="profile-dropdown-item danger"
              role="menuitem"
              onClick={handleTriggerLogout}
            >
              <LogOut size={16} />
              <span>Log Out</span>
            </button>
          </div>
        </div>
      )}

      {/* Logout Confirmation Modal Dialog */}
      {showLogoutConfirm && (
        <div className="inovex-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="logout-title">
          <div className="inovex-modal-box">
            <div className="inovex-modal-header">
              <div className="inovex-modal-title" id="logout-title">
                <AlertTriangle size={18} style={{ color: 'var(--status-amber)' }} />
                <span>Disconnect Node & Sign Out?</span>
              </div>
              <button 
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '4px' }}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>

            <div className="inovex-modal-body">
              <p style={{ fontSize: '14px', color: 'var(--ink)' }}>
                Are you sure you want to log out of <strong>{currentUser?.name}</strong>?
              </p>
              <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.5, background: 'var(--bg)', padding: '12px', borderRadius: '8px', border: '1px solid var(--line)' }}>
                Your current session token will be revoked on the server, local telemetry queues will be synchronized, and WebSocket channels will be gracefully disconnected.
              </div>
            </div>

            <div className="inovex-modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowLogoutConfirm(false)}
                style={{ padding: '8px 16px', fontSize: '13px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                onClick={handleConfirmLogout}
                style={{ 
                  background: 'var(--status-red)', 
                  color: '#FFFFFF', 
                  border: 'none', 
                  padding: '8px 18px', 
                  fontSize: '13px',
                  fontWeight: 600,
                  borderRadius: '8px'
                }}
              >
                Confirm Log Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProfileMenu;
