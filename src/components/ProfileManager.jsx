import React, { useState, useEffect, useRef } from 'react';
import { 
  User, 
  Settings, 
  Bell, 
  HelpCircle, 
  ShieldAlert, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowLeft, 
  Camera, 
  Upload, 
  Save, 
  X, 
  Trash2, 
  Copy, 
  Download, 
  Moon, 
  Sun, 
  Monitor, 
  Lock, 
  Clock, 
  Globe, 
  Phone, 
  Briefcase, 
  Mail, 
  Layers, 
  Eye, 
  Activity, 
  Video, 
  LayoutGrid,
  Check,
  Terminal,
  Info
} from 'lucide-react';
import { ProfileAvatar } from './ProfileAvatar';
import { 
  updateUserProfile, 
  updateNotificationPreferences, 
  uploadAvatarPhoto, 
  deleteUserAccount,
  getAuthToken 
} from '../lib/dataService';
import { applyTheme, getSavedTheme } from '../lib/theme';

export function ProfileManager({ 
  currentUser, 
  onUpdateUser, 
  onLogout, 
  onNavigate,
  initialSection = 'overview'
}) {
  const [activeSection, setActiveSection] = useState(initialSection);
  const isFounder = currentUser?.role === 'founder';

  // Navigation listener for initialSection updates
  useEffect(() => {
    if (initialSection) setActiveSection(initialSection);
  }, [initialSection]);

  // Form State: Personal Details
  const [name, setName] = useState(currentUser?.name || '');
  const [skillSet, setSkillSet] = useState(currentUser?.skill_set || '');
  const [bio, setBio] = useState(currentUser?.bio || '');
  const [phone, setPhone] = useState(currentUser?.phone || '');
  const [timezone, setTimezone] = useState(currentUser?.timezone || 'UTC');
  const [language, setLanguage] = useState(currentUser?.language || 'en');
  const [timeFormat, setTimeFormat] = useState(currentUser?.time_format || '24h');
  const [avatarPreview, setAvatarPreview] = useState(currentUser?.avatar_url || '');

  // Form feedback state
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState({ type: '', text: '' });

  // Theme State
  const [currentTheme, setCurrentTheme] = useState(currentUser?.theme || getSavedTheme() || 'dark');

  // Notification Preferences State
  const defaultNotifPrefs = {
    in_app: true,
    task_assignments: true,
    task_deadlines: true,
    task_verifications: true,
    workspace_announcements: true,
    security_alerts: true,
    email_notifications: false
  };

  const [notifPrefs, setNotifPrefs] = useState(() => {
    return currentUser?.notification_preferences || defaultNotifPrefs;
  });
  const [isSavingNotifs, setIsSavingNotifs] = useState(false);

  // Danger Zone Modal State
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Diagnostic State (Help & Support)
  const [copiedDiag, setCopiedDiag] = useState(false);

  // Sync state if currentUser changes externally
  useEffect(() => {
    if (currentUser) {
      setName(currentUser.name || '');
      setSkillSet(currentUser.skill_set || '');
      setBio(currentUser.bio || '');
      setPhone(currentUser.phone || '');
      setTimezone(currentUser.timezone || 'UTC');
      setLanguage(currentUser.language || 'en');
      setTimeFormat(currentUser.time_format || '24h');
      setAvatarPreview(currentUser.avatar_url || '');
      if (currentUser.theme) setCurrentTheme(currentUser.theme);
      if (currentUser.notification_preferences) {
        setNotifPrefs(currentUser.notification_preferences);
      }
    }
  }, [currentUser]);

  // Handle Avatar File Upload
  const handleAvatarFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setStatusMessage({ type: 'error', text: 'Please upload an image file (PNG, JPG, or WEBP).' });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setStatusMessage({ type: 'error', text: 'Image file size must be less than 5MB.' });
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result;
      if (base64) {
        setAvatarPreview(base64);
        try {
          const res = await uploadAvatarPhoto(base64);
          if (res.success && res.avatar_url) {
            setAvatarPreview(res.avatar_url);
            if (onUpdateUser) {
              onUpdateUser({ ...currentUser, avatar_url: res.avatar_url });
            }
            setStatusMessage({ type: 'success', text: 'Profile picture uploaded and saved.' });
          }
        } catch (err) {
          setStatusMessage({ type: 'error', text: err.message || 'Avatar upload failed.' });
        }
      }
    };
    reader.readAsDataURL(file);
  };

  // Handle Profile Save
  const handleSaveProfile = async (e) => {
    if (e) e.preventDefault();
    setStatusMessage({ type: '', text: '' });

    const cleanName = name.trim();
    const cleanSkill = skillSet.trim();

    if (!cleanName) {
      setStatusMessage({ type: 'error', text: 'Full name cannot be empty.' });
      return;
    }
    if (!cleanSkill) {
      setStatusMessage({ type: 'error', text: 'Skill set or specialization is required.' });
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        name: cleanName,
        skill_set: cleanSkill,
        bio: bio.trim(),
        phone: phone.trim(),
        timezone,
        language,
        theme: currentTheme,
        time_format: timeFormat,
        avatar_url: avatarPreview || null
      };

      const res = await updateUserProfile(payload);
      if (res && res.success && res.user) {
        if (onUpdateUser) onUpdateUser(res.user);
        setStatusMessage({ type: 'success', text: 'Profile information successfully saved!' });
      } else {
        throw new Error('Server could not confirm profile update.');
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to update profile.' });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Theme Change
  const handleThemeChange = async (themeKey) => {
    setCurrentTheme(themeKey);
    applyTheme(themeKey);

    try {
      await updateUserProfile({
        name: currentUser.name,
        skill_set: currentUser.skill_set,
        theme: themeKey
      });
      if (onUpdateUser) onUpdateUser({ ...currentUser, theme: themeKey });
    } catch (e) {
      console.warn('Failed to persist theme to backend', e);
    }
  };

  // Handle Notification Toggle
  const handleToggleNotif = (key) => {
    if (key === 'email_notifications') return; // Channel disabled
    setNotifPrefs(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Save Notification Preferences
  const handleSaveNotifications = async () => {
    setIsSavingNotifs(true);
    setStatusMessage({ type: '', text: '' });
    try {
      const res = await updateNotificationPreferences(notifPrefs);
      if (res.success) {
        if (onUpdateUser) {
          onUpdateUser({
            ...currentUser,
            notification_preferences: res.notification_preferences
          });
        }
        setStatusMessage({ type: 'success', text: 'Notification preferences saved.' });
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to save notifications.' });
    } finally {
      setIsSavingNotifs(false);
    }
  };

  // Handle Account Deletion
  const handleDeleteAccountSubmit = async (e) => {
    if (e) e.preventDefault();
    setDeleteError('');

    if (deleteConfirmText.trim() !== 'DELETE') {
      setDeleteError('Please type "DELETE" exactly to confirm account deletion.');
      return;
    }
    if (!deletePassword.trim()) {
      setDeleteError('Please enter your account password to verify your identity.');
      return;
    }

    setIsDeleting(true);
    try {
      const res = await deleteUserAccount({ password: deletePassword });
      if (res && res.success) {
        setDeleteModalOpen(false);
        if (onLogout) onLogout();
      }
    } catch (err) {
      setDeleteError(err.message || 'Account deletion failed. Check your password.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Format Member Since date
  const memberSinceFormatted = (() => {
    if (currentUser?.created_at) {
      const date = new Date(Number(currentUser.created_at));
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      }
    }
    return 'Active Node';
  })();

  // Diagnostic Payload for Help & Support
  const diagnosticData = {
    application: 'INOVEX Operations Sentinel',
    version: '2.1.0',
    timestamp: new Date().toISOString(),
    nodeId: currentUser?.id,
    nodeName: currentUser?.name,
    role: currentUser?.role,
    hardwareMac: currentUser?.device_mac_address,
    theme: currentTheme,
    timezone,
    language,
    clientUserAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown'
  };

  const handleCopyDiagnostics = () => {
    try {
      navigator.clipboard.writeText(JSON.stringify(diagnosticData, null, 2));
      setCopiedDiag(true);
      setTimeout(() => setCopiedDiag(false), 2500);
    } catch (e) {
      console.warn('Failed to copy diagnostics', e);
    }
  };

  const handleDownloadDiagnostics = () => {
    try {
      const blob = new Blob([JSON.stringify(diagnosticData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inovex_diagnostics_${currentUser?.id || 'node'}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {}
  };

  return (
    <div className="profile-page-container">
      
      {/* Back Button / Top Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            if (onNavigate) {
              onNavigate(isFounder ? 'dashboard' : 'workspace');
            }
          }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px', fontSize: '13px' }}
        >
          <ArrowLeft size={14} />
          <span>Back to {isFounder ? 'Orchestration Grid' : 'Workspace'}</span>
        </button>

        <span className="mono" style={{ fontSize: '11px', color: 'var(--muted)' }}>
          SEC-ID: {currentUser?.id}
        </span>
      </div>

      {/* Global Status Message Toast */}
      {statusMessage.text && (
        <div 
          className={`inovex-toast`}
          style={{
            marginBottom: '16px',
            borderLeft: `4px solid ${statusMessage.type === 'error' ? 'var(--status-red)' : 'var(--status-green)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {statusMessage.type === 'error' ? (
              <AlertTriangle size={18} style={{ color: 'var(--status-red)', flexShrink: 0 }} />
            ) : (
              <CheckCircle2 size={18} style={{ color: 'var(--status-green)', flexShrink: 0 }} />
            )}
            <span style={{ fontSize: '13px', color: 'var(--ink)' }}>{statusMessage.text}</span>
          </div>
          <button 
            type="button"
            onClick={() => setStatusMessage({ type: '', text: '' })}
            style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '4px' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Hero Overview Card */}
      <header className="profile-hero-card">
        <div className="profile-hero-identity">
          {/* Avatar with Quick Upload Trigger */}
          <div style={{ position: 'relative' }}>
            <ProfileAvatar 
              user={{ ...currentUser, avatar_url: avatarPreview }} 
              size="lg" 
            />
            <label 
              htmlFor="avatar-upload-input" 
              title="Upload new profile picture"
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: '26px',
                height: '26px',
                borderRadius: '50%',
                background: 'var(--accent)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                border: '2px solid var(--card)'
              }}
            >
              <Camera size={13} />
              <input 
                id="avatar-upload-input"
                type="file" 
                accept="image/png, image/jpeg, image/webp" 
                style={{ display: 'none' }}
                onChange={handleAvatarFileChange}
              />
            </label>
          </div>

          {/* Profile Name & Metadata */}
          <div className="profile-hero-text">
            <h1 className="profile-hero-name">
              {currentUser?.name || 'Authorized Node'}
            </h1>
            <div className="profile-hero-sub">
              <span className={`badge ${isFounder ? 'founder' : 'waiting'}`} style={{ padding: '2px 9px', fontSize: '11px' }}>
                <span className="badge-dot"></span>
                <span>{isFounder ? 'Executive Founder' : 'Engineering Operator'}</span>
              </span>
              <span className="mono" style={{ fontSize: '12px' }}>{currentUser?.email}</span>
              <span>•</span>
              <span className="mono" style={{ fontSize: '11px', color: 'var(--muted-2)' }}>
                MAC: {currentUser?.device_mac_address}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Action Buttons */}
        <div className="profile-hero-actions">
          {activeSection !== 'edit' && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setActiveSection('edit')}
              style={{ gap: '6px', padding: '8px 16px', fontSize: '13px' }}
            >
              <User size={14} />
              <span>Edit Profile</span>
            </button>
          )}

          {isFounder ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => onNavigate && onNavigate('dashboard')}
              title="Jump to Founder Orchestration Grid"
              style={{ gap: '6px', padding: '8px 14px', fontSize: '13px' }}
            >
              <LayoutGrid size={14} style={{ color: 'var(--accent)' }} />
              <span>Orchestration Grid</span>
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => onNavigate && onNavigate('workspace')}
              title="Jump to Engineering Workspace"
              style={{ gap: '6px', padding: '8px 14px', fontSize: '13px' }}
            >
              <Clock size={14} style={{ color: 'var(--accent)' }} />
              <span>Sprint Workspace</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Grid: Left Navigation Rail & Right Content Panel */}
      <div className="profile-layout-grid">
        
        {/* Left Settings Navigation Rail */}
        <nav className="profile-nav-card" aria-label="Profile navigation">
          <button
            type="button"
            className={`profile-nav-btn ${activeSection === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveSection('overview')}
          >
            <User size={16} />
            <span>Profile Overview</span>
          </button>

          <button
            type="button"
            className={`profile-nav-btn ${activeSection === 'edit' ? 'active' : ''}`}
            onClick={() => setActiveSection('edit')}
          >
            <Briefcase size={16} />
            <span>Edit Profile</span>
          </button>

          <button
            type="button"
            className={`profile-nav-btn ${activeSection === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveSection('settings')}
          >
            <Settings size={16} />
            <span>Account Settings</span>
          </button>

          <button
            type="button"
            className={`profile-nav-btn ${activeSection === 'notifications' ? 'active' : ''}`}
            onClick={() => setActiveSection('notifications')}
          >
            <Bell size={16} />
            <span>Notifications</span>
          </button>

          <button
            type="button"
            className={`profile-nav-btn ${activeSection === 'help' ? 'active' : ''}`}
            onClick={() => setActiveSection('help')}
          >
            <HelpCircle size={16} />
            <span>Help & Support</span>
          </button>
        </nav>

        {/* Right Settings Content Area */}
        <main className="profile-content-area">

          {/* 1. OVERVIEW SECTION */}
          {activeSection === 'overview' && (
            <div className="settings-panel">
              <div className="settings-panel-header">
                <h2 className="settings-panel-title">Node Profile Overview</h2>
                <p className="settings-panel-desc">
                  Verified node identity and operational telemetry binding for Inovex Operations Sentinel.
                </p>
              </div>

              {/* Data Table / Attribute List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                  <div style={{ background: 'var(--bg)', padding: '14px', borderRadius: '10px', border: '1px solid var(--line)' }}>
                    <div className="mono" style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase' }}>Account Role</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)', marginTop: '4px' }}>
                      {isFounder ? 'Executive Founder' : 'Engineering Operator'}
                    </div>
                  </div>

                  <div style={{ background: 'var(--bg)', padding: '14px', borderRadius: '10px', border: '1px solid var(--line)' }}>
                    <div className="mono" style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase' }}>Specialization</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)', marginTop: '4px' }}>
                      {currentUser?.skill_set || 'General Engineering'}
                    </div>
                  </div>

                  <div style={{ background: 'var(--bg)', padding: '14px', borderRadius: '10px', border: '1px solid var(--line)' }}>
                    <div className="mono" style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase' }}>Node Status</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 600, color: 'var(--status-green)', marginTop: '4px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--status-green)' }}></span>
                      <span>Active Verified Node</span>
                    </div>
                  </div>

                  <div style={{ background: 'var(--bg)', padding: '14px', borderRadius: '10px', border: '1px solid var(--line)' }}>
                    <div className="mono" style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase' }}>Hardware Signature</div>
                    <div className="mono" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', marginTop: '4px' }}>
                      {currentUser?.device_mac_address}
                    </div>
                  </div>
                </div>

                {/* Additional Information */}
                <div style={{ background: 'var(--bg)', padding: '16px', borderRadius: '10px', border: '1px solid var(--line)', marginTop: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--ink)' }}>Bio & Responsibilities</span>
                    <button
                      type="button"
                      onClick={() => setActiveSection('edit')}
                      style={{ background: 'transparent', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                    >
                      Edit Bio
                    </button>
                  </div>
                  <p style={{ fontSize: '13px', color: currentUser?.bio ? 'var(--ink)' : 'var(--muted)', lineHeight: 1.5 }}>
                    {currentUser?.bio || 'No personal bio or role summary provided yet. Click Edit Profile to add one.'}
                  </p>
                </div>

                {/* Role Specific Shortcuts */}
                <div style={{ marginTop: '10px' }}>
                  <div className="section-kicker" style={{ marginBottom: '10px', fontSize: '11px' }}>
                    Operational Shortcuts
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                    {isFounder ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => onNavigate && onNavigate('dashboard')}
                          style={{ justifyContent: 'flex-start', padding: '10px 14px', fontSize: '13px', gap: '8px' }}
                        >
                          <LayoutGrid size={15} style={{ color: 'var(--accent)' }} />
                          <span>Orchestration Grid</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => onNavigate && onNavigate('audits')}
                          style={{ justifyContent: 'flex-start', padding: '10px 14px', fontSize: '13px', gap: '8px' }}
                        >
                          <Video size={15} style={{ color: 'var(--accent)' }} />
                          <span>Video Audits & AI</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => onNavigate && onNavigate('telemetry')}
                          style={{ justifyContent: 'flex-start', padding: '10px 14px', fontSize: '13px', gap: '8px' }}
                        >
                          <Activity size={15} style={{ color: 'var(--accent)' }} />
                          <span>Health Telemetry</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => onNavigate && onNavigate('workspace')}
                          style={{ justifyContent: 'flex-start', padding: '10px 14px', fontSize: '13px', gap: '8px' }}
                        >
                          <Clock size={15} style={{ color: 'var(--accent)' }} />
                          <span>Active Sprint Workspace</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => onNavigate && onNavigate('sentinel')}
                          style={{ justifyContent: 'flex-start', padding: '10px 14px', fontSize: '13px', gap: '8px' }}
                        >
                          <Layers size={15} style={{ color: 'var(--accent)' }} />
                          <span>Screen Sentinel Telemetry</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* 2. EDIT PROFILE SECTION */}
          {activeSection === 'edit' && (
            <div className="settings-panel">
              <div className="settings-panel-header">
                <h2 className="settings-panel-title">Edit Personal Profile</h2>
                <p className="settings-panel-desc">
                  Update your display name, specialization, contact information, and biography.
                </p>
              </div>

              <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="settings-form-grid">
                  {/* Full Name */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="edit-name">
                      <span>Full Display Name</span>
                      <span className="mono" style={{ fontSize: '10px', color: 'var(--status-red)' }}>*Required</span>
                    </label>
                    <input
                      id="edit-name"
                      type="text"
                      className="form-input"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Sarah Vance"
                      required
                      disabled={isSaving}
                    />
                  </div>

                  {/* Skill set / specialization */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="edit-skill">
                      <span>Skill Set / Specialization</span>
                      <span className="mono" style={{ fontSize: '10px', color: 'var(--status-red)' }}>*Required</span>
                    </label>
                    <input
                      id="edit-skill"
                      type="text"
                      className="form-input"
                      value={skillSet}
                      onChange={(e) => setSkillSet(e.target.value)}
                      placeholder="e.g. Agentic Eng / Model Ops"
                      required
                      disabled={isSaving}
                    />
                  </div>
                </div>

                <div className="settings-form-grid">
                  {/* Phone */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="edit-phone">
                      <span>Phone Number</span>
                      <span className="mono" style={{ fontSize: '10px', color: 'var(--muted)' }}>Optional</span>
                    </label>
                    <input
                      id="edit-phone"
                      type="tel"
                      className="form-input"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+1 (555) 019-2834"
                      disabled={isSaving}
                    />
                  </div>

                  {/* Role (Read Only) */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="edit-role">
                      <span>Account Role</span>
                      <span className="mono" style={{ fontSize: '10px', color: 'var(--muted)' }}>Enforced</span>
                    </label>
                    <input
                      id="edit-role"
                      type="text"
                      className="form-input"
                      value={isFounder ? 'Executive Founder (God-Mode)' : 'Engineering Operator (Scoped)'}
                      disabled
                    />
                    <span className="form-hint">
                      Role elevation is protected by Inovex Governance and cannot be altered by operators.
                    </span>
                  </div>
                </div>

                {/* Bio */}
                <div className="form-group">
                  <label className="form-label" htmlFor="edit-bio">
                    <span>Professional Bio / Role Responsibilities</span>
                    <span className="mono" style={{ fontSize: '10px', color: 'var(--muted)' }}>Max 500 chars</span>
                  </label>
                  <textarea
                    id="edit-bio"
                    className="form-textarea"
                    value={bio}
                    onChange={(e) => setBio(e.target.value.substring(0, 500))}
                    placeholder="Briefly describe your responsibilities, team focus, and operational scope..."
                    disabled={isSaving}
                  />
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setActiveSection('overview')}
                    disabled={isSaving}
                    style={{ padding: '8px 18px', fontSize: '13px' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={isSaving}
                    style={{ padding: '8px 22px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Save size={14} />
                    <span>{isSaving ? 'Saving Changes...' : 'Save Changes'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* 3. ACCOUNT SETTINGS SECTION */}
          {activeSection === 'settings' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Appearance */}
              <div className="settings-panel">
                <div className="settings-panel-header">
                  <h2 className="settings-panel-title">Appearance & Theme</h2>
                  <p className="settings-panel-desc">
                    Customize the visual interface. Changes are applied immediately and synchronized across devices.
                  </p>
                </div>

                <div className="theme-selector-grid">
                  <button
                    type="button"
                    className={`theme-card-option ${currentTheme === 'dark' ? 'active' : ''}`}
                    onClick={() => handleThemeChange('dark')}
                  >
                    <Moon size={22} style={{ color: currentTheme === 'dark' ? 'var(--accent)' : 'var(--muted)' }} />
                    <span style={{ fontSize: '13px' }}>Dark Theme</span>
                    {currentTheme === 'dark' && <Check size={14} style={{ color: 'var(--accent)' }} />}
                  </button>

                  <button
                    type="button"
                    className={`theme-card-option ${currentTheme === 'light' ? 'active' : ''}`}
                    onClick={() => handleThemeChange('light')}
                  >
                    <Sun size={22} style={{ color: currentTheme === 'light' ? 'var(--accent)' : 'var(--muted)' }} />
                    <span style={{ fontSize: '13px' }}>Light Theme</span>
                    {currentTheme === 'light' && <Check size={14} style={{ color: 'var(--accent)' }} />}
                  </button>

                  <button
                    type="button"
                    className={`theme-card-option ${currentTheme === 'system' ? 'active' : ''}`}
                    onClick={() => handleThemeChange('system')}
                  >
                    <Monitor size={22} style={{ color: currentTheme === 'system' ? 'var(--accent)' : 'var(--muted)' }} />
                    <span style={{ fontSize: '13px' }}>System Default</span>
                    {currentTheme === 'system' && <Check size={14} style={{ color: 'var(--accent)' }} />}
                  </button>
                </div>
              </div>

              {/* Preferences */}
              <div className="settings-panel">
                <div className="settings-panel-header">
                  <h2 className="settings-panel-title">Regional & Time Preferences</h2>
                  <p className="settings-panel-desc">
                    Control how timestamps, deadlines, and dates are presented across sprint checkpoints.
                  </p>
                </div>

                <div className="settings-form-grid">
                  {/* Timezone */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="settings-tz">
                      <span>Time Zone</span>
                    </label>
                    <select
                      id="settings-tz"
                      className="form-select"
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                    >
                      <option value="UTC">UTC (Universal Coordinated Time)</option>
                      <option value="America/New_York">Eastern Time (US & Canada)</option>
                      <option value="America/Chicago">Central Time (US & Canada)</option>
                      <option value="America/Los_Angeles">Pacific Time (US & Canada)</option>
                      <option value="Europe/London">London (GMT / BST)</option>
                      <option value="Europe/Berlin">Central European Time (Berlin, Paris)</option>
                      <option value="Asia/Kolkata">India Standard Time (IST)</option>
                      <option value="Asia/Tokyo">Japan Standard Time (JST)</option>
                      <option value="Australia/Sydney">Sydney Time (AEST)</option>
                    </select>
                  </div>

                  {/* Language */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="settings-lang">
                      <span>Interface Language</span>
                    </label>
                    <select
                      id="settings-lang"
                      className="form-select"
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                    >
                      <option value="en">English (US)</option>
                      <option value="es">Español (Spanish)</option>
                      <option value="de">Deutsch (German)</option>
                      <option value="fr">Français (French)</option>
                      <option value="ja">日本語 (Japanese)</option>
                    </select>
                  </div>

                  {/* Time format */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="settings-tf">
                      <span>Time Display Format</span>
                    </label>
                    <select
                      id="settings-tf"
                      className="form-select"
                      value={timeFormat}
                      onChange={(e) => setTimeFormat(e.target.value)}
                    >
                      <option value="24h">24-Hour Military Format (14:30:00)</option>
                      <option value="12h">12-Hour AM/PM Format (2:30:00 PM)</option>
                    </select>
                  </div>
                </div>

                <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleSaveProfile}
                    disabled={isSaving}
                    style={{ padding: '8px 18px', fontSize: '13px' }}
                  >
                    <span>{isSaving ? 'Saving...' : 'Save Preferences'}</span>
                  </button>
                </div>
              </div>

              {/* Privacy Policy Disclosure */}
              <div className="settings-panel">
                <div className="settings-panel-header">
                  <h2 className="settings-panel-title">Enterprise Privacy & Visibility Disclosure</h2>
                  <p className="settings-panel-desc">
                    Inovex operates on zero-trust verified telemetry principles. Here is how your data is distributed:
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', color: 'var(--muted)', lineHeight: 1.5 }}>
                  <div style={{ padding: '12px', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--line)' }}>
                    <strong style={{ color: 'var(--ink)' }}>Visible to Executive Founders:</strong>
                    <p style={{ marginTop: '3px' }}>
                      Full telemetry streams (active window title, keystroke cadence/rate, hardware MAC address), 30-minute screen recording audits, proof-of-work submissions, and AI health scores.
                    </p>
                  </div>

                  <div style={{ padding: '12px', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--line)' }}>
                    <strong style={{ color: 'var(--ink)' }}>Visible to Fellow Operators:</strong>
                    <p style={{ marginTop: '3px' }}>
                      Full name, public specialization badge, and current online status. Screen captures and raw telemetry logs are strictly isolated and never accessible to peer operators.
                    </p>
                  </div>
                </div>
              </div>

              {/* DANGER ZONE: Account Deletion */}
              <div className="danger-zone-panel">
                <div className="danger-zone-header">
                  <ShieldAlert size={18} />
                  <span>Danger Zone: Permanent Account Deletion</span>
                </div>
                <p style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.5, marginBottom: '16px' }}>
                  Deleting your account will permanently revoke your cryptographic sessions, remove your identity from the node roster, and terminate your access to Inovex Operations Sentinel. In accordance with enterprise audit compliance, historical task verifications and security logs are safely retained without personal credentials.
                </p>

                <button
                  type="button"
                  onClick={() => {
                    setDeleteModalOpen(true);
                    setDeleteConfirmText('');
                    setDeletePassword('');
                    setDeleteError('');
                  }}
                  style={{
                    background: 'var(--status-red)',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '9px 18px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Trash2 size={14} />
                  <span>Delete Account</span>
                </button>
              </div>

            </div>
          )}

          {/* 4. NOTIFICATION PREFERENCES SECTION */}
          {activeSection === 'notifications' && (
            <div className="settings-panel">
              <div className="settings-panel-header">
                <h2 className="settings-panel-title">Notification Preferences</h2>
                <p className="settings-panel-desc">
                  Choose which alerts and telemetry updates trigger in-app sentinel notifications.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {/* In-App Notifications */}
                <div className="notif-row">
                  <div className="notif-meta">
                    <div className="notif-title">In-App Live Alerts</div>
                    <div className="notif-desc">Show real-time toast alerts and banner updates while the application is active.</div>
                  </div>
                  <label className="toggle-switch">
                    <input 
                      type="checkbox" 
                      checked={notifPrefs.in_app} 
                      onChange={() => handleToggleNotif('in_app')} 
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                {/* Task Assignments */}
                <div className="notif-row">
                  <div className="notif-meta">
                    <div className="notif-title">Task Assignments & Dispatches</div>
                    <div className="notif-desc">Notify when a new micro-sprint task is assigned to this node by autonomous AI or founders.</div>
                  </div>
                  <label className="toggle-switch">
                    <input 
                      type="checkbox" 
                      checked={notifPrefs.task_assignments} 
                      onChange={() => handleToggleNotif('task_assignments')} 
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                {/* Task Deadlines */}
                <div className="notif-row">
                  <div className="notif-meta">
                    <div className="notif-title">Sprint Deadlines & Checkpoints</div>
                    <div className="notif-desc">Warn when a 30-minute sprint burst timer is approaching expiration.</div>
                  </div>
                  <label className="toggle-switch">
                    <input 
                      type="checkbox" 
                      checked={notifPrefs.task_deadlines} 
                      onChange={() => handleToggleNotif('task_deadlines')} 
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                {/* Task Verifications */}
                <div className="notif-row">
                  <div className="notif-meta">
                    <div className="notif-title">Proof-of-Work Verifications</div>
                    <div className="notif-desc">Alert when your submitted proof of work has been reviewed or verified by a founder node.</div>
                  </div>
                  <label className="toggle-switch">
                    <input 
                      type="checkbox" 
                      checked={notifPrefs.task_verifications} 
                      onChange={() => handleToggleNotif('task_verifications')} 
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                {/* Security Alerts */}
                <div className="notif-row">
                  <div className="notif-meta">
                    <div className="notif-title">Security Sentinel Alerts</div>
                    <div className="notif-desc">Urgent alerts for hardware spoofing, synthetic macro runner detection, and input entropy flags.</div>
                  </div>
                  <label className="toggle-switch">
                    <input 
                      type="checkbox" 
                      checked={notifPrefs.security_alerts} 
                      onChange={() => handleToggleNotif('security_alerts')} 
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                {/* Workspace Announcements */}
                <div className="notif-row">
                  <div className="notif-meta">
                    <div className="notif-title">Workspace Announcements</div>
                    <div className="notif-desc">Broadcasts from leadership regarding infrastructure maintenance and releases.</div>
                  </div>
                  <label className="toggle-switch">
                    <input 
                      type="checkbox" 
                      checked={notifPrefs.workspace_announcements} 
                      onChange={() => handleToggleNotif('workspace_announcements')} 
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>

                {/* Email Notifications (Honest Channel Notice) */}
                <div className="notif-row" style={{ opacity: 0.65 }}>
                  <div className="notif-meta">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="notif-title">Email Notifications</span>
                      <span className="badge waiting" style={{ fontSize: '9px', padding: '1px 6px' }}>SMTP Unconfigured</span>
                    </div>
                    <div className="notif-desc">Email dispatch is currently disabled until an enterprise SMTP mail gateway is provisioned.</div>
                  </div>
                  <label className="toggle-switch">
                    <input type="checkbox" checked={false} disabled />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>

              <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSaveNotifications}
                  disabled={isSavingNotifs}
                  style={{ padding: '8px 20px', fontSize: '13px' }}
                >
                  <span>{isSavingNotifs ? 'Saving...' : 'Save Notification Preferences'}</span>
                </button>
              </div>
            </div>
          )}

          {/* 5. HELP & SUPPORT SECTION */}
          {activeSection === 'help' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="settings-panel">
                <div className="settings-panel-header">
                  <h2 className="settings-panel-title">Help & Support Guide</h2>
                  <p className="settings-panel-desc">
                    Operational handbook and troubleshooting protocols for Inovex Operations Sentinel v2.1.0.
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '13px', lineHeight: 1.5 }}>
                  <div style={{ background: 'var(--bg)', padding: '14px', borderRadius: '10px', border: '1px solid var(--line)' }}>
                    <div style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: '4px' }}>
                      1. How does the 30-Minute Sprint Checkpoint work?
                    </div>
                    <p style={{ color: 'var(--muted)' }}>
                      Each sprint burst runs for exactly 1,800 seconds (30 minutes). During an active sprint, periodic zero-latency telemetry packets verify IDE activity and keystroke cadence. Once complete, attach your proof of work (git commit or PR link) and submit for founder verification.
                    </p>
                  </div>

                  <div style={{ background: 'var(--bg)', padding: '14px', borderRadius: '10px', border: '1px solid var(--line)' }}>
                    <div style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: '4px' }}>
                      2. Hardware Anomaly & Macro Detection
                    </div>
                    <p style={{ color: 'var(--muted)' }}>
                      The Security Sentinel analyzes input entropy to detect artificial macro runners and hardware spoofers. Ensure your native physical input devices are connected directly to your workstation.
                    </p>
                  </div>

                  <div style={{ background: 'var(--bg)', padding: '14px', borderRadius: '10px', border: '1px solid var(--line)' }}>
                    <div style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: '4px' }}>
                      3. Switching Accounts & Disconnecting
                    </div>
                    <p style={{ color: 'var(--muted)' }}>
                      Click on your avatar in the navigation bar to access Log Out. This will revoke your session token on the server and return you to the Login Gateway.
                    </p>
                  </div>
                </div>
              </div>

              {/* Diagnostic Information */}
              <div className="settings-panel">
                <div className="settings-panel-header">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h2 className="settings-panel-title">Node Diagnostics & System Info</h2>
                    <span className="mono" style={{ fontSize: '11px', color: 'var(--accent)' }}>v2.1.0 Core</span>
                  </div>
                  <p className="settings-panel-desc">
                    Copy or export diagnostic telemetry when filing an issue with your workspace administrator.
                  </p>
                </div>

                <pre 
                  className="mono" 
                  style={{ 
                    background: 'var(--bg)', 
                    padding: '14px', 
                    borderRadius: '8px', 
                    border: '1px solid var(--line)', 
                    fontSize: '11px', 
                    color: 'var(--ink)',
                    overflowX: 'auto',
                    maxHeight: '160px'
                  }}
                >
                  {JSON.stringify(diagnosticData, null, 2)}
                </pre>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleCopyDiagnostics}
                    style={{ gap: '6px', fontSize: '12px', padding: '6px 14px' }}
                  >
                    <Copy size={13} />
                    <span>{copiedDiag ? 'Copied to Clipboard!' : 'Copy Diagnostics'}</span>
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleDownloadDiagnostics}
                    style={{ gap: '6px', fontSize: '12px', padding: '6px 14px' }}
                  >
                    <Download size={13} />
                    <span>Download JSON Report</span>
                  </button>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* Account Deletion Confirmation Modal Dialog */}
      {deleteModalOpen && (
        <div className="inovex-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title">
          <div className="inovex-modal-box">
            <div className="inovex-modal-header">
              <div className="inovex-modal-title" id="delete-dialog-title" style={{ color: 'var(--status-red)' }}>
                <AlertTriangle size={18} />
                <span>Confirm Permanent Account Deletion</span>
              </div>
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                disabled={isDeleting}
                style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '4px' }}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleDeleteAccountSubmit}>
              <div className="inovex-modal-body">
                <p style={{ fontSize: '13px', color: 'var(--ink)', lineHeight: 1.5 }}>
                  This action is <strong>irreversible</strong>. Your node credentials and sessions will be deleted immediately.
                </p>

                {deleteError && (
                  <div style={{ background: 'var(--status-red-bg)', border: '1px solid var(--status-red)', borderRadius: '8px', padding: '10px', fontSize: '12px', color: 'var(--status-red)' }}>
                    {deleteError}
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label" htmlFor="delete-confirm-input">
                    <span>Type <strong style={{ color: 'var(--status-red)' }}>DELETE</strong> to confirm</span>
                  </label>
                  <input
                    id="delete-confirm-input"
                    type="text"
                    className="form-input"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="Type DELETE"
                    required
                    disabled={isDeleting}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="delete-pass-input">
                    <span>Account Password Verification</span>
                  </label>
                  <input
                    id="delete-pass-input"
                    type="password"
                    className="form-input"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder="Enter your current password"
                    required
                    disabled={isDeleting}
                  />
                </div>
              </div>

              <div className="inovex-modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setDeleteModalOpen(false)}
                  disabled={isDeleting}
                  style={{ padding: '8px 16px', fontSize: '13px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn"
                  disabled={isDeleting || deleteConfirmText.trim() !== 'DELETE'}
                  style={{
                    background: deleteConfirmText.trim() === 'DELETE' ? 'var(--status-red)' : 'var(--muted)',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '8px 18px',
                    fontSize: '13px',
                    fontWeight: 600,
                    borderRadius: '8px',
                    cursor: deleteConfirmText.trim() === 'DELETE' ? 'pointer' : 'not-allowed'
                  }}
                >
                  {isDeleting ? 'Deleting...' : 'Permanently Delete'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

export default ProfileManager;
