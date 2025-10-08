/**
 * 이메일 발송 서비스
 * Nodemailer를 사용한 이메일 발송 및 템플릿 관리
 * Gmail SMTP 또는 SendGrid 지원
 * 
 * @module services/EmailService
 */

const nodemailer = require('nodemailer');

/**
 * 이메일 전송 최대 재시도 횟수
 * 허용 범위: 1-5
 * @type {number}
 */
const MAX_RETRIES = parseInt(process.env.EMAIL_MAX_RETRIES) || 3;

/**
 * 재시도 대기 시간 (밀리초)
 * 허용 범위: 1000-10000
 * @type {number}
 */
const RETRY_DELAY = parseInt(process.env.EMAIL_RETRY_DELAY) || 2000;

/**
 * 이메일 템플릿
 * HTML 기반의 반응형 이메일 템플릿
 */
const emailTemplates = {
  /**
   * 회원가입 환영 이메일
   * @param {string} userName - 사용자 이름
   * @returns {Object} 이메일 제목 및 HTML
   */
  welcome: (userName) => ({
    subject: 'SummaryGenie에 오신 것을 환영합니다! 🎉',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .container {
            background: #ffffff;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
          }
          .logo {
            font-size: 32px;
            font-weight: bold;
            color: #2196F3;
            margin-bottom: 10px;
          }
          .content {
            margin-bottom: 30px;
          }
          .button {
            display: inline-block;
            padding: 12px 30px;
            background: #2196F3;
            color: #ffffff !important;
            text-decoration: none;
            border-radius: 5px;
            font-weight: 600;
            margin: 20px 0;
          }
          .footer {
            text-align: center;
            font-size: 12px;
            color: #999;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #eee;
          }
          .features {
            background: #f5f5f5;
            padding: 20px;
            border-radius: 5px;
            margin: 20px 0;
          }
          .feature-item {
            margin: 10px 0;
            padding-left: 25px;
            position: relative;
          }
          .feature-item:before {
            content: "✓";
            position: absolute;
            left: 0;
            color: #2196F3;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">📚 SummaryGenie</div>
            <p style="color: #666; margin: 0;">AI 웹페이지 요약 서비스</p>
          </div>
          
          <div class="content">
            <h2 style="color: #333; margin-bottom: 20px;">안녕하세요, ${userName || '회원'}님!</h2>
            
            <p>SummaryGenie에 가입해주셔서 감사합니다. 이제 AI의 힘으로 웹 콘텐츠를 빠르게 요약하고 이해할 수 있습니다.</p>
            
            <div class="features">
              <h3 style="margin-top: 0;">주요 기능</h3>
              <div class="feature-item">웹페이지 원클릭 요약</div>
              <div class="feature-item">PDF 문서 분석 (프리미엄)</div>
              <div class="feature-item">Q&A 기능으로 심화 학습</div>
              <div class="feature-item">요약 히스토리 저장 및 검색</div>
              <div class="feature-item">다국어 지원 (한/영/일/중)</div>
            </div>
            
            <p>지금 바로 Chrome 확장프로그램을 설치하고 시작해보세요!</p>
            
            <div style="text-align: center;">
              <a href="${process.env.FRONTEND_URL || 'https://summarygenie.com'}" class="button">
                시작하기
              </a>
            </div>
          </div>
          
          <div class="footer">
            <p>이 이메일은 SummaryGenie 회원가입 시 자동으로 발송되었습니다.</p>
            <p>문의사항이 있으시면 <a href="mailto:support@summarygenie.com">support@summarygenie.com</a>으로 연락주세요.</p>
            <p style="margin-top: 20px;">© 2025 SummaryGenie. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  /**
   * 이메일 인증 링크
   * @param {string} userName - 사용자 이름
   * @param {string} verificationLink - 인증 링크
   * @returns {Object} 이메일 제목 및 HTML
   */
  verification: (userName, verificationLink) => ({
    subject: 'SummaryGenie 이메일 인증을 완료해주세요 ✉️',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .container {
            background: #ffffff;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
          }
          .logo {
            font-size: 32px;
            font-weight: bold;
            color: #2196F3;
            margin-bottom: 10px;
          }
          .button {
            display: inline-block;
            padding: 14px 40px;
            background: #2196F3;
            color: #ffffff !important;
            text-decoration: none;
            border-radius: 5px;
            font-weight: 600;
            font-size: 16px;
          }
          .alert-box {
            background: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          }
          .footer {
            text-align: center;
            font-size: 12px;
            color: #999;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #eee;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">🔐 이메일 인증</div>
          </div>
          
          <div class="content">
            <h2 style="color: #333;">안녕하세요, ${userName || '회원'}님!</h2>
            
            <p>SummaryGenie 계정의 이메일 인증을 완료하기 위해 아래 버튼을 클릭해주세요.</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verificationLink}" class="button">
                이메일 인증하기
              </a>
            </div>
            
            <div class="alert-box">
              <strong>⏰ 중요:</strong> 이 링크는 24시간 동안만 유효합니다.
            </div>
            
            <p style="margin-top: 20px;">버튼이 작동하지 않는 경우, 아래 링크를 복사하여 브라우저에 직접 붙여넣으세요:</p>
            <p style="word-break: break-all; background: #f5f5f5; padding: 10px; border-radius: 4px; font-size: 12px;">
              ${verificationLink}
            </p>
            
            <p style="margin-top: 30px; color: #666;">
              이 이메일에 대해 요청하지 않으셨다면, 이 메시지를 무시하셔도 됩니다.
            </p>
          </div>
          
          <div class="footer">
            <p>© 2025 SummaryGenie. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  /**
   * 비밀번호 재설정 링크
   * @param {string} userName - 사용자 이름
   * @param {string} resetLink - 재설정 링크
   * @returns {Object} 이메일 제목 및 HTML
   */
  passwordReset: (userName, resetLink) => ({
    subject: 'SummaryGenie 비밀번호 재설정 🔑',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .container {
            background: #ffffff;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
          }
          .logo {
            font-size: 32px;
            font-weight: bold;
            color: #2196F3;
            margin-bottom: 10px;
          }
          .button {
            display: inline-block;
            padding: 14px 40px;
            background: #2196F3;
            color: #ffffff !important;
            text-decoration: none;
            border-radius: 5px;
            font-weight: 600;
            font-size: 16px;
          }
          .alert-box {
            background: #ffe4e4;
            border-left: 4px solid #dc3545;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          }
          .security-tips {
            background: #e7f3ff;
            padding: 15px;
            border-radius: 5px;
            margin: 20px 0;
          }
          .footer {
            text-align: center;
            font-size: 12px;
            color: #999;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #eee;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">🔐 비밀번호 재설정</div>
          </div>
          
          <div class="content">
            <h2 style="color: #333;">안녕하세요, ${userName || '회원'}님!</h2>
            
            <p>비밀번호 재설정 요청을 받았습니다. 아래 버튼을 클릭하여 새 비밀번호를 설정하세요.</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetLink}" class="button">
                비밀번호 재설정하기
              </a>
            </div>
            
            <div class="alert-box">
              <strong>⏰ 중요:</strong> 이 링크는 1시간 동안만 유효합니다.
            </div>
            
            <div class="security-tips">
              <strong>🛡️ 보안 팁:</strong>
              <ul style="margin: 10px 0; padding-left: 20px;">
                <li>최소 8자 이상, 대소문자와 숫자를 포함하세요</li>
                <li>다른 사이트와 동일한 비밀번호를 사용하지 마세요</li>
                <li>정기적으로 비밀번호를 변경하세요</li>
              </ul>
            </div>
            
            <p style="margin-top: 20px;">버튼이 작동하지 않는 경우, 아래 링크를 복사하여 브라우저에 직접 붙여넣으세요:</p>
            <p style="word-break: break-all; background: #f5f5f5; padding: 10px; border-radius: 4px; font-size: 12px;">
              ${resetLink}
            </p>
            
            <p style="margin-top: 30px; color: #dc3545; font-weight: 600;">
              ⚠️ 이 요청을 하지 않으셨다면, 즉시 계정 보안을 확인하시고 비밀번호를 변경하세요.
            </p>
          </div>
          
          <div class="footer">
            <p>© 2025 SummaryGenie. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  /**
   * 비밀번호 변경 확인
   * @param {string} userName - 사용자 이름
   * @returns {Object} 이메일 제목 및 HTML
   */
  passwordChanged: (userName) => ({
    subject: 'SummaryGenie 비밀번호가 변경되었습니다 ✅',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .container {
            background: #ffffff;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
          }
          .logo {
            font-size: 32px;
            font-weight: bold;
            color: #28a745;
            margin-bottom: 10px;
          }
          .success-box {
            background: #d4edda;
            border-left: 4px solid #28a745;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          }
          .warning-box {
            background: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          }
          .info-table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
          }
          .info-table td {
            padding: 10px;
            border-bottom: 1px solid #eee;
          }
          .info-table td:first-child {
            font-weight: 600;
            width: 120px;
            color: #666;
          }
          .footer {
            text-align: center;
            font-size: 12px;
            color: #999;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #eee;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">✅ 비밀번호 변경 완료</div>
          </div>
          
          <div class="content">
            <h2 style="color: #333;">안녕하세요, ${userName || '회원'}님!</h2>
            
            <div class="success-box">
              <strong>✓ 비밀번호가 성공적으로 변경되었습니다.</strong>
            </div>
            
            <p>계정의 비밀번호가 변경되었습니다. 아래 정보를 확인해주세요.</p>
            
            <table class="info-table">
              <tr>
                <td>변경 일시</td>
                <td>${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</td>
              </tr>
              <tr>
                <td>계정</td>
                <td>${userName || '회원'}</td>
              </tr>
            </table>
            
            <div class="warning-box">
              <strong>⚠️ 본인이 변경하지 않았다면?</strong>
              <p style="margin: 10px 0 0 0;">
                즉시 <a href="mailto:support@summarygenie.com">support@summarygenie.com</a>으로 연락하시거나,
                계정 보안 설정에서 비밀번호를 다시 변경해주세요.
              </p>
            </div>
            
            <p style="margin-top: 30px;">
              보안을 위해 정기적으로 비밀번호를 변경하시고, 다른 사이트와 동일한 비밀번호를 사용하지 마세요.
            </p>
          </div>
          
          <div class="footer">
            <p>문의사항이 있으시면 <a href="mailto:support@summarygenie.com">support@summarygenie.com</a>으로 연락주세요.</p>
            <p style="margin-top: 10px;">© 2025 SummaryGenie. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  })
};

/**
 * 이메일 발송 서비스 클래스
 * Singleton 패턴으로 구현
 */
class EmailService {
  constructor() {
    /**
     * Nodemailer transporter 인스턴스
     * @type {nodemailer.Transporter | null}
     * @private
     */
    this.transporter = null;

    /**
     * 이메일 서비스 사용 가능 여부
     * @type {boolean}
     * @private
     */
    this.isServiceAvailable = false;

    /**
     * 이메일 서비스 타입 (gmail/sendgrid)
     * @type {string}
     * @private
     */
    this.serviceType = process.env.EMAIL_SERVICE || 'gmail';

    // Transporter 초기화
    this._initializeTransporter();
  }

  /**
   * Nodemailer Transporter 초기화
   * @private
   */
  _initializeTransporter() {
    try {
      if (this.serviceType === 'sendgrid') {
        // SendGrid 설정
        this.transporter = nodemailer.createTransport({
          host: 'smtp.sendgrid.net',
          port: 587,
          secure: false,
          auth: {
            user: 'apikey',
            pass: process.env.SENDGRID_API_KEY
          }
        });
        console.log('✅ EmailService: SendGrid Transporter 초기화 완료');
      } else {
        // Gmail SMTP 설정
        this.transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD
          }
        });
        console.log('✅ EmailService: Gmail Transporter 초기화 완료');
      }

      this.isServiceAvailable = true;
    } catch (error) {
      console.error('❌ EmailService: Transporter 초기화 실패:', error.message);
      this.isServiceAvailable = false;
    }
  }

  /**
   * 이메일 발송 (재시도 로직 포함)
   * @private
   * @param {Object} mailOptions - 이메일 옵션
   * @param {number} retryCount - 현재 재시도 횟수
   * @returns {Promise<Object>} 발송 결과
   */
  async _sendWithRetry(mailOptions, retryCount = 0) {
    try {
      const info = await this.transporter.sendMail(mailOptions);
      return info;
    } catch (error) {
      // 재시도 가능한 횟수가 남아있으면 재시도
      if (retryCount < MAX_RETRIES) {
        console.warn(
          `⚠️ 이메일 발송 실패 (${retryCount + 1}/${MAX_RETRIES}), ${RETRY_DELAY}ms 후 재시도...`
        );
        
        // 대기 후 재시도
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return this._sendWithRetry(mailOptions, retryCount + 1);
      }
      
      // 최대 재시도 횟수 초과
      throw error;
    }
  }

  /**
   * 이메일 발송 헬퍼 함수
   * @private
   * @param {string} to - 수신자 이메일
   * @param {string} subject - 이메일 제목
   * @param {string} html - 이메일 HTML 내용
   * @returns {Promise<Object>} 발송 결과
   */
  async _sendEmail(to, subject, html) {
    if (!this.isServiceAvailable) {
      throw new Error('이메일 서비스를 사용할 수 없습니다');
    }

    const mailOptions = {
      from: process.env.EMAIL_FROM || '"SummaryGenie" <noreply@summarygenie.com>',
      to,
      subject,
      html
    };

    try {
      const info = await this._sendWithRetry(mailOptions);
      console.log(`✅ 이메일 발송 성공: ${to} - ${subject}`);
      return {
        success: true,
        messageId: info.messageId,
        response: info.response
      };
    } catch (error) {
      console.error(`❌ 이메일 발송 실패: ${to} - ${subject}`, error.message);
      throw new Error(`이메일 발송 실패: ${error.message}`);
    }
  }

  /**
   * 회원가입 환영 이메일 발송
   * 
   * @param {string} email - 수신자 이메일
   * @param {string} name - 사용자 이름
   * @returns {Promise<Object>} 발송 결과
   * 
   * @example
   * await emailService.sendWelcomeEmail('user@example.com', 'John Doe');
   */
  async sendWelcomeEmail(email, name) {
    const { subject, html } = emailTemplates.welcome(name);
    return this._sendEmail(email, subject, html);
  }

  /**
   * 이메일 인증 링크 발송
   * 
   * @param {string} email - 수신자 이메일
   * @param {string} name - 사용자 이름
   * @param {string} token - 인증 토큰
   * @returns {Promise<Object>} 발송 결과
   * 
   * @example
   * await emailService.sendVerificationEmail('user@example.com', 'John Doe', 'abc123token');
   */
  async sendVerificationEmail(email, name, token) {
    const frontendUrl = process.env.FRONTEND_URL || 'https://summarygenie.com';
    const verificationLink = `${frontendUrl}/verify-email?token=${token}`;
    
    const { subject, html } = emailTemplates.verification(name, verificationLink);
    return this._sendEmail(email, subject, html);
  }

  /**
   * 비밀번호 재설정 링크 발송
   * 
   * @param {string} email - 수신자 이메일
   * @param {string} name - 사용자 이름
   * @param {string} token - 재설정 토큰
   * @returns {Promise<Object>} 발송 결과
   * 
   * @example
   * await emailService.sendPasswordResetEmail('user@example.com', 'John Doe', 'xyz789token');
   */
  async sendPasswordResetEmail(email, name, token) {
    const frontendUrl = process.env.FRONTEND_URL || 'https://summarygenie.com';
    const resetLink = `${frontendUrl}/reset-password?token=${token}`;
    
    const { subject, html } = emailTemplates.passwordReset(name, resetLink);
    return this._sendEmail(email, subject, html);
  }

  /**
   * 비밀번호 변경 확인 이메일 발송
   * 
   * @param {string} email - 수신자 이메일
   * @param {string} name - 사용자 이름
   * @returns {Promise<Object>} 발송 결과
   * 
   * @example
   * await emailService.sendPasswordChangedEmail('user@example.com', 'John Doe');
   */
  async sendPasswordChangedEmail(email, name) {
    const { subject, html } = emailTemplates.passwordChanged(name);
    return this._sendEmail(email, subject, html);
  }

  /**
   * 이메일 서비스 사용 가능 여부 확인
   * 
   * @returns {boolean} 사용 가능 여부
   */
  isAvailable() {
    return this.isServiceAvailable;
  }

  /**
   * Transporter 연결 테스트
   * 
   * @async
   * @returns {Promise<boolean>} 연결 성공 여부
   */
  async testConnection() {
    if (!this.isServiceAvailable) {
      console.warn('⚠️ EmailService: 서비스를 사용할 수 없습니다');
      return false;
    }

    try {
      await this.transporter.verify();
      console.log('✅ EmailService: 연결 테스트 성공');
      return true;
    } catch (error) {
      console.error('❌ EmailService: 연결 테스트 실패:', error.message);
      return false;
    }
  }
}

// Singleton 인스턴스 생성 및 export
const emailService = new EmailService();

module.exports = emailService;