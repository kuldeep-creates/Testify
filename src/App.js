import React from 'react';
import './App.css';
import { Routes, Route, Navigate } from 'react-router-dom';

// Direct imports to avoid chunk loading issues
import Account from './components/Account/Account';
import Blocked from './components/Blocked/Blocked';
import Dashboard from './components/Dashboard/Dashboard';
import Login from './components/Login/Login';
import Register from './components/Register/Register';
import TestRunner from './components/TestRunner/TestRunner';
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
      {/* Firebase action handler for email verification, password reset, etc. */}
      <Route path="/__/auth/action" element={<FirebaseActionHandler />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
