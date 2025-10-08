/**
 * 사용량 조회 API 라우터
 * 사용자의 요약/질문 사용량 조회 및 통계 제공
 * 
 * @module routes/api/usage
 */

const express = require('express');
const router = express.Router();

// Constants
const {
  HTTP_STATUS,
  ERROR_CODES,
  ERROR_MESSAGES
} = require('../../constants');

// Middleware
const { authenticate } = require('../../middleware/auth');
const { validate, statisticsValidator } = require('../../middleware/validator');

// Services
const usageService = require('../../services/UsageService');

// 무료 사용자 일일 한도 (상수로 선언)
const FREE_USER_DAILY_LIMIT = parseInt(process.env.FREE_USER_DAILY_LIMIT) || 5;

// ===== GET / - 현재 사용량 조회 =====

/**
 * 현재 사용자의 사용량 조회
 * 
 * @route GET /api/usage
 * @middleware authenticate - JWT 인증 필수
 * 
 * @returns {Object} 사용량 정보
 * @returns {boolean} success - 성공 여부
 * @returns {string} userId - 사용자 ID
 * @returns {string} email - 사용자 이메일
 * @returns {boolean} isPremium - 프리미엄 여부
 * @returns {Object} usage - 사용량 정보
 * @returns {number} usage.used - 사용량
 * @returns {number|string} usage.limit - 한도 (무제한: 'unlimited')
 * @returns {number|string} usage.remaining - 남은 횟수
 * @returns {string} usage.resetAt - 리셋 시간 (ISO 8601)
 * 
 * @example
 * // Response
 * {
 *   "success": true,
 *   "userId": "user123",
 *   "email": "user@example.com",
 *   "isPremium": false,
 *   "usage": {
 *     "used": 3,
 *     "limit": 5,
 *     "remaining": 2,
 *     "questionUsed": 2,
 *     "questionLimit": 5,
 *     "resetAt": "2025-10-05T00:00:00.000Z"
 *   }
 * }
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { userId, email, isPremium } = req.user;
    
    console.log(`[Usage] 사용량 조회: ${userId} (isPremium: ${isPremium})`);
    
    // UsageService에서 사용량 조회
    const usage = await usageService.getUsage(userId, isPremium);
    
    // 다음 리셋 시간 (자정)
    const tomorrow = new Date();
    tomorrow.setHours(24, 0, 0, 0);
    
    res.json({
      success: true,
      userId,
      email,
      isPremium,
      usage: {
        used: usage.used,
        limit: usage.limit === Infinity ? 'unlimited' : usage.limit,
        remaining: usage.remaining === Infinity ? 'unlimited' : usage.remaining,
        questionUsed: usage.questionUsed || 0,
        questionLimit: usage.questionLimit === Infinity ? 'unlimited' : (usage.questionLimit || FREE_USER_DAILY_LIMIT),
        resetAt: tomorrow.toISOString()
      }
    });
    
  } catch (error) {
    console.error('[Usage] 조회 에러:', {
      userId: req.user?.userId,
      error: error.message
    });
    next(error);
  }
});

// ===== POST /increment - 사용량 증가 =====

/**
 * 사용량 증가 (요약 또는 질문 사용 시 호출)
 * 
 * @route POST /api/usage/increment
 * @middleware authenticate - JWT 인증 필수
 * 
 * @body {string} type - 사용 유형 ('summary' | 'question')
 * 
 * @returns {Object} 업데이트된 사용량 정보
 * @returns {boolean} success - 성공 여부
 * @returns {string} userId - 사용자 ID
 * @returns {boolean} isPremium - 프리미엄 여부
 * @returns {Object} usage - 업데이트된 사용량
 * @returns {number} usage.used - 현재 사용량
 * @returns {number|string} usage.limit - 한도
 * @returns {number|string} usage.remaining - 남은 횟수
 * @returns {string} usage.resetAt - 리셋 시간
 * @returns {number} usage.questionUsed - 질문 사용량
 * @returns {number|string} usage.questionLimit - 질문 한도
 * 
 * @example
 * // Request
 * POST /api/usage/increment
 * {
 *   "type": "summary"
 * }
 * 
 * // Response
 * {
 *   "success": true,
 *   "userId": "user123",
 *   "isPremium": false,
 *   "usage": {
 *     "used": 4,
 *     "limit": 5,
 *     "remaining": 1,
 *     "questionUsed": 2,
 *     "questionLimit": 5,
 *     "resetAt": "2025-10-05T00:00:00.000Z"
 *   }
 * }
 */
router.post('/increment', authenticate, async (req, res, next) => {
  try {
    const { userId, isPremium } = req.user;
    const { type } = req.body;
    
    // type 검증
    if (!type || !['summary', 'question'].includes(type)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: 'type은 "summary" 또는 "question"이어야 합니다',
        code: ERROR_CODES.VALIDATION_ERROR
      });
    }
    
    console.log(`[Usage Increment] 사용량 증가: ${userId} - ${type}`);
    
    // UsageService에서 사용량 추적
    await usageService.trackUsage(userId, type, isPremium);
    
    // 업데이트된 사용량 조회
    const usage = await usageService.getUsage(userId, isPremium);
    
    const tomorrow = new Date();
    tomorrow.setHours(24, 0, 0, 0);
    
    res.json({
      success: true,
      userId,
      isPremium,
      usage: {
        used: usage.used,
        limit: usage.limit === Infinity ? 'unlimited' : usage.limit,
        remaining: usage.remaining === Infinity ? 'unlimited' : usage.remaining,
        questionUsed: usage.questionUsed || 0,
        questionLimit: usage.questionLimit === Infinity ? 'unlimited' : (usage.questionLimit || FREE_USER_DAILY_LIMIT),
        resetAt: tomorrow.toISOString()
      }
    });
    
  } catch (error) {
    console.error('[Usage Increment] 에러:', {
      userId: req.user?.userId,
      type: req.body?.type,
      error: error.message
    });
    next(error);
  }
});

// ===== GET /statistics - 통계 조회 =====

/**
 * 사용자의 사용량 통계 조회
 * 
 * @route GET /api/usage/statistics
 * @middleware authenticate - JWT 인증 필수
 * @middleware validate(statisticsValidator) - 쿼리 파라미터 검증
 * 
 * @query {number} days - 조회 기간 (일) (기본값: 7, 범위: 1-90)
 * 
 * @returns {Object} 통계 정보
 * @returns {boolean} success - 성공 여부
 * @returns {string} userId - 사용자 ID
 * @returns {Object} statistics - 통계 정보
 * @returns {Object} statistics.today - 오늘 사용량
 * @returns {number} statistics.today.summary_count - 요약 횟수
 * @returns {number} statistics.today.question_count - 질문 횟수
 * @returns {number} statistics.today.total_count - 총 횟수
 * @returns {Object} statistics.week - 주간 합계
 * @returns {number} statistics.week.summary_count - 요약 횟수
 * @returns {number} statistics.week.question_count - 질문 횟수
 * @returns {number} statistics.week.total_count - 총 횟수
 * @returns {number} statistics.week.days - 조회 기간
 * @returns {Object} statistics.total - 전체 합계
 * @returns {Array<Object>} statistics.dailyBreakdown - 일별 상세 내역
 * 
 * @example
 * // Request
 * GET /api/usage/statistics?days=7
 * 
 * // Response
 * {
 *   "success": true,
 *   "userId": "user123",
 *   "statistics": {
 *     "today": {
 *       "summary_count": 3,
 *       "question_count": 2,
 *       "total_count": 5
 *     },
 *     "week": {
 *       "summary_count": 15,
 *       "question_count": 8,
 *       "total_count": 23,
 *       "days": 7
 *     },
 *     "total": {
 *       "summary_count": 15,
 *       "question_count": 8,
 *       "total_count": 23
 *     },
 *     "dailyBreakdown": [
 *       {
 *         "date": "2025-10-01",
 *         "summary_count": 2,
 *         "question_count": 1,
 *         "total_count": 3
 *       }
 *     ]
 *   }
 * }
 */
router.get('/statistics', authenticate, validate(statisticsValidator), async (req, res, next) => {
  try {
    const { userId } = req.user;
    const days = parseInt(req.query.days) || 7;
    
    console.log(`[Usage Statistics] 통계 조회: ${userId} (${days}일)`);
    
    // UsageService에서 통계 조회
    const stats = await usageService.getStatistics(userId, days);
    
    res.json({
      success: true,
      userId,
      statistics: stats
    });
    
  } catch (error) {
    console.error('[Usage Statistics] 조회 에러:', {
      userId: req.user?.userId,
      days: req.query.days,
      error: error.message
    });
    next(error);
  }
});

// ===== GET /check - 사용 가능 여부 확인 (헬퍼 엔드포인트) =====

/**
 * 사용 가능 여부 확인
 * 
 * @route GET /api/usage/check
 * @middleware authenticate - JWT 인증 필수
 * 
 * @returns {Object} 사용 가능 여부
 * @returns {boolean} success - 성공 여부
 * @returns {boolean} canUse - 사용 가능 여부
 * @returns {string} reason - 사용 불가 사유 (사용 불가 시)
 * @returns {Object} usage - 현재 사용량 정보
 * 
 * @example
 * // Response (사용 가능)
 * {
 *   "success": true,
 *   "canUse": true,
 *   "usage": {
 *     "used": 3,
 *     "limit": 5,
 *     "remaining": 2
 *   }
 * }
 * 
 * // Response (사용 불가)
 * {
 *   "success": true,
 *   "canUse": false,
 *   "reason": "일일 무료 사용 한도를 초과했습니다",
 *   "usage": {
 *     "used": 5,
 *     "limit": 5,
 *     "remaining": 0
 *   }
 * }
 */
router.get('/check', authenticate, async (req, res, next) => {
  try {
    const { userId, isPremium } = req.user;
    
    console.log(`[Usage Check] 사용 가능 여부 확인: ${userId}`);
    
    // 사용 가능 여부 확인
    const canUse = await usageService.checkLimit(userId, isPremium);
    
    // 현재 사용량 조회
    const usage = await usageService.getUsage(userId, isPremium);
    
    const response = {
      success: true,
      canUse,
      usage: {
        used: usage.used,
        limit: usage.limit === Infinity ? 'unlimited' : usage.limit,
        remaining: usage.remaining === Infinity ? 'unlimited' : usage.remaining
      }
    };
    
    // 사용 불가 시 사유 추가
    if (!canUse) {
      response.reason = isPremium 
        ? '일시적인 사용 제한입니다' 
        : ERROR_MESSAGES.DAILY_LIMIT_EXCEEDED;
    }
    
    res.json(response);
    
  } catch (error) {
    console.error('[Usage Check] 확인 에러:', {
      userId: req.user?.userId,
      error: error.message
    });
    next(error);
  }
});

// ===== GET /reset-info - 리셋 정보 조회 =====

/**
 * 사용량 리셋 시간 정보 조회
 * 
 * @route GET /api/usage/reset-info
 * @middleware authenticate - JWT 인증 필수
 * 
 * @returns {Object} 리셋 정보
 * @returns {boolean} success - 성공 여부
 * @returns {string} resetAt - 리셋 시간 (ISO 8601)
 * @returns {number} resetIn - 리셋까지 남은 시간 (밀리초)
 * @returns {string} resetInHuman - 리셋까지 남은 시간 (사람이 읽기 쉬운 형식)
 * 
 * @example
 * // Response
 * {
 *   "success": true,
 *   "resetAt": "2025-10-05T00:00:00.000Z",
 *   "resetIn": 7200000,
 *   "resetInHuman": "2시간"
 * }
 */
router.get('/reset-info', authenticate, async (req, res, next) => {
  try {
    const now = new Date();
    const tomorrow = new Date();
    tomorrow.setHours(24, 0, 0, 0);
    
    const resetIn = tomorrow.getTime() - now.getTime();
    
    // 사람이 읽기 쉬운 형식으로 변환
    const hours = Math.floor(resetIn / (1000 * 60 * 60));
    const minutes = Math.floor((resetIn % (1000 * 60 * 60)) / (1000 * 60));
    
    let resetInHuman = '';
    if (hours > 0) {
      resetInHuman += `${hours}시간 `;
    }
    if (minutes > 0 || hours === 0) {
      resetInHuman += `${minutes}분`;
    }
    
    res.json({
      success: true,
      resetAt: tomorrow.toISOString(),
      resetIn,
      resetInHuman: resetInHuman.trim()
    });
    
  } catch (error) {
    console.error('[Usage Reset Info] 조회 에러:', {
      userId: req.user?.userId,
      error: error.message
    });
    next(error);
  }
});

module.exports = router;