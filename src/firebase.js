// Firebase configuration and initialization
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, enableNetwork, disableNetwork } from 'firebase/firestore';

// Firebase project config (provided by user)
const firebaseConfig = {
  apiKey: "AIzaSyAmPj2LcCZH5E7dojWIZe4krDtOWwWwmpg",
  authDomain: "tester-f8e3c.firebaseapp.com",
  projectId: "tester-f8e3c",
  storageBucket: "tester-f8e3c.firebasestorage.app",
  messagingSenderId: "128966097854",
  appId: "1:128966097854:web:7bb2a56d525f680a8f57ef",
  measurementId: "G-EQQ26KM5P0"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
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
          resolve(false);
        });
    });
  });
};

// Global error suppression for specific Firebase errors
const originalConsoleError = console.error;
console.error = (...args) => {
  const message = args[0];
  if (typeof message === 'string' && message.includes('WebChannelConnection RPC')) {
    // Suppress WebChannelConnection errors
    return;
  }
  if (typeof message === 'string' && message.includes('@firebase/firestore')) {
    // Suppress other Firestore connection errors
    return;
  }
  // Log other errors normally
  originalConsoleError.apply(console, args);
};

// Suppress unhandled promise rejections for Firebase
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason && event.reason.message && 
      (event.reason.message.includes('WebChannelConnection') || 
       event.reason.message.includes('@firebase/firestore'))) {
    event.preventDefault();
  }
});

export default app;
