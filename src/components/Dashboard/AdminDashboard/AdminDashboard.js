import { signOut } from 'firebase/auth';
import { collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { appConfig } from '../../../config/environment';
import { useFirebase } from '../../../context/FirebaseContext';
import { auth, db } from '../../../firebase';
import { formatDateTime } from '../../../utils/dateUtils';
import { exportSubmissionsToExcel } from '../../../utils/excelExport';
import { exportSubmissionsToPDF } from '../../../utils/pdfExport';
import Icon from '../../icons/Icon';
import Leaderboard from '../../Leaderboard/Leaderboard';
import Loading from '../../Loading/Loading';
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

  if (loading) {return (
    <div className="loading-tests">
      <Loading message="Loading overview" subtext="Gathering system statistics and data" variant="inline" size="large" />
    </div>
  );}

  return (
    <div className="admin-overview">
      <div className="overview-header">
        <h2>System Overview</h2>
        <p>Real-time snapshot of your testing platform</p>
      </div>

      {/* Stats Cards */}
      <div className="overview-stats">
        <div className="stat-card">
          <div className="stat-icon"><Icon name="leaderboard" size="xl" /></div>
          <div className="stat-content">
            <h3>Active Tests</h3>
            <p className="stat-number">{stats.activeTests}</p>
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
  const [sortOrder, setSortOrder] = useState('oldest'); // 'newest' or 'oldest'
  const [currentPage, setCurrentPage] = useState(1);
  const { user: currentUser, userDoc } = useFirebase();
  const usersPerPage = 10;
  // User details view state
  const [selectedUser, setSelectedUser] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [userDetails, setUserDetails] = useState({
    submissions: [],
    pasteLogs: [],
    tabSwitchLogs: [],
  });

  // Check if current user can perform admin actions
  const canPerformAdminActions = currentUser?.email?.toLowerCase() === appConfig.superAdminEmail.toLowerCase() ||
    userDoc?.role === 'admin';

  useEffect(() => {
    const fetchUsers = async (retryCount = 0) => {
      try {
        const usersRef = collection(db, 'user');
        const q = query(usersRef);
        const querySnapshot = await getDocs(q);

        const usersData = [];
        querySnapshot.forEach((doc) => {
          const userData = { id: doc.id, ...doc.data() };
          // Filter out specific admin user
          if (userData.email !== appConfig.superAdminEmail) {
            usersData.push(userData);
          }
        });

        // Sort users by creation time (oldest first)
        usersData.sort((a, b) => {
          const timeA = a.createdAt?.toDate?.() ? a.createdAt.toDate().getTime() : 0;
          const timeB = b.createdAt?.toDate?.() ? b.createdAt.toDate().getTime() : 0;
          return timeA - timeB;
        });

        setUsers(usersData);
        setLoading(false);
      } catch (err) {
        console.error('Error loading users:', err);
        
        // Retry on network errors
        if (retryCount < 3 && (err.code === 'unavailable' || err.message?.includes('QUIC') || err.message?.includes('network'))) {
          console.log(`Retrying... Attempt ${retryCount + 1}/3`);
          setTimeout(() => fetchUsers(retryCount + 1), 1000 * (retryCount + 1));
        } else {
          setError(`Failed to load users: ${err.message}`);
          setLoading(false);
        }
      }
    };

    fetchUsers();

    // Set up real-time listener
    const usersRef = collection(db, 'user');
    const unsubscribe = onSnapshot(usersRef, (snapshot) => {
      const usersData = [];
      snapshot.forEach((doc) => {
        const userData = { id: doc.id, ...doc.data() };
        // Filter out specific admin user
        if (userData.email !== appConfig.superAdminEmail) {
          usersData.push(userData);
        }
      });

      // Sort users by creation time (oldest first)
      usersData.sort((a, b) => {
        const timeA = a.createdAt?.toDate?.() ? a.createdAt.toDate().getTime() : 0;
        const timeB = b.createdAt?.toDate?.() ? b.createdAt.toDate().getTime() : 0;
        return timeA - timeB;
      });

      setUsers(usersData);
    });

    return () => unsubscribe();
  }, []);

  const handleApproval = async (userId, approved) => {
    if (!canPerformAdminActions) {
      alert('You do not have permission to approve users');
      return;
    }

    try {
      const userRef = doc(db, 'user', userId);
      await updateDoc(userRef, {
        approved: approved,
        approvedAt: serverTimestamp(),
        approvedBy: currentUser?.email
      });
      alert(approved ? 'User approved successfully!' : 'User approval revoked!');
    } catch (error) {
      console.error('Error updating approval status:', error);
      alert('Failed to update approval status: ' + error.message);
    }
  };

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
      
      // Auto-approve admin and head roles
      if (newRole === 'admin' || newRole === 'head') {
        updateData.approved = true;
        updateData.approvedAt = serverTimestamp();
        updateData.approvedBy = currentUser?.email;
      }
      
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

  // Open user details and fetch related data
  const viewUserDetails = async (user) => {
    setSelectedUser(user);
    setDetailsLoading(true);
    try {
      // Fetch submissions for the user
      const submissionsQuery = query(
        collection(db, 'results'),
        where('candidateId', '==', user.id)
      );
      const submissionsSnap = await getDocs(submissionsQuery);
      let submissions = submissionsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Sort latest first
      submissions.sort((a, b) => {
        const ta = (a.submittedAt?.toDate?.() || a.createdAt?.toDate?.() || new Date(0)).getTime();
        const tb = (b.submittedAt?.toDate?.() || b.createdAt?.toDate?.() || new Date(0)).getTime();
        return tb - ta;
      });

      // Attach test titles for readability
      const testIds = Array.from(new Set(submissions.map(s => s.testId).filter(Boolean)));
      const testTitleMap = {};
      for (const tId of testIds) {
        try {
          const tSnap = await getDoc(doc(db, 'tests', tId));
          if (tSnap.exists()) {testTitleMap[tId] = tSnap.data().title || tId;}
        } catch (_) {}
      }
      submissions = submissions.map(s => ({ ...s, _testTitle: testTitleMap[s.testId] || s.testId }));

      // Fetch paste logs
      const pasteQueryRef = query(
        collection(db, 'pasteLogs'),
        where('candidateId', '==', user.id)
      );
      const pasteSnap = await getDocs(pasteQueryRef);
      const pasteLogs = pasteSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Fetch tab switch logs
      const tabQueryRef = query(
        collection(db, 'tabSwitchLogs'),
        where('candidateId', '==', user.id)
      );
      const tabSnap = await getDocs(tabQueryRef);
      const tabSwitchLogs = tabSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Compute aggregates: total tests and average score (percentage)
      let avgScore = 0;
      if (submissions.length > 0) {
        const sumPct = submissions.reduce((sum, s) => {
          const awarded = Number(s.totalMarksAwarded || 0);
          const max = Number(s.maxPossibleMarks || 0) || 100;
          const pct = Math.max(0, Math.min(100, (awarded / max) * 100));
          return sum + pct;
        }, 0);
        avgScore = Math.round((sumPct / submissions.length) * 100) / 100; // round to 2 decimals
      }

      setUserDetails({ submissions, pasteLogs, tabSwitchLogs, avgScore, totalTestsGiven: submissions.length });
    } catch (err) {
      console.error('Error loading user details:', err);
    } finally {
      setDetailsLoading(false);
    }
  };

  // Close details panel
  const closeUserDetails = () => {
    setSelectedUser(null);
    setUserDetails({ submissions: [], pasteLogs: [], tabSwitchLogs: [] });
  };

  // Close on Escape key when details are open
  useEffect(() => {
    if (!selectedUser) {return;}
    const onKey = (e) => {
      if (e.key === 'Escape') {closeUserDetails();}
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedUser]);

  const filteredUsers = users
    .filter(user => {
      const matchesSearch = user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.name?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = filterRole === 'all' || user.role === filterRole;
      const matchesStatus = filterStatus === 'all' ||
        (filterStatus === 'active' && !user.blocked) ||
        (filterStatus === 'blocked' && user.blocked);

      return matchesSearch && matchesRole && matchesStatus;
    })
    .sort((a, b) => {
      // Sort by creation time based on sortOrder
      const timeA = a.createdAt?.toDate?.() ? a.createdAt.toDate().getTime() : 0;
      const timeB = b.createdAt?.toDate?.() ? b.createdAt.toDate().getTime() : 0;
      return sortOrder === 'newest' ? timeB - timeA : timeA - timeB;
    });

  const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
  const startIndex = (currentPage - 1) * usersPerPage;
  const currentUsers = filteredUsers.slice(startIndex, startIndex + usersPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterRole, filterStatus, sortOrder]);

  if (loading) {return (
    <div className="loading-tests">
      <Loading message="Loading users" subtext="Fetching user accounts and permissions" variant="inline" size="large" />
    </div>
  );}

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
                  <th>Approval</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentUsers.map(user => (
                  <tr key={user.id} onDoubleClick={() => viewUserDetails(user)} title="Double-click to view details">
                    <td>
                      <div className="user-info">
                        <span
                          className="user-name user-link"
                          onClick={() => viewUserDetails(user)}
                          title="View user details"
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => { if (e.key === 'Enter') {viewUserDetails(user);} }}
                        >
                          {user.name || 'N/A'}
                        </span>

                      </div>
                    </td>
                    <td>
                      {user.email?.toLowerCase() === appConfig.superAdminEmail.toLowerCase() ? (
                        'Hidden'
                      ) : (
                        <span
                          className="user-link"
                          onClick={() => viewUserDetails(user)}
                          role="button"
                          tabIndex={0}
                          title="View user details"
                          onKeyDown={(e) => { if (e.key === 'Enter') {viewUserDetails(user);} }}
                        >
                          {user.email}
                        </span>
                      )}
                    </td>
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
                      {user.approved === false ? (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            className="btn btn-sm btn-success"
                            onClick={() => handleApproval(user.id, true)}
                            disabled={!canPerformAdminActions}
                            title="Approve user"
                          >
                            ✓ Approve
                          </button>
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => handleBlockToggle(user.id, false)}
                            disabled={!canPerformAdminActions}
                            title="Reject user"
                          >
                            ✗ Reject
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

      {/* User Details Panel */}
      {selectedUser && (
        <div
          className="user-details-overlay"
          role="dialog"
          aria-modal="true"
          onClick={(e) => { if (e.target === e.currentTarget) {closeUserDetails();} }}
        >
          <div className="user-details-panel">
            <div className="user-details-header">
              <h3>User Details</h3>
              <button className="btn btn-sm btn-outline" onClick={closeUserDetails} aria-label="Close">✕</button>
            </div>
            <div className="user-details-body">
              <div className="user-summary">
                <p><strong>Name:</strong> {selectedUser.name || 'N/A'}</p>
                <p><strong>Email:</strong> {selectedUser.email || 'N/A'}</p>
                <p><strong>Role:</strong> {selectedUser.role || 'candidate'}</p>
                <p><strong>Domain:</strong> {selectedUser.domain || '-'}</p>
                <p><strong>Mobile No:</strong> {selectedUser.mobile || selectedUser.phone || '-'}</p>
                <p><strong>Total Tests Given:</strong> {userDetails.totalTestsGiven ?? userDetails.submissions.length}</p>
                <p><strong>Average Marks:</strong> {userDetails.avgScore != null ? `${userDetails.avgScore}%` : '-'}</p>
                <p><strong>Status:</strong> {selectedUser.blocked ? 'Blocked' : 'Active'}</p>
              </div>

              {detailsLoading ? (
                <div className="loading-tests">
                  <Loading message="Loading user details" subtext="Fetching submissions and activity" variant="inline" size="large" />
                </div>
              ) : (
                <>
                  <div className="user-stats">
                    <div className="stat-card"><div className="stat-content"><h4>Total Submissions</h4><p className="stat-number">{userDetails.submissions.length}</p></div></div>
                    <div className="stat-card"><div className="stat-content"><h4>Paste Logs</h4><p className="stat-number">{userDetails.pasteLogs.length}</p></div></div>
                    <div className="stat-card"><div className="stat-content"><h4>Tab Switch Logs</h4><p className="stat-number">{userDetails.tabSwitchLogs.length}</p></div></div>
                  </div>

                  <div className="user-section">
                    <h4>Recent Submissions</h4>
                    {userDetails.submissions.length === 0 ? (
                      <p className="text-muted">No submissions yet.</p>
                    ) : (
                      <table className="users-table">
                        <thead>
                          <tr>
                            <th>Test</th>
                            <th>Status</th>
                            <th>Submitted At</th>
                          </tr>
                        </thead>
                        <tbody>
                          {userDetails.submissions.slice(0, 5).map(s => (
                            <tr key={s.id}>
                              <td>{s._testTitle || s.testId || '-'}</td>
                              <td>{s.status || '-'}</td>
                              <td>{(s.submittedAt?.toDate?.() || s.createdAt?.toDate?.() || null)?.toLocaleString?.() || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  <div className="user-section">
                    <h4>Activity</h4>
                    <div className="activity-grid">
                      <div>
                        <h5>Paste Logs</h5>
                        {userDetails.pasteLogs.length === 0 ? (
                          <p className="text-muted">No paste activity.</p>
                        ) : (
                          <ul className="simple-list">
                            {userDetails.pasteLogs.slice(0, 5).map(p => (
                              <li key={p.id}>
                                <span>Test: {p.testId || '-'}</span>
                                <span style={{ marginLeft: 8 }}>Q: {p.questionId || '-'}</span>
                                <span style={{ marginLeft: 8 }}>{(p.timestamp?.toDate?.() || null)?.toLocaleString?.() || '-'}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div>
                        <h5>Tab Switch Logs</h5>
                        {userDetails.tabSwitchLogs.length === 0 ? (
                          <p className="text-muted">No tab switching recorded.</p>
                        ) : (
                          <ul className="simple-list">
                            {userDetails.tabSwitchLogs.slice(0, 5).map(t => (
                              <li key={t.id}>
                                <span>Test: {t.testId || '-'}</span>
                                <span style={{ marginLeft: 8 }}>Count: {t.switchCount || 0}</span>
                                <span style={{ marginLeft: 8 }}>{(t.lastUpdated?.toDate?.() || null)?.toLocaleString?.() || '-'}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
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
          <button className="btn btn-sm btn-primary" onClick={handleRoleSubmit}><Icon name="success" size="small" /></button>
          <button className="btn btn-sm btn-outline" onClick={() => setIsEditing(false)}><Icon name="fire" size="small" /></button>
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
          <button className="btn btn-sm btn-primary" onClick={handleDomainSubmit}><Icon name="success" size="small" /></button>
          <button className="btn btn-sm btn-outline" onClick={() => setIsEditing(false)}><Icon name="fire" size="small" /></button>
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
            const userDoc = await getDoc(doc(db, 'user', submissionData.candidateId));

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

  const deleteTest = async (test) => {
    const confirmDelete = window.confirm(
      `Are you sure you want to delete the test "${test.title}"?\n\n` +
      `This action will permanently delete:\n` +
      `• The test and all its questions\n` +
      `• All submissions and results for this test\n` +
      `• This action cannot be undone!`
    );

    if (!confirmDelete) {return;}

    try {
      setLoading(true);

      // Delete all submissions/results for this test
      const resultsQuery = query(
        collection(db, 'results'),
        where('testId', '==', test.id)
      );
      const resultsSnapshot = await getDocs(resultsQuery);
      const deleteResultsPromises = resultsSnapshot.docs.map(doc =>
        deleteDoc(doc.ref)
      );
      await Promise.all(deleteResultsPromises);

      // Delete all questions in the test subcollection
      const questionsQuery = collection(db, 'tests', test.id, 'questions');
      const questionsSnapshot = await getDocs(questionsQuery);
      const deleteQuestionsPromises = questionsSnapshot.docs.map(doc =>
        deleteDoc(doc.ref)
      );
      await Promise.all(deleteQuestionsPromises);

      // Delete the test document itself
      await deleteDoc(doc(db, 'tests', test.id));

      // Show success message
      alert(`Test "${test.title}" has been successfully deleted.`);

    } catch (error) {
      console.error('Error deleting test:', error);
      alert(`Failed to delete test: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const filteredTests = tests.filter(test => {
    const matchesSearch = test.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      test.domain?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDomain = filterDomain === 'all' || test.domain === filterDomain;
    const matchesStatus = filterStatus === 'all' || test.status === filterStatus;

    return matchesSearch && matchesDomain && matchesStatus;
  });

  if (loading) {return (
    <div className="loading-tests">
      <Loading message="Loading tests" subtext="Fetching all tests and submissions" variant="inline" size="large" />
    </div>
  );}
  if (error) {return <div className="error">Error: {error}</div>;}

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
                  <div className="test-actions">
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => viewTestPaper(test)}
                      title="View Test Paper"
                    >
                      <Icon name="paper" size="small" /> Paper
                    </button>
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => viewSubmissions(test)}
                      title="View Submissions"
                    >
                      <Icon name="submissions" size="small" /> Submissions
                    </button>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => deleteTest(test)}
                      title="Delete Test"
                      disabled={loading}
                    >
                      <Icon name="fire" size="small" /> Delete
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
          <div className="no-tests-icon"><Icon name="notebook" size="2xl" /></div>
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
        // Fetch questions from the subcollection under the test
        const questionsRef = collection(db, 'tests', test.id, 'questions');
        const snapshot = await getDocs(questionsRef);
        const questionsData = snapshot.docs.map(doc => {
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

        // Sort questions by questionId if available
        questionsData.sort((a, b) => {
          const aId = parseInt(a.id) || 0;
          const bId = parseInt(b.id) || 0;
          return aId - bId;
        });

        setQuestions(questionsData);
        setLoading(false);
        console.log('Loaded questions for test paper:', questionsData);
      } catch (err) {
        console.error('Failed to load questions:', err);
        setLoading(false);
      }
    };

    loadQuestions();
  }, [test.id]);

  if (loading) {return (
    <div className="loading-tests">
      <Loading message="Loading test paper" subtext="Fetching questions and test structure" variant="inline" size="large" />
    </div>
  );}

  return (
    <div className="test-paper-view">
      <div className="paper-header">
        <button className="btn btn-outline" onClick={onBack}>
          <Icon name="leaderboard" size="small" /> Back to Tests
        </button>
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
              <div className="question-meta">
                <span className="question-type">{question.questionType?.toUpperCase() || 'MCQ'}</span>
                <span className="question-marks">{question.marks || 1} marks</span>
              </div>
            </div>

            <div className="question-content">
              <div className="question-text">
                {question.questionText || question.text || 'No question text'}
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

              {/* MCQ Options */}
              {question.questionType === 'mcq' && question.options && question.options.length > 0 && (
                <div className="question-options">
                  <h4>Options:</h4>
                  {question.options.map((option, optIndex) => (
                    <div
                      key={optIndex}
                      className={`option ${option === question.correctAnswer ? 'correct-option' : ''}`}
                    >
                      <span className="option-label">{String.fromCharCode(65 + optIndex)}.</span>
                      <span className="option-text">{option}</span>
                      {option === question.correctAnswer && (
                        <span className="correct-indicator"><Icon name="success" size="small" /> Correct</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Long Answer */}
              {question.questionType === 'long' && (
                <div className="long-answer-info">
                  <p><strong>Type:</strong> Long Answer Question</p>
                  <p><strong>Expected:</strong> Detailed written response</p>
                </div>
              )}

              {/* Code Question */}
              {question.questionType === 'code' && (
                <div className="code-question-info">
                  <p><strong>Type:</strong> Programming Question</p>
                  <p><strong>Expected:</strong> Code implementation</p>
                  {question.expectedAnswer && (
                    <div className="expected-solution">
                      <strong>Sample Solution:</strong>
                      <pre style={{
                        background: '#f8f9fa',
                        padding: '1rem',
                        borderRadius: '4px',
                        overflow: 'auto',
                        marginTop: '0.5rem'
                      }}>{question.expectedAnswer}</pre>
                    </div>
                  )}
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
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [exporting, setExporting] = useState(false);
  const { user: currentUser } = useFirebase();
  const [localSubmissions, setLocalSubmissions] = useState(submissions || []);

  useEffect(() => {
    setLocalSubmissions(submissions || []);
  }, [submissions]);

  const canDeleteSubmissions = (currentUser?.role === 'admin') || (currentUser?.role === 'head') ||
    (currentUser?.email?.toLowerCase?.() === appConfig.superAdminEmail.toLowerCase());

  const filteredSubmissions = localSubmissions.filter(submission =>
    submission.candidateId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    submission.candidateName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDeleteSubmission = async (submission) => {
    if (!canDeleteSubmissions) {
      alert('You do not have permission to delete submissions');
      return;
    }
    const confirmDelete = window.confirm(
      `Delete submission for "${submission.candidateName || submission.candidateId}"?\n\n` +
      `This will permanently remove:\n` +
      `• Their test result for "${test.title}"\n` +
      `• All monitoring logs for this test attempt\n` +
      `• All paste/tab switch logs for this test\n\n` +
      `This action cannot be undone. Continue?`
    );
    if (!confirmDelete) {return;}

    try {
      console.log('Deleting submission and related data for:', submission.candidateId, 'test:', test.id);

      // 1. Delete the main submission result
      await deleteDoc(doc(db, 'results', submission.id));
      console.log('✅ Deleted main submission');

      // 2. Delete monitoring logs for this candidate and test
      const monitoringQuery = query(
        collection(db, 'monitoring'),
        where('candidateId', '==', submission.candidateId),
        where('testId', '==', test.id)
      );
      const monitoringSnapshot = await getDocs(monitoringQuery);
      const monitoringDeletes = monitoringSnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(monitoringDeletes);
      console.log(`✅ Deleted ${monitoringSnapshot.size} monitoring logs`);

      // 3. Delete paste logs for this candidate and test
      const pasteQuery = query(
        collection(db, 'pasteLogs'),
        where('candidateId', '==', submission.candidateId),
        where('testId', '==', test.id)
      );
      const pasteSnapshot = await getDocs(pasteQuery);
      const pasteDeletes = pasteSnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(pasteDeletes);
      console.log(`✅ Deleted ${pasteSnapshot.size} paste logs`);

      // 4. Delete tab switch logs for this candidate and test
      const tabSwitchQuery = query(
        collection(db, 'tabSwitchLogs'),
        where('candidateId', '==', submission.candidateId),
        where('testId', '==', test.id)
      );
      const tabSwitchSnapshot = await getDocs(tabSwitchQuery);
      const tabSwitchDeletes = tabSwitchSnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(tabSwitchDeletes);
      console.log(`✅ Deleted ${tabSwitchSnapshot.size} tab switch logs`);

      // 5. Update local UI
      setLocalSubmissions(prev => prev.filter(s => s.id !== submission.id));
      setSelectedSubmission(null);

      const totalDeleted = 1 + monitoringSnapshot.size + pasteSnapshot.size + tabSwitchSnapshot.size;
      alert(`Submission and all related data deleted successfully!\n\nDeleted ${totalDeleted} records total:\n• 1 submission result\n• ${monitoringSnapshot.size} monitoring logs\n• ${pasteSnapshot.size} paste logs\n• ${tabSwitchSnapshot.size} tab switch logs`);

    } catch (error) {
      console.error('Error deleting submission and related data:', error);
      alert('Failed to delete submission: ' + (error.message || 'Unknown error'));
    }
  };

  // If viewing individual submission
  if (selectedSubmission) {
    return (
      <SubmissionDetailView
        submission={selectedSubmission}
        test={test}
        onBack={() => setSelectedSubmission(null)}
      />
    );
  }

  return (
    <div className="test-submissions-view">
      <div className="submissions-header">
        <button className="btn btn-outline" onClick={onBack}>
          <Icon name="leaderboard" size="small" /> Back to Tests
        </button>
        <div className="submissions-info">
          <h2>Submissions: {test.title}</h2>
          <p>{localSubmissions.length} total submissions</p>
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
        <div className="export-actions">
          <button
            className={`btn btn-outline ${exporting ? 'btn-loading' : ''}`}
            onClick={() => exportSubmissionsToExcel({ submissions: localSubmissions, selectedTest: test, setLoading: setExporting })}
            disabled={exporting || localSubmissions.length === 0}
            title="Export submissions to Excel"
          >
            <Icon name="notebook" size="small" /> Export Excel
          </button>
          <button
            className={`btn btn-outline ${exporting ? 'btn-loading' : ''}`}
            onClick={() => exportSubmissionsToPDF({ submissions: localSubmissions, selectedTest: test, setLoading: setExporting, exportType: 'admin' })}
            disabled={exporting || localSubmissions.length === 0}
            title="Export submissions to PDF"
            style={{ marginLeft: '8px' }}
          >
            <Icon name="paper" size="small" /> Export PDF
          </button>
        </div>
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
                    {(() => {
                      // Debug logging for score display
                      console.log('Score Debug:', {
                        candidateName: submission.candidateName,
                        totalMarksAwarded: submission.totalMarksAwarded,
                        maxPossibleMarks: submission.maxPossibleMarks,
                        testTotalMarks: test?.totalMarks,
                        score: submission.score,
                        evaluatedBy: submission.evaluatedBy
                      });

                      // Show actual marks distributed by head/admin out of test total marks
                      if (submission.totalMarksAwarded !== undefined && submission.totalMarksAwarded !== null) {
                        let testTotalMarks = test?.totalMarks || 100;

                        // Fix data issue: if totalMarksAwarded > testTotalMarks, likely testTotalMarks is wrong
                        if (submission.totalMarksAwarded > testTotalMarks && testTotalMarks < 50) {
                          // If test total marks seems too low and awarded marks is higher, use awarded marks as reference
                          testTotalMarks = 100; // Default to 100 as it's more reasonable
                          console.warn('Data issue detected: totalMarksAwarded > testTotalMarks, using 100 as fallback');
                        }

                        return `${submission.totalMarksAwarded}/${testTotalMarks}`;
                      } else if (submission.score !== undefined) {
                        // If only percentage is available, try to calculate marks
                        const testTotalMarks = test?.totalMarks || 100;
                        const calculatedMarks = Math.round((submission.score / 100) * testTotalMarks);
                        return `${calculatedMarks}/${testTotalMarks} (${submission.score}%)`;
                      } else {
                        return 'Not graded';
                      }
                    })()}
                  </span>
                </td>
                <td>
                  <span className={`badge ${submission.status === 'evaluated' ? 'badge-success' : 'badge-warning'}`}>
                    {submission.status || 'submitted'}
                  </span>
                </td>
                <td>
                  <button
                    className="btn btn-sm btn-outline"
                    title="View Details"
                    onClick={() => setSelectedSubmission(submission)}
                  >
                    <Icon name="computer" size="small" /> View
                  </button>
                  {canDeleteSubmissions && (
                    <button
                      className="btn btn-sm btn-danger"
                      title="Delete Submission"
                      style={{ marginLeft: '0.5rem' }}
                      onClick={() => handleDeleteSubmission(submission)}
                    >
                      <Icon name="fire" size="small" /> Delete
                    </button>
                  )}
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

// Submission Detail View Component
function SubmissionDetailView({ submission, test, onBack }) {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [marksDistribution, setMarksDistribution] = useState({});
  const [totalMarks, setTotalMarks] = useState(0);
  const [saving, setSaving] = useState(false);
  // const [showMarksPanel] = useState(true); // Commented out as not currently used

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
        evaluatedBy: 'admin'
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
          <div className="submission-meta">
            <div className="meta-item">
              <strong>Candidate:</strong> {submission.candidateName || 'Unknown'}
            </div>

            <div className="meta-item">
              <strong>Submitted:</strong> {formatDateTime(submission.submittedAt)}
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

// 4. Monitoring Section Component
function AdminMonitoring() {
  const [tests, setTests] = useState([]);
  const [selectedTest, setSelectedTest] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [selectedParticipant, setSelectedParticipant] = useState(null);
  const [monitoringData, setMonitoringData] = useState([]);
  const [participantMonitoring, setParticipantMonitoring] = useState({});
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
        console.error('Error loading tests for monitoring:', err);
        setError('Failed to load tests');
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  const loadParticipants = async (testId) => {
    try {
      // Set up real-time listener for participants
      const participantsQuery = query(
        collection(db, 'results'),
        where('testId', '==', testId)
      );

      const unsubscribeParticipants = onSnapshot(participantsQuery, async (snapshot) => {
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
              const userDoc = await getDoc(doc(db, 'user', participantData.candidateId));

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

        // Load monitoring data for all participants
        loadAllMonitoringData(testId, participantsData);
      });

      // Store the unsubscribe function for cleanup
      return unsubscribeParticipants;
    } catch (err) {
      console.error('Error loading participants:', err);
      setError('Failed to load participants');
    }
  };

  const loadAllMonitoringData = async (testId, participantsData) => {
    console.log('🔍 ADMIN MONITORING: Loading monitoring data for test:', testId);
    console.log('🔍 ADMIN MONITORING: Participants:', participantsData.map(p => ({ id: p.id, candidateId: p.candidateId, name: p.candidateName })));

    try {
      const monitoringPromises = participantsData.map(async (participant) => {
        if (!participant.candidateId) {
          console.log('🔍 ADMIN MONITORING: Skipping participant without candidateId:', participant.id);
          return { [participant.id]: {} };
        }

        console.log(`🔍 ADMIN MONITORING: Querying monitoring for candidate ${participant.candidateId}`);

        const monitoringQuery = query(
          collection(db, 'monitoring'),
          where('candidateId', '==', participant.candidateId),
          where('testId', '==', testId)
        );

        const snapshot = await getDocs(monitoringQuery);
        const events = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        console.log(`🔍 ADMIN MONITORING: Found ${events.length} events for candidate ${participant.candidateId}:`, events);

        // Aggregate monitoring data
        const aggregatedData = {
          tabSwitches: events.filter(e => e.type === 'tab_switch' || e.type === 'visibility_change'),
          copyEvents: events.filter(e => e.type === 'copy'),
          pasteEvents: events.filter(e => e.type === 'paste'),
          totalViolations: events.length,
          lastActivity: events.length > 0 ? Math.max(...events.map(e => e.timestamp?.toMillis() || 0)) : null
        };

        console.log(`🔍 ADMIN MONITORING: Aggregated data for ${participant.candidateId}:`, aggregatedData);

        return { [participant.id]: aggregatedData };
      });

      const results = await Promise.all(monitoringPromises);
      const monitoringMap = results.reduce((acc, curr) => ({ ...acc, ...curr }), {});

      console.log('🔍 ADMIN MONITORING: Final monitoring map:', monitoringMap);
      setParticipantMonitoring(monitoringMap);
    } catch (err) {
      console.error('❌ ADMIN MONITORING: Error loading monitoring data:', err);
    }
  };

  const loadMonitoringData = async (candidateId, testId) => {
    try {
      // Set up real-time listener for specific participant monitoring data
      // Temporarily disable orderBy to isolate index issue
      const monitoringQuery = query(
        collection(db, 'monitoring'),
        where('candidateId', '==', candidateId),
        where('testId', '==', testId)
        // orderBy('timestamp', 'desc') // Temporarily disabled to debug index issue
      );

      const unsubscribeMonitoring = onSnapshot(monitoringQuery, (snapshot) => {
        const events = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setMonitoringData(events);
      });

      return unsubscribeMonitoring;
    } catch (err) {
      console.error('Error loading monitoring data:', err);
      setError('Failed to load monitoring data');
    }
  };

  const selectTest = (test) => {
    setSelectedTest(test);
    setSelectedParticipant(null);
    setParticipantMonitoring({});
    loadParticipants(test.id);
  };

  const selectParticipant = (participant) => {
    setSelectedParticipant(participant);
    loadMonitoringData(participant.candidateId, selectedTest.id);
  };

  const getSuspiciousActivityCount = (participant) => {
    const monitoring = participantMonitoring[participant.id] || {};
    const tabSwitches = monitoring.tabSwitches?.length || 0;
    const copyEvents = monitoring.copyEvents?.length || 0;
    const pasteEvents = monitoring.pasteEvents?.length || 0;
    return tabSwitches + copyEvents + pasteEvents;
  };

  const isSuspicious = (participant) => {
    return getSuspiciousActivityCount(participant) > 3; // Lowered threshold for better detection
  };

  const getMonitoringStats = (participant) => {
    const monitoring = participantMonitoring[participant.id] || {};
    return {
      tabSwitches: monitoring.tabSwitches?.length || 0,
      copyEvents: monitoring.copyEvents?.length || 0,
      pasteEvents: monitoring.pasteEvents?.length || 0,
      totalViolations: monitoring.totalViolations || 0,
      lastActivity: monitoring.lastActivity
    };
  };

  if (loading) {return (
    <div className="loading-tests">
      <Loading message="Loading monitoring data" subtext="Analyzing test activities and security logs" variant="inline" size="large" />
    </div>
  );}
  if (error) {return <div className="error">Error: {error}</div>;}

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
            <Icon name="leaderboard" size="small" /> Back to Tests
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
                    <span className={`badge ${participant.status === 'blocked' || participant.blocked ? 'badge-error' :
                      participant.status === 'in_progress' || participant.status === 'active' ? 'badge-success' : 'badge-neutral'}`}>
                      {participant.status === 'blocked' || participant.blocked ? 'Blocked' :
                       participant.status === 'in_progress' ? 'In Progress' :
                       participant.status === 'active' ? 'Active' :
                       participant.status === 'completed' ? 'Completed' : 'Unknown'}
                    </span>
                  </td>
                  <td>
                    <span className={`activity-count ${getMonitoringStats(participant).tabSwitches > 2 ? 'high' : ''}`}>
                      {getMonitoringStats(participant).tabSwitches}
                    </span>
                  </td>
                  <td>
                    <span className={`activity-count ${getMonitoringStats(participant).copyEvents > 1 ? 'high' : ''}`}>
                      {getMonitoringStats(participant).copyEvents}
                    </span>
                  </td>
                  <td>
                    <span className={`activity-count ${getMonitoringStats(participant).pasteEvents > 1 ? 'high' : ''}`}>
                      {getMonitoringStats(participant).pasteEvents}
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
                      <Icon name="computer" size="small" /> Details
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
                  <span className="stat-icon"><Icon name="computer" size="small" /></span>
                  <span>Click to monitor</span>
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {tests.length === 0 && (
        <div className="no-tests">
          <div className="no-tests-icon"><Icon name="notebook" size="2xl" /></div>
          <h3>No Tests Available</h3>
          <p>No tests available for monitoring</p>
        </div>
      )}
    </div>
  );
}

// Helper function to get question name from ID
function getQuestionName(questionId, testData = null, storedQuestionText = null) {
  if (!questionId) {return 'Unknown Question';}

  // If we have stored question text from monitoring data, use it directly
  if (storedQuestionText && storedQuestionText !== 'Question text not available') {
    const cleanText = storedQuestionText
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim();
    const shortText = cleanText.slice(0, 100);
    return `"${shortText}${cleanText.length > 100 ? '...' : ''}"`;
  }

  console.log('🔍 Getting question name for:', questionId, 'Test data:', testData?.questions?.length);
  console.log('🔍 Available questions:', testData?.questions?.map(q => ({ id: q.id, hasQuestionText: !!q.questionText, hasQuestion: !!q.question, hasText: !!q.text })));
  console.log('🔍 All question IDs:', testData?.questions?.map(q => q.id));
  console.log('🔍 Question ID types:', testData?.questions?.map(q => ({ id: q.id, type: typeof q.id })));
  console.log('🔍 Looking for ID type:', typeof questionId);

  // Show available question texts for debugging
  if (testData?.questions?.length > 0) {
    console.log('🔍 Available question texts:', testData.questions.map(q => ({
      id: q.id,
      text: (q.questionText || q.question || q.text || 'No text').substring(0, 50) + '...'
    })));
  }

  // Handle notes fields (e.g., "1758793866121_notes")
  if (questionId.includes('_notes')) {
    const baseQuestionId = questionId.replace('_notes', '');

    // Try to find the actual question text
    if (testData?.questions) {
      // First try exact ID match
      let question = testData.questions.find(q => q.id === baseQuestionId);
      console.log('🔍 Found question for notes (exact match):', question);

      // If no exact match, try partial ID match
      if (!question) {
        question = testData.questions.find(q => q.id.includes(baseQuestionId) || baseQuestionId.includes(q.id));
        console.log('🔍 Found question for notes (partial match):', question);
      }

      // If still no match, try string conversion and different ID formats
      if (!question) {
        const baseQuestionIdStr = String(baseQuestionId);
        question = testData.questions.find(q =>
          String(q.id) === baseQuestionIdStr ||
          String(q.id).includes(baseQuestionIdStr) ||
          baseQuestionIdStr.includes(String(q.id))
        );
        console.log('🔍 Found question for notes (string match):', question);
      }

      console.log('🔍 Notes question properties:', question ? Object.keys(question) : 'No question found');

      // Try multiple possible question text properties
      const questionText = question?.questionText || question?.question || question?.text;
      console.log('🔍 Notes question text found:', questionText ? questionText.substring(0, 50) + '...' : 'No text found');

      if (questionText) {
        // Clean the question text and make it more readable
        const cleanText = questionText
          .replace(/<[^>]*>/g, '') // Remove HTML tags
          .replace(/\s+/g, ' ') // Replace multiple spaces with single space
          .trim();
        const shortText = cleanText.slice(0, 80);
        return `"${shortText}${cleanText.length > 80 ? '...' : ''}" (Notes Field)`;
      }
    }

    return `Question ${baseQuestionId.slice(0, 8)}... (Notes Field)`;
  }

  // Try to find the actual question text
  if (testData?.questions) {
    // First try exact ID match
    let question = testData.questions.find(q => q.id === questionId);
    console.log('🔍 Found question (exact match):', question);

    // If no exact match, try partial ID match (in case of ID variations)
    if (!question) {
      question = testData.questions.find(q => q.id.includes(questionId) || questionId.includes(q.id));
      console.log('🔍 Found question (partial match):', question);
    }

    // If still no match, try string conversion and different ID formats
    if (!question) {
      const questionIdStr = String(questionId);
      console.log('🔍 Trying string conversion - looking for:', questionIdStr);
      console.log('🔍 Available IDs as strings:', testData.questions.map(q => String(q.id)));

      question = testData.questions.find(q =>
        String(q.id) === questionIdStr ||
        String(q.id).includes(questionIdStr) ||
        questionIdStr.includes(String(q.id))
      );
      console.log('🔍 Found question (string match):', question);
    }

    // If still no match, try to find by any partial match
    if (!question) {
      console.log('🔍 Trying any partial match...');
      for (let i = 0; i < testData.questions.length; i++) {
        const q = testData.questions[i];
        console.log(`🔍 Comparing "${questionId}" with "${q.id}" (${typeof q.id})`);
        if (String(q.id) === String(questionId)) {
          question = q;
          console.log('🔍 Found exact match!', question);
          break;
        }
      }
    }

    // If still no match, try to find by timestamp similarity (for timestamp-based IDs)
    if (!question && questionId.length > 10) {
      console.log('🔍 Trying timestamp-based matching...');
      const targetTimestamp = parseInt(questionId);
      if (!isNaN(targetTimestamp)) {
        // Find the closest timestamp match
        let closestQuestion = null;
        let smallestDiff = Infinity;

        for (const q of testData.questions) {
          const qTimestamp = parseInt(q.id);
          if (!isNaN(qTimestamp)) {
            const diff = Math.abs(targetTimestamp - qTimestamp);
            if (diff < smallestDiff) {
              smallestDiff = diff;
              closestQuestion = q;
            }
          }
        }

        // If the difference is reasonable (within 1 hour = 3600000 ms), use it
        if (closestQuestion && smallestDiff < 3600000) {
          question = closestQuestion;
          console.log('🔍 Found timestamp-based match!', {
            target: questionId,
            found: question.id,
            diff: smallestDiff,
            question: question.questionText?.substring(0, 50) + '...'
          });
        }
      }
    }

    console.log('🔍 Question properties:', question ? Object.keys(question) : 'No question found');

    // Try multiple possible question text properties
    const questionText = question?.questionText || question?.question || question?.text;
    console.log('🔍 Question text found:', questionText ? questionText.substring(0, 50) + '...' : 'No text found');

    if (questionText) {
      // Clean the question text and make it more readable
      const cleanText = questionText
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .trim();
      const shortText = cleanText.slice(0, 100);
      return `"${shortText}${cleanText.length > 100 ? '...' : ''}"`;
    }
  }

  // For regular question IDs, show in a readable format
  if (questionId.length > 10) {
    // If it's a long ID (timestamp-based), show it as "Question [first few digits]"
    console.log('🔍 Falling back to ID display for:', questionId);
    console.log('🔍 This question ID does not exist in current test data');

    // Try to show a helpful message with available questions
    if (testData?.questions?.length > 0) {
      const firstQuestion = testData.questions[0];
      const firstQuestionText = firstQuestion?.questionText || firstQuestion?.question || firstQuestion?.text;
      if (firstQuestionText) {
        console.log('🔍 Showing first available question as reference:', firstQuestionText.substring(0, 50) + '...');
        return ` ${firstQuestionText.substring(0, 50)}${firstQuestionText.length > 50 ? '...' : ''}`;
      }
    }

    return `Question ${questionId.slice(0, 8)}... (ID not found in current test)`;
  }

  // For shorter IDs, show as is
  console.log('🔍 Using short ID display for:', questionId);
  return `Question ${questionId} (ID not found in current test)`;
}

// Participant Detail View Component
function ParticipantDetailView({ participant, test, monitoringData, onBack }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [testWithQuestions, setTestWithQuestions] = useState(null);

  // Load complete test data with questions
  useEffect(() => {
    const loadTestQuestions = async () => {
      if (!test?.id) {return;}

      try {
        console.log('🔍 Loading test questions for:', test.id);
        const testQuery = query(
          collection(db, 'tests'),
          where('__name__', '==', test.id)
        );
        const testSnapshot = await getDocs(testQuery);

        if (!testSnapshot.empty) {
          const testDoc = testSnapshot.docs[0];
          const testData = { id: testDoc.id, ...testDoc.data() };

          // Load questions subcollection
          const questionsQuery = collection(db, 'tests', test.id, 'questions');
          const questionsSnapshot = await getDocs(questionsQuery);
          const questions = questionsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));

          testData.questions = questions;
          setTestWithQuestions(testData);
          console.log('✅ Loaded test with questions:', testData);
        }
      } catch (error) {
        console.error('Error loading test questions:', error);
        // Fallback to using the test data we have
        setTestWithQuestions(test);
      }
    };

    loadTestQuestions();
  }, [test]);

  // Process monitoring data by type
  const tabSwitches = monitoringData.filter(event =>
    event.type === 'tab_switch' || event.type === 'visibility_change' || event.type === 'focus_lost'
  );
  const copyEvents = monitoringData.filter(event => event.type === 'copy');
  const pasteEvents = monitoringData.filter(event => event.type === 'paste');

  // Additional monitoring events
  const keyboardEvents = monitoringData.filter(event => event.type === 'keyboard_shortcut');
  const rightClickEvents = monitoringData.filter(event => event.type === 'right_click');
  // const fullscreenEvents = monitoringData.filter(event => event.type === 'fullscreen_exit');

  return (
    <div className="participant-detail-view">
      <div className="detail-header">
        <button className="btn btn-outline" onClick={onBack}>
          <Icon name="user" size="small" /> Back to Participants
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
        <button
          className={`tab ${activeTab === 'violations' ? 'active' : ''}`}
          onClick={() => setActiveTab('violations')}
        >
          All Violations ({monitoringData.length})
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
                    <span className="stat-label">Total Violations:</span>
                    <span className="stat-value">{monitoringData.length}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Keyboard Shortcuts:</span>
                    <span className="stat-value">{keyboardEvents.length}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Right Clicks:</span>
                    <span className="stat-value">{rightClickEvents.length}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Status:</span>
                    <span className={`badge ${participant.status === 'blocked' || participant.blocked ? 'badge-error' :
                      participant.status === 'in_progress' || participant.status === 'active' ? 'badge-success' : 'badge-neutral'}`}>
                      {participant.status === 'blocked' || participant.blocked ? 'Blocked' :
                       participant.status === 'in_progress' ? 'In Progress' :
                       participant.status === 'active' ? 'Active' :
                       participant.status === 'completed' ? 'Completed' : 'Unknown'}
                    </span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Risk Level:</span>
                    <span className={`badge ${monitoringData.length > 5 ? 'badge-error' : monitoringData.length > 2 ? 'badge-warning' : 'badge-success'}`}>
                      {monitoringData.length > 5 ? '🔴 High Risk' : monitoringData.length > 2 ? '🟡 Medium Risk' : '🟢 Low Risk'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'tabswitches' && (
          <div className="tabswitches-tab">
            <h3>Tab Switch & Focus Events</h3>
            {tabSwitches.length === 0 ? (
              <div className="no-events">
                <p>✅ No tab switch events recorded - Good behavior!</p>
              </div>
            ) : (
              <div className="events-list">
                {tabSwitches.map((event, index) => (
                  <div key={index} className="event-item violation-event">
                    <div className="event-header">
                      <span className="event-time">{formatDateTime(event.timestamp)}</span>
                      <span className="event-type">{event.type === 'tab_switch' ? '🔄 Tab Switch' :
                        event.type === 'visibility_change' ? '👁️ Window Hidden' : '🎯 Focus Lost'}</span>
                    </div>
                    <div className="event-details">
                      <span className="event-description">
                        {event.type === 'tab_switch' ? 'Switched to another tab/window' :
                         event.type === 'visibility_change' ? 'Test window was hidden or minimized' :
                         'Lost focus from the test interface'}
                      </span>
                      {event.duration && (
                        <span className="event-duration">Duration: {Math.round(event.duration / 1000)}s</span>
                      )}
                    </div>
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
              <div className="no-events">
                <p>✅ No copy events recorded - Good behavior!</p>
              </div>
            ) : (
              <div className="events-list">
                {copyEvents.map((event, index) => (
                  <div key={index} className="event-item violation-event">
                    <div className="event-header">
                      <span className="event-time">{formatDateTime(event.timestamp)}</span>
                      <span className="event-type">📋 Copy Event</span>
                    </div>
                    <div className="event-content">
                      <span className="event-description">Content copied from {event.source || 'unknown source'}:</span>
                      <pre className="copied-content">{event.content || event.data || 'Content not recorded'}</pre>
                      {event.questionId && (
                        <span className="event-context">From Question: {getQuestionName(event.questionId, testWithQuestions, event.questionText)}</span>
                      )}
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
              <div className="no-events">
                <p>✅ No paste events recorded - Good behavior!</p>
              </div>
            ) : (
              <div className="events-list">
                {pasteEvents.map((event, index) => (
                  <div key={index} className="event-item violation-event">
                    <div className="event-header">
                      <span className="event-time">{formatDateTime(event.timestamp)}</span>
                      <span className="event-type">📌 Paste Event</span>
                    </div>
                    <div className="event-content">
                      <span className="event-description">Content pasted into {event.field || event.target || 'answer field'}:</span>
                      <pre className="pasted-content">{event.content || event.data || 'Content not recorded'}</pre>
                      {event.questionId && (
                        <span className="event-context">Into Question: {getQuestionName(event.questionId, testWithQuestions, event.questionText)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'violations' && (
          <div className="violations-tab">
            <h3>All Security Violations</h3>
            {monitoringData.length === 0 ? (
              <div className="no-events">
                <p>✅ No violations recorded - Excellent behavior!</p>
              </div>
            ) : (
              <div className="events-list">
                {monitoringData.map((event, index) => (
                  <div key={index} className="event-item violation-event">
                    <div className="event-header">
                      <span className="event-time">{formatDateTime(event.timestamp)}</span>
                      <span className="event-type">
                        {event.type === 'tab_switch' ? '🔄 Tab Switch' :
                         event.type === 'copy' ? '📋 Copy' :
                         event.type === 'paste' ? '📌 Paste' :
                         event.type === 'keyboard_shortcut' ? '⌨️ Shortcut' :
                         event.type === 'right_click' ? '🖱️ Right Click' :
                         event.type === 'fullscreen_exit' ? '📺 Fullscreen Exit' :
                         event.type === 'visibility_change' ? '👁️ Window Hidden' :
                         `⚠️ ${event.type}`}
                      </span>
                    </div>
                    <div className="event-content">
                      <span className="event-description">
                        {event.description ||
                         (event.type === 'tab_switch' ? 'Switched away from test' :
                          event.type === 'copy' ? 'Copied content' :
                          event.type === 'paste' ? 'Pasted content' :
                          event.type === 'keyboard_shortcut' ? `Used shortcut: ${event.shortcut || 'Unknown'}` :
                          event.type === 'right_click' ? 'Right-clicked on page' :
                          event.type === 'fullscreen_exit' ? 'Exited fullscreen mode' :
                          'Security violation detected')}
                      </span>
                      {(event.content || event.data) && (
                        <pre className="event-data">{event.content || event.data}</pre>
                      )}
                      {event.questionId && (
                        <span className="event-context">Question: {getQuestionName(event.questionId, testWithQuestions, event.questionText)}</span>
                      )}
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
  const { loading: contextLoading } = useFirebase();

  const tabs = useMemo(() => [
    { label: 'Overview', value: 'overview' },
    { label: 'Users', value: 'users' },
    { label: 'Tests', value: 'tests' },
    { label: 'Monitoring', value: 'monitoring' },
    { label: 'Leaderboard', value: 'leaderboard' }
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
    return <Loading message="Loading admin dashboard" subtext="Please wait while we prepare your admin workspace" />;
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
          {activeTab === 'leaderboard' && <Leaderboard />}
        </div>
      </div>
    </div>
  );
}

export default AdminDashboard;
