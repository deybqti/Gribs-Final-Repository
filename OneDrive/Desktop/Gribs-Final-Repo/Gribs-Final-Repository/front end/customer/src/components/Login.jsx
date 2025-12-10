import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createClient } from '@supabase/supabase-js';
import "./Login.css";
import logo from "../assets/logo.png";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState("login"); // 'login' or 'signup'
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  // If redirected back from Google, or already signed in with Supabase, persist
  // a lightweight user object in localStorage and navigate home.
  useEffect(() => {
    let isMounted = true;

    const syncSessionToLocalUser = async () => {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      if (!session?.user) return;
      const sUser = session.user;
      const displayName = (
        sUser.user_metadata?.full_name ||
        sUser.user_metadata?.name ||
        sUser.user_metadata?.given_name ||
        "Guest"
      );
      const localUser = {
        id: sUser.id, // Supabase UUID
        email: sUser.email,
        full_name: displayName,
        provider: "google",
        oauth: true,
        created_at: sUser.created_at,
        updated_at: new Date().toISOString()
      };
      if (isMounted) {
        localStorage.setItem("user", JSON.stringify(localUser));
        try {
          const profileEmail = (localUser.email || '').toLowerCase();
          const { data: existing, error: exErr } = await supabase
            .from('customer_profiles')
            .select('id')
            .eq('email', profileEmail)
            .maybeSingle();
          if (!exErr && !existing) {
            await supabase.from('customer_profiles').insert({ full_name: localUser.full_name, email: profileEmail });
          }
        } catch (_) {}
        navigate("/");
      }
    };

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const sUser = session.user;
        const displayName = (
          sUser.user_metadata?.full_name ||
          sUser.user_metadata?.name ||
          sUser.user_metadata?.given_name ||
          "Guest"
        );
        const localUser = {
          id: sUser.id,
          email: sUser.email,
          full_name: displayName,
          provider: "google",
          oauth: true,
          created_at: sUser.created_at,
          updated_at: new Date().toISOString()
        };
        localStorage.setItem("user", JSON.stringify(localUser));
        try {
          const profileEmail = (localUser.email || '').toLowerCase();
          const { data: existing, error: exErr } = await supabase
            .from('customer_profiles')
            .select('id')
            .eq('email', profileEmail)
            .maybeSingle();
          if (!exErr && !existing) {
            await supabase.from('customer_profiles').insert({ full_name: localUser.full_name, email: profileEmail });
          }
        } catch (_) {}
        navigate("/");
      }
    });

    // Also check current session on mount
    syncSessionToLocalUser();

    return () => {
      isMounted = false;
      sub.subscription?.unsubscribe?.();
    };
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    if (!email || !password || (mode === "signup" && !fullName)) {
      setError("Please fill in all required fields.");
      setLoading(false);
      return;
    }
    if (mode === "login") {
      // Login using Supabase Auth so password resets match the same source of truth
      try {
        const { data, error: sError } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password
        });
        if (sError) {
          setError(sError.message || "Invalid login credentials");
          setLoading(false);
          return;
        }
        const sUser = data?.user;
        if (!sUser) {
          setError("Login failed. Please try again.");
          setLoading(false);
          return;
        }
        const displayName = (
          sUser.user_metadata?.full_name ||
          sUser.user_metadata?.name ||
          sUser.user_metadata?.given_name ||
          "Guest"
        );
        const localUser = {
          id: sUser.id,
          email: sUser.email,
          full_name: displayName,
          provider: "password",
          oauth: false,
          created_at: sUser.created_at,
          updated_at: new Date().toISOString()
        };
        localStorage.setItem("user", JSON.stringify(localUser));
        navigate("/");
      } catch (err) {
        setError("Login failed. Please try again later.");
      }
    } else {
      // Sign up, then create profile and sign in (if confirmation not required)
      try {
        const emailLc = email.trim().toLowerCase();
        const { data, error: sError } = await supabase.auth.signUp({
          email: emailLc,
          password,
          options: { data: { full_name: fullName } }
        });
        if (sError) {
          setError(sError.message || "Registration failed");
          setLoading(false);
          return;
        }
        const userId = data?.user?.id;
        // Try to sign in immediately (will fail if email confirmation required)
        const { data: signInData, error: signErr } = await supabase.auth.signInWithPassword({ email: emailLc, password });
        if (!signErr && signInData?.user) {
          // Upsert customer profile by email if missing
          try {
            const { data: existing, error: exErr } = await supabase
              .from('customer_profiles')
              .select('id')
              .eq('email', emailLc)
              .maybeSingle();
            if (!exErr && !existing) {
              await supabase.from('customer_profiles').insert({ full_name: fullName, email: emailLc });
            }
          } catch (_) {}
          const sUser = signInData.user;
          const displayName = fullName || sUser.user_metadata?.full_name || "Guest";
          const localUser = { id: sUser.id, email: sUser.email, full_name: displayName, provider: "password", oauth: false, created_at: sUser.created_at, updated_at: new Date().toISOString() };
          localStorage.setItem("user", JSON.stringify(localUser));
          navigate("/");
        } else {
          setMessage("Sign up successful. Please verify your email before logging in.");
          setMode("login");
        }
      } catch (err) {
        setError("Registration failed. Please try again later.");
      }
    }
    setLoading(false);
  };

  const handleGoogleSignIn = async () => {
    try {
      setError("");
      setLoading(true);
      const redirectTo = `${window.location.origin}/login`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          queryParams: {
            prompt: 'select_account',
            access_type: 'offline'
          }
        }
      });
      if (error) {
        setError(error.message);
        setLoading(false);
      }
      // On success, Supabase redirects to Google and back; no need to unset loading here.
    } catch (err) {
      setError("Google sign-in failed. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <form className="login-form" onSubmit={handleSubmit}>
        <div className="login-header">
          <div className="login-logo" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <img src={logo} alt="Gold Rock Inn" style={{ width: 96, height: 96, objectFit: 'contain' }} />
            <span style={{ fontFamily: 'Segoe UI, Arial, sans-serif', fontWeight: 800, fontSize: 32, color: '#254e70', lineHeight: 1 }}>
              Gold Rock Inn
            </span>
          </div>
          <h2 className="login-title">
            {mode === "login" ? "Welcome " : "Create Account"}
          </h2>
          <p className="login-subtitle">
            {mode === "login" 
              ? "Sign in to access your account" 
              : "Create an account to get started"}
          </p>
        </div>

        {message && (
          <div className="login-success">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M9 12l2 2 4-4"></path>
            </svg>
            {message}
          </div>
        )}
        {error && (
          <div className="login-error">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            {error}
          </div>
        )}

        {mode === "signup" && (
          <div className="login-form-group">
            <label className="login-label" htmlFor="fullName">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              Full Name
            </label>
            <input
              id="fullName"
              type="text"
              className="login-input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="John Doe"
              disabled={loading}
            />
          </div>
        )}

        <div className="login-form-group">
          <label className="login-label" htmlFor="email">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
              <polyline points="22,6 12,13 2,6"></polyline>
            </svg>
            Email Address
          </label>
          <input
            id="email"
            type="email"
            className="login-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            disabled={loading}
          />
        </div>

        <div className="login-form-group">
          <label className="login-label" htmlFor="password">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            Password
          </label>
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'relative' }}>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                className="login-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={loading}
                style={{ 
                  paddingRight: '40px',
                  width: '100%',
                  boxSizing: 'border-box'
                }}
              />
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setShowPassword(!showPassword);
                }}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#64748b',
                  padding: '4px',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                  outline: 'none'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                tabIndex="-1"
              >
                {showPassword ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {mode === "login" && (
          <div style={{ textAlign: 'right', marginTop: '-10px' }}>
            <button
              type="button"
              className="login-link"
              onClick={(e) => {
                e.preventDefault();
                navigate('/forgot-password');
              }}
              style={{ 
                fontSize: '0.85rem', 
                padding: '4px 0',
                background: 'none',
                border: 'none',
                color: '#3b82f6',
                cursor: 'pointer',
                textDecoration: 'underline'
              }}
            >
              Forgot password?
            </button>
          </div>
        )}

        <button 
          type="submit" 
          className={`login-btn ${loading ? 'loading' : ''}`} 
          disabled={loading}
        >
          {!loading && (mode === "login" ? "Sign In" : "Create Account")}
        </button>

        <div className="login-footer">
          {mode === "login" ? (
            <>
              Don't have an account?{" "}
              <button
                type="button"
                className="login-link"
                onClick={() => {
                  setMode("signup");
                  setError("");
                }}
                disabled={loading}
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                className="login-link"
                onClick={() => {
                  setMode("login");
                  setError("");
                }}
                disabled={loading}
              >
                Sign in
              </button>
            </>
          )}
        </div>

        <div style={{ marginTop: '0.5rem', textAlign: 'center', position: 'relative' }}>
          <div style={{
            position: 'relative',
            textAlign: 'center',
            margin: '0.5rem 0',
            color: 'var(--color-muted)'
          }}>
            <span style={{
              display: 'inline-block',
              padding: '0 10px',
              backgroundColor: 'var(--color-surface)',
              position: 'relative',
              zIndex: 1,
              fontSize: '0.9rem'
            }}>
              Or continue with
            </span>
            <div style={{
              position: 'absolute',
              top: '50%',
              left: 0,
              right: 0,
              height: '1px',
              backgroundColor: 'var(--color-border)',
              zIndex: 0
            }} />
          </div>
          
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              padding: '0.7rem',
              backgroundColor: 'white',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              color: '#444',
              fontSize: '0.95rem',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              gap: '8px',
              marginTop: '0.25rem'
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>
        </div>
      </form>
    </div>
  );
};

export default Login; 