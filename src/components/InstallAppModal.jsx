import React, { useState, useEffect } from 'react';
import { Smartphone, Monitor, Download, QrCode, Check, Copy, ExternalLink, X, Shield, Sparkles } from 'lucide-react';

export function InstallAppModal({ isOpen, onClose, deferredPrompt, onPromptInstall }) {
  const [networkInfo, setNetworkInfo] = useState(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('pwa'); // 'pwa' | 'apk'
  const isAndroid = /Android/i.test(navigator.userAgent);
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isMobile = isAndroid || isIOS;

  useEffect(() => {
    if (isOpen) {
      fetch('/api/system/network-info')
        .then(res => res.json())
        .then(data => setNetworkInfo(data))
        .catch(err => console.log('Could not fetch network info', err));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const androidUrl = networkInfo?.defaultNetworkUrl || (window.location.origin.includes('localhost') ? `http://${window.location.hostname}:5000` : window.location.origin);

  const handleCopy = () => {
    navigator.clipboard.writeText(androidUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="audit-modal-backdrop" onClick={onClose} style={{ zIndex: 1100 }}>
      <div className="audit-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '620px' }}>
        
        {/* Header */}
        <div className="audit-modal-header" style={{ borderBottom: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ 
              width: '36px', 
              height: '36px', 
              borderRadius: '10px', 
              background: 'var(--accent)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              color: '#fff' 
            }}>
              <Smartphone size={18} />
            </div>
            <div>
              <h3 className="serif" style={{ fontSize: '22px', color: 'var(--ink)', margin: 0, lineHeight: 1.2 }}>
                Download & Install on Android
              </h3>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--muted)' }}>
                Cross-platform Web App • Android Native Mode & Desktop Browser
              </p>
            </div>
          </div>
          <button 
            className="btn btn-outline" 
            onClick={onClose} 
            style={{ padding: '6px 10px', borderRadius: '50%' }}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div style={{ 
          display: 'flex', 
          borderBottom: '1px solid var(--line)', 
          background: 'var(--bg)', 
          padding: '4px 24px 0' 
        }}>
          <button
            onClick={() => setActiveTab('pwa')}
            style={{
              padding: '10px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'pwa' ? '2px solid var(--accent)' : '2px solid transparent',
              color: activeTab === 'pwa' ? 'var(--accent-strong)' : 'var(--muted)',
              fontWeight: activeTab === 'pwa' ? 600 : 500,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Smartphone size={14} />
            <span>Instant Android Install (PWA)</span>
          </button>
          <button
            onClick={() => setActiveTab('apk')}
            style={{
              padding: '10px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'apk' ? '2px solid var(--accent)' : '2px solid transparent',
              color: activeTab === 'apk' ? 'var(--accent-strong)' : 'var(--muted)',
              fontWeight: activeTab === 'apk' ? 600 : 500,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Download size={14} />
            <span>Android APK & Capacitor Studio</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="audit-modal-body" style={{ padding: '24px' }}>
          
          {activeTab === 'pwa' ? (
            <div>
              {/* Direct Install Button if in Android Browser or PWA prompt ready */}
              {deferredPrompt ? (
                <div style={{
                  background: 'var(--accent-tint-2)',
                  border: '1px solid rgba(95, 115, 72, 0.3)',
                  borderRadius: '12px',
                  padding: '20px',
                  textAlign: 'center',
                  marginBottom: '20px'
                }}>
                  <div style={{ display: 'inline-flex', padding: '10px', background: 'var(--accent-tint)', borderRadius: '50%', color: 'var(--accent-strong)', marginBottom: '10px' }}>
                    <Download size={24} />
                  </div>
                  <h4 style={{ fontSize: '16px', color: 'var(--ink)', marginBottom: '6px', fontWeight: 600 }}>
                    Install Directly to Home Screen
                  </h4>
                  <p style={{ fontSize: '13px', color: 'var(--muted)', maxWidth: '420px', margin: '0 auto 16px' }}>
                    One-tap install creates a standalone Android application in your app launcher with full-screen experience and zero address bar.
                  </p>
                  <button 
                    className="btn btn-primary"
                    onClick={onPromptInstall}
                    style={{ fontSize: '14px', padding: '10px 24px', gap: '8px' }}
                  >
                    <Download size={16} />
                    <span>Install Inovex on This Device</span>
                  </button>
                </div>
              ) : isAndroid ? (
                <div style={{
                  background: 'var(--accent-tint-2)',
                  border: '1px solid rgba(95, 115, 72, 0.3)',
                  borderRadius: '12px',
                  padding: '18px',
                  marginBottom: '20px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <Smartphone size={20} style={{ color: 'var(--accent)' }} />
                    <strong style={{ fontSize: '14px', color: 'var(--ink)' }}>Android Browser Detected</strong>
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
                    To download to your Android app drawer: Tap the browser menu (<strong style={{ color: 'var(--ink)' }}>⋮</strong> top right) and select <strong style={{ color: 'var(--accent-strong)' }}>"Install app"</strong> or <strong style={{ color: 'var(--accent-strong)' }}>"Add to Home screen"</strong>.
                  </p>
                </div>
              ) : null}

              {/* Connecting Android Phone from Local Network */}
              <div style={{ marginBottom: '22px' }}>
                <div className="specimen-label" style={{ marginBottom: '8px' }}>
                  Connect Any Android Phone on Your Wi-Fi
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'var(--card)',
                  border: '1px solid var(--line)',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  gap: '12px',
                  flexWrap: 'wrap'
                }}>
                  <div className="mono" style={{ fontSize: '14px', color: 'var(--ink)', fontWeight: 600 }}>
                    {androidUrl}
                  </div>
                  <button 
                    className="btn btn-secondary" 
                    onClick={handleCopy}
                    style={{ fontSize: '12px', padding: '6px 12px', gap: '6px' }}
                  >
                    {copied ? <Check size={14} style={{ color: 'var(--status-green)' }} /> : <Copy size={14} />}
                    <span>{copied ? 'Copied URL!' : 'Copy URL'}</span>
                  </button>
                </div>
              </div>

              {/* Step-by-Step Instructions */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '10px', padding: '14px' }}>
                  <div className="mono" style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 700, marginBottom: '4px' }}>
                    STEP 01
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', marginBottom: '4px' }}>
                    Same Wi-Fi
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.4 }}>
                    Connect Android handset to the same Wi-Fi network as this PC.
                  </div>
                </div>

                <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '10px', padding: '14px' }}>
                  <div className="mono" style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 700, marginBottom: '4px' }}>
                    STEP 02
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', marginBottom: '4px' }}>
                    Open in Chrome
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.4 }}>
                    Open Chrome/Edge on Android and visit the URL shown above.
                  </div>
                </div>

                <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: '10px', padding: '14px' }}>
                  <div className="mono" style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 700, marginBottom: '4px' }}>
                    STEP 03
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)', marginBottom: '4px' }}>
                    Tap "Install"
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.4 }}>
                    Tap "Install App" to add Inovex Tracker directly to your Android app drawer.
                  </div>
                </div>
              </div>

              {/* Cross-Platform Features Banner */}
              <div style={{ 
                background: 'var(--bg-warm)', 
                border: '1px solid var(--line)', 
                borderRadius: '10px', 
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Shield size={16} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontSize: '12px', color: 'var(--ink)', fontWeight: 500 }}>
                    Desktop Browser: Runs in Chrome, Edge, Safari & Firefox without installation
                  </span>
                </div>
                <span className="badge active" style={{ fontSize: '10px' }}>
                  Unified Host
                </span>
              </div>
            </div>
          ) : (
            <div>
              {/* Capacitor Native Android Tab */}
              <div style={{
                background: 'var(--card)',
                border: '1px solid var(--line)',
                borderRadius: '12px',
                padding: '20px',
                marginBottom: '18px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <Smartphone size={20} style={{ color: 'var(--status-green)' }} />
                  <h4 style={{ fontSize: '15px', color: 'var(--ink)', margin: 0, fontWeight: 600 }}>
                    Capacitor Native Android Project Included
                  </h4>
                </div>
                <p style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.5, margin: 0 }}>
                  The project has a ready-to-compile native Android app located in the <code className="mono" style={{ background: 'var(--bg)', padding: '2px 6px', borderRadius: '4px' }}>/android</code> directory with screen recording, wake-lock, and background service permissions already defined in <code className="mono" style={{ background: 'var(--bg)', padding: '2px 6px', borderRadius: '4px' }}>AndroidManifest.xml</code>.
                </p>
              </div>

              <div className="specimen-label" style={{ marginBottom: '8px' }}>
                Build Native Android APK Commands
              </div>
              
              <div style={{
                background: '#0E1116',
                color: '#EDF1E3',
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                borderRadius: '8px',
                padding: '14px 16px',
                lineHeight: 1.8,
                marginBottom: '18px',
                overflowX: 'auto'
              }}>
                <div style={{ color: '#8FA87B' }}># 1. Build web distribution assets</div>
                <div>npm run build</div>
                <div style={{ color: '#8FA87B', marginTop: '6px' }}># 2. Sync web bundle to Android project</div>
                <div>npx cap sync android</div>
                <div style={{ color: '#8FA87B', marginTop: '6px' }}># 3. Open in Android Studio to build APK or run on connected device</div>
                <div>npx cap open android</div>
              </div>

              <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.5 }}>
                💡 <strong>Tip:</strong> If you don't have Android Studio installed, you can use the <strong>Instant Android Install (PWA)</strong> tab above to download and install the app onto your Android phone in 1 click right from the mobile browser!
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
