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
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font-sans)' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="section-kicker" style={{ marginBottom: '12px' }}>System Initializing</div>
          <h2 className="serif" style={{ fontSize: '28px', color: 'var(--ink)' }}>
            Lexven Operations <span className="accent">Sentinel</span>
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '6px' }}>
            Establishing telemetry websocket & node state...
          </p>
        </div>
      </div>
    );
  }

  const isFounder = currentUser.role === 'founder';

  return (
    <div>
      {/* Header with Lexven Brand, Telemetry Status & Role Switcher */}
      <HeaderNav 
        currentUser={currentUser}
        users={users}
        onSwitchUser={handleSwitchUser}
        wsConnected={wsConnected}
        onSimulateSpoof={handleSimulateSpoof}
      />

      {/* ACTION 2: URGENT HARDWARE ANOMALY TOASTS */}
      <div className="toast-stack">
        {spoofAlerts.map(alert => (
          <div key={alert.id} className="lexven-toast">
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
