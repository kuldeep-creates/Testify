import React, { Suspense, lazy } from 'react';
import './App.css';
import { Routes, Route, Navigate } from 'react-router-dom';

// Lazy load components for better performance
const Account = lazy(() => import('./components/Account/Account'));
const Blocked = lazy(() => import('./components/Blocked/Blocked'));
const Dashboard = lazy(() => import('./components/Dashboard/Dashboard'));
const Login = lazy(() => import('./components/Login/Login'));
const Register = lazy(() => import('./components/Register/Register'));
const TestRunner = lazy(() => import('./components/TestRunner/TestRunner'));
const FirebaseActionHandler = lazy(() => import('./components/Auth/FirebaseActionHandler'));

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
    <Suspense fallback={<LoadingFallback />}>
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
    </Suspense>
  );
}

export default App;
