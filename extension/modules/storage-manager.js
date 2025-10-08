/**
 * SummaryGenie Storage Manager (ErrorHandler 통합 버전)
 * Chrome Storage API 작업을 중앙 관리하는 모듈
 * 
 * @module storage-manager
 * @version 5.2.0
 * Universal Module: 브라우저 환경과 Service Worker 모두 지원
 */

/**
 * 오늘 날짜 문자열 반환 (YYYY-MM-DD)
 * @returns {string} 오늘 날짜
 */
function getTodayString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * StorageManager 클래스
 * Chrome Storage 작업을 캡슐화하고 관리
 */
class StorageManager {
  constructor() {
    // errorHandler는 전역에서 사용 가능
    this.errorHandler = typeof window !== 'undefined' ? window.errorHandler : 
                        (typeof self !== 'undefined' ? self.errorHandler : 
                        (typeof globalThis !== 'undefined' ? globalThis.errorHandler : null));
    
    console.log('[Storage] StorageManager 초기화 완료');
  }
  
  /**
   * API 키 저장 (평문)
   * @param {string} apiKey - 저장할 OpenAI API 키
   * @returns {Promise<boolean>} 성공 여부
   */
  async saveApiKey(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
      const error = new Error('유효하지 않은 API 키입니다.');
      if (this.errorHandler) {
        this.errorHandler.handle(error, 'StorageManager.saveApiKey');
      }
      return false;
    }
    
    console.warn('[Storage] ⚠️ API 키를 평문으로 저장합니다. 보안에 주의하세요.');
    
    try {
      await chrome.storage.local.set({ apiKey: apiKey });
      console.log('[Storage] API 키 저장 완료');
      return true;
    } catch (error) {
      if (this.errorHandler) {
        this.errorHandler.handle(error, 'StorageManager.saveApiKey');
      }
      return false;
    }
  }
  
  /**
   * API 키 로드 (마이그레이션 지원)
   * @returns {Promise<string|null>} API 키 또는 null
   */
  async getApiKey() {
    try {
      const result = await chrome.storage.local.get(['apiKey']);
      const storedValue = result.apiKey;
      
      if (!storedValue) {
        return null;
      }
      
      if (this.isLegacyEncryptedFormat(storedValue)) {
        console.warn('[Storage] 기존 암호화된 API 키가 감지되었습니다.');
        console.warn('[Storage] 암호화 기능이 제거되어 복호화할 수 없습니다.');
        console.warn('[Storage] 설정에서 API 키를 다시 입력해주세요.');
        
        await chrome.storage.local.remove(['apiKey']);
        return null;
      }
      
      if (typeof storedValue === 'string') {
        return storedValue;
      }
      
      console.warn('[Storage] API 키 형식이 올바르지 않습니다.');
      return null;
      
    } catch (error) {
      if (this.errorHandler) {
        this.errorHandler.handle(error, 'StorageManager.getApiKey');
      }
      return null;
    }
  }
  
  /**
   * 레거시 암호화 형식 확인
   * @private
   * @param {*} data - 확인할 데이터
   * @returns {boolean} 암호화된 객체 여부
   */
  isLegacyEncryptedFormat(data) {
    return data && 
           typeof data === 'object' && 
           data.encryptedFlag === true && 
           typeof data.encrypted === 'string' && 
           typeof data.iv === 'string';
  }
  
  /**
   * 단일 키 조회
   * @param {string} key - 조회할 키
   * @param {*} [defaultValue=null] - 기본값
   * @returns {Promise<*>} 저장된 값 또는 기본값
   */
  async get(key, defaultValue = null) {
    try {
      const result = await chrome.storage.local.get([key]);
      return result[key] !== undefined ? result[key] : defaultValue;
    } catch (error) {
      if (this.errorHandler) {
        this.errorHandler.handle(error, 'StorageManager.get');
      }
      return defaultValue;
    }
  }
  
  /**
   * 단일 키 저장
   * @param {string} key - 저장할 키
   * @param {*} value - 저장할 값
   * @returns {Promise<boolean>} 성공 여부
   */
  async set(key, value) {
    try {
      await chrome.storage.local.set({ [key]: value });
      return true;
    } catch (error) {
      if (this.isQuotaError(error)) {
        console.warn('[Storage] Quota exceeded - attempting cleanup');
        await this.cleanup();
        
        try {
          await chrome.storage.local.set({ [key]: value });
          return true;
        } catch (retryError) {
          if (this.errorHandler) {
            this.errorHandler.handle(retryError, 'StorageManager.set');
          }
          throw new Error('저장 공간이 부족합니다. 일부 데이터를 삭제해주세요.');
        }
      }
      
      if (this.errorHandler) {
        this.errorHandler.handle(error, 'StorageManager.set');
      }
      throw error;
    }
  }
  
  /**
   * 여러 키 한번에 조회
   * @param {string[]} keys - 조회할 키 배열
   * @param {Object} [defaults={}] - 키별 기본값
   * @returns {Promise<Object>} 키-값 객체
   */
  async getMultiple(keys, defaults = {}) {
    try {
      const result = await chrome.storage.local.get(keys);
      
      keys.forEach(key => {
        if (result[key] === undefined && defaults[key] !== undefined) {
          result[key] = defaults[key];
        }
      });
      
      return result;
    } catch (error) {
      if (this.errorHandler) {
        this.errorHandler.handle(error, 'StorageManager.getMultiple');
      }
      return defaults;
    }
  }
  
  /**
   * 여러 키 한번에 저장
   * @param {Object} items - 저장할 키-값 객체
   * @returns {Promise<boolean>} 성공 여부
   */
  async setMultiple(items) {
    try {
      await chrome.storage.local.set(items);
      return true;
    } catch (error) {
      if (this.isQuotaError(error)) {
        console.warn('[Storage] Quota exceeded - attempting cleanup');
        await this.cleanup();
        
        try {
          await chrome.storage.local.set(items);
          return true;
        } catch (retryError) {
          if (this.errorHandler) {
            this.errorHandler.handle(retryError, 'StorageManager.setMultiple');
          }
          throw new Error('저장 공간이 부족합니다.');
        }
      }
      
      if (this.errorHandler) {
        this.errorHandler.handle(error, 'StorageManager.setMultiple');
      }
      throw error;
    }
  }
  
  /**
   * 키 삭제
   * @param {string|string[]} keys - 삭제할 키
   * @returns {Promise<boolean>} 성공 여부
   */
  async remove(keys) {
    try {
      const keyArray = Array.isArray(keys) ? keys : [keys];
      await chrome.storage.local.remove(keyArray);
      return true;
    } catch (error) {
      if (this.errorHandler) {
        this.errorHandler.handle(error, 'StorageManager.remove');
      }
      return false;
    }
  }
  
  /**
   * 전체 데이터 삭제
   * @returns {Promise<boolean>} 성공 여부
   */
  async clear() {
    try {
      await chrome.storage.local.clear();
      console.log('[Storage] 전체 삭제 완료');
      return true;
    } catch (error) {
      if (this.errorHandler) {
        this.errorHandler.handle(error, 'StorageManager.clear');
      }
      return false;
    }
  }
  
  /**
   * 설정 가져오기
   * @returns {Promise<Object>} 설정 객체
   */
  async getSettings() {
    return await this.get('settings', {
      language: 'ko',
      theme: 'light',
      defaultLength: 'medium',
      saveHistory: true,
      historyLimit: 50,
      autoSummarize: false,
      contextMenu: true,
      model: 'gpt-4o-mini'
    });
  }

  /**
   * 설정 저장
   * @param {Object} settings - 저장할 설정
   * @returns {Promise<boolean>} 성공 여부
   */
  async saveSettings(settings) {
    return await this.set('settings', settings);
  }

  /**
   * API 설정 가져오기
   * @returns {Promise<Object>} API 설정 객체
   */
  async getApiConfig() {
    return await this.get('apiConfig', {
      useProxy: true,
      proxyUrl: 'http://localhost:3000'
    });
  }

  /**
   * API 설정 저장
   * @param {Object} apiConfig - 저장할 API 설정
   * @returns {Promise<boolean>} 성공 여부
   */
  async saveApiConfig(apiConfig) {
    return await this.set('apiConfig', apiConfig);
  }

  /**
   * 사용량 가져오기
   * @returns {Promise<Object>} 사용량 정보
   */
  async getUsage() {
    try {
      const today = getTodayString();
      const usage = await this.get('usage', null);
      
      if (usage && usage.date === today) {
        return usage;
      } else {
        const newUsage = { date: today, count: 0 };
        await this.saveUsage(newUsage);
        return newUsage;
      }
    } catch (error) {
      if (this.errorHandler) {
        this.errorHandler.handle(error, 'StorageManager.getUsage');
      }
      const today = getTodayString();
      return { date: today, count: 0 };
    }
  }

  /**
   * 사용량 저장
   * @param {Object} usage - 사용량 정보
   * @returns {Promise<boolean>} 성공 여부
   */
  async saveUsage(usage) {
    return await this.set('usage', usage);
  }

  /**
   * 사용량 증가
   * @returns {Promise<Object>} 업데이트된 사용량 정보
   */
  async incrementUsage() {
    try {
      const usage = await this.getUsage();
      usage.count++;
      await this.saveUsage(usage);
      
      console.log('[Storage] 사용량 증가:', usage.count);
      return usage;
    } catch (error) {
      if (this.errorHandler) {
        this.errorHandler.handle(error, 'StorageManager.incrementUsage');
      }
      return await this.getUsage();
    }
  }

  /**
   * 프리미엄 상태 저장
   * @param {Object} premiumStatus - 프리미엄 상태 정보
   * @returns {Promise<boolean>} 성공 여부
   */
  async savePremiumStatus(premiumStatus) {
    return await this.set('premiumStatus', premiumStatus);
  }

  /**
   * 프리미엄 상태 가져오기
   * @returns {Promise<Object>} 프리미엄 상태 정보
   */
  async getPremiumStatus() {
    try {
      const premiumStatus = await this.get('premiumStatus', null);
      
      if (premiumStatus && premiumStatus.checkedAt) {
        const oneHourAgo = Date.now() - 3600000;
        if (premiumStatus.checkedAt < oneHourAgo) {
          return this.getDefaultPremiumStatus();
        }
      }
      
      return premiumStatus || this.getDefaultPremiumStatus();
    } catch (error) {
      if (this.errorHandler) {
        this.errorHandler.handle(error, 'StorageManager.getPremiumStatus');
      }
      return this.getDefaultPremiumStatus();
    }
  }

  /**
   * 기본 프리미엄 상태 반환
   * @private
   * @returns {Object} 기본 프리미엄 상태
   */
  getDefaultPremiumStatus() {
    return {
      isPremium: false,
      plan: 'free',
      limits: {
        dailySummaries: 5,
        monthlyQuestions: 50,
        pdfSupport: false
      }
    };
  }

  /**
   * Quota 에러 확인
   * @private
   * @param {Error} error - 에러 객체
   * @returns {boolean} Quota 에러 여부
   */
  isQuotaError(error) {
    return error.name === 'QuotaExceededError' || 
           error.message?.includes('quota') || 
           error.message?.includes('QUOTA_BYTES');
  }
  
  /**
   * 저장 공간 정리
   * @private
   * @returns {Promise<void>}
   */
  async cleanup() {
    try {
      console.log('[Storage] 자동 정리 시작...');
      
      const errorLogs = await this.get('errorLogs', []);
      if (errorLogs.length > 50) {
        const recentLogs = errorLogs.slice(-50);
        await this.set('errorLogs', recentLogs);
        console.log('[Storage] 에러 로그 정리 완료');
      }
      
      const allData = await chrome.storage.local.get(null);
      const keysToRemove = [];
      
      Object.keys(allData).forEach(key => {
        if (key.startsWith('offlineCache_')) {
          keysToRemove.push(key);
        }
      });
      
      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
        console.log(`[Storage] ${keysToRemove.length}개 오프라인 캐시 정리 완료`);
      }
      
    } catch (error) {
      if (this.errorHandler) {
        this.errorHandler.handle(error, 'StorageManager.cleanup');
      }
    }
  }
}

// ===== Universal Export (브라우저 & Service Worker 지원) =====

// 싱글톤 인스턴스 생성
const storageManager = new StorageManager();

// 브라우저 환경 (window 객체)
if (typeof window !== 'undefined') {
  window.StorageManager = StorageManager;
  window.storageManager = storageManager;
}

// Service Worker 환경 (self 객체)
if (typeof self !== 'undefined' && typeof self.importScripts === 'function') {
  self.StorageManager = StorageManager;
  self.storageManager = storageManager;
}

// Global 환경
if (typeof globalThis !== 'undefined') {
  globalThis.StorageManager = StorageManager;
  globalThis.storageManager = storageManager;
}

console.log('[StorageManager] Module loaded and exposed globally');