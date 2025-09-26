/**
 * Notification utility to replace alert() calls
 * Provides better UX with toast notifications or proper error handling
 */

/**
 * Show success notification
 * @param {string} message - Success message to display
 * @param {Function} callback - Optional callback after notification
 */
export const showSuccess = (message, callback = null) => {
  // Silent in development - no console output
  
  // Show alert for critical success messages that require user acknowledgment
  if (message.includes('exported') || message.includes('submitted') || message.includes('updated')) {
    alert(message);
  }
  
  if (callback) {
    setTimeout(callback, 100);
  }
};

/**
 * Show error notification
 * @param {string} message - Error message to display
 * @param {Error} error - Optional error object for logging
 * @param {Function} callback - Optional callback after notification
 */
export const showError = (message, error = null, callback = null) => {
  // Silent in development - no console output
  
  // Show alert for critical errors that require immediate user attention
  alert(message);
  
  if (callback) {
    setTimeout(callback, 100);
  }
};

/**
 * Show warning notification
 * @param {string} message - Warning message to display
 * @param {Function} callback - Optional callback after notification
 */
export const showWarning = (message, callback = null) => {
  // Silent in development - no console output
  
  if (callback) {
    setTimeout(callback, 100);
  }
};

/**
 * Show info notification
 * @param {string} message - Info message to display
 * @param {Function} callback - Optional callback after notification
 */
export const showInfo = (message, callback = null) => {
  // Silent in development - no console output
  
  if (callback) {
    setTimeout(callback, 100);
  }
};

/**
 * Confirm action with user
 * @param {string} message - Confirmation message
 * @param {Function} onConfirm - Callback if user confirms
 * @param {Function} onCancel - Callback if user cancels
 */
export const confirmAction = (message, onConfirm = null, onCancel = null) => {
  const result = window.confirm(message);
  
  if (result && onConfirm) {
    onConfirm();
  } else if (!result && onCancel) {
    onCancel();
  }
  
  return result;
};
