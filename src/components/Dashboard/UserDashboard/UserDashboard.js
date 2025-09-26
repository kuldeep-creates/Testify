import { signOut } from 'firebase/auth';
import { collection, getDocs, query, where, getDoc, doc } from 'firebase/firestore';
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { useFirebase } from '../../../context/FirebaseContext';
import { auth, db } from '../../../firebase';
import { formatDate } from '../../../utils/dateUtils';
import BlockedSubmissionCard from '../../BlockedSubmissionCard/BlockedSubmissionCard';
import Icon from '../../icons/Icon';
import Leaderboard from '../../Leaderboard/Leaderboard';
import Loading from '../../Loading/Loading';
import './UserDashboard.css';

// Candidate Tests Component
function CandidateTests() {
  const navigate = useNavigate();
  const { user } = useFirebase();
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showBlockedCard, setShowBlockedCard] = useState(false);
  const [blockMessage, setBlockMessage] = useState('');
  const [checkingSubmissions, setCheckingSubmissions] = useState(false);

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
        
        // Deduplicate tests by title and branch
        const testMap = new Map();
        testsData.forEach(test => {
          const key = `${test.title}_${test.branch}`;
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

  // Function to check submissions before starting test
  const checkSubmissionsAndStart = async (test) => {
    if (!user) {return;}

    setCheckingSubmissions(true);
    try {
      // Check existing submissions
      const existingSubmissionsQuery = query(
        collection(db, 'results'),
        where('candidateId', '==', user.uid),
        where('testId', '==', test.id)
      );
      const existingSubmissions = await getDocs(existingSubmissionsQuery);
      const submissionCount = existingSubmissions.size;
      
      console.log('UserDashboard submission check:', {
        submissionCount,
        allowMultiple: test.allowMultipleSubmissions,
        testId: test.id,
        shouldBlock: submissionCount >= 3 && test.allowMultipleSubmissions,
        attemptNumber: submissionCount + 1
      });

      // Logic based on submission count and settings
      if (submissionCount === 0) {
        // First attempt - proceed to test
        console.log('First attempt - proceeding to test');
        navigate(`/test/${test.id}`);
      } else if (submissionCount > 0 && !test.allowMultipleSubmissions) {
        // Not first attempt and multiple submissions not allowed - show blocked card
        console.log('Multiple submissions not allowed - showing blocked card');
        setBlockMessage(
          `This test does not allow multiple submissions. You have already submitted this test ${submissionCount} time${submissionCount > 1 ? 's' : ''}. Please contact your branch head if you need to retake this test.`
        );
        setShowBlockedCard(true);
      } else if (submissionCount > 0 && test.allowMultipleSubmissions) {
        // Multiple submissions allowed - check limit (allow up to 3 total submissions)
        if (submissionCount >= 3) {
          console.log('Maximum attempts reached - showing blocked card');
          setBlockMessage(
            `You have reached the maximum number of attempts (3) for this test. You have already submitted this test ${submissionCount} times. Please contact your branch head if you need additional attempts.`
          );
          setShowBlockedCard(true);
        } else {
          // Within limit - proceed to test (submissions 2 and 3)
          console.log(`Attempt ${submissionCount + 1}/3 - proceeding to test`);
          navigate(`/test/${test.id}`);
        }
      }
      
    } catch (error) {
      console.error('Error checking submission status:', error);
      // On error, default to proceeding to test
      navigate(`/test/${test.id}`);
    } finally {
      setCheckingSubmissions(false);
    }
  };

  const filteredTests = tests.filter(t => {
    const q = searchQuery.toLowerCase();
    return (
      t.title?.toLowerCase().includes(q) ||
      t.branch?.toLowerCase().includes(q) ||
      t.description?.toLowerCase().includes(q)
    );
  });

  if (loading) {return (
    <div className="loading-tests">
      <Loading message="Loading tests" subtext="Fetching available tests for you" variant="inline" size="large" />
    </div>
  );}
  if (error) {return <div className="error">Error: {error}</div>;}

  return (
    <div className="candidate-tests">
      {showBlockedCard && (
        <BlockedSubmissionCard 
          message={blockMessage} 
          onClose={() => setShowBlockedCard(false)}
        />
      )}
      
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
              <span className="badge badge-neutral">{test.branch}</span>
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
                <span>Created: {formatDate(test.createdAt)}</span>
              </div>
            </div>
            
            <div className="test-actions">
              <button 
                className="btn btn-primary test-start-btn"
                onClick={() => checkSubmissionsAndStart(test)}
                disabled={checkingSubmissions}
              >
                <span className="btn-icon">{checkingSubmissions ? '⏳' : '🚀'}</span>
                {checkingSubmissions ? 'Checking...' : 'Start Test'}
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
      if (!user?.uid) {return;}
      
      setLoading(true);
      setError('');
      try {
        const resultsRef = collection(db, 'results');
        // Fetch results with status 'submitted' or 'evaluated' only (exclude auto-submitted)
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
        
        // Remove duplicate submissions - keep only the latest submission per test
        const uniqueResults = [];
        const seenTestIds = new Set();
        
        for (const result of resultsWithTestData) {
          if (!seenTestIds.has(result.testId)) {
            seenTestIds.add(result.testId);
            uniqueResults.push(result);
          }
        }
        
        setResults(uniqueResults);
        setFilteredResults(uniqueResults); // Initialize filtered results with unique results
      } catch (e) {
        console.log('[Candidate:loadResults:error]', e.code, e.message);
        setError(e.message || 'Failed to load results');
      } finally {
        setLoading(false);
      }
    };
    
    loadResults();
  }, [user?.uid]);

  if (loading) {return (
    <div className="loading-results">
      <Loading message="Loading your results" subtext="Analyzing your test performance and scores" variant="inline" size="large" />
    </div>
  );}
  if (error) {return <div className="error">Error: {error}</div>;}

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
            <div key={result.id} className={`result-card ${result.status === 'auto-submitted' ? 'auto-submitted' : ''}`}>
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
                    {(() => {
                      // Show actual marks awarded, not percentage
                      if (result.totalMarksAwarded !== undefined && result.totalMarksAwarded !== null) {
                        return result.totalMarksAwarded;
                      } else if (result.score !== undefined && result.totalMarks !== undefined) {
                        // Calculate actual marks from percentage
                        return Math.round((result.score / 100) * result.totalMarks);
                      } else {
                        return '--';
                      }
                    })()}
                    <span className="score-divider">/</span>
                    <span className="score-total">
                      {result.totalMarks !== undefined ? result.totalMarks : '--'}
                    </span>
                  </span>
                </div>
                <div className="score-label">
                  {result.status === 'evaluated' ? 'Score' : 
                   result.status === 'auto-submitted' ? 'Auto-Submitted' : 'Submitted'}
                </div>
              </div>
              {result.submittedAt && (
                <div className="submission-info">
                  <span className="submission-date">
                    Submitted: {formatDate(result.submittedAt)}
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


function UserDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('tests');
  const { user, userDoc, loading: contextLoading } = useFirebase();
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const themeClass = 'theme-candidate';

  // Set default tab for candidates
  useEffect(() => {
    setActiveTab('tests');
  }, []);
  
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
          <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
            <button
              className="btn btn-outline"
              onClick={() => setShowProfileMenu((v) => !v)}
              title="Open Profile Menu"
            >
              <Icon name="user" size="small" /> Profile
            </button>

            {showProfileMenu && (
              <div
                className="profile-menu"
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '110%',
                  background: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  padding: 8,
                  minWidth: 180,
                  boxShadow: '0 10px 25px rgba(0,0,0,0.08)',
                  zIndex: 15
                }}
              >
                <button
                  className="btn btn-ghost"
                  style={{ width: '100%', textAlign: 'left', padding: '8px 10px' }}
                  onClick={() => {
                    setShowProfileMenu(false);
                    navigate('/account');
                  }}
                >
                  Account
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ width: '100%', textAlign: 'left', padding: '8px 10px' }}
                  onClick={handleSignOut}
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="dashboard-content">
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
