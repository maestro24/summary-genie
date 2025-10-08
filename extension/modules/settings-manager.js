/**
 * SummaryGenie Settings Manager (Simplified)
 * 설정 관리를 담당하는 모듈
 * 
 * @module settings-manager
 * @version 5.2.0
 * Universal Module: 브라우저 환경과 Service Worker 모두 지원
 */

/**
 * SettingsManager 클래스
 */
class SettingsManager {
  constructor() {
    // 전역 객체에서 가져오기
    this.storageManager = typeof window !== 'undefined' ? window.storageManager : 
                          (typeof self !== 'undefined' ? self.storageManager : 
                          (typeof globalThis !== 'undefined' ? globalThis.storageManager : null));
    
    this.errorHandler = typeof window !== 'undefined' ? window.errorHandler : 
                        (typeof self !== 'undefined' ? self.errorHandler : 
                        (typeof globalThis !== 'undefined' ? globalThis.errorHandler : null));
    
    this.DEFAULT_SETTINGS = {
      language: 'ko',
      theme: 'light',
      apiKey: '',
      summaryLength: 'medium',
      model: 'gpt-4o-mini',
      useProxy: true,
      proxyUrl: 'http://localhost:3000/api/chat'
    };
    
    this.VALIDATION_RULES = {
      language: ['ko', 'en', 'ja', 'zh'],
      theme: ['light', 'dark', 'auto'],
      summaryLength: ['short', 'medium', 'detailed'],
      model: ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo']
    };
    
    this.settings = { ...this.DEFAULT_SETTINGS };
    this.initialized = false;
    this.changeListeners = [];
    this.storageListener = null;
  }

  /**
   * 설정 초기화
   */
  async initialize() {
    if (this.initialized) {
      return this.getSettings();
    }
    
    try {
      await this.loadSettings();
      this.applySettings();
      this.setupStorageListener();
      this.initialized = true;
      
      console.log('[SettingsManager] 초기화 완료');
      return this.getSettings();
      
    } catch (error) {
      if (this.errorHandler) {
        this.errorHandler.handle(error, 'SettingsManager.initialize');
      }
      this.settings = { ...this.DEFAULT_SETTINGS };
      this.initialized = true;
      return this.getSettings();
    }
  }

  /**
   * Storage 변경 감지 리스너 설정
   */
  setupStorageListener() {
    this.storageListener = (changes, areaName) => {
      if (areaName === 'local' && changes.settings) {
        console.log('[SettingsManager] Storage 변경 감지');
        
        const previousSettings = this.getSettings();
        const newSettings = changes.settings.newValue || {};
        this.settings = { ...this.DEFAULT_SETTINGS, ...newSettings };
        
        this.applySettings();
        this.notifyListeners(this.getSettings(), previousSettings);
      }
    };
    
    chrome.storage.onChanged.addListener(this.storageListener);
  }

  /**
   * 설정 로드 (마이그레이션 포함)
   */
  async loadSettings() {
    try {
      if (!this.storageManager) {
        throw new Error('StorageManager not available');
      }
      
      const data = await this.storageManager.get('settings', this.DEFAULT_SETTINGS);
      
      // 기존 설정 마이그레이션
      const migratedSettings = this.migrateSettings(data);
      
      this.settings = { ...this.DEFAULT_SETTINGS, ...migratedSettings };
      
      if (this.settings.apiKey) {
        await this.decryptApiKey();
      }
      
      return this.getSettings();
      
    } catch (error) {
      if (this.errorHandler) {
        this.errorHandler.handle(error, 'SettingsManager.loadSettings');
      }
      throw error;
    }
  }

  /**
   * 기존 설정 마이그레이션
   */
  migrateSettings(oldSettings) {
    const migrated = { ...oldSettings };
    
    // defaultLength → summaryLength
    if (migrated.defaultLength && !migrated.summaryLength) {
      migrated.summaryLength = migrated.defaultLength;
      delete migrated.defaultLength;
      console.log('[SettingsManager] defaultLength → summaryLength 마이그레이션');
    }
    
    // 구식 proxyUrl 마이그레이션
    if (migrated.proxyUrl === 'http://localhost:3000') {
      migrated.proxyUrl = 'http://localhost:3000/api/chat';
      console.log('[SettingsManager] proxyUrl 업데이트: /api/chat 엔드포인트');
    }
    
    // 제거된 설정 정리
    delete migrated.autoSummarize;
    delete migrated.saveHistory;
    delete migrated.historyLimit;
    delete migrated.contextMenu;
    
    // apiConfig가 별도로 있었다면 통합
    if (!migrated.useProxy && oldSettings.useProxy !== undefined) {
      migrated.useProxy = oldSettings.useProxy;
    }
    if (!migrated.proxyUrl && oldSettings.proxyUrl) {
      migrated.proxyUrl = oldSettings.proxyUrl;
    }
    
    return migrated;
  }

  /**
   * API 키 복호화 (암호화 기능 제거됨)
   */
  async decryptApiKey() {
    const apiKey = this.settings.apiKey;
    
    if (!apiKey) return;
    
    try {
      // 레거시 암호화 형식 확인
      if (this.storageManager && this.storageManager.isLegacyEncryptedFormat(apiKey)) {
        console.warn('[SettingsManager] 기존 암호화된 API 키 감지 - 재설정 필요');
        this.settings.apiKey = '';
        await this.saveSettings({ apiKey: '' });
      }
      
    } catch (error) {
      if (this.errorHandler) {
        this.errorHandler.handle(error, 'SettingsManager.decryptApiKey');
      }
      this.settings.apiKey = '';
    }
  }

  /**
   * 설정 저장
   */
  async saveSettings(newSettings = null) {
    try {
      if (!this.storageManager) {
        throw new Error('StorageManager not available');
      }
      
      const previousSettings = this.getSettings();
      
      if (newSettings) {
        this.settings = { ...this.settings, ...newSettings };
      }
      
      this.validateSettings(this.settings);
      
      const settingsToSave = { ...this.settings };
      
      await this.storageManager.set('settings', settingsToSave);
      
      this.applySettings();
      this.notifyListeners(this.getSettings(), previousSettings);
      
      console.log('[SettingsManager] 설정 저장 완료');
      return true;
      
    } catch (error) {
      if (this.errorHandler) {
        this.errorHandler.handle(error, 'SettingsManager.saveSettings');
      }
      throw error;
    }
  }

  /**
   * 설정 변경 리스너 등록
   */
  onSettingsChange(callback) {
    if (typeof callback !== 'function') {
      throw new TypeError('Callback must be a function');
    }
    
    this.changeListeners.push(callback);
    
    return () => {
      const index = this.changeListeners.indexOf(callback);
      if (index > -1) {
        this.changeListeners.splice(index, 1);
      }
    };
  }

  /**
   * 리스너에게 변경 알림
   */
  notifyListeners(newSettings, oldSettings) {
    this.changeListeners.forEach((callback) => {
      try {
        callback(newSettings, oldSettings);
      } catch (error) {
        if (this.errorHandler) {
          this.errorHandler.handle(error, 'SettingsManager.notifyListeners');
        }
      }
    });
  }

  /**
   * 설정 유효성 검사
   */
  validateSettings(settings) {
    const rules = this.VALIDATION_RULES;
    
    if (settings.language && !rules.language.includes(settings.language)) {
      throw new Error(`Invalid language: ${settings.language}`);
    }
    
    if (settings.theme && !rules.theme.includes(settings.theme)) {
      throw new Error(`Invalid theme: ${settings.theme}`);
    }
    
    if (settings.summaryLength && !rules.summaryLength.includes(settings.summaryLength)) {
      throw new Error(`Invalid summaryLength: ${settings.summaryLength}`);
    }
    
    if (settings.model && !rules.model.includes(settings.model)) {
      throw new Error(`Invalid model: ${settings.model}`);
    }
    
    if (settings.useProxy !== undefined && typeof settings.useProxy !== 'boolean') {
      throw new Error('useProxy must be a boolean');
    }
  }

  /**
   * 설정 초기화
   */
  async resetSettings() {
    try {
      const previousSettings = this.getSettings();
      
      this.settings = { ...this.DEFAULT_SETTINGS };
      
      if (this.storageManager) {
        await this.storageManager.set('settings', this.settings);
      }
      
      this.applySettings();
      this.notifyListeners(this.getSettings(), previousSettings);
      
      console.log('[SettingsManager] 설정 초기화 완료');
      return this.getSettings();
      
    } catch (error) {
      if (this.errorHandler) {
        this.errorHandler.handle(error, 'SettingsManager.resetSettings');
      }
      throw error;
    }
  }

  /**
   * 설정 적용
   */
  applySettings() {
    try {
      this.applyTheme(this.settings.theme);
    } catch (error) {
      if (this.errorHandler) {
        this.errorHandler.handle(error, 'SettingsManager.applySettings');
      }
    }
  }

  /**
   * 테마 적용
   */
  applyTheme(theme) {
    try {
      if (typeof document === 'undefined') return;
      
      document.body.classList.remove('dark-theme');
      
      if (theme === 'dark') {
        document.body.classList.add('dark-theme');
      } else if (theme === 'auto') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark) {
          document.body.classList.add('dark-theme');
        }
      }
    } catch (error) {
      if (this.errorHandler) {
        this.errorHandler.handle(error, 'SettingsManager.applyTheme');
      }
    }
  }

  /**
   * 현재 설정 반환
   */
  getSettings() {
    return { ...this.settings };
  }

  /**
   * 특정 설정 값 반환
   */
  getSetting(key, defaultValue = undefined) {
    return this.settings[key] !== undefined ? this.settings[key] : defaultValue;
  }

  /**
   * 특정 설정 값 설정
   */
  async setSetting(key, value) {
    return await this.saveSettings({ [key]: value });
  }

  /**
   * 여러 설정 값 설정
   */
  async setSettings(settings) {
    return await this.saveSettings(settings);
  }

  /**
   * 요약 길이 옵션 반환
   */
  getSummaryLength() {
    try {
      if (typeof document === 'undefined') {
        return this.settings.summaryLength;
      }
      
      const selectedRadio = document.querySelector('input[name="length"]:checked');
      return selectedRadio?.value || this.settings.summaryLength;
    } catch (error) {
      return this.settings.summaryLength;
    }
  }

  /**
   * API 사용 가능 여부
   */
  isApiReady() {
    if (this.settings.useProxy) {
      return !!this.settings.proxyUrl;
    }
    return !!this.settings.apiKey && this.settings.apiKey.length > 0;
  }

  /**
   * 프리미엄 사용자 여부
   */
  isPremium() {
    return !this.settings.useProxy && !!this.settings.apiKey;
  }

  /**
   * 히스토리 저장 여부 (항상 true)
   */
  shouldSaveHistory() {
    return true;
  }

  /**
   * 히스토리 제한 (100으로 고정)
   */
  getHistoryLimit() {
    return 100;
  }

  /**
   * 컨텍스트 메뉴 활성화 여부 (항상 true)
   */
  isContextMenuEnabled() {
    return true;
  }

  /**
   * 정리
   */
  destroy() {
    if (this.storageListener) {
      chrome.storage.onChanged.removeListener(this.storageListener);
      this.storageListener = null;
    }
    
    this.changeListeners = [];
    this.initialized = false;
    console.log('[SettingsManager] 정리 완료');
  }
}

// ===== Universal Export (브라우저 & Service Worker 지원) =====

// 싱글톤 인스턴스 생성
const settingsManager = new SettingsManager();

// 브라우저 환경 (window 객체)
if (typeof window !== 'undefined') {
  window.SettingsManager = SettingsManager;
  window.settingsManager = settingsManager;
}

// Service Worker 환경 (self 객체)
if (typeof self !== 'undefined' && typeof self.importScripts === 'function') {
  self.SettingsManager = SettingsManager;
  self.settingsManager = settingsManager;
}

// Global 환경
if (typeof globalThis !== 'undefined') {
  globalThis.SettingsManager = SettingsManager;
  globalThis.settingsManager = settingsManager;
}

console.log('[SettingsManager] Module loaded and exposed globally');