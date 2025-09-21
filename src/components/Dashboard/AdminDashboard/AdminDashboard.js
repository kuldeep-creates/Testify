import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth, db } from '../../../firebase';
import { 
  collection, 
  onSnapshot, 
  query, 
  updateDoc, 
  doc, 
  serverTimestamp, 
  addDoc, 
  deleteDoc, 
  getDocs, 
  where,
  orderBy,
  limit,
  getDoc
} from 'firebase/firestore';
import { useFirebase } from '../../../context/FirebaseContext';
import './AdminDashboard.css';

// 1. Overview Section Component
function AdminOverview() {
  const [activeTests, setActiveTests] = useState([]);
  const [stats, setStats] = useState({
    activeTests: 0,
    completedTests: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribers = [];

    // Listen to all tests (active and inactive)
    const testsQuery = query(collection(db, 'tests'));
    const unsubTests = onSnapshot(testsQuery, async (snapshot) => {
      const testsData = await Promise.all(snapshot.docs.map(async (doc) => {
        const testData = { id: doc.id, ...doc.data() };
        
        // Get live participants for this test
        const liveParticipantsQuery = query(
          collection(db, 'results'),
          where('testId', '==', doc.id),
          where('status', 'in', ['in_progress', 'active'])
        );
        const liveParticipantsSnapshot = await getDocs(liveParticipantsQuery);
        
        // Get total submissions for this test
        const totalSubmissionsQuery = query(
          collection(db, 'results'),
          where('testId', '==', doc.id)
        );
        const totalSubmissionsSnapshot = await getDocs(totalSubmissionsQuery);
        
        return {
          ...testData,
          liveParticipantCount: liveParticipantsSnapshot.size,
          totalSubmissions: totalSubmissionsSnapshot.size
        };
      }));
      
      setActiveTests(testsData);
      const activeCount = testsData.filter(test => test.status === 'active').length;
      setStats(prev => ({ ...prev, activeTests: activeCount }));
    });
    unsubscribers.push(unsubTests);

    // No longer listening to users or live participants

    setLoading(false);

    return () => unsubscribers.forEach(unsub => unsub());
  }, []);

  const formatDateTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString();
  };

  if (loading) return <div className="loading">Loading overview...</div>;

  return (
    <div className="admin-overview">
      <div className="overview-header">
        <h2>System Overview</h2>
        <p>Real-time snapshot of your testing platform</p>
      </div>

      {/* Stats Cards */}
      <div className="overview-stats">
        <div className="stat-card">
          <div className="stat-icon">📝</div>
          <div className="stat-content">
            <h3>Active Tests</h3>
            <p className="stat-number">{stats.activeTests}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">✅</div>
          <div className="stat-content">
            <h3>Completed Tests</h3>
            <p className="stat-number">{stats.completedTests}</p>
          </div>
        </div>
      </div>

      {/* All Tests Section */}
      <div className="active-tests-section">
        <h3>All Tests Overview</h3>
        {activeTests.length === 0 ? (
          <div className="no-active-tests">
            <div className="no-tests-icon">📚</div>
            <p>No tests available at the moment</p>
          </div>
        ) : (
          <div className="active-tests-grid">
            {activeTests.map(test => (
              <div key={test.id} className={`active-test-card ${test.status === 'active' ? 'test-active' : 'test-inactive'}`}>
                <div className="test-header">
                  <h4>{test.title}</h4>
                  <span className={`badge ${test.status === 'active' ? 'badge-success' : 'badge-neutral'}`}>
                    {test.status === 'active' ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="test-details">
                  <div className="test-meta">
                    <div className="meta-row">
                      <span className="meta-item">
                        <span className="meta-icon">🎯</span>
                        <span className="meta-label">Domain:</span>
                        <span className="meta-value">{test.domain||'General'}</span>
                      </span>
                      <span className="meta-item">
                        <span className="meta-icon">⏱️</span>
                        <span className="meta-label">Duration:</span>
                        <span className="meta-value">{test.duration || '60 mins'}</span>
                      </span>
                    </div>
                    <div className="meta-row">
                      <span className="meta-item">
                        <span className="meta-icon">📅</span>
                        <span className="meta-label">Starts:</span>
                        <span className="meta-value">{formatDateTime(test.startTime || test.createdAt)}</span>
                      </span>
                      <span className="meta-item">
                        <span className="meta-icon">📊</span>
                        <span className="meta-label">Submissions:</span>
                        <span className="meta-value">{test.totalSubmissions || 0}</span>
                      </span>
                    </div>
                  </div>
                </div>
                
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

// 2. Users Section Component
function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const { user: currentUser } = useFirebase();
  const usersPerPage = 10;

  // Check if current user can perform admin actions
  const canPerformAdminActions = currentUser?.email?.toLowerCase() === 'mrjaaduji@gmail.com' || 
    currentUser?.role === 'admin';

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const usersRef = collection(db, 'user');
        const q = query(usersRef);
        const querySnapshot = await getDocs(q);
        
        const usersData = [];
        querySnapshot.forEach((doc) => {
          usersData.push({
            id: doc.id,
            ...doc.data()
          });
        });
        
        setUsers(usersData);
        setLoading(false);
        console.log('Users loaded successfully:', usersData.length);
      } catch (err) {
        console.error('Error loading users:', err);
        setError(`Failed to load users: ${err.message}`);
        setLoading(false);
      }
    };

    fetchUsers();
    
    // Set up real-time listener
    const usersRef = collection(db, 'user');
    const unsubscribe = onSnapshot(usersRef, (snapshot) => {
      const usersData = [];
      snapshot.forEach((doc) => {
        usersData.push({
          id: doc.id,
          ...doc.data()
        });
      });
      setUsers(usersData);
    });

    return () => unsubscribe();
  }, []);

  const handleRoleChange = async (userId, newRole, newDomain = null) => {
    if (!canPerformAdminActions) {
      alert('You do not have permission to change user roles');
      return;
    }

    try {
      const userRef = doc(db, 'user', userId);
      const updateData = { 
        role: newRole,
        updatedAt: serverTimestamp()
      };
      
      if (newRole === 'head' && newDomain) {
        updateData.domain = newDomain;
      } else if (newRole !== 'head') {
        updateData.domain = null;
      }

      await updateDoc(userRef, updateData);
    } catch (err) {
      console.error('Error updating user role:', err);
      setError('Failed to update user role: ' + err.message);
    }
  };

  const handleBlockToggle = async (userId, currentBlocked) => {
    if (!canPerformAdminActions) {
      alert('You do not have permission to block/unblock users');
      return;
    }

    try {
      const userRef = doc(db, 'user', userId);
      await updateDoc(userRef, {
        blocked: !currentBlocked,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error('Error updating user status:', err);
      setError('Failed to update user status: ' + err.message);
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = filterRole === 'all' || user.role === filterRole;
    const matchesStatus = filterStatus === 'all' || 
      (filterStatus === 'active' && !user.blocked) ||
      (filterStatus === 'blocked' && user.blocked);
    
    return matchesSearch && matchesRole && matchesStatus;
  });

  const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
  const startIndex = (currentPage - 1) * usersPerPage;
  const currentUsers = filteredUsers.slice(startIndex, startIndex + usersPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterRole, filterStatus]);

  if (loading) return <div className="loading">Loading users...</div>;
  
  if (error) {
    return (
      <div className="admin-users">
        <div className="users-header">
          <h2>User Management</h2>
          <p>Manage user roles, domains, and access permissions</p>
        </div>
        <div className="error-container">
          <div className="error">
            <h3>⚠️ Error Loading Users</h3>
            <p>{error}</p>
            <div className="error-help">
              <h4>Possible Solutions:</h4>
              <ul>
                <li>Check your Firebase connection</li>
                <li>Verify Firestore security rules allow reading the 'users' collection</li>
                <li>The 'users' collection might not exist yet - it will be created when the first user signs up</li>
                <li>Check the browser console for more detailed error information</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-users">
      <div className="users-header">
        <h2>User Management</h2>
        <p>Manage user roles, domains, and access permissions</p>
      </div>

      {/* Filters and Search */}
      <div className="users-controls">
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
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Roles</option>
            <option value="candidate">Candidates</option>
            <option value="head">Heads</option>
            <option value="admin">Admins</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="blocked">Blocked</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      {users.length === 0 ? (
        <div className="no-users">
          <div className="no-users-icon">👥</div>
          <h3>No Users Found</h3>
          <p>The users collection is empty or doesn't exist yet.</p>
          <div className="no-users-help">
            <p><strong>This is normal if:</strong></p>
            <ul>
              <li>This is a new installation</li>
              <li>No users have signed up yet</li>
              <li>Users are stored in Firebase Auth but not in Firestore</li>
            </ul>
            <p>Users will appear here once they sign up and their data is stored in Firestore.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="users-table-container">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Domain</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentUsers.map(user => (
                  <tr key={user.id}>
                    <td>
                      <div className="user-info">
                        <span className="user-name">{user.name || 'N/A'}</span>
                        <span className="user-id">ID: {user.id.slice(0, 8)}...</span>
                      </div>
                    </td>
                    <td>{user.email}</td>
                    <td>
                      <RoleSelector 
                        user={user}
                        onRoleChange={handleRoleChange}
                        canEdit={canPerformAdminActions}
                      />
                    </td>
                    <td>
                      <DomainSelector 
                        user={user}
                        onRoleChange={handleRoleChange}
                        canEdit={canPerformAdminActions}
                      />
                    </td>
                    <td>
                      <span className={`badge ${user.blocked ? 'badge-error' : 'badge-success'}`}>
                        {user.blocked ? 'Blocked' : 'Active'}
                      </span>
                    </td>
                    <td>
                      <div className="user-actions">
                        <button
                          className={`btn btn-sm ${user.blocked ? 'btn-success' : 'btn-danger'}`}
                          onClick={() => handleBlockToggle(user.id, user.blocked)}
                          disabled={!canPerformAdminActions}
                          title={user.blocked ? 'Unblock user' : 'Block user'}
                        >
                          {user.blocked ? '🔓' : '🔒'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination">
              <button
                className="btn btn-outline"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(currentPage - 1)}
              >
                Previous
              </button>
              <span className="page-info">
                Page {currentPage} of {totalPages} ({filteredUsers.length} users)
              </span>
              <button
                className="btn btn-outline"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(currentPage + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Permission Notice */}
      {!canPerformAdminActions && (
        <div className="permission-notice">
          <span className="notice-icon">⚠️</span>
          <span>You have read-only access. Contact mrjaaduji@gmail.com for admin permissions.</span>
        </div>
      )}
    </div>
  );
}

// Role Selector Component
function RoleSelector({ user, onRoleChange, canEdit }) {
  const [isEditing, setIsEditing] = useState(false);
  const [selectedRole, setSelectedRole] = useState(user.role || 'candidate');

  const handleRoleSubmit = () => {
    if (selectedRole !== user.role) {
      onRoleChange(user.id, selectedRole);
    }
    setIsEditing(false);
  };

  if (!canEdit) {
    return (
      <span className={`badge badge-${user.role || 'candidate'}`}>
        {(user.role || 'candidate').charAt(0).toUpperCase() + (user.role || 'candidate').slice(1)}
      </span>
    );
  }

  if (isEditing) {
    return (
      <div className="role-editor">
        <select
          value={selectedRole}
          onChange={(e) => setSelectedRole(e.target.value)}
          className="role-select"
        >
          <option value="candidate">Candidate</option>
          <option value="head">Head</option>
          <option value="admin">Admin</option>
        </select>
        <div className="role-actions">
          <button className="btn btn-sm btn-primary" onClick={handleRoleSubmit}>✓</button>
          <button className="btn btn-sm btn-outline" onClick={() => setIsEditing(false)}>✗</button>
        </div>
      </div>
    );
  }

  return (
    <div className="role-display" onClick={() => setIsEditing(true)}>
      <span className={`badge badge-${user.role || 'candidate'}`}>
        {(user.role || 'candidate').charAt(0).toUpperCase() + (user.role || 'candidate').slice(1)}
      </span>
      <span className="edit-hint">Click to edit</span>
    </div>
  );
}

// Domain Selector Component
function DomainSelector({ user, onRoleChange, canEdit }) {
  const [isEditing, setIsEditing] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState(user.domain || '');

  const domains = ['DSA', 'Fullstack', 'Java', 'Data Science'];

  const handleDomainSubmit = () => {
    if (user.role === 'head') {
      onRoleChange(user.id, 'head', selectedDomain);
    }
    setIsEditing(false);
  };

  if (user.role !== 'head') {
    return <span className="text-muted">-</span>;
  }

  if (!canEdit) {
    return (
      <span className="badge badge-primary">
        {user.domain || 'No domain'}
      </span>
    );
  }

  if (isEditing) {
    return (
      <div className="domain-editor">
        <select
          value={selectedDomain}
          onChange={(e) => setSelectedDomain(e.target.value)}
          className="domain-select"
        >
          <option value="">Select Domain</option>
          {domains.map(domain => (
            <option key={domain} value={domain}>{domain}</option>
          ))}
        </select>
        <div className="domain-actions">
          <button className="btn btn-sm btn-primary" onClick={handleDomainSubmit}>✓</button>
          <button className="btn btn-sm btn-outline" onClick={() => setIsEditing(false)}>✗</button>
        </div>
      </div>
    );
  }

  return (
    <div className="domain-display" onClick={() => setIsEditing(true)}>
      <span className="badge badge-primary">
        {user.domain || 'No domain'}
      </span>
      <span className="edit-hint">Click to edit</span>
    </div>
  );
}

// 3. Tests Section Component
function AdminTests() {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDomain, setFilterDomain] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedTest, setSelectedTest] = useState(null);
  const [showSubmissions, setShowSubmissions] = useState(false);
  const [submissions, setSubmissions] = useState([]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'tests'), 
      (snapshot) => {
        const testsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setTests(testsData);
        setLoading(false);
      },
      (err) => {
        setError('Failed to load tests');
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  const loadSubmissions = async (testId) => {
    try {
      const submissionsQuery = query(
        collection(db, 'results'), 
        where('testId', '==', testId)
      );
      const snapshot = await getDocs(submissionsQuery);
      const submissionsData = await Promise.all(snapshot.docs.map(async (resultDoc) => {
        const submissionData = { id: resultDoc.id, ...resultDoc.data() };
        
        // Process candidate name - handle emails stored in candidateName field
        if (submissionData.candidateName && submissionData.candidateName.includes('@')) {
          // If candidateName is an email, extract the username part
          submissionData.candidateName = submissionData.candidateName.split('@')[0];
        } else if (submissionData.candidateId) {
          // Try to get better name from user database
          try {
            // Try to get user by Firebase UID
            let userDoc = await getDoc(doc(db, 'user', submissionData.candidateId));
            
            if (userDoc.exists()) {
              const userData = userDoc.data();
              
              // Use the best available name
              if (userData.name) {
                submissionData.candidateName = userData.name;
              } else if (userData.displayName) {
                submissionData.candidateName = userData.displayName;
              } else if (userData.fullName) {
                submissionData.candidateName = userData.fullName;
              } else if (userData.firstName) {
                submissionData.candidateName = userData.firstName;
              } else if (userData.email) {
                // If we have email, extract the prefix
                submissionData.candidateName = userData.email.includes('@') ? userData.email.split('@')[0] : userData.email;
              }
            } else {
              // Fallback to using last 4 chars of UID
              submissionData.candidateName = `Candidate ${submissionData.candidateId.slice(-4)}`;
            }
          } catch (error) {
            console.error('Error fetching candidate name:', error);
            // Fallback to using last 4 chars of UID
            submissionData.candidateName = `Candidate ${submissionData.candidateId.slice(-4)}`;
          }
        }
        
        // Final fallback
        if (!submissionData.candidateName) {
          submissionData.candidateName = 'Unknown';
        }
        
        return submissionData;
      }));
      setSubmissions(submissionsData);
    } catch (err) {
      setError('Failed to load submissions');
    }
  };

  const viewTestPaper = (test) => {
    setSelectedTest(test);
    setShowSubmissions(false);
  };

  const viewSubmissions = (test) => {
    setSelectedTest(test);
    setShowSubmissions(true);
    loadSubmissions(test.id);
  };

  const filteredTests = tests.filter(test => {
    const matchesSearch = test.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      test.domain?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDomain = filterDomain === 'all' || test.domain === filterDomain;
    const matchesStatus = filterStatus === 'all' || test.status === filterStatus;
    
    return matchesSearch && matchesDomain && matchesStatus;
  });

  const formatDateTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString();
  };

  if (loading) return <div className="loading">Loading tests...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  if (selectedTest && !showSubmissions) {
    return <TestPaperView test={selectedTest} onBack={() => setSelectedTest(null)} />;
  }

  if (selectedTest && showSubmissions) {
    return (
      <TestSubmissionsView 
        test={selectedTest} 
        submissions={submissions}
        onBack={() => setSelectedTest(null)} 
      />
    );
  }

  return (
    <div className="admin-tests">
      <div className="tests-header">
        <h2>Test Management</h2>
        <p>Manage all tests, view papers, and monitor submissions</p>
      </div>

      {/* Filters and Search */}
      <div className="tests-controls">
        <div className="search-container">
          <input
            type="text"
            placeholder="Search tests..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="filters">
          <select
            value={filterDomain}
            onChange={(e) => setFilterDomain(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Domains</option>
            <option value="DSA">DSA</option>
            <option value="Fullstack">Fullstack</option>
            <option value="Java">Java</option>
            <option value="Data Science">Data Science</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Tests Table */}
      <div className="tests-table-container">
        <table className="tests-table">
          <thead>
            <tr>
              <th>Test Name</th>
              <th>Domain</th>
              <th>Status</th>
              <th>Created</th>
              <th>Participants</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredTests.map(test => (
              <tr key={test.id}>
                <td>
                  <div className="test-info">
                    <span className="test-name">{test.title}</span>
                    <span className="test-duration">{test.duration || '60 minutes'}</span>
                  </div>
                </td>
                <td>
                  <span className="badge badge-primary">{test.domain}</span>
                </td>
                <td>
                  <span className={`badge ${test.status === 'active' ? 'badge-success' : 'badge-neutral'}`}>
                    {test.status || 'inactive'}
                  </span>
                </td>
                <td>{formatDateTime(test.createdAt)}</td>
                <td>
                  <span className="participant-count">
                    {test.participantCount || 0} participants
                  </span>
                </td>
                <td>
                  <div className="test-actions">
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => viewTestPaper(test)}
                      title="View Test Paper"
                    >
                      📄 Paper
                    </button>
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => viewSubmissions(test)}
                      title="View Submissions"
                    >
                      📊 Submissions
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredTests.length === 0 && (
        <div className="no-tests">
          <div className="no-tests-icon">📝</div>
          <h3>No Tests Found</h3>
          <p>No tests match your current filters</p>
        </div>
      )}
    </div>
  );
}

// Test Paper View Component
function TestPaperView({ test, onBack }) {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadQuestions = async () => {
      try {
        const questionsQuery = query(
          collection(db, 'questions'),
          where('testId', '==', test.id)
        );
        const snapshot = await getDocs(questionsQuery);
        const questionsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setQuestions(questionsData);
        setLoading(false);
      } catch (err) {
        console.error('Failed to load questions:', err);
        setLoading(false);
      }
    };

    loadQuestions();
  }, [test.id]);

  if (loading) return <div className="loading">Loading test paper...</div>;

  return (
    <div className="test-paper-view">
      <div className="paper-header">
        <button className="btn btn-outline" onClick={onBack}>← Back to Tests</button>
        <div className="paper-info">
          <h2>{test.title}</h2>
          <div className="paper-meta">
            <span>Domain: {test.domain}</span>
            <span>Duration: {test.duration || '60 minutes'}</span>
            <span>Total Marks: {test.totalMarks || 'N/A'}</span>
          </div>
        </div>
      </div>

      <div className="questions-list">
        {questions.map((question, index) => (
          <div key={question.id} className="question-card">
            <div className="question-header">
              <span className="question-number">Q{index + 1}</span>
              <span className="question-marks">{question.marks || 1} marks</span>
            </div>
            <div className="question-content">
              <p className="question-text">{question.text}</p>
              {question.type === 'mcq' && question.options && (
                <div className="question-options">
                  {question.options.map((option, optIndex) => (
                    <div key={optIndex} className="option">
                      <span className="option-label">{String.fromCharCode(65 + optIndex)}.</span>
                      <span className="option-text">{option}</span>
                    </div>
                  ))}
                  <div className="correct-answer">
                    <strong>Correct Answer: {question.correctAnswer}</strong>
                  </div>
                </div>
              )}
              {question.type === 'coding' && (
                <div className="coding-question">
                  <div className="expected-solution">
                    <strong>Expected Solution:</strong>
                    <pre>{question.expectedAnswer}</pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {questions.length === 0 && (
        <div className="no-questions">
          <p>No questions found for this test</p>
        </div>
      )}
    </div>
  );
}

// Test Submissions View Component
function TestSubmissionsView({ test, submissions, onBack }) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSubmissions = submissions.filter(submission =>
    submission.candidateId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    submission.candidateName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDateTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString();
  };

  return (
    <div className="test-submissions-view">
      <div className="submissions-header">
        <button className="btn btn-outline" onClick={onBack}>← Back to Tests</button>
        <div className="submissions-info">
          <h2>Submissions: {test.title}</h2>
          <p>{submissions.length} total submissions</p>
        </div>
      </div>

      <div className="submissions-controls">
        <input
          type="text"
          placeholder="Search by candidate ID or name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
      </div>

      <div className="submissions-table-container">
        <table className="submissions-table">
          <thead>
            <tr>
              <th>Candidate</th>
              <th>Submission Time</th>
              <th>Score</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredSubmissions.map(submission => (
              <tr key={submission.id}>
                <td>
                  <div className="candidate-info">
                    <span className="candidate-name">{submission.candidateName || 'Unknown'}</span>
                  </div>
                </td>
                <td>{formatDateTime(submission.submittedAt)}</td>
                <td>
                  <span className="score">
                    {submission.score !== undefined ? `${submission.score}/100` : 'Not graded'}
                  </span>
                </td>
                <td>
                  <span className={`badge ${submission.status === 'evaluated' ? 'badge-success' : 'badge-warning'}`}>
                    {submission.status || 'submitted'}
                  </span>
                </td>
                <td>
                  <button className="btn btn-sm btn-outline" title="View Details">
                    👁️ View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredSubmissions.length === 0 && (
        <div className="no-submissions">
          <div className="no-submissions-icon">📊</div>
          <h3>No Submissions Found</h3>
          <p>No submissions match your search criteria</p>
        </div>
      )}
    </div>
  );
}

// 4. Monitoring Section Component
function AdminMonitoring() {
  const [tests, setTests] = useState([]);
  const [selectedTest, setSelectedTest] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [selectedParticipant, setSelectedParticipant] = useState(null);
  const [monitoringData, setMonitoringData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'tests'), 
      (snapshot) => {
        const testsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setTests(testsData);
        setLoading(false);
      },
      (err) => {
        setError('Failed to load tests');
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  const loadParticipants = async (testId) => {
    try {
      const participantsQuery = query(
        collection(db, 'results'),
        where('testId', '==', testId)
      );
      const snapshot = await getDocs(participantsQuery);
      const participantsData = await Promise.all(snapshot.docs.map(async (resultDoc) => {
        const participantData = { id: resultDoc.id, ...resultDoc.data() };
        
        // Process candidate name - handle emails stored in candidateName field
        if (participantData.candidateName && participantData.candidateName.includes('@')) {
          // If candidateName is an email, extract the username part
          participantData.candidateName = participantData.candidateName.split('@')[0];
        } else if (participantData.candidateId) {
          // Try to get better name from user database
          try {
            // Try to get user by Firebase UID
            let userDoc = await getDoc(doc(db, 'user', participantData.candidateId));
            
            if (userDoc.exists()) {
              const userData = userDoc.data();
              
              // Use the best available name
              if (userData.name) {
                participantData.candidateName = userData.name;
              } else if (userData.displayName) {
                participantData.candidateName = userData.displayName;
              } else if (userData.fullName) {
                participantData.candidateName = userData.fullName;
              } else if (userData.firstName) {
                participantData.candidateName = userData.firstName;
              } else if (userData.email) {
                // If we have email, extract the prefix
                participantData.candidateName = userData.email.includes('@') ? userData.email.split('@')[0] : userData.email;
              }
            } else {
              // Fallback to using last 4 chars of UID
              participantData.candidateName = `Candidate ${participantData.candidateId.slice(-4)}`;
            }
          } catch (error) {
            console.error('Error fetching candidate name:', error);
            // Fallback to using last 4 chars of UID
            participantData.candidateName = `Candidate ${participantData.candidateId.slice(-4)}`;
          }
        }
        
        // Final fallback
        if (!participantData.candidateName) {
          participantData.candidateName = 'Unknown';
        }
        
        return participantData;
      }));
      setParticipants(participantsData);
    } catch (err) {
      setError('Failed to load participants');
    }
  };

  const loadMonitoringData = async (candidateId, testId) => {
    try {
      const monitoringQuery = query(
        collection(db, 'monitoring'),
        where('candidateId', '==', candidateId),
        where('testId', '==', testId)
      );
      const snapshot = await getDocs(monitoringQuery);
      const monitoringData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setMonitoringData(monitoringData);
    } catch (err) {
      setError('Failed to load monitoring data');
    }
  };

  const selectTest = (test) => {
    setSelectedTest(test);
    setSelectedParticipant(null);
    loadParticipants(test.id);
  };

  const selectParticipant = (participant) => {
    setSelectedParticipant(participant);
    loadMonitoringData(participant.candidateId, selectedTest.id);
  };

  const getSuspiciousActivityCount = (participant) => {
    const tabSwitches = participant.tabSwitchCount || 0;
    const copyEvents = participant.copyEvents?.length || 0;
    const pasteEvents = participant.pasteEvents?.length || 0;
    return tabSwitches + copyEvents + pasteEvents;
  };

  const isSuspicious = (participant) => {
    return getSuspiciousActivityCount(participant) > 5;
  };

  if (loading) return <div className="loading">Loading monitoring data...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  // Participant Detail View
  if (selectedParticipant) {
    return (
      <ParticipantDetailView 
        participant={selectedParticipant}
        test={selectedTest}
        monitoringData={monitoringData}
        onBack={() => setSelectedParticipant(null)}
      />
    );
  }

  // Participants List View
  if (selectedTest) {
    return (
      <div className="participants-monitoring">
        <div className="monitoring-header">
          <button className="btn btn-outline" onClick={() => setSelectedTest(null)}>
            ← Back to Tests
          </button>
          <div className="test-info">
            <h2>Monitoring: {selectedTest.title}</h2>
            <p>{participants.length} participants being monitored</p>
          </div>
        </div>

        <div className="participants-table-container">
          <table className="participants-table">
            <thead>
              <tr>
                <th>Participant</th>
                <th>Status</th>
                <th>Tab Switches</th>
                <th>Copy Events</th>
                <th>Paste Events</th>
                <th>Risk Level</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {participants.map(participant => (
                <tr 
                  key={participant.id} 
                  className={isSuspicious(participant) ? 'suspicious-row' : ''}
                >
                  <td>
                    <div className="participant-info">
                      <span className="participant-name">{participant.candidateName || 'Unknown'}</span>
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${participant.blocked ? 'badge-error' : 'badge-success'}`}>
                      {participant.blocked ? 'Blocked' : 'Active'}
                    </span>
                  </td>
                  <td>
                    <span className={`activity-count ${(participant.tabSwitchCount || 0) > 3 ? 'high' : ''}`}>
                      {participant.tabSwitchCount || 0}
                    </span>
                  </td>
                  <td>
                    <span className={`activity-count ${(participant.copyEvents?.length || 0) > 2 ? 'high' : ''}`}>
                      {participant.copyEvents?.length || 0}
                    </span>
                  </td>
                  <td>
                    <span className={`activity-count ${(participant.pasteEvents?.length || 0) > 2 ? 'high' : ''}`}>
                      {participant.pasteEvents?.length || 0}
                    </span>
                  </td>
                  <td>
                    <span className={`risk-level ${isSuspicious(participant) ? 'high' : 'low'}`}>
                      {isSuspicious(participant) ? '🔴 High' : '🟢 Low'}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => selectParticipant(participant)}
                      title="View Details"
                    >
                      👁️ Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {participants.length === 0 && (
          <div className="no-participants">
            <div className="no-participants-icon">👥</div>
            <h3>No Participants</h3>
            <p>No participants found for this test</p>
          </div>
        )}
      </div>
    );
  }

  // Tests Overview
  return (
    <div className="admin-monitoring">
      <div className="monitoring-header">
        <h2>Real-time Monitoring</h2>
        <p>Monitor test participants and detect suspicious activities</p>
      </div>

      <div className="tests-monitoring-grid">
        {tests.map(test => (
          <div 
            key={test.id} 
            className="test-monitoring-card"
            onClick={() => selectTest(test)}
          >
            <div className="test-header">
              <h3>{test.title}</h3>
              <span className={`badge ${test.status === 'active' ? 'badge-success' : 'badge-neutral'}`}>
                {test.status || 'inactive'}
              </span>
            </div>
            <div className="test-details">
              <div className="test-meta">
                <span>Domain: {test.domain}</span>
                <span>Participants: {test.participantCount || 0}</span>
              </div>
              <div className="monitoring-stats">
                <span className="stat">
                  <span className="stat-icon">👁️</span>
                  <span>Click to monitor</span>
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {tests.length === 0 && (
        <div className="no-tests">
          <div className="no-tests-icon">📝</div>
          <h3>No Tests Available</h3>
          <p>No tests available for monitoring</p>
        </div>
      )}
    </div>
  );
}

// Participant Detail View Component
function ParticipantDetailView({ participant, test, monitoringData, onBack }) {
  const [activeTab, setActiveTab] = useState('overview');

  const formatDateTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString();
  };

  const tabSwitches = participant.tabSwitches || [];
  const copyEvents = participant.copyEvents || [];
  const pasteEvents = participant.pasteEvents || [];

  return (
    <div className="participant-detail-view">
      <div className="detail-header">
        <button className="btn btn-outline" onClick={onBack}>
          ← Back to Participants
        </button>
        <div className="participant-info">
          <h2>Participant: {participant.candidateName || 'Unknown'}</h2>
          <p>Test: {test.title}</p>
        </div>
      </div>

      <div className="detail-tabs">
        <button 
          className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button 
          className={`tab ${activeTab === 'tabswitches' ? 'active' : ''}`}
          onClick={() => setActiveTab('tabswitches')}
        >
          Tab Switches ({tabSwitches.length})
        </button>
        <button 
          className={`tab ${activeTab === 'copy' ? 'active' : ''}`}
          onClick={() => setActiveTab('copy')}
        >
          Copy Events ({copyEvents.length})
        </button>
        <button 
          className={`tab ${activeTab === 'paste' ? 'active' : ''}`}
          onClick={() => setActiveTab('paste')}
        >
          Paste Events ({pasteEvents.length})
        </button>
      </div>

      <div className="detail-content">
        {activeTab === 'overview' && (
          <div className="overview-tab">
            <div className="activity-summary">
              <div className="summary-card">
                <h3>Activity Summary</h3>
                <div className="summary-stats">
                  <div className="stat-item">
                    <span className="stat-label">Tab Switches:</span>
                    <span className="stat-value">{tabSwitches.length}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Copy Events:</span>
                    <span className="stat-value">{copyEvents.length}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Paste Events:</span>
                    <span className="stat-value">{pasteEvents.length}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Status:</span>
                    <span className={`badge ${participant.blocked ? 'badge-error' : 'badge-success'}`}>
                      {participant.blocked ? 'Blocked' : 'Active'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'tabswitches' && (
          <div className="tabswitches-tab">
            <h3>Tab Switch Events</h3>
            {tabSwitches.length === 0 ? (
              <p>No tab switch events recorded</p>
            ) : (
              <div className="events-list">
                {tabSwitches.map((event, index) => (
                  <div key={index} className="event-item">
                    <span className="event-time">{formatDateTime(event.timestamp)}</span>
                    <span className="event-description">Tab switched away from test</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'copy' && (
          <div className="copy-tab">
            <h3>Copy Events</h3>
            {copyEvents.length === 0 ? (
              <p>No copy events recorded</p>
            ) : (
              <div className="events-list">
                {copyEvents.map((event, index) => (
                  <div key={index} className="event-item">
                    <span className="event-time">{formatDateTime(event.timestamp)}</span>
                    <div className="event-content">
                      <span className="event-description">Content copied:</span>
                      <pre className="copied-content">{event.content}</pre>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'paste' && (
          <div className="paste-tab">
            <h3>Paste Events</h3>
            {pasteEvents.length === 0 ? (
              <p>No paste events recorded</p>
            ) : (
              <div className="events-list">
                {pasteEvents.map((event, index) => (
                  <div key={index} className="event-item">
                    <span className="event-time">{formatDateTime(event.timestamp)}</span>
                    <div className="event-content">
                      <span className="event-description">Content pasted in {event.field}:</span>
                      <pre className="pasted-content">{event.content}</pre>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Main AdminDashboard Component
function AdminDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const { user, userDoc, loading: contextLoading } = useFirebase();

  const tabs = useMemo(() => [
    { label: 'Overview', value: 'overview' },
    { label: 'Users', value: 'users' },
    { label: 'Tests', value: 'tests' },
    { label: 'Monitoring', value: 'monitoring' },
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
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="admin-dashboard theme-admin">
      <div className="dashboard-header">
        <div className="header-content">
          <div className="user-info">
            <h1>Admin Dashboard</h1>
            <span className="badge badge-admin">Administrator</span>
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
          {activeTab === 'overview' && <AdminOverview />}
          {activeTab === 'users' && <AdminUsers />}
          {activeTab === 'tests' && <AdminTests />}
          {activeTab === 'monitoring' && <AdminMonitoring />}
        </div>
      </div>
    </div>
  );
}

export default AdminDashboard;
