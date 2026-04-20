// src/sections/LoginScreen.jsx
import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';

export default function LoginScreen() {
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [showPwd, setShowPwd]     = useState(false);
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);

  async function handleLogin() {
    setError('');
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      // App.jsx auth listener handles the rest
    } catch (e) {
      console.error('[Login error]', e.code, e.message);
      switch (e.code) {
        case 'auth/invalid-credential':
        case 'auth/wrong-password':
        case 'auth/user-not-found':
          setError('Incorrect email or password. Please check your credentials and try again.');
          break;
        case 'auth/invalid-email':
          setError('The email address you entered is not valid.');
          break;
        case 'auth/user-disabled':
          setError('This account has been disabled. Contact your administrator.');
          break;
        case 'auth/too-many-requests':
          setError('Too many failed attempts. Please wait a moment and try again.');
          break;
        case 'auth/network-request-failed':
          setError('No internet connection. Please check your network and try again.');
          break;
        default:
          setError(`Login failed (${e.code || 'unknown error'}). Please try again or contact your administrator.`);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <img
          src="./img/icon_bg.png"
          alt="KCDL Logo"
          className="login-logo"
        />
        <h1 className="login-title">Copra Inspector</h1>
        <p className="login-subtitle">Kiribati Coconut Development Ltd</p>

        {error && (
          <div className="login-error">
            <span className="login-error-icon">⚠️</span> {error}
          </div>
        )}

        <label className="login-label">Email</label>
        <input
          className="login-input"
          type="text"
          placeholder="Enter email here"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="email"
        />

        <label className="login-label">Password</label>
        <div className="login-pwd-wrap">
          <input
            className="login-input login-pwd-input"
            type={showPwd ? 'text' : 'password'}
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            autoComplete="current-password"
          />
          <button
            className="login-pwd-eye"
            type="button"
            onClick={() => setShowPwd(v => !v)}
            aria-label={showPwd ? 'Hide password' : 'Show password'}
            tabIndex={-1}
          >
            {showPwd ? '🙈' : '👁️'}
          </button>
        </div>

        <button
          className="btn-primary login-btn"
          onClick={handleLogin}
          disabled={loading}
          type="button"
        >
          {loading ? 'Signing in…' : 'Sign In'}
        </button>

        <p className="login-footer">
          Contact your administrator to get access.
        </p>
      </div>
    </div>
  );
}
