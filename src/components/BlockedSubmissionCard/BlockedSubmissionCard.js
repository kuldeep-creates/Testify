import React from 'react';
import { useNavigate } from 'react-router-dom';

function BlockedSubmissionCard({ message, onClose }) {
  // const navigate = useNavigate(); // Commented out as not currently used

  return (
    <div className="blocked-overlay" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div className="blocked-card" style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '32px',
        maxWidth: '500px',
        margin: '20px',
        textAlign: 'center',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15)',
        border: '2px solid #ef4444'
      }}>
        <div style={{
          fontSize: '64px',
          color: '#ef4444',
          marginBottom: '16px'
        }}>
          🚫
        </div>
        <h2 style={{
          color: '#ef4444',
          marginBottom: '16px',
          fontSize: '24px',
          fontWeight: 'bold'
        }}>
          Multiple Submissions Not Allowed
        </h2>
        <p style={{
          color: '#6b7280',
          marginBottom: '24px',
          lineHeight: '1.6',
          fontSize: '16px'
        }}>
          {message || 'This test does not allow multiple submissions. You have already submitted this test. Please contact your domain head if you need to retake this test.'}
        </p>
        <div style={{
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '8px',
          padding: '12px',
          marginBottom: '24px'
        }}>
          <div style={{
            fontSize: '14px',
            color: '#dc2626',
            fontWeight: '500'
          }}>
            📋 Contact Information
          </div>
          <div style={{
            fontSize: '14px',
            color: '#7f1d1d',
            marginTop: '4px'
          }}>
            Please reach out to your domain head or administrator for assistance with test retakes or additional attempts.
          </div>
        </div>
        <div style={{
          display: 'flex',
          gap: '12px',
          justifyContent: 'center',
          flexWrap: 'wrap'
        }}>
          
           
            {onClose && (
              <button 
                onClick={onClose}
                className="btn btn-outline"
                style={{
                  backgroundColor: 'transparent',
                  color: '#6b7280',
                  padding: '12px 24px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '16px',
                  fontWeight: '500'
                }}
              >
                Close
              </button>
            )}
        </div>
      </div>
    </div>
  );
}
export default BlockedSubmissionCard;
