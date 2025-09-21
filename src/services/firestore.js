import { addDoc, arrayUnion, collection, doc, getDoc, getDocs, increment, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

// Tests
export async function fetchTestWithQuestions(testId) {
  const testRef = doc(db, 'tests', testId);
  const testSnap = await getDoc(testRef);
  if (!testSnap.exists()) return null;
  const qSnap = await getDocs(collection(testRef, 'questions'));
  const questions = qSnap.docs.map(d => {
    const questionData = d.data();
    console.log('Raw question data from Firestore:', questionData);
    return { 
      id: questionData.questionId || d.id, // Use questionId from data, fallback to doc id
      ...questionData 
    };
  });
  console.log('All questions fetched:', questions);
  return { id: testSnap.id, ...testSnap.data(), questions };
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
