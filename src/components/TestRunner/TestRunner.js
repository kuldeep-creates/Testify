import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, where } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useFirebase } from '../../context/FirebaseContext';
import { db } from '../../firebase';
import { fetchTestWithQuestions } from '../../services/firestore';
import Logger from '../../utils/logger';
import { confirmAction, showError, showInfo, showSuccess } from '../../utils/notifications';
import BlockedSubmissionCard from '../BlockedSubmissionCard/BlockedSubmissionCard';
import Loading from '../Loading/Loading';
import './TestRunner.css';

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
  if (!durationString) { return 30; }

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

// Helper function to get file extension based on language
const getFileExtension = (language) => {
  const extensions = {
    'javascript': 'js',
    'python': 'py',
    'java': 'java',
    'cpp': 'cpp',
    'c': 'c',
    'html': 'html',
    'css': 'css',
    'sql': 'sql',

  };
  return extensions[language.toLowerCase()] || 'txt';
};

// Helper function to get code placeholder based on language
const getCodePlaceholder = (language) => {
  const placeholders = {
    'javascript': 'function solution() {\n    // Your code here\n    return result;\n}',
    'python': 'def solution():\n    # Your code here\n    return result',
    'java': 'public class Solution {\n    public static void main(String[] args) {\n        // Your code here\n    }\n}',
    'cpp': '#include <iostream>\n#include <iostream> \n using namespace std;\n\nint main() {\n    \n\n\n    return 0;\n}',
    'c': '#include <stdio.h>\n\nint main() {\n    // Your code here\n    return 0;\n}',
    'html': '<!-- Write your HTML code here -->\n<!DOCTYPE html>\n<html>\n<head>\n    <title>Solution</title>\n</head>\n<body>\n    <!-- Your code here -->\n</body>\n</html>',
    'css': '/* Write your CSS code here */\n.container {\n    /* Your styles here */\n}',
    'sql': '-- Write your SQL code here\nSELECT * FROM table_name\nWHERE condition;'
  };
  return placeholders[language.toLowerCase()] || '// Write your code here\n';
};

// Helper function to get language display info
const getLanguageInfo = (language) => {
  const languages = {
    'javascript': { name: 'JavaScript', color: '#f7df1e', icon: '🟨' },
    'python': { name: 'Python', color: '#3776ab', icon: '🐍' },
    'java': { name: 'Java', color: '#ed8b00', icon: '☕' },
    'cpp': { name: 'C++', color: '#00599c', icon: '⚡' },
    'html': { name: 'HTML', color: '#e34f26', icon: '🌐' },
    'css': { name: 'CSS', color: '#1572b6', icon: '🎨' },
    'sql': { name: 'SQL', color: '#336791', icon: '🗃️' }
  };
  return languages[language.toLowerCase()] || { name: language.toUpperCase(), color: '#6b7280', icon: '📄' };
};

// Available languages for selector
const availableLanguages = [
  'javascript',
  'python',
  'java',
  'cpp',
  'c',

  'html',
  'css',
  'sql'
];

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
  const [showInstructions, setShowInstructions] = useState(false);
  const [netStatus, setNetStatus] = useState('checking');
  const [showBlockedCard, setShowBlockedCard] = useState(false);
  const [blockMessage, setBlockMessage] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('cpp');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Refs
  const autoSubmitTriggered = useRef(false);
  const testContainerRef = useRef(null);

  // Toggle fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      if (testContainerRef.current?.requestFullscreen) {
        testContainerRef.current.requestFullscreen().catch(err => {
          console.error('Error attempting to enable fullscreen:', err);
        });
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  // Handle fullscreen change events
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Sort questions by marks in ascending order (lowest marks first)
  const sortedQuestions = useMemo(() => {
    if (!testData?.questions) { return []; }
    return [...testData.questions].sort((a, b) => {
      const marksA = a.marks || a.marksPerQuestion || 1;
      const marksB = b.marks || b.marksPerQuestion || 1;
      return marksA - marksB;
    });
  }, [testData?.questions]);

  const currentQuestion = useMemo(() => sortedQuestions?.[current] || null, [sortedQuestions, current]);

  // Function to get candidate name from database
  const getCandidateName = useCallback(async () => {
    try {
      Logger.debug('Fetching candidate name', { userId: user?.uid });

      // First, try to get from userDoc (FirebaseContext)
      if (userDoc?.name && userDoc.name.trim()) {
        Logger.debug('Using name from userDoc');
        return userDoc.name.trim();
      }

      // If not available in userDoc, fetch directly from database
      if (user?.uid) {
        const userDocRef = doc(db, 'user', user.uid);
        const userSnapshot = await getDoc(userDocRef);

        if (userSnapshot.exists()) {
          const userData = userSnapshot.data();
          Logger.debug('Fetched user data from database');

          if (userData.name && userData.name.trim()) {
            Logger.debug('Using name from database');
            return userData.name.trim();
          }
        }
      }

      // Fallback: extract from email if no name found
      const email = userDoc?.email || user?.email;
      if (email && email.includes('@')) {
        const extractedName = email.split('@')[0];
        Logger.debug('Using extracted name from email');
        return extractedName;
      }

      Logger.warn('No name found, using Unknown');
      return 'Unknown';
    } catch (error) {
      Logger.error('Error fetching candidate name', null, error);
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
    Logger.info('Starting test submission', { isAutoSubmit, userId: user?.uid, testId });

    if (isSubmitting) {
      Logger.warn('Submission already in progress');
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

      const confirmed = confirmAction(confirmMessage);
      if (!confirmed) {
        Logger.info('User cancelled submission');
        return;
      }
    }
    setIsSubmitting(true);
    Logger.info('Starting submission process');

    try {
      if (!user?.uid) {
        Logger.error('No user UID available');
        throw new Error('User not authenticated');
      }
      if (!testId) {
        Logger.error('No test ID available');
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

      Logger.debug('Checking existing submissions', {
        existingCount: existingSubmissions.size,
        allowMultiple
      });

      Logger.debug('Calculating total marks from test data');

      // Calculate total marks, ensuring we're looking at the correct property
      const questions = sortedQuestions || [];
      const totalMarks = questions.reduce((sum, q) => {
        const marks = q.marks || q.marksPerQuestion || 1; // Try different possible properties
        Logger.debug(`Question ${q.id} marks: ${marks}`);
        return sum + Number(marks);
      }, 0);

      Logger.debug('Calculated total marks', { totalMarks });

      // Get the candidate's registered name from database
      const candidateName = await getCandidateName();
      Logger.debug('Using candidate name for submission', { candidateName });

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
        totalQuestions: sortedQuestions?.length || 0,
        answeredQuestions: Object.values(userAnswers).filter(a => a && String(a).trim() !== '').length,
        totalMarks: totalMarks // Add total marks to the payload
      };

      Logger.debug('Submitting test', { hasAnswers: !!userAnswers, answerCount: Object.keys(userAnswers).length });

      // Handle submission based on multiple submission setting
      if (existingSubmissions.size > 0 && !allowMultiple) {
        // Multiple submissions not allowed, show error
        throw new Error('You have already submitted this test. Multiple submissions are not allowed.');
      }

      // Check max attempts for multiple submissions (limit: 3)
      if (allowMultiple && existingSubmissions.size >= 3) {
        throw new Error('Maximum attempts reached. You have already submitted this test 3 times.');
      }

      // Create new submission (always create new, never update)
      const submissionNumber = existingSubmissions.size + 1;
      const docRef = await addDoc(collection(db, 'results'), {
        ...payload,
        submissionNumber: submissionNumber,
        attemptNumber: submissionNumber, // For clarity
        isRetake: existingSubmissions.size > 0
      });

      Logger.info('Test submitted successfully', {
        submissionId: docRef.id,
        attemptNumber: submissionNumber
      });

      if (submissionNumber > 1) {
        showSuccess(`Test re-submitted successfully! (Attempt #${submissionNumber})`);
      } else {
        showSuccess('Test submitted successfully!');
      }

      // Exit fullscreen after successful submission
      try {
        if (document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement) {
          if (document.exitFullscreen) {
            await document.exitFullscreen();
          } else if (document.webkitExitFullscreen) {
            await document.webkitExitFullscreen();
          } else if (document.msExitFullscreen) {
            await document.msExitFullscreen();
          }
          Logger.info('Exited fullscreen after submission');
        }
      } catch (fullscreenError) {
        Logger.warn('Could not exit fullscreen', null, fullscreenError);
      }

      navigate('/dashboard');

    } catch (err) {
      Logger.error('Test submission failed', {
        code: err.code,
        message: err.message
      }, err);

      let msg = 'Could not submit test. ';
      if (err.code === 'unavailable') { msg += 'Check your internet connection.'; }
      else if (err.code === 'permission-denied') { msg += 'Permission denied. Check Firestore rules.'; }
      else if (err.code === 'unauthenticated') { msg += 'Please log in again.'; }
      else if (err.code === 'failed-precondition') { msg += 'Database configuration issue.'; }
      else if (err.message?.includes('fetch')) { msg += 'Network error. Check connection.'; }
      else { msg += `${err.message || 'Unknown error'}.`; }

      showError(msg, err);
    } finally {
      setIsSubmitting(false);
      Logger.info('Submission process completed');
    }
  }, [isSubmitting, user, testId, userAnswers, testData, navigate, startTime, getCandidateName, sortedQuestions]);

  // Auto-submit for violations
  const autoSubmit = useCallback(async (reason) => {
    if (isSubmitting || autoSubmitTriggered.current || !user?.uid || !testId) {
      return;
    }

    autoSubmitTriggered.current = true;
    setIsSubmitting(true);

    try {
      // Get the candidate's registered name from database
      const candidateName = await getCandidateName();

      // Calculate total marks
      const questions = sortedQuestions || [];
      const totalMarks = questions.reduce((sum, q) => {
        const marks = q.marks || q.marksPerQuestion || 1;
        return sum + Number(marks);
      }, 0);

      const payload = {
        candidateId: user.uid,
        candidateName: candidateName,
        testId,
        testTitle: testData?.title || 'Test',
        title: testData?.title || 'Test',
        answers: userAnswers,
        score: 0,
        status: 'auto-submitted',
        submittedAt: new Date(),
        startedAt: startTime || new Date(),
        totalQuestions: sortedQuestions?.length || 0,
        answeredQuestions: Object.values(userAnswers).filter(a => a && String(a).trim() !== '').length,
        totalMarks: totalMarks,
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

      // Exit fullscreen before navigating
      try {
        if (document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement) {
          if (document.exitFullscreen) {
            await document.exitFullscreen();
          } else if (document.webkitExitFullscreen) {
            await document.webkitExitFullscreen();
          } else if (document.msExitFullscreen) {
            await document.msExitFullscreen();
          }
          Logger.info('Exited fullscreen after auto-submit');
        }
      } catch (fullscreenError) {
        Logger.warn('Could not exit fullscreen', null, fullscreenError);
      }

      // Silently navigate back to dashboard after auto-submit
      navigate('/dashboard');
    } catch (error) {
      Logger.error('Auto-submit error', null, error);
      // Still navigate to dashboard even if logging fails
      navigate('/dashboard');
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, user, testId, userAnswers, testData, tabSwitches, alerts, navigate, startTime, getCandidateName, sortedQuestions]);

  // Handle password verification
  const verifyPassword = async () => {
    if (password === testData.password) {
      setShowPasswordPrompt(false);
      setPasswordError('');
      // Show instructions page after successful password verification
      setShowInstructions(true);

      // Log password verification
      try {
        await addDoc(collection(db, 'monitoring'), {
          candidateId: user.uid,
          testId,
          type: 'password_verified',
          timestamp: serverTimestamp(),
          description: 'Password verified successfully',
          severity: 'info',
          metadata: {
            testTitle: testData.title,
            userAgent: navigator.userAgent,
            passwordProtected: true
          }
        });
      } catch (error) {
        Logger.error('Error logging password verification', null, error);
      }
    } else {
      setPasswordError('Incorrect password. Please try again.');

      // Log failed password attempt
      try {
        await addDoc(collection(db, 'monitoring'), {
          candidateId: user.uid,
          testId,
          type: 'password_failed',
          timestamp: serverTimestamp(),
          description: 'Failed password attempt',
          severity: 'medium',
          metadata: {
            attemptedPassword: password.slice(0, 3) + '***', // Log partial for security analysis
            userAgent: navigator.userAgent
          }
        });
      } catch (error) {
        Logger.error('Error logging password failure', null, error);
      }
    }
  };

  // Start the actual test after instructions
  const startTest = async () => {
    try {     // Check submission count and multiple submission settings
      const allowMultiple = testData.allowMultipleSubmissions || false;
      const existingSubmissionsQuery = query(
        collection(db, 'results'),
        where('candidateId', '==', user.uid),
        where('testId', '==', testId)
      );
      const existingSubmissions = await getDocs(existingSubmissionsQuery);
      const submissionCount = existingSubmissions.size;

      Logger.debug('StartTest submission check', {
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
        setShowInstructions(false);
        return;
      } else if (submissionCount >= 3 && allowMultiple) {
        // Multiple submissions allowed but limit reached
        setBlockMessage(`You have reached the maximum number of attempts (3) for this test. You have already submitted this test ${submissionCount} times. Please contact your branch head if you need additional attempts.`);
        setShowBlockedCard(true);
        setShowInstructions(false);
        return;
      }

      // All checks passed, start the test
      setShowInstructions(false);

      // Request fullscreen mode
      try {
        const elem = document.documentElement;
        if (elem.requestFullscreen) {
          await elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) { // Safari
          await elem.webkitRequestFullscreen();
        } else if (elem.msRequestFullscreen) { // IE11
          await elem.msRequestFullscreen();
        }
        Logger.info('Fullscreen mode activated');
      } catch (fullscreenError) {
        Logger.warn('Could not enter fullscreen mode', null, fullscreenError);
        // Continue with test even if fullscreen fails
        showInfo('Please maximize your window for the best test experience.');
      }

      // Start the timer
      const mins = parseDurationToMinutes(testData.duration);
      setSecondsLeft(mins * 60);
      setStartTime(new Date());

      // Log test session start
      try {
        await addDoc(collection(db, 'monitoring'), {
          candidateId: user.uid,
          testId,
          type: 'session_start',
          timestamp: serverTimestamp(),
          description: 'Test session started',
          severity: 'info',
          metadata: {
            testTitle: testData.title,
            duration: testData.duration,
            totalQuestions: sortedQuestions?.length || 0,
            userAgent: navigator.userAgent,
            startTime: new Date().toISOString(),
            passwordProtected: !!testData.password,
            attemptNumber: submissionCount + 1
          }
        });
        Logger.info('Test session started successfully');
      } catch (error) {
        Logger.error('Error logging session start', null, error);
      }
    } catch (error) {
      Logger.error('Error starting test', null, error);
      setErrMsg('Error starting test. Please try again.');
    }
  };

  // Fetch test data and show instructions
  useEffect(() => {
    async function fetchData() {
      if (!user) {
        navigate(`/login?redirect=${encodeURIComponent(`/test/${testId}`)}`);
        return;
      }

      // Check if user is approved (only for candidates)
      if (userDoc && userDoc.role === 'candidate' && userDoc.approved === false) {
        navigate('/waiting');
        return;
      }

      try {
        const test = await fetchTestWithQuestions(testId);

        if (!test) {
          setErrMsg('Test not found. Please check the test ID and try again.');
          setIsLoading(false);
          return;
        }

        Logger.debug('Test data loaded', {
          hasQuestions: !!test.questions,
          questionCount: test.questions?.length || 0
        });

        setTestData(test);

        // Check if password is required first
        if (test.password && test.password.trim() !== '') {
          setShowPasswordPrompt(true);
        } else {
          // No password required, show instructions directly
          setShowInstructions(true);
        }
      } catch (error) {

        Logger.error('Error fetching test data', null, error);

        // Provide more specific error messages
        let errorMessage = 'Error loading test. Please try again.';

        if (error.code === 'permission-denied') {
          errorMessage = 'You do not have permission to access this test.';
        } else if (error.code === 'unavailable') {
          errorMessage = 'Unable to connect to the server. Please check your internet connection.';
        } else if (error.message) {
          errorMessage = `Error: ${error.message}`;
        }

        setErrMsg(errorMessage);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [testId, user, userDoc, navigate]);

  // Timer logic
  useEffect(() => {
    if (secondsLeft <= 0 || !testData) { return; }

    const interval = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          // Auto-submit when time runs out
          if (!isSubmitting && !autoSubmitTriggered.current) {
            Logger.info('Time up! Auto-submitting test');
            autoSubmitTriggered.current = true;
            // Use setTimeout to avoid state update during render
            setTimeout(() => handleSubmit(true), 0);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [secondsLeft, testData, isSubmitting, handleSubmit]);

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

  // Fullscreen lock monitoring - prevents user from exiting fullscreen
  useEffect(() => {
    if (!testData || isSubmitting || secondsLeft <= 0) { return; }

    const handleFullscreenChange = async () => {
      // Check if user exited fullscreen
      const isFullscreen = document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.msFullscreenElement;

      if (!isFullscreen && secondsLeft > 0) {
        Logger.warn('User exited fullscreen mode');

        // Log the violation
        try {
          await addDoc(collection(db, 'monitoring'), {
            candidateId: user.uid,
            testId,
            type: 'fullscreen_exit',
            timestamp: serverTimestamp(),
            description: 'User exited fullscreen mode during test',
            severity: 'high',
            metadata: {
              currentQuestion: current + 1,
              timeRemaining: secondsLeft,
              userAgent: navigator.userAgent
            }
          });
        } catch (error) {
          Logger.error('Error logging fullscreen exit', null, error);
        }

        // Show alert
        setAlerts(prev => [...prev, {
          msg: 'Fullscreen exit detected! Returning to fullscreen...',
          time: new Date()
        }]);
        setShowAlert(true);

        // Force back to fullscreen after a short delay
        setTimeout(async () => {
          try {
            const elem = document.documentElement;
            if (elem.requestFullscreen) {
              await elem.requestFullscreen();
            } else if (elem.webkitRequestFullscreen) {
              await elem.webkitRequestFullscreen();
            } else if (elem.msRequestFullscreen) {
              await elem.msRequestFullscreen();
            }
            Logger.info('Forced return to fullscreen mode');
          } catch (error) {
            Logger.error('Could not return to fullscreen', null, error);
            // If can't return to fullscreen, count as violation
            setTabSwitches(prev => prev + 1);
          }
        }, 500);
      }
    };

    // Add fullscreen change listeners
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('msfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('msfullscreenchange', handleFullscreenChange);
    };
  }, [testData, isSubmitting, secondsLeft, user, testId, current]);


  useEffect(() => {
    if (!testData || isSubmitting) { return; }

    // Single handler for tab switching detection
    const handleTabSwitchEvent = async (eventType) => {
      Logger.debug('Tab switch event triggered', { eventType, userId: user?.uid, testId });

      if (!user || !testId) {
        Logger.warn('Tab switch: Missing user or testId');
        return;
      }

      try {
        // Log to monitoring collection
        await addDoc(collection(db, 'monitoring'), {
          candidateId: user.uid,
          testId,
          type: 'tab_switch',
          timestamp: serverTimestamp(),
          description: `User ${eventType === 'hidden' ? 'switched away from' : 'returned to'} test tab`,
          severity: 'high',
          metadata: {
            eventType,
            userAgent: navigator.userAgent,
            currentQuestion: current + 1
          }
        });

        Logger.debug('Tab switch logged successfully');

        // Update state and show warning
        setTabSwitches(prev => {
          const newCount = prev + 1;
          setAlerts(prevAlerts => [...prevAlerts, {
            msg: `Tab switch detected (${newCount} times). Stay on test page!`,
            time: new Date()
          }]);
          setShowAlert(true);

          // Auto-submit after 3 violations
          if (newCount >= 3) {
            Logger.warn('Auto-submitting due to tab switch violations');
            setTimeout(() => autoSubmit('excessive-tab-switching'), 1000);
          }

          return newCount;
        });

      } catch (error) {
        Logger.error('Error logging tab switch', null, error);
      }
    };

    // Visibility change handler (primary detection method)
    const visibilityChangeHandler = () => {
      if (document.hidden) {
        handleTabSwitchEvent('hidden');
      }
    };

    // Beforeunload handler to prevent closing/refreshing
    const beforeUnloadHandler = (e) => {
      e.preventDefault();
      e.returnValue = 'Are you sure you want to leave the test? Your progress may be lost.';
      return 'Are you sure you want to leave the test? Your progress may be lost.';
    };

    // Add event listeners
    document.addEventListener('visibilitychange', visibilityChangeHandler);
    window.addEventListener('beforeunload', beforeUnloadHandler);

    return () => {
      document.removeEventListener('visibilitychange', visibilityChangeHandler);
      window.removeEventListener('beforeunload', beforeUnloadHandler);
    };
  }, [testData, isSubmitting, user, testId, current, autoSubmit]);

  // Paste detection
  const handlePaste = useCallback(async (qid, text) => {
    if (!user || !testId || !qid) { return; }
    try {
      // Get the current question text for better monitoring display
      const currentQuestion = sortedQuestions?.find(q => q.id === qid);
      let questionText = 'Question text not available';

      if (currentQuestion) {
        questionText = currentQuestion.questionText || currentQuestion.question || currentQuestion.text || 'Question text not available';
        Logger.debug('Found question for paste event', { questionId: qid });
      } else {
        Logger.warn('Question not found for paste event', { questionId: qid, availableQuestions: sortedQuestions?.map(q => q.id) });
        // Try to get question text from current question if qid doesn't match
        const currentQ = sortedQuestions?.[current];
        if (currentQ) {
          questionText = currentQ.questionText || currentQ.question || currentQ.text || 'Question text not available';
          Logger.debug('Using current question text instead');
        }
      }

      // Log to monitoring collection for admin dashboard
      await addDoc(collection(db, 'monitoring'), {
        candidateId: user.uid,
        testId,
        type: 'paste',
        timestamp: serverTimestamp(),
        description: `Content pasted in question ${qid}`,
        severity: 'high',
        questionId: qid,
        questionText: questionText, // Store the actual question text
        content: text.slice(0, 200), // Store more content for analysis
        metadata: {
          contentLength: text.length,
          questionId: qid,
          userAgent: navigator.userAgent
        }
      });

      // Keep legacy logging for backward compatibility
      await addDoc(collection(db, 'pasteLogs'), {
        candidateId: user.uid,
        testId,
        questionId: qid,
        pasted: text.slice(0, 100),
        timestamp: serverTimestamp()
      });

      setAlerts(prev => [...prev, { msg: `Paste detected in question ${qid}.`, time: new Date() }]);
      setShowAlert(true);
    } catch (error) {
      Logger.error('Error logging paste event', null, error);
    }
  }, [user, testId, sortedQuestions, current]);

  // Enhanced monitoring for suspicious activities
  const logMonitoringEvent = useCallback(async (type, description, severity = 'low', additionalData = {}) => {
    Logger.debug('Attempting to log monitoring event', { type, description, severity, userId: user?.uid, testId });

    if (!user || !testId) {
      Logger.warn('Monitoring: Missing user or testId', { userId: user?.uid, testId });
      return;
    }

    try {
      // Get current question text if available
      const currentQuestion = sortedQuestions?.[current];
      let questionText = null;

      if (currentQuestion) {
        questionText = currentQuestion.questionText || currentQuestion.question || currentQuestion.text;
        Logger.debug('Found question text for monitoring event', { hasText: !!questionText });
      } else {
        Logger.debug('No current question found for monitoring event');
      }

      const eventData = {
        candidateId: user.uid,
        testId,
        type,
        timestamp: serverTimestamp(),
        description,
        severity,
        ...additionalData,
        // Include question text if available
        ...(questionText && { questionText }),
        metadata: {
          userAgent: navigator.userAgent,
          currentQuestion: current + 1,
          totalQuestions: sortedQuestions?.length || 0,
          timeRemaining: secondsLeft,
          ...additionalData.metadata
        }
      };

      Logger.debug('Monitoring event data prepared', { type, severity });

      const docRef = await addDoc(collection(db, 'monitoring'), eventData);
      Logger.debug('Monitoring event logged successfully', { eventId: docRef.id });

    } catch (error) {
      console.error(`❌ MONITORING: Error logging ${type} event:`, error);
      console.error('Error details:', {
        code: error.code,
        message: error.message,
        stack: error.stack
      });
    }
  }, [user, testId, current, sortedQuestions, secondsLeft]);

  // Copy detection
  const handleCopy = useCallback(async () => {
    Logger.debug('Copy event triggered');
    if (!user || !testId) {
      Logger.warn('Copy event: Missing user or testId', { userId: user?.uid, testId });
      return;
    }
    try {
      const selection = window.getSelection().toString();
      Logger.debug('Copy event: Text selected', { textLength: selection.length });
      if (selection.length > 0) {
        Logger.debug('Logging copy event');
        await logMonitoringEvent(
          'copy',
          `User copied text: "${selection.slice(0, 50)}${selection.length > 50 ? '...' : ''}"`,
          'medium',
          {
            content: selection.slice(0, 200),
            questionId: currentQuestion?.id,
            metadata: {
              selectionLength: selection.length,
              questionType: currentQuestion?.questionType
            }
          }
        );
        setAlerts(prev => [...prev, { msg: 'Copy action detected.', time: new Date() }]);
        setShowAlert(true);
        Logger.debug('Copy event logged successfully');
      } else {
        Logger.debug('Copy event: No text selected, skipping log');
      }
    } catch (error) {
      Logger.error('Error handling copy event', null, error);
    }
  }, [user, testId, currentQuestion, logMonitoringEvent]);
  // Add this near the top of the file with other utility functions
  const formatCodeBlocks = (text) => {
    if (!text) return 'No question text';

    // First, handle code blocks that are already formatted with ```
    let result = text.replace(/```(\w*)\s*([\s\S]*?)```/g, (match, lang, code) => {
      const escapedCode = code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
      return `<pre class="code-block"><code class="language-${lang || 'cpp'}">${escapedCode.trim()}</code></pre>`;
    });

    // Handle unformatted code blocks (detect by common code patterns)
    if (!result.includes('<pre')) {
      const codePatterns = [
        /#include\s*<[^>]+>/,
        /using\s+namespace\s+\w+\s*;/,
        /(function|class|def|int|void|string|var|let|const)\s+\w+\s*[({=]/
      ];

      const isLikelyCode = codePatterns.some(pattern => pattern.test(text));
      if (isLikelyCode) {
        const escapedCode = text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
        return `<pre class="code-block"><code>${escapedCode.trim()}</code></pre>`;
      }
    }

    // For any remaining text, escape HTML and handle newlines
    result = result
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/\n/g, '<br>')
      .replace(/ {2,}/g, match => '&nbsp;'.repeat(match.length));

    // Convert inline code
    result = result.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

    return result;
  };

  // Right-click detection
  const handleRightClick = useCallback(async (e) => {
    if (!user || !testId) { return; }
    e.preventDefault(); // Prevent context menu
    try {
      await logMonitoringEvent(
        'right_click',
        'User attempted to right-click',
        'low',
        {
          questionId: currentQuestion?.id,
          metadata: {
            x: e.clientX,
            y: e.clientY,
            target: e.target.tagName
          }
        }
      );
      setAlerts(prev => [...prev, { msg: 'Right-click detected.', time: new Date() }]);
      setShowAlert(true);
    } catch (error) {
      Logger.error('Error handling right-click', null, error);
    }
  }, [user, testId, currentQuestion, logMonitoringEvent]);

  // Keyboard shortcut detection
  const handleKeyboardShortcut = useCallback(async (e) => {
    if (!user || !testId) { return; }

    const suspiciousShortcuts = [
      { keys: ['Control', 'c'], name: 'Ctrl+C (Copy)' },
      { keys: ['Control', 'v'], name: 'Ctrl+V (Paste)' },
      { keys: ['Control', 'a'], name: 'Ctrl+A (Select All)' },
      { keys: ['Control', 'f'], name: 'Ctrl+F (Find)' },
      { keys: ['Control', 'h'], name: 'Ctrl+H (History)' },
      { keys: ['Control', 'j'], name: 'Ctrl+J (Downloads)' },
      { keys: ['Control', 'shift', 'i'], name: 'Ctrl+Shift+I (DevTools)' },
      { keys: ['F12'], name: 'F12 (DevTools)' },
      { keys: ['Control', 'u'], name: 'Ctrl+U (View Source)' },
      { keys: ['Control', 'shift', 'j'], name: 'Ctrl+Shift+J (Console)' },
      // Tab switching shortcuts
      { keys: ['Control', 'Tab'], name: 'Ctrl+Tab (Switch Tab)' },
      { keys: ['Control', 'shift', 'Tab'], name: 'Ctrl+Shift+Tab (Switch Tab)' },
      { keys: ['Control', 't'], name: 'Ctrl+T (New Tab)' },
      { keys: ['Control', 'w'], name: 'Ctrl+W (Close Tab)' },
      { keys: ['Control', 'n'], name: 'Ctrl+N (New Window)' },
      { keys: ['Alt', 'Tab'], name: 'Alt+Tab (Switch Window)' },
      { keys: ['Alt', 'F4'], name: 'Alt+F4 (Close Window)' },
      { keys: ['Control', 'r'], name: 'Ctrl+R (Refresh)' },
      { keys: ['F5'], name: 'F5 (Refresh)' },
      { keys: ['Control', 'shift', 'r'], name: 'Ctrl+Shift+R (Hard Refresh)' },
      // Fullscreen exit shortcuts - BLOCK THESE!
      { keys: ['Escape'], name: 'ESC (Exit Fullscreen)' },
      { keys: ['F11'], name: 'F11 (Toggle Fullscreen)' }
    ];

    const pressedKeys = [];
    if (e.ctrlKey) { pressedKeys.push('Control'); }
    if (e.shiftKey) { pressedKeys.push('Shift'); }
    if (e.altKey) { pressedKeys.push('Alt'); }
    if (e.key && !['Control', 'Shift', 'Alt'].includes(e.key)) {
      pressedKeys.push(e.key.toLowerCase());
    }

    const matchedShortcut = suspiciousShortcuts.find(shortcut => {
      return shortcut.keys.length === pressedKeys.length &&
        shortcut.keys.every(key => pressedKeys.includes(key.toLowerCase()));
    });

    if (matchedShortcut) {
      e.preventDefault();
      try {
        await logMonitoringEvent(
          'keyboard_shortcut',
          `Suspicious keyboard shortcut used: ${matchedShortcut.name}`,
          'high',
          {
            shortcut: matchedShortcut.name,
            keys: pressedKeys,
            questionId: currentQuestion?.id,
            metadata: {
              keyCode: e.keyCode,
              prevented: true
            }
          }
        );
        setAlerts(prev => [...prev, { msg: `Keyboard shortcut blocked: ${matchedShortcut.name}`, time: new Date() }]);
        setShowAlert(true);
      } catch (error) {
        Logger.error('Error logging keyboard shortcut', null, error);
      }
    }
  }, [user, testId, currentQuestion, logMonitoringEvent]);

  // Set up all monitoring event listeners
  useEffect(() => {
    console.log('🔍 EVENT LISTENERS: Setting up monitoring listeners', {
      hasTestData: !!testData,
      isSubmitting,
      user: user?.uid,
      testId,
      showInstructions
    });

    if (!testData || isSubmitting || showInstructions) {
      Logger.debug('Skipping event listener setup - conditions not met');
      return;
    }

    Logger.debug('Adding event listeners');

    // Add event listeners
    document.addEventListener('copy', handleCopy);
    document.addEventListener('contextmenu', handleRightClick);
    document.addEventListener('keydown', handleKeyboardShortcut);

    Logger.debug('All monitoring event listeners added');

    return () => {
      Logger.debug('Removing event listeners');
      // Remove event listeners
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('contextmenu', handleRightClick);
      document.removeEventListener('keydown', handleKeyboardShortcut);
      Logger.debug('All monitoring event listeners removed');
    };
  }, [testData, isSubmitting, showInstructions, handleCopy, handleRightClick, handleKeyboardShortcut, testId, user?.uid]);

  // Keyboard navigation (separate from monitoring)
  useEffect(() => {
    const navHandler = (e) => {
      if (isSubmitting || !sortedQuestions || showInstructions) { return; }

      // Only handle navigation keys when not in input fields
      const target = e.target;
      const isInputField = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true';

      if (isInputField) { return; }

      // Only handle navigation keys, let monitoring handle suspicious shortcuts
      if (e.key === 'ArrowRight' && current < sortedQuestions.length - 1 && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        setCurrent(c => c + 1);
      } else if (e.key === 'ArrowLeft' && current > 0 && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        setCurrent(c => c - 1);
      }
    };

    window.addEventListener('keydown', navHandler);
    return () => window.removeEventListener('keydown', navHandler);
  }, [current, sortedQuestions, isSubmitting, showInstructions]);

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
            Enter In Test 🚀
          </button>
        </div>
      </div>
    );
  }

  // Instructions page modal
  if (showInstructions) {
    return (
      <div className="instructions-overlay">
        <div className="instructions-container">
          <div className="instructions-header">
            <h1>{testData.title}</h1>
            <div className="test-info" />
          </div>

          <div className="instructions-content">
            <div className="instruction-card">
              <div className="card-header">
                <h3>📝 Test Details</h3>
              </div>
              <div className="card-body">
                <div className="test-details">
                  <div className="detail-item">
                    <span className="detail-label">Duration:</span>
                    <span className="detail-value">{testData.duration}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Total Questions:</span>
                    <span className="detail-value">{sortedQuestions?.length || 0}</span>
                  </div>
                  <div className="detail-item total-marks-item">
                    <span className="detail-label">📝 Total Marks:</span>
                    <span className="detail-value total-marks-value">
                      {sortedQuestions?.reduce((sum, q) => sum + (q.marks || 1), 0) || 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="instruction-card rules-card">
              <div className="card-header">
                <h3>⚠️ Important Rules</h3>
              </div>
              <div className="card-body">
                <ul className="rules-list">
                  <li>🖥️ <strong>Fullscreen Mode:</strong> Test will automatically enter fullscreen mode and remain locked</li>
                  <li>🚫 <strong>Do not switch tabs,</strong> after tab switch test will be auto-submitted</li>
                  <li>🚫 <strong>Do not copy/paste</strong> All copy-paste activities are logged</li>
                  <li>🚫 <strong>Do not right-click</strong> or use keyboard shortcuts</li>
                  <li>🚫 <strong>Do not exit fullscreen</strong> (ESC/F11 keys are blocked during test)</li>

                </ul>
              </div>
            </div>

            <div className="instruction-card tips-card">
              <div className="card-header">
                <h3>💡 Tips for Success</h3>
              </div>
              <div className="card-body">
                <ul className="tips-list">
                  <li>✅ Read each question carefully before answering</li>
                  <li>✅ Manage your time wisely across all questions</li>
                  <li>✅ Use the question navigation to review your answers</li>
                  <li>✅ Ensure stable internet connection throughout the test</li>
                  <li>✅ Submit your test before the timer expires</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="instructions-footer">
            <div className="footer-warning">
              <span className="warning-icon">⚠️</span>
              <p>By clicking "Start Test", you agree to follow all test rules and understand that violations will be monitored and may result in test termination.</p>
            </div>
            <button
              onClick={startTest}
              className="start-test-btn"
            >
              🚀 Start Test
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <Loading message="Loading test" subtext="Preparing your test environment" />;
  }
  if (errMsg) { return <div className="test-container"><div className="test-card">Error: {errMsg}</div></div>; }
  if (!testData) { return <div className="test-container"><div className="test-card">Test not found</div></div>; }
  if (!user) { return <div className="test-container"><div className="test-card">Please log in</div></div>; }

  return (
    <div className="test-runner" ref={testContainerRef}>
      <div className="test-container">
        <div className="test-header sticky">
          <button
            className="btn btn-outline"
            onClick={() => current > 0 && setCurrent(current - 1)}
            disabled={current === 0}
          >← Previous</button>
          <div className="text-lg font-medium text-primary">
            Question {current + 1} of {sortedQuestions.length}
          </div>
          <div className={`timer ${secondsLeft < 300 ? 'danger' : secondsLeft < 600 ? 'warning' : ''}`}>
            Time: {formatTime(secondsLeft)}
          </div>

          {process.env.NODE_ENV === 'development' && (
            <>


            </>
          )}
          <button
            className="btn btn-primary"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              Logger.debug('Submit button clicked');
              handleSubmit();
            }}
            disabled={isSubmitting}
            style={{
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              opacity: isSubmitting ? 0.6 : 1,
              pointerEvents: 'auto'
            }}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Test'}
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
            style={{ width: `${Math.round(((current + 1) / (sortedQuestions.length || 1)) * 100)}%` }}
          />
        </div>

        <div className="test-content">
          {currentQuestion ? (
            <div className="card">
              <div className="card-body">
                <div className="question-content">
                  <div
                    className="text-xl font-semibold mb-6 text-primary"
                    dangerouslySetInnerHTML={{
                      __html: formatCodeBlocks(
                        currentQuestion.questionText ||
                        currentQuestion.question ||
                        currentQuestion.text ||
                        'No question text'
                      )
                    }}
                  />
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
                    <div className="code-question-header">
                      <label className="block text-sm font-medium text-secondary mb-2">Your Code</label>
                      <div className="language-selector-container">
                        <label className="language-selector-label">Language:</label>
                        <select
                          className="language-selector"
                          value={selectedLanguage}
                          onChange={(e) => {
                            const newLang = e.target.value;
                            setSelectedLanguage(newLang);
                            // Update answer with new template if current answer is empty or default
                            const currentAnswer = userAnswers[currentQuestion.id] || '';
                            if (!currentAnswer.trim() || currentAnswer === getCodePlaceholder(selectedLanguage)) {
                              setUserAnswers(ans => ({
                                ...ans,
                                [currentQuestion.id]: getCodePlaceholder(newLang)
                              }));
                            }
                          }}
                        >
                          {availableLanguages.map(lang => {
                            const langInfo = getLanguageInfo(lang);
                            return (
                              <option key={lang} value={lang}>
                                {langInfo.icon} {langInfo.name}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    </div>
                    <div className="code-editor-container">
                      <div className="code-editor-header">
                        <div className="code-editor-tabs">
                          <span className="code-tab active">
                            <span className="code-icon">{getLanguageInfo(selectedLanguage).icon}</span>
                            solution.{getFileExtension(selectedLanguage)}
                          </span>
                        </div>
                        <div className="code-editor-actions">
                          <span
                            className="language-badge"
                            style={{
                              backgroundColor: `${getLanguageInfo(selectedLanguage).color}20`,
                              color: getLanguageInfo(selectedLanguage).color,
                              borderColor: `${getLanguageInfo(selectedLanguage).color}40`
                            }}
                          >
                            {getLanguageInfo(selectedLanguage).name.toUpperCase()}
                          </span>
                        </div>
                      </div>
                      <div className="code-editor-wrapper">
                        <div className="line-numbers">
                          {Array.from({ length: Math.max(12, (userAnswers[currentQuestion.id] || getCodePlaceholder(selectedLanguage)).split('\n').length) }, (_, i) => (
                            <div key={i + 1} className="line-number">{i + 1}</div>
                          ))}
                        </div>
                        <textarea
                          className="code-textarea"
                          placeholder={getCodePlaceholder(selectedLanguage)}
                          rows={12}
                          value={userAnswers[currentQuestion.id] || getCodePlaceholder(selectedLanguage)}
                          onChange={e => {
                            setUserAnswers(ans => ({ ...ans, [currentQuestion.id]: e.target.value }));
                          }}
                          onPaste={e => handlePaste(currentQuestion.id, e.clipboardData.getData('text'))}
                          onScroll={e => {
                            // Sync scroll with line numbers
                            const lineNumbers = e.target.parentElement.querySelector('.line-numbers');
                            if (lineNumbers) {
                              lineNumbers.scrollTop = e.target.scrollTop;
                            }
                          }}
                          onFocus={e => {
                            // If textarea has placeholder content, select it on first focus
                            const currentValue = userAnswers[currentQuestion.id] || getCodePlaceholder(selectedLanguage);
                            if (currentValue === getCodePlaceholder(selectedLanguage)) {
                              e.target.select();
                            }
                          }}
                          spellCheck={false}
                        />
                      </div>
                      <div className="code-editor-footer">
                        <div className="code-stats">
                          Lines: {(userAnswers[currentQuestion.id] || '').split('\n').length} |
                          Characters: {(userAnswers[currentQuestion.id] || '').length}
                        </div>
                      </div>
                    </div>
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
            {sortedQuestions.map((q, i) => (
              <button
                key={i}
                className={`question-nav-btn ${i === current ? 'active' : ''} ${userAnswers[q.id] ? 'answered' : ''}`}
                onClick={() => !isSubmitting && setCurrent(i)}
                disabled={isSubmitting}
                title={`Question ${i + 1} (${q.marks || 1} marks)${userAnswers[q.id] ? ' - Answered' : ''}`}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              className="btn btn-outline"
              onClick={() => current < sortedQuestions.length - 1 && setCurrent(current + 1)}
              disabled={current >= sortedQuestions.length - 1 || isSubmitting}
            >
              {current >= sortedQuestions.length - 1 ? 'Last Question' : 'Next →'}
            </button>

          </div>
        </div>

        {/* Mobile Navigation Bar */}
        <div className="mobile-nav-bar">
          <div className="mobile-nav-top">
            <div className="mobile-nav-info">
              <div className="mobile-question-number">
                Question {current + 1} of {sortedQuestions.length}
              </div>
              <div className={`mobile-timer ${secondsLeft < 300 ? 'danger' : secondsLeft < 600 ? 'warning' : ''}`}>
                ⏱️ {formatTime(secondsLeft)}
              </div>
            </div>
          </div>
          <div className="mobile-nav-actions">
            <button
              className="mobile-nav-btn prev"
              onClick={() => current > 0 && setCurrent(current - 1)}
              disabled={current === 0 || isSubmitting}
            >
              ← Prev
            </button>
            {current < sortedQuestions.length - 1 ? (
              <button
                className="mobile-nav-btn next"
                onClick={() => setCurrent(current + 1)}
                disabled={isSubmitting}
              >
                Next →
              </button>
            ) : (
              <button
                className="mobile-nav-btn submit"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSubmit();
                }}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Submitting...' : '✓ Submit Test'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default TestRunner;
