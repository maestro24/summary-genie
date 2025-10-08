/**
 * 백엔드 API 통신을 처리하는 클라이언트 클래스
 * JWT 토큰 자동 관리, 재시도 로직, 에러 처리 등을 포함
 * 
 * @requires TokenManager - 토큰 관리 모듈
 * @requires CONFIG - 환경 설정
 * @version 2.0.1
 */
class ApiClient {
  /**
   * ApiClient 생성자
   * @param {string} baseURL - API 서버의 기본 URL (예: 'https://api.summarygenie.com')
   * @param {TokenManager} tokenManager - 토큰 관리자 인스턴스
   */
  constructor(baseURL, tokenManager) {
    this.baseURL = baseURL;
    
    // CONFIG가 있으면 설정 값 사용, 없으면 기본값 사용
    if (typeof CONFIG !== 'undefined' && CONFIG) {
      this.timeout = CONFIG.getApiTimeout();
      this.maxRetries = CONFIG.getMaxRetries();
      this.debug = CONFIG.isDebug();
      
      if (this.debug) {
        console.log('[ApiClient] Initialized with CONFIG:', {
          baseURL: this.baseURL,
          timeout: this.timeout,
          maxRetries: this.maxRetries
        });
      }
    } else {
      // CONFIG가 없는 경우 기본값
      this.timeout = 10000; // 10초 타임아웃
      this.maxRetries = 3; // 최대 재시도 횟수
      this.debug = false;
      
      console.warn('[ApiClient] CONFIG not found, using default values');
    }
    
    this.tokenManager = tokenManager;
    this.requestQueue = []; // 토큰 갱신 중 대기할 요청들
    this.isTokenRefreshing = false;
  }

  /**
   * 액세스 토큰을 자동으로 가져오고 필요시 갱신
   * @returns {Promise<string|null>} - 유효한 액세스 토큰 또는 null
   */
  async getValidToken() {
    if (!this.tokenManager) {
      if (this.debug) {
        console.warn('[ApiClient] TokenManager not available');
      }
      return null;
    }

    try {
      const accessToken = await this.tokenManager.getAccessToken();
      
      if (!accessToken) {
        return null;
      }

      // 토큰이 만료 임박이거나 만료된 경우 갱신
      if (this.tokenManager.isTokenExpired(accessToken)) {
        if (this.debug) {
          console.log('[ApiClient] Token expired, refreshing...');
        }
        const newToken = await this.tokenManager.refreshAccessToken();
        return newToken;
      }

      return accessToken;
    } catch (error) {
      console.error('[ApiClient] Get valid token error:', error);
      return null;
    }
  }

  /**
   * HTTP 요청을 보내는 핵심 메서드
   * @param {string} endpoint - API 엔드포인트 (예: '/api/auth/login')
   * @param {Object} options - fetch 옵션 객체
   * @param {number} retryCount - 현재 재시도 횟수 (내부용)
   * @returns {Promise<Object>} - API 응답 데이터
   * @throws {Error} - 네트워크 오류 또는 API 에러
   */
  async request(endpoint, options = {}, retryCount = 0) {
    const url = `${this.baseURL}${endpoint}`;
    
    if (this.debug) {
      console.log(`[ApiClient] Request: ${options.method || 'GET'} ${url}`);
    }
    
    // 기본 헤더 설정
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    // 인증이 필요한 요청인 경우 토큰 추가
    if (!options.skipAuth) {
      const accessToken = await this.getValidToken();
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }
    }

    // 타임아웃 처리를 위한 AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // 401 Unauthorized 에러 처리 (토큰 만료)
      if (response.status === 401) {
        return await this.handle401Error(endpoint, options, retryCount);
      }

      const data = await response.json();

      // API 에러 응답 처리
      if (!response.ok) {
        const errorMessage = data.error?.message || data.message || `HTTP ${response.status} 오류가 발생했습니다.`;
        throw new Error(errorMessage);
      }

      if (this.debug) {
        console.log(`[ApiClient] Response: ${response.status} ${response.statusText}`);
      }

      return data;

    } catch (error) {
      clearTimeout(timeoutId);

      // 타임아웃 에러 처리
      if (error.name === 'AbortError') {
        return await this.handleTimeout(endpoint, options, retryCount);
      }

      // 네트워크 에러 처리 (재시도 로직)
      if (this.isNetworkError(error)) {
        return await this.handleNetworkError(endpoint, options, retryCount, error);
      }

      throw error;
    }
  }

  /**
   * 401 Unauthorized 에러 처리
   * @param {string} endpoint - API 엔드포인트
   * @param {Object} options - 요청 옵션
   * @param {number} retryCount - 재시도 횟수
   * @returns {Promise<Object>} - API 응답
   */
  async handle401Error(endpoint, options, retryCount) {
    console.log('[ApiClient] 401 Unauthorized - Token refresh needed');

    // 이미 토큰 갱신 재시도를 한 경우 더 이상 재시도하지 않음
    if (options._tokenRefreshAttempted) {
      // 로그인 페이지로 리다이렉트
      this.redirectToLogin();
      throw new Error('인증이 만료되었습니다. 다시 로그인해주세요.');
    }

    // 토큰 갱신 중이면 큐에 추가
    if (this.isTokenRefreshing) {
      return new Promise((resolve, reject) => {
        this.requestQueue.push(() => {
          this.request(endpoint, { ...options, _tokenRefreshAttempted: true }, 0)
            .then(resolve)
            .catch(reject);
        });
      });
    }

    // 토큰 갱신 시작
    this.isTokenRefreshing = true;

    try {
      if (!this.tokenManager) {
        throw new Error('TokenManager not available');
      }

      const newToken = await this.tokenManager.refreshAccessToken();
      
      if (!newToken) {
        throw new Error('Token refresh failed');
      }

      console.log('[ApiClient] Token refreshed, retrying request');

      // 큐에 있는 요청들 실행
      this.processQueue();

      // 원래 요청 재시도 (갱신 플래그 추가)
      return await this.request(endpoint, { ...options, _tokenRefreshAttempted: true }, 0);

    } catch (error) {
      console.error('[ApiClient] Token refresh failed:', error);
      
      // 큐 초기화
      this.clearQueue();
      
      // 로그인 페이지로 리다이렉트
      this.redirectToLogin();
      
      throw new Error('인증이 만료되었습니다. 다시 로그인해주세요.');
    } finally {
      this.isTokenRefreshing = false;
    }
  }

  /**
   * 타임아웃 에러 처리
   * @param {string} endpoint - API 엔드포인트
   * @param {Object} options - 요청 옵션
   * @param {number} retryCount - 재시도 횟수
   * @returns {Promise<Object>} - API 응답
   */
  async handleTimeout(endpoint, options, retryCount) {
    if (retryCount < this.maxRetries) {
      console.log(`[ApiClient] Timeout, retrying... (${retryCount + 1}/${this.maxRetries})`);
      await this.delay(1000 * (retryCount + 1)); // 지수 백오프
      return this.request(endpoint, options, retryCount + 1);
    }
    throw new Error('요청 시간이 초과되었습니다. 네트워크 연결을 확인해주세요.');
  }

  /**
   * 네트워크 에러 처리
   * @param {string} endpoint - API 엔드포인트
   * @param {Object} options - 요청 옵션
   * @param {number} retryCount - 재시도 횟수
   * @param {Error} error - 에러 객체
   * @returns {Promise<Object>} - API 응답
   */
  async handleNetworkError(endpoint, options, retryCount, error) {
    if (retryCount < this.maxRetries) {
      console.log(`[ApiClient] Network error, retrying... (${retryCount + 1}/${this.maxRetries})`);
      await this.delay(1000 * (retryCount + 1)); // 지수 백오프
      return this.request(endpoint, options, retryCount + 1);
    }
    throw new Error('네트워크 연결에 실패했습니다. 인터넷 연결을 확인해주세요.');
  }

  /**
   * 네트워크 에러 여부 확인
   * @param {Error} error - 에러 객체
   * @returns {boolean} - 네트워크 에러면 true
   */
  isNetworkError(error) {
    return error.message.includes('Failed to fetch') || 
           error.message.includes('NetworkError') ||
           error.message.includes('Network request failed');
  }

  /**
   * 요청 큐 처리
   */
  processQueue() {
    this.requestQueue.forEach(request => request());
    this.requestQueue = [];
  }

  /**
   * 요청 큐 초기화
   */
  clearQueue() {
    this.requestQueue = [];
  }

  /**
   * 로그인 페이지로 리다이렉트
   */
  redirectToLogin() {
    console.log('[ApiClient] Redirecting to login page');
    
    // 크롬 확장 프로그램 환경에서 로그인 페이지 열기
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({
        action: 'openLoginPage'
      });
    } else {
      // 일반 웹 환경
      window.location.href = 'auth.html';
    }
  }

  /**
   * 지연 함수 (재시도 로직에 사용)
   * @param {number} ms - 지연 시간 (밀리초)
   * @returns {Promise<void>}
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * GET 요청
   * @param {string} endpoint - API 엔드포인트
   * @param {Object} options - 추가 fetch 옵션
   * @returns {Promise<Object>} - API 응답 데이터
   */
  async get(endpoint, options = {}) {
    return this.request(endpoint, {
      method: 'GET',
      ...options
    });
  }

  /**
   * POST 요청
   * @param {string} endpoint - API 엔드포인트
   * @param {Object} body - 요청 본문 데이터
   * @param {Object} options - 추가 fetch 옵션
   * @returns {Promise<Object>} - API 응답 데이터
   */
  async post(endpoint, body = {}, options = {}) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
      ...options
    });
  }

  /**
   * PUT 요청
   * @param {string} endpoint - API 엔드포인트
   * @param {Object} body - 요청 본문 데이터
   * @param {Object} options - 추가 fetch 옵션
   * @returns {Promise<Object>} - API 응답 데이터
   */
  async put(endpoint, body = {}, options = {}) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body),
      ...options
    });
  }

  /**
   * DELETE 요청
   * @param {string} endpoint - API 엔드포인트
   * @param {Object} options - 추가 fetch 옵션
   * @returns {Promise<Object>} - API 응답 데이터
   */
  async delete(endpoint, options = {}) {
    return this.request(endpoint, {
      method: 'DELETE',
      ...options
    });
  }

  /**
   * 인증 없이 요청 (로그인, 회원가입 등)
   * @param {string} endpoint - API 엔드포인트
   * @param {Object} options - fetch 옵션
   * @returns {Promise<Object>} - API 응답 데이터
   */
  async requestWithoutAuth(endpoint, options = {}) {
    return this.request(endpoint, {
      ...options,
      skipAuth: true
    });
  }
}