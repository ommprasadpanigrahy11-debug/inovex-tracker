import React, { useState, useEffect } from 'react';
import { SidebarNav } from './components/SidebarNav';
import { AdminDashboard } from './components/AdminDashboard';
import { EmployeeWorkspace } from './components/EmployeeWorkspace';
import { FounderEmployeeView } from './components/FounderEmployeeView';
import { InstallAppModal } from './components/InstallAppModal';
import { LoginGateway } from './components/LoginGateway';
import { AlertTriangle, X, ShieldAlert } from 'lucide-react';
import { fetchUsers, simulateHardwareSpoof, verifyStoredSession, logoutUser, getAuthToken } from './lib/dataService';
import { isSupabaseConfigured, initRealtimeChannel } from './lib/supabase';

export function App() {
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [lastWsEvent, setLastWsEvent] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [inspectedEmployee, setInspectedEmployee] = useState(null);

  // PWA & Android Installation State
  const [installModalOpen, setInstallModalOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [canInstallPwa, setCanInstallPwa] = useState(false);

  // ACTION 2: Toast Alert State for Hardware Spoofing
  const [spoofAlerts, setSpoofAlerts] = useState([]);

  // PWA installation listener
  useEffect(() => {
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setCanInstallPwa(true);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setCanInstallPwa(false);
      console.log('[PWA] INOVEX App installed successfully!');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handlePromptInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try {
      const { outcome } = await deferredPrompt.userChoice;
      console.log('[PWA] User choice outcome:', outcome);
    } catch (e) {
      console.log('[PWA] Prompt error', e);
    }
    setDeferredPrompt(null);
    setCanInstallPwa(false);
    setInstallModalOpen(false);
  };

  // Restore authenticated session with server verification
  useEffect(() => {
    async function initSession() {
      try {
        const verifiedUser = await verifyStoredSession();
        if (verifiedUser) {
          setCurrentUser(verifiedUser);
          setActiveTab(verifiedUser.role === 'founder' ? 'dashboard' : 'workspace');
        } else {
          setCurrentUser(null);
        }
        const data = await fetchUsers();
        setUsers(data);
      } catch (e) {
        console.warn('Session verification fallback', e);
      } finally {
        setIsInitializing(false);
      }
    }
    initSession();
  }, []);

  // Handle Login Success
  const handleLogin = (user) => {
    setCurrentUser(user);
    setUsers(prev => {
      if (!prev.some(u => u.id === user.id || u.email === user.email)) {
        return [...prev, user];
      }
      return prev;
    });
    setActiveTab(user.role === 'founder' ? 'dashboard' : 'workspace');
  };

  // Handle Logout / Disconnect Node
  const handleLogout = async () => {
    await logoutUser();
    setCurrentUser(null);
  };

  // Sync activeTab when user switches
  useEffect(() => {
    if (currentUser) {
      setActiveTab(currentUser.role === 'founder' ? 'dashboard' : 'workspace');
    }
  }, [currentUser?.role]);

  // Realtime Telemetry & Security Sentinel Connection (Dual-Channel: Local WebSocket + Supabase Cloud + In-App Event)
  useEffect(() => {
    const handleEvent = (parsed) => {
      if (!parsed) return;
      setLastWsEvent(parsed);

      // ACTION 2 TRIGGER: Push Toast Alert instantly when hardware spoof detected
      if (parsed.type === 'HARDWARE_SPOOF_ALERT') {
        const newAlert = {
          id: 'alert_' + Date.now(),
          ...parsed.data
        };
        setSpoofAlerts(prev => [newAlert, ...prev]);

        // Auto dismiss after 12 seconds
        setTimeout(() => {
          setSpoofAlerts(prev => prev.filter(a => a.id !== newAlert.id));
        }, 12000);
      }
    };

    // 1. In-Window CustomEvent listener for instant zero-latency feedback
    const customEventHandler = (e) => {
      if (e.detail) {
        handleEvent(e.detail);
      }
    };
    window.addEventListener('inovex_telemetry_event', customEventHandler);

    // 2. Connect to Local WebSocket Engine with authentication token
    let socket = null;
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const token = getAuthToken();
      const wsUrl = `${protocol}//${window.location.host}/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`;
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        setWsConnected(true);
      };

      socket.onclose = () => {
        if (!isSupabaseConfigured) {
          setWsConnected(false);
        }
      };

      socket.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          handleEvent(parsed);
        } catch (e) {
          console.error('Error parsing WS message', e);
        }
      };
    } catch (err) {
      console.warn('Local WS error, running in cloud-resilient mode', err);
    }

    // 3. Connect to Supabase Cloud Realtime Channel (if configured)
    let channel = null;
    if (isSupabaseConfigured) {
      channel = initRealtimeChannel(handleEvent);
      setWsConnected(true);
    }

    return () => {
      window.removeEventListener('inovex_telemetry_event', customEventHandler);
      if (socket) socket.close();
      if (channel) channel.unsubscribe();
    };
  }, [currentUser]);

  // Simulate Spoof Signal (Security Sentinel trigger)
  const handleSimulateSpoof = async () => {
    try {
      const target = users.find(u => u.role === 'employee') || currentUser;
      await simulateHardwareSpoof(target, null);
    } catch (err) {
      console.error('Failed to trigger spoof simulation', err);
    }
  };

  if (isInitializing) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font-sans)' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="section-kicker" style={{ marginBottom: '12px' }}>System Initializing</div>
          <h2 className="serif" style={{ fontSize: '28px', color: 'var(--ink)' }}>
            INOVEX Operations <span className="accent">Sentinel v2.0</span>
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '6px' }}>
            Establishing zero-latency telemetry & cloud node state...
          </p>
        </div>
      </div>
    );
  }

  // If unauthenticated, gate access with the INOVEX Login Gateway
  if (!currentUser) {
    return (
      <LoginGateway 
        users={users} 
        onLogin={handleLogin} 
      />
    );
  }

  const isFounder = currentUser.role === 'founder';

  return (
    <div className="inovex-app-layout">
      {/* V2 Sidebar Navigation (Desktop Left Rail & Mobile Drawer) */}
      <SidebarNav 
        currentUser={currentUser}
        users={users}
        onSwitchUser={() => {
          setInspectedEmployee(null);
          handleLogout();
        }}
        wsConnected={wsConnected}
        onSimulateSpoof={handleSimulateSpoof}
        onOpenInstallModal={() => setInstallModalOpen(true)}
        canInstallPwa={canInstallPwa}
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          setInspectedEmployee(null);
        }}
        onLogout={() => {
          setInspectedEmployee(null);
          handleLogout();
        }}
      />

      {/* Main Content Viewport */}
      <main className="inovex-main-content">
        {/* Android & PWA Installation Modal */}
        <InstallAppModal 
          isOpen={installModalOpen}
          onClose={() => setInstallModalOpen(false)}
          deferredPrompt={deferredPrompt}
          onPromptInstall={handlePromptInstall}
        />

        {/* ACTION 2: URGENT HARDWARE ANOMALY TOASTS */}
        <div className="toast-stack">
          {spoofAlerts.map(alert => (
            <div key={alert.id} className="inovex-toast">
              <div className="toast-header">
                <div className="toast-title">
                  <ShieldAlert size={16} />
                  <span>Security Sentinel: Hardware Anomaly Detected</span>
                </div>
                <button 
                  onClick={() => setSpoofAlerts(prev => prev.filter(a => a.id !== alert.id))}
                  style={{ background: 'transparent', border: 'none', color: 'var(--muted-2)', cursor: 'pointer', padding: '2px' }}
                  aria-label="Close notification"
                >
                  <X size={15} />
                </button>
              </div>
              <p className="toast-body">
                {alert.alertMessage}
              </p>
              <div className="mono" style={{ fontSize: '11px', color: 'var(--muted-2)', marginTop: '8px' }}>
                Target: {alert.log?.user_name} ({alert.log?.device_mac_address}) • {alert.log?.active_window}
              </div>
            </div>
          ))}
        </div>

        {/* Dynamic View Routing Based on Role */}
        {isFounder ? (
          inspectedEmployee ? (
            <FounderEmployeeView 
              currentUser={currentUser}
              employee={inspectedEmployee} 
              lastWsEvent={lastWsEvent}
              onBackToFounder={() => setInspectedEmployee(null)}
            />
          ) : (
            <AdminDashboard 
              currentUser={currentUser} 
              lastWsEvent={lastWsEvent}
              activeTab={activeTab}
              onInspectEmployee={(emp) => setInspectedEmployee(emp)}
            />
          )
        ) : (
          <EmployeeWorkspace 
            currentUser={currentUser} 
            lastWsEvent={lastWsEvent}
          />
        )}
      </main>
    </div>
  );
}

export default App;
