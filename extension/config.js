/**
 * SummaryGenie 중앙 설정 파일
 * 환경별 API URL 및 앱 설정 관리
 * 
 * @version 1.0.0
 */

const CONFIG = {
  /**
   * 현재 실행 환경 자동 감지
   * - 크롬 스토어에서 설치된 경우: production
   * - 로컬에서 로드된 경우: development
   */
  ENV: (() => {
    // 크롬 확장 환경 체크
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      const manifest = chrome.runtime.getManifest();
      
      // update_url이 있으면 크롬 웹스토어에서 설치된 것 (프로덕션)
      if (manifest.update_url) {
        return 'production';
      }
      
      // ID가 특정 패턴이면 프로덕션 (선택사항)
      // if (chrome.runtime.id === 'your-published-extension-id') {
      //   return 'production';
      // }
      
      return 'development';
    }
    
    // 일반 웹 환경
    if (typeof window !== 'undefined' && window.location) {
      const hostname = window.location.hostname;
      
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'development';
      }
      
      if (hostname.includes('summarygenie.com')) {
        return 'production';
      }
    }
    
    return 'development';
  })(),
  
  /**
   * 환경별 API Base URL
   */
  API_BASE_URL: {
    development: 'http://localhost:3000',
    production: 'https://api.summarygenie.com'
  },
  
  /**
   * 환경별 프론트엔드 URL (이메일 링크 등에 사용)
   */
  FRONTEND_URL: {
    development: 'http://localhost:3000',
    production: 'https://summarygenie.com'
  },
  
  /**
   * API 타임아웃 설정 (밀리초)
   */
  API_TIMEOUT: {
    development: 30000, // 30초 (개발 환경에서는 길게)
    production: 10000   // 10초
  },
  
  /**
   * 재시도 설정
   */
  MAX_RETRIES: {
    development: 5,
    production: 3
  },
  
  /**
   * 디버그 모드
   */
  DEBUG: {
    development: true,
    production: false
  },
  
  /**
   * 현재 환경의 API URL 반환
   * @returns {string} API Base URL
   */
  getApiUrl() {
    const url = this.API_BASE_URL[this.ENV];
    if (this.DEBUG[this.ENV]) {
      console.log(`[Config] API URL (${this.ENV}):`, url);
    }
    return url || this.API_BASE_URL.development;
  },
  
  /**
   * 현재 환경의 프론트엔드 URL 반환
   * @returns {string} Frontend URL
   */
  getFrontendUrl() {
    return this.FRONTEND_URL[this.ENV] || this.FRONTEND_URL.development;
  },
  
  /**
   * 현재 환경의 API 타임아웃 반환
   * @returns {number} 타임아웃 (밀리초)
   */
  getApiTimeout() {
    return this.API_TIMEOUT[this.ENV] || this.API_TIMEOUT.development;
  },
  
  /**
   * 현재 환경의 최대 재시도 횟수 반환
   * @returns {number} 최대 재시도 횟수
   */
  getMaxRetries() {
    return this.MAX_RETRIES[this.ENV] || this.MAX_RETRIES.development;
  },
  
  /**
   * 디버그 모드 여부 반환
   * @returns {boolean} 디버그 모드 활성화 여부
   */
  isDebug() {
    return this.DEBUG[this.ENV] || false;
  },
  
  /**
   * 개발 환경 여부 확인
   * @returns {boolean} 개발 환경이면 true
   */
  isDevelopment() {
    return this.ENV === 'development';
  },
  
  /**
   * 프로덕션 환경 여부 확인
   * @returns {boolean} 프로덕션 환경이면 true
   */
  isProduction() {
    return this.ENV === 'production';
  },
  
  /**
   * 설정 정보 출력 (디버그용)
   */
  printConfig() {
    if (this.isDebug()) {
      console.log('='.repeat(60));
      console.log('📋 SummaryGenie Configuration');
      console.log('='.repeat(60));
      console.log(`🌍 Environment: ${this.ENV}`);
      console.log(`🔗 API URL: ${this.getApiUrl()}`);
      console.log(`🌐 Frontend URL: ${this.getFrontendUrl()}`);
      console.log(`⏱️  API Timeout: ${this.getApiTimeout()}ms`);
      console.log(`🔄 Max Retries: ${this.getMaxRetries()}`);
      console.log(`🐛 Debug Mode: ${this.isDebug()}`);
      console.log('='.repeat(60));
    }
  }
};

// 초기화 시 설정 정보 출력
CONFIG.printConfig();

// CommonJS & ES Module 호환
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}

// 브라우저 환경 (전역 변수)
if (typeof window !== 'undefined') {
  window.CONFIG = CONFIG;
}