// Firebase configuration and initialization
import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore, enableNetwork, disableNetwork } from 'firebase/firestore';

import { firebaseConfig } from './config/environment';

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
// Enable persistence for the auth state
setPersistence(auth, browserLocalPersistence)
  .then(() => {
    console.log('Auth state persistence enabled');
  })
  .catch((error) => {
    console.error('Error enabling auth persistence:', error);
  });
export const db = getFirestore(app);

// Connection management functions
export const enableFirestoreNetwork = () => enableNetwork(db);
export const disableFirestoreNetwork = () => disableNetwork(db);

// Connection status monitoring
let connectionStatus = 'unknown';
export const getConnectionStatus = () => connectionStatus;

// Monitor connection status
export const monitorConnection = () => {
  // This is a simplified connection monitoring
  // In a real app, you might want to use Firebase's built-in connection monitoring
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      connectionStatus = 'offline';
      resolve(false);
    }, 5000);
    
    // Try a simple read operation to test connection
    import('firebase/firestore').then(({ doc, getDoc }) => {
      getDoc(doc(db, 'tests', 'connection-test'))
        .then(() => {
          clearTimeout(timeout);
          connectionStatus = 'online';
          resolve(true);
        })
        .catch(() => {
          clearTimeout(timeout);
          connectionStatus = 'offline';
        });
    });
  });
};

// Secure error handling for Firebase (only in production)
if (process.env.NODE_ENV === 'production') {
  const originalConsoleError = console.error;
  console.error = (...args) => {
    const message = args[0];
    // Only suppress known non-security Firebase connection errors in production
    if (typeof message === 'string' && 
        (message.includes('WebChannelConnection RPC') || 
         message.includes('Failed to get document because the client is offline') || 
         message.includes('@firebase/firestore'))) {
      // Log to monitoring service instead of console in production
      // TODO: Send to monitoring service (Sentry, etc.)
      return;
    }
    // Log all other errors normally (including security-related ones)
    originalConsoleError.apply(console, args);
  };
}

// Suppress unhandled promise rejections for Firebase
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason && event.reason.message && 
      (event.reason.message.includes('WebChannelConnection') || 
       event.reason.message.includes('@firebase/firestore'))) {
    event.preventDefault();
  }
});

export default app;
