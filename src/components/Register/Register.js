import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { auth, db } from '../../firebase';
import Logger from '../../utils/logger';
import './Register.css';

function Register() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordValidation, setPasswordValidation] = useState({
    length: false,
    uppercase: false,
    number: false
  });

  const validatePassword = (password) => {
    const errors = [];

    if (password.length < 8) {
      errors.push('at least 8 characters');
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('at least one uppercase letter');
    }

    if (!/[0-9]/.test(password)) {
      errors.push('at least one number');
    }

    return errors;
  };

  const updatePasswordValidation = (password) => {
    setPasswordValidation({
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      number: /[0-9]/.test(password)
    });
  };

  const handlePasswordChange = (e) => {
    const newPassword = e.target.value;
    setPassword(newPassword);
    updatePasswordValidation(newPassword);
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validate password strength
    const passwordErrors = validatePassword(password);
    if (passwordErrors.length > 0) {
      setError(`Password must contain ${passwordErrors.join(', ')}`);
      return;
    }

    // Validate passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const normalizedEmail = email.trim();
      const cred = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
      const uid = cred.user.uid;
      try {
        await setDoc(doc(db, 'user', uid), {
          userId: uid,
          name,
          email: normalizedEmail,
          role: 'candidate', // Default to candidate, admin can change role
          blocked: false,
          approved: false, // Requires admin approval
          domain: 'Full Stack', // Default domain, admin can change
          createdAt: serverTimestamp(),
          lastLogin: serverTimestamp(),
        }, { merge: true });
      } catch (writeErr) {
        Logger.warn('Profile creation failed during registration', {
          errorCode: writeErr.code,
          errorMessage: writeErr.message
        });
        // Continue to dashboard; FirebaseContext will attempt to create profile lazily
      }
      setSuccess('Account created! Redirecting...');
      
      // Check for redirect parameter
      const redirectTo = searchParams.get('redirect');
      if (redirectTo) {
        setTimeout(() => navigate(decodeURIComponent(redirectTo)), 800);
      } else {
        setTimeout(() => navigate('/dashboard'), 800);
      }
    } catch (err) {
      Logger.error('Registration failed', {
        errorCode: err.code,
        errorMessage: err.message
      }, err);
      const byCode = {
        'auth/email-already-in-use': 'This email is already registered. Sign in instead.',
        'auth/invalid-email': 'Please enter a valid email address.',
        'auth/weak-password': 'Password should be at least 6 characters.',
      };
      setError(byCode[err.code] || err.message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-container" role="main">
      {/* Background Illustrations */}
      <div className="register-background" />
      <div className="register-background" />
      <div className="register-background" />
      <div className="register-background" />

      {/* Main Registration Container */}
      <div className="register-main">
        <div className="register-header">
          <h1 className="register-title">Create Account</h1>
        </div>

        <div className="register-card">
            {error && (
              <div className="register-error" role="alert" aria-live="assertive">
                <span className="register-error-text">{error}</span>
              </div>
            )}
            {success && (
              <div className="register-success" role="status" aria-live="polite">
                <span className="register-success-text">{success}</span>
              </div>
            )}

            <form className="register-form" onSubmit={handleSubmit} aria-describedby="form-help">
              <div className="register-form-fields">
                <div className="register-field">
                  <label className="register-label" htmlFor="name">
                    Full Name
                  </label>
                  <input
                    id="name"
                    type="text"
                    className="register-input"
                    placeholder="Full name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>

                <div className="register-field">
                  <label className="register-label" htmlFor="email">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    className="register-input"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="register-field">
                  <label className="register-label" htmlFor="password">
                    Password
                  </label>
                  <div className="register-password-container">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      className="register-input"
                      placeholder="Password"
                      value={password}
                      onChange={handlePasswordChange}
                      required
                    />
                    <button
                      type="button"
                      className="register-password-toggle"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <svg className="register-password-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                        </svg>
                      ) : (
                        <svg className="register-password-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>

                  {/* Password Requirements */}
                  {password && !(passwordValidation.length && passwordValidation.uppercase && passwordValidation.number) && (
                    <div className="password-requirements">
                      <div className={`requirement ${passwordValidation.length ? 'valid' : 'invalid'}`}>
                        <span className="requirement-icon">{passwordValidation.length ? '✓' : '✗'}</span>
                        At least 8 characters
                      </div>
                      <div className={`requirement ${passwordValidation.uppercase ? 'valid' : 'invalid'}`}>
                        <span className="requirement-icon">{passwordValidation.uppercase ? '✓' : '✗'}</span>
                        One uppercase letter
                      </div>
                      <div className={`requirement ${passwordValidation.number ? 'valid' : 'invalid'}`}>
                        <span className="requirement-icon">{passwordValidation.number ? '✓' : '✗'}</span>
                        One number
                      </div>
                    </div>
                  )}

                </div>

                <div className="register-field">
                  <label className="register-label" htmlFor="confirmPassword">
                    Confirm Password
                  </label>
                  <div className="register-password-container">
                    <input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      className="register-input"
                      placeholder="Confirm Password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className="register-password-toggle"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                    >
                      {showConfirmPassword ? (
                        <svg className="register-password-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                        </svg>
                      ) : (
                        <svg className="register-password-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <button
                className={`btn btn-primary ${loading ? 'btn-loading' : ''}`}
                type="submit"
                disabled={loading}
              >
                {loading ? 'Creating Account...' : 'Create Account'}
              </button>

              <div className="register-link-container">
                <span className="register-link-text">Already have an account? </span>
                <Link
                  to="/"
                  className="register-link"
                  aria-label="Sign In"
                >
                  Sign In
                </Link>
              </div>


            </form>
          </div>
        </div>
      </div>
  );
}

export default Register;
