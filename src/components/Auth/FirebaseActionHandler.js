import { applyActionCode, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { auth, db } from '../../firebase';
import Logger from '../../utils/logger';
import { showError, showSuccess } from '../../utils/notifications';
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

            // Wait for auth state to update after verification
            let databaseUpdated = false;
            let verifiedUser = null;

            try {
              // Wait for auth state change after applyActionCode
              await new Promise((resolve) => {
                const unsubscribe = onAuthStateChanged(auth, async (user) => {
                  if (user) {
                    try {
                      await user.reload();
                      if (user.emailVerified) {
                        verifiedUser = user;
                        databaseUpdated = true;
                      }
                    } catch (error) {
                      Logger.warn('Failed to reload user after verification', error);
                    }
                    unsubscribe();
                    resolve();
                  } else {
                    unsubscribe();
                    resolve();
                  }
                });

                // Timeout after 10 seconds
                setTimeout(() => resolve(), 10000);
              });

              // Update database if we have a verified user
              if (verifiedUser && databaseUpdated) {
                try {
                  const userRef = doc(db, 'user', verifiedUser.uid);

                  // Check if user document exists first
                  const userDocSnap = await getDoc(userRef);

                  if (userDocSnap.exists()) {
                    // Update existing user document
                    await updateDoc(userRef, {
                      emailVerified: true,
                      emailVerifiedAt: serverTimestamp()
                    });
                    Logger.info('Database updated after email verification', {
                      uid: verifiedUser.uid,
                      email: verifiedUser.email
                    });

                    // Set verification flag to true in sessionStorage
                    sessionStorage.setItem('userVerified', 'true');
                    Logger.info('Verification flag set to true', {
                      uid: verifiedUser.uid,
                      email: verifiedUser.email
                    });
                  } else {
                    // Check for pending user data in sessionStorage
                    let userData = null;
                    try {
                      const pendingData = sessionStorage.getItem('pendingUserData');
                      if (pendingData) {
                        userData = JSON.parse(pendingData);
                        // Clear the pending data
                        sessionStorage.removeItem('pendingUserData');
                      }
                    } catch (parseError) {
                      Logger.warn('Failed to parse pending user data', parseError);
                    }

                    // Create user document with stored data or defaults
                    const userDocData = userData ? {
                      userId: verifiedUser.uid,
                      name: userData.name || verifiedUser.displayName || '',
                      email: verifiedUser.email || '',
                      role: userData.role || 'candidate',
                      blocked: userData.blocked || false,
                      domain: userData.domain || 'Full Stack',
                      emailVerified: true,
                      emailVerifiedAt: serverTimestamp(),
                      createdAt: serverTimestamp(),
                      lastLogin: serverTimestamp(),
                    } : {
                      userId: verifiedUser.uid,
                      name: verifiedUser.displayName || '',
                      email: verifiedUser.email || '',
                      role: 'candidate',
                      blocked: false,
                      domain: 'Full Stack',
                      emailVerified: true,
                      emailVerifiedAt: serverTimestamp(),
                      createdAt: serverTimestamp(),
                      lastLogin: serverTimestamp(),
                    };

                    await setDoc(userRef, userDocData, { merge: true });
                    Logger.info('User document created after email verification', {
                      uid: verifiedUser.uid,
                      email: verifiedUser.email,
                      hasStoredData: !!userData,
                      documentPath: `user/${verifiedUser.uid}`
                    });

                    // Set verification flag to true in sessionStorage
                    sessionStorage.setItem('userVerified', 'true');
                    Logger.info('Verification flag set to true', {
                      uid: verifiedUser.uid,
                      email: verifiedUser.email
                    });

                    // Verify the document was created successfully
                    const verifyDocSnap = await getDoc(userRef);
                    if (verifyDocSnap.exists()) {
                      Logger.info('User document verified after creation', {
                        uid: verifiedUser.uid,
                        documentData: verifyDocSnap.data()
                      });
                    } else {
                      Logger.error('User document creation failed - document not found after creation', {
                        uid: verifiedUser.uid
                      });
                    }
                  }
                } catch (dbError) {
                  Logger.error('Failed to update database after verification', null, dbError);
                  // Still show success to user as verification worked
                }
              }
            } catch (error) {
              Logger.error('Error during email verification process', null, error);
            }

            if (databaseUpdated) {
              showSuccess('Email verified successfully! You can now sign in.');
            } else {
              showSuccess('Email verified! If you still can\'t login, please contact support.');
              Logger.error('Failed to complete email verification process');
            }

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
