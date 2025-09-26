/**
 * Centralized logging utility for Testify
 * Provides environment-based logging with proper error handling
 */

// Log levels
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

// Current log level based on environment
const getCurrentLogLevel = () => {
  if (process.env.NODE_ENV === 'production') {
    return LOG_LEVELS.ERROR;
  } else if (process.env.NODE_ENV === 'test') {
    return LOG_LEVELS.WARN;
  } else {
    return LOG_LEVELS.DEBUG; // Development
  }
};

const currentLogLevel = getCurrentLogLevel();

/**
 * Logger class with environment-based filtering
 */
class Logger {
  static error(message, data = null, error = null) {
    if (currentLogLevel >= LOG_LEVELS.ERROR) {
      console.error(`[ERROR] ${message}`, data || '', error || '');
      
      // Production error monitoring integration point
      // Replace this block with your preferred monitoring service (Sentry, DataDog, etc.)
      if (process.env.NODE_ENV === 'production' && error) {
        // Example: Sentry.captureException(error, { extra: data });
      }
    }
  }

  static warn(message, data = null) {
    if (currentLogLevel >= LOG_LEVELS.WARN) {
      console.warn(`[WARN] ${message}`, data || '');
    }
  }

  static info(message, data = null) {
    if (currentLogLevel >= LOG_LEVELS.INFO) {
      console.info(`[INFO] ${message}`, data || '');
    }
  }

  static debug(message, data = null) {
    if (currentLogLevel >= LOG_LEVELS.DEBUG) {
      console.log(`[DEBUG] ${message}`, data || '');
    }
  }

  // Special method for development-only debugging
  static dev(message, data = null) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DEV] ${message}`, data || '');
    }
  }
}

export default Logger;
