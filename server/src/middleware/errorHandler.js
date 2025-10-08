/**
 * 전역 에러 핸들러 미들웨어
 * 모든 에러를 캐치하고 일관된 형식으로 응답
 * 
 * @module middleware/errorHandler
 */

const {
  ERROR_CODES,
  ERROR_MESSAGES,
  HTTP_STATUS,
  ENVIRONMENTS
} = require('../constants');

// ===== 커스텀 에러 클래스 =====

/**
 * 기본 커스텀 에러 클래스
 */
class BaseError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 검증 에러 (400)
 */
class ValidationError extends BaseError {
  constructor(message = ERROR_MESSAGES.VALIDATION_ERROR) {
    super(message, HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR);
  }
}

/**
 * 인증 에러 (401)
 */
class AuthenticationError extends BaseError {
  constructor(message = ERROR_MESSAGES.AUTH_REQUIRED) {
    super(message, HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.AUTH_REQUIRED);
  }
}

/**
 * 토큰 만료 에러 (401)
 */
class TokenExpiredError extends BaseError {
  constructor(message = ERROR_MESSAGES.TOKEN_EXPIRED) {
    super(message, HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.TOKEN_EXPIRED);
  }
}

/**
 * 유효하지 않은 토큰 에러 (401)
 */
class InvalidTokenError extends BaseError {
  constructor(message = ERROR_MESSAGES.INVALID_TOKEN) {
    super(message, HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.INVALID_TOKEN);
  }
}

/**
 * 권한 에러 (403)
 */
class PermissionError extends BaseError {
  constructor(message = ERROR_MESSAGES.PERMISSION_DENIED) {
    super(message, HTTP_STATUS.FORBIDDEN, ERROR_CODES.PERMISSION_DENIED);
  }
}

/**
 * 리소스를 찾을 수 없음 (404)
 */
class NotFoundError extends BaseError {
  constructor(message = ERROR_MESSAGES.NOT_FOUND) {
    super(message, HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND);
  }
}

/**
 * Rate Limit 초과 (429)
 */
class RateLimitError extends BaseError {
  constructor(message = ERROR_MESSAGES.RATE_LIMIT_EXCEEDED) {
    super(message, HTTP_STATUS.RATE_LIMITED, ERROR_CODES.RATE_LIMIT_EXCEEDED);
  }
}

/**
 * OpenAI API 에러 (503)
 */
class OpenAIError extends BaseError {
  constructor(message = ERROR_MESSAGES.OPENAI_ERROR) {
    super(message, HTTP_STATUS.SERVICE_UNAVAILABLE, ERROR_CODES.OPENAI_ERROR);
  }
}

/**
 * 네트워크 에러 (502)
 */
class NetworkError extends BaseError {
  constructor(message = ERROR_MESSAGES.NETWORK_ERROR) {
    super(message, HTTP_STATUS.BAD_GATEWAY, ERROR_CODES.NETWORK_ERROR);
  }
}

/**
 * Circuit Breaker Open 에러 (503)
 */
class CircuitBreakerOpenError extends BaseError {
  constructor(message = ERROR_MESSAGES.CIRCUIT_BREAKER_OPEN) {
    super(message, HTTP_STATUS.SERVICE_UNAVAILABLE, ERROR_CODES.CIRCUIT_BREAKER_OPEN);
  }
}

/**
 * 데이터베이스 에러 (500)
 */
class DatabaseError extends BaseError {
  constructor(message = ERROR_MESSAGES.DATABASE_ERROR) {
    super(message, HTTP_STATUS.SERVER_ERROR, ERROR_CODES.DATABASE_ERROR);
  }
}

/**
 * 비밀번호 에러 (400)
 * 비밀번호 해싱, 검증 관련 에러
 */
class PasswordError extends BaseError {
  constructor(message, code = ERROR_CODES.VALIDATION_ERROR) {
    super(message, HTTP_STATUS.BAD_REQUEST, code);
  }
}

// ===== 에러 ID 생성 =====

/**
 * 고유한 에러 ID 생성
 * 형식: ERR-타임스탬프-랜덤코드
 * 
 * @returns {string} 에러 ID
 */
function generateErrorId() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `ERR-${timestamp}-${random}`;
}

// ===== 에러 로깅 =====

/**
 * 에러 정보를 로깅
 * 
 * @param {Error} error - 에러 객체
 * @param {Object} req - Express request 객체
 * @param {string} errorId - 에러 ID
 */
function logError(error, req, errorId) {
  const logData = {
    errorId,
    timestamp: new Date().toISOString(),
    name: error.name,
    message: error.message,
    statusCode: error.statusCode || HTTP_STATUS.SERVER_ERROR,
    code: error.code || ERROR_CODES.SERVER_ERROR,
    url: req?.originalUrl || req?.url,
    method: req?.method,
    ip: req?.ip,
    userAgent: req?.headers?.['user-agent'],
    userId: req?.user?.userId || 'anonymous',
    stack: error.stack
  };

  // 개발 환경에서는 전체 스택 트레이스 출력
  if (process.env.NODE_ENV === ENVIRONMENTS.DEVELOPMENT) {
    console.error('━'.repeat(80));
    console.error('🚨 ERROR DETAILS:');
    console.error('━'.repeat(80));
    console.error('Error ID:', logData.errorId);
    console.error('Timestamp:', logData.timestamp);
    console.error('Type:', logData.name);
    console.error('Message:', logData.message);
    console.error('Status Code:', logData.statusCode);
    console.error('Code:', logData.code);
    console.error('URL:', logData.url);
    console.error('Method:', logData.method);
    console.error('User ID:', logData.userId);
    console.error('IP:', logData.ip);
    console.error('━'.repeat(80));
    console.error('Stack Trace:');
    console.error(logData.stack);
    console.error('━'.repeat(80));
  } else {
    // 프로덕션 환경에서는 간단히 로깅
    console.error(`[${logData.timestamp}] [${logData.errorId}] ${logData.name}: ${logData.message}`, {
      url: logData.url,
      userId: logData.userId,
      statusCode: logData.statusCode
    });
  }
}

// ===== 에러 응답 생성 =====

/**
 * 에러 타입에 따른 상태 코드 결정
 * 
 * @param {Error} error - 에러 객체
 * @returns {number} HTTP 상태 코드
 */
function getStatusCode(error) {
  // BaseError를 상속한 커스텀 에러는 이미 statusCode를 가지고 있음
  if (error.statusCode) {
    return error.statusCode;
  }

  // 에러 이름으로 매핑
  const errorTypeMap = {
    'ValidationError': HTTP_STATUS.BAD_REQUEST,
    'AuthenticationError': HTTP_STATUS.UNAUTHORIZED,
    'TokenExpiredError': HTTP_STATUS.UNAUTHORIZED,
    'InvalidTokenError': HTTP_STATUS.UNAUTHORIZED,
    'JsonWebTokenError': HTTP_STATUS.UNAUTHORIZED,
    'PermissionError': HTTP_STATUS.FORBIDDEN,
    'NotFoundError': HTTP_STATUS.NOT_FOUND,
    'RateLimitError': HTTP_STATUS.RATE_LIMITED,
    'OpenAIError': HTTP_STATUS.SERVICE_UNAVAILABLE,
    'NetworkError': HTTP_STATUS.BAD_GATEWAY,
    'CircuitBreakerOpenError': HTTP_STATUS.SERVICE_UNAVAILABLE,
    'DatabaseError': HTTP_STATUS.SERVER_ERROR,
    'PasswordError': HTTP_STATUS.BAD_REQUEST
  };

  return errorTypeMap[error.name] || HTTP_STATUS.SERVER_ERROR;
}

/**
 * 에러 타입에 따른 에러 코드 결정
 * 
 * @param {Error} error - 에러 객체
 * @returns {string} 에러 코드
 */
function getErrorCode(error) {
  // BaseError를 상속한 커스텀 에러는 이미 code를 가지고 있음
  if (error.code) {
    return error.code;
  }

  // 에러 이름으로 매핑
  const errorCodeMap = {
    'ValidationError': ERROR_CODES.VALIDATION_ERROR,
    'AuthenticationError': ERROR_CODES.AUTH_REQUIRED,
    'TokenExpiredError': ERROR_CODES.TOKEN_EXPIRED,
    'InvalidTokenError': ERROR_CODES.INVALID_TOKEN,
    'JsonWebTokenError': ERROR_CODES.INVALID_TOKEN,
    'PermissionError': ERROR_CODES.PERMISSION_DENIED,
    'NotFoundError': ERROR_CODES.NOT_FOUND,
    'RateLimitError': ERROR_CODES.RATE_LIMIT_EXCEEDED,
    'OpenAIError': ERROR_CODES.OPENAI_ERROR,
    'NetworkError': ERROR_CODES.NETWORK_ERROR,
    'CircuitBreakerOpenError': ERROR_CODES.CIRCUIT_BREAKER_OPEN,
    'DatabaseError': ERROR_CODES.DATABASE_ERROR,
    'PasswordError': ERROR_CODES.VALIDATION_ERROR
  };

  return errorCodeMap[error.name] || ERROR_CODES.SERVER_ERROR;
}

/**
 * 사용자 친화적인 에러 메시지 생성
 * 
 * @param {Error} error - 에러 객체
 * @returns {string} 에러 메시지
 */
function getUserMessage(error) {
  // 커스텀 에러는 이미 친화적인 메시지를 가지고 있음
  if (error instanceof BaseError) {
    return error.message;
  }

  // JWT 관련 에러
  if (error.name === 'JsonWebTokenError') {
    return ERROR_MESSAGES.INVALID_TOKEN;
  }
  if (error.name === 'TokenExpiredError') {
    return ERROR_MESSAGES.TOKEN_EXPIRED;
  }

  // 기본 메시지
  const code = getErrorCode(error);
  return ERROR_MESSAGES[code] || ERROR_MESSAGES.SERVER_ERROR;
}

/**
 * 에러 응답 객체 생성
 * 
 * @param {Error} error - 에러 객체
 * @param {string} errorId - 에러 ID
 * @returns {Object} 에러 응답 객체
 */
function createErrorResponse(error, errorId) {
  const statusCode = getStatusCode(error);
  const code = getErrorCode(error);
  const message = getUserMessage(error);

  const response = {
    error: true,
    message,
    code,
    errorId,
    statusCode,
    timestamp: new Date().toISOString()
  };

  // 개발 환경에서는 추가 정보 포함
  if (process.env.NODE_ENV === ENVIRONMENTS.DEVELOPMENT) {
    response.details = {
      name: error.name,
      originalMessage: error.message,
      stack: error.stack
    };

    // 추가 속성이 있으면 포함
    if (error.details) {
      response.details.errorDetails = error.details;
    }
  }

  return response;
}

// ===== 에러 핸들러 미들웨어 =====

/**
 * 전역 에러 핸들러
 * Express의 에러 핸들러 미들웨어
 * 
 * @param {Error} err - 에러 객체
 * @param {Object} req - Express request 객체
 * @param {Object} res - Express response 객체
 * @param {Function} next - Express next 함수
 */
function errorHandler(err, req, res, next) {
  // 에러 ID 생성
  const errorId = generateErrorId();

  // 에러 로깅
  logError(err, req, errorId);

  // 이미 응답이 전송되었으면 기본 에러 핸들러로 넘김
  if (res.headersSent) {
    return next(err);
  }

  // 상태 코드 결정
  const statusCode = getStatusCode(err);

  // 에러 응답 생성
  const errorResponse = createErrorResponse(err, errorId);

  // 응답 전송
  res.status(statusCode).json(errorResponse);
}

// ===== 404 핸들러 미들웨어 =====

/**
 * 404 Not Found 핸들러
 * 정의되지 않은 라우트에 대한 처리
 * 
 * @param {Object} req - Express request 객체
 * @param {Object} res - Express response 객체
 */
function notFoundHandler(req, res) {
  const errorId = generateErrorId();

  console.warn(`[${new Date().toISOString()}] [${errorId}] 404 Not Found: ${req.method} ${req.originalUrl}`);

  res.status(HTTP_STATUS.NOT_FOUND).json({
    error: true,
    message: ERROR_MESSAGES.NOT_FOUND,
    code: ERROR_CODES.NOT_FOUND,
    errorId,
    statusCode: HTTP_STATUS.NOT_FOUND,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    method: req.method
  });
}

// ===== 비동기 에러 래퍼 =====

/**
 * 비동기 라우트 핸들러의 에러를 캐치
 * try-catch 없이 async/await 사용 가능
 * 
 * @param {Function} fn - 비동기 라우트 핸들러
 * @returns {Function} 래핑된 핸들러
 * 
 * @example
 * router.get('/users', asyncHandler(async (req, res) => {
 *   const users = await User.find();
 *   res.json(users);
 * }));
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ===== 에러 생성 헬퍼 =====

/**
 * 조건부 에러 발생
 * 
 * @param {boolean} condition - 조건
 * @param {Error|string} error - 에러 객체 또는 메시지
 * @throws {Error} 조건이 true일 때 에러 발생
 * 
 * @example
 * throwIf(!user, new NotFoundError('사용자를 찾을 수 없습니다'));
 * throwIf(age < 18, 'You must be 18 or older');
 */
function throwIf(condition, error) {
  if (condition) {
    if (typeof error === 'string') {
      throw new Error(error);
    }
    throw error;
  }
}

/**
 * 값이 없으면 NotFoundError 발생
 * 
 * @param {*} value - 확인할 값
 * @param {string} message - 에러 메시지
 * @returns {*} value (값이 있을 경우)
 * @throws {NotFoundError} 값이 없을 경우
 * 
 * @example
 * const user = assertExists(await User.findById(id), '사용자를 찾을 수 없습니다');
 */
function assertExists(value, message) {
  if (!value) {
    throw new NotFoundError(message);
  }
  return value;
}

/**
 * 권한 확인
 * 
 * @param {boolean} hasPermission - 권한 여부
 * @param {string} message - 에러 메시지
 * @throws {PermissionError} 권한이 없을 경우
 * 
 * @example
 * assertPermission(req.user.role === 'admin', '관리자만 접근 가능합니다');
 */
function assertPermission(hasPermission, message) {
  if (!hasPermission) {
    throw new PermissionError(message);
  }
}

// ===== Export =====

module.exports = {
  // 커스텀 에러 클래스
  BaseError,
  ValidationError,
  AuthenticationError,
  TokenExpiredError,
  InvalidTokenError,
  PermissionError,
  NotFoundError,
  RateLimitError,
  OpenAIError,
  NetworkError,
  CircuitBreakerOpenError,
  DatabaseError,
  PasswordError,

  // 미들웨어
  errorHandler,
  notFoundHandler,
  asyncHandler,

  // 헬퍼 함수
  generateErrorId,
  throwIf,
  assertExists,
  assertPermission,

  // 내부 함수 (테스트용으로 export)
  logError,
  getStatusCode,
  getErrorCode,
  getUserMessage,
  createErrorResponse
};