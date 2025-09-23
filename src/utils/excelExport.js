import * as XLSX from 'xlsx';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Export test submissions to Excel format
 * @param {Object} params - Export parameters
 * @param {Array} params.submissions - Array of submission objects
 * @param {Object} params.selectedTest - Test object with details
 * @param {Function} params.setLoading - Loading state setter
 * @returns {Promise<void>}
 */
export const exportSubmissionsToExcel = async ({ submissions, selectedTest, setLoading }) => {
  try {
    setLoading(true);
    
    // First, fetch the test questions to get actual question text
    let testQuestions = [];
    try {
      const testDoc = await getDoc(doc(db, 'tests', selectedTest.id));
      if (testDoc.exists()) {
        const testData = testDoc.data();
        testQuestions = testData.questions || [];
        console.log('Found test questions from tests collection:', testQuestions);
      } else {
        console.log('Test document not found in tests collection');
      }
      
      // If no questions found, try alternative collection names
      if (testQuestions.length === 0) {
        console.log('Trying alternative collection: test');
        const altTestDoc = await getDoc(doc(db, 'test', selectedTest.id));
        if (altTestDoc.exists()) {
          const altTestData = altTestDoc.data();
          testQuestions = altTestData.questions || [];
          console.log('Found test questions from test collection:', testQuestions);
        }
      }
      
      // If still no questions, try to get from selectedTest object itself
      if (testQuestions.length === 0 && selectedTest.questions) {
        testQuestions = selectedTest.questions;
        console.log('Found test questions from selectedTest object:', testQuestions);
      }
      
      // If still no questions, try to fetch from a questions subcollection
      if (testQuestions.length === 0) {
        console.log('Trying questions subcollection');
        try {
          const questionsSnapshot = await getDocs(collection(db, 'tests', selectedTest.id, 'questions'));
          if (!questionsSnapshot.empty) {
            testQuestions = questionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            console.log('Found test questions from subcollection:', testQuestions);
          }
        } catch (subError) {
          console.log('No questions subcollection found');
        }
      }
      
    } catch (error) {
      console.error('Error fetching test questions:', error);
    }

    // Debug: Log the submissions data structure
    console.log('=== EXCEL EXPORT DEBUG ===');
    console.log('Number of submissions:', submissions.length);
    console.log('First submission structure:', submissions[0]);
    console.log('Test questions:', testQuestions);

    // Fetch detailed user information and answers for each submission
    const enrichedSubmissions = await Promise.all(
      submissions.map(async (submission, submissionIndex) => {
        console.log(`\n--- Processing submission ${submissionIndex + 1} ---`);
        console.log('Submission data:', submission);
        
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
            console.error('Error fetching user data for export:', error);
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
        console.log('Checking answers for submission:', submission.id || submissionIndex);
        console.log('submission.answers exists?', !!submission.answers);
        console.log('submission.answers:', submission.answers);
        
        // Also check other possible answer fields
        console.log('Other possible fields:');
        console.log('- submission.responses:', submission.responses);
        console.log('- submission.userAnswers:', submission.userAnswers);
        console.log('- submission.candidateAnswers:', submission.candidateAnswers);
        console.log('- submission.testAnswers:', submission.testAnswers);
        
        if (submission.answers && typeof submission.answers === 'object') {
          // Get all answer keys that are not metadata
          const answerKeys = Object.keys(submission.answers).filter(key => 
            !key.includes('_notes') && 
            !key.includes('timestamp') && 
            !key.includes('metadata')
          );
          console.log('Filtered answer keys:', answerKeys);
          
          // If we have test questions, use them. Otherwise, use answer keys directly
          if (testQuestions.length > 0) {
            // Get all question IDs from the test (in order) and try to find answers for them
            testQuestions.forEach((question, index) => {
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
                  return (keyLower === `q${index + 1}` || 
                          keyLower === `question${index + 1}` ||
                          keyLower === `question_${index + 1}` ||
                          keyLower.includes(questionId.toLowerCase()) ||
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
              
              console.log(`Question ${index + 1}: "${questionText}" -> Answer: "${finalAnswer}"`);
            });
          } else {
            // No test questions found, try to create meaningful headers from answer content
            console.log('No test questions found, creating headers from answer content');
            
            // Common question patterns based on typical test content
            const commonQuestions = [
              "What is your favorite programming language?",
              "Write a C++ program to add two numbers",
              "Explain the concept of data structures and algorithms"
            ];
            
            answerKeys.forEach((answerKey, index) => {
              const answer = submission.answers[answerKey];
              
              // Try to create a meaningful header based on answer content and common patterns
              let columnHeader = `Question ${index + 1}`;
              
              if (answer && typeof answer === 'string') {
                // Use common question patterns if they match the answer type
                if (index < commonQuestions.length) {
                  if (answer.includes('#include') || answer.includes('int main') || answer.includes('cout') || answer.includes('printf')) {
                    columnHeader = commonQuestions[1]; // Programming question
                  } else if (answer.toLowerCase().includes('language') || answer.toLowerCase().includes('java') || answer.toLowerCase().includes('python') || answer.toLowerCase().includes('c++')) {
                    columnHeader = commonQuestions[0]; // Favorite language question
                  } else if (answer.toLowerCase().includes('data structure') || answer.toLowerCase().includes('algorithm')) {
                    columnHeader = commonQuestions[2]; // Data structures question
                  } else {
                    // Create header based on answer type/content
                    if (answer.length < 20 && !answer.includes('\n')) {
                      columnHeader = `Short Answer Question ${index + 1}`;
                    } else if (answer.length > 50) {
                      columnHeader = `Essay Question ${index + 1}`;
                    } else {
                      columnHeader = `Question ${index + 1}`;
                    }
                  }
                } else {
                  columnHeader = `Question ${index + 1}`;
                }
              }
              
              // Ensure we have a string answer, use "-" if no answer
              const finalAnswer = answer ? (typeof answer === 'string' ? answer : JSON.stringify(answer)) : '-';
              rowData[columnHeader] = finalAnswer;
              
              console.log(`${columnHeader} (Key: ${answerKey}) -> Answer: "${finalAnswer}"`);
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

        console.log('Final row data:', rowData);
        console.log('Row data keys:', Object.keys(rowData));
        
        return rowData;
      })
    );

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(enrichedSubmissions);

    // Get all column headers to set appropriate widths
    const headers = enrichedSubmissions.length > 0 ? Object.keys(enrichedSubmissions[0]) : [];
    const colWidths = headers.map(header => {
      if (header === 'Student Name') return { wch: 25 };
      if (header === 'Mobile Number') return { wch: 15 };
      if (header === 'Gmail ID') return { wch: 30 };
      if (header === 'Year') return { wch: 8 };
      if (header === 'Score Obtained') return { wch: 12 };
      if (header === 'Total Marks') return { wch: 12 };
      if (header === 'Percentage') return { wch: 12 };
      if (header === 'Submitted At') return { wch: 15 };
      // For question columns, use extra wide width for full-length answers
      return { wch: 60 };
    });
    
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, 'Test Results');

    // Generate filename with test title and date
    const fileName = `${selectedTest.title.replace(/[^a-zA-Z0-9]/g, '_')}_Results_${new Date().toISOString().split('T')[0]}.xlsx`;
    
    XLSX.writeFile(wb, fileName);
    
    alert('Excel file exported successfully!');
  } catch (error) {
    console.error('Error exporting to Excel:', error);
    alert('Failed to export Excel file. Please try again.');
  } finally {
    setLoading(false);
  }
};
