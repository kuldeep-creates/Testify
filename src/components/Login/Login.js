<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
=======
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
>>>>>>> parent of 9b6885b (reset password and conformation mail)
=======
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
>>>>>>> parent of 9b6885b (reset password and conformation mail)
=======
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
>>>>>>> parent of 9b6885b (reset password and conformation mail)

import { auth, db } from '../../firebase';
import Logger from '../../utils/logger';
import './Login.css';

// Debug function to check user document status
window.debugUserDocument = async (uid) => {
  try {
    const { doc, getDoc } = await import('firebase/firestore');
    const userDocRef = doc(db, 'user', uid);
    const userDocSnap = await getDoc(userDocRef);

    console.log('🔍 User Document Debug:', {
      uid,
      exists: userDocSnap.exists(),
      data: userDocSnap.exists() ? userDocSnap.data() : null,
      path: `user/${uid}`
    });

    return userDocSnap.exists() ? userDocSnap.data() : null;
  } catch (error) {
    console.error('❌ Debug error:', error);
    return null;
  }
};

// Debug function to check verification status
window.debugVerificationStatus = () => {
  console.log('🔍 Verification Status Debug:', {
    userVerified: sessionStorage.getItem('userVerified'),
    pendingUserData: sessionStorage.getItem('pendingUserData'),
    allSessionStorage: Object.keys(sessionStorage).reduce((acc, key) => {
      acc[key] = sessionStorage.getItem(key);
      return acc;
    }, {})
  });

  return {
    userVerified: sessionStorage.getItem('userVerified'),
    pendingUserData: sessionStorage.getItem('pendingUserData')
  };
};

// Debug function to manually set verification flag
window.setVerificationFlag = (value) => {
  sessionStorage.setItem('userVerified', value ? 'true' : 'false');
  console.log('✅ Verification flag set to:', value);
};

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

      // Simple verification check using sessionStorage flag
      const isUserVerified = sessionStorage.getItem('userVerified') === 'true';
      const verificationFlag = sessionStorage.getItem('userVerified');

      // Debug: Log all sessionStorage items
      console.log('🔍 SessionStorage Debug:', {
        userVerified: verificationFlag,
        isUserVerified: isUserVerified,
        allKeys: Object.keys(sessionStorage),
        pendingUserData: sessionStorage.getItem('pendingUserData')
      });

      Logger.debug('Login attempt - checking verification status', {
        email: normalizedEmail,
        uid: user.uid,
        emailVerified: user.emailVerified,
        sessionVerified: isUserVerified,
        verificationFlag: verificationFlag
      });

      // If user is verified in Firebase Auth, allow login regardless of sessionStorage flag
      if (user.emailVerified) {
        Logger.info('User verified in Firebase Auth - allowing login', {
          email: normalizedEmail,
          uid: user.uid,
          emailVerified: user.emailVerified
        });

        // Set the verification flag for future logins
        sessionStorage.setItem('userVerified', 'true');
      } else if (!isUserVerified) {
        // User hasn't verified their email
        await auth.signOut();
        setError('Please verify your email before signing in. Check your inbox and spam folder for the verification link.');
        Logger.warn('Login blocked - user not verified', {
          email: normalizedEmail,
          uid: user.uid,
          emailVerified: user.emailVerified,
          sessionVerified: isUserVerified
        });
        return;
      }

      // User is verified - create or update user document
      try {
        const userDocRef = doc(db, 'user', user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          // Update existing user document
          await updateDoc(userDocRef, {
            emailVerified: true,
            emailVerifiedAt: serverTimestamp(),
            lastLogin: serverTimestamp()
          });
          Logger.info('User document updated during login', {
            email: normalizedEmail,
            uid: user.uid
          });
        } else {
          // Create new user document
          const { setDoc } = await import('firebase/firestore');
          await setDoc(userDocRef, {
            userId: user.uid,
            name: user.displayName || '',
            email: user.email || '',
            role: 'candidate',
            blocked: false,
            domain: 'Full Stack',
            emailVerified: true,
            emailVerifiedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
            lastLogin: serverTimestamp(),
          }, { merge: true });
          Logger.info('User document created during login', {
            email: normalizedEmail,
            uid: user.uid
          });
        }
      } catch (dbError) {
        Logger.error('Error creating/updating user document', {
          error: dbError.message,
          uid: user.uid
        });
        // Continue with login even if document creation fails
      }

      Logger.info('Login successful - user verified', {
        email: normalizedEmail,
        uid: user.uid
      });

      setSuccess('Login successful! Redirecting...');

      // Check for redirect URL from query parameters
      const params = new URLSearchParams(location.search);
      const redirectUrl = params.get('redirect');

      if (redirectUrl) {
        setTimeout(() => navigate(redirectUrl), 800);
      } else {
        setTimeout(() => navigate('/dashboard'), 800);
      }
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
