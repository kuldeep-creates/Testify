import { createUserWithEmailAndPassword, sendEmailVerification, updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { auth, db } from '../../firebase';
import Logger from '../../utils/logger';
import { showError, showSuccess } from '../../utils/notifications';
import '../../components/Loading/Loading.css';
import './Register.css';

function Register() {
  const navigate = useNavigate();
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
  const [emailSendFailed, setEmailSendFailed] = useState(false);
  const [registeredUser, setRegisteredUser] = useState(null);

  // Check for email verification redirect
  const location = useLocation();
  const [, setVerificationEmailSent] = useState(false);
  const [showConfirmationCard, setShowConfirmationCard] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    // Check if we're returning from email verification
    const params = new URLSearchParams(location.search);
    if (params.get('mode') === 'verifyEmail') {
      showSuccess('Email verified successfully! Please sign in.');
      // Clean up the URL
      window.history.replaceState({}, document.title, location.pathname);
    }
  }, [location]);

  const sendVerificationEmail = async (user, retryCount = 0) => {
    const maxRetries = 2;
    
    try {
      // First try: Send verification email without custom action code settings
      // This uses Firebase's default email template and redirect URL
      await sendEmailVerification(user);
      
      setVerificationEmailSent(true);
      showSuccess(`Verification email sent to ${user.email}. Please check your inbox and spam folder.`);
      
      Logger.info('Verification email sent successfully', {
        email: user.email,
        uid: user.uid,
        attempt: retryCount + 1
      });
      
    } catch (error) {
      Logger.error('Error sending verification email', {
        errorCode: error.code,
        errorMessage: error.message,
        email: user.email,
        attempt: retryCount + 1
      });
      
      // Retry logic for network errors
      if (retryCount < maxRetries && 
          (error.code === 'auth/network-request-failed' || 
           error.code === 'auth/timeout')) {
        Logger.info('Retrying email verification send', { 
          attempt: retryCount + 2, 
          maxRetries: maxRetries + 1 
        });
        
        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
        return sendVerificationEmail(user, retryCount + 1);
      }
      
      // Provide more specific error messages based on error codes
      let errorMessage = 'Failed to send verification email. Please try again later.';
      
      switch (error.code) {
        case 'auth/too-many-requests':
          errorMessage = 'Too many verification emails sent. Please wait a few minutes before trying again.';
          break;
        case 'auth/user-not-found':
          errorMessage = 'User account not found. Please try registering again.';
          break;
        case 'auth/invalid-email':
          errorMessage = 'Invalid email address. Please check your email and try again.';
          break;
        case 'auth/network-request-failed':
          errorMessage = 'Network error. Please check your internet connection and try again.';
          break;
        case 'auth/quota-exceeded':
          errorMessage = 'Email quota exceeded. Please try again later.';
          break;
        case 'auth/unauthorized-domain':
          errorMessage = 'Email domain not authorized. Please contact support.';
          break;
        case 'auth/invalid-continue-uri':
          errorMessage = 'Invalid redirect URL configuration. Please contact support.';
          break;
        default:
          // For unknown errors, provide the actual error message if available
          if (error.message && !error.message.includes('internal')) {
            errorMessage = `Email verification failed: ${error.message}`;
          }
          break;
      }
      
      showError(errorMessage);
      setEmailSendFailed(true);
    }
  };

  const handleResendVerification = async () => {
    if (!registeredUser) return;
    
    setEmailSendFailed(false);
    setLoading(true);
    
    try {
      await sendVerificationEmail(registeredUser);
    } finally {
      setLoading(false);
    }
  };

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
      const user = cred.user;
      
      // Update user's display name
      await updateProfile(user, { displayName: name });
      
      // Create user document in Firestore
      try {
        await setDoc(doc(db, 'user', user.uid), {
          userId: user.uid,
          name,
          email: normalizedEmail,
          role: 'candidate', // Always set new registrations as candidate
          blocked: false,
          domain: 'Full Stack',
          emailVerified: false,
          createdAt: serverTimestamp(),
          lastLogin: serverTimestamp(),
        }, { merge: true });
      } catch (writeErr) {
        Logger.warn('Profile creation failed during registration', {
          errorCode: writeErr.code,
          errorMessage: writeErr.message
        });
      }
      
      // Store user for potential resend
      setRegisteredUser(user);
      
      // Send verification email
      await sendVerificationEmail(user);
      
      // Sign out the user immediately - they must verify email first
      await auth.signOut();
      
      // Show verification required message instead of redirecting
      if (!emailSendFailed) {
        setSuccess('Account created! Please check your email and click the verification link to complete registration.');
        // Show confirmation card instead of navigating
        setUserEmail(normalizedEmail);
        setShowConfirmationCard(true);
      } else {
        setSuccess('Account created, but email verification failed. Please use the resend button below.');
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

  // If confirmation card should be shown
  if (showConfirmationCard) {
    return (
      <div className="register-container" role="main">
        {/* Background Illustrations */}
        <div className="register-background" />
        <div className="register-background" />
        <div className="register-background" />
        <div className="register-background" />

        {/* Confirmation Card */}
        <div className="register-main">
          <div className="confirmation-card">
            <div className="confirmation-icon">
              <svg className="confirmation-check" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            
            <h2 className="confirmation-title">Email Verification Required!</h2>
            <p className="confirmation-message">
              A verification email has been sent to <strong>{userEmail}</strong>
            </p>
            
            <div className="confirmation-steps">
              <h3>Complete Your Registration:</h3>
              <ol>
                <li>Check your email inbox (and spam folder)</li>
                <li>Click the verification link in the email</li>
                <li>Return here and sign in with your credentials</li>
              </ol>
              <p style={{marginTop: '1rem', fontSize: '0.875rem', color: '#dc2626', fontWeight: '500'}}>
                ⚠️ You cannot access your account until you verify your email address.
              </p>
            </div>
            
            <div className="confirmation-actions">
              <button
                className="btn btn-primary"
                onClick={() => navigate('/login')}
              >
                Go to Login
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setShowConfirmationCard(false);
                  setEmail('');
                  setPassword('');
                  setConfirmPassword('');
                  setName('');
                }}
              >
                Register Another Account
              </button>
            </div>
            
            <div className="confirmation-help">
              <p>Didn't receive the email? Check your spam folder or contact support.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

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

              {/* Resend Verification Email Button */}
              {emailSendFailed && registeredUser && (
                <div className="resend-verification-container">
                  <p className="resend-verification-text">
                    Couldn't send verification email? Try again:
                  </p>
                  <button
                    type="button"
                    className={`btn btn-secondary ${loading ? 'btn-loading' : ''}`}
                    onClick={handleResendVerification}
                    disabled={loading}
                  >
                    {loading ? 'Sending...' : 'Resend Verification Email'}
                  </button>
                </div>
              )}

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
