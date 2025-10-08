/**
 * 토큰 생성 및 검증 유틸리티
 * 비밀번호 재설정, 이메일 인증 등에 사용
 * 
 * @module utils/tokenUtils
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

/**
 * 랜덤 토큰 생성
 * @param {number} length - 토큰 길이 (기본값: 32)
 * @returns {string} 랜덤 토큰 (hex)
 */
function generateRandomToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * 토큰 해싱 (SHA-256)
 * @param {string} token - 원본 토큰
 * @returns {string} 해시된 토큰
 */
function hashToken(token) {
  return crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
}

/**
 * JWT 토큰 생성 (단기 용도)
 * @param {Object} payload - 페이로드
 * @param {string} expiresIn - 만료 시간 (예: '15m', '1h')
 * @returns {string} JWT 토큰
 */
function generateShortToken(payload, expiresIn = '15m') {
  return jwt.sign(
    payload,
    process.env.JWT_SECRET,
    { expiresIn }
  );
}

/**
 * 비밀번호 재설정 토큰 생성
 * @param {string} userId - 사용자 ID
 * @param {string} email - 사용자 이메일
 * @returns {Object} 토큰 정보
 */
function generatePasswordResetToken(userId, email) {
  const rawToken = generateRandomToken();
  const hashedToken = hashToken(rawToken);
  
  return {
    rawToken,      // 이메일로 전송
    hashedToken,   // DB에 저장
    expiresIn: 15 * 60 * 1000  // 15분 (밀리초)
  };
}

/**
 * 이메일 인증 토큰 생성
 * @param {string} userId - 사용자 ID
 * @param {string} email - 사용자 이메일
 * @returns {Object} 토큰 정보
 */
function generateEmailVerificationToken(userId, email) {
  const rawToken = generateRandomToken();
  const hashedToken = hashToken(rawToken);
  
  return {
    rawToken,      // 이메일로 전송
    hashedToken,   // DB에 저장
    expiresIn: 24 * 60 * 60 * 1000  // 24시간 (밀리초)
  };
}

/**
 * 토큰 검증 (비교)
 * @param {string} rawToken - 원본 토큰
 * @param {string} hashedToken - 저장된 해시 토큰
 * @returns {boolean} 일치 여부
 */
function verifyToken(rawToken, hashedToken) {
  const computedHash = hashToken(rawToken);
  return computedHash === hashedToken;
}

module.exports = {
  generateRandomToken,
  hashToken,
  generateShortToken,
  generatePasswordResetToken,
  generateEmailVerificationToken,
  verifyToken
};