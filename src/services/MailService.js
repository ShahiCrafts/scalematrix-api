const env = require('../config/env');

class MailService {
  /**
   * Send transactional email using Resend REST API (https://api.resend.com/emails)
   * @param {Object} options
   * @param {string} options.to - Recipient email
   * @param {string} options.subject - Email subject
   * @param {string} options.htmlContent - HTML body
   */
  static async sendEmail({ to, subject, htmlContent }) {
    // If running in development without a real Resend API key, log OTP to console cleanly
    if (!env.RESEND_API_KEY || env.RESEND_API_KEY.includes('mock')) {
      console.log('----------------------------------------------------');
      console.log(`✉️ [MOCK RESEND MAIL SERVICE] To: ${to}`);
      console.log(`Subject: ${subject}`);
      console.log(`HTML Content snippet:\n${htmlContent.substring(0, 300)}...`);
      console.log('----------------------------------------------------');
      return { success: true, mocked: true };
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${env.SENDER_NAME} <${env.SENDER_EMAIL}>`,
          to: [to],
          subject: subject,
          html: htmlContent,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('❌ Resend API Email Error:', data);
        throw new Error(data.message || 'Failed to send transactional email via Resend');
      }

      console.log(`✅ Email sent successfully to ${to} (Resend ID: ${data.id})`);
      return { success: true, id: data.id };
    } catch (error) {
      console.error('❌ MailService Exception:', error.message);
      throw error;
    }
  }

  /**
   * Send OTP Verification Email with responsive HTML template
   */
  static async sendOTPEmail(toEmail, otpCode, fullName = 'Valued User') {
    const subject = `${otpCode} is your ScaleMatrix Verification Code`;
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0a0a0c; color: #ffffff; margin: 0; padding: 40px 20px; }
          .container { max-width: 500px; margin: 0 auto; background: #121214; border: 1px solid #262626; border-radius: 16px; padding: 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
          .logo { text-align: center; margin-bottom: 24px; font-size: 24px; font-weight: 800; color: #9333ea; letter-spacing: -0.5px; }
          .title { font-size: 20px; font-weight: 700; margin-bottom: 12px; color: #ffffff; text-align: center; }
          .text { font-size: 14px; color: #a3a3a3; line-height: 1.6; margin-bottom: 24px; text-align: center; }
          .otp-box { background: #1a1a1e; border: 1px dashed #9333ea; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px; }
          .otp-code { font-size: 36px; font-weight: 800; color: #c084fc; letter-spacing: 8px; font-family: monospace; }
          .footer { font-size: 12px; color: #525252; text-align: center; margin-top: 24px; border-top: 1px solid #1f1f23; padding-top: 16px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">⚡ ScaleMatrix</div>
          <div class="title">Verify Your Email Address</div>
          <p class="text">Hi ${fullName},<br>Use the following 6-digit code to complete your registration. This code will expire in <strong>10 minutes</strong>.</p>
          <div class="otp-box">
            <div class="otp-code">${otpCode}</div>
          </div>
          <p class="text">If you did not request this code, please ignore this email or contact support if you have concerns.</p>
          <div class="footer">
            &copy; ${new Date().getFullYear()} ScaleMatrix OS. Security Hardened System.
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail({ to: toEmail, subject, htmlContent });
  }
}

module.exports = MailService;
