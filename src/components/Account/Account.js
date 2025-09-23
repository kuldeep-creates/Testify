import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { useFirebase } from '../../context/FirebaseContext';
import Loading from '../Loading/Loading';
import Icon from '../icons/Icon';

function Account() {
  const navigate = useNavigate();
  const { user, userDoc, loading } = useFirebase();

  const [form, setForm] = useState({
    fullName: '',
    gmail: '',
    collegeEmail: '',
    year: '',
    branch: '',
    domain: '',
    mobile: ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!user?.uid) return;
      try {
        setError('');
        // Prefer context data if available
        let data = userDoc;
        if (!data) {
          const ref = doc(db, 'user', user.uid);
          const snap = await getDoc(ref);
          if (snap.exists()) data = snap.data();
        }
        setForm({
          fullName: data?.fullName || data?.name || user?.displayName || '',
          gmail: data?.gmail || data?.email || user?.email || '',
          collegeEmail: data?.collegeEmail || '',
          year: data?.year || '',
          branch: data?.branch || '',
          domain: data?.domain || '',
          mobile: data?.mobile || data?.phone || ''
        });
        setLoaded(true);
      } catch (e) {
        setError(e.message || 'Failed to load account');
        setLoaded(true);
      }
    };
    load();
  }, [user?.uid, userDoc, user]);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const onSave = async (e) => {
    e.preventDefault();
    if (!user?.uid) return;
    setSaving(true);
    setError('');
    try {
      const ref = doc(db, 'user', user.uid);
      await setDoc(
        ref,
        {
          uid: user.uid,
          // New structured fields
          fullName: form.fullName?.trim() || '',
          gmail: form.gmail?.trim() || user.email || '',
          collegeEmail: form.collegeEmail?.trim() || '',
          year: form.year?.toString() || '',
          branch: form.branch?.trim() || '',
          domain: form.domain?.trim() || '',
          mobile: form.mobile?.trim() || '',
          // Backward compatibility
          name: form.fullName?.trim() || '',
          email: form.gmail?.trim() || user.email || '',
          phone: form.mobile?.trim() || '',
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
      alert('Account updated successfully');
      navigate('/dashboard');
    } catch (e) {
      setError(e.message || 'Failed to update account');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !loaded) {
    return (
      <div style={{ padding: '2rem' }}>
        <Loading message="Loading account" subtext="Preparing your profile" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="account-container">
        <div className="account-card">
          <p>Please log in to manage your account.</p>
          <button className="btn btn-primary" onClick={() => navigate('/login')}>Go to Login</button>
        </div>
      </div>
    );
  }

  return (
    <div className="account-page" style={{ maxWidth: 720, margin: '0 auto', padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <button className="btn btn-outline" onClick={() => navigate(-1)}>
          <Icon name="notebook" size="small" /> Back
        </button>
        <h2 style={{ margin: 0 }}>Account</h2>
        <div style={{ width: 90 }}></div>
      </div>

      {error && (
        <div style={{
          background: '#fef2f2',
          border: '1px solid #fecaca',
          color: '#dc2626',
          padding: '0.75rem 1rem',
          borderRadius: 8,
          marginBottom: '1rem'
        }}>
          {error}
        </div>
      )}

      <form onSubmit={onSave} className="account-form" style={{
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        padding: '1.25rem',
        display: 'grid',
        gap: '1rem'
      }}>
        <div>
          <label className="block text-sm font-medium" htmlFor="fullName">Full Name</label>
          <input
            id="fullName"
            name="fullName"
            type="text"
            className="input"
            value={form.fullName}
            onChange={onChange}
            placeholder="Enter your full name"
            required
            style={{ width: '100%', padding: '0.75rem 1rem', border: '1px solid #d1d5db', borderRadius: 8 }}
          />
        </div>

        <div>
          <label className="block text-sm font-medium" htmlFor="gmail">Gmail</label>
          <input
            id="gmail"
            name="gmail"
            type="email"
            className="input"
            value={form.gmail}
            onChange={onChange}
            placeholder="yourname@gmail.com"
            required
            style={{ width: '100%', padding: '0.75rem 1rem', border: '1px solid #d1d5db', borderRadius: 8 }}
          />
        </div>

        <div>
          <label className="block text-sm font-medium" htmlFor="collegeEmail">College Email</label>
          <input
            id="collegeEmail"
            name="collegeEmail"
            type="email"
            className="input"
            value={form.collegeEmail}
            onChange={onChange}
            placeholder="yourname@college.edu"
            style={{ width: '100%', padding: '0.75rem 1rem', border: '1px solid #d1d5db', borderRadius: 8 }}
          />
        </div>

        <div>
          <label className="block text-sm font-medium" htmlFor="year">Year</label>
          <select
            id="year"
            name="year"
            className="input"
            value={form.year}
            onChange={onChange}
            style={{ width: '100%', padding: '0.6rem 1rem', border: '1px solid #d1d5db', borderRadius: 8, background: '#ffffff' }}
          >
            <option value="">Select year</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5</option>
          </select>
        </div>

        {/* Show Branch field for candidates, Domain field for heads/admins */}
        {(!userDoc?.role || userDoc?.role === 'candidate') ? (
          <div>
            <label className="block text-sm font-medium" htmlFor="branch">Academic Branch</label>
            <input
              id="branch"
              name="branch"
              type="text"
              className="input"
              value={form.branch}
              onChange={onChange}
              placeholder="e.g. CSE, ECE, ME, IT, Civil Engineering"
              style={{ width: '100%', padding: '0.75rem 1rem', border: '1px solid #d1d5db', borderRadius: 8 }}
            />
            <small style={{ color: '#6b7280', fontSize: '0.875rem' }}>
              Your academic branch/department (Computer Science, Electronics, etc.)
            </small>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium" htmlFor="domain">Expertise Domain</label>
            <input
              id="domain"
              name="domain"
              type="text"
              className="input"
              value={form.domain}
              onChange={onChange}
              placeholder="e.g. Full Stack, Data Science, Machine Learning, DevOps"
              style={{ width: '100%', padding: '0.75rem 1rem', border: '1px solid #d1d5db', borderRadius: 8 }}
            />
            <small style={{ color: '#6b7280', fontSize: '0.875rem' }}>
              Your area of expertise/teaching domain
            </small>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium" htmlFor="mobile">Mobile Number</label>
          <input
            id="mobile"
            name="mobile"
            type="tel"
            className="input"
            value={form.mobile}
            onChange={onChange}
            placeholder="Enter your mobile number"
            style={{ width: '100%', padding: '0.75rem 1rem', border: '1px solid #d1d5db', borderRadius: 8 }}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <button type="button" className="btn btn-outline" onClick={() => navigate('/dashboard')}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default Account;
