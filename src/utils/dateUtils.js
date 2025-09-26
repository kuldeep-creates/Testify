/**
 * Date and time utility functions
 * Centralized date formatting to avoid code duplication
 */

/**
 * Format a timestamp to a localized date and time string
 * @param {*} timestamp - Firestore timestamp, Date object, or timestamp
 * @returns {string} - Formatted date string or 'N/A' if invalid
 */
export const formatDateTime = (timestamp) => {
  if (!timestamp) {return 'N/A';}
  
  // Handle Firestore timestamp
  if (timestamp.toDate && typeof timestamp.toDate === 'function') {
    return timestamp.toDate().toLocaleString();
  }
  
  // Handle timestamp with seconds property (Firestore format)
  if (timestamp.seconds) {
    return new Date(timestamp.seconds * 1000).toLocaleString();
  }
  
  // Handle regular Date object or timestamp
  const date = new Date(timestamp);
  return isNaN(date.getTime()) ? 'N/A' : date.toLocaleString();
};

/**
 * Format a timestamp to a localized date string only
 * @param {*} timestamp - Firestore timestamp, Date object, or timestamp
 * @returns {string} - Formatted date string or 'N/A' if invalid
 */
export const formatDate = (timestamp) => {
  if (!timestamp) {return 'N/A';}
  
  // Handle Firestore timestamp
  if (timestamp.toDate && typeof timestamp.toDate === 'function') {
    return timestamp.toDate().toLocaleDateString();
  }
  
  // Handle timestamp with seconds property (Firestore format)
  if (timestamp.seconds) {
    return new Date(timestamp.seconds * 1000).toLocaleDateString();
  }
  
  // Handle regular Date object or timestamp
  const date = new Date(timestamp);
  return isNaN(date.getTime()) ? 'N/A' : date.toLocaleDateString();
};

/**
 * Format seconds into MM:SS format
 * @param {number} seconds - Number of seconds
 * @returns {string} - Formatted time string
 */
export const formatTime = (seconds) => {
  if (!seconds || seconds < 0) {return '00:00';}
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
};

/**
 * Get time difference in minutes
 * @param {*} startTime - Start timestamp
 * @param {*} endTime - End timestamp
 * @returns {number} - Difference in minutes
 */
export const getTimeDifferenceInMinutes = (startTime, endTime) => {
  if (!startTime || !endTime) {return 0;}
  
  const start = startTime.toDate ? startTime.toDate() : new Date(startTime);
  const end = endTime.toDate ? endTime.toDate() : new Date(endTime);
  
  return Math.round((end - start) / (1000 * 60));
};
