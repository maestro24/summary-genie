/**
 * 메인 라우터
 * 모든 API 라우터를 통합하고 기본 엔드포인트 제공
 * 
 * @module routes/index
 */

const express = require('express');
const router = express.Router();

// Services (헬스체크용)
const usageService = require('../services/UsageService');
const { historyService } = require('../services/HistoryService');

// API 라우터 Import
const authRouter = require('./api/auth');
const chatRouter = require('./api/chat');
const usageRouter = require('./api/usage');
const historyRouter = require('./api/history');

// ===== 루트 엔드포인트 =====

/**
 * API 정보 엔드포인트
 * 
 * @route GET /
 * @access Public
 * 
 * @returns {Object} API 정보
 * @returns {string} name - API 이름
 * @returns {string} version - API 버전
 * @returns {string} description - API 설명
 * @returns {Object} endpoints - 엔드포인트 목록 (카테고리별)
 * @returns {Array<string>} documentation - 문서 링크
 * 
 * @example
 * GET /
 * 
 * Response:
 * {
 *   "name": "SummaryGenie API",
 *   "version": "2.0.0",
 *   "description": "AI 웹페이지 요약 서비스 API",
 *   "endpoints": {
 *     "auth": [...],
 *     "chat": [...],
 *     "usage": [...],
 *     "history": [...],
 *     "system": [...]
 *   },
 *   "documentation": ["https://docs.example.com/api"],
 *   "timestamp": "2025-10-04T10:00:00.000Z"
 * }
 */
router.get('/', (req, res) => {
  res.json({
    name: 'SummaryGenie API',
    version: '2.0.0',
    description: 'AI 웹페이지 요약 서비스 API',
    endpoints: {
      auth: [
        'POST /api/auth/signup - 회원가입',
        'POST /api/auth/login - 로그인',
        'POST /api/auth/logout - 로그아웃',
        'GET /api/auth/me - 현재 사용자 정보',
        'PUT /api/auth/profile - 프로필 업데이트',
        'POST /api/auth/change-password - 비밀번호 변경',
        'POST /api/auth/refresh - 토큰 갱신',
        'POST /api/auth/forgot-password - 비밀번호 재설정 요청',
        'POST /api/auth/verify-email - 이메일 인증'
      ],
      chat: [
        'POST /api/chat - 채팅/요약 요청',
        'GET /api/chat/circuit-breaker - Circuit Breaker 상태 조회'
      ],
      usage: [
        'GET /api/usage - 현재 사용량 조회',
        'GET /api/usage/statistics - 사용량 통계 조회',
        'GET /api/usage/check - 사용 가능 여부 확인',
        'GET /api/usage/reset-info - 리셋 시간 정보'
      ],
      history: [
        'GET /api/history/statistics - 히스토리 통계',
        'GET /api/history - 히스토리 목록 조회',
        'POST /api/history - 히스토리 저장',
        'GET /api/history/:id - 단일 히스토리 조회',
        'POST /api/history/:id/qa - Q&A 추가',
        'DELETE /api/history/:id - 히스토리 삭제'
      ],
      system: [
        'GET /health - 헬스체크',
        'GET / - API 정보'
      ]
    },
    authentication: {
      type: 'JWT',
      header: 'Authorization: Bearer <token>',
      note: '대부분의 엔드포인트는 JWT 인증이 필요합니다'
    },
    documentation: [
      'https://docs.summarygenie.com/api'
    ],
    timestamp: new Date().toISOString()
  });
});

// ===== 헬스체크 엔드포인트 =====

/**
 * 헬스체크 엔드포인트
 * 서버 상태 및 의존성 서비스 상태 확인
 * 
 * @route GET /health
 * @access Public
 * 
 * @returns {Object} 헬스체크 결과
 * @returns {string} status - 서버 상태 (healthy/degraded/unhealthy)
 * @returns {string} timestamp - 현재 시간
 * @returns {string} environment - 환경 (development/production)
 * @returns {number} uptime - 서버 가동 시간 (초)
 * @returns {Object} services - 의존 서비스 상태
 * @returns {Object} memory - 메모리 사용량
 * @returns {Object} cpu - CPU 사용량
 * 
 * @example
 * GET /health
 * 
 * Response:
 * {
 *   "status": "healthy",
 *   "timestamp": "2025-10-04T10:00:00.000Z",
 *   "environment": "production",
 *   "uptime": 86400,
 *   "services": {
 *     "usageService": { "available": true, "mode": "Firestore" },
 *     "historyService": { "available": true, "mode": "Firestore" }
 *   },
 *   "memory": {
 *     "used": 150000000,
 *     "total": 500000000,
 *     "percentage": 30
 *   }
 * }
 */
router.get('/health', (req, res) => {
  const memoryUsage = process.memoryUsage();
  
  // 서비스 상태 확인
  const services = {
    usageService: {
      available: usageService.isAvailable(),
      mode: usageService.isAvailable() ? 'Firestore' : 'Memory'
    },
    historyService: {
      available: historyService.isAvailable(),
      mode: historyService.isAvailable() ? 'Firestore' : 'Unavailable'
    }
  };
  
  // 전체 상태 결정
  const allServicesHealthy = services.usageService.available && services.historyService.available;
  const someServicesHealthy = services.usageService.available || services.historyService.available;
  
  let status = 'healthy';
  if (!allServicesHealthy && someServicesHealthy) {
    status = 'degraded';
  } else if (!someServicesHealthy) {
    status = 'unhealthy';
  }
  
  const health = {
    status,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    uptime: Math.floor(process.uptime()),
    services,
    memory: {
      used: memoryUsage.heapUsed,
      total: memoryUsage.heapTotal,
      percentage: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100)
    },
    version: '2.0.0'
  };
  
  // 상태에 따라 HTTP 상태 코드 설정
  const statusCode = status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503;
  
  res.status(statusCode).json(health);
});

// ===== API 라우터 연결 =====

/**
 * Auth API 라우터
 * 회원가입, 로그인, 프로필 관리, 토큰 갱신
 */
router.use('/api/auth', authRouter);

/**
 * Chat API 라우터
 * OpenAI를 통한 채팅/요약 기능
 */
router.use('/api/chat', chatRouter);

/**
 * Usage API 라우터
 * 사용량 조회 및 통계
 */
router.use('/api/usage', usageRouter);

/**
 * History API 라우터
 * 히스토리 CRUD 및 통계
 */
router.use('/api/history', historyRouter);

// ===== 404 핸들러 (라우터 레벨) =====

/**
 * 정의되지 않은 라우트 처리
 * 이 핸들러는 위의 모든 라우트와 매칭되지 않을 때 실행됨
 */
router.use('*', (req, res) => {
  res.status(404).json({
    error: true,
    message: '요청한 엔드포인트를 찾을 수 없습니다',
    code: 'NOT_FOUND',
    statusCode: 404,
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
    availableEndpoints: [
      'GET /',
      'GET /health',
      'POST /api/auth/signup',
      'POST /api/auth/login',
      'POST /api/chat',
      'GET /api/usage',
      'GET /api/history'
    ]
  });
});

module.exports = router;