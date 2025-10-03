import './Waiting.css';

function Waiting() {
  return (
    <div className="waiting-container">
      <div className="waiting-card">
        <div className="waiting-icon">
          <div className="hourglass">⏳</div>
        </div>

        <h1 className="waiting-title">Account Pending Approval</h1>

        <p className="waiting-message">
          Your account has been successfully created and is currently waiting for approval from the administrator.
        </p>

        <div className="waiting-info">
          <div className="info-item">
            <span className="info-icon">✉️</span>
            <div className="info-text">
              <strong>What's Next?</strong>
              <p>An administrator will review your account shortly.</p>
            </div>
          </div>

          <div className="info-item">
            <span className="info-icon">⏰</span>
            <div className="info-text">
              <strong>Approval Time</strong>
              <p>Usually within 24 hours</p>
            </div>
          </div>

          <div className="info-item">
            <span className="info-icon">📧</span>
            <div className="info-text">
              <strong>Need Help?</strong>
              <p>Contact us at:</p>
              <div className="contact-emails">
                <a href="mailto:coderscafe@jeckukas.com">coderscafe@jeckukas.org.in</a>
                <a href="mailto:kuldeepjangd2008@gmail.com">kuldeepjangd2008@gmail.com</a>
              </div>
            </div>
          </div>
        </div>

        <div className="waiting-actions">
          <button
            className="btn btn-outline"
            onClick={() => window.location.reload()}
          >
            🔄 Check Status
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => {
              // Sign out logic
              window.location.href = '/';
            }}
          >
            🚪 Sign Out
          </button>
        </div>

      </div>
    </div>
  );
}

export default Waiting;
