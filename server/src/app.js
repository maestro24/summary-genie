/**
 * Express 애플리케이션 설정
 * 미들웨어, 라우터, 에러 핸들러 구성
 * 
 * @module app
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

// Constants
const {
  BODY_LIMITS,
  CORS: CORS_CONFIG,
  HTTP_STATUS,
  LOGGING,
  ENVIRONMENTS
} = require('./constants');

// Middleware
const { globalLimiter } = require('./middleware/rateLimiter');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Routes
const routes = require('./routes');

// ===== CORS 설정 함수 =====

/**
 * 허용된 오리진 목록 생성
 * 환경에 따라 다른 오리진 패턴 반환
 * 
 * @returns {Array<string|RegExp>} 허용된 오리진 목록
 */
function getAllowedOrigins() {
  const isDevelopment = process.env.NODE_ENV === ENVIRONMENTS.DEVELOPMENT;
  
  if (isDevelopment) {
    // 개발 환경: localhost 모든 포트 허용
    return [
      /^http:\/\/localhost:\d+$/,
      /^http:\/\/127\.0\.0\.1:\d+$/,
      /^chrome-extension:\/\/[a-z]{32}$/
    ];
  } else {
    // 프로덕션: 환경변수에 정의된 확장 ID만 허용
    const allowedIds = process.env.ALLOWED_EXTENSION_IDS 
      ? process.env.ALLOWED_EXTENSION_IDS.split(',').map(id => id.trim())
      : [];
    
    return allowedIds.map(id => `chrome-extension://${id}`);
  }
}

/**
 * 오리진 검증 함수
 * 
 * @param {string} origin - 요청 오리진
 * @returns {boolean} 허용 여부
 */
function isOriginAllowed(origin) {
  // 오리진이 없는 경우 (예: 서버 to 서버 요청)
  if (!origin) {
    return true;
  }
  
  const allowedOrigins = getAllowedOrigins();
  const isDevelopment = process.env.NODE_ENV === ENVIRONMENTS.DEVELOPMENT;
  
  // 개발 환경: RegExp 패턴 매칭
  if (isDevelopment) {
    return allowedOrigins.some(pattern => {
      if (pattern instanceof RegExp) {
        return pattern.test(origin);
      }
      return pattern === origin;
    });
  } 
  // 프로덕션: 정확한 매칭
  else {
    return allowedOrigins.includes(origin);
  }
}

// ===== 요청 로깅 미들웨어 =====

/**
 * 요청 로깅 미들웨어
 * 모든 요청의 메서드, 경로, 응답 시간, 상태 코드 기록
 * 
 * @param {Object} req - Express request 객체
 * @param {Object} res - Express response 객체
 * @param {Function} next - Express next 함수
 */
function requestLogger(req, res, next) {
  const start = Date.now();
  
  // 응답 완료 시 로깅
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= HTTP_STATUS.BAD_REQUEST 
      ? LOGGING.LEVELS.ERROR 
      : LOGGING.LEVELS.INFO;
    
    // 에러 로그 또는 디버그 모드에서만 출력
    if (logLevel === LOGGING.LEVELS.ERROR || process.env.LOG_LEVEL === LOGGING.LEVELS.DEBUG) {
      console.log(
        `[${new Date().toISOString()}] ` +
        `${req.method} ${req.path} - ` +
        `${res.statusCode} (${duration}ms)`
      );
    }
  });
  
  next();
}

// ===== Express 앱 생성 함수 =====

/**
 * Express 애플리케이션 생성 및 구성
 * 
 * @returns {express.Application} 구성된 Express 앱
 * 
 * @example
 * const createApp = require('./src/app');
 * const app = createApp();
 * app.listen(3000);
 */
function createApp() {
  const app = express();
  
  // ===== 1. 보안 헤더 설정 =====
  app.use(helmet());
  
  // ===== 2. CORS 설정 =====
  app.use(cors({
    origin: function (origin, callback) {
      const allowed = isOriginAllowed(origin);
      
      if (!allowed) {
        console.warn(`⚠️ CORS 차단: ${origin}`);
        return callback(new Error('CORS policy: Origin not allowed'), false);
      }
      
      // 개발 환경에서 로그 출력
      if (process.env.NODE_ENV === ENVIRONMENTS.DEVELOPMENT && origin) {
        console.log(`✅ CORS 허용: ${origin}`);
      }
      
      callback(null, true);
    },
    credentials: true,
    allowedHeaders: CORS_CONFIG.ALLOWED_HEADERS,
    exposedHeaders: CORS_CONFIG.EXPOSED_HEADERS,
    methods: CORS_CONFIG.ALLOWED_METHODS,
    maxAge: CORS_CONFIG.MAX_AGE
  }));
  
  // ===== 3. Body Parser 설정 =====
  app.use(express.json({ limit: BODY_LIMITS.JSON }));
  app.use(express.urlencoded({ extended: true, limit: BODY_LIMITS.URL_ENCODED }));
  
  // ===== 4. 정적 파일 제공 (선택) =====
  // 프로덕션에서는 보통 Nginx 등에서 처리
  if (process.env.SERVE_STATIC === 'true') {
    app.use(express.static('public'));
  }
  
  // ===== 5. 요청 로깅 =====
  app.use(requestLogger);
  
  // ===== 6. 글로벌 Rate Limiting =====
  app.use(globalLimiter);
  
  // ===== 7. 라우터 연결 =====
  app.use('/', routes);
  
  // ===== 8. 404 핸들러 =====
  app.use(notFoundHandler);
  
  // ===== 9. 전역 에러 핸들러 =====
  app.use(errorHandler);
  
  return app;
}

// ===== Export =====

module.exports = createApp;