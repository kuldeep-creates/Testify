import { addDoc, arrayUnion, collection, doc, getDoc, getDocs, increment, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

import { db } from '../firebase';

// Tests
export async function fetchTestWithQuestions(testId) {
  try {
    console.log('[Firestore] Fetching test:', testId);
    
    if (!testId) {
      throw new Error('Test ID is required');
    }
    
    const testRef = doc(db, 'tests', testId);
    const testSnap = await getDoc(testRef);
    
    console.log('[Firestore] Test document exists:', testSnap.exists());
    
    if (!testSnap.exists()) {
      console.error('[Firestore] Test not found:', testId);
      return null;
    }
    
    const testData = testSnap.data();
    console.log('[Firestore] Test data:', { 
      id: testSnap.id, 
      title: testData?.title,
      hasPassword: !!testData?.password 
    });
    
    const qSnap = await getDocs(collection(testRef, 'questions'));
    console.log('[Firestore] Questions fetched:', qSnap.docs.length);
    
    const questions = qSnap.docs.map(d => {
      const questionData = d.data();
      return { 
        id: questionData.questionId || d.id, // Use questionId from data, fallback to doc id
        ...questionData 
      };
    });
    
    const result = { id: testSnap.id, ...testData, questions };
    console.log('[Firestore] Returning test with questions:', questions.length);
    
    return result;
  } catch (error) {
    console.error('[Firestore] Error fetching test:', error);
    console.error('[Firestore] Error details:', {
      code: error.code,
      message: error.message,
      testId
    });
    throw error;
  }
}

// Paste logs
export async function logPaste({ candidateId, testId, questionId, pastedText }) {
  await addDoc(collection(db, 'pasteLogs'), {
    candidateId,
    testId,
    questionId,
    pastedText,
    timestamp: serverTimestamp(),
  });
}

// Tab switch logs: keep a doc per candidate+test and update counts
export async function logTabSwitch({ candidateId, testId, status }) {
  const key = `${candidateId}_${testId}`;
  const ref = doc(db, 'tabSwitchLogs', key);
  const snap = await getDoc(ref);
  const currentTime = new Date().toISOString(); // Use regular timestamp instead of serverTimestamp()
  
  if (!snap.exists()) {
    await setDoc(ref, {
      candidateId,
      testId,
      status,
      switchCount: 1,
      timestamps: [currentTime],
      lastUpdated: serverTimestamp(),
    });
  } else {
    await updateDoc(ref, {
      status,
      switchCount: increment(1),
      timestamps: arrayUnion(currentTime),
      lastUpdated: serverTimestamp(),
    });
  }
}

// User profile helpers
export async function getUserProfile(uid) {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
