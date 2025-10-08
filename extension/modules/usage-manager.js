/**
 * SummaryGenie Usage Manager
 * 서버 기반 사용량 추적 및 제한 관리
 * 
 * @module usage-manager
 * @version 1.3.0
 * @requires error-handler.js (전역 - window.errorHandler)
 * @requires security.js (전역 - window.validateInput)
 */

/**
 * 사용량 타입
 * @enum {string}
 */
const USAGE_TYPE = {
  SUMMARY: 'summary',
  QUESTION: 'question'
};

/**
 * UsageManager 클래스
 * 서버 기반 사용량 추적, 제한 확인 및 캐싱
 */
class UsageManager {
  constructor() {
    this.apiBaseUrl = 'http://localhost:3000';
    this.cachedUsage = null;
    this.cacheExpiry = 60000; // 1분
    this.cacheTimestamp = 0;
    
    console.log('[UsageManager] 초기화');
  }

  /**
   * 인증 토큰 조회 (Background 없이 직접 storage 접근)
   * @private
   * @returns {Promise<string|null>} 액세스 토큰
   */
  async getAuthToken() {
    try {
      console.log('[UsageManager] storage에서 토큰 조회');
      
      const result = await chrome.storage.local.get('tokens');
      
      if (!result.tokens || !result.tokens.accessToken) {
        console.warn('[UsageManager] 토큰 없음');
        return null;
      }
      
      const token = result.tokens.accessToken;
      const parts = token.split('.');
      
      if (parts.length !== 3) {
        console.warn('[UsageManager] 잘못된 토큰 형식');
        return null;
      }
      
      // 토큰 만료 확인
      try {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        const exp = payload.exp * 1000;
        const now = Date.now();
        
        if (exp <= now) {
          console.warn('[UsageManager] 토큰 만료됨');
          return null;
        }
        
        console.log('[UsageManager] 토큰 유효함');
        return token;
        
      } catch (decodeError) {
        console.error('[UsageManager] 토큰 디코딩 실패:', decodeError);
        return null;
      }
      
    } catch (error) {
      console.error('[UsageManager] 토큰 조회 실패:', error);
      return null;
    }
  }

  /**
   * 캐시 유효성 검사
   * @private
   * @returns {boolean} 캐시가 유효하면 true
   */
  isCacheValid() {
    if (!this.cachedUsage) {
      return false;
    }
    
    const now = Date.now();
    const elapsed = now - this.cacheTimestamp;
    
    return elapsed < this.cacheExpiry;
  }

  /**
   * 서버에서 사용량 조회
   * @returns {Promise<Object>} 사용량 정보
   * @throws {Error} API 호출 실패시
   */
  async getUsageStatus() {
    try {
      if (this.isCacheValid()) {
        console.log('[UsageManager] 캐시에서 사용량 반환');
        return this.cachedUsage;
      }

      console.log('[UsageManager] 서버에서 사용량 조회 시작');
      
      const token = await this.getAuthToken();
      if (!token) {
        throw new Error('인증 토큰이 없습니다');
      }

      // 올바른 엔드포인트: /api/usage (not /api/usage/status)
      console.log('[UsageManager] API 호출:', `${this.apiBaseUrl}/api/usage`);

      const response = await fetch(`${this.apiBaseUrl}/api/usage`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('[UsageManager] API 응답 상태:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `사용량 조회 실패: ${response.status}`);
      }

      const result = await response.json();
      
      console.log('[UsageManager] API 응답 데이터:', result);
      
      // 백엔드 응답 형식에 맞게 수정
      if (!result.success || !result.usage) {
        throw new Error('유효하지 않은 응답 형식입니다');
      }

      // 백엔드 형식을 프론트엔드 형식으로 변환
      const usageData = {
        isPremium: result.isPremium || false,
        dailyUsed: result.usage.used || 0,
        dailyLimit: result.usage.limit === 'unlimited' ? Infinity : (result.usage.limit || 5),
        questionUsed: result.usage.questionUsed || 0,
        questionLimit: result.usage.questionLimit === 'unlimited' ? Infinity : (result.usage.questionLimit || 5),
        resetAt: result.usage.resetAt
      };
      
      console.log('[UsageManager] 변환된 사용량 데이터:', usageData);
      
      const validation = this.validateUsageData(usageData);
      
      if (!validation.valid) {
        throw new Error(`사용량 데이터 검증 실패: ${validation.error}`);
      }

      this.cachedUsage = usageData;
      this.cacheTimestamp = Date.now();

      console.log('[UsageManager] 사용량 조회 완료:', {
        isPremium: usageData.isPremium,
        dailyUsed: usageData.dailyUsed,
        dailyLimit: usageData.dailyLimit
      });

      return this.cachedUsage;

    } catch (error) {
      console.error('[UsageManager] getUsageStatus 오류:', error);
      window.errorHandler.handle(error, 'UsageManager.getUsageStatus');
      throw error;
    }
  }

  /**
   * 사용량 데이터 검증
   * @private
   * @param {Object} data - 검증할 데이터
   * @returns {Object} 검증 결과 {valid: boolean, error?: string}
   */
  validateUsageData(data) {
    if (typeof data.isPremium !== 'boolean') {
      return { valid: false, error: 'isPremium은 boolean이어야 합니다' };
    }

    if (!data.isPremium) {
      if (typeof data.dailyLimit !== 'number' || data.dailyLimit < 0) {
        return { valid: false, error: '유효하지 않은 dailyLimit입니다' };
      }

      if (typeof data.dailyUsed !== 'number' || data.dailyUsed < 0) {
        return { valid: false, error: '유효하지 않은 dailyUsed입니다' };
      }

      if (typeof data.questionLimit !== 'number' || data.questionLimit < 0) {
        return { valid: false, error: '유효하지 않은 questionLimit입니다' };
      }

      if (typeof data.questionUsed !== 'number' || data.questionUsed < 0) {
        return { valid: false, error: '유효하지 않은 questionUsed입니다' };
      }
    }

    return { valid: true };
  }

  /**
   * 요약 가능 여부 확인
   * @returns {Promise<Object>} {allowed: boolean, reason?: string, usage?: Object}
   */
  async canSummarize() {
    try {
      const usage = await this.getUsageStatus();

      if (usage.isPremium) {
        return { 
          allowed: true, 
          usage 
        };
      }

      if (usage.dailyUsed >= usage.dailyLimit) {
        return {
          allowed: false,
          reason: 'DAILY_LIMIT_EXCEEDED',
          usage
        };
      }

      return { 
        allowed: true, 
        usage 
      };

    } catch (error) {
      window.errorHandler.handle(error, 'UsageManager.canSummarize');
      throw error;
    }
  }

  /**
   * 질문 가능 여부 확인
   * @returns {Promise<Object>} {allowed: boolean, reason?: string, usage?: Object}
   */
  async canAskQuestion() {
    try {
      const usage = await this.getUsageStatus();

      if (usage.isPremium) {
        return { 
          allowed: true, 
          usage 
        };
      }

      if (usage.questionUsed >= usage.questionLimit) {
        return {
          allowed: false,
          reason: 'QUESTION_LIMIT_EXCEEDED',
          usage
        };
      }

      return { 
        allowed: true, 
        usage 
      };

    } catch (error) {
      window.errorHandler.handle(error, 'UsageManager.canAskQuestion');
      throw error;
    }
  }

  /**
   * 사용량 증가 (서버 호출)
   * @param {string} type - 사용량 타입 ('summary' | 'question')
   * @returns {Promise<Object>} 업데이트된 사용량 정보
   * @throws {Error} API 호출 실패시 (404는 제외)
   */
  async incrementUsage(type) {
    try {
      const typeValidation = window.validateInput(type, {
        type: 'string',
        required: true,
        allowedValues: [USAGE_TYPE.SUMMARY, USAGE_TYPE.QUESTION]
      });

      if (!typeValidation.valid) {
        throw new Error(`유효하지 않은 사용량 타입: ${type}`);
      }

      const token = await this.getAuthToken();
      if (!token) {
        throw new Error('인증 토큰이 없습니다');
      }

      console.log('[UsageManager] 사용량 증가 API 호출:', type);

      const response = await fetch(`${this.apiBaseUrl}/api/usage/increment`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ type: typeValidation.sanitized })
      });

      if (!response.ok) {
        // 404 에러인 경우 캐시만 업데이트 (임시 처리) - 에러 throw 하지 않음
        if (response.status === 404) {
          console.warn('[UsageManager] increment 엔드포인트 없음 - 로컬 캐시만 업데이트');
          
          if (this.cachedUsage && !this.cachedUsage.isPremium) {
            // 로컬 캐시 업데이트
            if (type === USAGE_TYPE.SUMMARY) {
              this.cachedUsage.dailyUsed = (this.cachedUsage.dailyUsed || 0) + 1;
            } else if (type === USAGE_TYPE.QUESTION) {
              this.cachedUsage.questionUsed = (this.cachedUsage.questionUsed || 0) + 1;
            }
            
            console.log('[UsageManager] 로컬 캐시 업데이트 완료:', {
              type,
              dailyUsed: this.cachedUsage.dailyUsed,
              questionUsed: this.cachedUsage.questionUsed
            });
            
            return this.cachedUsage;
          }
          
          // 캐시가 없으면 다시 조회
          console.log('[UsageManager] 캐시 없음 - 서버에서 재조회');
          return await this.getUsageStatus();
        }
        
        // 404가 아닌 다른 에러는 throw
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `사용량 증가 실패: ${response.status}`);
      }

      const result = await response.json();
      
      // 백엔드 응답 형식 변환
      if (result.success && result.usage) {
        const usageData = {
          isPremium: result.isPremium || false,
          dailyUsed: result.usage.used || 0,
          dailyLimit: result.usage.limit === 'unlimited' ? Infinity : (result.usage.limit || 5),
          questionUsed: result.usage.questionUsed || 0,
          questionLimit: result.usage.questionLimit === 'unlimited' ? Infinity : (result.usage.questionLimit || 5),
          resetAt: result.usage.resetAt
        };
        
        this.cachedUsage = usageData;
        this.cacheTimestamp = Date.now();

        console.log('[UsageManager] 사용량 증가 완료:', {
          type: typeValidation.sanitized,
          dailyUsed: usageData.dailyUsed,
          questionUsed: usageData.questionUsed
        });

        return this.cachedUsage;
      }
      
      throw new Error('유효하지 않은 응답 형식입니다');

    } catch (error) {
      // 404 에러는 이미 위에서 처리했으므로 여기서는 throw하지 않음
      if (error.message && error.message.includes('404')) {
        console.warn('[UsageManager] 404 에러 - 무시하고 현재 캐시 반환');
        return this.cachedUsage || { isPremium: false, dailyUsed: 0, dailyLimit: 5, questionUsed: 0, questionLimit: 5 };
      }
      
      console.error('[UsageManager] incrementUsage 오류:', error);
      window.errorHandler.handle(error, 'UsageManager.incrementUsage');
      throw error;
    }
  }

  /**
   * 남은 횟수 반환
   * @param {string} type - 사용량 타입 ('summary' | 'question')
   * @returns {number} 남은 횟수 (프리미엄은 Infinity)
   */
  getRemainingCount(type) {
    if (!this.cachedUsage) {
      return 0;
    }

    if (this.cachedUsage.isPremium) {
      return Infinity;
    }

    if (type === USAGE_TYPE.SUMMARY) {
      return Math.max(0, this.cachedUsage.dailyLimit - this.cachedUsage.dailyUsed);
    } else if (type === USAGE_TYPE.QUESTION) {
      return Math.max(0, this.cachedUsage.questionLimit - this.cachedUsage.questionUsed);
    }

    return 0;
  }

  /**
   * 사용 가능한 총 횟수 반환
   * @param {string} type - 사용량 타입
   * @returns {number} 총 가능 횟수
   */
  getTotalLimit(type) {
    if (!this.cachedUsage) {
      return 0;
    }

    if (this.cachedUsage.isPremium) {
      return Infinity;
    }

    if (type === USAGE_TYPE.SUMMARY) {
      return this.cachedUsage.dailyLimit;
    } else if (type === USAGE_TYPE.QUESTION) {
      return this.cachedUsage.questionLimit;
    }

    return 0;
  }

  /**
   * 현재 사용 횟수 반환
   * @param {string} type - 사용량 타입
   * @returns {number} 현재 사용 횟수
   */
  getCurrentUsage(type) {
    if (!this.cachedUsage) {
      return 0;
    }

    if (type === USAGE_TYPE.SUMMARY) {
      return this.cachedUsage.dailyUsed || 0;
    } else if (type === USAGE_TYPE.QUESTION) {
      return this.cachedUsage.questionUsed || 0;
    }

    return 0;
  }

  /**
   * 프리미엄 사용자 여부 확인
   * @returns {boolean} 프리미엄이면 true
   */
  isPremium() {
    return this.cachedUsage?.isPremium || false;
  }

  /**
   * 다음 리셋 시간 반환
   * @returns {string|null} ISO 형식의 리셋 시간
   */
  getResetTime() {
    return this.cachedUsage?.resetAt || null;
  }

  /**
   * 캐시 초기화
   */
  async clearCache() {
    this.cachedUsage = null;
    this.cacheTimestamp = 0;
    console.log('[UsageManager] 캐시 초기화');
  }

  /**
   * 강제로 사용량 새로고침
   * @returns {Promise<Object>} 최신 사용량 정보
   */
  async refreshUsage() {
    await this.clearCache();
    return await this.getUsageStatus();
  }

  /**
   * 사용량 통계 조회 (7일간)
   * @param {number} days - 조회할 일수 (기본: 7일)
   * @returns {Promise<Object>} 통계 데이터
   */
  async getUsageStats(days = 7) {
    try {
      const daysValidation = window.validateInput(days, {
        type: 'number',
        required: true,
        min: 1,
        max: 90
      });

      if (!daysValidation.valid) {
        throw new Error('유효하지 않은 일수입니다 (1-90)');
      }

      const token = await this.getAuthToken();
      if (!token) {
        throw new Error('인증 토큰이 없습니다');
      }

      const response = await fetch(
        `${this.apiBaseUrl}/api/usage/stats?days=${daysValidation.sanitized}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `통계 조회 실패: ${response.status}`);
      }

      const result = await response.json();
      
      if (!result.success || !result.data) {
        throw new Error('유효하지 않은 응답 형식입니다');
      }

      console.log('[UsageManager] 통계 조회 완료');
      return result.data;

    } catch (error) {
      window.errorHandler.handle(error, 'UsageManager.getUsageStats');
      throw error;
    }
  }

  /**
   * 현재 상태 반환
   * @returns {Object} 현재 상태 정보
   */
  getState() {
    return {
      hasCachedData: !!this.cachedUsage,
      cacheAge: this.cacheTimestamp ? Date.now() - this.cacheTimestamp : 0,
      isCacheValid: this.isCacheValid(),
      isPremium: this.isPremium()
    };
  }

  /**
   * 정리 (메모리 해제)
   */
  cleanup() {
    this.cachedUsage = null;
    this.cacheTimestamp = 0;
    console.log('[UsageManager] 정리 완료');
  }
}

// 전역 인스턴스 생성
window.usageManager = new UsageManager();
window.USAGE_TYPE = USAGE_TYPE;