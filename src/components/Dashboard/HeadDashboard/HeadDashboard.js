import { signOut } from 'firebase/auth';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useFirebase } from '../../../context/FirebaseContext';
import { auth, db } from '../../../firebase';
import { fetchTestWithQuestions } from '../../../services/firestore';
import { formatDateTime } from '../../../utils/dateUtils';
import { exportSubmissionsToExcel } from '../../../utils/excelExport';
import { exportSubmissionsToPDF } from '../../../utils/pdfExport';
import Icon from '../../icons/Icon';
import Leaderboard from '../../Leaderboard/Leaderboard';
import Loading from '../../Loading/Loading';
import './HeadDashboard.css';

// Helper function to format duration
const formatDuration = (hours, minutes) => {
  if (hours === 0) {
    return `${minutes} min`;
  } else if (minutes === 0) {
    return `${hours}h`;
  } else {
    return `${hours}h ${minutes}min`;
  }
};

// Helper function to parse duration string into hours and minutes
const parseDuration = (durationString) => {
  if (!durationString) { return { hours: 0, minutes: 30 }; }

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

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return { hours, minutes };
};

// Head Create Test Component
function HeadCreateTest() {
  const [step, setStep] = useState(1);
  const [testData, setTestData] = useState({
    title: '',
    description: '',
    durationHours: 0,
    durationMinutes: 30,
    branch: 'DSA',
    password: '',
    totalMarks: 0,
    allowMultipleSubmissions: false
  });
  const [questions, setQuestions] = useState([]);
  const [qIndex, setQIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const { userDoc } = useFirebase();

  // Set branch based on head's assigned domain
  useEffect(() => {
    if (userDoc?.domain) {
      setTestData(prev => ({ ...prev, branch: userDoc.domain }));
    }
  }, [userDoc?.domain]);

  const addQuestion = () => {
    const newList = [...questions, {
      id: Date.now(),
      questionText: '',
      questionType: 'mcq',
      options: ['', '', '', ''],
      correctAnswer: '',
      marks: 1,
      imageUrl: ''
    }];
    setQuestions(newList);
    setQIndex(newList.length - 1);
  };

  const updateQuestion = (id, field, value) => {
    setQuestions(questions.map(q =>
      q.id === id ? { ...q, [field]: value } : q
    ));
  };

  const removeQuestion = (id) => {
    const idx = questions.findIndex(q => q.id === id);
    const filtered = questions.filter(q => q.id !== id);
    setQuestions(filtered);
    if (filtered.length === 0) {
      setQIndex(0);
    } else if (idx >= filtered.length) {
      setQIndex(filtered.length - 1);
    }
  };

  const goPrev = () => setQIndex((i) => Math.max(0, i - 1));
  const goNext = () => setQIndex((i) => Math.min(questions.length - 1, i + 1));

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      console.log('[Head:createTest] Starting test creation...');
      console.log('Questions with images:', questions.map(q => ({
        id: q.id,
        questionText: q.questionText.substring(0, 50) + '...',
        imageUrl: q.imageUrl
      })));

      // Validate test data
      if (!testData.title || testData.title.trim() === '') {
        setError('Test title is required');
        return;
      }
      if (!testData.branch || testData.branch.trim() === '') {
        setError('Test branch is required');
        return;
      }
      if (questions.length === 0) {
        setError('At least one question is required');
        return;
      }

      const testRef = doc(collection(db, 'tests'));
      const testId = testRef.id;

      const testDoc = {
        testId,
        title: testData.title.trim(),
        description: testData.description?.trim() || 'No description',
        duration: formatDuration(testData.durationHours, testData.durationMinutes),
        domain: testData.branch.trim(), // Use domain field
        password: testData.password?.trim() || 'test123',
        totalMarks: questions.reduce((sum, q) => sum + (q.marks || 1), 0),
        allowMultipleSubmissions: testData.allowMultipleSubmissions || false,
        status: 'active',
        createdBy: auth.currentUser?.uid || 'unknown',
        createdAt: serverTimestamp(),
        scheduledFor: serverTimestamp()
      };

      await setDoc(testRef, testDoc);
      console.log('[Head:createTest] Test document saved successfully with ID:', testId);

      // Add questions as subcollection
      for (const question of questions) {
        const questionDoc = {
          questionId: question.id.toString(),
          questionText: question.questionText || 'No question text',
          questionType: question.questionType || 'mcq',
          options: question.questionType === 'mcq' ? (question.options || ['', '', '', '']) : [],
          correctAnswer: question.correctAnswer || '',
          marks: question.marks || 1,
          imageUrl: question.imageUrl || ''
        };

        console.log('Saving question with imageUrl:', questionDoc.imageUrl);
        await addDoc(collection(db, 'tests', testId, 'questions'), questionDoc);
      }

      setSuccess('Test created successfully!');
      setStep(1);
      setTestData({ title: '', description: '', durationHours: 0, durationMinutes: 30, branch: 'Full Stack', password: '', totalMarks: 0, allowMultipleSubmissions: false });
      setQuestions([]);
    } catch (e) {
      console.log('[Head:createTest:error]', e.code, e.message);
      setError(e.message || 'Failed to create test');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="head-create-test">
      <div className="create-test-header">
        <div>
          <h3>Create New Test</h3>
          <p>Design and configure your test questions</p>
        </div>
        <div className="branch-badge">
          <span>Domain:</span>
          <span className="badge badge-primary">{userDoc?.domain || 'Full Stack'}</span>
        </div>
      </div>

      <div className="create-test-content">
        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        {step === 1 && (
          <div className="test-details-form">
            <div className="form-group">
              <label>Test Title *</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g., JavaScript Fundamentals Assessment"
                value={testData.title}
                onChange={(e) => setTestData({ ...testData, title: e.target.value })}
              />
              <div className="form-help">Choose a clear, descriptive title for your test</div>
            </div>

            <div className="form-group">
              <label>Description</label>
              <textarea
                className="form-input"
                placeholder="Describe what this test covers and any special instructions for candidates..."
                rows={4}
                value={testData.description}
                onChange={(e) => setTestData({ ...testData, description: e.target.value })}
              />
              <div className="form-help">Optional: Provide context and instructions for candidates</div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Test Duration</label>
                <div className="duration-inputs" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <input
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      min="0"
                      max="12"
                      className="form-input"
                      value={testData.durationHours}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^0-9]/g, ''); // Only allow numbers
                        const numValue = parseInt(value) || 0;
                        if (numValue <= 12) {
                          setTestData({ ...testData, durationHours: numValue });
                        }
                      }}
                      placeholder="0"
                    />
                    <small style={{ color: '#6b7280', fontSize: '12px', marginTop: '4px' }}>Hours</small>
                  </div>
                  <span style={{ color: '#6b7280', fontWeight: 'bold' }}>:</span>
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <input
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      min="0"
                      max="59"
                      className="form-input"
                      value={testData.durationMinutes}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^0-9]/g, ''); // Only allow numbers
                        const numValue = parseInt(value) || 0;
                        if (numValue <= 59) {
                          setTestData({ ...testData, durationMinutes: numValue });
                        }
                      }}
                      placeholder="30"
                    />
                    <small style={{ color: '#6b7280', fontSize: '12px', marginTop: '4px' }}>Minutes</small>
                  </div>
                </div>
                <div className="form-help">
                  Set the time limit for completing the test. Total: {formatDuration(testData.durationHours, testData.durationMinutes)}
                </div>
              </div>

              <div className="form-group">
                <label>Domain</label>
                <input
                  type="text"
                  className="form-input readonly"
                  value={testData.branch}
                  readOnly
                  title="Domain is assigned by admin and cannot be changed"
                />
                <div className="form-help">Domain is assigned by admin and cannot be modified</div>
              </div>
            </div>

            <div className="form-group">
              <label>Test Password *</label>
              <input
                type="password"
                className="form-input"
                placeholder="Enter a secure password for test access"
                value={testData.password}
                onChange={(e) => setTestData({ ...testData, password: e.target.value })}
              />
              <div className="form-help">Candidates will need this password to access the test</div>
            </div>

            <div className="form-group">
              <label>Multiple Submissions</label>
              <div className="toggle-container" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <label className="toggle-switch" style={{ position: 'relative', display: 'inline-block', width: '50px', height: '24px' }}>
                  <input
                    type="checkbox"
                    checked={testData.allowMultipleSubmissions}
                    onChange={(e) => setTestData({ ...testData, allowMultipleSubmissions: e.target.checked })}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span
                    className="toggle-slider"
                    style={{
                      position: 'absolute',
                      cursor: 'pointer',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: testData.allowMultipleSubmissions ? '#4CAF50' : '#ccc',
                      transition: '0.4s',
                      borderRadius: '24px'
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        content: '',
                        height: '18px',
                        width: '18px',
                        left: testData.allowMultipleSubmissions ? '26px' : '3px',
                        bottom: '3px',
                        backgroundColor: 'white',
                        transition: '0.4s',
                        borderRadius: '50%'
                      }}
                    />
                  </span>
                </label>
                <span style={{ fontSize: '14px', color: testData.allowMultipleSubmissions ? '#4CAF50' : '#666' }}>
                  {testData.allowMultipleSubmissions ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div className="form-help">
                {testData.allowMultipleSubmissions
                  ? 'Candidates can submit multiple times. Only the latest submission will be considered for grading.'
                  : 'Candidates can submit only once. Choose this for final exams or assessments.'}
              </div>
            </div>

            <div className="form-actions">
              <button
                className="btn btn-primary"
                onClick={() => setStep(2)}
                disabled={!testData.title || !testData.password}
              >
                Next: Add Questions →
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="questions-form">
            <div className="questions-header">
              <div>
                <h4>Question {questions.length ? (qIndex + 1) : 0} of {questions.length}</h4>
                <p>Add and configure your test questions</p>
              </div>
              <div className="question-actions">
                <button className="btn btn-outline btn-sm" onClick={addQuestion}>
                  + Add Question
                </button>
                {questions.length > 0 && (
                  <button
                    className="btn btn-outline btn-sm btn-danger"
                    onClick={() => removeQuestion(questions[qIndex].id)}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            {questions.length === 0 ? (
              <div className="no-questions">
                <div>No questions added yet</div>
                <div>Click "Add Question" to start creating your test questions</div>
              </div>
            ) : (
              <div className="question-editor">
                <div className="form-group">
                  <label>Question Text *</label>
                  <textarea
                    className="form-input"
                    placeholder="Enter your question here..."
                    rows={4}
                    value={questions[qIndex].questionText}
                    onChange={(e) => updateQuestion(questions[qIndex].id, 'questionText', e.target.value)}
                  />
                  <div className="form-help">Write a clear and specific question</div>
                </div>

                <div className="form-group">
                  <label>Question Image (Optional)</label>
                  <div className="image-upload-section">
                    <input
                      type="url"
                      className="form-input"
                      placeholder="Enter image URL (e.g., https://example.com/image.jpg)"
                      value={questions[qIndex].imageUrl || ''}
                      onChange={(e) => updateQuestion(questions[qIndex].id, 'imageUrl', e.target.value)}
                    />
                    <div className="image-upload-help">
                      <span className="help-text">
                        💡 Add an image URL to provide visual illustration for your question
                      </span>
                    </div>
                    {questions[qIndex].imageUrl && (
                      <div className="image-preview">
                        <img
                          src={questions[qIndex].imageUrl}
                          alt="Question illustration"
                          onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.nextSibling.style.display = 'block';
                          }}
                          onLoad={(e) => {
                            e.target.style.display = 'block';
                            e.target.nextSibling.style.display = 'none';
                          }}
                        />
                        <div className="image-error" style={{ display: 'none' }}>
                          ❌ Failed to load image. Please check the URL.
                        </div>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm remove-image"
                          onClick={() => updateQuestion(questions[qIndex].id, 'imageUrl', '')}
                        >
                          Remove Image
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Question Type</label>
                    <select
                      className="form-input"
                      value={questions[qIndex].questionType}
                      onChange={(e) => updateQuestion(questions[qIndex].id, 'questionType', e.target.value)}
                    >
                      <option value="mcq">Multiple Choice (MCQ)</option>
                      <option value="long">Long Answer</option>
                      <option value="code">Code</option>
                    </select>
                    <div className="form-help">Choose the type of question</div>
                  </div>
                  <div className="form-group">
                    <label>Marks</label>
                    <input
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      className="form-input"
                      min="1"
                      max="100"
                      value={questions[qIndex].marks}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^0-9]/g, ''); // Only allow numbers
                        const numValue = parseInt(value) || 1;
                        if (numValue >= 1 && numValue <= 100) {
                          updateQuestion(questions[qIndex].id, 'marks', numValue);
                        }
                      }}
                    />
                    <div className="form-help">Points awarded for correct answer</div>
                  </div>
                </div>

                {questions[qIndex].questionType === 'mcq' && (
                  <div className="form-group">
                    <label>Answer Options</label>
                    <div className="mcq-options">
                      {questions[qIndex].options.map((option, optIndex) => (
                        <div key={optIndex} className="mcq-option">
                          <input
                            type="radio"
                            name={`correct-${questions[qIndex].id}`}
                            checked={questions[qIndex].correctAnswer === option}
                            onChange={() => updateQuestion(questions[qIndex].id, 'correctAnswer', option)}
                          />
                          <input
                            type="text"
                            className="form-input"
                            placeholder={`Option ${optIndex + 1}`}
                            value={option}
                            onChange={(e) => {
                              const newOptions = [...questions[qIndex].options];
                              newOptions[optIndex] = e.target.value;
                              updateQuestion(questions[qIndex].id, 'options', newOptions);
                            }}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="form-help">Select the correct answer by clicking the radio button</div>
                  </div>
                )}

                {(questions[qIndex].questionType === 'long' || questions[qIndex].questionType === 'code') && (
                  <div className="form-group">
                    <label>Expected Answer / Sample Solution</label>
                    <textarea
                      className="form-input"
                      placeholder={questions[qIndex].questionType === 'code' ? "Enter the expected code solution or key points..." : "Enter the expected answer or key points to look for..."}
                      rows={4}
                      value={questions[qIndex].correctAnswer}
                      onChange={(e) => updateQuestion(questions[qIndex].id, 'correctAnswer', e.target.value)}
                    />
                    <div className="form-help">
                      {questions[qIndex].questionType === 'code'
                        ? "Provide the expected code solution or key implementation details"
                        : "Provide the expected answer or key points for evaluation"
                      }
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="questions-footer">
              <button className="btn btn-outline" onClick={() => setStep(1)}>
                ← Back to Test Details
              </button>
              <div className="question-nav">
                <button
                  className="btn btn-outline btn-sm"
                  onClick={goPrev}
                  disabled={qIndex <= 0}
                >
                  ← Previous
                </button>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={goNext}
                  disabled={qIndex >= questions.length - 1}
                >
                  Next →
                </button>
                <button
                  className={`btn btn-primary btn-lg ${loading ? 'btn-loading' : ''}`}
                  onClick={handleSubmit}
                  disabled={questions.length === 0 || loading}
                >
                  {loading ? 'Creating Test...' : `Create Test (${questions.reduce((sum, q) => sum + q.marks, 0)} marks)`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Head Manage Tests Component
function HeadManageTests() {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingTest, setEditingTest] = useState(null);
  const [editStep, setEditStep] = useState(1);
  const [editTestData, setEditTestData] = useState({
    title: '',
    description: '',
    duration: '30 min',
    durationHours: 0,
    durationMinutes: 30,
    password: '',
    allowMultipleSubmissions: false
  });
  const [editQuestions, setEditQuestions] = useState([]);
  const [editQIndex, setEditQIndex] = useState(0);
  const [editLoading, setEditLoading] = useState(false);
  const [copiedTestId, setCopiedTestId] = useState(null);
  const { userDoc } = useFirebase();

  useEffect(() => {
    const loadTests = async () => {
      setLoading(true);
      setError('');
      try {
        const testsRef = collection(db, 'tests');
        const q = query(testsRef);  // Remove the where clause temporarily
        const snap = await getDocs(q);

        console.log('Total tests in database:', snap.size);
        snap.forEach(doc => {
          console.log('Test:', doc.id, doc.data());
        });

        const testsData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setTests(testsData);
      } catch (e) {
        console.error('[Head:loadTests:error]', e);
        setError('Failed to load tests: ' + e.message);
      } finally {
        setLoading(false);
      }
    };

    if (userDoc?.domain) {
      loadTests();
    }
  }, [userDoc?.domain]);

  const toggleTestStatus = async (testId, currentStatus) => {
    try {
      const newStatus = currentStatus === 'active' ? 'closed' : 'active';
      await updateDoc(doc(db, 'tests', testId), { status: newStatus });
      setTests(tests.map(t => t.id === testId ? { ...t, status: newStatus } : t));
    } catch (e) {
      console.log('[Head:toggleStatus:error]', e.code, e.message);
      setError(e.message || 'Failed to update test status');
    }
  };

  const copyShareableLink = async (testId) => {
    try {
      const testUrl = `${window.location.origin}/test/${testId}`;
      await navigator.clipboard.writeText(testUrl);
      setCopiedTestId(testId);

      // Reset the copied state after 2 seconds
      setTimeout(() => {
        setCopiedTestId(null);
      }, 2000);
    } catch (error) {
      console.error('Failed to copy link:', error);
      // Fallback for browsers that don't support clipboard API
      const textArea = document.createElement('textarea');
      textArea.value = `${window.location.origin}/test/${testId}`;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);

      setCopiedTestId(testId);
      setTimeout(() => {
        setCopiedTestId(null);
      }, 2000);
    }
  };

  // Debug function to manually check database
  const debugCheckDatabase = async (testId) => {
    try {
      console.log('=== MANUAL DATABASE CHECK ===');
      const questionsRef = collection(db, 'tests', testId, 'questions');
      const snapshot = await getDocs(questionsRef);
      console.log('Number of questions in database:', snapshot.docs.length);
      snapshot.docs.forEach((doc, index) => {
        const data = doc.data();
        console.log(`Question ${index + 1}:`, {
          docId: doc.id,
          questionId: data.questionId,
          questionText: data.questionText?.substring(0, 30) + '...',
          imageUrl: data.imageUrl,
          fullData: data
        });
      });
      console.log('=== END DATABASE CHECK ===');
    } catch (error) {
      console.error('Database check error:', error);
    }
  };

  const startEditTest = async (test) => {
    try {
      setEditLoading(true);
      console.log('Starting edit for test:', test);

      // Manual database check
      await debugCheckDatabase(test.id);

      const testData = await fetchTestWithQuestions(test.id);
      console.log('Fetched test data:', testData);
      console.log('Questions from database:', testData?.questions);
      if (testData?.questions) {
        console.log('Questions with imageUrl:', testData.questions.map(q => ({
          id: q.id,
          questionText: q.questionText?.substring(0, 30) + '...',
          imageUrl: q.imageUrl
        })));
      }

      if (testData) {
        setEditingTest(test);
        const parsedDuration = parseDuration(testData.duration || '30 min');
        setEditTestData({
          title: testData.title || '',
          description: testData.description || '',
          duration: testData.duration || '30 min',
          durationHours: parsedDuration.hours,
          durationMinutes: parsedDuration.minutes,
          password: testData.password || '',
          allowMultipleSubmissions: testData.allowMultipleSubmissions || false
        });

        // Ensure questions have all required fields including imageUrl
        const processedQuestions = (testData.questions || []).map(q => ({
          id: q.id || q.questionId || Date.now(),
          questionText: q.questionText || '',
          questionType: q.questionType || 'mcq',
          options: q.options || ['', '', '', ''],
          correctAnswer: q.correctAnswer || '',
          marks: q.marks || 1,
          imageUrl: q.imageUrl || ''
        }));

        console.log('Processed questions for editing:', processedQuestions);
        setEditQuestions(processedQuestions);
        setEditQIndex(0);
        setEditStep(1);
        console.log('Edit modal should now show with step:', 1);
      }
    } catch (e) {
      console.log('[Head:startEdit:error]', e);
      setError('Failed to load test for editing');
    } finally {
      setEditLoading(false);
    }
  };

  return (
    <div className="head-manage-tests">
      <div className="manage-header">
        <div>
          <h3>Manage Tests</h3>
          <p className="manage-subtitle">
            Create, edit, and share your tests. Use the <strong>🔗 Share Link</strong> button to copy test URLs for candidates.
          </p>
        </div>
        <div className="branch-badge">
          <span>Domain:</span>
          <span className="badge badge-primary">{userDoc?.domain || 'Full Stack'}</span>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="loading-tests">
          <Loading message="Loading tests" subtext="Fetching your created tests" variant="inline" size="large" />
        </div>
      ) : tests.length === 0 ? (
        <div className="no-tests">No tests created yet.</div>
      ) : (
        <div className="tests-grid">
          {tests.map(test => (
            <div key={test.id} className="test-card">
              {console.log(test.id)}
              <div className="test-info">
                <div>
                  <h4>{test.title}</h4>
                  <div className="test-meta">
                    {test.domain || 'Full Stack'} • {test.duration} • {test.totalMarks} marks
                  </div>
                  <div className="test-details">
                    <span>Created: {test.createdAt?.toDate?.()?.toLocaleDateString() || 'Unknown'}</span>
                    <span className="password-display">
                      Password: {test.password || 'No password'}
                    </span>
                  </div>
                </div>
                <span className={`badge ${test.status === 'active' ? 'badge-success' : 'badge-neutral'}`}>
                  {test.status}
                </span>
              </div>

              <div className="test-actions">
                <button
                  className={`btn btn-outline btn-sm ${editLoading ? 'btn-loading' : ''}`}
                  onClick={() => startEditTest(test)}
                  disabled={editLoading}
                >
                  {editLoading ? 'Loading...' : 'Edit'}
                </button>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => toggleTestStatus(test.id, test.status)}
                >
                  {test.status === 'active' ? 'Close' : 'Activate'}
                </button>
                <button
                  className={`btn btn-primary btn-sm ${copiedTestId === test.id ? 'btn-success' : ''}`}
                  onClick={() => copyShareableLink(test.id)}
                  title="Copy shareable test link"
                >
                  {copiedTestId === test.id ? (
                    <>✓ Copied!</>
                  ) : (
                    <>🔗 Share Link</>
                  )}
                </button>

              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Test Modal */}
      {editingTest && (
        <div className="edit-modal-overlay">
          <div className="edit-modal">

            <div className="modal-body">
              {console.log('Rendering modal body. editStep:', editStep, 'editingTest:', editingTest)}
              {editStep === 1 && (
                <div className="edit-step-1">
                  <h4>Test Information</h4>
                  <div className="form-group">
                    <label>Test Title</label>
                    <input
                      type="text"
                      value={editTestData.title}
                      onChange={(e) => setEditTestData({ ...editTestData, title: e.target.value })}
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label>Description</label>
                    <textarea
                      value={editTestData.description}
                      onChange={(e) => setEditTestData({ ...editTestData, description: e.target.value })}
                      className="form-textarea"
                      rows="3"
                    />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Duration</label>
                      <div className="duration-inputs" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                          <input
                            type="number"
                            min="0"
                            max="12"
                            className="form-input"
                            value={editTestData.durationHours}
                            onChange={(e) => setEditTestData({ ...editTestData, durationHours: parseInt(e.target.value) || 0 })}
                            placeholder="0"
                          />
                          <small style={{ color: '#6b7280', fontSize: '12px', marginTop: '4px' }}>Hours</small>
                        </div>
                        <span style={{ color: '#6b7280', fontWeight: 'bold' }}>:</span>
                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                          <input
                            type="number"
                            min="0"
                            max="59"
                            step="1"
                            className="form-input"
                            value={editTestData.durationMinutes}
                            onChange={(e) => setEditTestData({ ...editTestData, durationMinutes: parseInt(e.target.value) || 0 })}
                            placeholder="30"
                          />
                          <small style={{ color: '#6b7280', fontSize: '12px', marginTop: '4px' }}>Minutes</small>
                        </div>
                      </div>
                      <div className="form-help">
                        Total: {formatDuration(editTestData.durationHours, editTestData.durationMinutes)}
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Password</label>
                      <input
                        type="text"
                        value={editTestData.password}
                        onChange={(e) => setEditTestData({ ...editTestData, password: e.target.value })}
                        className="form-input"
                        placeholder="Optional test password"
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Multiple Submissions</label>
                    <div className="toggle-container" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <label className="toggle-switch" style={{ position: 'relative', display: 'inline-block', width: '50px', height: '24px' }}>
                        <input
                          type="checkbox"
                          checked={editTestData.allowMultipleSubmissions}
                          onChange={(e) => setEditTestData({ ...editTestData, allowMultipleSubmissions: e.target.checked })}
                          style={{ opacity: 0, width: 0, height: 0 }}
                        />
                        <span
                          className="toggle-slider"
                          style={{
                            position: 'absolute',
                            cursor: 'pointer',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            backgroundColor: editTestData.allowMultipleSubmissions ? '#4CAF50' : '#ccc',
                            transition: '0.4s',
                            borderRadius: '24px'
                          }}
                        >
                          <span
                            style={{
                              position: 'absolute',
                              content: '',
                              height: '18px',
                              width: '18px',
                              left: editTestData.allowMultipleSubmissions ? '26px' : '3px',
                              bottom: '3px',
                              backgroundColor: 'white',
                              transition: '0.4s',
                              borderRadius: '50%'
                            }}
                          />
                        </span>
                      </label>
                      <span style={{ fontSize: '14px', color: editTestData.allowMultipleSubmissions ? '#4CAF50' : '#666' }}>
                        {editTestData.allowMultipleSubmissions ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <div className="form-help">
                      {editTestData.allowMultipleSubmissions
                        ? 'Candidates can submit multiple times. Only the latest submission will be considered for grading.'
                        : 'Candidates can submit only once. Choose this for final exams or assessments.'}
                    </div>
                  </div>

                  <div className="modal-actions">
                    <button
                      className="btn btn-outline"
                      onClick={async () => {
                        try {
                          setEditLoading(true);
                          await updateDoc(doc(db, 'tests', editingTest.id), {
                            title: editTestData.title.trim(),
                            description: editTestData.description.trim(),
                            duration: formatDuration(editTestData.durationHours, editTestData.durationMinutes),
                            password: editTestData.password.trim(),
                            domain: editTestData.branch?.trim() || editingTest.branch || 'Full Stack',
                            allowMultipleSubmissions: editTestData.allowMultipleSubmissions,
                            updatedAt: serverTimestamp()
                          });

                          setTests(tests.map(t =>
                            t.id === editingTest.id
                              ? { ...t, ...editTestData, allowMultipleSubmissions: editTestData.allowMultipleSubmissions }
                              : t
                          ));

                          setEditingTest(null);
                          alert('Test details updated successfully!');
                        } catch (error) {
                          alert('Failed to update test: ' + error.message);
                        } finally {
                          setEditLoading(false);
                        }
                      }}
                      disabled={!editTestData.title.trim() || editLoading}
                    >
                      {editLoading ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={() => setEditStep(2)}
                      disabled={!editTestData.title.trim()}
                    >
                      Next: Edit Questions
                    </button>
                  </div>
                </div>
              )}

              {editStep === 2 && (
                <div className="edit-step-2">
                  <div className="questions-header">
                    <h4>Questions ({editQuestions.length})</h4>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => {
                        const newQuestion = {
                          id: Date.now(),
                          questionText: '',
                          questionType: 'mcq',
                          options: ['', '', '', ''],
                          correctAnswer: '',
                          marks: 1,
                          imageUrl: ''
                        };
                        setEditQuestions([...editQuestions, newQuestion]);
                        setEditQIndex(editQuestions.length);
                      }}
                    >
                      + Add Question
                    </button>
                  </div>


                  {editQuestions.length > 0 && (
                    <>
                      <div className="question-nav">
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => setEditQIndex(Math.max(0, editQIndex - 1))}
                          disabled={editQIndex === 0}
                        >
                          ← Previous
                        </button>
                        <span>Question {editQIndex + 1} of {editQuestions.length}</span>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => setEditQIndex(Math.min(editQuestions.length - 1, editQIndex + 1))}
                          disabled={editQIndex >= editQuestions.length - 1}
                        >
                          Next →
                        </button>
                      </div>

                      {editQuestions[editQIndex] && (
                        <div className="question-editor">
                          <div className="form-group">
                            <label>Question Text</label>
                            <textarea
                              value={editQuestions[editQIndex].questionText}
                              onChange={(e) => {
                                const updated = [...editQuestions];
                                updated[editQIndex].questionText = e.target.value;
                                setEditQuestions(updated);
                              }}
                              className="form-textarea"
                              rows="4"
                              placeholder="Enter your question..."
                            />
                          </div>

                          <div className="form-group">
                            <label>Question Image (Optional)</label>
                            <div className="image-upload-section">
                              <input
                                type="url"
                                value={editQuestions[editQIndex]?.imageUrl || ''}
                                onChange={(e) => {
                                  const updated = [...editQuestions];
                                  updated[editQIndex].imageUrl = e.target.value;
                                  setEditQuestions(updated);
                                  console.log('Image URL updated:', e.target.value);
                                }}
                                className="form-input"
                                placeholder="Enter image URL (e.g., https://example.com/image.jpg)"
                              />
                              <div className="image-upload-help">
                                <span className="help-text">
                                  💡 Add an image URL to provide visual illustration for your question
                                </span>
                              </div>
                              {editQuestions[editQIndex].imageUrl && (
                                <div className="image-preview">
                                  <img
                                    src={editQuestions[editQIndex].imageUrl}
                                    alt="Question illustration"
                                    onError={(e) => {
                                      e.target.style.display = 'none';
                                      e.target.nextSibling.style.display = 'block';
                                    }}
                                    onLoad={(e) => {
                                      e.target.style.display = 'block';
                                      e.target.nextSibling.style.display = 'none';
                                    }}
                                  />
                                  <div className="image-error" style={{ display: 'none' }}>
                                    ❌ Failed to load image. Please check the URL.
                                  </div>
                                  <button
                                    type="button"
                                    className="btn btn-outline btn-sm remove-image"
                                    onClick={() => {
                                      const updated = [...editQuestions];
                                      updated[editQIndex].imageUrl = '';
                                      setEditQuestions(updated);
                                    }}
                                  >
                                    Remove Image
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="form-row">
                            <div className="form-group">
                              <label>Question Type</label>
                              <select
                                value={editQuestions[editQIndex].questionType}
                                onChange={(e) => {
                                  const updated = [...editQuestions];
                                  updated[editQIndex].questionType = e.target.value;
                                  if (e.target.value !== 'mcq') {
                                    updated[editQIndex].options = [];
                                    updated[editQIndex].correctAnswer = '';
                                  } else {
                                    updated[editQIndex].options = ['', '', '', ''];
                                  }
                                  setEditQuestions(updated);
                                }}
                                className="form-select"
                              >
                                <option value="mcq">Multiple Choice</option>
                                <option value="long">Long Answer</option>
                                <option value="code">Code</option>
                              </select>
                            </div>
                            <div className="form-group">
                              <label>Marks</label>
                              <input
                                type="number"
                                min="1"
                                value={editQuestions[editQIndex].marks}
                                onChange={(e) => {
                                  const updated = [...editQuestions];
                                  updated[editQIndex].marks = parseInt(e.target.value) || 1;
                                  setEditQuestions(updated);
                                }}
                                className="form-input"
                              />
                            </div>
                          </div>

                          {editQuestions[editQIndex].questionType === 'mcq' && (
                            <>
                              <div className="form-group">
                                <label>Options</label>
                                {editQuestions[editQIndex].options.map((option, idx) => (
                                  <input
                                    key={idx}
                                    type="text"
                                    value={option}
                                    onChange={(e) => {
                                      const updated = [...editQuestions];
                                      updated[editQIndex].options[idx] = e.target.value;
                                      setEditQuestions(updated);
                                    }}
                                    className="form-input"
                                    placeholder={`Option ${idx + 1}`}
                                  />
                                ))}
                              </div>
                              <div className="form-group">
                                <label>Correct Answer</label>
                                <select
                                  value={editQuestions[editQIndex].correctAnswer}
                                  onChange={(e) => {
                                    const updated = [...editQuestions];
                                    updated[editQIndex].correctAnswer = e.target.value;
                                    setEditQuestions(updated);
                                  }}
                                  className="form-select"
                                >
                                  <option value="">Select correct answer</option>
                                  {editQuestions[editQIndex].options.map((option, idx) => (
                                    option && <option key={idx} value={option}>{option}</option>
                                  ))}
                                </select>
                              </div>
                            </>
                          )}

                          <div className="question-actions">
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => {
                                if (window.confirm('Delete this question?')) {
                                  const updated = editQuestions.filter((_, idx) => idx !== editQIndex);
                                  setEditQuestions(updated);
                                  if (editQIndex >= updated.length) {
                                    setEditQIndex(Math.max(0, updated.length - 1));
                                  }
                                }
                              }}
                            >
                              Delete Question
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  <div className="modal-actions">
                    <button
                      className="btn btn-outline"
                      onClick={() => setEditStep(1)}
                    >
                      ← Back to Test Info
                    </button>
                    <button
                      className={`btn btn-primary ${editLoading ? 'btn-loading' : ''}`}
                      onClick={async () => {
                        try {
                          setEditLoading(true);
                          const totalMarks = editQuestions.reduce((sum, q) => sum + (q.marks || 1), 0);

                          // Update main test document
                          await updateDoc(doc(db, 'tests', editingTest.id), {
                            title: editTestData.title.trim(),
                            description: editTestData.description.trim(),
                            duration: formatDuration(editTestData.durationHours, editTestData.durationMinutes),
                            password: editTestData.password.trim(),
                            domain: editTestData.branch?.trim() || editingTest.branch || 'Full Stack',
                            allowMultipleSubmissions: editTestData.allowMultipleSubmissions,
                            totalMarks: totalMarks,
                            updatedAt: serverTimestamp()
                          });

                          // Delete existing questions subcollection
                          const questionsRef = collection(db, 'tests', editingTest.id, 'questions');
                          const existingQuestions = await getDocs(questionsRef);
                          for (const questionDoc of existingQuestions.docs) {
                            await deleteDoc(questionDoc.ref);
                          }

                          // Add updated questions to subcollection
                          for (const question of editQuestions) {
                            const questionDoc = {
                              questionId: question.id.toString(),
                              questionText: question.questionText || 'No question text',
                              questionType: question.questionType || 'mcq',
                              options: question.questionType === 'mcq' ? (question.options || ['', '', '', '']) : [],
                              correctAnswer: question.correctAnswer || '',
                              marks: question.marks || 1,
                              imageUrl: question.imageUrl || ''
                            };

                            if (questionDoc.imageUrl) {
                              console.log('Saving question with image:', questionDoc.imageUrl);
                            }
                            await addDoc(questionsRef, questionDoc);
                          }

                          // Update local state
                          setTests(tests.map(t =>
                            t.id === editingTest.id
                              ? { ...t, ...editTestData, totalMarks, allowMultipleSubmissions: editTestData.allowMultipleSubmissions }
                              : t
                          ));

                          setEditingTest(null);
                          setError('');
                          alert('Test updated successfully!');
                        } catch (e) {
                          console.error('Error updating test:', e);
                          setError('Failed to update test');
                        } finally {
                          setEditLoading(false);
                        }
                      }}
                      disabled={editLoading || !editTestData.title.trim() || editQuestions.length === 0}
                    >
                      {editLoading ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Head Results Component
function HeadResults() {
  const [tests, setTests] = useState([]);
  const [selectedTest, setSelectedTest] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const { userDoc } = useFirebase();

  useEffect(() => {
    const loadTests = async () => {
      setLoading(true);
      setError('');
      try {
        console.log('HeadResults: Loading tests for branch:', userDoc?.branch);
        console.log('HeadResults: User doc:', userDoc);
        const testsRef = collection(db, 'tests');

        // Try branch-specific query first
        const testsQuery = query(testsRef, where('branch', '==', userDoc?.branch || 'Full Stack'));
        const testsSnap = await getDocs(testsQuery);
        let testsData = testsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        console.log('HeadResults: Found tests by branch:', testsData.length);

        // If no tests found by branch, try loading all tests
        if (testsData.length === 0) {
          console.log('HeadResults: No tests found by branch, loading all tests');
          const allTestsSnap = await getDocs(testsRef);
          testsData = allTestsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          console.log('HeadResults: Found all tests:', testsData.length);
        }

        console.log('HeadResults: Final tests:', testsData);
        setTests(testsData);
      } catch (e) {
        console.log('[Head:loadTests:error]', e.code, e.message);
        setError(e.message || 'Failed to load tests');
      } finally {
        setLoading(false);
      }
    };

    if (userDoc) {
      console.log('HeadResults: User doc available, loading tests');
      loadTests();
    } else {
      console.log('HeadResults: No user doc available');
    }
  }, [userDoc]);

  const loadSubmissions = async (testId) => {
    setLoading(true);
    setError('');
    try {
      const resultsRef = collection(db, 'results');
      const resultsQuery = query(resultsRef, where('testId', '==', testId));
      const resultsSnap = await getDocs(resultsQuery);

      // Process each result to ensure we have the candidate's name
      const resultsData = await Promise.all(
        resultsSnap.docs.map(async (resultDoc) => {
          const data = resultDoc.data();
          let candidateName = data.candidateName || '';
          let displayName = '';

          // Process candidate name - handle emails stored in candidateName field
          console.log('DEBUG: Raw candidateName from database:', data.candidateName);
          console.log('DEBUG: CandidateId:', data.candidateId);

          // If candidateName is already an email, extract the username part
          if (candidateName && candidateName.includes('@')) {
            candidateName = candidateName.split('@')[0];
            console.log('DEBUG: Extracted name from email:', candidateName);
          } else if (data.candidateId) {
            // Try to get better name from user database
            console.log('DEBUG: Trying to get name from user database for:', data.candidateId);

            try {
              // Try to get user by Firebase UID from 'user' collection
              let userDoc = await getDoc(doc(db, 'user', data.candidateId));
              let userData = null;

              if (userDoc.exists()) {
                userData = userDoc.data();
                console.log('DEBUG: Found user in "user" collection:', userData);
              } else {
                console.log('DEBUG: No user found in "user" collection, trying "users"...');
                // Try 'users' collection (plural)
                userDoc = await getDoc(doc(db, 'users', data.candidateId));
                if (userDoc.exists()) {
                  userData = userDoc.data();
                  console.log('DEBUG: Found user in "users" collection:', userData);
                }
              }

              if (userData) {
                // Try different possible field names for the user's name
                const possibleNames = [
                  userData.name,
                  userData.displayName,
                  userData.fullName,
                  userData.firstName,
                  userData.username
                ];



                // Use the first available name
                for (const name of possibleNames) {
                  if (name && name.trim()) {
                    candidateName = name.trim();
                    console.log('DEBUG: Using name field:', candidateName);
                    break;
                  }
                }

                // If no name fields, try email prefix from user data
                if (!candidateName && userData.email) {
                  candidateName = userData.email.includes('@') ? userData.email.split('@')[0] : userData.email;
                  console.log('DEBUG: Using email prefix from user data:', candidateName);
                }

                // Update the result document with the better candidate name
                if (candidateName && candidateName !== data.candidateName) {
                  await updateDoc(resultDoc.ref, {
                    candidateName: candidateName
                  });
                  console.log('DEBUG: Updated candidateName in database to:', candidateName);
                }
              } else {
                console.log('DEBUG: No user found in any collection for UID:', data.candidateId);
                // Fallback to using last 4 chars of UID
                candidateName = `Candidate ${data.candidateId.slice(-4)}`;
              }
            } catch (err) {
              console.error('DEBUG: Error fetching candidate name:', err);
              // Fallback to using last 4 chars of UID
              candidateName = `Candidate ${data.candidateId.slice(-4)}`;
            }
          }

          // Final fallback
          if (!candidateName) {
            candidateName = 'Unknown';
          }

          // Format the display name - prioritize candidate name, but always show something useful
          if (candidateName && candidateName !== 'Unknown') {
            displayName = candidateName;
          } else if (data.candidateId && data.candidateId.includes('@')) {
            displayName = data.candidateId.split('@')[0];
          } else {
            displayName = 'Unknown Candidate';
          }

          return {
            id: resultDoc.id,
            ...data,
            candidateName: candidateName,
            displayName: displayName
          };
        })
      );

      // Filter to show only latest submission per candidate
      const latestSubmissions = {};
      resultsData.forEach(submission => {
        const candidateId = submission.candidateId;
        const submittedAt = submission.submittedAt?.toDate?.() || new Date(submission.submittedAt);

        // If no submission for this candidate yet, or this one is newer
        if (!latestSubmissions[candidateId] ||
          submittedAt > (latestSubmissions[candidateId].submittedAt?.toDate?.() || new Date(latestSubmissions[candidateId].submittedAt))) {
          latestSubmissions[candidateId] = submission;
        }
      });

      // Convert to array and sort by submission time (newest first)
      const filteredSubmissions = Object.values(latestSubmissions).sort((a, b) => {
        const timeA = a.submittedAt?.toDate?.() || new Date(a.submittedAt);
        const timeB = b.submittedAt?.toDate?.() || new Date(b.submittedAt);
        return timeB - timeA;
      });

      setSubmissions(filteredSubmissions);
    } catch (e) {
      console.log('[Head:loadSubmissions:error]', e.code, e.message);
      setError(e.message || 'Failed to load submissions');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkSubmission = async (submissionId, newScore) => {
    try {
      const submissionRef = doc(db, 'results', submissionId);
      await updateDoc(submissionRef, {
        totalMarksAwarded: newScore,
        score: Math.round((newScore / (selectedTest.totalMarks || 100)) * 100),
        status: 'evaluated',
        evaluatedAt: serverTimestamp(),
        evaluatedBy: 'head'
      });

      // Update local state
      setSubmissions(submissions.map(s =>
        s.id === submissionId
          ? { ...s, totalMarksAwarded: newScore, score: Math.round((newScore / (selectedTest.totalMarks || 100)) * 100), status: 'evaluated' }
          : s
      ));
    } catch (e) {
      console.error('Error updating submission score:', e);
      setError('Failed to update score');
    }
  };

  // const deleteTest = async (testId, testTitle) => {
  //   const confirmDelete = window.confirm(
  //     `Are you sure you want to delete "${testTitle}"?\n\n` +
  //     `This action cannot be undone and will permanently remove:\n` +
  //     `• The test and all its questions\n` +
  //     `• All student submissions\n` +
  //     `• All related data\n\n` +
  //     `This action is irreversible!`
  //   );
  //
  //   if (!confirmDelete) {return;}
  //
  //   try {
  //     // Delete test document
  //     await deleteDoc(doc(db, 'tests', testId));
  //
  //     // Delete all submissions for this test
  //     const resultsQuery = query(collection(db, 'results'), where('testId', '==', testId));
  //     const resultsSnap = await getDocs(resultsQuery);
  //     const deletePromises = resultsSnap.docs.map(doc => deleteDoc(doc.ref));
  //     await Promise.all(deletePromises);
  //
  //     // Update local state
  //     setTests(tests.filter(t => t.id !== testId));
  //     if (selectedTest?.id === testId) {
  //       setSelectedTest(null);
  //       setSubmissions([]);
  //     }
  //
  //     alert(`Test "${testTitle}" and all related data deleted successfully!`);
  //   } catch (e) {
  //     console.log('[Head:deleteTest:error]', e.code, e.message);
  //     setError('Failed to delete test');
  //     alert('Failed to delete test. Please try again.');
  //   }
  // };

  // const handleEditTest = (test) => {
  //   // Parse duration for editing
  //   const parseDuration = (duration) => {
  //     const match = duration.match(/(\d+)h?\s*(\d+)?m?/);
  //     if (match) {
  //       const hours = parseInt(match[1]) || 0;
  //       const minutes = parseInt(match[2]) || 0;
  //       return { hours, minutes };
  //     }
  //     return { hours: 0, minutes: 30 };
  //   };
  //
  //   const { hours, minutes } = parseDuration(test.duration || '30min');
  //
  //   setEditTestData({
  //     title: test.title || '',
  //     description: test.description || '',
  //     duration: test.duration || '30min',
  //     durationHours: hours,
  //     durationMinutes: minutes,
  //     password: test.password || '',
  //     allowMultipleSubmissions: test.allowMultipleSubmissions || false
  //   });
  //   setEditingTest(test);
  //   setEditStep(1);
  // };

  // If viewing individual submission
  if (selectedSubmission) {
    return (
      <HeadSubmissionDetailView
        submission={selectedSubmission}
        test={selectedTest}
        onBack={() => setSelectedSubmission(null)}
      />
    );
  }

  if (!selectedTest) {
    return (
      <div className="head-results">
        <div className="results-header">
          <h3>Test Results</h3>
          <div className="branch-badge">
            <span>Branch:</span>
            <span className="badge badge-primary">{userDoc?.branch || 'Full Stack'}</span>
          </div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {loading ? (
          <div className="loading-results">
            <Loading message="Loading test results" subtext="Gathering candidate submissions and performance data" variant="inline" size="large" />
          </div>
        ) : tests.length === 0 ? (
          <div className="no-tests">No tests created yet.</div>
        ) : (
          <div className="tests-grid">
            {tests.map(test => (
              <div key={test.id} className="test-card clickable" onClick={() => {
                setSelectedTest(test);
                loadSubmissions(test.id);
              }}>
                <div className="test-info">
                  <div>
                    <h4>{test.title}</h4>
                    <div className="test-meta">
                      {test.branch} • {test.duration} • {test.totalMarks} marks
                    </div>
                    {test.description && (
                      <div className="test-description">
                        {test.description}
                      </div>
                    )}
                  </div>
                  <button className="btn btn-sm">View</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="head-results">
      <div className="results-header">
        <h3>Submissions for: {selectedTest.title}</h3>
        <div className="results-actions">
          <div className="export-actions">
            <button
              className={`btn btn-outline btn-sm ${exporting ? 'btn-loading' : ''}`}
              onClick={() => exportSubmissionsToExcel({ submissions, selectedTest, setLoading: setExporting })}
              disabled={exporting || submissions.length === 0}
              title="Export submissions to Excel"
            >
              <Icon name="notebook" size="small" /> Export Excel
            </button>

            <button
              className={`btn btn-outline btn-sm ${exporting ? 'btn-loading' : ''}`}
              onClick={() => exportSubmissionsToPDF({ submissions, selectedTest, setLoading: setExporting, exportType: 'head' })}
              disabled={exporting || submissions.length === 0}
              title="Export submissions to PDF"
              style={{ marginLeft: '8px' }}
            >
              <Icon name="paper" size="small" /> Export PDF
            </button>
          </div>
          <div className="refresh-actions">
            <button
              className="btn btn-outline btn-sm"
              onClick={() => loadSubmissions(selectedTest.id)}
              disabled={loading}
            >
              🔄 Refresh
            </button>
            <button className="btn btn-outline" onClick={() => setSelectedTest(null)}>← Back to Tests</button>
          </div>
        </div>
      </div>

      <div className="results-summary">
        <div className="summary-stats">
          <span className="stat-item">
            <strong>Total Submissions:</strong> {submissions.length}
          </span>
          <span className="stat-item">
            <strong>Evaluated:</strong> {submissions.filter(s => s.status === 'evaluated').length}
          </span>
          <span className="stat-item">
            <strong>Pending:</strong> {submissions.filter(s => s.status !== 'evaluated').length}
          </span>
          <span className="stat-item">
            <strong>Test Total:</strong> {selectedTest.totalMarks || 100} marks
          </span>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="loading-results">
          <Loading message="Loading detailed submissions" subtext="Processing candidate answers and calculating scores" variant="inline" size="large" />
        </div>
      ) : submissions.length === 0 ? (
        <div className="no-submissions">No submissions for this test yet.</div>
      ) : (
        <div className="submissions-grid">
          {submissions.map(result => {
            // Use the processed display name

            // Determine the best name to display - prioritize actual names over IDs
            const displayName = result.candidateName || result.displayName || 'Unknown Candidate';

            return (
              <div key={result.id} className="submission-card">
                <div className="submission-info">
                  <div>
                    <h4>{displayName}</h4>
                    {result.evaluatedAt && (
                      <div className="evaluation-date">
                        Evaluated: {result.evaluatedAt?.toDate?.()?.toLocaleString()}
                      </div>
                    )}
                  </div>
                  <span className={`badge ${result.status === 'evaluated' ? 'badge-success' : 'badge-neutral'}`}>
                    {result.status || 'submitted'}
                  </span>
                </div>

                <div className="score-input">
                  <label>Score:</label>
                  <input
                    type="number"
                    min="0"
                    max={selectedTest.totalMarks || 100}
                    step="0.5"
                    value={result.totalMarksAwarded !== undefined ? result.totalMarksAwarded : result.score || 0}
                    onChange={(e) => {
                      const newScore = parseFloat(e.target.value) || 0;
                      handleMarkSubmission(result.id, newScore);
                    }}
                  />
                  <span>/{selectedTest.totalMarks || 100} marks</span>
                  {result.totalMarksAwarded !== undefined && (
                    <div className="percentage-display">
                      ({Math.round((result.totalMarksAwarded / (selectedTest.totalMarks || 100)) * 100)}%)
                    </div>
                  )}
                  <div className="submission-stats">
                    <div className="questions-attempted">
                      Questions: {result.answers ? Object.keys(result.answers).length : 0} answered
                    </div>
                    {result.evaluatedBy && (
                      <div className="evaluated-by">
                        Evaluated by: {result.evaluatedBy}
                      </div>
                    )}
                  </div>
                  <button
                    className="btn btn-sm btn-outline"
                    onClick={() => setSelectedSubmission(result)}
                    title="View Details"
                  >
                    <Icon name="computer" size="small" /> View Details
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Head Users Component
function HeadUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState('newest');
  const { user: currentUser, userDoc } = useFirebase();

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const usersRef = collection(db, 'user');
        const querySnapshot = await getDocs(usersRef);

        const usersData = [];
        querySnapshot.forEach((doc) => {
          const userData = { id: doc.id, ...doc.data() };
          // Only show candidates (exclude admin and head)
          if (userData.role === 'candidate' && userData.role !== 'admin' && userData.role !== 'head') {
            usersData.push(userData);
          }
        });

        // Sort users
        usersData.sort((a, b) => {
          const timeA = a.createdAt?.toDate?.() ? a.createdAt.toDate().getTime() : 0;
          const timeB = b.createdAt?.toDate?.() ? b.createdAt.toDate().getTime() : 0;
          return timeA - timeB;
        });

        setUsers(usersData);
        setLoading(false);
      } catch (err) {
        console.error('Error loading users:', err);
        setError(`Failed to load users: ${err.message}`);
        setLoading(false);
      }
    };

    if (userDoc?.domain) {
      fetchUsers();
    }
  }, [userDoc?.domain]);

  const handleApproval = async (userId, approved) => {
    try {
      const userRef = doc(db, 'user', userId);
      await updateDoc(userRef, {
        approved: approved,
        approvedAt: serverTimestamp(),
        approvedBy: currentUser?.email
      });

      // Update local state
      setUsers(users.map(u => u.id === userId ? { ...u, approved } : u));
      alert(approved ? 'User approved successfully!' : 'User approval revoked!');
    } catch (error) {
      console.error('Error updating approval status:', error);
      alert('Failed to update approval status: ' + error.message);
    }
  };

  const filteredUsers = users
    .filter(user => {
      const matchesSearch = user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.name?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSearch;
    })
    .sort((a, b) => {
      const timeA = a.createdAt?.toDate?.() ? a.createdAt.toDate().getTime() : 0;
      const timeB = b.createdAt?.toDate?.() ? b.createdAt.toDate().getTime() : 0;
      return sortOrder === 'newest' ? timeB - timeA : timeA - timeB;
    });

  if (loading) {
    return <Loading message="Loading users" subtext="Fetching user accounts" variant="inline" size="large" />;
  }

  if (error) {
    return (
      <div className="head-users">
        <div className="error-message">{error}</div>
      </div>
    );
  }

  return (
    <div className="head-users">
      <div className="users-header">
        <h2>Manage Users - {userDoc?.domain || 'Your Domain'}</h2>
        <div className="search-container">
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="filters">
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="filter-select"
          >
            <option value="oldest">⏰ Oldest First</option>
            <option value="newest">🆕 Newest First</option>
          </select>
        </div>
      </div>

      {filteredUsers.length === 0 ? (
        <div className="no-users">
          <div className="no-users-icon">👥</div>
          <h3>No Users Found</h3>
          <p>No candidates registered yet.</p>
        </div>
      ) : (
        <div className="users-table-container">
          <table className="users-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Approval</th>
                <th>Status</th>
                <th>Registered</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(user => (
                <tr key={user.id}>
                  <td>{user.name || 'N/A'}</td>
                  <td>{user.email}</td>
                  <td>
                    {user.approved === false ? (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          className="btn btn-sm btn-success"
                          onClick={() => handleApproval(user.id, true)}
                          title="Approve user"
                        >
                          ✓ Approve
                        </button>
                      </div>
                    ) : (
                      <span className="badge badge-success">
                        ✓ Approved
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${user.blocked ? 'badge-error' : 'badge-success'}`}>
                      {user.blocked ? 'Blocked' : 'Active'}
                    </span>
                  </td>
                  <td>
                    {user.createdAt?.toDate?.() ?
                      new Date(user.createdAt.toDate()).toLocaleDateString() :
                      'N/A'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Head Submission Detail View Component
function HeadSubmissionDetailView({ submission, test, onBack }) {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [marksDistribution, setMarksDistribution] = useState({});
  const [totalMarks, setTotalMarks] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadSubmissionDetails = async () => {
      try {
        // Fetch questions from the test
        const questionsRef = collection(db, 'tests', test.id, 'questions');
        const questionsSnapshot = await getDocs(questionsRef);
        const questionsData = questionsSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: data.questionId || doc.id,
            questionText: data.questionText,
            questionType: data.questionType,
            options: data.options || [],
            correctAnswer: data.correctAnswer,
            marks: data.marks || 1,
            imageUrl: data.imageUrl || '',
            ...data
          };
        });

        // Sort questions by ID
        questionsData.sort((a, b) => {
          const aId = parseInt(a.id) || 0;
          const bId = parseInt(b.id) || 0;
          return aId - bId;
        });

        // Add candidate answers to questions
        const questionsWithAnswers = questionsData.map(question => {
          const candidateAnswer = submission.answers?.[question.id] || '';
          return {
            ...question,
            candidateAnswer,
            isCorrect: question.questionType === 'mcq' ?
              candidateAnswer === question.correctAnswer : null
          };
        });

        // Initialize marks distribution
        const initialMarks = {};
        let calculatedTotal = 0;

        questionsWithAnswers.forEach(question => {
          // Check if marks already exist in submission
          const existingMarks = submission.questionMarks?.[question.id];
          if (existingMarks !== undefined) {
            initialMarks[question.id] = existingMarks;
            calculatedTotal += existingMarks;
          } else {
            // Initialize all questions with 0 marks for manual grading
            initialMarks[question.id] = 0;
          }
        });

        setQuestions(questionsWithAnswers);
        setMarksDistribution(initialMarks);
        setTotalMarks(calculatedTotal);
        setLoading(false);
      } catch (error) {
        console.error('Error loading submission details:', error);
        setLoading(false);
      }
    };

    loadSubmissionDetails();
  }, [submission, test.id]);

  const handleMarksChange = (questionId, marks) => {
    const numericMarks = Math.max(0, parseFloat(marks) || 0);
    const maxMarks = questions.find(q => q.id === questionId)?.marks || 1;
    const finalMarks = Math.min(numericMarks, maxMarks);

    setMarksDistribution(prev => ({
      ...prev,
      [questionId]: finalMarks
    }));

    // Recalculate total
    const newTotal = Object.values({
      ...marksDistribution,
      [questionId]: finalMarks
    }).reduce((sum, mark) => sum + (mark || 0), 0);
    setTotalMarks(newTotal);
  };
  const formatCodeBlocks = (text) => {
    // First escape all HTML
    let result = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    // Convert code blocks (between ``` and ```)
    result = result.replace(/```([\s\S]*?)```/g, (match, code) => {
      const escapedCode = code
        .replace(/^[\r\n]+|[\r\n]+$/g, '') // Trim newlines
        .replace(/^/gm, '  '); // Add indentation
      return `<pre class="code-block"><code>${escapedCode}</code></pre>`;
    });

    // Convert inline code (`code`)
    result = result.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

    // Convert newlines to <br> for non-code blocks
    result = result.replace(/\n(?!\s*<pre)/g, '<br>');

    // Convert multiple spaces to &nbsp; (except in code blocks)
    result = result.replace(/ {2,}(?![\s\S]*<\/pre>)/g, (match) => '&nbsp;'.repeat(match.length));

    return result;
  };

  const saveMarksDistribution = async () => {
    setSaving(true);
    try {
      // Calculate percentage score
      const maxPossibleMarks = questions.reduce((sum, q) => sum + (q.marks || 1), 0);
      const percentage = maxPossibleMarks > 0 ? Math.round((totalMarks / maxPossibleMarks) * 100) : 0;

      // Update submission in database
      const submissionRef = doc(db, 'results', submission.id);
      await updateDoc(submissionRef, {
        questionMarks: marksDistribution,
        totalMarksAwarded: totalMarks,
        maxPossibleMarks: maxPossibleMarks,
        score: percentage,
        status: 'evaluated',
        evaluatedAt: serverTimestamp(),
        evaluatedBy: 'head'
      });

      alert('Marks saved successfully!');
    } catch (error) {
      console.error('Error saving marks:', error);
      alert('Failed to save marks. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-tests">
        <Loading message="Loading submission details" subtext="Fetching candidate answers and question data" variant="inline" size="large" />
      </div>
    );
  }

  return (
    <div className="submission-detail-view">
      <div className="submission-header">
        <button className="btn btn-outline" onClick={onBack}>
          <Icon name="submissions" size="small" /> Back to Submissions
        </button>
        <div className="submission-info">
          <h2>Submission Details</h2>
          <div className="submission-meta">
            <div className="meta-item">
              <strong>Candidate:</strong> {submission.candidateName || 'Unknown'}
            </div>
            <div className="meta-item">
              <strong>Test:</strong> {test.title}
            </div>
            <div className="meta-item">
              <strong>Submitted:</strong> {formatDateTime(submission.submittedAt)}
            </div>
            <div className="meta-item">
              <strong>Score:</strong> {submission.totalMarksAwarded !== undefined ?
                `${submission.totalMarksAwarded}/${submission.maxPossibleMarks || 'N/A'} marks` :
                submission.score !== undefined ? `${submission.score}%` : 'Not graded'}
            </div>
            <div className="meta-item">
              <strong>Status:</strong>
              <span className={`badge ${submission.status === 'evaluated' ? 'badge-success' : 'badge-warning'}`}>
                {submission.status || 'submitted'}
              </span>
            </div>
          </div>
        </div>
        <div className="marks-summary-header">
          <div className="marks-total-display">
            <span className="marks-total-label">Total Marks:</span>
            <span className="marks-total-value">{totalMarks} / {questions.reduce((sum, q) => sum + (q.marks || 1), 0)}</span>
            <span className="marks-percentage">({questions.reduce((sum, q) => sum + (q.marks || 1), 0) > 0 ?
              Math.round((totalMarks / questions.reduce((sum, q) => sum + (q.marks || 1), 0)) * 100) : 0}%)</span>
          </div>
          <div className="marks-actions">
            <button
              className={`btn btn-primary ${saving ? 'btn-loading' : ''}`}
              onClick={saveMarksDistribution}
              disabled={saving}
            >
              {saving ? 'Saving...' : <><Icon name="shield" size="small" /> Save All Marks</>}
            </button>
          </div>
        </div>
      </div>

      <div className="submission-questions">
        {questions.map((question, index) => (
          <div key={question.id} className="submission-question-card">
            <div className="question-header">
              <div className="question-title-section">
                <span className="question-number">Q{index + 1}</span>
                <div className="question-meta">
                  <span className="question-type">{question.questionType?.toUpperCase() || 'MCQ'}</span>
                  <span className="question-marks">Max: {question.marks || 1} marks</span>
                  {question.questionType === 'mcq' && (
                    <div className="mcq-answer-preview">
                      <span className="candidate-choice">Choice: {question.candidateAnswer || 'None'}</span>
                      <span className={`answer-status ${question.isCorrect ? 'correct' : 'incorrect'}`}>
                        {question.isCorrect ? <><Icon name="success" size="small" /> Correct</> : <><Icon name="fire" size="small" /> Incorrect</>}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div className="marks-input-section">
                <div className="marks-input-container">
                  <label className="marks-label">Marks Awarded:</label>
                  <div className="marks-input-wrapper">
                    <input
                      type="number"
                      min="0"
                      max={question.marks || 1}
                      step="0.5"
                      value={marksDistribution[question.id] || 0}
                      onChange={(e) => handleMarksChange(question.id, e.target.value)}
                      className="marks-input"
                    />
                    <span className="marks-max">/ {question.marks || 1}</span>
                  </div>
                  {question.questionType === 'mcq' && question.isCorrect !== null && (
                    <span className={`mcq-result-indicator ${question.isCorrect ? 'correct' : 'incorrect'}`}>
                      {question.isCorrect ? <><Icon name="success" size="small" /> Correct Answer</> : <><Icon name="fire" size="small" /> Wrong Answer</>}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="question-content">
              <div
                className="question-text"
                dangerouslySetInnerHTML={{
                  __html: formatCodeBlocks(question.questionText || 'No question text')
                }}
              />

              {/* Question Image */}
              {question.imageUrl && (
                <div className="question-image">
                  <img
                    src={question.imageUrl}
                    alt="Question illustration"
                    style={{
                      maxWidth: '100%',
                      maxHeight: '300px',
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb',
                      marginTop: '1rem'
                    }}
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                </div>
              )}

              {/* MCQ Options and Answer */}
              {question.questionType === 'mcq' && (
                <div className="mcq-section">
                  <div className="candidate-answer-display">
                    <h4>Candidate's Answer:</h4>
                    <div className={`candidate-selected-answer ${question.isCorrect ? 'correct' : 'incorrect'}`}>
                      <span className="selected-option-text">
                        {question.candidateAnswer || 'No answer selected'}
                      </span>
                      <span className={`answer-result ${question.isCorrect ? 'correct' : 'incorrect'}`}>
                        {question.isCorrect ? <><Icon name="success" size="small" /> Correct</> : <><Icon name="fire" size="small" /> Incorrect</>}
                      </span>
                    </div>
                  </div>

                  <div className="question-options">
                    <h4>All Options:</h4>
                    {question.options.map((option, optIndex) => (
                      <div
                        key={optIndex}
                        className={`option ${option === question.correctAnswer ? 'correct-option' : ''
                          } ${option === question.candidateAnswer ? 'selected-option' : ''
                          }`}
                      >
                        <span className="option-label">{String.fromCharCode(65 + optIndex)}.</span>
                        <span className="option-text">{option}</span>
                        {option === question.correctAnswer && (
                          <span className="correct-indicator"><Icon name="success" size="small" /> Correct Answer</span>
                        )}
                        {option === question.candidateAnswer && option !== question.correctAnswer && (
                          <span className="selected-indicator">← Candidate Selected</span>
                        )}
                        {option === question.candidateAnswer && option === question.correctAnswer && (
                          <span className="both-indicator">← Candidate Selected (Correct!)</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Long Answer or Code Answer */}
              {(question.questionType === 'long' || question.questionType === 'code') && (
                <div className="text-answer-section">
                  <h4>Candidate's Answer:</h4>
                  <div className="candidate-answer">
                    {question.candidateAnswer ? (
                      <pre style={{
                        background: '#f8f9fa',
                        padding: '1rem',
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb',
                        whiteSpace: 'pre-wrap',
                        fontFamily: question.questionType === 'code' ? 'monospace' : 'inherit'
                      }}>
                        {question.candidateAnswer}
                      </pre>
                    ) : (
                      <div className="no-answer">No answer provided</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {questions.length === 0 && (
        <div className="no-questions">
          <p>No questions found for this submission</p>
        </div>
      )}
    </div>
  );
}

function HeadDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('create');
  const { loading: contextLoading } = useFirebase();
  // const { userDoc } = useFirebase(); // userDoc not currently used in main component

  const tabs = useMemo(() => [
    { label: 'Create Test', value: 'create' },
    { label: 'Manage Tests', value: 'manage' },
    { label: 'Results', value: 'results' },
    { label: 'Users', value: 'users' },
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
    return <Loading message="Loading head dashboard" subtext="Please wait while we prepare your workspace" />;
  }

  return (
    <div className="head-dashboard theme-head">
      <div className="dashboard-header">
        <div className="header-content">
          <div className="user-info">
            <h1>Head Dashboard</h1>
            <span className="badge badge-head">Head</span>
          </div>
          <button className="btn btn-outline" onClick={handleSignOut}>
            Sign Out
          </button>
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
          {activeTab === 'create' && <HeadCreateTest />}
          {activeTab === 'manage' && <HeadManageTests />}
          {activeTab === 'results' && <HeadResults />}
          {activeTab === 'users' && <HeadUsers />}
          {activeTab === 'leaderboard' && <Leaderboard />}
        </div>
      </div>
    </div>
  );
}

export default HeadDashboard;
