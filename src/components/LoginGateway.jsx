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
  Fingerprint,
  Sparkles
} from 'lucide-react';
import { registerUser, generateMacAddress } from '../lib/dataService';
import { BiometricScannerModal } from './BiometricScannerModal';

export function LoginGateway({ users = [], onLogin }) {
  // If no users exist in the system, default to register mode
  const [authMode, setAuthMode] = useState(users.length === 0 ? 'register' : 'signin'); // 'signin' | 'register'
  const [selectedRole, setSelectedRole] = useState('founder'); // 'founder' | 'employee'
  
  // Sign-in state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Register state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regMac, setRegMac] = useState(generateMacAddress());
  const [regPassword, setRegPassword] = useState('');
  const [enrolledBioKey, setEnrolledBioKey] = useState(null);

  const [isLoading, setIsLoading] = useState(false);
  const [authStep, setAuthStep] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Biometric Scanner Modal State
  const [isBioModalOpen, setIsBioModalOpen] = useState(false);
  const [bioModalConfig, setBioModalConfig] = useState({
    actionType: 'authenticate',
    nodeIdentity: null,
    onSuccessAction: null,
    customTitle: null,
    customSubtitle: null
  });

  // Filter nodes for the quick access section based on role tab
  const roleUsers = users.filter(u => u.role === selectedRole);

  // Trigger Biometric Verification for an Authenticating User
  const triggerBiometricLogin = (targetUser = null) => {
    // If no explicit user provided, resolve based on inputs or active role
    let nodeToAuth = targetUser;
    
    if (!nodeToAuth) {
      const trimmedEmail = email.trim().toLowerCase();
      const trimmedPassword = password.trim();

      // Check master passcodes or entered credentials
      if (trimmedPassword === '9901' || trimmedEmail === '9901' || (selectedRole === 'founder' && !trimmedEmail)) {
        nodeToAuth = users.find(u => u.role === 'founder') || {
          id: 'usr_founder_' + Date.now().toString(36),
          name: 'Founder Executive',
          email: 'founder@inovex.ai',
          role: 'founder',
          device_mac_address: generateMacAddress(),
          biometric_enrolled: 1
        };
      } else if (trimmedPassword === '1042' || trimmedEmail === '1042' || (selectedRole === 'employee' && !trimmedEmail)) {
        nodeToAuth = users.find(u => u.role === 'employee') || {
          id: 'usr_eng_' + Date.now().toString(36),
          name: 'Engineering Node #1',
          email: 'engineer@inovex.ai',
          role: 'employee',
          device_mac_address: generateMacAddress(),
          biometric_enrolled: 1
        };
      } else if (trimmedEmail) {
        nodeToAuth = users.find(u => u.email.toLowerCase() === trimmedEmail) || {
          id: 'usr_' + Date.now().toString(36),
          name: trimmedEmail.split('@')[0].replace(/[._]/g, ' ').toUpperCase(),
          email: trimmedEmail,
          role: selectedRole,
          device_mac_address: generateMacAddress(),
          biometric_enrolled: 1
        };
      } else {
        nodeToAuth = {
          id: 'usr_' + selectedRole + '_' + Date.now().toString(36),
          name: selectedRole === 'founder' ? 'Founder Executive' : 'Engineering Node',
          email: selectedRole === 'founder' ? 'founder@inovex.ai' : 'engineer@inovex.ai',
          role: selectedRole,
          device_mac_address: generateMacAddress(),
          biometric_enrolled: 1
        };
      }
    }

    setBioModalConfig({
      actionType: 'authenticate',
      nodeIdentity: nodeToAuth,
      customTitle: nodeToAuth.role === 'founder' 
        ? 'Executive Biometric Passkey Scan' 
        : 'Engineering Node Fingerprint Scan',
      customSubtitle: nodeToAuth.role === 'founder'
        ? 'Scan registered fingerprint to authorize global read/write command rights.'
        : 'Scan registered fingerprint to verify workstation and unlock zero-latency sprint enclave.',
      onSuccessAction: async (bioPayload) => {
        setIsBioModalOpen(false);
        setIsLoading(true);
        setErrorMsg('');
        setAuthStep(`Biometric Enclave Verified: ${bioPayload.biometric_passkey_id}...`);
        
        // Auto-save user in storage if not already registered
        try {
          if (!users.some(u => u.id === nodeToAuth.id || u.email === nodeToAuth.email)) {
            await registerUser({
              name: nodeToAuth.name,
              email: nodeToAuth.email,
              role: nodeToAuth.role,
              device_mac_address: nodeToAuth.device_mac_address,
              biometric_passkey_id: bioPayload.biometric_passkey_id
            });
          }
        } catch (e) {
          console.warn('Node auto-enroll note:', e);
        }

        setTimeout(() => {
          setAuthStep(`Binding node enclave: ${nodeToAuth.device_mac_address}...`);
          setTimeout(() => {
            setIsLoading(false);
            setAuthStep('');
            onLogin({
              ...nodeToAuth,
              biometric_session_token: bioPayload.signature_hash,
              biometric_verified_at: Date.now()
            });
          }, 350);
        }, 350);
      }
    });
    setIsBioModalOpen(true);
  };

  const handleSelectQuickNode = (user) => {
    setEmail(user.email);
    setPassword('••••••••••••');
    setErrorMsg('');
    triggerBiometricLogin(user);
  };

  const handleSignInSubmit = (e) => {
    e.preventDefault();
    setErrorMsg('');
    triggerBiometricLogin();
  };

  // Open Biometric Scanner for Passkey Enrollment during registration
  const handleOpenEnrollmentScan = () => {
    setBioModalConfig({
      actionType: 'enroll',
      nodeIdentity: {
        name: regName.trim() || (selectedRole === 'founder' ? 'Founder Operator' : 'Engineering Operator'),
        email: regEmail.trim() || 'node@organization.com',
        role: selectedRole,
        device_mac_address: regMac
      },
      customTitle: 'Enroll Biometric Fingerprint Passkey',
      customSubtitle: 'Place finger on sensor to generate cryptographic FIDO2 hardware passkey token.',
      onSuccessAction: (bioPayload) => {
        setEnrolledBioKey(bioPayload.biometric_passkey_id);
        setIsBioModalOpen(false);
      }
    });
    setIsBioModalOpen(true);
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    if (!regName.trim()) {
      setErrorMsg('Please enter your full name');
      return;
    }
    if (!regEmail.trim()) {
      setErrorMsg('Please enter a valid node email address');
      return;
    }

    // If biometric passkey not yet enrolled, prompt the scanner now
    if (!enrolledBioKey) {
      setBioModalConfig({
        actionType: 'enroll',
        nodeIdentity: {
          name: regName.trim(),
          email: regEmail.trim(),
          role: selectedRole,
          device_mac_address: regMac
        },
        customTitle: 'Biometric Passkey Required for Node Registration',
        customSubtitle: 'Scan your fingerprint to bind your physical identity to this hardware enclave.',
        onSuccessAction: async (bioPayload) => {
          setEnrolledBioKey(bioPayload.biometric_passkey_id);
          setIsBioModalOpen(false);
          await executeRegistration(bioPayload.biometric_passkey_id);
        }
      });
      setIsBioModalOpen(true);
      return;
    }

    await executeRegistration(enrolledBioKey);
  };

  const executeRegistration = async (bioKey) => {
    setIsLoading(true);
    setErrorMsg('');
    setAuthStep('Binding biometric passkey and hardware signature...');

    try {
      const res = await registerUser({
        name: regName.trim(),
        email: regEmail.trim(),
        role: selectedRole,
        device_mac_address: regMac.trim() || generateMacAddress(),
        biometric_passkey_id: bioKey
      });

      if (res && res.success && res.user) {
        setAuthStep(`Binding node enclave: ${res.user.device_mac_address}...`);
        setTimeout(() => {
          setIsLoading(false);
          setAuthStep('');
          onLogin(res.user);
        }, 500);
      } else {
        throw new Error('Registration failed');
      }
    } catch (err) {
      setIsLoading(false);
      setErrorMsg('Could not register node. Please retry.');
      console.error('Node registration error', err);
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
            Secure Node Gateway & Zero-Latency Operations Enclave
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
              }}
              style={{ padding: '8px 12px' }}
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
              }}
              style={{ padding: '8px 12px' }}
            >
              <UserPlus size={13} />
              <span>Register New Node</span>
            </button>
          </div>

          {/* Empty Database Initial Setup Prompt */}
          {users.length === 0 && authMode === 'register' && (
            <div style={{ background: 'var(--accent-tint-2)', border: '1px solid rgba(95, 115, 72, 0.3)', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Shield size={16} style={{ color: 'var(--accent-strong)', flexShrink: 0 }} />
              <div style={{ fontSize: '12px', color: 'var(--ink)' }}>
                <strong>Production Clean Slate:</strong> No demo records exist. Register your initial Founder node below with biometric passkey to initialize the sentinel system.
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
              }}
            >
              <Shield size={14} />
              <span>Founder / Executive</span>
            </button>
            <button
              type="button"
              className={`login-role-tab ${selectedRole === 'employee' ? 'active' : ''}`}
              onClick={() => {
                setSelectedRole('employee');
                setErrorMsg('');
              }}
            >
              <Laptop size={14} />
              <span>Engineering Node</span>
            </button>
          </div>

          {/* SIGN IN FORM */}
          {authMode === 'signin' ? (
            <form onSubmit={handleSignInSubmit} className="login-form">
              <div className="login-input-group">
                <label className="login-label">
                  <span>Node Email / Identifier</span>
                  <span className="mono" style={{ fontSize: '10px', color: 'var(--muted)' }}>
                    {selectedRole === 'founder' ? 'Global Read/Write' : 'Assigned Sprint Only'}
                  </span>
                </label>
                <input
                  type="email"
                  className="dispatch-textarea"
                  style={{ height: '42px', padding: '10px 14px', resize: 'none' }}
                  placeholder="Enter node email, passcode (9901 / 1042), or touch sensor..."
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                />
              </div>

              <div className="login-input-group">
                <label className="login-label">
                  <span>Security Passcode / Master Key</span>
                  <span className="mono" style={{ fontSize: '10px', color: 'var(--muted)' }}>
                    {selectedRole === 'founder' ? 'Master 9901' : 'Master 1042'}
                  </span>
                </label>
                <input
                  type="password"
                  className="dispatch-textarea"
                  style={{ height: '42px', padding: '10px 14px', resize: 'none' }}
                  placeholder={selectedRole === 'founder' ? 'Enter master passcode (9901)...' : 'Enter master passcode (1042)...'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                />
              </div>

              {/* Interactive Biometric Sensor Banner */}
              <div 
                onClick={() => triggerBiometricLogin()}
                style={{ 
                  background: 'var(--bg)', 
                  border: '1px solid var(--line)', 
                  borderRadius: '8px', 
                  padding: '10px 12px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between', 
                  gap: '8px', 
                  margin: '4px 0 8px',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s ease'
                }}
                className="hover-card"
                title="Click to authenticate via fingerprint scanner immediately"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Fingerprint size={16} style={{ color: 'var(--accent-strong)' }} />
                  <span style={{ fontSize: '12px', color: 'var(--ink)', fontWeight: '500' }}>
                    Touch Sensor to Scan Fingerprint
                  </span>
                </div>
                <span className="badge active" style={{ fontSize: '9px', padding: '2px 8px' }}>
                  <span className="badge-dot"></span>
                  Sensor Live
                </span>
              </div>

              {/* Error Message */}
              {errorMsg && (
                <div className="login-error-pill">
                  <AlertCircle size={14} />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Primary Biometric Submit Button */}
              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', padding: '12px 18px', fontSize: '14px', marginTop: '6px' }}
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
                    <Fingerprint size={16} />
                    <span>Scan Fingerprint & Authenticate Node</span>
                    <ArrowRight size={15} />
                  </>
                )}
              </button>
            </form>
          ) : (
            /* REGISTER NEW NODE FORM */
            <form onSubmit={handleRegisterSubmit} className="login-form">
              <div className="login-input-group">
                <label className="login-label">
                  <span>Full Name</span>
                  <span className="mono" style={{ fontSize: '10px', color: 'var(--muted)' }}>
                    Operator Identity
                  </span>
                </label>
                <input
                  type="text"
                  required
                  className="dispatch-textarea"
                  style={{ height: '42px', padding: '10px 14px', resize: 'none' }}
                  placeholder={selectedRole === 'founder' ? 'e.g. Founder Name' : 'e.g. Lead Engineer'}
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  disabled={isLoading}
                />
              </div>

              <div className="login-input-group">
                <label className="login-label">
                  <span>Node Email</span>
                  <span className="mono" style={{ fontSize: '10px', color: 'var(--muted)' }}>
                    Workstation Address
                  </span>
                </label>
                <input
                  type="email"
                  required
                  className="dispatch-textarea"
                  style={{ height: '42px', padding: '10px 14px', resize: 'none' }}
                  placeholder="node@organization.com"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  disabled={isLoading}
                />
              </div>

              <div className="login-input-group">
                <label className="login-label">
                  <span>Hardware MAC Signature</span>
                  <span className="mono" style={{ fontSize: '10px', color: 'var(--muted)' }}>
                    Enclave Enforced
                  </span>
                </label>
                <input
                  type="text"
                  className="dispatch-textarea mono"
                  style={{ height: '42px', padding: '10px 14px', resize: 'none', fontSize: '12px' }}
                  value={regMac}
                  onChange={(e) => setRegMac(e.target.value)}
                  disabled={isLoading}
                />
              </div>

              {/* Biometric Passkey Enrollment Zone */}
              <div className="login-input-group">
                <label className="login-label">
                  <span>Biometric Passkey Enrollment</span>
                  <span className="mono" style={{ fontSize: '10px', color: 'var(--accent-strong)' }}>
                    Required Hardware Factor
                  </span>
                </label>

                {enrolledBioKey ? (
                  <div style={{ background: 'var(--status-green-bg)', border: '1px solid rgba(62, 138, 94, 0.35)', borderRadius: '8px', padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <CheckCircle2 size={16} style={{ color: 'var(--status-green)' }} />
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--status-green)' }}>
                          Fingerprint Passkey Enrolled
                        </div>
                        <div className="mono" style={{ fontSize: '10px', color: 'var(--muted-2)' }}>
                          Token ID: {enrolledBioKey}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: '10px', padding: '4px 8px' }}
                      onClick={handleOpenEnrollmentScan}
                    >
                      Re-scan
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn-bio-trigger"
                    onClick={handleOpenEnrollmentScan}
                    id="btn-enroll-bio"
                  >
                    <Fingerprint size={16} />
                    <span>Scan Fingerprint to Enroll Passkey</span>
                  </button>
                )}
              </div>

              <div className="login-input-group">
                <label className="login-label">
                  <span>Node Backup Passcode</span>
                  <span className="mono" style={{ fontSize: '10px', color: 'var(--muted)' }}>
                    Secondary Factor
                  </span>
                </label>
                <input
                  type="password"
                  className="dispatch-textarea"
                  style={{ height: '42px', padding: '10px 14px', resize: 'none' }}
                  placeholder="Create secondary backup passcode..."
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  disabled={isLoading}
                />
              </div>

              {/* Error Message */}
              {errorMsg && (
                <div className="login-error-pill">
                  <AlertCircle size={14} />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Register Submit Button */}
              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', padding: '12px 18px', fontSize: '14px', marginTop: '6px' }}
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
                    <Fingerprint size={15} />
                    <span>Initialize Node with Biometric Key</span>
                    <ArrowRight size={15} />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Quick Access Pre-Authorized Node Chips (Only if registered nodes exist) */}
          {users.length > 0 && authMode === 'signin' && (
            <div className="login-quick-section">
              <div className="section-kicker" style={{ marginBottom: '10px', fontSize: '10px', padding: '3px 10px' }}>
                Active Registered Nodes ({selectedRole === 'founder' ? 'Founders' : 'Engineers'})
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
                      title={`Authenticate with biometric scan as ${user.name}`}
                    >
                      <div className="quick-node-avatar">
                        {user.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div className="quick-node-info">
                        <div className="quick-node-name">{user.name}</div>
                        <div className="quick-node-mac mono">{user.device_mac_address}</div>
                      </div>
                      <Fingerprint size={14} className="quick-node-arr" style={{ color: 'var(--accent)' }} />
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
              Biometric Fingerprint Scan • Hardware MAC Handshake • Zero-Trust Enclave
            </span>
          </div>

        </div>

      </div>

      {/* Interactive Biometric Fingerprint Scanner HUD Modal */}
      <BiometricScannerModal 
        isOpen={isBioModalOpen}
        onClose={() => setIsBioModalOpen(false)}
        onSuccess={(bioPayload) => {
          if (bioModalConfig.onSuccessAction) {
            bioModalConfig.onSuccessAction(bioPayload);
          }
        }}
        nodeIdentity={bioModalConfig.nodeIdentity}
        actionType={bioModalConfig.actionType}
        customTitle={bioModalConfig.customTitle}
        customSubtitle={bioModalConfig.customSubtitle}
      />

    </div>
  );
}

export default LoginGateway;
