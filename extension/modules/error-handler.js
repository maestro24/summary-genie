/**
 * SummaryGenie Error Handler
 * 에러 처리, 분류, 로깅, 재시도 로직
 * 
 * @module error-handler
 * @version 3.1.0
 * Universal Module: 브라우저 환경과 Service Worker 모두 지원
 */

/**
 * 에러 타입 정의
 * @enum {string}
 */
const ErrorType = {
  NETWORK: 'network',       // 네트워크 연결 문제
  API: 'api',               // API 호출 관련 (키, 한도 등)
  VALIDATION: 'validation', // 입력 검증 오류
  STORAGE: 'storage',       // 스토리지 관련 오류
  UNKNOWN: 'unknown'        // 기타 알 수 없는 오류
};

/**
 * 에러 심각도 레벨
 * @enum {string}
 */
const ErrorSeverity = {
  INFO: 'info',           // 정보성 (경미한 이슈)
  WARNING: 'warning',     // 경고 (주의 필요)
  ERROR: 'error',         // 에러 (기능 실패)
  CRITICAL: 'critical'    // 치명적 (시스템 중단)
};

/**
 * 에러 핸들러 클래스
 * 
 * @class
 */
class ErrorHandler {
  constructor() {
    /** @type {Array} 최근 에러 로그 (최대 50개, 메모리만) */
    this.errors = [];
    
    /** @type {number} 최대 저장 로그 수 */
    this.maxErrors = 50;
    
    console.log('[ErrorHandler] 초기화 완료 (최대 로그: 50개)');
  }
  
  // ============================================
  // 에러 처리 및 로깅
  // ============================================
  
  /**
   * 에러 처리 및 사용자 친화적 메시지 반환
   * 
   * @param {Error} error - 처리할 에러
   * @param {string} [context=''] - 에러 발생 컨텍스트
   * @param {ErrorSeverity} [severity=ErrorSeverity.ERROR] - 심각도
   * @returns {string} 사용자 친화적 메시지
   */
  handle(error, context = '', severity = ErrorSeverity.ERROR) {
    // 에러 타입 자동 분류
    const errorType = this.classifyError(error);
    
    // 에러 로깅
    this.logError(error, context, severity, errorType);
    
    // 사용자 친화적 메시지 반환
    return this.getUserMessage(error);
  }
  
  /**
   * 에러 로깅 (메모리, 최대 50개)
   * 
   * @param {Error} error - 에러 객체
   * @param {string} [context=''] - 에러 발생 위치/컨텍스트
   * @param {ErrorSeverity} [severity=ErrorSeverity.ERROR] - 심각도 레벨
   * @param {ErrorType} [type=null] - 에러 타입 (null이면 자동 분류)
   */
  logError(error, context = '', severity = ErrorSeverity.ERROR, type = null) {
    // 에러 타입 자동 분류
    const errorType = type || this.classifyError(error);
    
    // 로그 엔트리 생성
    const logEntry = {
      timestamp: new Date().toISOString(),
      context: context,
      message: error.message || String(error),
      name: error.name || 'Error',
      type: errorType,
      severity: severity,
      stack: error.stack ? error.stack.substring(0, 500) : null // 스택 일부만 저장
    };
    
    // 메모리에 저장 (FIFO)
    this.errors.push(logEntry);
    
    // 최대 50개만 유지
    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }
    
    // 콘솔 출력 (심각도에 따라 다르게)
    const logPrefix = `[${severity.toUpperCase()}] ${context}`;
    
    switch (severity) {
      case ErrorSeverity.INFO:
        console.info(logPrefix, error);
        break;
      case ErrorSeverity.WARNING:
        console.warn(logPrefix, error);
        break;
      case ErrorSeverity.CRITICAL:
        console.error(`🚨 ${logPrefix}`, error);
        break;
      case ErrorSeverity.ERROR:
      default:
        console.error(logPrefix, error);
    }
  }
  
  /**
   * 에러 타입 자동 분류
   * 
   * @private
   * @param {Error} error - 분류할 에러
   * @returns {ErrorType} 에러 타입
   */
  classifyError(error) {
    const message = (error.message || '').toLowerCase();
    const name = (error.name || '').toLowerCase();
    
    // 네트워크 에러
    if (message.includes('failed to fetch') || 
        message.includes('network') || 
        message.includes('인터넷') ||
        name.includes('network')) {
      return ErrorType.NETWORK;
    }
    
    // API 에러
    if (message.includes('api') || 
        message.includes('unauthorized') || 
        message.includes('401') ||
        message.includes('429') ||
        message.includes('rate') ||
        message.includes('한도')) {
      return ErrorType.API;
    }
    
    // 입력 검증 에러
    if (message.includes('50자') || 
        message.includes('최소') || 
        message.includes('최대') ||
        message.includes('유효') ||
        message.includes('validation')) {
      return ErrorType.VALIDATION;
    }
    
    // 스토리지 에러
    if (message.includes('storage') || 
        message.includes('quota') ||
        message.includes('저장') ||
        name.includes('quotaexceeded')) {
      return ErrorType.STORAGE;
    }
    
    // 기타
    return ErrorType.UNKNOWN;
  }
  
  /**
   * 사용자 친화적 메시지 반환
   * 
   * @private
   * @param {Error} error - 에러 객체
   * @returns {string} 사용자 메시지
   */
  getUserMessage(error) {
    const message = (error.message || '').toLowerCase();
    
    // 네트워크 에러
    if (message.includes('failed to fetch') || 
        message.includes('network') || 
        message.includes('인터넷')) {
      return '인터넷 연결을 확인해주세요.';
    }
    
    // 타임아웃
    if (message.includes('timeout') || message.includes('시간')) {
      return '요청 시간이 초과되었습니다. 다시 시도해주세요.';
    }
    
    // API 키 오류
    if (message.includes('api key') || 
        message.includes('unauthorized') || 
        message.includes('401')) {
      return 'API 키를 확인해주세요. 설정에서 올바른 키를 입력하세요.';
    }
    
    // 사용량 한도
    if (message.includes('429') || 
        message.includes('rate') || 
        message.includes('한도')) {
      return 'API 사용 한도를 초과했습니다. 잠시 후 다시 시도해주세요.';
    }
    
    // 서버 에러
    if (message.includes('500') || 
        message.includes('502') || 
        message.includes('503')) {
      return '서버에 일시적인 문제가 있습니다. 잠시 후 다시 시도해주세요.';
    }
    
    // 입력 검증 에러
    if (message.includes('50자') || 
        message.includes('최소') || 
        message.includes('최대')) {
      return error.message; // 이미 사용자 친화적
    }
    
    // 스토리지 에러
    if (message.includes('quota') || message.includes('저장')) {
      return '저장 공간이 부족합니다. 일부 데이터를 삭제해주세요.';
    }
    
    // 기본 메시지
    return error.message || '오류가 발생했습니다. 다시 시도해주세요.';
  }
  
  // ============================================
  // 재시도 로직
  // ============================================
  
  /**
   * 재시도 로직 (3회, 지수 백오프)
   * 
   * @param {Function} fn - 실행할 비동기 함수
   * @param {number} [maxRetries=3] - 최대 재시도 횟수
   * @param {number} [baseDelay=1000] - 기본 대기 시간 (밀리초)
   * @returns {Promise<*>} 함수 실행 결과
   * @throws {Error} 모든 재시도 실패 시
   */
  async retry(fn, maxRetries = 3, baseDelay = 1000) {
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        // 마지막 시도면 에러 던지기
        if (attempt === maxRetries) {
          break;
        }
        
        // 재시도 불가능한 에러는 즉시 던지기
        if (this.isNonRetryableError(error)) {
          this.logError(
            error, 
            'retry-skipped', 
            ErrorSeverity.WARNING
          );
          throw error;
        }
        
        // 지수 백오프 (1초, 2초, 4초)
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`[Retry] ${attempt + 1}/${maxRetries} - ${delay}ms 대기`);
        
        await this.sleep(delay);
      }
    }
    
    // 모든 재시도 실패
    this.logError(
      lastError, 
      'retry-failed', 
      ErrorSeverity.ERROR
    );
    throw lastError;
  }
  
  /**
   * 재시도 불가능한 에러 판정
   * 
   * @private
   * @param {Error} error - 확인할 에러
   * @returns {boolean} 재시도 불가능 여부
   */
  isNonRetryableError(error) {
    const message = (error.message || '').toLowerCase();
    
    // API 키 에러 - 재시도 불가
    if (message.includes('api key') || 
        message.includes('unauthorized') || 
        message.includes('401')) {
      return true;
    }
    
    // 입력 검증 에러 - 재시도 불가
    if (message.includes('50자') || 
        message.includes('최소') || 
        message.includes('최대') ||
        message.includes('유효한')) {
      return true;
    }
    
    // 400 Bad Request - 재시도 불가
    if (message.includes('400')) {
      return true;
    }
    
    return false;
  }
  
  /**
   * 대기 헬퍼 함수
   * 
   * @private
   * @param {number} ms - 대기 시간 (밀리초)
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // ============================================
  // 로그 조회 및 관리
  // ============================================
  
  /**
   * 최근 에러 로그 조회
   * 
   * @param {number} [limit=10] - 조회할 로그 수 (1-50)
   * @returns {Array} 에러 로그 배열
   */
  getRecentErrors(limit = 10) {
    const validLimit = Math.min(Math.max(1, limit), this.maxErrors);
    return this.errors.slice(-validLimit);
  }
  
  /**
   * 특정 타입의 에러만 조회
   * 
   * @param {ErrorType} type - 조회할 에러 타입
   * @param {number} [limit=10] - 조회할 로그 수
   * @returns {Array} 필터링된 에러 로그 배열
   */
  getErrorsByType(type, limit = 10) {
    const filtered = this.errors.filter(err => err.type === type);
    return filtered.slice(-limit);
  }
  
  /**
   * 특정 심각도 이상의 에러만 조회
   * 
   * @param {ErrorSeverity} minSeverity - 최소 심각도
   * @param {number} [limit=10] - 조회할 로그 수
   * @returns {Array} 필터링된 에러 로그 배열
   */
  getErrorsBySeverity(minSeverity, limit = 10) {
    const severityOrder = {
      [ErrorSeverity.INFO]: 0,
      [ErrorSeverity.WARNING]: 1,
      [ErrorSeverity.ERROR]: 2,
      [ErrorSeverity.CRITICAL]: 3
    };
    
    const minLevel = severityOrder[minSeverity] || 0;
    const filtered = this.errors.filter(err => 
      severityOrder[err.severity] >= minLevel
    );
    
    return filtered.slice(-limit);
  }
  
  /**
   * 에러 통계 조회
   * 
   * @returns {Object} 타입별, 심각도별 에러 개수
   */
  getErrorStats() {
    const stats = {
      total: this.errors.length,
      byType: {},
      bySeverity: {}
    };
    
    // 타입별 카운트
    Object.values(ErrorType).forEach(type => {
      stats.byType[type] = 0;
    });
    
    // 심각도별 카운트
    Object.values(ErrorSeverity).forEach(severity => {
      stats.bySeverity[severity] = 0;
    });
    
    // 집계
    this.errors.forEach(err => {
      stats.byType[err.type] = (stats.byType[err.type] || 0) + 1;
      stats.bySeverity[err.severity] = (stats.bySeverity[err.severity] || 0) + 1;
    });
    
    return stats;
  }
  
  /**
   * 에러 로그 초기화
   */
  clearErrors() {
    const count = this.errors.length;
    this.errors = [];
    console.log(`[ErrorHandler] 에러 로그 초기화 (${count}개 삭제)`);
  }
}

// ===== Universal Export (브라우저 & Service Worker 지원) =====

// 싱글톤 인스턴스 생성
const errorHandler = new ErrorHandler();

// 브라우저 환경 (window 객체)
if (typeof window !== 'undefined') {
  window.ErrorHandler = ErrorHandler;
  window.ErrorType = ErrorType;
  window.ErrorSeverity = ErrorSeverity;
  window.errorHandler = errorHandler;
}

// Service Worker 환경 (self 객체)
if (typeof self !== 'undefined' && typeof self.importScripts === 'function') {
  self.ErrorHandler = ErrorHandler;
  self.ErrorType = ErrorType;
  self.ErrorSeverity = ErrorSeverity;
  self.errorHandler = errorHandler;
}

// Global 환경
if (typeof globalThis !== 'undefined') {
  globalThis.ErrorHandler = ErrorHandler;
  globalThis.ErrorType = ErrorType;
  globalThis.ErrorSeverity = ErrorSeverity;
  globalThis.errorHandler = errorHandler;
}

console.log('[ErrorHandler] Module loaded and exposed globally');