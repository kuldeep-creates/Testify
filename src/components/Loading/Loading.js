import React from 'react';
import './Loading.css';

function Loading({ 
  message = "Loading", 
  subtext = "Please wait...", 
  size = "normal",
  variant = "dashboard" 
}) {
  if (variant === "inline") {
    return (
      <div className={`inline-loading ${size}`}>
        <div className="inline-spinner">
          <div className="spinner-ring" />
          <div className="spinner-ring" />
          <div className="spinner-ring" />
        </div>
        <span className="inline-text">{message}</span>
      </div>
    );
  }

  return (
    <div className="dashboard-loading">
      <div className="loading-content">
        <div className="loading-logo">TESTIFY</div>
        <div className="loading-spinner">
          <div className="spinner-ring" />
          <div className="spinner-ring" />
          <div className="spinner-ring" />
          <div className="spinner-ring" />
        </div>
        <div className="loading-text">
          {message}
          <div className="loading-dots">
            <div className="loading-dot" />
            <div className="loading-dot" />
            <div className="loading-dot" />
          </div>
        </div>
        <div className="loading-subtext">{subtext}</div>
      </div>
    </div>
  );
}

export default Loading;
