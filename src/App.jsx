import React, { useState, useEffect } from 'react';
import { HeaderNav } from './components/HeaderNav';
import { AdminDashboard } from './components/AdminDashboard';
import { EmployeeWorkspace } from './components/EmployeeWorkspace';
import { AlertTriangle, X, ShieldAlert } from 'lucide-react';

export function App() {
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [lastWsEvent, setLastWsEvent] = useState(null);

  // ACTION 2: Toast Alert State for Hardware Spoofing
  const [spoofAlerts, setSpoofAlerts] = useState([]);

  // Fetch 6 pre-seeded users
  useEffect(() => {
    fetch('/api/users')
      .then(res => res.json())
      .then(data => {
        setUsers(data);
        if (data.length > 0) {
          // Default to Founder 1 (Sarah Vance)
          setCurrentUser(data[0]);
        }
      })
      .catch(err => console.error('Failed to load users', err));
  }, []);

  // WebSocket Connection for Sub-Second Telemetry & Action 2 Alerts
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    let socket;

    try {
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        setWsConnected(true);
      };

      socket.onclose = () => {
        setWsConnected(false);
      };

      socket.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          setLastWsEvent(parsed);

          // ACTION 2 TRIGGER: Push Toast Alert instantly when hardware_spoof_flag is true
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
        } catch (e) {
          console.error('Error parsing WS message', e);
        }
      };
    } catch (err) {
      console.error('WebSocket connection error', err);
    }

    return () => {
      if (socket) socket.close();
    };
  }, []);

  // Handle Switch User (RBAC Router)
  const handleSwitchUser = async (userId) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      const data = await res.json();
      if (data.success) {
        setCurrentUser(data.user);
      }
    } catch (err) {
      console.error('Login switch failed', err);
    }
  };

  // Simulate Spoof Signal (Demo helper for Action 2)
  const handleSimulateSpoof = async () => {
    try {
      await fetch('/api/telemetry/simulate-spoof', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'usr_emp_02', taskId: 'tsk_002' })
      });
    } catch (err) {
      console.error('Failed to trigger spoof simulation', err);
    }
  };

  if (!currentUser) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#07090e', color: '#00d2ff', fontFamily: 'monospace' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px' }}>
          <span className="status-dot live"></span>
          <span>INITIALIZING ANTIGRAVITY RBAC & TELEMETRY ENGINE...</span>
        </div>
      </div>
    );
  }

  const isFounder = currentUser.role === 'founder';

  return (
    <div className="app-container">
      {/* HUD Header with Identity, MAC, and RBAC Switcher */}
      <HeaderNav 
        currentUser={currentUser}
        users={users}
        onSwitchUser={handleSwitchUser}
        wsConnected={wsConnected}
        onSimulateSpoof={handleSimulateSpoof}
      />

      {/* ACTION 2: URGENT HARDWARE SPOOF ALERT TOASTS (Pushed to Founder View) */}
      <div className="toast-container">
        {spoofAlerts.map(alert => (
          <div key={alert.id} className="toast">
            <ShieldAlert size={26} color="var(--accent-crimson)" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span className="heading" style={{ fontSize: '13px', color: 'var(--accent-crimson)', fontWeight: '700' }}>
                  {alert.alertTitle || 'ACTION 2: HARDWARE SPOOF ALERT'}
                </span>
                <button 
                  onClick={() => setSpoofAlerts(prev => prev.filter(a => a.id !== alert.id))}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <X size={14} />
                </button>
              </div>
              <p style={{ fontSize: '12px', color: '#fca5a5', lineHeight: '1.4', marginBottom: '6px' }}>
                {alert.alertMessage}
              </p>
              <div className="mono" style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                Target: {alert.log?.user_name} ({alert.log?.device_mac_address}) • Window: {alert.log?.active_window}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Dynamic View Routing Based on Role */}
      {isFounder ? (
        <AdminDashboard 
          currentUser={currentUser} 
          lastWsEvent={lastWsEvent}
        />
      ) : (
        <EmployeeWorkspace 
          currentUser={currentUser} 
          lastWsEvent={lastWsEvent}
        />
      )}
    </div>
  );
}

export default App;
