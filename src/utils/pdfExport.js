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
    console.log('Starting PDF export with:', { submissions: submissions.length, test: selectedTest.title, exportType });
    setLoading(true);
    
    // First, fetch the test questions to get actual question text
    let testQuestions = [];
    try {
      const testDoc = await getDoc(doc(db, 'tests', selectedTest.id));
      if (testDoc.exists()) {
        const testData = testDoc.data();
        testQuestions = testData.questions || [];
        console.log('PDF: Found test questions from tests collection:', testQuestions);
      } else {
        console.log('PDF: Test document not found in tests collection');
      }
      
      // If no questions found, try alternative collection names
      if (testQuestions.length === 0) {
        console.log('PDF: Trying alternative collection: test');
        const altTestDoc = await getDoc(doc(db, 'test', selectedTest.id));
        if (altTestDoc.exists()) {
          const altTestData = altTestDoc.data();
          testQuestions = altTestData.questions || [];
          console.log('PDF: Found test questions from test collection:', testQuestions);
        }
      }
      
      // If still no questions, try to get from selectedTest object itself
      if (testQuestions.length === 0 && selectedTest.questions) {
        testQuestions = selectedTest.questions;
        console.log('PDF: Found test questions from selectedTest object:', testQuestions);
      }
      
      // If still no questions, try to fetch from a questions subcollection
      if (testQuestions.length === 0) {
        console.log('PDF: Trying questions subcollection');
        try {
          const questionsSnapshot = await getDocs(collection(db, 'tests', selectedTest.id, 'questions'));
          if (!questionsSnapshot.empty) {
            testQuestions = questionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            console.log('PDF: Found test questions from subcollection:', testQuestions);
          }
        } catch (subError) {
          console.log('PDF: No questions subcollection found');
        }
      }
      
    } catch (error) {
      console.error('Error fetching test questions:', error);
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
            console.error('Error fetching user data for export:', error);
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
            // Use test questions if available
            testQuestions.forEach((question, index) => {
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
                  return (keyLower === `q${index + 1}` || 
                          keyLower === `question${index + 1}` ||
                          keyLower === `question_${index + 1}` ||
                          keyLower.includes(questionId.toLowerCase()) ||
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
            console.log('PDF: No test questions found, using answer keys directly');
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
    console.log('PDF document created successfully');
    
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
      testQuestions.forEach((question, index) => {
        const shortHeader = question.questionText && question.questionText.length > 15 
          ? `Q${index + 1}: ${question.questionText.substring(0, 15)}...`
          : `Q${index + 1}`;
        questionHeaders.push(shortHeader);
      });
    } else {
      // If no test questions, use smart inference based on first submission's answers
      if (submissions.length > 0 && submissions[0].answers) {
        const answerKeys = Object.keys(submissions[0].answers).filter(key => 
          !key.includes('_notes') && 
          !key.includes('timestamp') && 
          !key.includes('metadata')
        );
        
        // Common question patterns for PDF headers (shorter for space)
        const commonQuestions = [
          "Favorite Language",
          "C++ Program",
          "Data Structures"
        ];
        
        answerKeys.forEach((answerKey, index) => {
          const answer = submissions[0].answers[answerKey];
          let shortHeader = `Q${index + 1}`;
          
          if (answer && typeof answer === 'string') {
            // Use common question patterns if they match the answer type
            if (index < commonQuestions.length) {
              if (answer.includes('#include') || answer.includes('int main') || answer.includes('cout') || answer.includes('printf')) {
                shortHeader = commonQuestions[1]; // Programming question
              } else if (answer.toLowerCase().includes('language') || answer.toLowerCase().includes('java') || answer.toLowerCase().includes('python') || answer.toLowerCase().includes('c++')) {
                shortHeader = commonQuestions[0]; // Favorite language question
              } else if (answer.toLowerCase().includes('data structure') || answer.toLowerCase().includes('algorithm')) {
                shortHeader = commonQuestions[2]; // Data structures question
              } else {
                // Create header based on answer type/content
                if (answer.includes('#include') || answer.includes('cout')) {
                  shortHeader = `Code Q${index + 1}`;
                } else if (answer.length < 20 && !answer.includes('\n')) {
                  shortHeader = `Short Q${index + 1}`;
                } else if (answer.length > 50) {
                  shortHeader = `Essay Q${index + 1}`;
                } else {
                  shortHeader = `Q${index + 1}`;
                }
              }
            } else {
              shortHeader = `Q${index + 1}`;
            }
          }
          
          questionHeaders.push(shortHeader);
        });
      } else {
        // Default to 3 questions if we can't determine
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
    console.log('Adding table with headers:', allHeaders);
    
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
    const fileName = `${selectedTest.title.replace(/[^a-zA-Z0-9]/g, '_')}_${filePrefix}Results_${new Date().toISOString().split('T')[0]}.pdf`;
    
    console.log('Saving PDF with filename:', fileName);
    pdfDoc.save(fileName);
    
    alert('PDF file exported successfully!');
  } catch (error) {
    console.error('Error exporting to PDF:', error);
    console.error('Error details:', error.message, error.stack);
    alert(`Failed to export PDF file: ${error.message}. Please try again.`);
  } finally {
    setLoading(false);
  }
};
