import React, { useState, useEffect } from 'react';
import Login from './screens/Login.jsx';
import DataInput from './screens/DataInput.jsx';
import Insights from './screens/Insights.jsx';

const SCREENS = ['login', 'data-input', 'insights'];

export default function App() {
  const [screen, setScreen] = useState('login');
  const [token, setToken] = useState(null);
  const [email, setEmail] = useState('');
  const [cleanResult, setCleanResult] = useState(null);

  // Restore session on load
  useEffect(() => {
    const t = localStorage.getItem('token');
    const e = localStorage.getItem('email');
    if (t && e) { setToken(t); setEmail(e); setScreen('data-input'); }
  }, []);

  function handleLogin(t, e) {
    setToken(t); setEmail(e); setScreen('data-input');
  }

  function handleLogout() {
    fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    localStorage.removeItem('token');
    localStorage.removeItem('email');
    setToken(null); setEmail(''); setCleanResult(null); setScreen('login');
  }

  function handleCleanSuccess(result) {
    setCleanResult(result);
    setScreen('insights');
  }

  function handleReset() {
    setCleanResult(null);
    setScreen('data-input');
  }

  const stepLabels = ['Sign in', 'Import data', 'Insights'];
  const stepScreens = ['login', 'data-input', 'insights'];
  const currentIdx = stepScreens.indexOf(screen);

  return (
    <>
      {screen !== 'login' && (
        <header className="app-header">
          <div className="logo">Data<span>Lens</span></div>

          <nav className="nav-steps">
            {stepLabels.slice(1).map((label, i) => {
              const idx = i + 1;
              const isDone = currentIdx > idx;
              const isActive = currentIdx === idx;
              return (
                <div key={label} className={`step-pill ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}`}>
                  <span className="step-dot" />
                  {label}
                </div>
              );
            })}
          </nav>

          <div className="header-right">
            <span className="user-email">{email}</span>
            <button className="btn btn-ghost" style={{ fontSize: 13, padding: '6px 12px' }} onClick={handleLogout}>
              Sign out
            </button>
          </div>
        </header>
      )}

      {screen === 'login' && <Login onLogin={handleLogin} />}
      {screen === 'data-input' && <DataInput token={token} onCleanSuccess={handleCleanSuccess} />}
      {screen === 'insights' && cleanResult && (
        <Insights token={token} cleanResult={cleanResult} onReset={handleReset} />
      )}
    </>
  );
}
