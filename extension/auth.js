/**
 * 인증 페이지 UI 로직 및 이벤트 처리
 * 
 * 의존성:
 * - config.js (먼저 로드 필요)
 * - modules/token-manager.js
 * - modules/auth-manager.js
 * - modules/api-client.js
 * 
 * 📝 주요 수정사항 (v2.0.1):
 * - handleSignup 함수에서 confirmPassword를 authManager.signup()에 전달하도록 수정
 */

// ===== CONFIG 로드 확인 =====
if (typeof CONFIG === 'undefined' || !CONFIG) {
  console.error('[Auth] CONFIG가 로드되지 않았습니다!');
  console.error('[Auth] auth.html에서 config.js가 먼저 로드되는지 확인하세요.');
  alert('설정 파일 로드 오류. 페이지를 새로고침해주세요.');
  throw new Error('CONFIG not loaded');
}

// API 기본 URL (CONFIG에서 자동 감지)
const API_BASE_URL = CONFIG.getApiUrl();
console.log('[Auth] Using API URL:', API_BASE_URL);

// TokenManager 인스턴스 생성 (전역 tokenManager 사용)
// token-manager.js에서 이미 생성된 전역 인스턴스 사용
// const tokenManager = new TokenManager(); // modules/token-manager.js에 이미 있음

// AuthManager 인스턴스 생성 (TokenManager 주입)
const authManager = new AuthManager(API_BASE_URL, tokenManager);

// DOM 요소
const elements = {
  // 탭
  tabs: document.querySelectorAll('.tab-button'),
  loginForm: document.getElementById('login-form'),
  signupForm: document.getElementById('signup-form'),
  
  // 로그인
  loginEmail: document.getElementById('login-email'),
  loginPassword: document.getElementById('login-password'),
  loginSubmit: document.getElementById('login-submit'),
  rememberMe: document.getElementById('remember-me'),
  forgotPasswordLink: document.getElementById('forgot-password-link'),
  
  // 회원가입
  signupName: document.getElementById('signup-name'),
  signupEmail: document.getElementById('signup-email'),
  signupPassword: document.getElementById('signup-password'),
  signupPasswordConfirm: document.getElementById('signup-password-confirm'),
  signupSubmit: document.getElementById('signup-submit'),
  passwordStrength: document.getElementById('password-strength'),
  
  // 비밀번호 재설정 모달
  resetModal: document.getElementById('reset-password-modal'),
  resetEmail: document.getElementById('reset-email'),
  resetSubmit: document.getElementById('reset-submit'),
  modalClose: document.querySelector('.modal-close'),
  modalCancel: document.querySelector('.modal-cancel'),
  
  // 알림
  alertContainer: document.getElementById('alert-container')
};

/**
 * 페이지 초기화
 */
async function init() {
  // 이미 로그인되어 있는지 확인
  const isLoggedIn = await authManager.isLoggedIn();
  if (isLoggedIn) {
    // 🔧 수정: 로그인 상태면 안내 메시지 표시 후 탭 닫기
    showLoginSuccessMessage();
    return;
  }

  // 이벤트 리스너 등록
  setupEventListeners();
  
  // 비밀번호 표시/숨기기 기능 초기화
  setupPasswordToggle();

  // URL 해시 확인하여 회원가입 탭 자동 선택
  if (window.location.hash === '#signup') {
    switchTab('signup');
  }
}

/**
 * 🆕 로그인 성공 안내 메시지 표시
 */
function showLoginSuccessMessage() {
  document.body.innerHTML = `
    <div style="
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      padding: 20px;
      text-align: center;
      font-family: 'Roboto', sans-serif;
    ">
      <div style="
        background: white;
        border-radius: 16px;
        padding: 40px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        max-width: 400px;
      ">
        <div style="
          width: 80px;
          height: 80px;
          background: #4CAF50;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 24px;
        ">
          <span class="material-icons" style="color: white; font-size: 48px;">check</span>
        </div>
        <h2 style="color: #212121; margin-bottom: 16px;">로그인 성공!</h2>
        <p style="color: #757575; margin-bottom: 24px; line-height: 1.6;">
          SummaryGenie 확장 프로그램 아이콘을<br>
          클릭하여 사용을 시작하세요.
        </p>
        <button id="closeTabBtn" style="
          background: #2196F3;
          color: white;
          border: none;
          border-radius: 8px;
          padding: 12px 24px;
          font-size: 16px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s;
        ">
          닫기
        </button>
      </div>
    </div>
  `;

  const closeBtn = document.getElementById('closeTabBtn');
  closeBtn.addEventListener('click', () => {
    window.close();
  });

  // 3초 후 자동으로 탭 닫기
  setTimeout(() => {
    window.close();
  }, 3000);
}

/**
 * 이벤트 리스너 설정
 */
function setupEventListeners() {
  // 탭 전환
  elements.tabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // 폼 내 링크로 탭 전환
  document.querySelectorAll('.switch-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab(link.dataset.switch);
    });
  });

  // 로그인
  elements.loginSubmit.addEventListener('click', handleLogin);
  elements.loginPassword.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleLogin();
  });

  // 회원가입
  elements.signupSubmit.addEventListener('click', handleSignup);
  elements.signupPasswordConfirm.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSignup();
  });

  // 비밀번호 강도 체크
  elements.signupPassword.addEventListener('input', checkPasswordStrength);

  // 입력 필드 실시간 검증
  elements.loginEmail.addEventListener('blur', () => validateEmail(elements.loginEmail, 'login-email-error'));
  elements.signupEmail.addEventListener('blur', () => validateEmail(elements.signupEmail, 'signup-email-error'));
  elements.signupName.addEventListener('blur', validateName);
  elements.signupPasswordConfirm.addEventListener('blur', validatePasswordMatch);

  // 비밀번호 찾기
  elements.forgotPasswordLink.addEventListener('click', (e) => {
    e.preventDefault();
    showResetPasswordModal();
  });

  // 모달 닫기
  elements.modalClose.addEventListener('click', hideResetPasswordModal);
  elements.modalCancel.addEventListener('click', hideResetPasswordModal);
  elements.resetModal.addEventListener('click', (e) => {
    if (e.target === elements.resetModal) hideResetPasswordModal();
  });

  // 비밀번호 재설정
  elements.resetSubmit.addEventListener('click', handlePasswordReset);
}

/**
 * 비밀번호 표시/숨기기 토글 기능 설정
 */
function setupPasswordToggle() {
  document.querySelectorAll('.password-toggle').forEach(button => {
    button.addEventListener('click', () => {
      const input = button.previousElementSibling;
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      
      // 아이콘 변경 (선택사항)
      button.innerHTML = isPassword
        ? '<svg class="eye-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
        : '<svg class="eye-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    });
  });
}

/**
 * 탭 전환
 * @param {string} tabName - 전환할 탭 이름 ('login' 또는 'signup')
 */
function switchTab(tabName) {
  // 탭 버튼 활성화
  elements.tabs.forEach(tab => {
    if (tab.dataset.tab === tabName) {
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
    } else {
      tab.classList.remove('active');
      tab.setAttribute('aria-selected', 'false');
    }
  });

  // 폼 표시
  if (tabName === 'login') {
    elements.loginForm.classList.add('active');
    elements.signupForm.classList.remove('active');
    elements.loginEmail.focus();
  } else {
    elements.loginForm.classList.remove('active');
    elements.signupForm.classList.add('active');
    elements.signupName.focus();
  }

  // 에러 메시지 초기화
  clearAllErrors();
}

/**
 * 로그인 처리
 */
async function handleLogin() {
  const email = elements.loginEmail.value.trim();
  const password = elements.loginPassword.value;
  const rememberMe = elements.rememberMe.checked;

  // 입력값 검증
  let hasError = false;

  if (!validateEmail(elements.loginEmail, 'login-email-error')) {
    hasError = true;
  }

  if (!password) {
    showError('login-password-error', '비밀번호를 입력해주세요.');
    elements.loginPassword.classList.add('error');
    hasError = true;
  }

  if (hasError) return;

  // 로딩 상태 표시
  setButtonLoading(elements.loginSubmit, true);

  try {
    const result = await authManager.login(email, password, rememberMe);
    
    if (result.success) {
      showAlert('success', result.message);
      
      // 🔧 수정: 로그인 성공 후 처리
      setTimeout(() => {
        // 현재 창의 URL 확인
        const currentUrl = window.location.href;
        
        if (currentUrl.includes('auth.html')) {
          // auth.html 탭에서 로그인한 경우
          // 성공 메시지 표시 후 탭 닫기
          showLoginSuccessMessage();
        } else {
          // 다른 경로에서 로그인한 경우 (예: 팝업에서 직접 로그인)
          window.location.href = 'popup.html';
        }
      }, 1000);
    }
  } catch (error) {
    showAlert('error', error.message);
    setButtonLoading(elements.loginSubmit, false);
  }
}

/**
 * 회원가입 처리
 * 🔧 수정: confirmPassword를 authManager.signup()에 전달
 */
async function handleSignup() {
  const name = elements.signupName.value.trim();
  const email = elements.signupEmail.value.trim();
  const password = elements.signupPassword.value;
  const passwordConfirm = elements.signupPasswordConfirm.value;

  // 입력값 검증
  let hasError = false;

  if (!validateName()) hasError = true;
  if (!validateEmail(elements.signupEmail, 'signup-email-error')) hasError = true;
  if (!validatePasswordMatch()) hasError = true;

  // 비밀번호 강도 검증
  const passwordValidation = authManager.validatePassword(password);
  if (!passwordValidation.valid) {
    showError('signup-password-error', passwordValidation.message);
    elements.signupPassword.classList.add('error');
    hasError = true;
  }

  if (hasError) return;

  // 로딩 상태 표시
  setButtonLoading(elements.signupSubmit, true);

  try {
    // 🔧 수정: confirmPassword를 함께 전달
    const result = await authManager.signup(email, password, name, passwordConfirm);
    
    if (result.success) {
      showAlert('success', result.message);
      
      // 🔧 수정: 회원가입 성공 후 처리
      setTimeout(() => {
        const currentUrl = window.location.href;
        
        if (currentUrl.includes('auth.html')) {
          // auth.html 탭에서 회원가입한 경우
          showLoginSuccessMessage();
        } else {
          // 다른 경로에서 회원가입한 경우
          window.location.href = 'popup.html';
        }
      }, 1000);
    }
  } catch (error) {
    showAlert('error', error.message);
    setButtonLoading(elements.signupSubmit, false);
  }
}

/**
 * 비밀번호 재설정 처리
 */
async function handlePasswordReset() {
  const email = elements.resetEmail.value.trim();

  if (!authManager.validateEmail(email)) {
    showError('reset-email-error', '유효한 이메일 주소를 입력해주세요.');
    elements.resetEmail.classList.add('error');
    return;
  }

  setButtonLoading(elements.resetSubmit, true);

  try {
    const result = await authManager.requestPasswordReset(email);
    
    if (result.success) {
      showAlert('success', result.message);
      hideResetPasswordModal();
      elements.resetEmail.value = '';
    }
  } catch (error) {
    showAlert('error', error.message);
  } finally {
    setButtonLoading(elements.resetSubmit, false);
  }
}

/**
 * 이메일 형식 검증
 * @param {HTMLInputElement} input - 입력 요소
 * @param {string} errorId - 에러 메시지 요소 ID
 * @returns {boolean} - 유효하면 true
 */
function validateEmail(input, errorId) {
  const email = input.value.trim();
  const errorElement = document.getElementById(errorId);

  if (!email) {
    showError(errorId, '이메일을 입력해주세요.');
    input.classList.add('error');
    return false;
  }

  if (!authManager.validateEmail(email)) {
    showError(errorId, '유효한 이메일 주소를 입력해주세요.');
    input.classList.add('error');
    return false;
  }

  clearError(errorId);
  input.classList.remove('error');
  return true;
}

/**
 * 이름 검증
 * @returns {boolean} - 유효하면 true
 */
function validateName() {
  const name = elements.signupName.value.trim();

  if (!name || name.length < 2) {
    showError('signup-name-error', '이름은 최소 2자 이상이어야 합니다.');
    elements.signupName.classList.add('error');
    return false;
  }

  clearError('signup-name-error');
  elements.signupName.classList.remove('error');
  return true;
}

/**
 * 비밀번호 일치 검증
 * @returns {boolean} - 일치하면 true
 */
function validatePasswordMatch() {
  const password = elements.signupPassword.value;
  const passwordConfirm = elements.signupPasswordConfirm.value;

  if (!passwordConfirm) {
    showError('signup-password-confirm-error', '비밀번호 확인을 입력해주세요.');
    elements.signupPasswordConfirm.classList.add('error');
    return false;
  }

  if (password !== passwordConfirm) {
    showError('signup-password-confirm-error', '비밀번호가 일치하지 않습니다.');
    elements.signupPasswordConfirm.classList.add('error');
    return false;
  }

  clearError('signup-password-confirm-error');
  elements.signupPasswordConfirm.classList.remove('error');
  return true;
}

/**
 * 비밀번호 강도 체크 및 표시
 */
function checkPasswordStrength() {
  const password = elements.signupPassword.value;
  const strengthBar = elements.passwordStrength.querySelector('.strength-fill');
  const strengthText = elements.passwordStrength.querySelector('.strength-text');

  if (!password) {
    strengthBar.className = 'strength-fill';
    strengthText.textContent = '';
    return;
  }

  const validation = authManager.validatePassword(password);
  
  // 강도 계산
  let strength = 0;
  if (password.length >= 8) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/[a-z]/.test(password)) strength++;
  if (/[0-9]/.test(password)) strength++;
  if (/[^A-Za-z0-9]/.test(password)) strength++;

  // UI 업데이트
  strengthBar.className = 'strength-fill';
  
  if (strength <= 2) {
    strengthBar.classList.add('weak');
    strengthText.textContent = '약함';
  } else if (strength <= 3) {
    strengthBar.classList.add('medium');
    strengthText.textContent = '보통';
  } else {
    strengthBar.classList.add('strong');
    strengthText.textContent = '강함';
  }
}

/**
 * 비밀번호 재설정 모달 표시
 */
function showResetPasswordModal() {
  elements.resetModal.style.display = 'flex';
  elements.resetEmail.focus();
}

/**
 * 비밀번호 재설정 모달 숨김
 */
function hideResetPasswordModal() {
  elements.resetModal.style.display = 'none';
  elements.resetEmail.value = '';
  clearError('reset-email-error');
  elements.resetEmail.classList.remove('error');
}

/**
 * 버튼 로딩 상태 설정
 * @param {HTMLButtonElement} button - 버튼 요소
 * @param {boolean} loading - 로딩 상태
 */
function setButtonLoading(button, loading) {
  const btnText = button.querySelector('.btn-text');
  const btnLoader = button.querySelector('.btn-loader');

  if (loading) {
    button.disabled = true;
    btnText.style.display = 'none';
    btnLoader.style.display = 'flex';
  } else {
    button.disabled = false;
    btnText.style.display = 'block';
    btnLoader.style.display = 'none';
  }
}

/**
 * 에러 메시지 표시
 * @param {string} errorId - 에러 메시지 요소 ID
 * @param {string} message - 표시할 메시지
 */
function showError(errorId, message) {
  const errorElement = document.getElementById(errorId);
  if (errorElement) {
    errorElement.textContent = message;
  }
}

/**
 * 에러 메시지 제거
 * @param {string} errorId - 에러 메시지 요소 ID
 */
function clearError(errorId) {
  const errorElement = document.getElementById(errorId);
  if (errorElement) {
    errorElement.textContent = '';
  }
}

/**
 * 모든 에러 메시지 제거
 */
function clearAllErrors() {
  document.querySelectorAll('.error-message').forEach(el => {
    el.textContent = '';
  });
  document.querySelectorAll('input').forEach(input => {
    input.classList.remove('error');
  });
}

/**
 * 알림 메시지 표시
 * @param {string} type - 알림 타입 ('success', 'error', 'info')
 * @param {string} message - 표시할 메시지
 */
function showAlert(type, message) {
  const alert = document.createElement('div');
  alert.className = `alert ${type}`;
  
  const messageSpan = document.createElement('span');
  messageSpan.textContent = message;
  
  const closeButton = document.createElement('button');
  closeButton.className = 'alert-close';
  closeButton.innerHTML = '✕';
  closeButton.setAttribute('aria-label', '닫기');
  closeButton.addEventListener('click', () => {
    alert.remove();
  });

  alert.appendChild(messageSpan);
  alert.appendChild(closeButton);
  elements.alertContainer.appendChild(alert);

  // 5초 후 자동 제거
  setTimeout(() => {
    if (alert.parentElement) {
      alert.remove();
    }
  }, 5000);
}

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', init);