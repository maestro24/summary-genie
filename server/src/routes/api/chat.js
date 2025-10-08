/**
 * 채팅 API 라우터
 * OpenAI API를 통한 요약 및 질문 응답 처리
 * 
 * ✨ v2.1 업데이트:
 * - 요약 시 상세 정보를 UsageService에 전달
 * - 날짜 → 요약ID → 상세 정보 구조로 저장
 * 
 * @module routes/api/chat
 */

const express = require('express');
const router = express.Router();

// Constants
const {
  OPENAI,
  ERROR_CODES,
  ERROR_MESSAGES,
  HTTP_STATUS,
  FEATURE_TYPES,
  CIRCUIT_BREAKER
} = require('../../constants');

// Middleware
const { optionalAuth } = require('../../middleware/auth');
const { chatValidator, validate } = require('../../middleware/validator');
const { chatLimiter } = require('../../middleware/rateLimiter');

// Services
const usageService = require('../../services/UsageService');
const { historyService } = require('../../services/HistoryService');

// Error Classes
const {
  ValidationError,
  OpenAIError,
  NetworkError
} = require('../../middleware/errorHandler');

// ===== Circuit Breaker 구현 =====

class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold || CIRCUIT_BREAKER.FAILURE_THRESHOLD;
    this.timeout = options.timeout || CIRCUIT_BREAKER.TIMEOUT;
    this.resetTimeout = options.resetTimeout || CIRCUIT_BREAKER.RESET_TIMEOUT;
    
    this.state = 'CLOSED';
    this.failures = 0;
    this.nextAttempt = Date.now();
    this.successCount = 0;
    this.lastFailureTime = null;
  }
  
  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new Error(`Circuit breaker is OPEN for ${this.name}. Retry after ${Math.ceil((this.nextAttempt - Date.now()) / 1000)}s`);
      }
      this.state = 'HALF_OPEN';
      console.log(`[Circuit Breaker] ${this.name} is now HALF_OPEN`);
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  onSuccess() {
    this.failures = 0;
    
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= CIRCUIT_BREAKER.HALF_OPEN_SUCCESS_THRESHOLD) {
        this.state = 'CLOSED';
        this.successCount = 0;
        console.log(`[Circuit Breaker] ${this.name} is now CLOSED`);
      }
    }
  }
  
  onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.resetTimeout;
      console.error(`[Circuit Breaker] ${this.name} is now OPEN (failures: ${this.failures})`);
    }
  }
  
  getState() {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime
    };
  }
}

const openAICircuitBreaker = new CircuitBreaker('OpenAI', {
  failureThreshold: CIRCUIT_BREAKER.FAILURE_THRESHOLD,
  resetTimeout: CIRCUIT_BREAKER.RESET_TIMEOUT
});

// ===== OpenAI API 호출 함수 =====

async function callOpenAI(model, messages, maxTokens, temperature) {
  const modelToUse = model || process.env.FALLBACK_MODEL || OPENAI.DEFAULT_MODEL;
  
  if (!OPENAI.AVAILABLE_MODELS.includes(modelToUse)) {
    throw new ValidationError(`지원하지 않는 모델입니다: ${modelToUse}`);
  }
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI.API_TIMEOUT);
  
  try {
    console.log(`[OpenAI] API 호출 시작 - 모델: ${modelToUse}, 메시지 수: ${messages.length}`);
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: modelToUse,
        messages: messages,
        temperature: temperature !== undefined ? temperature : OPENAI.DEFAULT_TEMPERATURE,
        max_tokens: maxTokens || OPENAI.DEFAULT_MAX_TOKENS
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      const error = await response.json();
      console.error('[OpenAI] API 오류:', {
        status: response.status,
        error: error.error?.message
      });
      
      throw new OpenAIError(
        `OpenAI API error: ${response.status} - ${error.error?.message || 'Unknown error'}`
      );
    }
    
    const data = await response.json();
    console.log(`[OpenAI] API 호출 성공 - 토큰 사용: ${data.usage?.total_tokens || 'N/A'}`);
    
    return data;
    
  } catch (error) {
    clearTimeout(timeout);
    
    if (error.name === 'AbortError') {
      console.error('[OpenAI] API 타임아웃');
      throw new NetworkError(ERROR_MESSAGES.OPENAI_TIMEOUT);
    }
    
    throw error;
  }
}

// ===== POST / 엔드포인트 =====

/**
 * 채팅/요약 요청 처리
 * ✨ 수정: 요약 상세 정보를 UsageService에 전달
 * 
 * @route POST /api/chat
 * @middleware optionalAuth - JWT 인증 선택적 (있으면 사용, 없으면 익명)
 * @middleware validate(chatValidator) - 요청 데이터 검증
 * @middleware chatLimiter - Rate limiting
 */
router.post('/', 
  optionalAuth,
  validate(chatValidator), 
  chatLimiter, 
  async (req, res, next) => {
    try {
      // 사용자 정보 처리
      const userId = req.user?.userId || `guest_${Date.now()}`;
      const email = req.user?.email || 'anonymous@guest.com';
      const isPremium = req.user?.isPremium || false;
      
      const { model, messages, max_tokens, temperature } = req.body;
      
      console.log('[Chat] 요청 수신:', {
        userId,
        email,
        isPremium: isPremium ? 'premium' : 'free',
        authenticated: !!req.user,
        model: model || 'default',
        messageCount: messages.length
      });
      
      // ===== 1. 사용량 체크 =====
      const canUse = await usageService.checkLimit(userId, isPremium);
      
      if (!canUse) {
        const usage = await usageService.getUsage(userId, isPremium);
        
        console.warn(`[Chat] 사용 한도 초과 - userId: ${userId}, used: ${usage.used}/${usage.limit}`);
        
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          error: true,
          message: isPremium 
            ? '일시적인 사용 제한입니다' 
            : ERROR_MESSAGES.DAILY_LIMIT_EXCEEDED,
          code: ERROR_CODES.USAGE_LIMIT_EXCEEDED,
          statusCode: HTTP_STATUS.FORBIDDEN,
          usage: {
            used: usage.used,
            limit: usage.limit === Infinity ? 'unlimited' : usage.limit,
            remaining: usage.remaining === Infinity ? 'unlimited' : usage.remaining
          },
          upgrade: !isPremium ? {
            message: '프리미엄으로 업그레이드하면 무제한으로 사용할 수 있습니다',
            link: '/pricing'
          } : null
        });
      }
      
      // ===== 2. OpenAI API 호출 (Circuit Breaker 포함) =====
      const apiResponse = await openAICircuitBreaker.execute(async () => {
        return await callOpenAI(model, messages, max_tokens, temperature);
      });
      
      // 🆕 요약 결과 텍스트 추출
      const summaryText = apiResponse.choices[0]?.message?.content || '';
      
      // ===== 3. 히스토리 저장 (인증된 사용자만) =====
      let savedHistoryId = null;
      
      if (req.user?.userId && req.body.saveHistory !== false) {
        try {
          // title과 url이 제공되지 않으면 저장하지 않음
          if (req.body.title && req.body.url && summaryText) {
            const historyData = {
              title: req.body.title.substring(0, 500),
              url: req.body.url,
              summary: summaryText.substring(0, 10000),
              qaHistory: [],
              metadata: {
                language: req.body.language || 'ko',
                model: model || OPENAI.DEFAULT_MODEL,
                wordCount: summaryText.length,
                tags: []
              }
            };
            
            savedHistoryId = await historyService.saveHistory(userId, historyData);
            console.log(`📚 히스토리 자동 저장 완료: ${userId} - ${historyData.title}`);
          }
        } catch (historyError) {
          // 히스토리 저장 실패해도 요약 응답은 정상 반환
          console.error('⚠️ 히스토리 저장 실패:', {
            userId,
            error: historyError.message
          });
        }
      }
      
      // ===== 4. 🆕 사용량 기록 + 요약 상세 정보 저장 =====
      // 요약 상세 정보 객체 생성
      const summaryDetail = req.body.title && req.body.url && summaryText ? {
        title: req.body.title.substring(0, 500),
        url: req.body.url,
        summary: summaryText.substring(0, 10000),
        model: model || OPENAI.DEFAULT_MODEL,
        language: req.body.language || 'ko',
        wordCount: summaryText.length,
        historyId: savedHistoryId // HistoryService와 연결
      } : null;
      
      // 사용량 추적 (요약 상세 정보 포함)
      const usageInfo = await usageService.trackUsage(
        userId, 
        FEATURE_TYPES.SUMMARY, 
        isPremium,
        summaryDetail // 🆕 요약 상세 정보 전달
      );
      
      console.log(`[Chat] 사용량 기록 완료 - userId: ${userId}, current: ${usageInfo.current}/${usageInfo.limit}`);
      
      // ===== 5. 응답 =====
      res.json({
        ...apiResponse,
        usage: {
          ...apiResponse.usage,
          userUsage: {
            userId,
            current: usageInfo.current,
            limit: usageInfo.limit === Infinity ? 'unlimited' : usageInfo.limit,
            remaining: usageInfo.remaining === Infinity ? 'unlimited' : usageInfo.remaining,
            isPremium: usageInfo.isPremium,
            authenticated: !!req.user
          }
        }
      });
      
    } catch (error) {
      console.error('[Chat] 에러 발생:', {
        userId: req.user?.userId || 'anonymous',
        error: error.message,
        stack: error.stack
      });
      
      next(error);
    }
  }
);

// ===== Circuit Breaker 상태 조회 엔드포인트 =====

router.get('/circuit-breaker', (req, res) => {
  const state = openAICircuitBreaker.getState();
  
  res.json({
    success: true,
    circuitBreaker: state,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;