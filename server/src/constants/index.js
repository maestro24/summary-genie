/**
 * SummaryGenie 전역 상수 정의
 * 모든 하드코딩된 값을 중앙 집중식으로 관리
 * 
 * @module constants
 * @description 프로젝트 전역에서 사용되는 상수들을 정의합니다
 */

// ===== HTTP 상태 코드 =====
const HTTP_STATUS = {
  // 성공
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  
  // 리다이렉션
  MOVED_PERMANENTLY: 301,
  FOUND: 302,
  NOT_MODIFIED: 304,
  
  // 클라이언트 에러
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  PAYMENT_REQUIRED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  GONE: 410,
  PAYLOAD_TOO_LARGE: 413,
  UNPROCESSABLE_ENTITY: 422,
  RATE_LIMITED: 429,
  
  // 서버 에러
  SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504
};

// ===== 에러 코드 =====
const ERROR_CODES = {
  // 인증 관련
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  
  // 검증 관련
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  DUPLICATE_EMAIL: 'DUPLICATE_EMAIL',
  CONTENT_TOO_SHORT: 'CONTENT_TOO_SHORT',
  CONTENT_TOO_LONG: 'CONTENT_TOO_LONG',
  
  // 리소스
  NOT_FOUND: 'NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  HISTORY_NOT_FOUND: 'HISTORY_NOT_FOUND',
  
  // Rate Limiting & 사용량
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  DAILY_LIMIT_EXCEEDED: 'DAILY_LIMIT_EXCEEDED',
  USAGE_LIMIT_EXCEEDED: 'USAGE_LIMIT_EXCEEDED',
  HISTORY_LIMIT_EXCEEDED: 'HISTORY_LIMIT_EXCEEDED',
  
  // 외부 서비스
  OPENAI_ERROR: 'OPENAI_ERROR',
  OPENAI_TIMEOUT: 'OPENAI_TIMEOUT',
  OPENAI_RATE_LIMIT: 'OPENAI_RATE_LIMIT',
  NETWORK_ERROR: 'NETWORK_ERROR',
  CIRCUIT_BREAKER_OPEN: 'CIRCUIT_BREAKER_OPEN',
  
  // 데이터베이스
  DATABASE_ERROR: 'DATABASE_ERROR',
  TRANSACTION_FAILED: 'TRANSACTION_FAILED',
  
  // 서버
  SERVER_ERROR: 'SERVER_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE'
};

// ===== 에러 메시지 =====
const ERROR_MESSAGES = {
  // 인증 관련
  AUTH_REQUIRED: '인증이 필요합니다',
  INVALID_CREDENTIALS: '이메일 또는 비밀번호가 올바르지 않습니다',
  INVALID_TOKEN: '유효하지 않은 토큰입니다',
  TOKEN_EXPIRED: '토큰이 만료되었습니다. 다시 로그인해주세요',
  PERMISSION_DENIED: '권한이 없습니다',
  
  // 검증 관련
  VALIDATION_ERROR: '입력값이 유효하지 않습니다',
  INVALID_INPUT: '잘못된 입력값입니다',
  DUPLICATE_EMAIL: '이미 사용 중인 이메일입니다',
  CONTENT_TOO_SHORT: '콘텐츠가 너무 짧습니다 (최소 50자)',
  CONTENT_TOO_LONG: '콘텐츠가 너무 깁니다 (최대 15000자)',
  
  // 리소스
  NOT_FOUND: '요청한 리소스를 찾을 수 없습니다',
  USER_NOT_FOUND: '사용자를 찾을 수 없습니다',
  ALREADY_EXISTS: '이미 존재하는 리소스입니다',
  HISTORY_NOT_FOUND: '히스토리를 찾을 수 없습니다',
  
  // Rate Limiting & 사용량
  RATE_LIMIT_EXCEEDED: '요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요',
  DAILY_LIMIT_EXCEEDED: '일일 사용 한도를 초과했습니다',
  USAGE_LIMIT_EXCEEDED: '사용 한도를 초과했습니다',
  HISTORY_LIMIT_EXCEEDED: '히스토리 저장 한도를 초과했습니다',
  
  // 외부 서비스
  OPENAI_ERROR: 'AI 서비스 오류가 발생했습니다',
  OPENAI_TIMEOUT: 'AI 서비스 응답 시간 초과',
  OPENAI_RATE_LIMIT: 'AI 서비스 요청 한도 초과',
  NETWORK_ERROR: '네트워크 오류가 발생했습니다',
  CIRCUIT_BREAKER_OPEN: '일시적으로 서비스를 사용할 수 없습니다',
  
  // 데이터베이스
  DATABASE_ERROR: '데이터베이스 오류가 발생했습니다',
  TRANSACTION_FAILED: '트랜잭션 처리 중 오류가 발생했습니다',
  
  // 서버
  SERVER_ERROR: '서버 오류가 발생했습니다',
  SERVICE_UNAVAILABLE: '서비스를 일시적으로 사용할 수 없습니다'
};

// ===== 환경 변수 =====
const ENVIRONMENTS = {
  DEVELOPMENT: 'development',
  PRODUCTION: 'production',
  TEST: 'test'
};

// ===== 비밀번호 정책 =====
const PASSWORD = {
  SALT_ROUNDS: 10,
  MIN_LENGTH: 8,
  MAX_LENGTH: 128
};

// ===== 사용자 역할 =====
const USER_ROLES = {
  USER: 'user',
  ADMIN: 'admin',
  MODERATOR: 'moderator'
};

// ===== 구독 플랜 (Subscription Plans) =====
const SUBSCRIPTION_PLANS = {
  FREE: 'free',
  PRO: 'pro',
  TEAM: 'team',
  ENTERPRISE: 'enterprise'
};

// ===== Firestore 컬렉션 이름 =====
const COLLECTIONS = {
  USERS: 'users',
  SUMMARIES: 'summaries',
  USAGE: 'usage',
  SUBSCRIPTIONS: 'subscriptions',
  API_KEYS: 'apiKeys'
};

// ===== 요약 길이 옵션 =====
const SUMMARY_LENGTHS = {
  SHORT: 'short',      // 3-5줄
  MEDIUM: 'medium',    // 5-8줄
  LONG: 'long'         // 8-12줄
};

// ===== 사용량 제한 =====
const LIMITS = {
  FREE_DAILY_LIMIT: 5,
  PREMIUM_DAILY_LIMIT: Infinity,
  MIN_CONTENT_LENGTH: 50,
  MAX_CONTENT_LENGTH: 15000,
  MIN_QUESTION_LENGTH: 2,
  MAX_QUESTION_LENGTH: 5000,
  MIN_TITLE_LENGTH: 1,
  MAX_TITLE_LENGTH: 500,
  MIN_SUMMARY_LENGTH: 1,
  MAX_SUMMARY_LENGTH: 10000,
  MAX_HISTORY_ITEMS: 100,
  MAX_QA_PER_HISTORY: 50
};

// ===== OpenAI API 설정 =====
const OPENAI = {
  DEFAULT_MODEL: 'gpt-4o-mini',
  AVAILABLE_MODELS: ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo'],
  DEFAULT_MAX_TOKENS: 1000,
  MIN_MAX_TOKENS: 100,
  MAX_MAX_TOKENS: 4000,
  DEFAULT_TEMPERATURE: 0.7,
  MIN_TEMPERATURE: 0,
  MAX_TEMPERATURE: 2,
  API_TIMEOUT: 30000,
  MAX_RETRIES: 3
};

// ===== Rate Limit 설정 =====
const RATE_LIMITS = {
  // 무료 사용자
  FREE: {
    DAILY_SUMMARIES: 5,
    DAILY_QUESTIONS: 5,
    WINDOW_MS: 24 * 60 * 60 * 1000, // 24시간
    MAX_REQUESTS_PER_WINDOW: 100
  },
  // 프리미엄 사용자
  PREMIUM: {
    DAILY_SUMMARIES: -1, // 무제한
    DAILY_QUESTIONS: -1, // 무제한
    WINDOW_MS: 60 * 60 * 1000, // 1시간
    MAX_REQUESTS_PER_WINDOW: 1000
  },
  // API 일반
  API: {
    WINDOW_MS: 15 * 60 * 1000, // 15분
    MAX_REQUESTS: 100
  }
};

// ===== Rate Limiting 미들웨어 설정 =====
const RATE_LIMIT = {
  WINDOW_MS: 60000,                    // 1분
  MAX_REQUESTS_FREE: 30,               // 무료: 분당 30회
  MAX_REQUESTS_PREMIUM: 100,           // 프리미엄: 분당 100회
  SKIP_SUCCESS_RESPONSES: false,
  STANDARD_HEADERS: true,
  LEGACY_HEADERS: false
};

// ===== 캐시 설정 =====
const CACHE = {
  TTL_SHORT: 60000,        // 1분
  TTL_MEDIUM: 300000,      // 5분
  TTL_LONG: 3600000,       // 1시간
  TTL_DAILY: 86400000,     // 1일
  MAX_SIZE: 100,
  KEYS: {
    USAGE: 'usage:',
    HISTORY: 'history:',
    USER: 'user:',
    STATS: 'stats:',
    RATE_LIMIT: 'ratelimit:'
  }
};

// ===== JWT 설정 =====
const JWT = {
  EXPIRES_IN: '7d',
  ALGORITHM: 'HS256',
  ISSUER: 'summarygenie',
  AUDIENCE: 'summarygenie-users'
};

// ===== Circuit Breaker 설정 =====
const CIRCUIT_BREAKER = {
  FAILURE_THRESHOLD: 5,      // 5번 실패 시 차단
  SUCCESS_THRESHOLD: 2,      // 2번 성공 시 복구
  TIMEOUT: 60000,            // 60초 후 재시도
  HALF_OPEN_REQUESTS: 1,     // Half-Open 상태에서 1개 요청만 허용
  RESET_TIMEOUT: 30000,
  HALF_OPEN_SUCCESS_THRESHOLD: 2
};

// ===== 로깅 설정 =====
const LOGGING = {
  MAX_LOG_SIZE: 1000,
  LOG_RETENTION_DAYS: 7,
  LEVELS: {
    ERROR: 'error',
    WARN: 'warn',
    INFO: 'info',
    DEBUG: 'debug'
  },
  ALERT_THRESHOLDS: {
    CRITICAL: 10,
    WARNING: 5
  }
};

// ===== 모니터링 설정 =====
const MONITORING = {
  HEALTH_CHECK_INTERVAL: 60000,        // 1분
  METRICS_RETENTION: 86400000,         // 24시간
  ERROR_PATTERN_WINDOW: 300000,        // 5분
  AUTO_RECOVERY_ENABLED: true
};

// ===== 요청 본문 크기 제한 =====
const BODY_LIMITS = {
  JSON: '10mb',
  TEXT: '10mb',
  URL_ENCODED: '10mb'
};

// ===== CORS 설정 =====
const CORS = {
  MAX_AGE: 86400,
  ALLOWED_METHODS: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  ALLOWED_HEADERS: [
    'Content-Type',
    'Authorization',
    'X-Device-Fingerprint',
    'X-User-Id',
    'X-API-Key',
    'X-Premium'
  ],
  EXPOSED_HEADERS: [
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'X-RateLimit-Limit'
  ]
};

// ===== 사용자 등급 =====
const USER_TIERS = {
  FREE: 'free',
  PREMIUM: 'premium',
  TEAM: 'team',
  ENTERPRISE: 'enterprise'
};

// ===== 기능 타입 =====
const FEATURE_TYPES = {
  SUMMARY: 'summary',
  QUESTION: 'question',
  TRANSLATION: 'translation'
};

// ===== Graceful Shutdown 타임아웃 =====
const SHUTDOWN = {
  TIMEOUT: 10000  // 10초
};

// ===== Export =====
module.exports = {
  HTTP_STATUS: Object.freeze(HTTP_STATUS),
  ERROR_CODES: Object.freeze(ERROR_CODES),
  ERROR_MESSAGES: Object.freeze(ERROR_MESSAGES),
  ENVIRONMENTS: Object.freeze(ENVIRONMENTS),
  PASSWORD: Object.freeze(PASSWORD),
  USER_ROLES: Object.freeze(USER_ROLES),
  SUBSCRIPTION_PLANS: Object.freeze(SUBSCRIPTION_PLANS),
  COLLECTIONS: Object.freeze(COLLECTIONS),
  SUMMARY_LENGTHS: Object.freeze(SUMMARY_LENGTHS),
  LIMITS: Object.freeze(LIMITS),
  OPENAI: Object.freeze(OPENAI),
  RATE_LIMITS: Object.freeze(RATE_LIMITS),
  RATE_LIMIT: Object.freeze(RATE_LIMIT),
  CACHE: Object.freeze(CACHE),
  JWT: Object.freeze(JWT),
  CIRCUIT_BREAKER: Object.freeze(CIRCUIT_BREAKER),
  LOGGING: Object.freeze(LOGGING),
  MONITORING: Object.freeze(MONITORING),
  BODY_LIMITS: Object.freeze(BODY_LIMITS),
  CORS: Object.freeze(CORS),
  USER_TIERS: Object.freeze(USER_TIERS),
  FEATURE_TYPES: Object.freeze(FEATURE_TYPES),
  SHUTDOWN: Object.freeze(SHUTDOWN)
};