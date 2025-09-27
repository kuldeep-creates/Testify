import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import './index.css';
import App from './App';
import { FirebaseProvider } from './context/FirebaseContext';
import reportWebVitals from './reportWebVitals';

// DISABLE ALL CONSOLE OUTPUT IN DEVELOPMENT
if (process.env.NODE_ENV === 'development') {
  console.log = () => {};
  console.warn = () => {};
  console.info = () => {};
  console.debug = () => {};
  // Keep console.error for critical errors only
  const originalError = console.error;
  console.error = (...args) => {
    // Only show critical Firebase/React errors
    const message = args[0];
    if (
      typeof message === 'string' &&
      (message.includes('Warning:') || message.includes('Error:') || message.includes('Failed to'))
    ) {
      return; // Suppress warnings and non-critical errors
    }
    originalError.apply(console, args);
  };
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter basename={process.env.PUBLIC_URL || ''}>
      <FirebaseProvider>
        <App />
      </FirebaseProvider>
    </BrowserRouter>
  </React.StrictMode>
);

reportWebVitals();
