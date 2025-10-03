import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useFirebase } from '../../context/FirebaseContext';
import { db } from '../../firebase';
import './Account.css';

function Account() {
  const navigate = useNavigate();
  const { user, userDoc, loading } = useFirebase();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [form, setForm] = useState({
    name: '',
    email: '',
    mobile: '',
    year: '',
    branch: '',
    domain: '',
  });

  useEffect(() => {
    if (!loading) {
      if (!user) {
        navigate('/login');
        return;
      }
      setForm({
        name: userDoc?.name || user?.displayName || '',
        email: userDoc?.email || user?.email || '',
        mobile: userDoc?.mobile || userDoc?.phone || '',
        year: userDoc?.year || '',
        branch: userDoc?.branch || '',
        domain: userDoc?.domain || '',
      });
    }
  }, [loading, user, userDoc, navigate]);

  const save = async () => {
    if (!user) {return;}
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const ref = doc(db, 'user', user.uid);
      const payload = {
        name: form.name?.trim() || '',
        email: form.email?.trim() || user.email || '',
        mobile: form.mobile?.trim() || '',
        year: form.year?.trim() || '',
        branch: form.branch?.trim() || '',
        domain: form.domain?.trim() || '',
        updatedAt: serverTimestamp(),
      };

      // Make sure document exists, then update
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, {
          userId: user.uid,
          role: userDoc?.role || 'candidate',
          blocked: false,
          createdAt: serverTimestamp(),
          ...payload,
        }, { merge: true });
      } else {
        await updateDoc(ref, payload);
      }

      setSuccess('Account updated successfully.');
    } catch (e) {
      console.error('Failed to save account:', e);
      setError(e.message || 'Failed to update account.');
    } finally {
      setSaving(false);
    }
  };

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const userRole = (userDoc?.role || 'candidate').toLowerCase();
  const isHead = userRole === 'head';
  const isAdmin = userRole === 'admin';
  const isCandidate = userRole === 'candidate';

  if (loading) {
    return (
      <div className="account-loading">
        <div className="loading-content">
          <div className="loading-spinner" />
          <div className="loading-text">Loading account...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="account-container">
      <div className="account-header">
        <div className="account-header-content">
          <h2 className="account-title">My Account</h2>
          <p className="account-subtitle">Update your profile information</p>
        </div>
        <button className="btn btn-outline" onClick={() => navigate('/dashboard')}>
          Back to Dashboard
        </button>
      </div>

      <div className="account-card">
        {error && (
          <div className="alert alert-error">{error}</div>
        )}
        {success && (
          <div className="alert alert-success">{success}</div>
        )}

      <div className="form-group">
        <label>Name</label>
        <input
          name="name"
          value={form.name}
          onChange={onChange}
          className="form-input"
          placeholder="Your name"
          type="text"
        />
      </div>

      <div className="form-group">
        <label>Email</label>
        <input
          name="email"
          value={form.email}
          onChange={onChange}
          className="form-input readonly"
          type="email"
          readOnly
          title="Email can't be changed"
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Mobile</label>
          <input
            name="mobile"
            value={form.mobile}
            onChange={onChange}
            className="form-input"
            placeholder="e.g., 9876543210"
          />
        </div>
        <div className="form-group">
          <label>Year</label>
          <input
            name="year"
            value={form.year}
            onChange={onChange}
            className="form-input"
            placeholder="e.g., 3rd Year"
          />
        </div>
      </div>

      {/* Show Branch field for Candidates */}
      {isCandidate && (
        <div className="form-group">
          <label>Branch</label>
          <input
            name="branch"
            value={form.branch}
            onChange={onChange}
            className="form-input"
            placeholder="e.g., Computer Science, Mechanical Engineering, Electronics"
          />
          <div className="form-help">Your academic branch or specialization</div>
        </div>
      )}

      {/* Show Domain field for Heads (assigned by admin) */}
      {isHead && (
        <div className="form-group">
          <label>Domain</label>
          <input
            name="domain"
            value={form.domain}
            onChange={onChange}
            className="form-input readonly"
            readOnly
            title="Domain is assigned by admin and cannot be changed"
            placeholder="e.g., Full Stack, DSA, Frontend"
          />
          <div className="form-help">Your assigned domain (assigned by admin)</div>
        </div>
      )}

      {/* Show both fields for Admins */}
      {isAdmin && (
        <>
          <div className="form-group">
            <label>Branch</label>
            <input
              name="branch"
              value={form.branch}
              onChange={onChange}
              className="form-input"
              placeholder="e.g., Computer Science, Mechanical Engineering"
            />
            <div className="form-help">Your academic branch</div>
          </div>
          <div className="form-group">
            <label>Domain</label>
            <input
              name="domain"
              value={form.domain}
              onChange={onChange}
              className="form-input"
              placeholder="e.g., Full Stack, DSA, Frontend"
            />
            <div className="form-help">Your technical domain</div>
          </div>
        </>
      )}

      <div className="account-actions">
        <button className={`btn btn-primary ${saving ? 'btn-loading' : ''}`} onClick={save} disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
      </div>
    </div>
  );
}

export default Account;
