/**
 * JWT 인증 미들웨어
 * Express.js 라우트에서 사용자 인증 및 권한 검증
 */

const { 
  verifyToken, 
  TokenExpiredError, 
  InvalidTokenError, 
  NoTokenError 
} = require('../utils/jwt');

// ===== 토큰 추출 헬퍼 함수 =====

/**
 * Authorization 헤더에서 Bearer 토큰 추출
 * @param {Object} req - Express request 객체
 * @returns {string|null} 추출된 토큰 또는 null
 * @example
 * // Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 * const token = extractToken(req); // eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 */
function extractToken(req) {
  // Authorization 헤더 확인
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  
  // 쿼리 파라미터에서 토큰 확인 (웹소켓 등에서 사용)
  if (req.query && req.query.token) {
    return req.query.token;
  }
  
  // 쿠키에서 토큰 확인 (옵션)
  if (req.cookies && req.cookies.accessToken) {
    return req.cookies.accessToken;
  }
  
  return null;
}

// ===== 에러 응답 헬퍼 함수 =====

/**
 * 인증 에러 응답 생성
 * @param {Object} res - Express response 객체
 * @param {number} statusCode - HTTP 상태 코드
 * @param {string} message - 에러 메시지
 * @param {string} code - 에러 코드
 */
function sendAuthError(res, statusCode, message, code) {
  res.status(statusCode).json({
    error: true,
    message: message,
    code: code,
    timestamp: new Date().toISOString()
  });
}

// ===== 1. 필수 인증 미들웨어 =====

/**
 * 필수 JWT 인증 미들웨어
 * Authorization 헤더에 유효한 JWT 토큰이 있어야 통과
 * 검증 성공시 req.user에 디코딩된 페이로드 저장
 * 
 * @param {Object} req - Express request 객체
 * @param {Object} res - Express response 객체
 * @param {Function} next - Express next 함수
 * 
 * @throws {401} 토큰이 없거나 유효하지 않을 경우
 * 
 * @example
 * // 보호된 라우트에 적용
 * app.get('/api/profile', authenticate, (req, res) => {
 *   res.json({ user: req.user });
 * });
 */
function authenticate(req, res, next) {
  try {
    // 1. 토큰 추출
    const token = extractToken(req);
    
    if (!token) {
      return sendAuthError(
        res, 
        401, 
        '인증이 필요합니다', 
        'AUTH_REQUIRED'
      );
    }
    
    // 2. 토큰 검증
    const decoded = verifyToken(token);
    
    // 3. 사용자 정보 저장
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      isPremium: decoded.isPremium || false,
      role: decoded.role || 'user',
      iat: decoded.iat,
      exp: decoded.exp
    };
    
    // 4. 다음 미들웨어로 진행
    next();
    
  } catch (error) {
    // 에러 타입별 처리
    if (error instanceof NoTokenError) {
      return sendAuthError(
        res, 
        401, 
        '인증 토큰이 제공되지 않았습니다', 
        'TOKEN_MISSING'
      );
    }
    
    if (error instanceof TokenExpiredError) {
      return sendAuthError(
        res, 
        401, 
        '토큰이 만료되었습니다. 다시 로그인해주세요', 
        'TOKEN_EXPIRED'
      );
    }
    
    if (error instanceof InvalidTokenError) {
      return sendAuthError(
        res, 
        401, 
        '유효하지 않은 토큰입니다', 
        'TOKEN_INVALID'
      );
    }
    
    // 기타 에러
    console.error('인증 에러:', error);
    return sendAuthError(
      res, 
      401, 
      '인증에 실패했습니다', 
      'AUTH_FAILED'
    );
  }
}

// ===== 2. 선택적 인증 미들웨어 =====

/**
 * 선택적 JWT 인증 미들웨어
 * 토큰이 있으면 검증하고, 없어도 통과
 * 유효한 토큰이 있을 경우에만 req.user 설정
 * 
 * @param {Object} req - Express request 객체
 * @param {Object} res - Express response 객체
 * @param {Function} next - Express next 함수
 * 
 * @example
 * // 공개 API이지만 로그인 사용자에게는 추가 정보 제공
 * app.get('/api/articles', optionalAuth, (req, res) => {
 *   if (req.user) {
 *     // 로그인 사용자용 응답
 *   } else {
 *     // 비로그인 사용자용 응답
 *   }
 * });
 */
function optionalAuth(req, res, next) {
  try {
    // 1. 토큰 추출
    const token = extractToken(req);
    
    // 2. 토큰이 없으면 바로 통과
    if (!token) {
      return next();
    }
    
    // 3. 토큰 검증
    const decoded = verifyToken(token);
    
    // 4. 사용자 정보 저장
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      isPremium: decoded.isPremium || false,
      role: decoded.role || 'user',
      iat: decoded.iat,
      exp: decoded.exp
    };
    
    next();
    
  } catch (error) {
    // 토큰이 있지만 유효하지 않은 경우
    if (error instanceof TokenExpiredError) {
      return sendAuthError(
        res, 
        401, 
        '토큰이 만료되었습니다', 
        'TOKEN_EXPIRED'
      );
    }
    
    if (error instanceof InvalidTokenError) {
      return sendAuthError(
        res, 
        401, 
        '유효하지 않은 토큰입니다', 
        'TOKEN_INVALID'
      );
    }
    
    // 기타 에러는 로그만 남기고 통과
    console.warn('선택적 인증 에러 (무시):', error.message);
    next();
  }
}

// ===== 3. 프리미엄 사용자 전용 미들웨어 =====

/**
 * 프리미엄 사용자 전용 미들웨어
 * authenticate 미들웨어 이후에 사용해야 함
 * req.user.isPremium === true 검증
 * 
 * @param {Object} req - Express request 객체
 * @param {Object} res - Express response 객체
 * @param {Function} next - Express next 함수
 * 
 * @throws {401} 인증되지 않은 경우
 * @throws {403} 프리미엄 사용자가 아닌 경우
 * 
 * @example
 * // 프리미엄 전용 기능
 * app.post('/api/pdf-summary', authenticate, requirePremium, (req, res) => {
 *   // 프리미엄 사용자만 접근 가능
 * });
 */
function requirePremium(req, res, next) {
  // 1. 인증 확인
  if (!req.user) {
    return sendAuthError(
      res, 
      401, 
      '인증이 필요합니다', 
      'AUTH_REQUIRED'
    );
  }
  
  // 2. 프리미엄 여부 확인
  if (!req.user.isPremium) {
    return sendAuthError(
      res, 
      403, 
      '프리미엄 구독이 필요한 기능입니다', 
      'PREMIUM_REQUIRED'
    );
  }
  
  // 3. 통과
  next();
}

// ===== 4. 역할 기반 권한 미들웨어 =====

/**
 * 특정 역할을 가진 사용자만 허용하는 미들웨어 팩토리
 * @param {...string} allowedRoles - 허용된 역할 목록 (예: 'admin', 'moderator')
 * @returns {Function} Express 미들웨어 함수
 * 
 * @example
 * // 관리자 전용 라우트
 * app.delete('/api/users/:id', authenticate, requireRole('admin'), (req, res) => {
 *   // admin 역할을 가진 사용자만 접근 가능
 * });
 * 
 * // 여러 역할 허용
 * app.post('/api/posts', authenticate, requireRole('admin', 'moderator'), (req, res) => {
 *   // admin 또는 moderator만 접근 가능
 * });
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    // 1. 인증 확인
    if (!req.user) {
      return sendAuthError(
        res, 
        401, 
        '인증이 필요합니다', 
        'AUTH_REQUIRED'
      );
    }
    
    // 2. 역할 확인
    const userRole = req.user.role || 'user';
    
    if (!allowedRoles.includes(userRole)) {
      return sendAuthError(
        res, 
        403, 
        '이 작업을 수행할 권한이 없습니다', 
        'INSUFFICIENT_PERMISSIONS'
      );
    }
    
    // 3. 통과
    next();
  };
}

// ===== 5. API 키 검증 미들웨어 (기업용) =====

/**
 * API 키 검증 미들웨어
 * x-api-key 헤더로 전달된 API 키 검증
 * 
 * @param {Object} req - Express request 객체
 * @param {Object} res - Express response 객체
 * @param {Function} next - Express next 함수
 * 
 * @example
 * app.post('/api/v1/summarize', validateApiKey, (req, res) => {
 *   // API 키로 인증된 요청만 처리
 * });
 */
function validateApiKey(req, res, next) {
  try {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
      return sendAuthError(
        res, 
        401, 
        'API 키가 필요합니다', 
        'API_KEY_REQUIRED'
      );
    }
    
    // TODO: 실제 API 키 검증 로직 (데이터베이스 조회)
    // 현재는 환경변수와 비교하는 예시
    const validApiKeys = process.env.VALID_API_KEYS?.split(',') || [];
    
    if (!validApiKeys.includes(apiKey)) {
      return sendAuthError(
        res, 
        401, 
        '유효하지 않은 API 키입니다', 
        'INVALID_API_KEY'
      );
    }
    
    // API 키 정보 저장
    req.apiKey = apiKey;
    
    next();
    
  } catch (error) {
    console.error('API 키 검증 에러:', error);
    return sendAuthError(
      res, 
      401, 
      'API 키 검증에 실패했습니다', 
      'API_KEY_VALIDATION_FAILED'
    );
  }
}

// ===== 6. 디바이스 지문 검증 미들웨어 =====

/**
 * 디바이스 지문 검증 미들웨어
 * x-device-fingerprint 헤더 확인
 * 
 * @param {Object} req - Express request 객체
 * @param {Object} res - Express response 객체
 * @param {Function} next - Express next 함수
 * 
 * @example
 * app.post('/api/summary', requireDeviceFingerprint, (req, res) => {
 *   // 디바이스 지문이 있는 요청만 처리
 * });
 */
function requireDeviceFingerprint(req, res, next) {
  const fingerprint = req.headers['x-device-fingerprint'];
  
  if (!fingerprint) {
    return sendAuthError(
      res, 
      400, 
      '디바이스 식별 정보가 필요합니다', 
      'DEVICE_FINGERPRINT_REQUIRED'
    );
  }
  
  // 디바이스 지문 저장
  req.deviceFingerprint = fingerprint;
  
  next();
}

// ===== 7. Rate Limit 미들웨어 헬퍼 =====

/**
 * 사용자별 요청 제한 확인 (authenticate와 함께 사용)
 * @param {number} maxRequests - 허용된 최대 요청 수
 * @param {number} windowMs - 시간 윈도우 (밀리초)
 * @returns {Function} Express 미들웨어 함수
 * 
 * @example
 * app.post('/api/summary', 
 *   authenticate, 
 *   rateLimitByUser(10, 60000), // 1분에 10회
 *   (req, res) => { }
 * );
 */
function rateLimitByUser(maxRequests, windowMs) {
  const requests = new Map();
  
  return (req, res, next) => {
    if (!req.user) {
      return next();
    }
    
    const userId = req.user.userId;
    const now = Date.now();
    const userRequests = requests.get(userId) || [];
    
    // 윈도우 밖의 요청 제거
    const validRequests = userRequests.filter(time => now - time < windowMs);
    
    if (validRequests.length >= maxRequests) {
      const oldestRequest = Math.min(...validRequests);
      const retryAfter = Math.ceil((windowMs - (now - oldestRequest)) / 1000);
      
      res.set('Retry-After', retryAfter);
      return sendAuthError(
        res, 
        429, 
        `요청 제한을 초과했습니다. ${retryAfter}초 후 다시 시도해주세요`, 
        'RATE_LIMIT_EXCEEDED'
      );
    }
    
    // 요청 기록
    validRequests.push(now);
    requests.set(userId, validRequests);
    
    next();
  };
}

// ===== 내보내기 =====
module.exports = {
  // 기본 인증 미들웨어
  authenticate,
  optionalAuth,
  
  // 권한 검증 미들웨어
  requirePremium,
  requireRole,
  
  // 추가 보안 미들웨어
  validateApiKey,
  requireDeviceFingerprint,
  rateLimitByUser,
  
  // 헬퍼 함수
  extractToken,
  sendAuthError
};