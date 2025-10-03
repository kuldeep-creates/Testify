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
