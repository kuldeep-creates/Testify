import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

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
      try {
        const ref = doc(db, 'user', u.uid);
        const snap = await getDoc(ref);
        const userEmail = (u.email || '').toLowerCase();
        
        // Define role based on email or existing database role
        const isDefaultAdmin = userEmail === 'mrjaaduji@gmail.com';
        
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
        
        console.log('[FirebaseContext] User email:', u.email, 'existingRole:', existingRole, 'assignedRole:', assignedRole);
        if (!snap.exists()) {
          await setDoc(ref, {
            userId: u.uid,
            name: u.displayName || '',
            email: u.email || '',
            role: assignedRole,
            blocked: false,
            domain: 'Full Stack',
            createdAt: serverTimestamp(),
            lastLogin: serverTimestamp(),
          }, { merge: true });
          setUserDoc({ userId: u.uid, name: u.displayName || '', email: u.email || '', role: assignedRole, blocked: false, domain: 'Full Stack' });
        } else {
          // Check if existing user has wrong role and fix it
          const existingData = snap.data();
          if (existingData.role !== assignedRole) {
            console.log('[FirebaseContext] Fixing role for', u.email, 'from', existingData.role, 'to', assignedRole);
            try {
              await updateDoc(ref, { 
                role: assignedRole,
                lastLogin: serverTimestamp() 
              });
            } catch (updateError) {
              console.log('[FirebaseContext] Role update failed:', updateError);
            }
          }
          
          // Real-time subscription & repair
          const unsubDoc = onSnapshot(ref, async (docSnap) => {
            if (!docSnap.exists()) return;
            const data = docSnap.data();
            const repair = {};
            if ((u.email || '') && !data.email) repair.email = u.email;
            if (!data.userId) repair.userId = u.uid;
            if (typeof data.blocked !== 'boolean') repair.blocked = false;
            if (!data.role) repair.role = assignedRole;
            if (!data.domain) repair.domain = 'Full Stack';
            setUserDoc({ ...data, ...repair });
            if (Object.keys(repair).length > 0) {
              try { await updateDoc(ref, { ...repair, lastLogin: serverTimestamp() }); } catch (_) {}
            }
          }, (error) => {
            // Suppress WebChannelConnection errors
            if (error && error.message && error.message.includes('WebChannelConnection')) {
              return;
            }
            console.error('[FirebaseContext] onSnapshot error:', error);
          });
          // store cleanup on user change
          return () => unsubDoc();
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.log('[FirebaseContext:error]', e.code, e.message);
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
      console.log('No user logged in');
      return;
    }
    
    const ref = doc(db, 'user', user.uid);
    await updateDoc(ref, { role: role });
    console.log(`Role updated to: ${role}. Please refresh the page.`);
  } catch (error) {
    console.error('Error updating role:', error);
  }
};

window.blockUser = async (blocked = true) => {
  try {
    const user = auth.currentUser;
    if (!user) {
      console.log('No user logged in');
      return;
    }
    
    const ref = doc(db, 'user', user.uid);
    await updateDoc(ref, { blocked: blocked });
    console.log(`User ${blocked ? 'blocked' : 'unblocked'}. Please refresh the page.`);
  } catch (error) {
    console.error('Error updating block status:', error);
  }
};
