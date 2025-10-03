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
  const { user, userDoc, role, blocked, loading } = useFirebase();

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
  // Admin and Head don't need approval check
  if (role === 'admin') {
    return <AdminDashboard />;
  }
  
  if (role === 'head') {
    return <HeadDashboard />;
  }
  
  // Candidates need approval check
  if (userDoc?.approved === false) {
    navigate('/waiting');
    return <Loading message="Checking approval status" />;
  }
  
  return <UserDashboard />;
}

export default Dashboard;
