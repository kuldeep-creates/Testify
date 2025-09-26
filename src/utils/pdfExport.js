import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Export test submissions to PDF format
 * @param {Object} params - Export parameters
 * @param {Array} params.submissions - Array of submission objects
 * @param {Object} params.selectedTest - Test object with details
 * @param {Function} params.setLoading - Loading state setter
 * @param {string} params.exportType - 'head' or 'admin' for different styling
 * @returns {Promise<void>}
 */
export const exportSubmissionsToPDF = async ({ submissions, selectedTest, setLoading, exportType = 'head' }) => {
  try {
    setLoading(true);

    // Fetch test questions
    let testQuestions = [];
    try {
      // 1) Prefer the questions subcollection
      const questionsSnapshot = await getDocs(collection(db, 'tests', selectedTest.id, 'questions'));
      if (!questionsSnapshot.empty) {
        testQuestions = questionsSnapshot.docs.map(qDoc => {
          const data = qDoc.data();
          return { id: data.questionId || qDoc.id, ...data };
        });
      }

      // 2) Fallback: embedded questions
      if (testQuestions.length === 0) {
        const testDoc = await getDoc(doc(db, 'tests', selectedTest.id));
        if (testDoc.exists()) {
          const testData = testDoc.data();
          testQuestions =
            testData.questions ||
            testData.Questions ||
            testData.testQuestions ||
            testData.questionsList ||
            [];
          if (
            testQuestions.length === 0 &&
            testData.questions &&
            typeof testData.questions === 'object' &&
            !Array.isArray(testData.questions)
          ) {
            testQuestions = Object.values(testData.questions);
          }
        }
      }

      // 3) Legacy fallback
      if (testQuestions.length === 0) {
        const altTestDoc = await getDoc(doc(db, 'test', selectedTest.id));
        if (altTestDoc.exists()) {
          const altTestData = altTestDoc.data();
          testQuestions = altTestData.questions || [];
        }
      }

      // 4) Prop fallback
      if (testQuestions.length === 0 && selectedTest.questions) {
        testQuestions = selectedTest.questions;
      }
    } catch (err) {
      console.error('Error fetching questions:', err);
    }

    // Fetch user info + answers
    const enrichedSubmissions = await Promise.all(
      submissions.map(async submission => {
        let userInfo = {
          fullName: submission.candidateName || 'Unknown',
          gmail: '',
          mobile: '',
          year: '',
        };

        if (submission.candidateId) {
          try {
            const userDoc = await getDoc(doc(db, 'user', submission.candidateId));
            if (userDoc.exists()) {
              const userData = userDoc.data();
              userInfo = {
                fullName: userData.fullName || userData.name || submission.candidateName || 'Unknown',
                gmail: userData.gmail || userData.email || '',
                mobile: userData.mobile || userData.phone || '',
                year: userData.year || '',
              };
            }
          } catch (error) {
            console.error('Error fetching user data for export:', error);
          }
        }

        const rowData = [userInfo.fullName, userInfo.mobile, userInfo.gmail, userInfo.year];

        // Add answers
        if (submission.answers && typeof submission.answers === 'object') {
          const answerKeys = Object.keys(submission.answers).filter(
            key => !key.includes('_notes') && !key.includes('timestamp') && !key.includes('metadata')
          );

          if (testQuestions.length > 0) {
            const sortedQuestions = [...testQuestions].sort((a, b) => {
              if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
              if (a.index !== undefined && b.index !== undefined) return a.index - b.index;
              const aId = parseInt(a.id);
              const bId = parseInt(b.id);
              if (!isNaN(aId) && !isNaN(bId)) return aId - bId;
              if (a.createdAt && b.createdAt) return a.createdAt - b.createdAt;
              return testQuestions.indexOf(a) - testQuestions.indexOf(b);
            });

            sortedQuestions.forEach((question, index) => {
              const questionId = question.id;
              let answer = '';

              if (submission.answers[questionId]) answer = submission.answers[questionId];
              else if (submission.answers[String(questionId)]) answer = submission.answers[String(questionId)];
              else if (submission.answers[index]) answer = submission.answers[index];
              else if (submission.answers[String(index)]) answer = submission.answers[String(index)];
              else {
                const possibleKeys = answerKeys.filter(key => {
                  const keyLower = key.toLowerCase();
                  const qidLower = String(questionId).toLowerCase();
                  return (
                    keyLower === `q${index + 1}` ||
                    keyLower === `question${index + 1}` ||
                    keyLower === `question_${index + 1}` ||
                    keyLower.includes(qidLower) ||
                    key === String(index + 1)
                  );
                });
                if (possibleKeys.length > 0) answer = submission.answers[possibleKeys[0]];
                else if (answerKeys.length === testQuestions.length && index < answerKeys.length) {
                  answer = submission.answers[answerKeys[index]];
                }
              }

              rowData.push(answer ? (typeof answer === 'string' ? answer : JSON.stringify(answer)) : '-');
            });
          } else {
            answerKeys.forEach(key => {
              const answer = submission.answers[key];
              rowData.push(answer ? (typeof answer === 'string' ? answer : JSON.stringify(answer)) : '-');
            });
          }
        } else {
          if (testQuestions.length > 0) testQuestions.forEach(() => rowData.push('-'));
          else for (let i = 0; i < 3; i++) rowData.push('-');
        }

        rowData.push(submission.totalMarksAwarded || 0, `${submission.score || 0}%`, submission.status || 'submitted');
        return rowData;
      })
    );

    // Create PDF
    const pdfDoc = new jsPDF('landscape');
    pdfDoc.setFontSize(16);
    const titlePrefix = exportType === 'admin' ? 'Admin Export - ' : '';
    pdfDoc.text(`${titlePrefix}Test Results: ${selectedTest.title}`, 14, 22);

    pdfDoc.setFontSize(10);
    pdfDoc.text(`Domain: ${selectedTest.branch || selectedTest.domain || 'N/A'}`, 14, 32);
    pdfDoc.text(`Total Marks: ${selectedTest.totalMarks || 100}`, 14, 38);
    pdfDoc.text(`Export Date: ${new Date().toLocaleDateString()}`, 14, 44);
    pdfDoc.text(`Total Submissions: ${submissions.length}`, 14, 50);

    // Headers
    const baseHeaders = ['Student Name', 'Mobile', 'Gmail ID', 'Year'];
    const questionHeaders = [];

    if (testQuestions.length > 0) {
      const sortedQuestions = [...testQuestions].sort((a, b) => {
        if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
        if (a.index !== undefined && b.index !== undefined) return a.index - b.index;
        const aId = parseInt(a.id);
        const bId = parseInt(b.id);
        if (!isNaN(aId) && !isNaN(bId)) return aId - bId;
        if (a.createdAt && b.createdAt) return a.createdAt - b.createdAt;
        return testQuestions.indexOf(a) - testQuestions.indexOf(b);
      });
      sortedQuestions.forEach((q, i) => {
        questionHeaders.push(q.questionText ? `Q${i + 1}: ${q.questionText}` : `Q${i + 1}`);
      });
    } else {
      if (submissions.length > 0 && submissions[0].answers) {
        const keys = Object.keys(submissions[0].answers).filter(
          k => !k.includes('_notes') && !k.includes('timestamp') && !k.includes('metadata')
        );
        for (let i = 1; i <= keys.length; i++) questionHeaders.push(`Q${i}`);
      } else {
        for (let i = 1; i <= 3; i++) questionHeaders.push(`Q${i}`);
      }
    }

    const summaryHeaders = ['Score', '%', 'Status'];
    const allHeaders = [...baseHeaders, ...questionHeaders, ...summaryHeaders];
    const headerColor = exportType === 'admin' ? [59, 130, 246] : [147, 51, 234];

    autoTable(pdfDoc, {
      head: [allHeaders],
      body: enrichedSubmissions,
      startY: 60,
      styles: { fontSize: 7 },
      headStyles: { fillColor: headerColor },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 20 },
        2: { cellWidth: 30 },
        3: { cellWidth: 12 },
        ...Object.fromEntries(questionHeaders.map((_, i) => [i + 4, { cellWidth: 40 }])),
      },
      margin: { left: 14, right: 14 },
      didParseCell: data => {
        if (!data.cell.text || !data.cell.text[0]) {
          data.cell.text = ['-'];
        }
      },
    });

    const filePrefix = exportType === 'admin' ? 'Admin_' : '';
    const fileName = `${selectedTest.title.replace(/[^a-zA-Z0-9]/g, '_')}_${filePrefix}Results_${
      new Date().toISOString().split('T')[0]
    }.pdf`;

    pdfDoc.save(fileName);
    alert('PDF file exported successfully!');
  } catch (error) {
    console.error('Error exporting to PDF:', error);
    alert(`Failed to export PDF file: ${error.message}. Please try again.`);
  } finally {
    setLoading(false);
  }
};
