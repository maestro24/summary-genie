/**
 * Rate Limiting 미들웨어
 * express-rate-limit를 사용하여 API 요청 속도 제한
 * 
 * @module middleware/rateLimiter
 */

const rateLimit = require('express-rate-limit');
const {
  RATE_LIMIT,
  ERROR_CODES,
  ERROR_MESSAGES,
  HTTP_STATUS
} = require('../constants');

/**
 * Rate Limiter 생성 함수
 * 
 * @param {Object} options - Rate Limiter 옵션
 * @param {number} options.windowMs - 시간 윈도우 (밀리초, 기본: RATE_LIMIT.WINDOW_MS)
 * @param {number} options.max - 최대 요청 수 (필수)
 * @param {string} options.message - 커스텀 에러 메시지
 * @param {Function} options.skip - 조건부 스킵 함수
 * @param {string} options.keyGenerator - 키 생성 함수
 * @param {boolean} options.skipSuccessfulRequests - 성공 요청 스킵 여부
 * @param {boolean} options.skipFailedRequests - 실패 요청 스킵 여부
 * @returns {Function} Express 미들웨어
 */
function createRateLimiter(options = {}) {
  const {
    windowMs = RATE_LIMIT.WINDOW_MS,
    max,
    message = ERROR_MESSAGES.RATE_LIMIT_EXCEEDED,
    skip,
    keyGenerator,
    skipSuccessfulRequests = false,
    skipFailedRequests = false
  } = options;

  if (!max) {
    throw new Error('max 값은 필수입니다');
  }

  return rateLimit({
    windowMs,
    max,
    standardHeaders: RATE_LIMIT.STANDARD_HEADERS,
    legacyHeaders: RATE_LIMIT.LEGACY_HEADERS,
    
    // 키 생성 (기본: IP 주소)
    keyGenerator: keyGenerator || ((req) => {
      return req.user?.userId || req.ip;
    }),
    
    // 조건부 스킵
    skip: skip || ((req) => {
      // 프리미엄 사용자는 rate limit 스킵
      return req.user?.isPremium === true;
    }),
    
    // Rate limit 초과 시 핸들러
    handler: (req, res) => {
      const retryAfter = Math.ceil(windowMs / 1000);
      
      // 로깅 (onLimitReached 대체)
      console.warn(`[Rate Limit Exceeded] User: ${req.user?.userId || req.ip} - ${req.method} ${req.path} - Limit: ${max}/${windowMs}ms`);
      
      res.status(HTTP_STATUS.RATE_LIMITED).json({
        error: true,
        message,
        code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
        retryAfter,
        statusCode: HTTP_STATUS.RATE_LIMITED,
        timestamp: new Date().toISOString()
      });
    },
    
    // 성공/실패 요청 스킵 설정
    skipSuccessfulRequests,
    skipFailedRequests
  });
}

/**
 * API 기본 Rate Limiter
 * 분당 30회 제한 (무료 사용자)
 * 프리미엄 사용자는 분당 100회
 */
const apiLimiter = createRateLimiter({
  windowMs: RATE_LIMIT.WINDOW_MS,
  max: RATE_LIMIT.MAX_REQUESTS_FREE,
  message: ERROR_MESSAGES.RATE_LIMIT_EXCEEDED,
  skip: (req) => {
    // 프리미엄 사용자는 더 높은 제한 적용
    if (req.user?.isPremium) {
      return false; // 프리미엄용 별도 limiter 사용
    }
    return false;
  }
});

/**
 * 프리미엄 사용자용 API Rate Limiter
 * 분당 100회 제한
 */
const premiumApiLimiter = createRateLimiter({
  windowMs: RATE_LIMIT.WINDOW_MS,
  max: RATE_LIMIT.MAX_REQUESTS_PREMIUM,
  message: '프리미엄 사용자의 요청 한도를 초과했습니다',
  skip: (req) => {
    // 프리미엄이 아닌 사용자는 이 limiter를 스킵
    return !req.user?.isPremium;
  }
});

/**
 * 채팅/요약 전용 Rate Limiter
 * 분당 10회 제한 (무료 사용자)
 * 프리미엄 사용자는 제한 없음
 */
const chatLimiter = createRateLimiter({
  windowMs: RATE_LIMIT.WINDOW_MS,
  max: 10,
  message: '채팅 요청이 너무 많습니다. 잠시 후 다시 시도해주세요',
  skip: (req) => {
    return req.user?.isPremium === true;
  }
});

/**
 * 인증 관련 Rate Limiter
 * 분당 5회 제한 (모든 사용자)
 * 무차별 대입 공격 방지
 */
const authLimiter = createRateLimiter({
  windowMs: RATE_LIMIT.WINDOW_MS,
  max: 5,
  message: '인증 시도가 너무 많습니다. 잠시 후 다시 시도해주세요',
  keyGenerator: (req) => {
    // 이메일 또는 IP 기반
    return req.body?.email || req.ip;
  },
  skip: () => false, // 모든 사용자에게 적용
  skipSuccessfulRequests: true // 성공한 요청은 카운트하지 않음
});

/**
 * 파일 업로드 Rate Limiter
 * 시간당 10회 제한
 */
const uploadLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1시간
  max: 10,
  message: '파일 업로드 요청이 너무 많습니다. 1시간 후 다시 시도해주세요',
  skip: (req) => {
    // 프리미엄 사용자는 시간당 50회
    return false;
  }
});

/**
 * 프리미엄 사용자용 파일 업로드 Rate Limiter
 * 시간당 50회 제한
 */
const premiumUploadLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 50,
  message: '파일 업로드 요청이 너무 많습니다',
  skip: (req) => {
    return !req.user?.isPremium;
  }
});

/**
 * 검색/조회 Rate Limiter
 * 분당 60회 제한
 */
const searchLimiter = createRateLimiter({
  windowMs: RATE_LIMIT.WINDOW_MS,
  max: 60,
  message: '검색 요청이 너무 많습니다. 잠시 후 다시 시도해주세요'
});

/**
 * 글로벌 Rate Limiter
 * IP당 분당 100회 제한 (DDoS 방어)
 */
const globalLimiter = createRateLimiter({
  windowMs: RATE_LIMIT.WINDOW_MS,
  max: 100,
  message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요',
  keyGenerator: (req) => req.ip,
  skip: () => false // 모든 요청에 적용
});

/**
 * 회원가입 Rate Limiter
 * IP당 시간당 3회 제한
 */
const signupLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1시간
  max: 3,
  message: '회원가입 시도가 너무 많습니다. 1시간 후 다시 시도해주세요',
  keyGenerator: (req) => req.ip,
  skipSuccessfulRequests: true
});

/**
 * 비밀번호 재설정 Rate Limiter
 * 이메일당 시간당 3회 제한
 */
const passwordResetLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: '비밀번호 재설정 요청이 너무 많습니다. 1시간 후 다시 시도해주세요',
  keyGenerator: (req) => req.body?.email || req.ip
});

/**
 * 스마트 Rate Limiter
 * 사용자 등급에 따라 동적으로 제한을 적용
 * 
 * @param {Object} options - 옵션
 * @param {number} options.freeMax - 무료 사용자 최대 요청 수
 * @param {number} options.premiumMax - 프리미엄 사용자 최대 요청 수
 * @param {number} options.windowMs - 시간 윈도우
 * @returns {Function} Express 미들웨어
 */
function createSmartRateLimiter(options = {}) {
  const {
    freeMax = RATE_LIMIT.MAX_REQUESTS_FREE,
    premiumMax = RATE_LIMIT.MAX_REQUESTS_PREMIUM,
    windowMs = RATE_LIMIT.WINDOW_MS
  } = options;

  return rateLimit({
    windowMs,
    standardHeaders: RATE_LIMIT.STANDARD_HEADERS,
    legacyHeaders: RATE_LIMIT.LEGACY_HEADERS,
    
    // 사용자 등급에 따라 동적으로 max 설정
    max: (req) => {
      if (req.user?.isPremium) {
        return premiumMax;
      }
      return freeMax;
    },
    
    keyGenerator: (req) => req.user?.userId || req.ip,
    
    handler: (req, res) => {
      const userMax = req.user?.isPremium ? premiumMax : freeMax;
      const retryAfter = Math.ceil(windowMs / 1000);
      
      res.status(HTTP_STATUS.RATE_LIMITED).json({
        error: true,
        message: `요청 한도를 초과했습니다 (${userMax}회/${retryAfter}초)`,
        code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
        retryAfter,
        limit: userMax,
        tier: req.user?.isPremium ? 'premium' : 'free',
        statusCode: HTTP_STATUS.RATE_LIMITED
      });
    }
  });
}

/**
 * Rate Limiter 조합 미들웨어
 * 여러 Rate Limiter를 순차적으로 적용
 * 
 * @param {...Function} limiters - Rate Limiter 미들웨어들
 * @returns {Function} 조합된 미들웨어
 */
function combineLimiters(...limiters) {
  return (req, res, next) => {
    let index = 0;
    
    function runNext() {
      if (index >= limiters.length) {
        return next();
      }
      
      const limiter = limiters[index++];
      limiter(req, res, (err) => {
        if (err) return next(err);
        runNext();
      });
    }
    
    runNext();
  };
}

/**
 * IP 기반 Rate Limiter
 * 사용자 인증 여부와 관계없이 IP로만 제한
 * 
 * @param {number} max - 최대 요청 수
 * @param {number} windowMs - 시간 윈도우
 * @returns {Function} Express 미들웨어
 */
function createIpLimiter(max, windowMs = RATE_LIMIT.WINDOW_MS) {
  return createRateLimiter({
    windowMs,
    max,
    keyGenerator: (req) => req.ip,
    skip: () => false
  });
}

module.exports = {
  // 기본 함수
  createRateLimiter,
  createSmartRateLimiter,
  combineLimiters,
  createIpLimiter,
  
  // 사전 정의된 Limiters
  apiLimiter,
  premiumApiLimiter,
  chatLimiter,
  authLimiter,
  uploadLimiter,
  premiumUploadLimiter,
  searchLimiter,
  globalLimiter,
  signupLimiter,
  passwordResetLimiter
};