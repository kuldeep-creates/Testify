import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import ExcelJS from 'exceljs';

import { db } from '../firebase';

import Logger from './logger';
import { showSuccess, showError } from './notifications';

/**
 * Export test submissions to Excel format
 * @param {Object} params - Export parameters
{{ ... }}
 * @param {Array} params.submissions - Array of submission objects
 * @param {Object} params.selectedTest - Test object with details
 * @param {Function} params.setLoading - Loading state setter
 * @returns {Promise<void>}
 */
export const exportSubmissionsToExcel = async ({ submissions, selectedTest, setLoading }) => {
  let fileName = '';
  try {
    setLoading(true);
    
    // First, fetch the test questions to get actual question text
    let testQuestions = [];
    try {
      // 1) Prefer the questions subcollection (source of truth used elsewhere in app)
      Logger.debug('Fetching questions from subcollection');
      const questionsSnapshot = await getDocs(collection(db, 'tests', selectedTest.id, 'questions'));
      if (!questionsSnapshot.empty) {
        testQuestions = questionsSnapshot.docs.map(qDoc => {
          const data = qDoc.data();
          return {
            id: data.questionId || qDoc.id,
            ...data,
          };
        });
        Logger.debug('Loaded questions from subcollection', { count: testQuestions.length });
      }

      // 2) Fallback to embedded questions array on tests doc
      if (testQuestions.length === 0) {
        Logger.debug('Subcollection empty, trying embedded questions');
        const testDoc = await getDoc(doc(db, 'tests', selectedTest.id));
        if (testDoc.exists()) {
          const testData = testDoc.data();
          testQuestions = testData.questions || [];
          Logger.debug('Loaded embedded questions from tests doc', { count: testQuestions.length });
        }
      }

      // 3) Alternate collection name (legacy)
      if (testQuestions.length === 0) {
        Logger.debug('Trying legacy collection');
        const altTestDoc = await getDoc(doc(db, 'test', selectedTest.id));
        if (altTestDoc.exists()) {
          const altTestData = altTestDoc.data();
          testQuestions = altTestData.questions || [];
          Logger.debug('Loaded questions from legacy collection', { count: testQuestions.length });
        }
      }

      // 4) Fallback to selectedTest object (runtime state)
      if (testQuestions.length === 0 && selectedTest.questions) {
        testQuestions = selectedTest.questions;
        Logger.debug('Loaded questions from selectedTest prop', { count: testQuestions.length });
      }
    } catch (error) {
      Logger.error('Error fetching test questions', null, error);
    }

    Logger.debug('Excel export data structure', {
      submissionCount: submissions.length,
      hasFirstSubmission: !!submissions[0],
      questionCount: testQuestions.length
    });

    // Fetch detailed user information and answers for each submission
    const enrichedSubmissions = await Promise.all(
      submissions.map(async (submission, submissionIndex) => {
        Logger.debug(`Processing submission ${submissionIndex + 1}`, { submissionId: submission.id });
        
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

        // Create base row data with required columns first
        const rowData = {
          'Student Name': userInfo.fullName,
          'Mobile Number': userInfo.mobile,
          'Gmail ID': userInfo.gmail,
          'Year': userInfo.year
        };

        // Add question answers with actual question text as headers
        Logger.debug('Processing submission answers', {
          submissionId: submission.id || submissionIndex,
          hasAnswers: !!submission.answers,
          answerKeys: submission.answers ? Object.keys(submission.answers) : []
        });
        
        if (submission.answers && typeof submission.answers === 'object') {
          // Get all answer keys that are not metadata
          const answerKeys = Object.keys(submission.answers).filter(key => 
            !key.includes('_notes') && 
            !key.includes('timestamp') && 
            !key.includes('metadata')
          );
          Logger.debug('Filtered answer keys', { keys: answerKeys });
          
          // If we have test questions, use them. Otherwise, use answer keys directly
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
            
            Logger.debug('Question ordering for Excel', {
              originalCount: testQuestions.length,
              sortedCount: sortedQuestions.length
            });
            
            // Get all question IDs from the test (in sorted order) and try to find answers for them
            sortedQuestions.forEach((question, index) => {
              const questionId = question.id;
              const questionText = question.questionText || `Question ${index + 1}`;
              
              // Try multiple strategies to find the answer
              let answer = '';
              
              // Strategy 1: Direct question ID match
              if (submission.answers[questionId]) {
                answer = submission.answers[questionId];
              }
              // Strategy 2: String version of question ID
              else if (submission.answers[questionId.toString()]) {
                answer = submission.answers[questionId.toString()];
              }
              // Strategy 3: Try index-based keys (0, 1, 2...)
              else if (submission.answers[index]) {
                answer = submission.answers[index];
              }
              else if (submission.answers[index.toString()]) {
                answer = submission.answers[index.toString()];
              }
              // Strategy 4: Try question number patterns (q1, q2, question1, etc.)
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
              }
              
              // Strategy 5: Fallback - use answers by order if we have the same number of questions and answers
              if (!answer && answerKeys.length === testQuestions.length && index < answerKeys.length) {
                answer = submission.answers[answerKeys[index]];
              }
              
              // Use full question text as column header (no truncation)
              const columnHeader = questionText;
              
              // Ensure we have a string answer, use "-" if no answer
              const finalAnswer = answer ? (typeof answer === 'string' ? answer : JSON.stringify(answer)) : '-';
              rowData[columnHeader] = finalAnswer;
              
              Logger.debug(`Question ${index + 1} processed`, { hasAnswer: !!answer });
            });
          } else {
            // No test questions found; create neutral headers without dummy text
            Logger.warn('No test questions found, using neutral headers');
            answerKeys.forEach((answerKey, index) => {
              const answer = submission.answers[answerKey];
              const columnHeader = `Question ${index + 1}`;
              const finalAnswer = answer ? (typeof answer === 'string' ? answer : JSON.stringify(answer)) : '-';
              rowData[columnHeader] = finalAnswer;
              Logger.debug(`Column processed: ${columnHeader}`, { hasAnswer: !!answer });
            });
          }
        } else {
          // If no answers object, add empty columns for each question
          testQuestions.forEach((question, index) => {
            const questionText = question.questionText || `Question ${index + 1}`;
            const columnHeader = questionText.length > 50 
              ? questionText.substring(0, 50) + '...' 
              : questionText;
            rowData[columnHeader] = '-';
          });
        }

        // Add summary information at the end
        rowData['Score Obtained'] = submission.totalMarksAwarded || 0;
        rowData['Percentage'] = `${submission.score || 0}%`;
        rowData['Submitted At'] = submission.submittedAt?.toDate?.()?.toLocaleDateString() || 'N/A';

        Logger.debug('Row data processed', { columnCount: Object.keys(rowData).length });
        return rowData;
      })
    );

    // Create workbook and worksheet using ExcelJS
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Test Results');

    // Get all column headers
    const headers = enrichedSubmissions.length > 0 ? Object.keys(enrichedSubmissions[0]) : [];
    
    // Add headers to worksheet
    worksheet.addRow(headers);
    
    // Add data rows
    enrichedSubmissions.forEach(submission => {
      const row = headers.map(header => submission[header] || '');
      worksheet.addRow(row);
    });
    
    // Set column widths
    headers.forEach((header, index) => {
      const column = worksheet.getColumn(index + 1);
      if (header === 'Student Name') { column.width = 25; }
      else if (header === 'Mobile Number') { column.width = 15; }
      else if (header === 'Gmail ID') { column.width = 30; }
      else if (header === 'Year') { column.width = 8; }
      else if (header === 'Score Obtained') { column.width = 12; }
      else if (header === 'Total Marks') { column.width = 12; }
      else if (header === 'Percentage') { column.width = 12; }
      else if (header === 'Submitted At') { column.width = 15; }
      else { column.width = 60; } // For question columns
    });
    
    // Style the header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // Generate filename with test title and date
    fileName = `${selectedTest.title.replace(/[^a-zA-Z0-9]/g, '_')}_Results_${new Date().toISOString().split('T')[0]}.xlsx`;
    
    // Write file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    window.URL.revokeObjectURL(url);
    
    showSuccess('Excel file exported successfully!');
  } catch (error) {
    Logger.error('Error exporting to Excel', { fileName }, error);
    showError('Failed to export Excel file. Please try again.', error);
  } finally {
    setLoading(false);
  }
};
