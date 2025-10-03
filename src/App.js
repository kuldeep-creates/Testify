import React from 'react';
import './App.css';
import { Routes, Route, Navigate } from 'react-router-dom';

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
// Direct imports to avoid chunk loading issues
=======
>>>>>>> parent of 9b6885b (reset password and conformation mail)
=======
>>>>>>> parent of 9b6885b (reset password and conformation mail)
=======
>>>>>>> parent of 9b6885b (reset password and conformation mail)
import Account from './components/Account/Account';
import Blocked from './components/Blocked/Blocked';
import Dashboard from './components/Dashboard/Dashboard';
import Login from './components/Login/Login';
import Register from './components/Register/Register';
import TestRunner from './components/TestRunner/TestRunner';
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
import FirebaseActionHandler from './components/Auth/FirebaseActionHandler';

// Loading component for Suspense
const LoadingFallback = () => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    backgroundColor: '#f8fafc'
  }}>
    <div style={{
      width: '48px',
      height: '48px',
      border: '2px solid #e5e7eb',
      borderTop: '2px solid #3b82f6',
      borderRadius: '50%',
      animation: 'spin 1s linear infinite'
    }} />
    <style>{`
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `}</style>
  </div>
);
=======
>>>>>>> parent of 9b6885b (reset password and conformation mail)
=======
>>>>>>> parent of 9b6885b (reset password and conformation mail)
=======
>>>>>>> parent of 9b6885b (reset password and conformation mail)

function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/test/:testId" element={<TestRunner />} />
      <Route path="/blocked" element={<Blocked />} />
      <Route path="/account" element={<Account />} />
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
      {/* Firebase action handler for email verification, password reset, etc. */}
      <Route path="/__/auth/action" element={<FirebaseActionHandler />} />
=======
>>>>>>> parent of 9b6885b (reset password and conformation mail)
=======
>>>>>>> parent of 9b6885b (reset password and conformation mail)
=======
>>>>>>> parent of 9b6885b (reset password and conformation mail)
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
