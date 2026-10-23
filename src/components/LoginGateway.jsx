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
  Info,
  Eye,
  EyeOff,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Hash,
  Check,
  Sun,
  Moon
} from 'lucide-react';
import { registerUser, bootstrapFounder, loginUser, setupUserPassword, generateMacAddress } from '../lib/dataService';
import { applyTheme, getSavedTheme } from '../lib/theme';

/**
 * Analyzes the entered password string to provide plain-language, real-time feedback
 */
function getPasswordCharacteristics(pass) {
  if (!pass) {
    return {
      type: 'empty',
      label: 'Enter password or PIN',
      length: 0,
      isNumeric: false,
      isCombined: false,
      hasLetters: false,
      hasNumbers: false,
      hasSymbols: false,
      isValidPin: false,
      isValidLength: false
    };
  }

  const isNumeric = /^[0-9]+$/.test(pass);
  const hasLetters = /[a-zA-Z]/.test(pass);
  const hasNumbers = /[0-9]/.test(pass);
  const hasSymbols = /[^a-zA-Z0-9]/.test(pass);
  const isCombined = (hasLetters && hasNumbers) || hasSymbols;

  let label = 'Letters only';
  if (isNumeric) {
    label = pass.length === 4 ? '4-Digit Numeric PIN' : `${pass.length}-Digit Numbers Only`;
  } else if (isCombined) {
    label = 'Character-Combined (Letters + Numbers/Symbols)';
  }

  return {
    type: isNumeric ? 'numeric' : (isCombined ? 'combined' : 'text'),
    label,
    length: pass.length,
    isNumeric,
    isCombined,
    hasLetters,
    hasNumbers,
    hasSymbols,
    isValidPin: isNumeric && pass.length === 4,
    isValidLength: pass.length >= 4
  };
}

export function LoginGateway({ users = [], onLogin }) {
  const [authMode, setAuthMode] = useState('signin');
  const [selectedRole, setSelectedRole] = useState('employee');
  
  // Sign-in state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Guide accordion state
  const [guideExpanded, setGuideExpanded] = useState(true);

  // Theme state
  const [currentTheme, setCurrentTheme] = useState(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.getAttribute('data-theme') || getSavedTheme();
    }
    return getSavedTheme();
  });

  const handleToggleTheme = () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const next = isDark ? 'light' : 'dark';
    applyTheme(next);
    setCurrentTheme(next);
  };

  // Register state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regSkillSet, setRegSkillSet] = useState('');
  const [regMac, setRegMac] = useState(generateMacAddress());
  const [regPassword, setRegPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regBootstrapKey, setRegBootstrapKey] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [authStep, setAuthStep] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const roleUsers = users.filter(u => u.role === selectedRole);
  const passwordStats = getPasswordCharacteristics(password);
  const regPasswordStats = getPasswordCharacteristics(regPassword);

  // Instant one-click default PIN auto-fill helper
  const handleAutoFillPin = () => {
    const defaultPin = selectedRole === 'founder' ? '9901' : '1042';
    setPassword(defaultPin);
    setErrorMsg('');
    setSuccessMsg(`Default ${selectedRole === 'founder' ? 'Founder' : 'Engineer'} PIN (${defaultPin}) filled! Click Authenticate below to sign in.`);
  };

  // AUTHENTICATE NODE
  const handleSignInSubmit = async (e) => {
    if (e) e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();

    if (!trimmedEmail) {
      setErrorMsg('Please enter your email address (e.g. alex.mercer@lexven.com).');
      return;
    }
    if (!trimmedPassword) {
      setErrorMsg(
        selectedRole === 'founder'
          ? 'Please enter your password or default Founder PIN: 9901.'
          : 'Please enter your password or default Operator PIN: 1042.'
      );
      return;
    }

    setIsLoading(true);
    setAuthStep('Verifying credentials against security registry...');

    try {
      const authRes = await loginUser({ email: trimmedEmail, password: trimmedPassword });

      if (!authRes || !authRes.success || !authRes.user) {
        setIsLoading(false);
        setAuthStep('');
        
        if (authRes?.requiresSetup) {
          // Account exists but needs an initial password
          try {
            const setupRes = await setupUserPassword({ email: trimmedEmail, password: trimmedPassword });
            if (setupRes && setupRes.success && setupRes.user) {
              setSuccessMsg('Account password initialized! Initializing workspace...');
              setTimeout(() => {
                onLogin(setupRes.user);
              }, 300);
              return;
            }
          } catch (err) {}
          setErrorMsg('Initial password setup required. Please enter a password of at least 6 characters.');
          return;
        }

        setErrorMsg(
          authRes?.error ||
          (selectedRole === 'founder'
            ? 'Access Denied: Invalid email or password. Default Founder PIN is 9901.'
            : 'Access Denied: Invalid email or password. Default Operator PIN is 1042.')
        );
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
      setErrorMsg(err?.message || 'Authentication error. Please check your credentials and retry.');
    }
  };

  const handleSelectQuickNode = (user) => {
    const isFounder = user.role === 'founder';
    const defaultPin = isFounder ? '9901' : '1042';
    setEmail(user.email || '');
    setPassword(defaultPin);
    setSelectedRole(user.role);
    setErrorMsg('');
    setSuccessMsg(`Selected node: ${user.name}. Default PIN (${defaultPin}) pre-filled for convenience! Click Authenticate to enter.`);
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
      setErrorMsg('Please enter a valid email address (e.g. operator@lexven.com).');
      return;
    }
    if (!skillSet) {
      setErrorMsg('Please enter your skill set or specialization.');
      return;
    }
    if (!pass) {
      setErrorMsg('Please create a password for this node.');
      return;
    }
    if (pass.length < 6) {
      setErrorMsg('Password must be at least 6 characters long (can be numbers, letters, or combined).');
      return;
    }
    if (selectedRole === 'founder' && !regBootstrapKey.trim()) {
      setErrorMsg('Founder Bootstrap Secret is required to register an Executive Founder account.');
      return;
    }

    setIsLoading(true);
    setAuthStep(selectedRole === 'founder' ? 'Authorizing Founder bootstrap protocol...' : 'Registering node in verified security registry...');

    try {
      const res = selectedRole === 'founder'
        ? await bootstrapFounder({
            name,
            email: cleanEmail,
            password: pass,
            skill_set: skillSet,
            device_mac_address: mac,
            bootstrapKey: regBootstrapKey.trim()
          })
        : await registerUser({
            name,
            email: cleanEmail,
            password: pass,
            role: 'employee',
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
        
        {/* Quick Theme Switcher Pill */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%', marginBottom: '14px' }}>
          <button
            type="button"
            className="theme-toggle-pill"
            onClick={handleToggleTheme}
            title={`Switch to ${currentTheme === 'dark' ? 'Light' : 'Dark'} theme`}
          >
            {currentTheme === 'dark' ? <Sun size={13} style={{ color: 'var(--accent)' }} /> : <Moon size={13} style={{ color: 'var(--muted)' }} />}
            <span>{currentTheme === 'dark' ? 'Light Theme' : 'Dark Theme'}</span>
          </button>
        </div>

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

          {/* ==============================================================================
             LAYMAN'S LANGUAGE LOGIN & CREDENTIALS GUIDE (Clear, Detailed & User-Friendly)
             ============================================================================== */}
          <div className="login-guide-card" id="login-layman-guide">
            <div 
              className="login-guide-header"
              onClick={() => setGuideExpanded(!guideExpanded)}
              role="button"
              tabIndex={0}
              aria-expanded={guideExpanded}
              aria-label="Toggle login instructions guide"
            >
              <div className="login-guide-title">
                <HelpCircle size={15} style={{ color: 'var(--accent)' }} />
                <span>Quick Layman's Login Guide & Password Rules</span>
              </div>
              <button 
                type="button" 
                className="login-guide-toggle-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setGuideExpanded(!guideExpanded);
                }}
              >
                <span>{guideExpanded ? 'Hide Guide' : 'Show Instructions'}</span>
                {guideExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
            </div>

            {guideExpanded && (
              <div className="login-guide-content">
                
                {/* Rule 1: What type of password to enter */}
                <div className="login-guide-item">
                  <div className="login-guide-item-title">
                    <Hash size={13} style={{ color: 'var(--accent)' }} />
                    <span>What Type of Password Must You Enter?</span>
                  </div>
                  <div className="login-guide-item-desc">
                    You can enter <strong>numbers only (numeric PIN)</strong>, <strong>standard words</strong>, or <strong>character-combined passwords</strong> (letters + numbers + symbols):
                  </div>
                  <div className="login-guide-pills">
                    <span className="login-guide-badge founder">
                      👑 Founder PIN: <strong>9901</strong> (Only 4 digits)
                    </span>
                    <span className="login-guide-badge employee">
                      💻 Operator PIN: <strong>1042</strong> (Only 4 digits)
                    </span>
                    <span className="login-guide-badge rule">
                      ✨ New Accounts: Min. 6 characters
                    </span>
                  </div>
                </div>

                {/* Rule 2: Minimum digits & characters */}
                <div className="login-guide-item">
                  <div className="login-guide-item-title">
                    <Lock size={13} style={{ color: 'var(--accent)' }} />
                    <span>Password Format & Length Rules (Plain English)</span>
                  </div>
                  <div className="login-guide-item-desc">
                    • <strong>Existing Team Members / Demo:</strong> Enter the exact <strong>4-digit numeric PIN</strong> (<code>9901</code> for Founders or <code>1042</code> for Engineers).<br />
                    • <strong>New Registrations:</strong> Must be <strong>at least 6 characters</strong> long. You can use numbers only (e.g. <code>123456</code>), letters only (e.g. <code>secret</code>), or a strong combination (e.g. <code>Inovex#2026</code>).<br />
                    • <strong>Case Sensitivity:</strong> Passwords ARE case-sensitive (capital letters matter). Email addresses are not case-sensitive.
                  </div>
                </div>

                {/* Rule 3: Quick 1-Click Access */}
                <div className="login-guide-item" style={{ background: 'var(--bg)', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--line)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: '11px', color: 'var(--ink)' }}>
                      <strong>Testing or in a hurry?</strong> Click below to auto-fill the standard PIN:
                    </div>
                    <button
                      type="button"
                      className="btn-quick-fill"
                      onClick={handleAutoFillPin}
                      id="btn-quick-fill-pin"
                    >
                      <Sparkles size={11} />
                      <span>Auto-Fill PIN: {selectedRole === 'founder' ? '9901' : '1042'}</span>
                    </button>
                  </div>
                </div>

              </div>
            )}
          </div>
          
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
                  <span className="mono" style={{ fontSize: '10px', color: 'var(--muted)' }}>
                    {selectedRole === 'founder' ? 'e.g. sarah.vance@lexven.com' : 'e.g. alex.mercer@lexven.com'}
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label className="login-label" htmlFor="login-password-input" style={{ marginBottom: 0 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Lock size={12} style={{ color: 'var(--accent)' }} />
                      <span>Account Password or PIN</span>
                    </span>
                  </label>
                  <button
                    type="button"
                    className="btn-quick-fill"
                    onClick={handleAutoFillPin}
                    style={{ fontSize: '10px', padding: '2px 6px' }}
                  >
                    <Sparkles size={10} />
                    <span>Fill PIN {selectedRole === 'founder' ? '9901' : '1042'}</span>
                  </button>
                </div>

                <div className="password-input-container">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="login-password-input"
                    className="dispatch-textarea password-input-field"
                    style={{ height: '42px', padding: '10px 14px', resize: 'none' }}
                    placeholder={selectedRole === 'founder' ? 'Enter 4-digit PIN 9901 or password...' : 'Enter 4-digit PIN 1042 or password...'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    title={showPassword ? 'Hide password characters' : 'Show password characters'}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>

                {/* Real-time Password Format & Character Feedback Pill */}
                {password.length > 0 && (
                  <div className="password-live-feedback">
                    <span style={{ color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {passwordStats.isValidPin ? <Check size={12} style={{ color: 'var(--status-green)' }} /> : <Info size={12} style={{ color: 'var(--accent)' }} />}
                      <span>Format: <strong>{passwordStats.label}</strong></span>
                    </span>
                    <span className="mono" style={{ color: passwordStats.isValidLength ? 'var(--status-green)' : 'var(--muted)' }}>
                      {password.length} characters
                    </span>
                  </div>
                )}
              </div>

              {/* Success Notification Pill */}
              {successMsg && (
                <div style={{ background: 'var(--status-green-bg)', border: '1px solid rgba(62, 138, 94, 0.35)', color: 'var(--status-green)', borderRadius: '6px', padding: '8px 12px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle2 size={13} style={{ flexShrink: 0 }} />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* Error Message Pill */}
              {errorMsg && (
                <div className="login-error-pill" id="login-error-pill">
                  <AlertCircle size={14} style={{ flexShrink: 0 }} />
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
                  <span className="mono" style={{ fontSize: '10px', color: 'var(--accent-strong)' }}>
                    Min. 6 Characters
                  </span>
                </label>

                <div className="password-input-container">
                  <input
                    type={showRegPassword ? 'text' : 'password'}
                    id="reg-password-input"
                    required
                    className="dispatch-textarea password-input-field"
                    style={{ height: '42px', padding: '10px 14px', resize: 'none' }}
                    placeholder="Create secure password (letters, digits, or combined)..."
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    disabled={isLoading}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowRegPassword(!showRegPassword)}
                    title={showRegPassword ? 'Hide password' : 'Show password'}
                    aria-label={showRegPassword ? 'Hide password' : 'Show password'}
                  >
                    {showRegPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>

                {/* Registration Password Strength & Feedback */}
                {regPassword.length > 0 && (
                  <div className="password-live-feedback">
                    <span style={{ color: 'var(--ink)' }}>
                      Type: <strong>{regPasswordStats.label}</strong>
                    </span>
                    <span className="mono" style={{ color: regPassword.length >= 6 ? 'var(--status-green)' : 'var(--status-red)' }}>
                      {regPassword.length >= 6 ? `✓ ${regPassword.length} chars (Valid)` : `⚠️ ${regPassword.length}/6 chars (Too short)`}
                    </span>
                  </div>
                )}
              </div>

              {/* Founder Bootstrap Key Required Field */}
              {selectedRole === 'founder' && (
                <div className="login-input-group">
                  <label className="login-label" htmlFor="reg-bootstrap-input">
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Key size={12} style={{ color: 'var(--accent)' }} />
                      <span>Initial Founder Key (Bootstrap Secret)</span>
                    </span>
                    <span className="mono" style={{ fontSize: '10px', color: 'var(--accent-strong)' }}>
                      Required
                    </span>
                  </label>
                  <input
                    type="password"
                    id="reg-bootstrap-input"
                    required
                    className="dispatch-textarea"
                    style={{ height: '42px', padding: '10px 14px', resize: 'none' }}
                    placeholder="Enter deployment INITIAL_FOUNDER_KEY..."
                    value={regBootstrapKey}
                    onChange={(e) => setRegBootstrapKey(e.target.value)}
                    disabled={isLoading}
                    autoComplete="off"
                  />
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                    Secured by server-side verification against INITIAL_FOUNDER_KEY. Unauthenticated registration cannot create founder accounts without this authorization key.
                  </div>
                </div>
              )}

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
                  <AlertCircle size={14} style={{ flexShrink: 0 }} />
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div className="section-kicker" style={{ fontSize: '10px', padding: '3px 10px', margin: 0 }}>
                  Quick Node Directory ({selectedRole === 'founder' ? 'Founders' : 'Engineers'})
                </div>
                <span className="mono" style={{ fontSize: '10px', color: 'var(--muted)' }}>
                  Click to pre-fill {selectedRole === 'founder' ? 'PIN 9901' : 'PIN 1042'}
                </span>
              </div>
              
              {roleUsers.length === 0 ? (
                <div style={{ textAlign: 'center', fontSize: '12px', color: 'var(--muted)', padding: '12px' }}>
                  No {selectedRole === 'founder' ? 'founder' : 'engineering'} nodes registered yet.
                </div>
              ) : (
                <div className="quick-nodes-grid">
                  {roleUsers.map(user => {
                    const isFnd = user.role === 'founder';
                    const pinHint = isFnd ? '9901' : '1042';
                    return (
                      <button
                        key={user.id}
                        type="button"
                        className="quick-node-card"
                        onClick={() => handleSelectQuickNode(user)}
                        disabled={isLoading}
                        title={`Select ${user.name} (PIN: ${pinHint})`}
                        aria-label={`Select ${user.name}`}
                      >
                        <div className="quick-node-avatar">
                          {user.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div className="quick-node-info">
                          <div className="quick-node-name" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span>{user.name}</span>
                            <span style={{ fontSize: '9px', background: isFnd ? 'rgba(184, 134, 11, 0.12)' : 'var(--accent-tint-2)', color: isFnd ? '#996515' : 'var(--accent-strong)', padding: '1px 5px', borderRadius: '4px', fontWeight: 600 }}>
                              PIN: {pinHint}
                            </span>
                          </div>
                          <div className="quick-node-mac mono" style={{ fontSize: '10px', color: 'var(--accent-strong)' }}>
                            {user.email}
                          </div>
                        </div>
                        <ArrowRight size={14} className="quick-node-arr" style={{ color: 'var(--accent)' }} />
                      </button>
                    );
                  })}
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
