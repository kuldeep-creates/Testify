import { signOut } from 'firebase/auth';
import React from 'react';
import { useNavigate } from 'react-router-dom';

import { auth } from '../../firebase';
import './Blocked.css';

function Blocked() {
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <div className="blocked-page">
      <div className="blocked-container">
        <div className="blocked-icon">
          <svg width="80" height="80" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="#ef4444" strokeWidth="2"/>
            <path d="M4.93 4.93l14.14 14.14" stroke="#ef4444" strokeWidth="2"/>
            <circle cx="12" cy="12" r="6" fill="#fef2f2"/>
          </svg>
        </div>
        
        <div className="blocked-content">
          <h1>Account Blocked</h1>
          <p className="blocked-message">
            Your account has been temporarily blocked by the administrator.
          </p>
          <p className="blocked-submessage">
            This may be due to a violation of our terms of service or suspicious activity.
          </p>
          
          <div className="blocked-info">
            <div className="info-item">
              <strong>What can you do?</strong>
              <ul>
                <li>Contact the administrator for more information</li>
                <li>Review our terms of service</li>
                <li>Wait for the block to be lifted</li>
              </ul>
            </div>
            
            <div className="info-item">
              <strong>Need help?</strong>
              <p>If you believe this is a mistake, please contact support:</p>
              <div className="contact-info">
                <span>📧 coderscafe@jeckukas.org.in</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="blocked-actions">
          <button 
            className="btn btn-primary"
            onClick={handleSignOut}
          >
            Sign Out
          </button>
          <button 
            className="btn btn-outline"
            onClick={() => window.location.reload()}
          >
            Refresh Status
          </button>
        </div>
        
        <div className="blocked-footer">
          <p>© 2024 Testify. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}

export default Blocked;
