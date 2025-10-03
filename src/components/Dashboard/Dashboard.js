import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { useFirebase } from '../../context/FirebaseContext';
import Blocked from '../Blocked/Blocked';
import Loading from '../Loading/Loading';

import AdminDashboard from './AdminDashboard/AdminDashboard';
import HeadDashboard from './HeadDashboard/HeadDashboard';
import UserDashboard from './UserDashboard/UserDashboard';
import './Dashboard.css';

function Dashboard() {
  const navigate = useNavigate();
  const { user, userDoc, blocked, loading } = useFirebase();
  const role = (userDoc?.role || 'candidate').toLowerCase();

  useEffect(() => {
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
    // Check for email verification success
    const params = new URLSearchParams(location.search);
    if (params.get('verified') === 'true') {
      const roleParam = params.get('role');
      if (roleParam === 'candidate') {
        showSuccess('🎉 Welcome to Testify! Your email has been verified successfully. You can now start taking tests as a candidate.');
      } else {
        showSuccess('🎉 Welcome to Testify! Your email has been verified successfully. You can now access all features.');
      }
      // Clean up the URL
      window.history.replaceState({}, document.title, location.pathname);
    }

    // Check for redirect URL from query parameters for already logged-in users
    if (user && !loading) {
      const params = new URLSearchParams(location.search);
      const redirectUrl = params.get('redirect');
      if (redirectUrl) {
        navigate(redirectUrl);
      }
    }
  }, [location, user, loading, navigate]);

  useEffect(() => {
=======
>>>>>>> parent of 9b6885b (reset password and conformation mail)
=======
>>>>>>> parent of 9b6885b (reset password and conformation mail)
=======
>>>>>>> parent of 9b6885b (reset password and conformation mail)
    // If not loading and no user, redirect to login
    if (!loading && !user) {
      navigate('/login');
    }
  }, [loading, user, navigate]);

  if (loading) {
    return <Loading message="Loading dashboard" subtext="Please wait while we prepare your workspace" />;
  }

  // If no user after loading, show loading while redirecting
  if (!user) {
    return <Loading message="Redirecting to login" />;
  }

  // Check if user is blocked first
  if (blocked) {
    return <Blocked />;
  }

  // Route to appropriate dashboard based on user role
  if (role === 'admin') {
    return <AdminDashboard />;
  } else if (role === 'head') {
    return <HeadDashboard />;
  } else {
    return <UserDashboard />;
  }
}

export default Dashboard;
