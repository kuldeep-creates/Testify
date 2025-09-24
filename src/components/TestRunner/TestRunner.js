import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchTestWithQuestions, logPaste, logTabSwitch } from '../../services/firestore';
import { useFirebase } from '../../context/FirebaseContext';
import { addDoc, collection, serverTimestamp, doc, getDoc, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import Loading from '../Loading/Loading';
import BlockedSubmissionCard from '../BlockedSubmissionCard/BlockedSubmissionCard';
import './TestRunner.css';

// Network monitoring function
const monitorConnection = async () => {
  try {
    const response = await fetch('/favicon.ico', { 
      method: 'HEAD',
      cache: 'no-cache'
    });
    return response.ok;
  } catch {
    return navigator.onLine;
  }
};

// Helper function to parse duration string into total minutes
const parseDurationToMinutes = (durationString) => {
  if (!durationString) return 30;
  
  // Handle formats like "30 min", "1h", "1h 30min", "90 min"
  const minMatch = durationString.match(/(\d+)\s*min/);
  const hourMatch = durationString.match(/(\d+)h/);
  
  let totalMinutes = 0;
  
  if (hourMatch) {
    totalMinutes += parseInt(hourMatch[1]) * 60;
  }
  
  if (minMatch) {
    totalMinutes += parseInt(minMatch[1]);
  }
  
  // If no matches, try to parse as just minutes
  if (!hourMatch && !minMatch) {
    const numMatch = durationString.match(/(\d+)/);
    if (numMatch) {
      totalMinutes = parseInt(numMatch[1]);
    }
  }
  
  return totalMinutes || 30; // Default to 30 minutes if parsing fails
};

function TestRunner() {
  const { testId } = useParams();
  const navigate = useNavigate();
  const { user, userDoc } = useFirebase();

  const [isLoading, setIsLoading] = useState(true);
  const [errMsg, setErrMsg] = useState('');
  const [testData, setTestData] = useState(null);
  const [current, setCurrent] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [userAnswers, setUserAnswers] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tabSwitches, setTabSwitches] = useState(0);
  const [alerts, setAlerts] = useState([]);
  const [showAlert, setShowAlert] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const [password, setPassword] = useState('');
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [netStatus, setNetStatus] = useState('checking');
  const [showBlockedCard, setShowBlockedCard] = useState(false);
  const [blockMessage, setBlockMessage] = useState('');
  
  // Ref to track if auto-submit has been triggered to prevent multiple submissions
  const autoSubmitTriggered = useRef(false);

  const currentQuestion = useMemo(() => testData?.questions?.[current] || null, [testData, current]);

  // Function to get candidate name from database
  const getCandidateName = useCallback(async () => {
    try {
      console.log('Fetching candidate name for user:', user?.uid);
      
      // First, try to get from userDoc (FirebaseContext)
      if (userDoc?.name && userDoc.name.trim()) {
        console.log('Using name from userDoc:', userDoc.name);
        return userDoc.name.trim();
      }
      
      // If not available in userDoc, fetch directly from database
      if (user?.uid) {
        const userDocRef = doc(db, 'user', user.uid);
        const userSnapshot = await getDoc(userDocRef);
        
        if (userSnapshot.exists()) {
          const userData = userSnapshot.data();
          console.log('Fetched user data from database:', userData);
          
          if (userData.name && userData.name.trim()) {
            console.log('Using name from database:', userData.name);
            return userData.name.trim();
          }
        }
      }
      
      // Fallback: extract from email if no name found
      const email = userDoc?.email || user?.email;
      if (email && email.includes('@')) {
        const extractedName = email.split('@')[0];
        console.log('Using extracted name from email:', extractedName);
        return extractedName;
      }
      
      console.log('No name found, using Unknown');
      return 'Unknown';
    } catch (error) {
      console.error('Error fetching candidate name:', error);
      // Fallback: extract from email
      const email = userDoc?.email || user?.email;
      if (email && email.includes('@')) {
        return email.split('@')[0];
      }
      return 'Unknown';
    }
  }, [user, userDoc]);

  // Submission logic
  const handleSubmit = useCallback(async (isAutoSubmit = false) => {
    console.log('handleSubmit called', { isAutoSubmit, isSubmitting, user: user?.uid, testId });
    
    if (isSubmitting) {
      console.log('Already submitting, returning');
      return;
    }

    // Check if multiple submissions are allowed
    const allowMultiple = testData?.allowMultipleSubmissions || false;
    
    if (!isAutoSubmit) {
      let confirmMessage = 'Submit your test?';
      if (allowMultiple) {
        confirmMessage = 'Submit your test? You can submit again later if multiple submissions are enabled.';
      } else {
        confirmMessage = 'Submit your test? This cannot be undone.';
      }
      
      if (!window.confirm(confirmMessage)) {
        console.log('User cancelled submission');
        return;
      }
    }
    setIsSubmitting(true);
    console.log('Starting submission process');

    try {
      if (!user?.uid) {
        console.error('No user UID');
        throw new Error('User not authenticated');
      }
      if (!testId) {
        console.error('No test ID');
        throw new Error('Missing test ID');
      }

      // Check if multiple submissions are allowed
      const allowMultiple = testData?.allowMultipleSubmissions || false;
      
      // Check for existing submissions
      const existingSubmissionsQuery = query(
        collection(db, 'results'),
        where('candidateId', '==', user.uid),
        where('testId', '==', testId)
      );
      const existingSubmissions = await getDocs(existingSubmissionsQuery);
      
      console.log('Existing submissions found:', existingSubmissions.size);
      console.log('Multiple submissions allowed:', allowMultiple);
      
      // Debug: Log the test data before calculating total marks
      console.log('Test data when submitting:', testData);
      
      // Calculate total marks, ensuring we're looking at the correct property
      const questions = testData?.questions || [];
      const totalMarks = questions.reduce((sum, q) => {
        const marks = q.marks || q.marksPerQuestion || 1; // Try different possible properties
        console.log(`Question ${q.id} marks:`, marks);
        return sum + Number(marks);
      }, 0);
      
      console.log('Calculated total marks:', totalMarks);
      
      // Get the candidate's registered name from database
      const candidateName = await getCandidateName();
      console.log('Final candidate name for submission:', candidateName);

      const payload = {
        candidateId: user.uid,
        candidateName: candidateName,
        testId,
        testTitle: testData?.title || 'Test',
        title: testData?.title || 'Test', // Include both testTitle and title for backward compatibility
        answers: userAnswers,
        score: 0,
        status: isAutoSubmit ? 'auto-submitted' : 'submitted',
        submittedAt: new Date(),
        startedAt: startTime || new Date(),
        totalQuestions: testData?.questions?.length || 0,
        answeredQuestions: Object.values(userAnswers).filter(a => a && String(a).trim() !== '').length,
        totalMarks: totalMarks // Add total marks to the payload
      };

      console.log('Submitting test with payload:', payload);
      console.log('User answers:', userAnswers);

      // Handle submission based on multiple submission setting
      // Enforce max 3 attempts when multiple submissions are allowed
      if (allowMultiple && existingSubmissions.size >= 3) {
        throw new Error('Maximum attempts reached. You have already submitted this test 3 times.');
      } else if (existingSubmissions.size > 0 && allowMultiple) {
        // Update the latest existing submission
        const latestSubmission = existingSubmissions.docs[existingSubmissions.docs.length - 1];
        await updateDoc(latestSubmission.ref, {
          ...payload,
          submissionNumber: existingSubmissions.size + 1,
          previousSubmissionId: latestSubmission.id,
          updatedAt: new Date()
        });
        console.log('Updated existing submission with ID:', latestSubmission.id);
        // Show correct attempt number
        alert(`Test re-submitted successfully! (Attempt #${existingSubmissions.size + 1})`);
      } else if (existingSubmissions.size > 0 && !allowMultiple) {
        // Multiple submissions not allowed, show error
        throw new Error('You have already submitted this test. Multiple submissions are not allowed.');
      } else {
        // First submission or multiple submissions allowed
        const docRef = await addDoc(collection(db, 'results'), {
          ...payload,
          submissionNumber: 1
        });
        console.log('Document written with ID:', docRef.id);
        alert('Test submitted successfully!');
      }
      
      navigate('/dashboard');
      
    } catch (err) {
      console.error('Submission error:', err);
      console.error('Error code:', err.code);
      console.error('Error message:', err.message);
      console.error('Error stack:', err.stack);
      
      let msg = 'Could not submit test. ';
      if (err.code === 'unavailable') msg += 'Check your internet connection.';
      else if (err.code === 'permission-denied') msg += 'Permission denied. Check Firestore rules.';
      else if (err.code === 'unauthenticated') msg += 'Please log in again.';
      else if (err.code === 'failed-precondition') msg += 'Database configuration issue.';
      else if (err.message?.includes('fetch')) msg += 'Network error. Check connection.';
      else msg += `${err.message || 'Unknown error'}. Check console for details.`;
      
      alert(msg);
    } finally {
      setIsSubmitting(false);
      console.log('Submission process completed');
    }
  }, [isSubmitting, user, testId, userAnswers, testData, navigate, startTime, getCandidateName]);

  // Auto-submit for violations
  const autoSubmit = useCallback(async (reason) => {
    if (isSubmitting || autoSubmitTriggered.current) return;
    autoSubmitTriggered.current = true;
    setIsSubmitting(true);
    try {
      // Get the candidate's registered name from database
      const candidateName = await getCandidateName();

      const payload = {
        candidateId: user.uid,
        candidateName: candidateName,
        testId,
        answers: userAnswers,
        score: 0,
        status: 'auto-submitted',
        submittedAt: new Date(),
        startedAt: startTime || new Date(),
        totalQuestions: testData?.questions?.length || 0,
        answeredQuestions: Object.values(userAnswers).filter(a => a && String(a).trim() !== '').length,
        violation: reason,
        tabSwitches,
        alertCount: alerts.length
      };
      await addDoc(collection(db, 'results'), payload);
      await addDoc(collection(db, 'adminLogs'), {
        action: 'auto-submit',
        candidateId: user.uid,
        testId,
        reason,
        tabSwitches,
        timestamp: new Date(),
        evidence: {
          alerts: alerts.length,
          tabSwitches,
          answers: Object.keys(userAnswers).length
        }
      });
      // Silently navigate back to dashboard after auto-submit
      navigate('/dashboard');
    } catch {
      // Silent failure - user will see result in dashboard
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, user, testId, userAnswers, testData, tabSwitches, alerts, navigate, startTime, getCandidateName]);

  // Handle password verification
  const verifyPassword = () => {
    if (password === testData.password) {
      setShowPasswordPrompt(false);
      setPasswordError('');
      // Start the timer only after successful password verification
      const mins = parseDurationToMinutes(testData.duration);
      setSecondsLeft(mins * 60);
      setStartTime(new Date());
    } else {
      setPasswordError('Incorrect password. Please try again.');
    }
  };

  // Fetch test and check if password is required
  useEffect(() => {
    async function fetchData() {
      if (!user) {
        navigate('/');
        return;
      }
      try {
        const test = await fetchTestWithQuestions(testId);
        if (!test) {
          setErrMsg('Test not found');
          setIsLoading(false);
          return;
        }
        
        // Debug: Log test data and questions
        console.log('Test data:', test);
        if (test.questions) {
          console.log('Questions with marks:', test.questions.map(q => ({
            id: q.id,
            marks: q.marks,
            questionText: q.questionText?.substring(0, 30) + '...'
          })));
        }
        
        // Check submission count and multiple submission settings BEFORE showing password
        const allowMultiple = test.allowMultipleSubmissions || false;
        const existingSubmissionsQuery = query(
          collection(db, 'results'),
          where('candidateId', '==', user.uid),
          where('testId', '==', testId)
        );
        const existingSubmissions = await getDocs(existingSubmissionsQuery);
        const submissionCount = existingSubmissions.size;
        
        console.log('TestRunner submission check:', {
          submissionCount,
          allowMultiple,
          testId,
          shouldBlock: submissionCount >= 3 && allowMultiple,
          attemptNumber: submissionCount + 1
        });
        
        if (submissionCount > 0 && !allowMultiple) {
          // Multiple submissions not allowed
          setBlockMessage(`This test does not allow multiple submissions. You have already submitted this test ${submissionCount} time${submissionCount > 1 ? 's' : ''}. Please contact your branch head if you need to retake this test.`);
          setShowBlockedCard(true);
          setIsLoading(false);
          return;
        } else if (submissionCount >= 3 && allowMultiple) {
          // Multiple submissions allowed but limit reached (block after 3 submissions, not on 3rd)
          setBlockMessage(`You have reached the maximum number of attempts (3) for this test. You have already submitted this test ${submissionCount} times. Please contact your branch head if you need additional attempts.`);
          setShowBlockedCard(true);
          setIsLoading(false);
          return;
        }
        
        // Only set test data and show password if submission limits are not exceeded
        setTestData(test);
        
        // Check if password is required
        if (test.password && test.password.trim() !== '') {
          setShowPasswordPrompt(true);
        } else {
          // No password required, start the test
          const mins = parseDurationToMinutes(test.duration);
          setSecondsLeft(mins * 60);
          setStartTime(new Date());
        }
      } catch (err) {
        console.error('Error loading test:', err);
        setErrMsg(err.message || 'Could not load test');
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [testId, user, navigate]);

  // Timer logic
  useEffect(() => {
    if (secondsLeft <= 0) return;
    
    const interval = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          // Auto-submit when time runs out
          if (!isSubmitting && !autoSubmitTriggered.current) {
            console.log('Time up! Auto-submitting test...');
            autoSubmitTriggered.current = true;
            handleSubmit(true);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(interval);
  }, [secondsLeft]); // Removed handleSubmit and isSubmitting from dependencies to prevent re-renders

  // Network status polling
  useEffect(() => {
    async function checkNet() {
      try {
        const online = await monitorConnection();
        setNetStatus(online ? 'online' : 'offline');
      } catch {
        setNetStatus('offline');
      }
    }
    checkNet();
    const poll = setInterval(checkNet, 30000);
    return () => clearInterval(poll);
  }, []);

  // Tab switch detection
  const handleTabSwitch = useCallback(async (eventType) => {
    if (!user || !testId) return;
    try {
      await addDoc(collection(db, 'tabSwitchLogs'), {
        candidateId: user.uid,
        testId,
        eventType,
        timestamp: new Date(),
        count: tabSwitches + 1
      });
      setTabSwitches(prev => prev + 1);
      if (tabSwitches + 1 >= 2) {
        setAlerts(prev => [...prev, { msg: `Tab switched ${tabSwitches + 1} times. Further switching will submit your test.`, time: new Date() }]);
        setShowAlert(true);
        if (tabSwitches + 1 >= 3) {
          await autoSubmit('tab-switch-limit');
        }
      }
    } catch {}
  }, [user, testId, tabSwitches, autoSubmit]);

  useEffect(() => {
    const blurHandler = () => handleTabSwitch('blur');
    const focusHandler = () => handleTabSwitch('focus');
    window.addEventListener('blur', blurHandler);
    window.addEventListener('focus', focusHandler);
    return () => {
      window.removeEventListener('blur', blurHandler);
      window.removeEventListener('focus', focusHandler);
    };
  }, [handleTabSwitch]);

  // Paste detection
  const handlePaste = useCallback(async (qid, text) => {
    if (!user || !testId || !qid) return;
    try {
      await addDoc(collection(db, 'pasteLogs'), {
        candidateId: user.uid,
        testId,
        questionId: qid,
        pasted: text.slice(0, 100),
        timestamp: new Date()
      });
      setAlerts(prev => [...prev, { msg: `Paste detected in question ${qid}.`, time: new Date() }]);
      setShowAlert(true);
    } catch {}
  }, [user, testId]);

  // Keyboard navigation
  useEffect(() => {
    const navHandler = (e) => {
      if (isSubmitting || !testData?.questions) return;
      if (e.key === 'ArrowRight' && current < testData.questions.length - 1) {
        setCurrent(c => c + 1);
      } else if (e.key === 'ArrowLeft' && current > 0) {
        setCurrent(c => c - 1);
      }
    };
    window.addEventListener('keydown', navHandler);
    return () => window.removeEventListener('keydown', navHandler);
  }, [current, testData, isSubmitting]);

  // UI helpers
  const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // Blocked submission card
  if (showBlockedCard) {
    return <BlockedSubmissionCard message={blockMessage} />;
  }

  // Password prompt modal
  if (showPasswordPrompt) {
    return (
      <div className="password-prompt-overlay">
        <div className="password-prompt">
          <h2>Enter Test Password</h2>
          <p>This test is password protected. Please enter the password to continue.</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
            className="password-input"
            onKeyPress={(e) => e.key === 'Enter' && verifyPassword()}
          />
          {passwordError && <div className="error-message">{passwordError}</div>}
          <button 
            onClick={verifyPassword}
            className="btn btn-primary"
            disabled={!password.trim()}
          >
            Start Test
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <Loading message="Loading test" subtext="Preparing your test environment" />;
  }
  if (errMsg) return <div className="test-container"><div className="test-card">Error: {errMsg}</div></div>;
  if (!testData) return <div className="test-container"><div className="test-card">Test not found</div></div>;
  if (!user) return <div className="test-container"><div className="test-card">Please log in</div></div>;

  return (
    <div className="test-runner">
      <div className="test-container">
        <div className="test-header sticky">
          <button
            className="btn btn-outline"
            onClick={() => current > 0 && setCurrent(current - 1)}
            disabled={current === 0}
          >← Previous</button>
          <div className="text-lg font-medium text-primary">
            Question {current + 1} of {testData.questions.length}
          </div>
          <div className={`timer ${secondsLeft < 300 ? 'danger' : secondsLeft < 600 ? 'warning' : ''}`}>
            Time: {formatTime(secondsLeft)}
          </div>
          <div className={`connection-status ${netStatus}`}>
            {netStatus === 'online' ? '🟢 Online' : netStatus === 'offline' ? '🔴 Offline' : '🟡 Checking...'}
          </div>
          <button
            className="btn btn-primary"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log('Submit button clicked');
              handleSubmit();
            }}
            disabled={isSubmitting}
            style={{ 
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              opacity: isSubmitting ? 0.6 : 1,
              pointerEvents: 'auto'
            }}
          >
            {isSubmitting
              ? 'Submitting...'
              : 'Submit Test'}
          </button>
        </div>
        {showAlert && alerts.length > 0 && (
          <div className="warning-banner">
            <div className="warning-content">
              <div className="warning-icon">⚠️</div>
              <div className="warning-text">
                <strong>Warning:</strong> {alerts[alerts.length - 1].msg}
              </div>
              <button className="warning-close" onClick={() => setShowAlert(false)}>×</button>
            </div>
          </div>
        )}
        <div className="test-progress">
          <div
            className="test-progress-bar"
            style={{ width: `${Math.round(((current + 1) / (testData.questions.length || 1)) * 100)}%` }}
          />
        </div>
        <div className="test-content">
          {currentQuestion ? (
            <div className="card">
              <div className="card-body">
                <div className="question-content">
                  <div className="text-xl font-semibold mb-6 text-primary">
                    {currentQuestion.questionText || 'No question text'}
                  </div>
                  {currentQuestion.imageUrl && currentQuestion.imageUrl.trim() && (
                    <div className="question-image">
                      <img 
                        src={currentQuestion.imageUrl} 
                        alt="Question illustration"
                        className="question-img"
                        onError={(e) => {
                          console.error('Failed to load image:', currentQuestion.imageUrl);
                          e.target.style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                </div>
                {currentQuestion.questionType === 'mcq' && (
                  <div>
                    <div className="space-y-3 mb-6">
                      {currentQuestion.options?.map((opt, i) => (
                        <label key={i} className="flex items-center gap-3 cursor-pointer p-3 rounded-lg hover:bg-gray-50 transition-colors">
                          <input
                            type="radio"
                            name={`q-${currentQuestion.id}`}
                            value={opt}
                            checked={userAnswers[currentQuestion.id] === opt}
                            onChange={e => setUserAnswers(ans => ({ ...ans, [currentQuestion.id]: e.target.value }))}
                            className="w-4 h-4 text-primary"
                          />
                          <span className="text-base">{opt}</span>
                        </label>
                      ))}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-secondary mb-2">Notes (Optional)</label>
                      <textarea
                        className="textarea"
                        placeholder="Add notes..."
                        rows={4}
                        value={userAnswers[`${currentQuestion.id}_notes`] || ''}
                        onChange={e => setUserAnswers(ans => ({ ...ans, [`${currentQuestion.id}_notes`]: e.target.value }))}
                        onPaste={e => handlePaste(`${currentQuestion.id}_notes`, e.clipboardData.getData('text'))}
                      />
                    </div>
                  </div>
                )}
                {currentQuestion.questionType === 'long' && (
                  <div>
                    <label className="block text-sm font-medium text-secondary mb-2">Your Answer</label>
                    <textarea
                      className="textarea"
                      placeholder="Type your answer..."
                      rows={8}
                      value={userAnswers[currentQuestion.id] || ''}
                      onChange={e => setUserAnswers(ans => ({ ...ans, [currentQuestion.id]: e.target.value }))}
                      onPaste={e => handlePaste(currentQuestion.id, e.clipboardData.getData('text'))}
                    />
                  </div>
                )}
                {currentQuestion.questionType === 'code' && (
                  <div>
                    <label className="block text-sm font-medium text-secondary mb-2">Your Code</label>
                    <textarea
                      className="textarea code"
                      placeholder="Write code here..."
                      rows={12}
                      value={userAnswers[currentQuestion.id] || ''}
                      onChange={e => setUserAnswers(ans => ({ ...ans, [currentQuestion.id]: e.target.value }))}
                      onPaste={e => handlePaste(currentQuestion.id, e.clipboardData.getData('text'))}
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="card">
              <div className="card-body text-center">
                <div className="text-lg text-secondary">No questions available.</div>
              </div>
            </div>
          )}
        </div>
        <div className="test-footer">
          <div className="question-nav">
            {testData.questions.map((q, i) => (
              <button
                key={i}
                className={`question-nav-btn ${i === current ? 'active' : ''} ${userAnswers[q.id] ? 'answered' : ''}`}
                onClick={() => !isSubmitting && setCurrent(i)}
                disabled={isSubmitting}
                title={`Question ${i + 1}${userAnswers[q.id] ? ' (Answered)' : ''}`}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              className="btn btn-outline"
              onClick={() => current < testData.questions.length - 1 && setCurrent(current + 1)}
              disabled={current >= testData.questions.length - 1 || isSubmitting}
            >
              {current >= testData.questions.length - 1 ? 'Last Question' : 'Next →'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => alert('Progress is auto-saved!')}
            >
              Save Progress
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TestRunner;
