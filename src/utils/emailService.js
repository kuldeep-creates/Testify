// Custom Email Service for Testify
// This can be used if Firebase template editing is not available

/**
 * Custom email verification service
 * Can be integrated with services like EmailJS, SendGrid, or Nodemailer
 */

export const sendCustomVerificationEmail = async (userEmail, userName, verificationLink) => {
  // This is a placeholder for custom email service
  // You can integrate with EmailJS, SendGrid, or your own backend
  
  const emailTemplate = {
    to: userEmail,
    subject: 'Verify Your Email - Testify Platform',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Verify Your Email - Testify</title>
          <style>
              body {
                  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                  line-height: 1.6;
                  color: #333;
                  max-width: 600px;
                  margin: 0 auto;
                  padding: 20px;
                  background-color: #f8fafc;
              }
              .container {
                  background-color: white;
                  border-radius: 8px;
                  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                  overflow: hidden;
              }
              .header {
                  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
                  color: white;
                  text-align: center;
                  padding: 30px 20px;
              }
              .header h1 {
                  margin: 0;
                  font-size: 28px;
                  font-weight: 600;
              }
              .content {
                  padding: 40px 30px;
              }
              .verify-button {
                  display: inline-block;
                  padding: 16px 32px;
                  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
                  color: white !important;
                  text-decoration: none;
                  border-radius: 8px;
                  font-weight: 600;
                  font-size: 16px;
                  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
              }
              .button-container {
                  text-align: center;
                  margin: 35px 0;
              }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <h1>Testify</h1>
                  <p style="margin: 10px 0 0 0; opacity: 0.9;">Technical Assessment Platform</p>
              </div>
              
              <div class="content">
                  <p><strong>Hello ${userName},</strong></p>
                  
                  <p>Welcome to <strong>Testify</strong>! 🎉</p>
                  
                  <p>Thank you for joining our technical assessment platform. To complete your registration and start taking tests, please verify your email address by clicking the button below:</p>
                  
                  <div class="button-container">
                      <a href="${verificationLink}" class="verify-button">
                          ✅ Verify Email & Start Testing
                      </a>
                  </div>
                  
                  <p>Once verified, you'll be redirected directly to your candidate dashboard where you can begin your assessment journey.</p>
                  
                  <p style="margin-top: 30px;">
                      Best regards,<br>
                      <strong>The Testify Team</strong>
                  </p>
              </div>
          </div>
      </body>
      </html>
    `
  };

  // Log the email template for now
  console.log('Custom Email Template:', emailTemplate);
  
  // Here you would integrate with your email service
  // Example: EmailJS, SendGrid, or custom backend API
  
  return emailTemplate;
};

// Email service configuration
export const emailConfig = {
  // Add your email service configuration here
  // For EmailJS: serviceId, templateId, userId
  // For SendGrid: apiKey
  // For custom backend: API endpoint
};
