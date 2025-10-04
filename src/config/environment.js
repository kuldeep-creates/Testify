/**
 * Environment Configuration
 * Centralized configuration management for Testify
 */

// Validate required environment variables
const requiredEnvVars = [
  'REACT_APP_FIREBASE_API_KEY',
  'REACT_APP_FIREBASE_AUTH_DOMAIN',
  'REACT_APP_FIREBASE_PROJECT_ID',
  'REACT_APP_FIREBASE_STORAGE_BUCKET',
  'REACT_APP_FIREBASE_MESSAGING_SENDER_ID',
  'REACT_APP_FIREBASE_APP_ID'
];

// Check for missing environment variables
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0 && process.env.NODE_ENV !== 'test') {
  console.error('❌ Missing required environment variables:');
  missingEnvVars.forEach(envVar => {
    console.error(`   - ${envVar}`);
  });
  console.error('\n📝 Please check your .env file and ensure all required variables are set.');
  console.error('📋 See .env.example for reference.');

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Missing required environment variables in production');
  }
}

// Firebase Configuration - Production Ready (No Hardcoded Secrets)
export const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID
};

// Validate all required Firebase config
const requiredFirebaseKeys = Object.keys(firebaseConfig);
const missingKeys = requiredFirebaseKeys.filter(key => !firebaseConfig[key]);

if (missingKeys.length > 0 && process.env.NODE_ENV !== 'test') {
  console.error('❌ Missing Firebase configuration:', missingKeys);
  throw new Error(`Missing Firebase environment variables: ${missingKeys.join(', ')}`);
}

// Application Configuration
export const appConfig = {
  name: process.env.REACT_APP_APP_NAME || 'Testify',
  version: process.env.REACT_APP_APP_VERSION || '1.0.0',
  environment: process.env.NODE_ENV || 'development',
  superAdminEmail: process.env.REACT_APP_SUPER_ADMIN_EMAIL || 'admin@testify.com'
};

// Validate super admin email is set
if (!appConfig.superAdminEmail && process.env.NODE_ENV === 'production') {
  throw new Error('REACT_APP_SUPER_ADMIN_EMAIL must be set in production');
}

// Feature Flags
export const featureFlags = {
  enableAnalytics: process.env.REACT_APP_ENABLE_ANALYTICS === 'true',
  enableDebugMode: process.env.REACT_APP_ENABLE_DEBUG_MODE === 'true' || process.env.NODE_ENV === 'development'
};

// API Configuration
export const apiConfig = {
  baseUrl: process.env.REACT_APP_API_BASE_URL || '',
  timeout: parseInt(process.env.REACT_APP_API_TIMEOUT) || 10000
};

// Development helpers
export const isDevelopment = process.env.NODE_ENV === 'development';
export const isProduction = process.env.NODE_ENV === 'production';
export const isTest = process.env.NODE_ENV === 'test';

// Export all configurations
const environmentConfig = {
  firebase: firebaseConfig,
  app: appConfig,
  features: featureFlags,
  api: apiConfig,
  isDevelopment,
  isProduction,
  isTest
};

export default environmentConfig;
