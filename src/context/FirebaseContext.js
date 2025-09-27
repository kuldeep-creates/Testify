import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { appConfig } from '../config/environment';
import { auth, db } from '../firebase';
import Logger from '../utils/logger';

const FirebaseContext = createContext(null);

export function FirebaseProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userDoc, setUserDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setError('');
      if (!u) {
        setUserDoc(null);
        setLoading(false);
        return;
      }
      
      // Check if email is verified for non-admin users
      if (!u.emailVerified) {
        const userEmail = (u.email || '').toLowerCase();
        const isDefaultAdmin = userEmail === appConfig.superAdminEmail.toLowerCase();
        
        // Allow admin to bypass email verification, but require it for all other users
        if (!isDefaultAdmin) {
          Logger.warn('User with unverified email detected, signing out', {
            email: u.email,
            uid: u.uid,
            emailVerified: u.emailVerified
          });
          
          // Sign out user with unverified email
          await auth.signOut();
          setError('Please verify your email before accessing the application.');
          setLoading(false);
          return;
        }
      }
      
      try {
        const ref = doc(db, 'user', u.uid);
        const snap = await getDoc(ref);
        const userEmail = (u.email || '').toLowerCase();

        // Define role based on email or existing database role
        const isDefaultAdmin = userEmail === appConfig.superAdminEmail.toLowerCase();

        // Check if user already has a role in database (preserve existing roles)
        let existingRole = null;
        if (snap.exists()) {
          existingRole = snap.data().role;
        }

        // If user already has head or admin role, preserve it
        // Otherwise, assign based on email rules
        const headEmails = [
          // Add head emails here - you can modify this list
          'head@testify.com',
          'head1@testify.com'
        ];
        const isHead = headEmails.includes(userEmail);

        // Determine final role
        let assignedRole = 'candidate'; // default

        // Preserve existing head/admin roles unless overridden by email rules
        if (existingRole === 'head' && !isDefaultAdmin) {
          assignedRole = 'head'; // Keep existing head role
        } else if (existingRole === 'admin' && !isDefaultAdmin) {
          assignedRole = 'admin'; // Keep existing admin role (unless overridden by default admin)
        } else if (isDefaultAdmin) {
          assignedRole = 'admin'; // Force admin for default admin email
        } else if (isHead) {
          assignedRole = 'head'; // Assign head based on email
        } else if (existingRole) {
          assignedRole = existingRole; // Keep any other existing role
        }

        Logger.debug('User role assignment', {
          email: u.email,
          existingRole,
          assignedRole
        });
        if (!snap.exists()) {
          await setDoc(ref, {
            userId: u.uid,
            name: u.displayName || '',
            email: u.email || '',
            role: assignedRole,
            blocked: false,
            domain: 'Full Stack',
            emailVerified: u.emailVerified,
            createdAt: serverTimestamp(),
            lastLogin: serverTimestamp(),
          }, { merge: true });
          setUserDoc({ userId: u.uid, name: u.displayName || '', email: u.email || '', role: assignedRole, blocked: false, domain: 'Full Stack', emailVerified: u.emailVerified });
        } else {
          // Check if existing user has wrong role and fix it
          const existingData = snap.data();
          if (existingData.role !== assignedRole) {
            Logger.info('Updating user role', {
              email: u.email,
              fromRole: existingData.role,
              toRole: assignedRole
            });
            try {
              await updateDoc(ref, {
                role: assignedRole,
                emailVerified: u.emailVerified,
                lastLogin: serverTimestamp()
              });
            } catch (updateError) {
              Logger.error('Role update failed', null, updateError);
            }
          }
          
          // Always sync emailVerified status if it differs
          if (existingData.emailVerified !== u.emailVerified) {
            try {
              await updateDoc(ref, {
                emailVerified: u.emailVerified,
                ...(u.emailVerified && !existingData.emailVerifiedAt && { emailVerifiedAt: serverTimestamp() })
              });
              Logger.info('Email verification status synced', {
                uid: u.uid,
                email: u.email,
                emailVerified: u.emailVerified
              });
            } catch (syncError) {
              Logger.error('Email verification sync failed', null, syncError);
            }
          }

          // Real-time subscription & repair
          const unsubDoc = onSnapshot(ref, async (docSnap) => {
            if (!docSnap.exists()) {return;}
            const data = docSnap.data();
            const repair = {};
            if ((u.email || '') && !data.email) {repair.email = u.email;}
            if (!data.userId) {repair.userId = u.uid;}
            if (typeof data.blocked !== 'boolean') {repair.blocked = false;}
            if (!data.role) {repair.role = assignedRole;}
            if (!data.domain) {repair.domain = 'Full Stack';}
            if (typeof data.emailVerified !== 'boolean' || data.emailVerified !== u.emailVerified) {
              repair.emailVerified = u.emailVerified;
              if (u.emailVerified && !data.emailVerifiedAt) {
                repair.emailVerifiedAt = serverTimestamp();
              }
            }
            setUserDoc({ ...data, ...repair });
            if (Object.keys(repair).length > 0) {
              try { 
                await updateDoc(ref, { ...repair, lastLogin: serverTimestamp() }); 
                Logger.debug('User document repaired', { uid: u.uid, repairs: Object.keys(repair) });
              } catch (repairError) {
                Logger.error('Document repair failed', null, repairError);
              }
            }
          }, (error) => {
            // Suppress WebChannelConnection errors
            if (error && error.message && error.message.includes('WebChannelConnection')) {
              return;
            }
            Logger.error('User document snapshot error', null, error);
          });
          // store cleanup on user change
          return () => unsubDoc();
        }
      } catch (e) {
        Logger.error('Firebase context error', {
          errorCode: e.code,
          errorMessage: e.message
        }, e);
        setError(e.message || 'Failed to load user');
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const value = useMemo(() => {
    let sessionRole = null;
    try { sessionRole = sessionStorage.getItem('tc_role_override'); } catch (_) {}
    const effectiveRole = (sessionRole || userDoc?.role || 'candidate').toLowerCase();
    return { user, userDoc, role: effectiveRole, blocked: !!userDoc?.blocked, loading, error };
  }, [user, userDoc, loading, error]);

  return (
    <FirebaseContext.Provider value={value}>
      {children}
    </FirebaseContext.Provider>
  );
}

export function useFirebase() {
  return useContext(FirebaseContext);
}

// Temporary functions to manually set user role/status - call these from browser console
window.setUserRole = async (role) => {
  try {
    const user = auth.currentUser;
    if (!user) {
      Logger.warn('No user logged in for role update');
      return;
    }

    const ref = doc(db, 'user', user.uid);
    await updateDoc(ref, { role: role });
    Logger.info('Role updated successfully', { role });
  } catch (error) {
    Logger.error('Error updating role', null, error);
  }
};

window.blockUser = async (blocked = true) => {
  try {
    const user = auth.currentUser;
    if (!user) {
      Logger.warn('No user logged in for block status update');
      return;
    }

    const ref = doc(db, 'user', user.uid);
    await updateDoc(ref, { blocked: blocked });
    Logger.info('User block status updated', { blocked });
  } catch (error) {
    Logger.error('Error updating block status', null, error);
  }
};
