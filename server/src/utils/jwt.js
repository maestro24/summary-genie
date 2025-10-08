/**
 * JWT 토큰 관리 유틸리티
 * 사용자 인증 및 권한 관리를 위한 JWT 토큰 생성, 검증, 갱신 기능 제공
 */

const jwt = require('jsonwebtoken');

/**
 * JWT 시크릿 키
 * 환경변수에서 로드, 없으면 에러 발생
 */
const JWT_SECRET = process.env.JWT_SECRET;

/**
 * JWT 토큰 만료 시간
 * 허용 범위: '1h', '7d', '30d' 등
 * 기본값: 7일
 */
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Refresh 토큰 만료 시간
 * 허용 범위: '7d' 이상 권장
 * 기본값: 30일
 */
const REFRESH_EXPIRES_IN = process.env.REFRESH_EXPIRES_IN || '30d';

// ===== 환경변수 검증 =====
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET 환경변수가 설정되지 않았습니다');
}

if (JWT_SECRET.length < 32) {
  console.warn('⚠️ JWT_SECRET이 너무 짧습니다. 최소 32자 이상 권장');
}

// ===== 커스텀 에러 클래스 =====

/**
 * 토큰 만료 에러
 */
class TokenExpiredError extends Error {
  constructor(message = 'Token expired') {
    super(message);
    this.name = 'TokenExpiredError';
    this.statusCode = 401;
  }
}

/**
 * 토큰 손상 에러
 */
class InvalidTokenError extends Error {
  constructor(message = 'Invalid token') {
    super(message);
    this.name = 'InvalidTokenError';
    this.statusCode = 401;
  }
}

/**
 * 토큰 없음 에러
 */
class NoTokenError extends Error {
  constructor(message = 'No token provided') {
    super(message);
    this.name = 'NoTokenError';
    this.statusCode = 401;
  }
}

// ===== JWT 토큰 생성 =====

/**
 * JWT 액세스 토큰 생성
 * @param {Object} payload - 토큰에 포함될 데이터
 * @param {string} payload.userId - 사용자 고유 식별자 (필수)
 * @param {string} payload.email - 사용자 이메일 주소 (선택)
 * @param {boolean} payload.isPremium - 프리미엄 사용자 여부 (기본값: false)
 * @param {Object} options - 추가 옵션
 * @param {string} options.expiresIn - 토큰 만료 시간 (기본값: JWT_EXPIRES_IN)
 * @returns {string} JWT 토큰 문자열
 * @throws {Error} userId가 없거나 유효하지 않을 경우
 * @example
 * const token = generateToken({ 
 *   userId: 'user123', 
 *   email: 'user@example.com',
 *   isPremium: false 
 * });
 */
function generateToken(payload, options = {}) {
  // 입력 검증
  if (!payload || typeof payload !== 'object') {
    throw new Error('페이로드는 객체여야 합니다');
  }

  if (!payload.userId) {
    throw new Error('userId는 필수입니다');
  }

  // 보안: 민감한 정보 제거
  const sanitizedPayload = {
    userId: payload.userId,
    email: payload.email,
    isPremium: payload.isPremium || false,
    role: payload.role || 'user',
    // 토큰 타입 추가
    type: 'access'
  };

  // 토큰 생성 옵션
  const tokenOptions = {
    expiresIn: options.expiresIn || JWT_EXPIRES_IN,
    issuer: 'SummaryGenie',
    audience: 'SummaryGenie-Users'
  };

  try {
    const token = jwt.sign(sanitizedPayload, JWT_SECRET, tokenOptions);
    return token;
  } catch (error) {
    throw new Error(`토큰 생성 실패: ${error.message}`);
  }
}

// ===== JWT 토큰 검증 =====

/**
 * JWT 토큰 검증 및 디코딩
 * @param {string} token - 검증할 JWT 토큰 문자열
 * @returns {Object} 디코딩된 페이로드 객체
 * @returns {string} returns.userId - 사용자 ID
 * @returns {string} returns.email - 사용자 이메일
 * @returns {boolean} returns.isPremium - 프리미엄 여부
 * @returns {number} returns.iat - 토큰 발급 시간 (UNIX timestamp)
 * @returns {number} returns.exp - 토큰 만료 시간 (UNIX timestamp)
 * @throws {NoTokenError} 토큰이 제공되지 않았을 경우
 * @throws {TokenExpiredError} 토큰이 만료되었을 경우
 * @throws {InvalidTokenError} 토큰이 손상되었거나 유효하지 않을 경우
 * @example
 * try {
 *   const decoded = verifyToken(token);
 *   console.log(decoded.userId); // 'user123'
 * } catch (error) {
 *   if (error instanceof TokenExpiredError) {
 *     // 토큰 만료 처리
 *   }
 * }
 */
function verifyToken(token) {
  // 토큰 존재 확인
  if (!token) {
    throw new NoTokenError('토큰이 제공되지 않았습니다');
  }

  // Bearer 토큰인 경우 제거
  if (token.startsWith('Bearer ')) {
    token = token.slice(7);
  }

  try {
    // 토큰 검증 및 디코딩
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'SummaryGenie',
      audience: 'SummaryGenie-Users'
    });

    // 토큰 타입 검증
    if (decoded.type !== 'access') {
      throw new InvalidTokenError('액세스 토큰이 아닙니다');
    }

    return decoded;
  } catch (error) {
    // 에러 타입별 처리
    if (error.name === 'TokenExpiredError') {
      throw new TokenExpiredError('토큰이 만료되었습니다');
    }
    
    if (error.name === 'JsonWebTokenError') {
      throw new InvalidTokenError(`유효하지 않은 토큰: ${error.message}`);
    }
    
    if (error.name === 'NotBeforeError') {
      throw new InvalidTokenError('토큰이 아직 유효하지 않습니다');
    }

    // 기타 에러
    throw new InvalidTokenError(error.message);
  }
}

// ===== Refresh 토큰 생성 =====

/**
 * Refresh 토큰 생성 (장기 유효)
 * @param {Object} payload - 토큰에 포함될 데이터
 * @param {string} payload.userId - 사용자 고유 식별자 (필수)
 * @returns {string} Refresh JWT 토큰 문자열
 * @example
 * const refreshToken = generateRefreshToken({ userId: 'user123' });
 */
function generateRefreshToken(payload) {
  if (!payload || !payload.userId) {
    throw new Error('userId는 필수입니다');
  }

  const refreshPayload = {
    userId: payload.userId,
    type: 'refresh'
  };

  try {
    const token = jwt.sign(refreshPayload, JWT_SECRET, {
      expiresIn: REFRESH_EXPIRES_IN,
      issuer: 'SummaryGenie',
      audience: 'SummaryGenie-Users'
    });
    return token;
  } catch (error) {
    throw new Error(`Refresh 토큰 생성 실패: ${error.message}`);
  }
}

// ===== 토큰 갱신 =====

/**
 * 기존 토큰을 검증하고 새로운 액세스 토큰 생성
 * @param {string} oldToken - 기존 JWT 토큰 (액세스 또는 리프레시)
 * @param {boolean} useRefresh - Refresh 토큰 사용 여부 (기본값: false)
 * @returns {Object} 새로운 토큰 정보
 * @returns {string} returns.accessToken - 새로운 액세스 토큰
 * @returns {string} returns.refreshToken - 새로운 리프레시 토큰 (useRefresh=true인 경우)
 * @throws {NoTokenError} 토큰이 제공되지 않았을 경우
 * @throws {InvalidTokenError} 토큰이 손상되었을 경우
 * @example
 * // 액세스 토큰 갱신
 * const { accessToken } = refreshToken(oldAccessToken);
 * 
 * // 리프레시 토큰으로 갱신
 * const { accessToken, refreshToken } = refreshToken(oldRefreshToken, true);
 */
function refreshToken(oldToken, useRefresh = false) {
  if (!oldToken) {
    throw new NoTokenError('갱신할 토큰이 제공되지 않았습니다');
  }

  try {
    // 만료된 토큰도 디코딩 (ignoreExpiration)
    const decoded = jwt.verify(oldToken, JWT_SECRET, {
      ignoreExpiration: true,
      issuer: 'SummaryGenie',
      audience: 'SummaryGenie-Users'
    });

    // Refresh 토큰 검증
    if (useRefresh && decoded.type !== 'refresh') {
      throw new InvalidTokenError('Refresh 토큰이 아닙니다');
    }

    // 새 페이로드 생성 (민감 정보 제외)
    const newPayload = {
      userId: decoded.userId,
      email: decoded.email,
      isPremium: decoded.isPremium,
      role: decoded.role
    };

    // 새 액세스 토큰 생성
    const accessToken = generateToken(newPayload);

    // Refresh 토큰 사용 시 새 Refresh 토큰도 생성
    if (useRefresh) {
      const newRefreshToken = generateRefreshToken({ userId: decoded.userId });
      return {
        accessToken,
        refreshToken: newRefreshToken
      };
    }

    return { accessToken };
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      throw new InvalidTokenError('유효하지 않은 토큰입니다');
    }
    throw error;
  }
}

// ===== 토큰 디코딩 (검증 없이) =====

/**
 * JWT 토큰을 검증 없이 디코딩 (디버깅용)
 * ⚠️ 보안: 프로덕션에서는 verifyToken 사용 권장
 * @param {string} token - 디코딩할 JWT 토큰
 * @returns {Object|null} 디코딩된 페이로드 또는 null
 * @example
 * const decoded = decodeToken(token);
 * console.log('토큰 만료시간:', new Date(decoded.exp * 1000));
 */
function decodeToken(token) {
  if (!token) {
    return null;
  }

  if (token.startsWith('Bearer ')) {
    token = token.slice(7);
  }

  try {
    return jwt.decode(token);
  } catch (error) {
    console.error('토큰 디코딩 실패:', error.message);
    return null;
  }
}

// ===== 토큰 만료 시간 확인 =====

/**
 * 토큰의 남은 유효 시간 계산 (초 단위)
 * @param {string} token - 검증할 JWT 토큰
 * @returns {number} 남은 시간 (초), 만료된 경우 음수
 * @example
 * const remainingTime = getTokenRemainingTime(token);
 * if (remainingTime < 300) {
 *   // 5분 이하 남음, 토큰 갱신 필요
 * }
 */
function getTokenRemainingTime(token) {
  const decoded = decodeToken(token);
  
  if (!decoded || !decoded.exp) {
    return 0;
  }

  const now = Math.floor(Date.now() / 1000);
  return decoded.exp - now;
}

/**
 * 토큰 만료 여부 확인
 * @param {string} token - 검증할 JWT 토큰
 * @returns {boolean} 만료 여부 (true: 만료됨)
 * @example
 * if (isTokenExpired(token)) {
 *   // 토큰 갱신 필요
 * }
 */
function isTokenExpired(token) {
  return getTokenRemainingTime(token) <= 0;
}

// ===== Express 미들웨어 =====

/**
 * JWT 인증 미들웨어 (Express용)
 * Authorization 헤더에서 토큰 추출 및 검증
 * @param {Object} req - Express request 객체
 * @param {Object} res - Express response 객체
 * @param {Function} next - Express next 함수
 * @example
 * // 라우터에서 사용
 * app.get('/api/protected', authenticateToken, (req, res) => {
 *   console.log(req.user); // { userId, email, isPremium, ... }
 * });
 */
function authenticateToken(req, res, next) {
  try {
    // Authorization 헤더에서 토큰 추출
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      throw new NoTokenError('인증 토큰이 필요합니다');
    }

    // 토큰 검증
    const decoded = verifyToken(token);
    
    // req.user에 사용자 정보 저장
    req.user = decoded;
    
    next();
  } catch (error) {
    const statusCode = error.statusCode || 401;
    res.status(statusCode).json({
      error: true,
      message: error.message,
      code: error.name
    });
  }
}

/**
 * 선택적 JWT 인증 미들웨어 (토큰이 있으면 검증, 없어도 통과)
 * @param {Object} req - Express request 객체
 * @param {Object} res - Express response 객체
 * @param {Function} next - Express next 함수
 */
function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = verifyToken(token);
      req.user = decoded;
    }
    
    next();
  } catch (error) {
    // 토큰이 있지만 유효하지 않은 경우만 에러
    if (error instanceof InvalidTokenError || error instanceof TokenExpiredError) {
      return res.status(401).json({
        error: true,
        message: error.message
      });
    }
    next();
  }
}

// ===== 내보내기 =====
module.exports = {
  // 토큰 생성
  generateToken,
  generateRefreshToken,
  
  // 토큰 검증
  verifyToken,
  
  // 토큰 갱신
  refreshToken,
  
  // 토큰 유틸리티
  decodeToken,
  getTokenRemainingTime,
  isTokenExpired,
  
  // Express 미들웨어
  authenticateToken,
  optionalAuth,
  
  // 에러 클래스
  TokenExpiredError,
  InvalidTokenError,
  NoTokenError
};