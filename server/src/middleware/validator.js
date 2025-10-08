/**
 * 입력 검증 미들웨어
 * express-validator를 사용한 요청 데이터 검증
 * 
 * @module middleware/validator
 */

const { body, query, param, validationResult } = require('express-validator');
const {
  LIMITS,
  OPENAI,
  ERROR_CODES,
  HTTP_STATUS
} = require('../constants');

/**
 * 검증 실행 및 에러 처리 헬퍼 함수
 * 
 * @param {Array} validations - 검증 규칙 배열
 * @returns {Function} Express 미들웨어
 */
const validate = (validations) => {
  return async (req, res, next) => {
    // 모든 검증 실행
    await Promise.all(validations.map(v => v.run(req)));
    
    // 에러 확인
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorDetails = errors.array().map(e => ({
        field: e.param,
        message: e.msg,
        value: e.value,
        location: e.location
      }));

      console.warn('[Validation Error]', {
        path: req.path,
        method: req.method,
        errors: errorDetails
      });

      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: true,
        message: '입력값이 올바르지 않습니다',
        code: ERROR_CODES.VALIDATION_ERROR,
        statusCode: HTTP_STATUS.BAD_REQUEST,
        details: errorDetails,
        timestamp: new Date().toISOString()
      });
    }
    next();
  };
};

/**
 * 채팅/요약 요청 검증
 * POST /api/chat
 */
const chatValidator = [
  // messages 배열 검증
  body('messages')
    .exists().withMessage('messages는 필수입니다')
    .isArray({ min: 1 }).withMessage('messages는 최소 1개 이상의 배열이어야 합니다')
    .custom((messages) => {
      if (messages.length > 50) {
        throw new Error('messages는 최대 50개까지 가능합니다');
      }
      return true;
    }),

  // messages[].role 검증
  body('messages.*.role')
    .exists().withMessage('각 메시지에는 role이 필요합니다')
    .isIn(['user', 'assistant', 'system']).withMessage('role은 user, assistant, system 중 하나여야 합니다'),

  // messages[].content 검증
  body('messages.*.content')
    .exists().withMessage('각 메시지에는 content가 필요합니다')
    .isString().withMessage('content는 문자열이어야 합니다')
    .trim()
    .isLength({ 
      min: LIMITS.MIN_CONTENT_LENGTH, 
      max: LIMITS.MAX_CONTENT_LENGTH 
    }).withMessage(`content는 ${LIMITS.MIN_CONTENT_LENGTH}-${LIMITS.MAX_CONTENT_LENGTH}자 사이여야 합니다`),

  // model 검증 (선택)
  body('model')
    .optional()
    .isString().withMessage('model은 문자열이어야 합니다')
    .isIn(OPENAI.AVAILABLE_MODELS).withMessage(`model은 ${OPENAI.AVAILABLE_MODELS.join(', ')} 중 하나여야 합니다`),

  // max_tokens 검증 (선택)
  body('max_tokens')
    .optional()
    .isInt({ 
      min: OPENAI.MIN_MAX_TOKENS, 
      max: OPENAI.MAX_MAX_TOKENS 
    }).withMessage(`max_tokens는 ${OPENAI.MIN_MAX_TOKENS}-${OPENAI.MAX_MAX_TOKENS} 사이의 정수여야 합니다`),

  // temperature 검증 (선택)
  body('temperature')
    .optional()
    .isFloat({ 
      min: OPENAI.MIN_TEMPERATURE, 
      max: OPENAI.MAX_TEMPERATURE 
    }).withMessage(`temperature는 ${OPENAI.MIN_TEMPERATURE}-${OPENAI.MAX_TEMPERATURE} 사이의 실수여야 합니다`)
];

/**
 * 히스토리 저장 검증
 * POST /api/history
 */
const historyValidator = [
  // title 검증
  body('title')
    .exists().withMessage('title은 필수입니다')
    .isString().withMessage('title은 문자열이어야 합니다')
    .trim()
    .isLength({ 
      min: LIMITS.MIN_TITLE_LENGTH, 
      max: LIMITS.MAX_TITLE_LENGTH 
    }).withMessage(`title은 ${LIMITS.MIN_TITLE_LENGTH}-${LIMITS.MAX_TITLE_LENGTH}자 사이여야 합니다`)
    .notEmpty().withMessage('title은 빈 문자열일 수 없습니다'),

  // url 검증
  body('url')
    .exists().withMessage('url은 필수입니다')
    .isString().withMessage('url은 문자열이어야 합니다')
    .trim()
    .isURL({ 
      protocols: ['http', 'https'],
      require_protocol: true 
    }).withMessage('유효한 URL이 아닙니다 (http:// 또는 https:// 포함)')
    .isLength({ max: 2048 }).withMessage('URL은 최대 2048자까지 가능합니다'),

  // summary 검증
  body('summary')
    .exists().withMessage('summary는 필수입니다')
    .isString().withMessage('summary는 문자열이어야 합니다')
    .trim()
    .isLength({ 
      min: LIMITS.MIN_SUMMARY_LENGTH, 
      max: LIMITS.MAX_SUMMARY_LENGTH 
    }).withMessage(`summary는 ${LIMITS.MIN_SUMMARY_LENGTH}-${LIMITS.MAX_SUMMARY_LENGTH}자 사이여야 합니다`)
    .notEmpty().withMessage('summary는 빈 문자열일 수 없습니다'),

  // qaHistory 검증 (선택)
  body('qaHistory')
    .optional()
    .isArray().withMessage('qaHistory는 배열이어야 합니다')
    .custom((qaHistory) => {
      if (qaHistory && qaHistory.length > LIMITS.MAX_QA_PER_HISTORY) {
        throw new Error(`qaHistory는 최대 ${LIMITS.MAX_QA_PER_HISTORY}개까지 가능합니다`);
      }
      return true;
    }),

  // qaHistory[].question 검증
  body('qaHistory.*.question')
    .optional()
    .isString().withMessage('question은 문자열이어야 합니다')
    .trim()
    .isLength({ 
      min: LIMITS.MIN_QUESTION_LENGTH, 
      max: LIMITS.MAX_QUESTION_LENGTH 
    }).withMessage(`question은 ${LIMITS.MIN_QUESTION_LENGTH}-${LIMITS.MAX_QUESTION_LENGTH}자 사이여야 합니다`),

  // qaHistory[].answer 검증
  body('qaHistory.*.answer')
    .optional()
    .isString().withMessage('answer는 문자열이어야 합니다')
    .trim()
    .isLength({ min: 1, max: 10000 }).withMessage('answer는 1-10000자 사이여야 합니다'),

  // metadata 검증 (선택)
  body('metadata')
    .optional()
    .isObject().withMessage('metadata는 객체여야 합니다')
    .custom((metadata) => {
      // metadata 객체 크기 제한
      const jsonString = JSON.stringify(metadata);
      if (jsonString.length > 10000) {
        throw new Error('metadata는 최대 10KB까지 가능합니다');
      }
      return true;
    })
];

/**
 * Q&A 추가 검증
 * POST /api/history/:historyId/qa
 */
const qaValidator = [
  // question 검증
  body('question')
    .exists().withMessage('question은 필수입니다')
    .isString().withMessage('question은 문자열이어야 합니다')
    .trim()
    .isLength({ 
      min: LIMITS.MIN_QUESTION_LENGTH, 
      max: LIMITS.MAX_QUESTION_LENGTH 
    }).withMessage(`question은 ${LIMITS.MIN_QUESTION_LENGTH}-${LIMITS.MAX_QUESTION_LENGTH}자 사이여야 합니다`)
    .notEmpty().withMessage('question은 빈 문자열일 수 없습니다'),

  // answer 검증
  body('answer')
    .exists().withMessage('answer는 필수입니다')
    .isString().withMessage('answer는 문자열이어야 합니다')
    .trim()
    .isLength({ min: 1, max: 10000 }).withMessage('answer는 1-10000자 사이여야 합니다')
    .notEmpty().withMessage('answer는 빈 문자열일 수 없습니다')
];

/**
 * 페이지네이션 검증
 * GET /api/history?limit=20&offset=0
 */
const paginationValidator = [
  // limit 검증
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('limit은 1-100 사이의 정수여야 합니다')
    .toInt(), // 문자열을 정수로 변환

  // offset 검증
  query('offset')
    .optional()
    .isInt({ min: 0 }).withMessage('offset은 0 이상의 정수여야 합니다')
    .toInt(),

  // query 검색어 검증
  query('query')
    .optional()
    .isString().withMessage('query는 문자열이어야 합니다')
    .trim()
    .isLength({ max: 200 }).withMessage('query는 최대 200자까지 가능합니다'),

  // startAfter 커서 검증 (Firestore 페이지네이션용)
  query('startAfter')
    .optional()
    .custom((value) => {
      try {
        // JSON 파싱 가능한지 확인
        if (value) {
          JSON.parse(value);
        }
        return true;
      } catch (error) {
        throw new Error('startAfter는 유효한 JSON이어야 합니다');
      }
    })
];

/**
 * ID 검증
 * GET /api/history/:historyId
 * DELETE /api/history/:historyId
 */
const idValidator = [
  param('historyId')
    .exists().withMessage('historyId는 필수입니다')
    .isString().withMessage('historyId는 문자열이어야 합니다')
    .trim()
    .matches(/^[a-zA-Z0-9_-]+$/).withMessage('historyId는 영문자, 숫자, 하이픈, 언더스코어만 가능합니다')
    .isLength({ min: 1, max: 128 }).withMessage('historyId는 1-128자 사이여야 합니다')
];

/**
 * 사용량 통계 조회 검증
 * GET /api/usage/statistics?days=7
 */
const statisticsValidator = [
  query('days')
    .optional()
    .isInt({ min: 1, max: 90 }).withMessage('days는 1-90 사이의 정수여야 합니다')
    .toInt()
];

/**
 * 이메일 검증 (인증용)
 */
const emailValidator = [
  body('email')
    .exists().withMessage('email은 필수입니다')
    .isEmail().withMessage('유효한 이메일 주소가 아닙니다')
    .normalizeEmail() // 이메일 정규화
    .isLength({ max: 255 }).withMessage('이메일은 최대 255자까지 가능합니다')
];

/**
 * 비밀번호 검증 (회원가입/로그인용)
 */
const passwordValidator = [
  body('password')
    .exists().withMessage('password는 필수입니다')
    .isString().withMessage('password는 문자열이어야 합니다')
    .isLength({ min: 8, max: 128 }).withMessage('password는 8-128자 사이여야 합니다')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('password는 대소문자와 숫자를 포함해야 합니다')
];

/**
 * 회원가입 검증
 * POST /api/auth/signup
 */
const signupValidator = [
  ...emailValidator,
  ...passwordValidator,
  
  body('name')
    .optional()
    .isString().withMessage('name은 문자열이어야 합니다')
    .trim()
    .isLength({ min: 2, max: 50 }).withMessage('name은 2-50자 사이여야 합니다'),

  body('confirmPassword')
    .exists().withMessage('confirmPassword는 필수입니다')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('비밀번호가 일치하지 않습니다');
      }
      return true;
    })
];

/**
 * 로그인 검증
 * POST /api/auth/login
 */
const loginValidator = [
  ...emailValidator,
  
  body('password')
    .exists().withMessage('password는 필수입니다')
    .isString().withMessage('password는 문자열이어야 합니다')
    .notEmpty().withMessage('password는 빈 문자열일 수 없습니다')
];

/**
 * 삭제 옵션 검증
 * DELETE /api/history/:historyId?hard=true
 */
const deleteValidator = [
  ...idValidator,
  
  query('hard')
    .optional()
    .isBoolean().withMessage('hard는 boolean이어야 합니다')
    .toBoolean()
];

/**
 * 배열 필드 검증 헬퍼
 * @param {string} field - 필드명
 * @param {number} minLength - 최소 길이
 * @param {number} maxLength - 최대 길이
 */
const arrayValidator = (field, minLength = 0, maxLength = 100) => [
  body(field)
    .optional()
    .isArray({ min: minLength, max: maxLength })
    .withMessage(`${field}는 ${minLength}-${maxLength} 사이의 배열이어야 합니다`)
];

/**
 * 파일 업로드 검증 (멀티파트 폼 데이터)
 */
const fileUploadValidator = [
  body('file')
    .custom((value, { req }) => {
      if (!req.file && !req.files) {
        throw new Error('파일이 업로드되지 않았습니다');
      }
      return true;
    }),
  
  // 파일 크기 검증 (10MB)
  body('file')
    .custom((value, { req }) => {
      const file = req.file || (req.files && req.files[0]);
      if (file && file.size > 10 * 1024 * 1024) {
        throw new Error('파일 크기는 10MB를 초과할 수 없습니다');
      }
      return true;
    }),

  // 파일 타입 검증
  body('file')
    .custom((value, { req }) => {
      const file = req.file || (req.files && req.files[0]);
      const allowedTypes = ['application/pdf', 'text/plain', 'text/html'];
      if (file && !allowedTypes.includes(file.mimetype)) {
        throw new Error('지원하지 않는 파일 형식입니다 (PDF, TXT, HTML만 가능)');
      }
      return true;
    })
];

/**
 * JSON 검증 헬퍼
 * @param {string} field - 필드명
 */
const jsonValidator = (field) => [
  body(field)
    .optional()
    .custom((value) => {
      try {
        if (typeof value === 'string') {
          JSON.parse(value);
        } else if (typeof value !== 'object') {
          throw new Error('유효한 JSON이 아닙니다');
        }
        return true;
      } catch (error) {
        throw new Error(`${field}는 유효한 JSON이어야 합니다`);
      }
    })
];

/**
 * 날짜 범위 검증
 */
const dateRangeValidator = [
  query('startDate')
    .optional()
    .isISO8601().withMessage('startDate는 ISO 8601 형식이어야 합니다')
    .toDate(),

  query('endDate')
    .optional()
    .isISO8601().withMessage('endDate는 ISO 8601 형식이어야 합니다')
    .toDate()
    .custom((endDate, { req }) => {
      if (req.query.startDate && endDate < new Date(req.query.startDate)) {
        throw new Error('endDate는 startDate보다 이후여야 합니다');
      }
      return true;
    })
];

/**
 * 정렬 옵션 검증
 */
const sortValidator = [
  query('sortBy')
    .optional()
    .isString().withMessage('sortBy는 문자열이어야 합니다')
    .isIn(['createdAt', 'updatedAt', 'title', 'url']).withMessage('sortBy는 createdAt, updatedAt, title, url 중 하나여야 합니다'),

  query('order')
    .optional()
    .isString().withMessage('order는 문자열이어야 합니다')
    .isIn(['asc', 'desc']).withMessage('order는 asc 또는 desc여야 합니다')
    .toLowerCase()
];

/**
 * UUID 검증
 */
const uuidValidator = (paramName = 'id') => [
  param(paramName)
    .exists().withMessage(`${paramName}은 필수입니다`)
    .isUUID().withMessage(`${paramName}은 유효한 UUID여야 합니다`)
];

/**
 * 커스텀 검증 생성 헬퍼
 * @param {string} field - 필드명
 * @param {Function} validatorFn - 검증 함수
 * @param {string} errorMessage - 에러 메시지
 */
const customValidator = (field, validatorFn, errorMessage) => [
  body(field)
    .custom(validatorFn)
    .withMessage(errorMessage)
];

module.exports = {
  // 핵심 함수
  validate,
  
  // 주요 검증자
  chatValidator,
  historyValidator,
  qaValidator,
  paginationValidator,
  idValidator,
  statisticsValidator,
  
  // 인증 관련
  emailValidator,
  passwordValidator,
  signupValidator,
  loginValidator,
  
  // 기타 검증자
  deleteValidator,
  fileUploadValidator,
  dateRangeValidator,
  sortValidator,
  
  // 헬퍼 함수
  arrayValidator,
  jsonValidator,
  uuidValidator,
  customValidator
};