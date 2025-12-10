import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';
import './Login.css';

// Initialize Supabase
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});

const ResetPassword = () => {
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isValidLink, setIsValidLink] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    // ✅ Parse tokens from the hash fragment (#access_token=...)
    const hash = window.location.hash.startsWith('#')
      ? window.location.hash.substring(1)
      : '';
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const type = params.get('type');

    if (accessToken && type === 'recovery') {
      setIsValidLink(true);

      // ✅ Set session so Supabase can identify the user
      (async () => {
        try {
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken || ''
          });

          const { data, error } = await supabase.auth.getUser();
          if (error) throw error;
          if (data?.user?.email) setEmail(data.user.email);
        } catch (err) {
          console.error(err);
          setError('Invalid or expired reset link.');
          setIsValidLink(false);
        }
      })();
    } else {
      setError('This reset link is missing its token. Please request a new one.');
      setIsValidLink(false);
    }
  }, []);

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      if (!password || password.length < 6) {
        throw new Error('Password must be at least 6 characters long');
      }

      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      // Also update your backend/public users table so credentials stay in sync
      try {
        if (email) {
          const resp = await fetch('http://localhost:4000/api/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
          });
          if (!resp.ok) {
            const data = await resp.json().catch(() => ({}));
            throw new Error(data.error || 'Failed to update password in database');
          }
        }
      } catch (dbErr) {
        console.error('Backend sync failed:', dbErr);
        // Show a non-blocking warning; auth password was already updated
        setMessage('Password updated in Auth. Database sync failed; please try signing in.');
      }

      // Success path
      if (!message) setMessage('Password updated successfully! Redirecting to login...');
      setTimeout(async () => {
        await supabase.auth.signOut();
        navigate('/login');
      }, 2000);
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      {!isValidLink && (
        <div className="login-form">
          <p className="login-error">
            {error ||
              'This reset link is missing its token. Please request a new link.'}
          </p>
          <button
            type="button"
            className="login-btn"
            onClick={() => navigate('/forgot-password')}
          >
            Request New Link
          </button>
        </div>
      )}

      {isValidLink && (
        <form className="login-form" onSubmit={handleResetPassword}>
          <h2>Reset Password</h2>
          {email && <p className="login-subtitle">Account: {email}</p>}

          <div className="login-form-group">
            <label htmlFor="password">New Password</label>
            <input
              id="password"
              type="password"
              className="login-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter new password"
              minLength="6"
              required
            />
          </div>

          <button
            type="submit"
            className={`login-btn ${loading ? 'loading' : ''}`}
            disabled={loading}
          >
            {loading ? 'Updating...' : 'Confirm Password'}
          </button>

          {error && <p className="login-error">{error}</p>}
          {message && <p className="login-success">{message}</p>}
        </form>
      )}
    </div>
  );
};

export default ResetPassword;
