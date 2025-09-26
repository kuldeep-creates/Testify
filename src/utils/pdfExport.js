import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import { db } from '../firebase';

import Logger from './logger';
import { showSuccess, showError } from './notifications';

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
  let fileName = '';
  try {
    Logger.info('Starting PDF export', { submissions: submissions.length, test: selectedTest.title, exportType });
    setLoading(true);
    
    // First, fetch the test questions to get actual question text
    let testQuestions = [];
    Logger.debug('Starting question fetch for test', { testId: selectedTest.id });
    
    try {
      // 1) Prefer the questions subcollection (source of truth)
      Logger.debug('Fetching questions from subcollection');
      const questionsSnapshot = await getDocs(collection(db, 'tests', selectedTest.id, 'questions'));
      if (!questionsSnapshot.empty) {
        testQuestions = questionsSnapshot.docs.map(qDoc => {
          const data = qDoc.data();
          return { id: data.questionId || qDoc.id, ...data };
        });
        Logger.debug('Loaded questions from subcollection', { count: testQuestions.length });
      }

      // 2) Fallback: embedded questions in tests doc
      if (testQuestions.length === 0) {
        const testDoc = await getDoc(doc(db, 'tests', selectedTest.id));
        if (testDoc.exists()) {
          const testData = testDoc.data();
          testQuestions = testData.questions || testData.Questions || testData.testQuestions || testData.questionsList || [];
          if (testQuestions.length === 0 && testData.questions && typeof testData.questions === 'object' && !Array.isArray(testData.questions)) {
            testQuestions = Object.values(testData.questions);
          }
          Logger.debug('Loaded questions from tests doc', { count: testQuestions.length });
        } else {
          Logger.warn('Test document not found in tests collection');
        }
      }

      // 3) Legacy collection fallback
      if (testQuestions.length === 0) {
        const altTestDoc = await getDoc(doc(db, 'test', selectedTest.id));
        if (altTestDoc.exists()) {
          const altTestData = altTestDoc.data();
          testQuestions = altTestData.questions || [];
          Logger.debug('Loaded questions from legacy collection', { count: testQuestions.length });
        }
      }

      // 4) Prop fallback
      if (testQuestions.length === 0 && selectedTest.questions) {
        testQuestions = selectedTest.questions;
        Logger.debug('Loaded questions from selectedTest prop', { count: testQuestions.length });
      }
      
    } catch (error) {
      Logger.error('Error fetching test questions', null, error);
    }

    // Fetch detailed user information and answers for each submission
    const enrichedSubmissions = await Promise.all(
      submissions.map(async (submission) => {
        let userInfo = {
          fullName: submission.candidateName || 'Unknown',
          gmail: '',
          mobile: '',
          year: ''
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
                year: userData.year || ''
              };
            }
          } catch (error) {
            Logger.error('Error fetching user data for export', { candidateId: submission.candidateId }, error);
          }
        }

        // Create row with required order: Name, Mobile, Gmail, Year, then answers
        const rowData = [
          userInfo.fullName,
          userInfo.mobile,
          userInfo.gmail,
          userInfo.year
        ];

        // Add question answers if available
        if (submission.answers && typeof submission.answers === 'object') {
          const answerKeys = Object.keys(submission.answers).filter(key => 
            !key.includes('_notes') && 
            !key.includes('timestamp') && 
            !key.includes('metadata')
          );
          
          if (testQuestions.length > 0) {
            // Sort test questions by their original order to maintain sequence
            const sortedQuestions = [...testQuestions].sort((a, b) => {
              // Strategy 1: If questions have an 'order' or 'index' field, use that
              if (a.order !== undefined && b.order !== undefined) {
                return a.order - b.order;
              }
              if (a.index !== undefined && b.index !== undefined) {
                return a.index - b.index;
              }
              
              // Strategy 2: Sort by question ID if they're numeric
              const aId = parseInt(a.id);
              const bId = parseInt(b.id);
              if (!isNaN(aId) && !isNaN(bId)) {
                return aId - bId;
              }
              
              // Strategy 3: Sort by creation timestamp if available
              if (a.createdAt && b.createdAt) {
                return a.createdAt - b.createdAt;
              }
              
              // Strategy 4: Maintain original array order
              return testQuestions.indexOf(a) - testQuestions.indexOf(b);
            });
            
            Logger.debug('Question ordering', {
              original: testQuestions.map(q => ({ id: q.id, text: q.questionText?.substring(0, 30) })),
              sorted: sortedQuestions.map(q => ({ id: q.id, text: q.questionText?.substring(0, 30) }))
            });
            
            // Use sorted test questions to maintain sequence
            sortedQuestions.forEach((question, index) => {
              const questionId = question.id;
              let answer = '';
              
              // Try multiple strategies to find the answer
              if (submission.answers[questionId]) {
                answer = submission.answers[questionId];
              }
              else if (submission.answers[questionId.toString()]) {
                answer = submission.answers[questionId.toString()];
              }
              else if (submission.answers[index]) {
                answer = submission.answers[index];
              }
              else if (submission.answers[index.toString()]) {
                answer = submission.answers[index.toString()];
              }
              else {
                const possibleKeys = answerKeys.filter(key => {
                  const keyLower = key.toLowerCase();
                  const qidLower = String(questionId).toLowerCase();
                  return (keyLower === `q${index + 1}` || 
                          keyLower === `question${index + 1}` ||
                          keyLower === `question_${index + 1}` ||
                          keyLower.includes(qidLower) ||
                          key === (index + 1).toString());
                });
                
                if (possibleKeys.length > 0) {
                  answer = submission.answers[possibleKeys[0]];
                }
                // Fallback strategy
                else if (answerKeys.length === testQuestions.length && index < answerKeys.length) {
                  answer = submission.answers[answerKeys[index]];
                }
              }
              
              // Show full answer without truncation, use "-" if no answer
              const displayAnswer = answer ? (typeof answer === 'string' ? answer : JSON.stringify(answer)) : '-';
              rowData.push(displayAnswer);
            });
          } else {
            // No test questions found, use answer keys directly with smart inference
            Logger.warn('No test questions found, using answer keys directly');
            answerKeys.forEach((answerKey) => {
              const answer = submission.answers[answerKey];
              // Show full answer without truncation, use "-" if no answer
              const displayAnswer = answer ? (typeof answer === 'string' ? answer : JSON.stringify(answer)) : '-';
              rowData.push(displayAnswer);
            });
          }
        } else {
          // If no answers object, add "-" for each question or answer key
          if (testQuestions.length > 0) {
            testQuestions.forEach(() => {
              rowData.push('-');
            });
          } else {
            // Add at least 3 empty columns if no questions or answers
            for (let i = 0; i < 3; i++) {
              rowData.push('-');
            }
          }
        }

        // Add summary information at the end
        rowData.push(
          submission.totalMarksAwarded || 0,
          `${submission.score || 0}%`,
          submission.status || 'submitted'
        );

        return rowData;
      })
    );

    // Create PDF document
    const pdfDoc = new jsPDF('landscape'); // Use landscape for more columns
    Logger.debug('PDF document created successfully');
    
    // Add title based on export type
    pdfDoc.setFontSize(16);
    const titlePrefix = exportType === 'admin' ? 'Admin Export - ' : '';
    pdfDoc.text(`${titlePrefix}Test Results: ${selectedTest.title}`, 14, 22);
    
    // Add test info
    pdfDoc.setFontSize(10);
    pdfDoc.text(`Domain: ${selectedTest.branch || selectedTest.domain || 'N/A'}`, 14, 32);
    pdfDoc.text(`Total Marks: ${selectedTest.totalMarks || 100}`, 14, 38);
    pdfDoc.text(`Export Date: ${new Date().toLocaleDateString()}`, 14, 44);
    pdfDoc.text(`Total Submissions: ${submissions.length}`, 14, 50);

    // Create dynamic headers based on questions
    const baseHeaders = ['Student Name', 'Mobile', 'Gmail ID', 'Year'];
    const questionHeaders = [];
    
    // Get question count from test and create short headers
    if (testQuestions.length > 0) {
      // Sort test questions by their original order to maintain sequence (same logic as data processing)
      const sortedQuestions = [...testQuestions].sort((a, b) => {
        // Strategy 1: If questions have an 'order' or 'index' field, use that
        if (a.order !== undefined && b.order !== undefined) {
          return a.order - b.order;
        }
        if (a.index !== undefined && b.index !== undefined) {
          return a.index - b.index;
        }
        
        // Strategy 2: Sort by question ID if they're numeric
        const aId = parseInt(a.id);
        const bId = parseInt(b.id);
        if (!isNaN(aId) && !isNaN(bId)) {
          return aId - bId;
        }
        
        // Strategy 3: Sort by creation timestamp if available
        if (a.createdAt && b.createdAt) {
          return a.createdAt - b.createdAt;
        }
        
        // Strategy 4: Maintain original array order
        return testQuestions.indexOf(a) - testQuestions.indexOf(b);
      });
      
      sortedQuestions.forEach((question, index) => {
        // Use full question text instead of truncated version
        const fullHeader = question.questionText 
          ? `Q${index + 1}: ${question.questionText}`
          : `Q${index + 1}`;
        questionHeaders.push(fullHeader);
      });
    } else {
      // If no test questions, create neutral headers based on the first submission's answer count
      Logger.warn('No test questions found, using neutral headers');
      if (submissions.length > 0 && submissions[0].answers) {
        const answerKeys = Object.keys(submissions[0].answers).filter(key => 
          !key.includes('_notes') && 
          !key.includes('timestamp') && 
          !key.includes('metadata')
        );
        for (let i = 1; i <= answerKeys.length; i++) {
          questionHeaders.push(`Q${i}`);
        }
      } else {
        // Default to 3 neutral headers if we can't determine
        for (let i = 1; i <= 3; i++) {
          questionHeaders.push(`Q${i}`);
        }
      }
    }
    
    const summaryHeaders = ['Score', '%', 'Status'];
    const allHeaders = [...baseHeaders, ...questionHeaders, ...summaryHeaders];

    // Set header color based on export type
    const headerColor = exportType === 'admin' ? [59, 130, 246] : [147, 51, 234]; // Blue for admin, Purple for head

    // Add table using autoTable
    Logger.debug('Adding table to PDF', { headerCount: allHeaders.length });
    
    // Use the imported autoTable function
    autoTable(pdfDoc, {
      head: [allHeaders],
      body: enrichedSubmissions,
      startY: 60,
      styles: { fontSize: 7 },
      headStyles: { fillColor: headerColor },
      columnStyles: {
        0: { cellWidth: 25 }, // Student Name
        1: { cellWidth: 20 }, // Mobile
        2: { cellWidth: 30 }, // Gmail ID
        3: { cellWidth: 12 }, // Year
        // Wider columns for full-length answers
        ...Object.fromEntries(
          questionHeaders.map((_, index) => [index + 4, { cellWidth: 40 }])
        )
      },
      margin: { left: 14, right: 14 },
      // Handle empty cells
      didParseCell: function (data) {
        if (data.cell.text[0] === '' || data.cell.text[0] === null || data.cell.text[0] === undefined) {
          data.cell.text = ['-'];
        }
      }
    });

    // Generate filename with test title and date
    const filePrefix = exportType === 'admin' ? 'Admin_' : '';
    fileName = `${selectedTest.title.replace(/[^a-zA-Z0-9]/g, '_')}_${filePrefix}Results_${new Date().toISOString().split('T')[0]}.pdf`;
    
    Logger.info('Saving PDF file', { fileName });
    pdfDoc.save(fileName);
    
    showSuccess('PDF file exported successfully!');
  } catch (error) {
    Logger.error('Error exporting to PDF', { fileName }, error);
    showError(`Failed to export PDF file: ${error.message}. Please try again.`, error);
  } finally {
    setLoading(false);
  }
};
