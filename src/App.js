import React, { Suspense, lazy } from 'react';
import './App.css';
import { Routes, Route, Navigate } from 'react-router-dom';

// Error boundary for chunk loading errors
class ChunkErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    // Check if it's a chunk loading error
    if (error.name === 'ChunkLoadError' || error.message.includes('Loading chunk')) {
      return { hasError: true };
    }
    return null;
  }

  componentDidCatch(error, errorInfo) {
    if (error.name === 'ChunkLoadError' || error.message.includes('Loading chunk')) {
      console.log('Chunk loading error detected, reloading page...');
      window.location.reload();
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          backgroundColor: '#f8fafc',
          flexDirection: 'column'
        }}>
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <h2>Loading Error</h2>
            <p>There was an error loading the application. Refreshing...</p>
            <button 
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 20px',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer'
              }}
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

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
    <ChunkErrorBoundary>
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
    </ChunkErrorBoundary>
  );
}

export default App;
