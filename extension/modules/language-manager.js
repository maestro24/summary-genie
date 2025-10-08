/**
 * SummaryGenie Language Manager (동적 메시지 로딩 버전)
 * Chrome Extension 런타임 중 언어 변경 완벽 지원
 * 
 * @module language-manager
 * @version 6.0.0
 * @requires security.js (전역 - window.validateInput)
 * @requires error-handler.js (전역 - window.errorHandler)
 */

/**
 * LanguageManager 클래스
 * 하이브리드 방식: 캐시된 메시지 + Chrome i18n API fallback
 */
class LanguageManager {
  constructor() {
    this.currentLanguage = 'ko';
    this.supportedLanguages = {
      'ko': '한국어',
      'en': 'English',
      'ja': '日本語',
      'zh': '中文'
    };
    
    /**
     * 런타임에 로드된 언어 메시지 캐시
     * 키: 언어 코드 (예: 'ko', 'en')
     * 값: messages.json 파일의 내용
     */
    this.languageMessages = {};
    
    /**
     * 객체 플레이스홀더를 배열로 변환하기 위한 매핑
     * 키: 메시지 키
     * 값: 객체의 속성 이름 순서 (배열로 변환할 순서)
     * 
     * Chrome i18n API는 $1, $2, $3... 형식의 숫자 플레이스홀더만 지원하므로,
     * {COUNT: 3, LIMIT: 5} 형태의 객체를 [3, 5] 배열로 변환해야 합니다.
     */
    this.placeholderMapping = {
      'usageToday': ['COUNT', 'LIMIT'],
      'cloudSyncSuccess': ['TOTAL', 'UPLOADED', 'DOWNLOADED'],
      'pendingSyncItems': ['COUNT'],
      'syncCompleted': ['COUNT'],
      'historyExported': ['COUNT'],
      'historyImported': ['COUNT'],
      'minutesAgo': ['COUNT'],
      'hoursAgo': ['COUNT'],
      'daysAgo': ['COUNT']
    };
    
    this.initialized = false;
  }

  /**
   * 언어 매니저 초기화
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      // 설정에서 사용자가 선택한 언어 가져오기
      const settings = await chrome.storage.local.get(['settings']);
      
      if (settings.settings && settings.settings.language) {
        const validation = window.validateInput(settings.settings.language, {
          type: 'string',
          allowedValues: Object.keys(this.supportedLanguages)
        });
        
        if (validation.valid) {
          this.currentLanguage = validation.sanitized;
        }
      } else {
        // Chrome Extension의 현재 로케일 가져오기 (브라우저 언어 기반)
        const uiLanguage = chrome.i18n.getUILanguage();
        const browserLang = uiLanguage.substring(0, 2);
        
        if (this.supportedLanguages[browserLang]) {
          this.currentLanguage = browserLang;
        }
      }

      // 🆕 현재 언어의 메시지 파일 로드
      await this.loadLanguageMessages(this.currentLanguage);

      // DOM이 로드되면 UI 업데이트
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          this.updateUI();
        });
      } else {
        this.updateUI();
      }

      this.initialized = true;
      console.log('[LanguageManager] 초기화 완료:', this.currentLanguage, '(Browser locale:', chrome.i18n.getUILanguage(), ')');
      
    } catch (error) {
      window.errorHandler.handle(error, 'LanguageManager.initialize');
    }
  }

  /**
   * 특정 언어의 messages.json 파일을 동적으로 로드
   * @param {string} languageCode - 언어 코드 (예: 'ko', 'en', 'ja', 'zh')
   * @returns {Promise<void>}
   */
  async loadLanguageMessages(languageCode) {
    try {
      // 이미 로드된 언어면 스킵
      if (this.languageMessages[languageCode]) {
        console.log('[LanguageManager] 이미 로드된 언어:', languageCode);
        return;
      }

      console.log('[LanguageManager] 메시지 파일 로드 시작:', languageCode);

      // Chrome Extension의 _locales 폴더에서 messages.json 가져오기
      const url = chrome.runtime.getURL(`_locales/${languageCode}/messages.json`);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`메시지 파일 로드 실패: ${response.status} ${response.statusText}`);
      }

      const messages = await response.json();
      
      // 메시지를 캐시에 저장
      this.languageMessages[languageCode] = messages;
      
      console.log('[LanguageManager] 메시지 파일 로드 완료:', languageCode, '(메시지 수:', Object.keys(messages).length, ')');
      
    } catch (error) {
      console.error('[LanguageManager] 메시지 파일 로드 오류:', languageCode, error);
      
      // Fallback: Chrome i18n API 사용 (초기 로케일만 가능)
      console.warn('[LanguageManager] Fallback to Chrome i18n API');
      
      // 에러를 던지지 않고 계속 진행 (Chrome i18n API가 fallback으로 동작)
      window.errorHandler.handle(error, 'LanguageManager.loadLanguageMessages');
    }
  }

  /**
   * 메시지 가져오기 (하이브리드 방식)
   * 1순위: 캐시된 메시지 (런타임 로드)
   * 2순위: Chrome i18n API (fallback)
   * 
   * @param {string} key - 메시지 키
   * @param {Array|Object|string|number} substitutions - 치환할 값
   * @returns {string} 번역된 메시지
   * 
   * @example
   * // 단일 값
   * getMessage('minutesAgo', 5) // "5분 전"
   * 
   * // 배열
   * getMessage('usageToday', [3, 5]) // "오늘 3 / 5회"
   * 
   * // 객체 (자동으로 배열로 변환)
   * getMessage('usageToday', {COUNT: 3, LIMIT: 5}) // "오늘 3 / 5회"
   */
  getMessage(key, substitutions) {
    try {
      if (typeof key !== 'string') {
        console.warn('[LanguageManager] 유효하지 않은 메시지 키:', key);
        return String(key);
      }
      
      let message = '';
      
      // 🆕 1단계: 캐시된 메시지에서 찾기 (우선순위)
      const cachedMessages = this.languageMessages[this.currentLanguage];
      if (cachedMessages && cachedMessages[key]) {
        message = this.processMessage(cachedMessages[key], substitutions);
        
        if (message) {
          return message;
        }
      }
      
      // 🆕 2단계: Chrome i18n API (fallback)
      if (substitutions !== undefined) {
        // 1. 배열: ['value1', 'value2'] → Chrome i18n이 자동으로 $1, $2로 치환
        if (Array.isArray(substitutions)) {
          message = chrome.i18n.getMessage(key, substitutions.map(String));
        }
        // 2. 객체: {COUNT: 3, LIMIT: 5} → 배열로 변환 후 전달
        else if (typeof substitutions === 'object' && substitutions !== null) {
          // placeholderMapping에 정의된 순서대로 배열 생성
          if (this.placeholderMapping[key]) {
            const orderedValues = this.placeholderMapping[key].map(prop => 
              String(substitutions[prop] !== undefined ? substitutions[prop] : '')
            );
            message = chrome.i18n.getMessage(key, orderedValues);
          } else {
            // 매핑이 없는 경우, 객체의 값들을 순서대로 배열로 변환
            console.warn('[LanguageManager] placeholderMapping에 없는 키:', key, '- 객체 순서대로 변환');
            const values = Object.values(substitutions).map(String);
            message = chrome.i18n.getMessage(key, values);
          }
        }
        // 3. 단일 값: 'value' → Chrome i18n이 자동으로 $1로 치환
        else {
          message = chrome.i18n.getMessage(key, String(substitutions));
        }
      } else {
        // substitutions 없음
        message = chrome.i18n.getMessage(key);
      }
      
      // 메시지가 없으면 키를 그대로 반환
      if (!message || message === '') {
        console.warn('[LanguageManager] 메시지를 찾을 수 없음:', key);
        return key;
      }
      
      return message;
      
    } catch (error) {
      window.errorHandler.handle(error, 'LanguageManager.getMessage');
      return key;
    }
  }

  /**
   * 캐시된 메시지 객체를 처리하여 최종 문자열 반환
   * @param {Object} messageObj - messages.json의 메시지 객체
   * @param {Array|Object|string|number} substitutions - 치환할 값
   * @returns {string} 처리된 메시지
   */
  processMessage(messageObj, substitutions) {
    try {
      if (!messageObj || !messageObj.message) {
        return '';
      }

      let message = messageObj.message;

      // substitutions가 없으면 바로 반환
      if (substitutions === undefined || substitutions === null) {
        return message;
      }

      // 배열인 경우: $1, $2, ... 순서대로 치환
      if (Array.isArray(substitutions)) {
        substitutions.forEach((value, index) => {
          const placeholder = `$${index + 1}`;
          message = message.replace(new RegExp(`\\${placeholder}`, 'g'), String(value));
        });
        return message;
      }

      // 객체인 경우: placeholders 정의 확인
      if (typeof substitutions === 'object') {
        if (messageObj.placeholders) {
          // messages.json의 placeholders 정의를 사용
          Object.entries(messageObj.placeholders).forEach(([name, config]) => {
            const value = substitutions[name.toUpperCase()] || substitutions[name];
            if (value !== undefined && config.content) {
              message = message.replace(new RegExp(`\\${config.content}`, 'g'), String(value));
            }
          });
        } else {
          // placeholders 정의가 없으면 순서대로 치환
          const values = Object.values(substitutions);
          values.forEach((value, index) => {
            const placeholder = `$${index + 1}`;
            message = message.replace(new RegExp(`\\${placeholder}`, 'g'), String(value));
          });
        }
        return message;
      }

      // 단일 값인 경우: $1로 치환
      if (typeof substitutions === 'string' || typeof substitutions === 'number') {
        message = message.replace(/\$1/g, String(substitutions));
        return message;
      }

      return message;

    } catch (error) {
      console.error('[LanguageManager] processMessage 오류:', error);
      return messageObj?.message || '';
    }
  }

  /**
   * 언어 변경
   * @param {string} newLanguage - 새 언어 코드
   * @returns {Promise<boolean>} 성공 여부
   */
  async changeLanguage(newLanguage) {
    try {
      const validation = window.validateInput(newLanguage, {
        type: 'string',
        required: true,
        allowedValues: Object.keys(this.supportedLanguages)
      });
      
      if (!validation.valid) {
        console.error('[LanguageManager] 지원되지 않는 언어:', newLanguage);
        return false;
      }

      const oldLanguage = this.currentLanguage;
      this.currentLanguage = validation.sanitized;
      
      // 🆕 새로운 언어의 메시지 파일 로드
      await this.loadLanguageMessages(this.currentLanguage);
      
      // 설정에 저장
      const settings = await chrome.storage.local.get(['settings']);
      const updatedSettings = {
        ...settings.settings,
        language: this.currentLanguage
      };
      
      await chrome.storage.local.set({ settings: updatedSettings });
      
      // UI 업데이트
      this.updateUI();
      
      console.log('[LanguageManager] 언어 변경 완료:', oldLanguage, '→', this.currentLanguage);
      console.log('[LanguageManager] ✅ 모든 메시지가 즉시 반영됩니다!');
      
      return true;
      
    } catch (error) {
      window.errorHandler.handle(error, 'LanguageManager.changeLanguage');
      return false;
    }
  }

  /**
   * 전체 UI 업데이트
   */
  updateUI() {
    try {
      // data-i18n 속성을 가진 모든 요소 업데이트
      const elements = document.querySelectorAll('[data-i18n]');
      elements.forEach(element => {
        const key = element.getAttribute('data-i18n');
        const text = this.getMessage(key);
        
        if (text && text !== key) {
          if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
            // placeholder 업데이트
            element.placeholder = text;
          } else if (element.tagName === 'OPTION') {
            element.textContent = text;
          } else {
            element.textContent = text;
          }
        }
      });

      // data-i18n-title 속성 업데이트 (툴팁)
      const titleElements = document.querySelectorAll('[data-i18n-title]');
      titleElements.forEach(element => {
        const key = element.getAttribute('data-i18n-title');
        const title = this.getMessage(key);
        if (title && title !== key) {
          element.title = title;
        }
      });

      // data-i18n-alt 속성 업데이트 (이미지 alt)
      const altElements = document.querySelectorAll('[data-i18n-alt]');
      altElements.forEach(element => {
        const key = element.getAttribute('data-i18n-alt');
        const alt = this.getMessage(key);
        if (alt && alt !== key) {
          element.alt = alt;
        }
      });

      // 동적 콘텐츠 업데이트
      this.updateDynamicContent();
      
    } catch (error) {
      window.errorHandler.handle(error, 'LanguageManager.updateUI');
    }
  }

  /**
   * 동적 콘텐츠 업데이트
   */
  updateDynamicContent() {
    try {
      // 페이지 타이틀 업데이트
      if (document.getElementById('pageTitle')) {
        const pageTitle = document.getElementById('pageTitle');
        const currentText = pageTitle.textContent;
        
        const analyzingMessages = [
          '현재 페이지를 분석 중...',
          'Analyzing current page...',
          '現在のページを分析中...',
          '正在分析当前页面...'
        ];
        
        if (!currentText || analyzingMessages.includes(currentText)) {
          pageTitle.textContent = this.getMessage('analyzingPage');
        }
      }

      // 사용량 텍스트 업데이트
      if (document.getElementById('usageText')) {
        const usageElement = document.getElementById('usageText');
        const match = usageElement.textContent.match(/(\d+)\s*\/\s*(\d+)/);
        if (match) {
          const message = this.getMessage('usageToday', {
            COUNT: match[1],
            LIMIT: match[2]
          });
          usageElement.textContent = message;
        }
      }

      // 언어별 폰트 적용
      this.applyLanguageFont();
      
    } catch (error) {
      window.errorHandler.handle(error, 'LanguageManager.updateDynamicContent');
    }
  }

  /**
   * 현재 언어 반환
   * @returns {string} 언어 코드
   */
  getCurrentLanguage() {
    return this.currentLanguage;
  }

  /**
   * 브라우저 UI 언어 반환 (Chrome Extension API)
   * @returns {string} 브라우저 로케일 (예: 'ko', 'en', 'ja')
   */
  getBrowserLanguage() {
    const uiLanguage = chrome.i18n.getUILanguage();
    return uiLanguage.substring(0, 2);
  }

  /**
   * 지원 언어 목록 반환
   * @returns {Object} 지원 언어 객체
   */
  getSupportedLanguages() {
    return this.supportedLanguages;
  }

  /**
   * 언어별 폰트 설정
   */
  applyLanguageFont() {
    try {
      document.body.classList.remove('font-ko', 'font-en', 'font-ja', 'font-zh');
      document.body.classList.add(`font-${this.currentLanguage}`);
    } catch (error) {
      window.errorHandler.handle(error, 'LanguageManager.applyLanguageFont');
    }
  }

  /**
   * 특정 로케일의 메시지 가져오기 (디버깅용)
   * @returns {Promise<Array<string>>} Chrome Extension이 지원하는 로케일 목록
   */
  getAcceptLanguages() {
    // Chrome Extension이 지원하는 로케일 목록 가져오기
    return new Promise((resolve) => {
      chrome.i18n.getAcceptLanguages((languages) => {
        resolve(languages);
      });
    });
  }
}

// 전역 인스턴스 생성
window.languageManager = new LanguageManager();

console.log('[LanguageManager] 동적 메시지 로딩 지원 모듈 로드 완료 (런타임 언어 변경 완벽 지원 ✅)');