import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminAuth } from './lib/supabase';

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await adminAuth.login(username.trim(), password);
      try { window.dispatchEvent(new Event('admin-auth-changed')); } catch (_) {}
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f1726', color: '#fff', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: 420, background: '#172036', border: '1px solid #24314f', borderRadius: 12, padding: 24, boxShadow: '0 10px 30px rgba(0,0,0,0.35)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: 'linear-gradient(135deg,#1e90ff,#8a2be2)', display: 'grid', placeItems: 'center', fontWeight: 800 }}>M</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: 1 }}>GOLD ROCK</div>
            <div style={{ fontSize: 13, color: '#9bb0d4', letterSpacing: 4 }}>INN • ADMIN</div>
          </div>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Admin Sign in</h1>
        <p style={{ fontSize: 13, color: '#a8b4d6', marginBottom: 16 }}>Sign in with your admin username and password.</p>

        {error && (
          <div style={{ background: '#3b1f26', border: '1px solid #a43a4a', color: '#ffb4be', padding: '10px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
          <div>
            <label htmlFor="username" style={{ display: 'block', fontSize: 13, color: '#b9c7ea', marginBottom: 6 }}>Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              required
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #2a385b', background: '#0e1526', color: '#e7eeff', outline: 'none' }}
            />
          </div>
          <div>
            <label htmlFor="password" style={{ display: 'block', fontSize: 13, color: '#b9c7ea', marginBottom: 6 }}>Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #2a385b', background: '#0e1526', color: '#e7eeff', outline: 'none' }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 6,
              padding: '10px 12px',
              borderRadius: 8,
              background: loading ? '#37528a' : 'linear-gradient(135deg,#2563eb,#7c3aed)',
              border: 'none',
              color: '#fff',
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div style={{ marginTop: 14, fontSize: 12, color: '#96a7cf' }}>
          Trouble signing in? Contact your system administrator.
        </div>
      </div>
    </div>
  );
}
