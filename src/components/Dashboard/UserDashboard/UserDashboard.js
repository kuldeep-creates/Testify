import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth, db } from '../../../firebase';
import { collection, getDocs, query, where, orderBy, addDoc, serverTimestamp, getDoc, doc } from 'firebase/firestore';
import { useFirebase } from '../../../context/FirebaseContext';
import Loading from '../../Loading/Loading';
import Leaderboard from '../../Leaderboard/Leaderboard';
import Icon from '../../icons/Icon';
import './UserDashboard.css';

// Candidate Tests Component
function CandidateTests() {
  const navigate = useNavigate();
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const loadTests = async () => {
      setLoading(true);
      setError('');
      try {
        const testsRef = collection(db, 'tests');
        // Remove the status filter to show all tests
        const q = testsRef;
        const snap = await getDocs(q);
        
        // Filter out tests that are not active or published
        const now = new Date();
        const testsData = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(test => {
            // Include test if it's active or doesn't have a status field (for backward compatibility)
            const isActive = !test.status || test.status === 'active';
            
            // Check if test has an end date and if it's still valid
            const hasValidEndDate = !test.endDate || 
                                  (test.endDate?.toDate && test.endDate.toDate() > now) ||
                                  (test.endDate?.seconds && new Date(test.endDate.seconds * 1000) > now);
            
            return isActive && hasValidEndDate;
          });
        
        // Deduplicate tests by title and domain
        const testMap = new Map();
        testsData.forEach(test => {
          const key = `${test.title}_${test.domain}`;
          const existingTest = testMap.get(key);
          
          if (!existingTest) {
            testMap.set(key, test);
          } else {
            // If test has an end date, keep the one with the latest end date
            // Otherwise, keep the most recently created one
            const existingEndDate = existingTest.endDate?.toDate?.() || existingTest.endDate?.seconds ? 
              new Date(existingTest.endDate.seconds * 1000) : null;
            const currentEndDate = test.endDate?.toDate?.() || test.endDate?.seconds ? 
              new Date(test.endDate.seconds * 1000) : null;
              
            if (existingEndDate && currentEndDate) {
              if (currentEndDate > existingEndDate) {
                testMap.set(key, test);
              }
            } else {
              // Fall back to creation date if end dates are not available
              const existingTime = existingTest.createdAt?.toDate?.()?.getTime() || 0;
              const currentTime = test.createdAt?.toDate?.()?.getTime() || 0;
              
              if (currentTime > existingTime) {
                testMap.set(key, test);
              }
            }
          }
        });
        
        const uniqueTests = Array.from(testMap.values());
        setTests(uniqueTests);
      } catch (e) {
        console.log('[Candidate:loadTests:error]', e.code, e.message);
        setError(e.message || 'Failed to load tests');
      } finally {
        setLoading(false);
      }
    };
    loadTests();
  }, []);

  const filteredTests = tests.filter(t => {
    const q = searchQuery.toLowerCase();
    return (
      t.title?.toLowerCase().includes(q) ||
      t.domain?.toLowerCase().includes(q) ||
      t.description?.toLowerCase().includes(q)
    );
  });

  if (loading) return (
    <div className="loading-tests">
      <Loading message="Loading tests" subtext="Fetching available tests for you" variant="inline" size="large" />
    </div>
  );
  if (error) return <div className="error">Error: {error}</div>;

  return (
    <div className="candidate-tests">
      <div className="search-container">
        <input
          type="text"
          placeholder="Search tests..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
      </div>
      
      <div className="tests-grid">
        {filteredTests.map(test => (
          <div key={test.id} className="test-card">
            <div className="test-header">
              <h3 className="test-title">{test.title}</h3>
              <span className="badge badge-neutral">{test.domain}</span>
            </div>
            <p className="test-description">{test.description || 'No description available'}</p>
            <div className="test-meta">
              <div className="meta-item">
                <span className="meta-icon">⏱️</span>
                <span>Duration: {test.duration || '60 minutes'}</span>
              </div>
              <div className="meta-item">
                <span className="meta-icon">📝</span>
                <span>Total Marks: {test.totalMarks || 'N/A'}</span>
              </div>
              <div className="meta-item">
                <span className="meta-icon">📅</span>
                <span>Created: {test.createdAt?.toDate?.()?.toLocaleDateString() || 'Unknown'}</span>
              </div>
            </div>
            
            <div className="test-actions">
              <button 
                className="btn btn-primary test-start-btn"
                onClick={() => {
                    navigate(`/test/${test.id}`);
                }}
              >
                <span className="btn-icon">🚀</span>
                Start Test
              </button>
              
              {test.password && (
                <div className="test-password-hint">
                  <span className="password-icon">🔒</span>
                  <span>Password required</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      
      {filteredTests.length === 0 && (
        <div className="no-tests">
          {searchQuery ? (
            <>
              <div className="no-tests-icon">🔍</div>
              <h3>No Tests Found</h3>
              <p>No tests match your search "{searchQuery}"</p>
              <button 
                className="btn btn-outline"
                onClick={() => setSearchQuery('')}
              >
                Clear Search
              </button>
            </>
          ) : (
            <>
              <div className="no-tests-icon">📚</div>
              <h3>No Tests Available</h3>
              <p>There are no active tests at the moment. Check back later!</p>
              <button 
                className="btn btn-primary"
                onClick={() => window.location.reload()}
              >
                Refresh Tests
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Candidate Results Component
function CandidateResults() {
  const [results, setResults] = useState([]);
  const [filteredResults, setFilteredResults] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { user, userDoc } = useFirebase();

  // Filter results based on search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredResults(results);
    } else {
      const searchLower = searchTerm.toLowerCase();
      const filtered = results.filter(result => 
        (result.testTitle || result.title || '').toLowerCase().includes(searchLower)
      );
      setFilteredResults(filtered);
    }
  }, [searchTerm, results]);

  useEffect(() => {
    const loadResults = async () => {
      if (!user?.uid) return;
      
      setLoading(true);
      setError('');
      try {
        const resultsRef = collection(db, 'results');
        // Only fetch results with status 'submitted' or 'evaluated'
        const q = query(
          resultsRef, 
          where('candidateId', '==', user.uid),
          where('status', 'in', ['submitted', 'evaluated'])
        );
        const snap = await getDocs(q);
        // Process results and fetch test details for each
        const resultsWithTestData = await Promise.all(snap.docs.map(async (d) => {
          const resultData = { id: d.id, ...d.data() };
          
          // Fetch test data to get the title and totalMarks
          try {
            const testDoc = await getDoc(doc(db, 'tests', resultData.testId));
            if (testDoc.exists()) {
              const testData = testDoc.data();
              resultData.testTitle = testData.title;
              // If totalMarks is not in the result, try to get it from the test
              if (resultData.totalMarks === undefined) {
                // Try to calculate totalMarks from questions if not directly available
                if (testData.questions?.length > 0) {
                  resultData.totalMarks = testData.questions.reduce((sum, q) => {
                    return sum + (q.marks || 1);
                  }, 0);
                } else if (testData.totalMarks) {
                  resultData.totalMarks = testData.totalMarks;
                }
              }
            }
          } catch (error) {
            console.error('Error fetching test data:', error);
          }
          
          return resultData;
        }));
        
        // Sort by submission date (newest first)
        resultsWithTestData.sort((a, b) => {
          const timeA = a.submittedAt?.toDate?.() ? a.submittedAt.toDate().getTime() : 0;
          const timeB = b.submittedAt?.toDate?.() ? b.submittedAt.toDate().getTime() : 0;
          return timeB - timeA;
        });
        
        setResults(resultsWithTestData);
        setFilteredResults(resultsWithTestData); // Initialize filtered results
      } catch (e) {
        console.log('[Candidate:loadResults:error]', e.code, e.message);
        setError(e.message || 'Failed to load results');
      } finally {
        setLoading(false);
      }
    };
    
    loadResults();
  }, [user?.uid]);

  if (loading) return (
    <div className="loading-results">
      <Loading message="Loading your results" subtext="Analyzing your test performance and scores" variant="inline" size="large" />
    </div>
  );
  if (error) return <div className="error">Error: {error}</div>;

  return (
    <div className="candidate-results">
      <div className="results-header">
        <h2>Your Test Results</h2>
        
        <div className="search-container">
          <input
            type="text"
            placeholder="Search by test title..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
      </div>
      
      {filteredResults.length === 0 ? (
        <div className="no-results">
          <div className="no-results-icon">📊</div>
          <h3>No Test Results Yet</h3>
          <p>Complete some tests to see your results here.</p>
          <button 
            className="btn btn-primary"
            onClick={() => window.location.reload()}
          >
            Refresh Results
          </button>
        </div>
      ) : (
        <div className="results-grid">
          {filteredResults.map(result => (
            <div key={result.id} className="result-card">
              <h3 className="result-title">
                {result.testTitle || result.title || 'Test'}
              </h3>
              <div className="candidate-info">
                <span className="candidate-name">
                  Candidate: {userDoc?.name || user?.displayName || 'Unknown'}
                </span>
              </div>
              <div className="result-score-container">
                <div className="score-display">
                  <span className="score-value">
                    {result.totalMarksAwarded !== undefined ? result.totalMarksAwarded : (result.score !== undefined ? result.score : '--')}
                    <span className="score-divider">/</span>
                    <span className="score-total">
                      {result.maxPossibleMarks !== undefined ? result.maxPossibleMarks : (result.totalMarks !== undefined ? result.totalMarks : '--')}
                    </span>
                  </span>
                  {result.status === 'evaluated' && result.score !== undefined && (
                    <div className="percentage-score">
                      ({Math.round(result.score)}%)
                    </div>
                  )}
                </div>
                <div className="score-label">
                  {result.status === 'evaluated' ? 'Score' : 'Submitted'}
                </div>
              </div>
              {result.submittedAt && (
                <div className="submission-info">
                  <span className="submission-date">
                    Submitted: {result.submittedAt.toDate?.()?.toLocaleDateString() || 'Unknown'}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Placeholder for future candidate features
function CandidateProfile() {
  return (
    <div className="candidate-profile">
      <h2>Profile Settings</h2>
      <p>Profile management will be available soon.</p>
    </div>
  );
}

function UserDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('tests');
  const [profileOpen, setProfileOpen] = useState(false);
  const { user, userDoc, loading: contextLoading } = useFirebase();
  const rawRole = (userDoc?.role || '').toString().toLowerCase().trim();
  const isCandidate = rawRole === 'candidate' || !rawRole;
  const dropdownRef = useRef(null);


  const themeClass = 'theme-candidate';

  // Set default tab for candidates
  useEffect(() => {
    setActiveTab('tests');
  }, []);

  const badgeTone = 'candidate';
  
  const tabs = useMemo(() => [
    { label: 'Available Tests', value: 'tests' },
    { label: 'My Results', value: 'results' },
    { label: 'Leaderboard', value: 'leaderboard' },
  ], []);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigate('/');
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const handleAccount = () => {
    setProfileOpen(false);
    navigate('/account');
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  if (contextLoading) {
    return <Loading message="Loading dashboard" subtext="Please wait while we prepare your workspace" />;
  }

  return (
    <div className={`user-dashboard ${themeClass}`}>
      <div className="dashboard-header">
        <div className="header-content">
          <div className="user-info">
            <h1>Welcome, {userDoc?.name || user?.displayName || 'Candidate'}</h1>
            
          </div>
          {isCandidate ? (
            <div className="profile-menu" ref={dropdownRef}>
              <button
                className="profile-button"
                onClick={() => setProfileOpen((o) => !o)}
                aria-haspopup="true"
                aria-expanded={profileOpen}
                title="Profile"
              >
                <Icon name="user" size="medium" />
              </button>
              {profileOpen && (
                <div className="profile-dropdown" role="menu">
                  <button className="dropdown-item" onClick={handleAccount} role="menuitem">
                    <Icon name="notebook" size="small" />
                    Account
                  </button>
                  <button className="dropdown-item danger" onClick={handleSignOut} role="menuitem">
                    <Icon name="fire" size="small" />
                    Logout
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button className="btn btn-outline" onClick={handleSignOut}>
              Sign Out
            </button>
          )}
        </div>
      </div>

      <div className="dashboard-content">
        {isCandidate && (
          (() => {
            const profile = userDoc || {};
            const missing = !profile.fullName || !profile.gmail || !profile.collegeEmail || !profile.year || !profile.branch || !profile.mobile;
            if (!missing) return null;
            return (
              <div style={{
                border: '1px solid #fde68a',
                background: '#fffbeb',
                color: '#92400e',
                borderRadius: 12,
                padding: '0.75rem 1rem',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Icon name="mail" size="small" />
                  <span><strong>Complete your profile</strong> to ensure accurate records: Full Name, Gmail, College Email, Year, Branch, Mobile.</span>
                </div>
                <button className="btn btn-secondary" onClick={() => navigate('/account')}>
                  Update Now
                </button>
              </div>
            );
          })()
        )}
        <div className="dashboard-nav">
          <div className="tc-tabs">
            {tabs.map((t) => (
              <button
                key={t.value}
                className={`tc-tab ${activeTab === t.value ? 'is-active' : ''}`}
                onClick={() => setActiveTab(t.value)}
                data-tab={t.value}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="dashboard-main">
          {activeTab === 'tests' && <CandidateTests />}
          {activeTab === 'results' && <CandidateResults />}
          {activeTab === 'leaderboard' && <Leaderboard />}
        </div>
      </div>
    </div>
  );
}

export default UserDashboard;
