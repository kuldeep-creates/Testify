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

// Helper function to get file extension based on language
const getFileExtension = (language) => {
  const extensions = {
    'javascript': 'js',
    'python': 'py',
    'java': 'java',
    'cpp': 'cpp',
    'c': 'c',
    'csharp': 'cs',
    'php': 'php',
    'ruby': 'rb',
    'go': 'go',
    'rust': 'rs',
    'typescript': 'ts',
    'html': 'html',
    'css': 'css',
    'sql': 'sql',
    'bash': 'sh',
    'powershell': 'ps1'
  };
  return extensions[language.toLowerCase()] || 'txt';
};

// Helper function to get code placeholder based on language
const getCodePlaceholder = (language) => {
  const placeholders = {
    'javascript': '// Write your JavaScript code here\nfunction solution() {\n    // Your code here\n    return result;\n}',
    'python': '# Write your Python code here\ndef solution():\n    # Your code here\n    return result',
    'java': '// Write your Java code here\npublic class Solution {\n    public static void main(String[] args) {\n        // Your code here\n    }\n}',
    'cpp': '// Write your C++ code here\n#include <iostream>\nusing namespace std;\n\nint main() {\n    // Your code here\n    return 0;\n}',
    'c': '// Write your C code here\n#include <stdio.h>\n\nint main() {\n    // Your code here\n    return 0;\n}',
    'csharp': '// Write your C# code here\nusing System;\n\nclass Program {\n    static void Main() {\n        // Your code here\n    }\n}',
    'php': '<?php\n// Write your PHP code here\nfunction solution() {\n    // Your code here\n    return $result;\n}\n?>',
    'ruby': '# Write your Ruby code here\ndef solution\n    # Your code here\n    return result\nend',
    'go': '// Write your Go code here\npackage main\n\nimport "fmt"\n\nfunc main() {\n    // Your code here\n}',
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
    'c': { name: 'C', color: '#a8b9cc', icon: '🔧' },
    'csharp': { name: 'C#', color: '#239120', icon: '🔷' },
    'php': { name: 'PHP', color: '#777bb4', icon: '🐘' },
    'ruby': { name: 'Ruby', color: '#cc342d', icon: '💎' },
    'go': { name: 'Go', color: '#00add8', icon: '🐹' },
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
  'csharp',
  'php',
  'ruby',
  'go',
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('javascript');
  
  // Ref to track if auto-submit has been triggered to prevent multiple submissions
  const autoSubmitTriggered = useRef(false);

  // Removed automatic basic monitoring test to prevent unwanted monitoring events

  // Sort questions by marks in ascending order (lowest marks first)
  const sortedQuestions = useMemo(() => {
    if (!testData?.questions) return [];
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
      const questions = sortedQuestions || [];
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
        totalQuestions: sortedQuestions?.length || 0,
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
        // First submission
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
    if (isSubmitting || autoSubmitTriggered.current || !user?.uid || !testId) return;
    
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
      
      // Silently navigate back to dashboard after auto-submit
      navigate('/dashboard');
    } catch (error) {
      console.error('Auto-submit error:', error);
      // Still navigate to dashboard even if logging fails
      navigate('/dashboard');
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, user, testId, userAnswers, testData, tabSwitches, alerts, navigate, startTime, getCandidateName]);

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
        console.error('Error logging password verification:', error);
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
        console.error('Error logging password failure:', error);
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
      
      console.log('StartTest submission check:', {
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
        console.log('✅ Test session started successfully');
      } catch (error) {
        console.error('Error logging session start:', error);
      }
    } catch (error) {
      console.error('Error starting test:', error);
      setErrMsg('Error starting test. Please try again.');
    }
  };

  // Fetch test data and show instructions
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
            questionText: q.questionText?.substring(0, 30) + '...',
            question: q.question?.substring(0, 30) + '...',
            text: q.text?.substring(0, 30) + '...'
          })));
        }
        
        // Set test data
        setTestData(test);
        
        // Check if password is required first
        if (test.password && test.password.trim() !== '') {
          setShowPasswordPrompt(true);
        } else {
          // No password required, show instructions directly
          setShowInstructions(true);
        }
      } catch (error) {
        console.error('Error fetching test data:', error);
        setErrMsg('Error loading test. Please try again.');
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [testId, user, navigate]);

  // Timer logic
  useEffect(() => {
    if (secondsLeft <= 0 || !testData) return;
    
    const interval = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          // Auto-submit when time runs out
          if (!isSubmitting && !autoSubmitTriggered.current) {
            console.log('Time up! Auto-submitting test...');
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


  useEffect(() => {
    if (!testData || isSubmitting) return;
    
    // Single handler for tab switching detection
    const handleTabSwitchEvent = async (eventType) => {
      console.log('🔍 TAB SWITCH: Event triggered', { eventType, user: user?.uid, testId });
      
      if (!user || !testId) {
        console.warn('🔍 TAB SWITCH: Missing user or testId');
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
        
        console.log('✅ TAB SWITCH: Logged successfully');
        
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
            console.log('🚫 TAB SWITCH: Auto-submitting due to violations');
            setTimeout(() => autoSubmit('excessive-tab-switching'), 1000);
          }
          
          return newCount;
        });
        
      } catch (error) {
        console.error('❌ TAB SWITCH: Error logging:', error);
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
    if (!user || !testId || !qid) return;
    try {
      // Get the current question text for better monitoring display
      const currentQuestion = sortedQuestions?.find(q => q.id === qid);
      let questionText = 'Question text not available';
      
      if (currentQuestion) {
        questionText = currentQuestion.questionText || currentQuestion.question || currentQuestion.text || 'Question text not available';
        console.log('🔍 Found question for paste event:', { id: qid, text: questionText.substring(0, 50) + '...' });
      } else {
        console.log('🔍 Question not found for paste event:', qid, 'Available questions:', sortedQuestions?.map(q => q.id));
        // Try to get question text from current question if qid doesn't match
        const currentQ = sortedQuestions?.[current];
        if (currentQ) {
          questionText = currentQ.questionText || currentQ.question || currentQ.text || 'Question text not available';
          console.log('🔍 Using current question text instead:', questionText.substring(0, 50) + '...');
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
      console.error('Error logging paste event:', error);
    }
  }, [user, testId, sortedQuestions, current]);

  // Enhanced monitoring for suspicious activities
  const logMonitoringEvent = useCallback(async (type, description, severity = 'low', additionalData = {}) => {
    console.log('🔍 MONITORING: Attempting to log event', { type, description, severity, user: user?.uid, testId });
    
    if (!user || !testId) {
      console.warn('🔍 MONITORING: Missing user or testId', { user: user?.uid, testId });
      return;
    }
    
    try {
      // Get current question text if available
      const currentQuestion = sortedQuestions?.[current];
      let questionText = null;
      
      if (currentQuestion) {
        questionText = currentQuestion.questionText || currentQuestion.question || currentQuestion.text;
        console.log('🔍 Found question text for monitoring event:', questionText ? questionText.substring(0, 50) + '...' : 'No text found');
      } else {
        console.log('🔍 No current question found for monitoring event');
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
      
      console.log('🔍 MONITORING: Event data to be logged:', eventData);
      
      const docRef = await addDoc(collection(db, 'monitoring'), eventData);
      console.log('✅ MONITORING: Successfully logged event with ID:', docRef.id);
      
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
    console.log('🔍 COPY: Copy event triggered');
    if (!user || !testId) {
      console.warn('🔍 COPY: Missing user or testId', { user: user?.uid, testId });
      return;
    }
    try {
      const selection = window.getSelection().toString();
      console.log('🔍 COPY: Selected text:', selection.slice(0, 100));
      if (selection.length > 0) {
        console.log('🔍 COPY: Logging copy event...');
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
        console.log('✅ COPY: Copy event logged successfully');
      } else {
        console.log('🔍 COPY: No text selected, skipping log');
      }
    } catch (error) {
      console.error('❌ COPY: Error handling copy event:', error);
    }
  }, [user, testId, currentQuestion, logMonitoringEvent]);

  // Right-click detection
  const handleRightClick = useCallback(async (e) => {
    if (!user || !testId) return;
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
      console.error('Error handling right-click:', error);
    }
  }, [user, testId, currentQuestion, logMonitoringEvent]);

  // Keyboard shortcut detection
  const handleKeyboardShortcut = useCallback(async (e) => {
    if (!user || !testId) return;
    
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
      { keys: ['Control', 'shift', 'r'], name: 'Ctrl+Shift+R (Hard Refresh)' }
    ];

    const pressedKeys = [];
    if (e.ctrlKey) pressedKeys.push('Control');
    if (e.shiftKey) pressedKeys.push('Shift');
    if (e.altKey) pressedKeys.push('Alt');
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
        console.error('Error logging keyboard shortcut:', error);
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
      console.log('🔍 EVENT LISTENERS: Skipping setup - no test data, submitting, or showing instructions');
      return;
    }

    console.log('🔍 EVENT LISTENERS: Adding event listeners...');
    
    // Add event listeners
    document.addEventListener('copy', handleCopy);
    document.addEventListener('contextmenu', handleRightClick);
    document.addEventListener('keydown', handleKeyboardShortcut);

    console.log('✅ EVENT LISTENERS: All monitoring event listeners added');

    return () => {
      console.log('🔍 EVENT LISTENERS: Removing event listeners...');
      // Remove event listeners
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('contextmenu', handleRightClick);
      document.removeEventListener('keydown', handleKeyboardShortcut);
      console.log('✅ EVENT LISTENERS: All monitoring event listeners removed');
    };
  }, [testData, isSubmitting, showInstructions, handleCopy, handleRightClick, handleKeyboardShortcut]);

  // Keyboard navigation (separate from monitoring)
  useEffect(() => {
    const navHandler = (e) => {
      if (isSubmitting || !sortedQuestions || showInstructions) return;
      
      // Only handle navigation keys when not in input fields
      const target = e.target;
      const isInputField = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true';
      
      if (isInputField) return;
      
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
            Enter Test
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
            <div className="test-info">
            </div>
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
                  <div className="detail-item">
                    <span className="detail-label">Total Marks:</span>
                    <span className="detail-value">
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
                  <li>🚫 <strong>Do not switch tabs,</strong> after tab switch test will be auto-submitted</li>
                  <li>🚫 <strong>Do not copy/paste</strong> All copy-paste activities are logged</li>
                  <li>🚫 <strong>Do not right-click</strong> or use keyboard shortcuts</li>
                  <li>⏰ <strong>Submit before time runs out</strong> - test will auto-submit when time expires</li>
                  <li>💾 <strong>Your answers are saved automatically</strong> as you type</li>
                  <li>🔄 <strong>You can navigate between questions</strong> using the question numbers</li>
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
            Question {current + 1} of {sortedQuestions.length}
          </div>
          <div className={`timer ${secondsLeft < 300 ? 'danger' : secondsLeft < 600 ? 'warning' : ''}`}>
            Time: {formatTime(secondsLeft)}
          </div>
          <div className={`connection-status ${netStatus}`}>
            {netStatus === 'online' ? '🟢 Online' : netStatus === 'offline' ? '🔴 Offline' : '🟡 Checking...'}
          </div>
{process.env.NODE_ENV === 'development' && (
            <>
              <button
                className="btn btn-outline"
                onClick={async () => {
                  console.log('🔍 MANUAL TEST: Creating manual monitoring event...');
                  try {
                    await logMonitoringEvent(
                      'manual_test',
                      'Manual test event triggered by user',
                      'low',
                      { manualTest: true }
                    );
                    alert('Test monitoring event created! Check admin dashboard.');
                  } catch (error) {
                    console.error('❌ MANUAL TEST: Error:', error);
                    alert('Error creating test event: ' + error.message);
                  }
                }}
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
              >
                Test Monitor
              </button>
              <button
                className="btn btn-secondary"
                onClick={async () => {
                  console.log('🔍 DIRECT TEST: Testing Firestore write...');
                  try {
                    const result = await addDoc(collection(db, 'monitoring'), {
                      candidateId: user?.uid || 'test-user',
                      testId: testId || 'test-id',
                      type: 'direct_test',
                      timestamp: new Date(),
                      description: 'Direct Firestore test',
                      severity: 'info',
                      test: true
                    });
                    console.log('✅ DIRECT TEST: Success!', result.id);
                    alert('✅ Monitoring event created successfully! ID: ' + result.id);
                  } catch (error) {
                    console.error('❌ DIRECT TEST: Failed:', error);
                    alert('❌ Error: ' + error.message);
                  }
                }}
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', marginLeft: '0.5rem' }}
              >
                Test DB
              </button>
            </>
          )}
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
        
        {/* Security Notice */}
        <div className="security-notice" style={{
          background: '#fef3c7',
          border: '1px solid #f59e0b',
          borderRadius: '0.5rem',
          padding: '0.75rem 1rem',
          margin: '1rem 0',
          fontSize: '0.875rem',
          color: '#92400e'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>🔒</span>
              <strong>Security Notice:</strong> Tab switching, keyboard shortcuts, and right-clicking are monitored and restricted during this test. Please stay on this page to avoid violations.
            </div>
            <div style={{ fontSize: '0.75rem', color: '#78350f' }}>
              Tab Switches: {tabSwitches}
            </div>
          </div>
        </div>
        
        <div className="test-content">
          {currentQuestion ? (
            <div className="card">
              <div className="card-body">
                <div className="question-content">
                  <div className="text-xl font-semibold mb-6 text-primary">
                    {currentQuestion.questionText || currentQuestion.question || currentQuestion.text || 'No question text'}
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
