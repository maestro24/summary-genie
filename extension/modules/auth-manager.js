/**
 * 인증 상태 관리 및 사용자 인증 처리를 담당하는 모듈
 * 로그인, 회원가입, 로그아웃, 토큰 관리 등의 기능 제공
 * 
 * @requires ApiClient - API 통신 클라이언트
 * @requires TokenManager - 토큰 관리 모듈
 * @requires CONFIG - 환경 설정 (선택사항)
 * @version 2.0.2
 * 
 * 📝 주요 수정사항:
 * - signup(): confirmPassword 파라미터 추가 및 검증
 * - signup(): API 요청에 confirmPassword 필드 포함
 */
class AuthManager {
  /**
   * AuthManager 생성자
   * @param {string} apiBaseURL - API 서버 기본 URL (CONFIG.getApiUrl()로 전달 권장)
   * @param {TokenManager} tokenManager - 토큰 관리자 인스턴스
   * 
   * @example
   * // CONFIG 사용 (권장)
   * const authManager = new AuthManager(CONFIG.getApiUrl(), tokenManager);
   * 
   * @example
   * // 직접 URL 지정
   * const authManager = new AuthManager('http://localhost:3000', tokenManager);
   */
  constructor(apiBaseURL, tokenManager) {
    // ApiClient 인스턴스 생성 (TokenManager 주입)
    this.apiClient = new ApiClient(apiBaseURL, tokenManager);
    this.tokenManager = tokenManager;
    this.currentUser = null;
    
    // 디버그 모드
    this.debug = (typeof CONFIG !== 'undefined' && CONFIG) ? CONFIG.isDebug() : false;
    
    if (this.debug) {
      console.log('[AuthManager] Initialized with API URL:', apiBaseURL);
    }
  }

  /**
   * 이메일 형식 검증
   * @param {string} email - 검증할 이메일 주소
   * @returns {boolean} - 유효한 이메일 형식이면 true
   */
  validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * 비밀번호 강도 검증
   * @param {string} password - 검증할 비밀번호
   * @returns {Object} - { valid: boolean, message: string }
   */
  validatePassword(password) {
    if (password.length < 8) {
      return { valid: false, message: '비밀번호는 최소 8자 이상이어야 합니다.' };
    }
    if (!/[A-Z]/.test(password)) {
      return { valid: false, message: '비밀번호에 대문자를 포함해야 합니다.' };
    }
    if (!/[a-z]/.test(password)) {
      return { valid: false, message: '비밀번호에 소문자를 포함해야 합니다.' };
    }
    if (!/[0-9]/.test(password)) {
      return { valid: false, message: '비밀번호에 숫자를 포함해야 합니다.' };
    }
    return { valid: true, message: '비밀번호가 안전합니다.' };
  }

  /**
   * 회원가입
   * 
   * ✅ 수정: confirmPassword 파라미터 추가
   * 
   * @param {string} email - 사용자 이메일
   * @param {string} password - 사용자 비밀번호
   * @param {string} name - 사용자 이름
   * @param {string} confirmPassword - 비밀번호 확인 (백엔드 validator 요구사항)
   * @returns {Promise<Object>} - { success: boolean, user?: Object, message?: string }
   * @throws {Error} - 입력값 검증 실패 또는 API 오류
   */
  async signup(email, password, name, confirmPassword) {
    // 입력값 검증
    if (!this.validateEmail(email)) {
      throw new Error('유효한 이메일 주소를 입력해주세요.');
    }

    const passwordValidation = this.validatePassword(password);
    if (!passwordValidation.valid) {
      throw new Error(passwordValidation.message);
    }

    if (!name || name.trim().length < 2) {
      throw new Error('이름은 최소 2자 이상이어야 합니다.');
    }

    // ✅ 추가: confirmPassword 검증
    if (!confirmPassword) {
      throw new Error('비밀번호 확인을 입력해주세요.');
    }

    if (password !== confirmPassword) {
      throw new Error('비밀번호가 일치하지 않습니다.');
    }

    try {
      if (this.debug) {
        console.log('[AuthManager] Signup attempt:', email);
      }
      
      // ✅ 수정: confirmPassword를 API 요청에 포함
      const response = await this.apiClient.post('/api/auth/signup', {
        email: email.trim().toLowerCase(),
        password,
        name: name.trim(),
        confirmPassword // ✅ 백엔드 validator가 필수로 요구하는 필드
      }, { skipAuth: true }); // 회원가입은 인증 불필요

      if (response.success) {
        // 회원가입 성공 시 토큰 저장 및 자동 로그인
        await this.tokenManager.saveTokens(
          response.tokens.accessToken, 
          response.tokens.refreshToken
        );
        this.currentUser = response.user;
        
        if (this.debug) {
          console.log('[AuthManager] Signup successful:', this.currentUser.email);
        }
        
        return {
          success: true,
          user: response.user,
          message: response.message || '회원가입이 완료되었습니다.'
        };
      } else {
        throw new Error(response.error?.message || '회원가입에 실패했습니다.');
      }
    } catch (error) {
      console.error('[AuthManager] Signup error:', error);
      throw error;
    }
  }

  /**
   * 로그인
   * @param {string} email - 사용자 이메일
   * @param {string} password - 사용자 비밀번호
   * @param {boolean} rememberMe - 로그인 상태 유지 여부
   * @returns {Promise<Object>} - { success: boolean, user?: Object, message?: string }
   * @throws {Error} - 입력값 검증 실패 또는 API 오류
   */
  async login(email, password, rememberMe = false) {
    // 입력값 검증
    if (!this.validateEmail(email)) {
      throw new Error('유효한 이메일 주소를 입력해주세요.');
    }

    if (!password || password.length < 8) {
      throw new Error('비밀번호를 입력해주세요.');
    }

    try {
      if (this.debug) {
        console.log('[AuthManager] Login attempt:', email);
      }
      
      // 백엔드 API 호출
      const response = await this.apiClient.post('/api/auth/login', {
        email: email.trim().toLowerCase(),
        password
      }, { skipAuth: true }); // 로그인은 인증 불필요

      if (response.success) {
        // 로그인 성공 시 토큰 저장
        await this.tokenManager.saveTokens(
          response.tokens.accessToken, 
          response.tokens.refreshToken
        );
        this.currentUser = response.user;

        // '로그인 상태 유지' 옵션 저장
        await this.saveRememberMe(rememberMe);

        if (this.debug) {
          console.log('[AuthManager] Login successful:', this.currentUser.email);
        }

        return {
          success: true,
          user: response.user,
          message: response.message || '로그인에 성공했습니다.'
        };
      } else {
        throw new Error(response.error?.message || '로그인에 실패했습니다.');
      }
    } catch (error) {
      console.error('[AuthManager] Login error:', error);
      throw error;
    }
  }

  /**
   * 로그아웃
   * @returns {Promise<Object>} - { success: boolean, message: string }
   */
  async logout() {
    try {
      if (this.debug) {
        console.log('[AuthManager] Logout attempt');
      }
      
      // 백엔드에 로그아웃 요청 (선택사항)
      try {
        await this.apiClient.post('/api/auth/logout');
      } catch (error) {
        // 백엔드 로그아웃 실패해도 로컬 데이터는 삭제
        console.warn('[AuthManager] Backend logout failed:', error);
      }

      // 로컬에 저장된 토큰 및 사용자 정보 삭제
      await this.tokenManager.clearTokens();
      this.currentUser = null;

      if (this.debug) {
        console.log('[AuthManager] Logout successful');
      }

      return {
        success: true,
        message: '로그아웃되었습니다.'
      };
    } catch (error) {
      console.error('[AuthManager] Logout error:', error);
      throw new Error('로그아웃 중 오류가 발생했습니다.');
    }
  }

  /**
   * 현재 로그인한 사용자 정보 조회
   * @returns {Promise<Object|null>} - 사용자 정보 또는 null
   */
  async getCurrentUser() {
    // 이미 메모리에 사용자 정보가 있으면 반환
    if (this.currentUser) {
      return this.currentUser;
    }

    // 토큰이 없으면 로그인 안 된 상태
    const accessToken = await this.tokenManager.getAccessToken();
    if (!accessToken) {
      return null;
    }

    try {
      if (this.debug) {
        console.log('[AuthManager] Fetching current user info');
      }
      
      // 백엔드에서 현재 사용자 정보 조회
      const response = await this.apiClient.get('/api/auth/me');
      
      if (response.success) {
        this.currentUser = response.user;
        return this.currentUser;
      } else {
        // 사용자 정보 조회 실패 시 로그아웃 처리
        await this.tokenManager.clearTokens();
        return null;
      }
    } catch (error) {
      console.error('[AuthManager] Get current user error:', error);
      // 토큰이 유효하지 않으면 로그아웃 처리
      await this.tokenManager.clearTokens();
      return null;
    }
  }

  /**
   * 토큰 유효성 검사 및 자동 로그인
   * @returns {Promise<boolean>} - 유효한 토큰이 있으면 true
   */
  async checkAuth() {
    try {
      const user = await this.getCurrentUser();
      return user !== null;
    } catch (error) {
      console.error('[AuthManager] Check auth error:', error);
      return false;
    }
  }

  /**
   * 로그인 상태 확인
   * @returns {Promise<boolean>} - 로그인 상태면 true
   */
  async isLoggedIn() {
    return await this.tokenManager.hasValidToken();
  }

  /**
   * '로그인 상태 유지' 설정 저장
   * @param {boolean} rememberMe - 로그인 상태 유지 여부
   * @returns {Promise<void>}
   */
  async saveRememberMe(rememberMe) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ rememberMe }, resolve);
    });
  }

  /**
   * '로그인 상태 유지' 설정 조회
   * @returns {Promise<boolean>} - 로그인 상태 유지 설정값
   */
  async getRememberMe() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['rememberMe'], (result) => {
        resolve(result.rememberMe || false);
      });
    });
  }

  /**
   * 비밀번호 재설정 요청
   * @param {string} email - 사용자 이메일
   * @returns {Promise<Object>} - { success: boolean, message: string }
   */
  async requestPasswordReset(email) {
    if (!this.validateEmail(email)) {
      throw new Error('유효한 이메일 주소를 입력해주세요.');
    }

    try {
      if (this.debug) {
        console.log('[AuthManager] Password reset request:', email);
      }
      
      const response = await this.apiClient.post('/api/auth/forgot-password', {
        email: email.trim().toLowerCase()
      }, { skipAuth: true });

      return {
        success: response.success,
        message: response.message || '비밀번호 재설정 이메일이 전송되었습니다.'
      };
    } catch (error) {
      console.error('[AuthManager] Password reset request error:', error);
      throw error;
    }
  }
}

// 전역으로 사용할 수 있도록 내보내기
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AuthManager;
}