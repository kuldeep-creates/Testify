import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useFirebase } from '../../context/FirebaseContext';
import Loading from '../Loading/Loading';
import Icon from '../icons/Icon';
import userInterfaceVideo from '../icons/User Interface.mp4';
import './Leaderboard.css';

const Leaderboard = () => {
  const [tests, setTests] = useState([]);
  const [selectedTest, setSelectedTest] = useState(null);
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const [error, setError] = useState('');
  const [publishedLeaderboards, setPublishedLeaderboards] = useState({});
  const [publishing, setPublishing] = useState(false);
  const { userDoc } = useFirebase();
  
  const isAdmin = userDoc?.role === 'admin';
  const isHead = userDoc?.role === 'head';
  const isCandidate = userDoc?.role === 'candidate' || !userDoc?.role;
  const canPublish = isAdmin || isHead;
  
  // Debug logging for permissions
  console.log('User permissions:', {
    role: userDoc?.role,
    isAdmin,
    isHead,
    isCandidate,
    canPublish,
    domain: userDoc?.domain
  });

  // Load all tests and published leaderboards
  useEffect(() => {
    // Don't load if userDoc is not available yet
    if (!userDoc) {
      return;
    }
    
    const loadTests = async () => {
      try {
        setLoading(true);
        setError(''); // Clear any previous errors
        
        // Load tests
        const testsRef = collection(db, 'tests');
        const snapshot = await getDocs(testsRef);
        const testsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        // Filter tests based on user role
        let filteredTests = testsData;
        if (userDoc?.role === 'head' && userDoc?.domain) {
          filteredTests = testsData.filter(test => test.domain === userDoc.domain);
        }
        
        // Extract publication status from tests data
        const publishedData = {};
        filteredTests.forEach(test => {
          if (test.leaderboardPublished === true) {
            publishedData[test.id] = {
              published: true,
              testId: test.id,
              testTitle: test.title,
              publishedBy: test.publishedBy || 'unknown',
              publishedAt: test.publishedAt || new Date(),
              publisherRole: test.publisherRole || 'unknown'
            };
          }
        });
        
        setTests(filteredTests);
        setPublishedLeaderboards(publishedData);
        setLoading(false);
      } catch (err) {
        console.error('Error loading tests and leaderboards:', err);
        setError(`Failed to load tests: ${err.message || 'Unknown error'}`);
        setLoading(false);
      }
    };

    loadTests();
  }, [userDoc]);

  // Load leaderboard data for selected test
  const loadLeaderboard = async (test) => {
    try {
      setLoadingLeaderboard(true);
      setSelectedTest(test);
      setError(''); // Clear any errors
      setLeaderboardData([]); // Clear previous data
      
      // Fetch all submissions for this test
      const resultsQuery = query(
        collection(db, 'results'),
        where('testId', '==', test.id),
        where('status', '==', 'evaluated')
      );
      
      const snapshot = await getDocs(resultsQuery);
      console.log(`Loading leaderboard for test: ${test.title}, found ${snapshot.docs.length} submissions`);
      
      const submissions = await Promise.all(snapshot.docs.map(async (doc) => {
        const data = doc.data();
        console.log('Raw submission data:', {
          id: doc.id,
          candidateName: data.candidateName,
          totalMarksAwarded: data.totalMarksAwarded,
          maxPossibleMarks: data.maxPossibleMarks,
          score: data.score,
          testTotalMarks: test.totalMarks,
          questionMarks: data.questionMarks
        });
        
        // Try to get better candidate name
        let candidateName = data.candidateName || 'Unknown';
        if (data.candidateId) {
          try {
            // Try multiple approaches to get user data
            let userData = null;
            
            // First try: query by uid field
            try {
              const userQuery = query(
                collection(db, 'user'),
                where('uid', '==', data.candidateId)
              );
              const userSnapshot = await getDocs(userQuery);
              if (!userSnapshot.empty) {
                userData = userSnapshot.docs[0].data();
              }
            } catch (queryError) {
              console.log('Query by uid failed, trying direct document access');
            }
            
            // Second try: direct document access
            if (!userData) {
              try {
                const userDocRef = doc(db, 'user', data.candidateId);
                const userDocSnap = await getDoc(userDocRef);
                if (userDocSnap.exists()) {
                  userData = userDocSnap.data();
                }
              } catch (docError) {
                console.log('Direct document access failed');
              }
            }
            
            // Use the best available name
            if (userData) {
              candidateName = userData.name || userData.displayName || userData.fullName || userData.firstName || candidateName;
            }
          } catch (error) {
            console.log('Could not fetch user data for candidate:', data.candidateId, error);
          }
        }
        
        // Calculate correct marks and validate data
        let maxPossibleMarks = data.maxPossibleMarks || test.totalMarks || 100;
        let totalMarksAwarded = data.totalMarksAwarded || 0;
        
        // Try to recalculate from individual question marks if available
        if (data.questionMarks && typeof data.questionMarks === 'object') {
          const questionMarksArray = Object.values(data.questionMarks);
          if (questionMarksArray.length > 0) {
            // Recalculate total awarded marks from individual questions
            const calculatedTotal = questionMarksArray.reduce((sum, mark) => {
              const numMark = parseFloat(mark) || 0;
              return sum + numMark;
            }, 0);
            
            console.log(`Recalculating marks from questions: ${calculatedTotal} (was ${totalMarksAwarded})`);
            totalMarksAwarded = calculatedTotal;
          }
        }
        
        // If we still have invalid data, try to get correct max marks from test
        if (test.totalMarks && test.totalMarks > 0) {
          maxPossibleMarks = test.totalMarks;
        }
        
        // Final validation - ensure awarded marks don't exceed maximum
        if (totalMarksAwarded > maxPossibleMarks) {
          console.warn(`Invalid marks detected: ${totalMarksAwarded}/${maxPossibleMarks} for candidate ${candidateName}. Capping to maximum.`);
          totalMarksAwarded = maxPossibleMarks;
        }
        
        // Ensure minimum values
        totalMarksAwarded = Math.max(0, totalMarksAwarded);
        maxPossibleMarks = Math.max(1, maxPossibleMarks);
        
        // Recalculate score percentage
        const score = Math.round((totalMarksAwarded / maxPossibleMarks) * 100);
        
        const finalResult = {
          id: doc.id,
          candidateName,
          candidateId: data.candidateId,
          totalMarksAwarded: Math.max(0, totalMarksAwarded), // Ensure non-negative
          maxPossibleMarks: Math.max(1, maxPossibleMarks), // Ensure at least 1
          score: Math.max(0, Math.min(100, score)), // Ensure 0-100 range
          submittedAt: data.submittedAt,
          timeTaken: data.timeTaken || 0,
          questionMarks: data.questionMarks || {}
        };
        
        console.log('Final processed data:', {
          candidateName: finalResult.candidateName,
          marks: `${finalResult.totalMarksAwarded}/${finalResult.maxPossibleMarks}`,
          score: `${finalResult.score}%`
        });
        
        return finalResult;
      }));
      
      // Sort by total marks (descending) and then by time taken (ascending)
      const sortedSubmissions = submissions.sort((a, b) => {
        if (b.totalMarksAwarded !== a.totalMarksAwarded) {
          return b.totalMarksAwarded - a.totalMarksAwarded;
        }
        return a.timeTaken - b.timeTaken;
      });
      
      // Add rank to each submission
      const rankedSubmissions = sortedSubmissions.map((submission, index) => ({
        ...submission,
        rank: index + 1
      }));
      
      setLeaderboardData(rankedSubmissions);
      setLoadingLeaderboard(false);
    } catch (err) {
      console.error('Error loading leaderboard data:', err);
      setError(`Failed to load leaderboard data: ${err.message || 'Unknown error'}`);
      setLoadingLeaderboard(false);
    }
  };

  // Calculate pie chart data
  const getPieChartData = () => {
    if (leaderboardData.length === 0) return [];
    
    const ranges = [
      { label: 'Excellent (90-100%)', min: 90, max: 100, color: '#10b981', count: 0 },
      { label: 'Good (70-89%)', min: 70, max: 89, color: '#3b82f6', count: 0 },
      { label: 'Average (50-69%)', min: 50, max: 69, color: '#f59e0b', count: 0 },
      { label: 'Below Average (0-49%)', min: 0, max: 49, color: '#ef4444', count: 0 }
    ];
    
    leaderboardData.forEach(submission => {
      // Use the already validated score instead of recalculating
      const percentage = submission.score;
      const range = ranges.find(r => percentage >= r.min && percentage <= r.max);
      if (range) range.count++;
    });
    
    return ranges.filter(range => range.count > 0);
  };

  // Format date
  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  // Get rank badge color
  const getRankBadgeColor = (rank) => {
    if (rank === 1) return 'gold';
    if (rank === 2) return 'silver';
    if (rank === 3) return 'bronze';
    return 'default';
  };

  // Toggle leaderboard publication
  const toggleLeaderboardPublication = async (testId, testTitle) => {
    console.log('Toggle publication called:', {
      testId,
      testTitle,
      canPublish,
      userRole: userDoc?.role,
      isHead,
      isAdmin
    });
    
    if (!canPublish) {
      console.warn('User does not have publish permissions');
      return;
    }
    
    try {
      setPublishing(true);
      setError(''); // Clear any previous errors
      
      const isCurrentlyPublished = publishedLeaderboards[testId]?.published;
      const newStatus = !isCurrentlyPublished;
      
      // Use the tests collection to store publication status instead
      const testRef = doc(db, 'tests', testId);
      
      if (newStatus) {
        // Publishing - set the field to true
        await updateDoc(testRef, {
          leaderboardPublished: true,
          publishedBy: userDoc?.uid || 'unknown',
          publishedAt: new Date(),
          publisherRole: userDoc?.role || 'unknown'
        });
      } else {
        // Unpublishing - remove the field or set to false
        await updateDoc(testRef, {
          leaderboardPublished: false,
          unpublishedBy: userDoc?.uid || 'unknown',
          unpublishedAt: new Date()
        });
      }
      
      // Update local state
      if (newStatus) {
        setPublishedLeaderboards(prev => ({
          ...prev,
          [testId]: {
            published: true,
            testId: testId,
            testTitle: testTitle,
            publishedBy: userDoc?.uid || 'unknown',
            publishedAt: new Date(),
            publisherRole: userDoc?.role || 'unknown'
          }
        }));
      } else {
        // Remove from published leaderboards when unpublishing
        setPublishedLeaderboards(prev => {
          const updated = { ...prev };
          delete updated[testId];
          return updated;
        });
      }
      
      setPublishing(false);
      
      // Show success message
      const action = newStatus ? 'published' : 'unpublished';
      console.log(`Leaderboard ${action} successfully for test: ${testTitle}`);
      
    } catch (error) {
      console.error('Error updating leaderboard publication:', error);
      const isCurrentlyPublished = publishedLeaderboards[testId]?.published;
      const attemptedAction = !isCurrentlyPublished ? 'publish' : 'unpublish';
      setError(`Failed to ${attemptedAction} leaderboard: ${error.message}`);
      setPublishing(false);
    }
  };

  // Check if leaderboard is published for candidates
  const isLeaderboardPublished = (testId) => {
    // Check both the publishedLeaderboards state and the test's leaderboardPublished field
    const fromState = publishedLeaderboards[testId]?.published === true;
    const test = tests.find(t => t.id === testId);
    const fromTest = test?.leaderboardPublished === true;
    return fromState || fromTest;
  };

  // Retry loading function
  const retryLoading = () => {
    setError('');
    setLoading(true);
    // Trigger the useEffect to reload
    if (userDoc) {
      const loadTests = async () => {
        try {
          setLoading(true);
          setError('');
          
          const testsRef = collection(db, 'tests');
          const snapshot = await getDocs(testsRef);
          const testsData = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          
          let filteredTests = testsData;
          if (userDoc?.role === 'head' && userDoc?.domain) {
            filteredTests = testsData.filter(test => test.domain === userDoc.domain);
          }
          
          const publishedData = {};
          filteredTests.forEach(test => {
            if (test.leaderboardPublished === true) {
              publishedData[test.id] = {
                published: true,
                testId: test.id,
                testTitle: test.title,
                publishedBy: test.publishedBy || 'unknown',
                publishedAt: test.publishedAt || new Date(),
                publisherRole: test.publisherRole || 'unknown'
              };
            }
          });
          
          setTests(filteredTests);
          setPublishedLeaderboards(publishedData);
          setLoading(false);
        } catch (err) {
          console.error('Error loading tests and leaderboards:', err);
          setError(`Failed to load tests: ${err.message || 'Unknown error'}`);
          setLoading(false);
        }
      };
      loadTests();
    }
  };

  // Render pie chart (simple CSS-based)
  const renderPieChart = () => {
    const data = getPieChartData();
    if (data.length === 0) return null;
    
    const total = data.reduce((sum, item) => sum + item.count, 0);
    let cumulativePercentage = 0;
    
    return (
      <div className="pie-chart-container">
        <div className="pie-chart">
          <svg viewBox="0 0 42 42" className="pie-svg">
            {data.map((item, index) => {
              const percentage = (item.count / total) * 100;
              const strokeDasharray = `${percentage} ${100 - percentage}`;
              const strokeDashoffset = -cumulativePercentage;
              cumulativePercentage += percentage;
              
              return (
                <circle
                  key={index}
                  className="pie-segment"
                  cx="21"
                  cy="21"
                  r="15.915"
                  fill="transparent"
                  stroke={item.color}
                  strokeWidth="3"
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  transform="rotate(-90 21 21)"
                />
              );
            })}
          </svg>
          <div className="pie-center">
            <span className="pie-total">{total}</span>
            <span className="pie-label">Total</span>
          </div>
        </div>
        
        <div className="pie-legend">
          {data.map((item, index) => (
            <div key={index} className="legend-item">
              <div 
                className="legend-color" 
                style={{ backgroundColor: item.color }}
              ></div>
              <span className="legend-text">
                {item.label}: {item.count} ({Math.round((item.count / total) * 100)}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="leaderboard-container">
        <Loading message="Loading tests" subtext="Fetching available tests for leaderboard" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="leaderboard-container">
        <div className="error-message">
          <Icon name="fire" size="large" />
          <h3>Error Loading Leaderboard</h3>
          <p>{error}</p>
          <button 
            className="btn btn-primary"
            onClick={retryLoading}
            style={{ marginTop: '1rem' }}
          >
            <Icon name="target" size="small" />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Show video for candidates when no leaderboards are published
  if (isCandidate && Object.keys(publishedLeaderboards).length === 0) {
    return (
      <div className="leaderboard-container">
        <div className="video-placeholder">
          <div className="video-text-section">
            <Icon name="leaderboard" size="2xl" />
            <h2>Leaderboards Coming Soon!</h2>
            <p>Your instructors will publish test leaderboards here when they're ready.</p>
          </div>
          
          <div className="video-container">
            <video 
              autoPlay 
              loop 
              muted 
              playsInline
              className="interface-video"
            >
              <source src={userInterfaceVideo} type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="leaderboard-container">
      

      {!selectedTest ? (
        <div className="test-selection">
          <div className="tests-grid">
            {tests.map(test => {
              const isPublished = isLeaderboardPublished(test.id);
              const canViewLeaderboard = canPublish || isPublished;
              
              return (
                <div 
                  key={test.id} 
                  className={`test-card ${!canViewLeaderboard ? 'test-card-disabled' : ''}`}
                  onClick={() => canViewLeaderboard && loadLeaderboard(test)}
                >
                  <div className="test-card-header">
                    <Icon name="notebook" size="medium" />
                    <h3>{test.title}</h3>
                    {canPublish && (
                      <div className="publication-controls">
                        <button
                          className={`btn btn-sm ${isPublished ? 'btn-danger' : 'btn-success'}`}
                          onClick={async (e) => {
                            e.stopPropagation();
                            console.log('Publication button clicked:', {
                              testId: test.id,
                              testTitle: test.title,
                              currentStatus: isPublished,
                              userRole: userDoc?.role,
                              canPublish
                            });
                            try {
                              await toggleLeaderboardPublication(test.id, test.title);
                            } catch (error) {
                              // Error is already handled in the function
                              console.log('Publication toggle completed with error');
                            }
                          }}
                          disabled={publishing}
                          title={isPublished ? 'Unpublish Leaderboard' : 'Publish Leaderboard'}
                        >
                          {publishing ? (
                            <><Icon name="fire" size="small" /> Processing...</>
                          ) : isPublished ? (
                            <><Icon name="fire" size="small" /> Unpublish</>
                          ) : (
                            <><Icon name="success" size="small" /> Publish</>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="test-card-body">
                    <div className="test-info">
                      <span className="test-domain">
                        <Icon name="shield" size="small" />
                        {test.domain}
                      </span>
                      <span className="test-duration">
                        <Icon name="calendar" size="small" />
                        {test.duration || '60 min'}
                      </span>
                      {!canViewLeaderboard && (
                        <span className="publication-status unpublished">
                          <Icon name="fire" size="small" />
                          Not Published
                        </span>
                      )}
                      {isPublished && (
                        <span className="publication-status published">
                          <Icon name="success" size="small" />
                          Published
                        </span>
                      )}
                    </div>
                    <div className="test-stats">
                      <span>Total Marks: {test.totalMarks || 'N/A'}</span>
                      <span>Status: {test.status || 'inactive'}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          
          {tests.length === 0 && (
            <div className="video-placeholder">
              <div className="video-text-section">
                <Icon name="notebook" size="2xl" />
                <h2>No Tests Available</h2>
                <p>No tests found for leaderboard display. Tests will appear here once they are created.</p>
              </div>
              
              <div className="video-container">
                <video 
                  autoPlay 
                  loop 
                  muted 
                  playsInline
                  className="interface-video"
                >
                  <source src={userInterfaceVideo} type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
              </div>
            </div>
          )}
          
          {isCandidate && tests.length > 0 && tests.every(test => !isLeaderboardPublished(test.id)) && (
            <div className="no-published-leaderboards">
              <Icon name="leaderboard" size="2xl" />
              <h3>No Published Leaderboards</h3>
              <p>Your instructors haven't published any leaderboards yet. Check back later!</p>
            </div>
          )}
        </div>
      ) : (
        <div className="leaderboard-content">
          <div className="leaderboard-nav">
            <button 
              className="btn btn-outline"
              onClick={() => {
                setSelectedTest(null);
                setLeaderboardData([]);
              }}
            >
              <Icon name="leaderboard" size="small" />
              Back to Tests
            </button>
            
            <div className="test-info-header">
              <h2>{selectedTest.title}</h2>
              <div className="test-meta">
                <span>Domain: {selectedTest.domain}</span>
                <span>Total Marks: {selectedTest.totalMarks || 'N/A'}</span>
                <span>Participants: {leaderboardData.length}</span>
              </div>
            </div>
          </div>

          {loadingLeaderboard ? (
            <Loading message="Loading leaderboard" subtext="Calculating rankings and performance data" />
          ) : (
            <div className="leaderboard-dashboard">
              {/* Performance Overview */}
              <div className="performance-overview">
                <div className="overview-stats">
                  <div className="stat-card">
                    <Icon name="user" size="xl" />
                    <div className="stat-content">
                      <h3>Total Participants</h3>
                      <span className="stat-number">{leaderboardData.length}</span>
                    </div>
                  </div>
                  
                  
                  <div className="stat-card">
                    <Icon name="success" size="xl" />
                    <div className="stat-content">
                      <h3>Top Score</h3>
                      <span className="stat-number">
                        {leaderboardData.length > 0 ? Math.round(leaderboardData[0]?.score || 0) : 0}%
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* Pie Chart */}
                <div className="chart-section">
                  <h3>Performance Distribution</h3>
                  {renderPieChart()}
                </div>
              </div>

              {/* Leaderboard Table */}
              <div className="leaderboard-table-section">
                <h3>Rankings</h3>
                <div className="table-container">
                  <table className="leaderboard-table">
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Candidate Name</th>
                        <th>Score</th>
                        <th>Marks</th>

                        <th>Submitted At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboardData.map((submission) => (
                        <tr key={submission.id} className={`rank-${submission.rank}`}>
                          <td>
                            <div className={`rank-badge ${getRankBadgeColor(submission.rank)}`}>
                              {submission.rank === 1 && <Icon name="gold" size="small" />}
                              {submission.rank === 2 && <Icon name="silver" size="small" />}
                              {submission.rank === 3 && <Icon name="bronze" size="small" />}
                              #{submission.rank}
                            </div>
                          </td>
                          <td>
                            <div className="candidate-info">
                              <Icon name="user" size="small" />
                              <span>{submission.candidateName}</span>
                            </div>
                          </td>
                          <td>
                            <div className="score-display">
                              <span className={`score-percentage ${
                                submission.score >= 90 ? 'excellent' :
                                submission.score >= 70 ? 'good' :
                                submission.score >= 50 ? 'average' : 'below-average'
                              }`}>
                                {Math.round(submission.score)}%
                              </span>
                            </div>
                          </td>
                          <td>
                            <span className="marks-fraction">
                              {submission.totalMarksAwarded}/{submission.maxPossibleMarks}
                            </span>
                          </td>
                          
                          <td>
                            <span className="submission-date">
                              {formatDate(submission.submittedAt)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                {leaderboardData.length === 0 && (
                  <div className="no-submissions">
                    <Icon name="notebook" size="2xl" />
                    <h3>No Evaluated Submissions</h3>
                    <p>No evaluated submissions found for this test</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Leaderboard;
