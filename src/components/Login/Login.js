import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';

import { auth, db } from '../../firebase';
import Logger from '../../utils/logger';
import './Login.css';

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [validation, setValidation] = useState({ email: '', password: '' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const newValidation = { email: '', password: '' };
    if (!email.trim()) {newValidation.email = 'Email is required';}
    if (password.length < 6) {newValidation.password = 'Password must be at least 6 characters';}
    setValidation(newValidation);
    if (newValidation.email || newValidation.password) {return;}
    
    setLoading(true);
    try {
      const normalizedEmail = email.trim();
      const userCredential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      const user = userCredential.user;

      Logger.info('Login successful', {
        email: normalizedEmail,
        uid: user.uid
      });

      setSuccess('Login successful! Redirecting...');
      setTimeout(() => navigate('/dashboard'), 800);
    } catch (err) {
      Logger.error('Login failed', { errorCode: err.code, errorMessage: err.message }, err);
      const byCode = {
        'auth/invalid-credential': 'Invalid email or password. Please try again.',
        'auth/wrong-password': 'Incorrect password. Try again or reset it.',
        'auth/user-not-found': 'No account found for this email. Please create one.',
        'auth/too-many-requests': 'Too many attempts. Please wait a bit and try again.',
      };
      setError(byCode[err.code] || 'Failed to sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  
  return (
    <div className="login-container" role="main">
      {/* Background Illustrations */}
      <div className="login-background login-bg-1" />
      <div className="login-background login-bg-2" />
      <div className="login-background login-bg-3" />
      <div className="login-background login-bg-4" />

      {/* Main Login Container */}
      <div className="login-main">
        {/* Brand Header */}
        <div className="login-header">
          <h1 className="login-title">Welcome Back</h1>
          <p className="login-subtitle">Sign in to continue</p>
        </div>

        {/* Login Form Card */}
        <div className="login-card">
            {error && (
              <div className="login-error" role="alert" aria-live="assertive">
                <span>{error}</span>
              </div>
            )}
            {success && (
              <div className="login-success" role="status" aria-live="polite">
                <span>{success}</span>
              </div>
            )}

            <form className="login-form" onSubmit={handleSubmit} aria-describedby="form-help">
              <div className="login-form-fields">
                {/* Email Field */}
                <div className="login-field">
                  <label className="login-label" htmlFor="email">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    className="login-input"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    aria-invalid={!!validation.email}
                    aria-describedby={validation.email ? 'email-error' : undefined}
                  />
                  {validation.email && (
                    <div id="email-error" className="login-error-message" role="alert">
                      {validation.email}
                    </div>
                  )}
                </div>

                {/* Password Field */}
                <div className="login-field">
                  <label className="login-label" htmlFor="password">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    className="login-input"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    aria-invalid={!!validation.password}
                    aria-describedby={validation.password ? 'password-error' : undefined}
                  />
                  {validation.password && (
                    <div id="password-error" className="login-error-message" role="alert">
                      {validation.password}
                    </div>
                  )}
                </div>


                {/* Login Button */}
                <button 
                  className={`btn btn-primary ${loading ? 'btn-loading' : ''}`}
                  type="submit"
                  disabled={loading}
                >
                  {loading ? 'Signing in...' : 'Sign In'}
                </button>
              </div>

              {/* Sign Up Link */}
              <div className="login-link-container">
                <span className="login-link-text">Don't have an account? </span>
                <Link
                  to="/register"
                  className="login-link"
                  aria-label="Create New Account"
                >
                  Sign Up
                </Link>
              </div>
            </form>
          </div>
        </div>
      </div>
  );
}

export default Login;
