import React from 'react';
import { useFirebase } from '../../context/FirebaseContext';
import AdminDashboard from './AdminDashboard/AdminDashboard';
import HeadDashboard from './HeadDashboard/HeadDashboard';
import UserDashboard from './UserDashboard/UserDashboard';
import Blocked from '../Blocked/Blocked';
import Loading from '../Loading/Loading';
import './Dashboard.css';

function Dashboard() {
  const { userDoc, blocked, loading } = useFirebase();
  const role = (userDoc?.role || 'candidate').toLowerCase();


  if (loading) {
    return <Loading message="Loading dashboard" subtext="Please wait while we prepare your workspace" />;
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
