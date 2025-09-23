import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth, db } from '../../../firebase';
import { collection, getDocs, query, where, doc, setDoc, serverTimestamp, addDoc, updateDoc, deleteDoc, getDoc, onSnapshot } from 'firebase/firestore';
import { fetchTestWithQuestions } from '../../../services/firestore';
import { useFirebase } from '../../../context/FirebaseContext';
import Loading from '../../Loading/Loading';
import Icon from '../../icons/Icon';
import Leaderboard from '../../Leaderboard/Leaderboard';
import { exportSubmissionsToExcel } from '../../../utils/excelExport';
import { exportSubmissionsToPDF } from '../../../utils/pdfExport';
import './HeadDashboard.css';

// Head Create Test Component
function HeadCreateTest() {
  const [step, setStep] = useState(1);
  const [testData, setTestData] = useState({
    title: '',
    description: '',
    durationHours: 0,
    durationMinutes: 30,
    domain: 'DSA',
    password: '',
    totalMarks: 0
  });
  const [questions, setQuestions] = useState([]);
  const [qIndex, setQIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const { userDoc } = useFirebase();

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

  // Set domain based on head's assigned domain
  useEffect(() => {
    if (userDoc?.domain) {
      setTestData(prev => ({ ...prev, domain: userDoc.domain }));
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
      if (!testData.domain || testData.domain.trim() === '') {
        setError('Test domain is required');
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
        duration: testData.duration || '30 min',
        domain: testData.domain.trim(),
        password: testData.password?.trim() || 'test123',
        totalMarks: questions.reduce((sum, q) => sum + (q.marks || 1), 0),
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
      setTestData({ title: '', description: '', duration: '30 min', domain: 'Full Stack', password: '', totalMarks: 0 });
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
        <div className="domain-badge">
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
                onChange={(e) => setTestData({...testData, title: e.target.value})}
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
                onChange={(e) => setTestData({...testData, description: e.target.value})}
              />
              <div className="form-help">Optional: Provide context and instructions for candidates</div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Test Duration</label>
                <select
                  className="form-input"
                  value={testData.duration}
                  onChange={(e) => setTestData({...testData, duration: e.target.value})}
                >
                  <option value="30 min">30 minutes</option>
                  <option value="1h">1 hour</option>
                  <option value="1.5h">1.5 hours</option>
                  <option value="2h">2 hours</option>
                  <option value="3h">3 hours</option>
                </select>
                <div className="form-help">Select the time limit for completing the test</div>
              </div>
              
              <div className="form-group">
                <label>Domain</label>
                <input
                  type="text"
                  className="form-input readonly"
                  value={testData.domain}
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
                onChange={(e) => setTestData({...testData, password: e.target.value})}
              />
              <div className="form-help">Candidates will need this password to access the test</div>
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
                        <div className="image-error" style={{display: 'none'}}>
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
                      type="number"
                      className="form-input"
                      min="1"
                      max="100"
                      value={questions[qIndex].marks}
                      onChange={(e) => updateQuestion(questions[qIndex].id, 'marks', parseInt(e.target.value) || 1)}
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
    password: ''
  });
  const [editQuestions, setEditQuestions] = useState([]);
  const [editQIndex, setEditQIndex] = useState(0);
  const [editLoading, setEditLoading] = useState(false);
  const { userDoc } = useFirebase();

  useEffect(() => {
    const loadTests = async () => {
      setLoading(true);
      setError('');
      try {
        const testsRef = collection(db, 'tests');
        const q = query(testsRef, where('domain', '==', userDoc?.domain || 'Full Stack'));
        const snap = await getDocs(q);
        const testsData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setTests(testsData);
      } catch (e) {
        console.log('[Head:loadTests:error]', e.code, e.message);
        setError(e.message || 'Failed to load tests');
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
        setEditTestData({
          title: testData.title || '',
          description: testData.description || '',
          duration: testData.duration || '30 min',
          password: testData.password || ''
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
        <h3>Manage Tests</h3>
        <div className="domain-badge">
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
              <div className="test-info">
                <div>
                  <h4>{test.title}</h4>
                  <div className="test-meta">
                    {test.domain} • {test.duration} • {test.totalMarks} marks
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
                  className="btn btn-outline btn-sm"
                  onClick={() => debugCheckDatabase(test.id)}
                  style={{fontSize: '10px', padding: '2px 6px'}}
                >
                  🔍 Debug DB
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
            <div className="modal-header">
              <h3>Edit Test: {editingTest.title}</h3>
              <button className="modal-close" onClick={() => setEditingTest(null)}>×</button>
            </div>
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
                      onChange={(e) => setEditTestData({...editTestData, title: e.target.value})}
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label>Description</label>
                    <textarea
                      value={editTestData.description}
                      onChange={(e) => setEditTestData({...editTestData, description: e.target.value})}
                      className="form-textarea"
                      rows="3"
                    />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Duration</label>
                      <select
                        value={editTestData.duration}
                        onChange={(e) => setEditTestData({...editTestData, duration: e.target.value})}
                        className="form-select"
                      >
                        <option value="15 min">15 minutes</option>
                        <option value="30 min">30 minutes</option>
                        <option value="45 min">45 minutes</option>
                        <option value="60 min">1 hour</option>
                        <option value="90 min">1.5 hours</option>
                        <option value="120 min">2 hours</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Password</label>
                      <input
                        type="text"
                        value={editTestData.password}
                        onChange={(e) => setEditTestData({...editTestData, password: e.target.value})}
                        className="form-input"
                        placeholder="Optional test password"
                      />
                    </div>
                  </div>
                  <div className="modal-actions">
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
                                  <div className="image-error" style={{display: 'none'}}>
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
                            duration: editTestData.duration,
                            password: editTestData.password.trim(),
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
                              ? { ...t, ...editTestData, totalMarks } 
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
  const { userDoc } = useFirebase();

  useEffect(() => {
    const loadTests = async () => {
      setLoading(true);
      setError('');
      try {
        const testsRef = collection(db, 'tests');
        const testsQuery = query(testsRef, where('domain', '==', userDoc?.domain || 'Full Stack'));
        const testsSnap = await getDocs(testsQuery);
        const testsData = testsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setTests(testsData);
      } catch (e) {
        console.log('[Head:loadTests:error]', e.code, e.message);
        setError(e.message || 'Failed to load tests');
      } finally {
        setLoading(false);
      }
    };
    
    if (userDoc?.domain) {
      loadTests();
    }
  }, [userDoc?.domain]);

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
                
                console.log('DEBUG: Available name fields:', {
                  name: userData.name,
                  displayName: userData.displayName,
                  fullName: userData.fullName,
                  firstName: userData.firstName,
                  username: userData.username,
                  email: userData.email
                });
                
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
      
      setSubmissions(resultsData);
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

  // Export to Excel function
  const exportToExcel = async () => {
    await exportSubmissionsToExcel({
      submissions,
      selectedTest,
      setLoading
    });
  };

  // Export to PDF function
  const exportToPDF = async () => {
    await exportSubmissionsToPDF({
      submissions,
      selectedTest,
      setLoading,
      exportType: 'head'
    });
  };

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
          <div className="domain-badge">
            <span>Domain:</span>
            <span className="badge badge-primary">{userDoc?.domain || 'Full Stack'}</span>
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
                      {test.domain} • {test.duration} • {test.totalMarks} marks
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
          <div className="export-buttons">
            <button 
              className="btn btn-success btn-sm" 
              onClick={exportToExcel}
              disabled={loading || submissions.length === 0}
              title="Export to Excel"
            >
              📊 Excel
            </button>
            <button 
              className="btn btn-danger btn-sm" 
              onClick={exportToPDF}
              disabled={loading || submissions.length === 0}
              title="Export to PDF"
            >
              📄 PDF
            </button>
          </div>
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
                    <h4>Candidate Submission</h4>
                    <div className="candidate-name">
                      {displayName}
                    </div>
                    <div className="candidate-id">
                      ID: {result.candidateId || 'N/A'}
                    </div>
                    <div className="submission-date">
                      Submitted: {result.submittedAt?.toDate?.()?.toLocaleString() || 'Not submitted'}
                    </div>
                    <div className="submission-duration">
                      Duration: {result.timeTaken ? `${Math.round(result.timeTaken / 60)} minutes` : 'N/A'}
                    </div>
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

  const formatDateTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString();
  };

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
              <div className="question-text">
                {question.questionText || 'No question text'}
              </div>

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
                        className={`option ${
                          option === question.correctAnswer ? 'correct-option' : ''
                        } ${
                          option === question.candidateAnswer ? 'selected-option' : ''
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
  const [profileOpen, setProfileOpen] = useState(false);
  const { user, userDoc, loading: contextLoading } = useFirebase();
  const dropdownRef = useRef(null);

  const tabs = useMemo(() => [
    { label: 'Create Test', value: 'create' },
    { label: 'Manage Tests', value: 'manage' },
    { label: 'Results', value: 'results' },
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
          {activeTab === 'leaderboard' && <Leaderboard />}
        </div>
      </div>
    </div>
  );
}

export default HeadDashboard;
