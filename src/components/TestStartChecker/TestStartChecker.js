import { collection, query, where, getDocs } from 'firebase/firestore';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { useFirebase } from '../../context/FirebaseContext';
import { db } from '../../firebase';
import Logger from '../../utils/logger';
import BlockedSubmissionCard from '../BlockedSubmissionCard/BlockedSubmissionCard';

function TestStartChecker({ testData, onPasswordPrompt, onStartTest }) {
  const { user } = useFirebase();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [showBlocked, setShowBlocked] = useState(false);
  const [blockMessage, setBlockMessage] = useState('');
  const [submissionCount, setSubmissionCount] = useState(0);

  useEffect(() => {
    checkSubmissionStatus();
  }, [user, testData]);

  const checkSubmissionStatus = async () => {
    if (!user || !testData) {return;}

    try {
      setLoading(true);
      
      // Check existing submissions
      const existingSubmissionsQuery = query(
        collection(db, 'results'),
        where('candidateId', '==', user.uid),
        where('testId', '==', testData.testId || testData.id)
      );
      const existingSubmissions = await getDocs(existingSubmissionsQuery);
      const submissionCount = existingSubmissions.size;
      
      setSubmissionCount(submissionCount);
      
      Logger.debug('Checking submission status', {
        submissionCount,
        allowMultiple: testData.allowMultipleSubmissions,
        testId: testData.testId || testData.id
      });

      // Logic based on submission count and settings
      if (submissionCount === 0) {
        // First attempt - show password box directly
        Logger.debug('First attempt - showing password prompt');
        onPasswordPrompt();
      } else if (submissionCount > 0 && !testData.allowMultipleSubmissions) {
        // Not first attempt and multiple submissions not allowed - show blocked card
        Logger.info('Multiple submissions not allowed - showing blocked card');
        setBlockMessage(
          `This test does not allow multiple submissions. You have already submitted this test ${submissionCount} time${submissionCount > 1 ? 's' : ''}. Please contact your domain head if you need to retake this test.`
        );
        setShowBlocked(true);
      } else if (submissionCount > 0 && testData.allowMultipleSubmissions) {
        // Multiple submissions allowed - check limit
        if (submissionCount >= 3) {
          Logger.info('Maximum attempts reached - showing blocked card');
          setBlockMessage(
            `You have reached the maximum number of attempts (3) for this test. You have already submitted this test ${submissionCount} times. Please contact your domain head if you need additional attempts.`
          );
          setShowBlocked(true);
        } else {
          // Within limit - show password box
          Logger.debug(`Attempt ${submissionCount + 1}/3 - showing password prompt`);
          onPasswordPrompt();
        }
      }
      
    } catch (error) {
      Logger.error('Error checking submission status', null, error);
      // On error, default to showing password prompt
      onPasswordPrompt();
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '32px',
          textAlign: 'center',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15)'
        }}>
          <div style={{ fontSize: '24px', marginBottom: '16px' }}>🔍</div>
          <h3>Checking Test Status...</h3>
          <p style={{ color: '#6b7280' }}>Please wait while we verify your submission history.</p>
        </div>
      </div>
    );
  }

  if (showBlocked) {
    return <BlockedSubmissionCard message={blockMessage} />;
  }

  // If we reach here, the password prompt should be shown by the parent component
  return null;
}

export default TestStartChecker;
