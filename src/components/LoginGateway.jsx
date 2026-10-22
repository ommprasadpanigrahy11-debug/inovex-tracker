import React, { useState } from 'react';
import { 
  Shield, 
  Key, 
  Lock, 
  ArrowRight, 
  Laptop, 
  Zap, 
  CheckCircle2, 
  AlertCircle, 
  UserPlus,
  LogIn,
  Cpu,
  Mail,
  User,
  Sparkles,
  Info
} from 'lucide-react';
import { registerUser, loginUser, generateMacAddress } from '../lib/dataService';

export function LoginGateway({ users = [], onLogin }) {
  const [authMode, setAuthMode] = useState(users.length === 0 ? 'register' : 'signin');
  const [selectedRole, setSelectedRole] = useState(users.length === 0 ? 'founder' : 'employee');
  
  // Sign-in state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Register state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regSkillSet, setRegSkillSet] = useState('');
  const [regMac, setRegMac] = useState(generateMacAddress());
  const [regPassword, setRegPassword] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [authStep, setAuthStep] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const roleUsers = users.filter(u => u.role === selectedRole);

  // AUTHENTICATE NODE
  const handleSignInSubmit = async (e) => {
    if (e) e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();

    if (!trimmedEmail) {
      setErrorMsg('Please enter your authorized node email address.');
      return;
    }
    if (!trimmedPassword) {
      setErrorMsg('Please enter your account password.');
      return;
    }

    setIsLoading(true);
    setAuthStep('Verifying credentials against security registry...');

    try {
      const authRes = await loginUser({ email: trimmedEmail, password: trimmedPassword });

      if (!authRes || !authRes.success || !authRes.user) {
        setIsLoading(false);
        setAuthStep('');
        setErrorMsg(authRes?.error || 'Access Denied: Invalid email or password.');
        return;
      }

      setAuthStep(`Binding authorized node: ${authRes.user.name}...`);
      setTimeout(() => {
        setIsLoading(false);
        setAuthStep('');
        onLogin(authRes.user);
      }, 300);

    } catch (err) {
      setIsLoading(false);
      setAuthStep('');
      setErrorMsg(err?.message || 'Authentication server unreachable. Please verify server status.');
    }
  };

  const handleSelectQuickNode = (user) => {
    setEmail(user.email || '');
    setPassword('');
    setErrorMsg('');
    setSuccessMsg(`Selected node: ${user.name}. Please enter your password to sign in.`);
    const passInput = document.getElementById('login-password-input');
    if (passInput) passInput.focus();
  };

  // REGISTER NEW NODE
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const name = regName.trim();
    const cleanEmail = regEmail.trim().toLowerCase();
    const skillSet = regSkillSet.trim();
    const pass = regPassword.trim();
    const mac = regMac.trim() || generateMacAddress();

    if (!name) {
      setErrorMsg('Please enter your full name.');
      return;
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    if (!skillSet) {
      setErrorMsg('Please enter your skill set or specialization.');
      return;
    }
    if (!pass) {
      setErrorMsg('Please create a secure password for this node.');
      return;
    }
    if (pass.length < 4) {
      setErrorMsg('Password must be at least 4 characters long.');
      return;
    }

    setIsLoading(true);
    setAuthStep('Registering node in verified security registry...');

    try {
      const res = await registerUser({
        name,
        email: cleanEmail,
        password: pass,
        role: selectedRole,
        skill_set: skillSet,
        device_mac_address: mac
      });

      if (res && res.success && res.user) {
        setAuthStep(`Node registered for ${res.user.name}. Initializing workspace...`);
        setTimeout(() => {
          setIsLoading(false);
          setAuthStep('');
          onLogin(res.user);
        }, 350);
      } else {
        throw new Error('Registration could not be completed.');
      }
    } catch (err) {
      setIsLoading(false);
      setAuthStep('');
      setErrorMsg(err?.message || 'Could not register node. Please retry.');
    }
  };

  return (
    <div className="login-gateway-wrapper">
      <div className="login-gateway-container">
        
        {/* Brand Header */}
        <div className="login-brand-header">
          <div className="inovex-wordmark" style={{ fontSize: '32px', justifyContent: 'center' }}>
            INOVEX<span className="leaf">.</span>
          </div>
          <span className="inovex-version-tag" style={{ marginTop: '4px', alignSelf: 'center' }}>
            Operations Sentinel v2.0
          </span>
          <p className="login-subtitle">
            Enterprise Operations Sentinel & Zero-Latency Telemetry Enclave
          </p>
        </div>

        {/* Login Card */}
        <div className="login-card demo-shell">

          {/* Mode Switcher: Sign In vs Register */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', background: 'var(--bg)', padding: '4px', borderRadius: '8px', border: '1px solid var(--line)', marginBottom: '16px' }}>
            <button
              type="button"
              className={`login-role-tab ${authMode === 'signin' ? 'active' : ''}`}
              onClick={() => {
                setAuthMode('signin');
                setErrorMsg('');
                setSuccessMsg('');
              }}
              style={{ padding: '8px 12px' }}
              id="tab-mode-signin"
            >
              <LogIn size={13} />
              <span>Authenticate Node</span>
            </button>
            <button
              type="button"
              className={`login-role-tab ${authMode === 'register' ? 'active' : ''}`}
              onClick={() => {
                setAuthMode('register');
                setErrorMsg('');
                setSuccessMsg('');
              }}
              style={{ padding: '8px 12px' }}
              id="tab-mode-register"
            >
              <UserPlus size={13} />
              <span>Register New Node</span>
            </button>
          </div>

          {/* Initial Setup Banner if Zero Users */}
          {users.length === 0 && authMode === 'register' && (
            <div style={{ background: 'var(--accent-tint-2)', border: '1px solid rgba(95, 115, 72, 0.3)', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Shield size={16} style={{ color: 'var(--accent-strong)', flexShrink: 0 }} />
              <div style={{ fontSize: '12px', color: 'var(--ink)' }}>
                <strong>System Initial Setup:</strong> No accounts exist yet. Register your initial Founder account below to initialize the operational enclave.
              </div>
            </div>
          )}
          
          {/* Role Segmented Controller */}
          <div className="login-role-selector">
            <button
              type="button"
              className={`login-role-tab ${selectedRole === 'founder' ? 'active' : ''}`}
              onClick={() => {
                setSelectedRole('founder');
                setErrorMsg('');
                setSuccessMsg('');
              }}
              id="role-tab-founder"
            >
              <Shield size={14} />
              <span>Executive Founder</span>
            </button>
            <button
              type="button"
              className={`login-role-tab ${selectedRole === 'employee' ? 'active' : ''}`}
              onClick={() => {
                setSelectedRole('employee');
                setErrorMsg('');
                setSuccessMsg('');
              }}
              id="role-tab-employee"
            >
              <Laptop size={14} />
              <span>Engineering Operator</span>
            </button>
          </div>

          {/* SIGN IN FORM */}
          {authMode === 'signin' ? (
            <form onSubmit={handleSignInSubmit} className="login-form">
              <div className="login-input-group">
                <label className="login-label" htmlFor="login-email-input">
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Mail size={12} style={{ color: 'var(--accent)' }} />
                    <span>Authorized Email</span>
                  </span>
                </label>
                <input
                  type="email"
                  id="login-email-input"
                  className="dispatch-textarea"
                  style={{ height: '42px', padding: '10px 14px', resize: 'none' }}
                  placeholder={selectedRole === 'founder' ? 'sarah.vance@lexven.com' : 'alex.mercer@lexven.com'}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  autoComplete="email"
                  required
                />
              </div>

              <div className="login-input-group">
                <label className="login-label" htmlFor="login-password-input">
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Lock size={12} style={{ color: 'var(--accent)' }} />
                    <span>Account Password</span>
                  </span>
                </label>
                <input
                  type="password"
                  id="login-password-input"
                  className="dispatch-textarea"
                  style={{ height: '42px', padding: '10px 14px', resize: 'none' }}
                  placeholder="Enter your security password..."
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  autoComplete="current-password"
                  required
                />
              </div>

              {/* Success Notification Pill */}
              {successMsg && (
                <div style={{ background: 'var(--status-green-bg)', border: '1px solid rgba(62, 138, 94, 0.35)', color: 'var(--status-green)', borderRadius: '6px', padding: '8px 12px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle2 size={13} />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* Error Message Pill */}
              {errorMsg && (
                <div className="login-error-pill" id="login-error-pill">
                  <AlertCircle size={14} />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Primary Submit Button */}
              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', padding: '12px 18px', fontSize: '14px', marginTop: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                disabled={isLoading}
                id="btn-login-submit"
              >
                {isLoading ? (
                  <>
                    <Zap size={15} style={{ animation: 'spin 1s linear infinite' }} />
                    <span>{authStep || 'Authenticating Node...'}</span>
                  </>
                ) : (
                  <>
                    <Key size={16} />
                    <span>Authenticate to {selectedRole === 'founder' ? 'Founder Dashboard' : 'Employee Workspace'}</span>
                    <ArrowRight size={15} />
                  </>
                )}
              </button>
            </form>
          ) : (
            /* REGISTER NEW NODE FORM */
            <form onSubmit={handleRegisterSubmit} className="login-form">
              <div className="login-input-group">
                <label className="login-label" htmlFor="reg-name-input">
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <User size={12} style={{ color: 'var(--accent)' }} />
                    <span>Full Name</span>
                  </span>
                  <span className="mono" style={{ fontSize: '10px', color: 'var(--muted)' }}>
                    Operator Identity
                  </span>
                </label>
                <input
                  type="text"
                  id="reg-name-input"
                  required
                  className="dispatch-textarea"
                  style={{ height: '42px', padding: '10px 14px', resize: 'none' }}
                  placeholder={selectedRole === 'founder' ? 'e.g. Dr. Alan Vance' : 'e.g. Marcus Brody'}
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  disabled={isLoading}
                />
              </div>

              <div className="login-input-group">
                <label className="login-label" htmlFor="reg-email-input">
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Mail size={12} style={{ color: 'var(--accent)' }} />
                    <span>Email Address</span>
                  </span>
                </label>
                <input
                  type="email"
                  id="reg-email-input"
                  required
                  className="dispatch-textarea"
                  style={{ height: '42px', padding: '10px 14px', resize: 'none' }}
                  placeholder="operator@lexven.com"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  disabled={isLoading}
                  autoComplete="email"
                />
              </div>

              <div className="login-input-group">
                <label className="login-label" htmlFor="reg-skillset-input">
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Sparkles size={12} style={{ color: 'var(--accent)' }} />
                    <span>Skill Set / Specialization</span>
                  </span>
                  <span className="mono" style={{ fontSize: '10px', color: 'var(--accent-strong)' }}>
                    Displayed on Grid
                  </span>
                </label>
                <input
                  type="text"
                  id="reg-skillset-input"
                  required
                  className="dispatch-textarea"
                  style={{ height: '42px', padding: '10px 14px', resize: 'none' }}
                  placeholder="e.g. Agentic Eng, Cloud Pipelines, Telemetry Architecture"
                  value={regSkillSet}
                  onChange={(e) => setRegSkillSet(e.target.value)}
                  disabled={isLoading}
                />
              </div>

              <div className="login-input-group">
                <label className="login-label" htmlFor="reg-password-input">
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Lock size={12} style={{ color: 'var(--accent)' }} />
                    <span>Security Password</span>
                  </span>
                </label>
                <input
                  type="password"
                  id="reg-password-input"
                  required
                  className="dispatch-textarea"
                  style={{ height: '42px', padding: '10px 14px', resize: 'none' }}
                  placeholder="Create secure account password (min. 4 chars)..."
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  disabled={isLoading}
                  autoComplete="new-password"
                />
              </div>

              <div className="login-input-group">
                <label className="login-label" htmlFor="reg-mac-input">
                  <span>Hardware MAC Signature</span>
                  <span className="mono" style={{ fontSize: '10px', color: 'var(--muted)' }}>
                    Device Binding
                  </span>
                </label>
                <input
                  type="text"
                  id="reg-mac-input"
                  className="dispatch-textarea mono"
                  style={{ height: '38px', padding: '8px 12px', resize: 'none', fontSize: '12px' }}
                  value={regMac}
                  onChange={(e) => setRegMac(e.target.value)}
                  disabled={isLoading}
                />
              </div>

              {/* Error Message */}
              {errorMsg && (
                <div className="login-error-pill" id="reg-error-pill">
                  <AlertCircle size={14} />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Register Submit Button */}
              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', padding: '12px 18px', fontSize: '14px', marginTop: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                disabled={isLoading}
                id="btn-register-submit"
              >
                {isLoading ? (
                  <>
                    <Zap size={15} style={{ animation: 'spin 1s linear infinite' }} />
                    <span>{authStep || 'Registering Node...'}</span>
                  </>
                ) : (
                  <>
                    <UserPlus size={15} />
                    <span>Register Node & Sign In</span>
                    <ArrowRight size={15} />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Quick Access Pre-Authorized Node Directory */}
          {users.length > 0 && authMode === 'signin' && (
            <div className="login-quick-section">
              <div className="section-kicker" style={{ marginBottom: '10px', fontSize: '10px', padding: '3px 10px' }}>
                Quick Node Directory ({selectedRole === 'founder' ? 'Founders' : 'Engineers'})
              </div>
              
              {roleUsers.length === 0 ? (
                <div style={{ textAlign: 'center', fontSize: '12px', color: 'var(--muted)', padding: '12px' }}>
                  No {selectedRole === 'founder' ? 'founder' : 'engineering'} nodes registered yet.
                </div>
              ) : (
                <div className="quick-nodes-grid">
                  {roleUsers.map(user => (
                    <button
                      key={user.id}
                      type="button"
                      className="quick-node-card"
                      onClick={() => handleSelectQuickNode(user)}
                      disabled={isLoading}
                      title={`Select ${user.name} (${user.email})`}
                      aria-label={`Select ${user.name}`}
                    >
                      <div className="quick-node-avatar">
                        {user.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div className="quick-node-info">
                        <div className="quick-node-name">
                          {user.name} {user.skill_set ? `(${user.skill_set})` : ''}
                        </div>
                        <div className="quick-node-mac mono" style={{ fontSize: '10px', color: 'var(--accent-strong)' }}>
                          {user.email}
                        </div>
                      </div>
                      <ArrowRight size={14} className="quick-node-arr" style={{ color: 'var(--accent)' }} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Enclave Security Footer */}
          <div className="login-footer-security">
            <Cpu size={12} style={{ color: 'var(--accent)' }} />
            <span className="mono">
              Strict Salted Scrypt Authentication • Server-Validated Tokens • Zero-Trust Enclave
            </span>
          </div>

        </div>

      </div>
    </div>
  );
}

export default LoginGateway;
