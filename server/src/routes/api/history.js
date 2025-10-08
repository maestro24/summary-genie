/**
 * 히스토리 관리 API 라우터
 * 요약/질문 히스토리 CRUD 및 통계 제공
 * 
 * @module routes/api/history
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
const {
  validate,
  historyValidator,
  qaValidator,
  paginationValidator,
  idValidator,
  deleteValidator
} = require('../../middleware/validator');

// Services
const {
  historyService,
  PermissionError,
  NotFoundError,
  ValidationError
} = require('../../services/HistoryService');

// ===== GET /statistics - 히스토리 통계 조회 =====
// 주의: 이 라우트는 GET /:historyId보다 먼저 정의해야 함

/**
 * 사용자 히스토리 통계 조회
 * 
 * @route GET /api/history/statistics
 * @middleware authenticate - JWT 인증 필수
 * 
 * @returns {Object} 통계 정보
 * @returns {boolean} success - 성공 여부
 * @returns {Object} statistics - 통계 정보
 * @returns {number} statistics.totalCount - 총 히스토리 수
 * @returns {Object} statistics.domainStats - 도메인별 통계
 * @returns {Object} statistics.languageStats - 언어별 통계
 * @returns {Array<Object>} statistics.topTags - 상위 태그 목록
 * @returns {Object} statistics.recentActivity - 최근 활동 (7일)
 * 
 * @example
 * // Response
 * {
 *   "success": true,
 *   "statistics": {
 *     "totalCount": 150,
 *     "domainStats": {
 *       "total": 25,
 *       "top10": [
 *         { "domain": "news.com", "count": 45 },
 *         { "domain": "blog.com", "count": 30 }
 *       ]
 *     },
 *     "languageStats": {
 *       "total": 3,
 *       "breakdown": [
 *         { "language": "ko", "count": 100 },
 *         { "language": "en", "count": 50 }
 *       ]
 *     },
 *     "topTags": [
 *       { "tag": "tech", "count": 60 },
 *       { "tag": "ai", "count": 45 }
 *     ],
 *     "recentActivity": {
 *       "last7Days": 25,
 *       "percentage": 17
 *     }
 *   }
 * }
 */
router.get('/statistics', authenticate, async (req, res, next) => {
  try {
    const { userId } = req.user;
    
    console.log(`[History Statistics] 통계 조회: ${userId}`);
    
    // HistoryService에서 통계 조회
    const stats = await historyService.getStatistics(userId);
    
    res.json({
      success: true,
      statistics: stats
    });
    
  } catch (error) {
    console.error('[History Statistics] 조회 에러:', {
      userId: req.user?.userId,
      error: error.message
    });
    next(error);
  }
});

// ===== GET / - 히스토리 목록 조회 =====

/**
 * 히스토리 목록 조회 (페이지네이션, 검색 지원)
 * 
 * @route GET /api/history
 * @middleware authenticate - JWT 인증 필수
 * @middleware validate(paginationValidator) - 페이지네이션 파라미터 검증
 * 
 * @query {number} limit - 페이지 크기 (기본값: 20, 최대: 100)
 * @query {string} query - 검색 쿼리 (제목, URL 검색)
 * @query {string} startAfter - 페이지네이션 커서 (JSON 문자열)
 * 
 * @returns {Object} 히스토리 목록 및 페이지네이션 정보
 * @returns {boolean} success - 성공 여부
 * @returns {Array<Object>} items - 히스토리 목록
 * @returns {Object|null} lastDoc - 다음 페이지 커서
 * @returns {boolean} hasMore - 다음 페이지 존재 여부
 * @returns {number} total - 현재 페이지 항목 수
 * 
 * @example
 * // Request
 * GET /api/history?limit=20&query=AI
 * 
 * // Response
 * {
 *   "success": true,
 *   "items": [
 *     {
 *       "id": "hist123",
 *       "title": "AI 뉴스 기사",
 *       "url": "https://example.com/ai-news",
 *       "summary": "요약 내용...",
 *       "qaHistory": [...],
 *       "metadata": {...},
 *       "createdAt": "2025-10-04T10:00:00Z",
 *       "updatedAt": "2025-10-04T10:00:00Z"
 *     }
 *   ],
 *   "lastDoc": {...},
 *   "hasMore": true,
 *   "total": 20
 * }
 */
router.get('/', authenticate, validate(paginationValidator), async (req, res, next) => {
  try {
    const { userId } = req.user;
    const limit = parseInt(req.query.limit) || 20;
    const query = req.query.query || '';
    const startAfter = req.query.startAfter ? JSON.parse(req.query.startAfter) : null;
    
    console.log(`[History List] 목록 조회: ${userId} (limit: ${limit}, query: ${query})`);
    
    // HistoryService에서 목록 조회
    const result = await historyService.getHistory(userId, {
      limit,
      query,
      startAfter
    });
    
    res.json({
      success: true,
      ...result
    });
    
  } catch (error) {
    console.error('[History List] 조회 에러:', {
      userId: req.user?.userId,
      error: error.message
    });
    next(error);
  }
});

// ===== POST / - 히스토리 저장 =====

/**
 * 히스토리 저장
 * 
 * @route POST /api/history
 * @middleware authenticate - JWT 인증 필수
 * @middleware validate(historyValidator) - 요청 데이터 검증
 * 
 * @body {string} title - 제목 (1-500자)
 * @body {string} url - URL (유효한 URL 형식)
 * @body {string} summary - 요약 (1-10000자)
 * @body {Array<Object>} [qaHistory=[]] - Q&A 히스토리
 * @body {Object} [metadata={}] - 메타데이터
 * 
 * @returns {Object} 저장 결과
 * @returns {boolean} success - 성공 여부
 * @returns {string} message - 성공 메시지
 * @returns {string} historyId - 저장된 히스토리 ID
 * 
 * @example
 * // Request
 * POST /api/history
 * {
 *   "title": "뉴스 기사 제목",
 *   "url": "https://example.com/article",
 *   "summary": "기사 요약 내용...",
 *   "metadata": {
 *     "language": "ko",
 *     "wordCount": 1500,
 *     "tags": ["tech", "ai"]
 *   }
 * }
 * 
 * // Response
 * {
 *   "success": true,
 *   "message": "히스토리가 저장되었습니다",
 *   "historyId": "hist123abc"
 * }
 */
router.post('/', authenticate, validate(historyValidator), async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { title, url, summary, qaHistory, metadata } = req.body;
    
    console.log(`[History Save] 저장 요청: ${userId} - ${title}`);
    
    const historyData = {
      title,
      url,
      summary,
      qaHistory: qaHistory || [],
      metadata: metadata || {}
    };
    
    // HistoryService에서 저장
    const historyId = await historyService.saveHistory(userId, historyData);
    
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: '히스토리가 저장되었습니다',
      historyId
    });
    
  } catch (error) {
    console.error('[History Save] 저장 에러:', {
      userId: req.user?.userId,
      error: error.message
    });
    next(error);
  }
});

// ===== GET /:historyId - 단일 히스토리 조회 =====

/**
 * 단일 히스토리 조회
 * 
 * @route GET /api/history/:historyId
 * @middleware authenticate - JWT 인증 필수
 * @middleware validate(idValidator) - ID 파라미터 검증
 * 
 * @param {string} historyId - 히스토리 ID
 * 
 * @returns {Object} 히스토리 정보
 * @returns {boolean} success - 성공 여부
 * @returns {Object} history - 히스토리 데이터
 * 
 * @throws {404} 히스토리를 찾을 수 없는 경우
 * @throws {403} 권한이 없는 경우
 * 
 * @example
 * // Request
 * GET /api/history/hist123abc
 * 
 * // Response
 * {
 *   "success": true,
 *   "history": {
 *     "id": "hist123abc",
 *     "userId": "user123",
 *     "title": "뉴스 기사",
 *     "url": "https://example.com/article",
 *     "summary": "요약...",
 *     "qaHistory": [...],
 *     "metadata": {...},
 *     "createdAt": "2025-10-04T10:00:00Z",
 *     "updatedAt": "2025-10-04T10:00:00Z"
 *   }
 * }
 */
router.get('/:historyId', authenticate, validate(idValidator), async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { historyId } = req.params;
    
    console.log(`[History Get] 조회: ${userId} - ${historyId}`);
    
    // HistoryService에서 조회
    const history = await historyService.getHistoryById(userId, historyId);
    
    res.json({
      success: true,
      history
    });
    
  } catch (error) {
    console.error('[History Get] 조회 에러:', {
      userId: req.user?.userId,
      historyId: req.params.historyId,
      error: error.message
    });
    next(error);
  }
});

// ===== POST /:historyId/qa - Q&A 추가 =====

/**
 * Q&A 추가
 * 
 * @route POST /api/history/:historyId/qa
 * @middleware authenticate - JWT 인증 필수
 * @middleware validate([...idValidator, ...qaValidator]) - 파라미터 및 데이터 검증
 * 
 * @param {string} historyId - 히스토리 ID
 * @body {string} question - 질문 (1-5000자)
 * @body {string} answer - 답변 (1-5000자)
 * 
 * @returns {Object} 추가 결과
 * @returns {boolean} success - 성공 여부
 * @returns {string} message - 성공 메시지
 * 
 * @throws {404} 히스토리를 찾을 수 없는 경우
 * @throws {403} 권한이 없는 경우
 * 
 * @example
 * // Request
 * POST /api/history/hist123abc/qa
 * {
 *   "question": "주요 내용은?",
 *   "answer": "주요 내용은 AI 발전에 관한 것입니다."
 * }
 * 
 * // Response
 * {
 *   "success": true,
 *   "message": "Q&A가 추가되었습니다"
 * }
 */
router.post('/:historyId/qa', authenticate, validate([...idValidator, ...qaValidator]), async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { historyId } = req.params;
    const { question, answer } = req.body;
    
    console.log(`[History QA] Q&A 추가: ${userId} - ${historyId}`);
    
    // HistoryService에서 Q&A 추가
    await historyService.addQA(userId, historyId, question, answer);
    
    res.json({
      success: true,
      message: 'Q&A가 추가되었습니다'
    });
    
  } catch (error) {
    console.error('[History QA] 추가 에러:', {
      userId: req.user?.userId,
      historyId: req.params.historyId,
      error: error.message
    });
    next(error);
  }
});

// ===== DELETE /:historyId - 히스토리 삭제 =====

/**
 * 히스토리 삭제
 * 
 * @route DELETE /api/history/:historyId
 * @middleware authenticate - JWT 인증 필수
 * @middleware validate(deleteValidator) - 파라미터 검증
 * 
 * @param {string} historyId - 히스토리 ID
 * @query {boolean} [hard=false] - true면 완전 삭제, false면 soft delete
 * 
 * @returns {Object} 삭제 결과
 * @returns {boolean} success - 성공 여부
 * @returns {string} message - 성공 메시지
 * 
 * @throws {404} 히스토리를 찾을 수 없는 경우
 * @throws {403} 권한이 없는 경우
 * 
 * @example
 * // Soft delete
 * DELETE /api/history/hist123abc
 * 
 * // Hard delete
 * DELETE /api/history/hist123abc?hard=true
 * 
 * // Response
 * {
 *   "success": true,
 *   "message": "히스토리가 삭제되었습니다"
 * }
 */
router.delete('/:historyId', authenticate, validate(deleteValidator), async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { historyId } = req.params;
    const hardDelete = req.query.hard === 'true';
    
    console.log(`[History Delete] 삭제 요청: ${userId} - ${historyId} (hard: ${hardDelete})`);
    
    // HistoryService에서 삭제
    await historyService.deleteHistory(userId, historyId, hardDelete);
    
    res.json({
      success: true,
      message: hardDelete ? '히스토리가 완전히 삭제되었습니다' : '히스토리가 삭제되었습니다'
    });
    
  } catch (error) {
    console.error('[History Delete] 삭제 에러:', {
      userId: req.user?.userId,
      historyId: req.params.historyId,
      hardDelete: req.query.hard,
      error: error.message
    });
    next(error);
  }
});

module.exports = router;