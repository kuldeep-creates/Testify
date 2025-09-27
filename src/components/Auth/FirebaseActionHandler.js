import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { applyActionCode, onAuthStateChanged, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, updateDoc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { showError, showSuccess } from '../../utils/notifications';
import Logger from '../../utils/logger';
import './FirebaseActionHandler.css';

/**
 * Handles Firebase email action links (email verification, password reset, etc.)
 * This component should be rendered at the /__/auth/action route in your app
 */
export default function FirebaseActionHandler() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const handleAction = async () => {
      const mode = searchParams.get('mode');
      const oobCode = searchParams.get('oobCode');
      // const continueUrl = searchParams.get('continueUrl');
      // const lang = searchParams.get('lang') || 'en';

      if (!oobCode) {
        showError('Invalid action link. Please request a new one.');
        navigate('/login');
        return;
      }

      try {
        switch (mode) {
          case 'verifyEmail':
            // Handle email verification for existing users
            await applyActionCode(auth, oobCode);
            
            // Update the emailVerified status in Firestore
            const updateEmailVerificationStatus = () => {
              return new Promise((resolve) => {
                const unsubscribe = onAuthStateChanged(auth, async (user) => {
                  if (user && user.emailVerified) {
                    try {
                      const userRef = doc(db, 'user', user.uid);
                      await updateDoc(userRef, {
                        emailVerified: true,
                        emailVerifiedAt: serverTimestamp()
                      });
                      Logger.info('Email verification status updated in database', {
                        uid: user.uid,
                        email: user.email
                      });
                    } catch (error) {
                      Logger.error('Failed to update email verification status', {
                        uid: user.uid,
                        email: user.email,
                        error: error.message
                      });
                    }
                    unsubscribe();
                    resolve();
                  }
                });
              });
            };
            
            // Wait for auth state to update, then update database
            await updateEmailVerificationStatus();
            
            showSuccess('Email verified successfully! You can now sign in.');
            navigate('/login?verified=true');
            break;

          case 'resetPassword':
            // Handle password reset - redirect to password reset page with the code
            navigate(`/reset-password?oobCode=${oobCode}`);
            break;

          case 'recoverEmail':
            // Handle email recovery
            await applyActionCode(auth, oobCode);
            showSuccess('Email recovered successfully! You can now sign in with your recovered email.');
            navigate('/login');
            break;

          default:
            throw new Error('Invalid action');
        }
      } catch (error) {
        Logger.error('Error handling action code', {
          errorCode: error.code,
          errorMessage: error.message,
          mode,
          oobCode
        });

        const errorMessages = {
          'auth/expired-action-code': 'The action link has expired. Please request a new one.',
          'auth/invalid-action-code': 'Invalid action link. Please request a new one.',
          'auth/user-disabled': 'This account has been disabled.',
          'auth/user-not-found': 'No user found with this email address.',
          'auth/weak-password': 'The password is too weak.',
          'default': 'An error occurred while processing your request. Please try again.'
        };

        showError(errorMessages[error.code] || errorMessages['default']);
        navigate('/login');
      }
    };

    handleAction();
  }, [navigate, searchParams]);

  return (
    <div className="action-handler-container">
      <div className="action-handler-card">
        <div className="action-handler-spinner" />
        <h2 className="action-handler-title">Processing your request</h2>
        <p className="action-handler-text">Please wait while we verify your action...</p>
      </div>
    </div>
  );
}
