import React from 'react';
import { useFirebase } from '../../context/FirebaseContext';
import AdminDashboard from './AdminDashboard/AdminDashboard';
import HeadDashboard from './HeadDashboard/HeadDashboard';
import UserDashboard from './UserDashboard/UserDashboard';
import './Dashboard.css';

function Dashboard() {
  const { userDoc, loading } = useFirebase();
  const role = (userDoc?.role || 'candidate').toLowerCase();

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner"></div>
        <p>Loading dashboard...</p>
      </div>
    );
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
