/**
 * 인증 서비스
 * 사용자 회원가입, 로그인, 프로필 관리 기능 제공
 * Singleton 패턴으로 구현
 * 
 * @module services/AuthService
 * @version 2.0.1
 * 
 * 📝 주요 수정사항:
 * - initialize() 메서드 추가: Firebase 초기화 후 재초기화 지원
 */

const { getFirestore, isFirebaseInitialized } = require('../config/firebase');
const { hashPassword, comparePassword, validatePasswordStrength } = require('../utils/password');
const { generateToken, generateRefreshToken } = require('../utils/jwt');
const {
  ValidationError,
  AuthenticationError,
  NotFoundError,
  DatabaseError,
  PasswordError
} = require('../middleware/errorHandler');
const {
  COLLECTIONS,
  USER_ROLES,
  SUBSCRIPTION_PLANS,
  ERROR_MESSAGES
} = require('../constants');

/**
 * 이메일 유효성 검증 정규식
 * RFC 5322 기본 패턴
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 인증 서비스 클래스
 * Firestore를 사용한 사용자 인증 및 관리
 */
class AuthService {
  constructor() {
    /**
     * Firestore 데이터베이스 인스턴스
     * @type {admin.firestore.Firestore | null}
     * @private
     */
    this.db = null;

    /**
     * Firestore 사용 가능 여부
     * @type {boolean}
     * @private
     */
    this.isFirestoreAvailable = false;

    // Firestore 초기화 (생성자에서 시도)
    this._initializeFirestore();
  }

  /**
   * Firestore 초기화 (내부 메서드)
   * @private
   */
  _initializeFirestore() {
    try {
      if (isFirebaseInitialized()) {
        this.db = getFirestore();
        this.isFirestoreAvailable = true;
        console.log('✅ AuthService: Firestore 연결 성공');
      } else {
        console.warn('⚠️  AuthService: Firebase가 초기화되지 않았습니다');
      }
    } catch (error) {
      console.error('❌ AuthService: Firestore 초기화 실패:', error.message);
      this.isFirestoreAvailable = false;
    }
  }

  /**
   * ✅ 추가: Firestore 재초기화 (server.js에서 호출)
   * Firebase 초기화 후 이 메서드를 호출하여 Firestore 연결
   * 
   * @returns {Promise<void>}
   * @throws {Error} Firestore 초기화 실패 시
   * 
   * @example
   * await authService.initialize();
   */
  async initialize() {
    try {
      if (isFirebaseInitialized()) {
        this.db = getFirestore();
        this.isFirestoreAvailable = true;
        console.log('✅ AuthService: Firestore 재초기화 완료');
      } else {
        throw new Error('Firebase가 초기화되지 않았습니다');
      }
    } catch (error) {
      console.error('❌ AuthService: 재초기화 실패:', error.message);
      this.isFirestoreAvailable = false;
      throw error;
    }
  }

  /**
   * Firestore 사용 가능 여부 확인
   * @returns {boolean} 사용 가능 여부
   */
  isAvailable() {
    return this.isFirestoreAvailable && this.db !== null;
  }

  /**
   * Firestore 연결 확인
   * @private
   * @throws {DatabaseError} Firestore를 사용할 수 없는 경우
   */
  _checkFirestore() {
    if (!this.isAvailable()) {
      throw new DatabaseError('Firestore를 사용할 수 없습니다');
    }
  }

  /**
   * 이메일 유효성 검증
   * @private
   * @param {string} email - 검증할 이메일
   * @throws {ValidationError} 이메일이 유효하지 않은 경우
   */
  _validateEmail(email) {
    if (!email || typeof email !== 'string') {
      throw new ValidationError('이메일을 입력해주세요');
    }

    if (!EMAIL_REGEX.test(email)) {
      throw new ValidationError('유효하지 않은 이메일 형식입니다');
    }
  }

  /**
   * 사용자 데이터 새니타이징 (민감 정보 제거)
   * @private
   * @param {Object} userData - 사용자 데이터
   * @returns {Object} 새니타이징된 사용자 데이터
   */
  _sanitizeUserData(userData) {
    const { passwordHash, ...safeData } = userData;
    return safeData;
  }

  // ===== 회원가입 =====

  /**
   * 회원가입
   * 
   * @param {string} email - 사용자 이메일
   * @param {string} password - 사용자 비밀번호 (8자 이상)
   * @param {string} [name] - 사용자 이름 (선택)
   * @returns {Promise<Object>} 생성된 사용자 정보 및 토큰
   * @returns {Object} returns.user - 사용자 정보
   * @returns {string} returns.accessToken - 액세스 토큰
   * @returns {string} returns.refreshToken - 리프레시 토큰
   * @throws {ValidationError} 입력값이 유효하지 않은 경우
   * @throws {DatabaseError} 이메일이 이미 존재하는 경우
   * 
   * @example
   * const { user, accessToken, refreshToken } = await authService.signup(
   *   'user@example.com',
   *   'SecureP@ss123',
   *   'John Doe'
   * );
   */
  async signup(email, password, name = null) {
    this._checkFirestore();

    // 입력 검증
    this._validateEmail(email);

    if (!password || typeof password !== 'string') {
      throw new ValidationError('비밀번호를 입력해주세요');
    }

    // 비밀번호 강도 검증
    const passwordCheck = validatePasswordStrength(password);
    if (!passwordCheck.isValid) {
      throw new PasswordError(
        `비밀번호가 정책을 만족하지 않습니다: ${passwordCheck.missingRequirements.join(', ')}`
      );
    }

    // 이메일 소문자 변환
    const normalizedEmail = email.toLowerCase().trim();

    try {
      // 1. 이메일 중복 확인
      const existingUser = await this.db
        .collection(COLLECTIONS.USERS)
        .where('email', '==', normalizedEmail)
        .limit(1)
        .get();

      if (!existingUser.empty) {
        throw new ValidationError(ERROR_MESSAGES.DUPLICATE_EMAIL);
      }

      // 2. 비밀번호 해싱
      const passwordHash = await hashPassword(password);

      // 3. 사용자 문서 생성
      const userRef = this.db.collection(COLLECTIONS.USERS).doc();
      const now = new Date();

      const userData = {
        id: userRef.id,
        email: normalizedEmail,
        passwordHash,
        name: name || null,
        isPremium: false,
        role: USER_ROLES.USER,
        subscriptionPlan: SUBSCRIPTION_PLANS.FREE,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now,
        metadata: {
          emailVerified: false,
          loginCount: 1,
          signupMethod: 'email'
        }
      };

      await userRef.set(userData);

      // 4. JWT 토큰 생성
      const accessToken = generateToken({
        userId: userData.id,
        email: userData.email,
        isPremium: userData.isPremium,
        role: userData.role
      });

      const refreshToken = generateRefreshToken({
        userId: userData.id
      });

      // 5. 응답 데이터 구성 (비밀번호 해시 제외)
      const safeUserData = this._sanitizeUserData(userData);

      console.log(`✅ 회원가입 성공: ${userData.email} (ID: ${userData.id})`);

      return {
        user: safeUserData,
        accessToken,
        refreshToken
      };

    } catch (error) {
      // 이미 처리된 커스텀 에러는 그대로 throw
      if (error instanceof ValidationError || error instanceof PasswordError) {
        throw error;
      }

      // Firestore 에러 처리
      console.error('회원가입 실패:', error);
      throw new DatabaseError(`회원가입 중 오류가 발생했습니다: ${error.message}`);
    }
  }

  // ===== 로그인 =====

  /**
   * 로그인
   * 
   * @param {string} email - 사용자 이메일
   * @param {string} password - 사용자 비밀번호
   * @returns {Promise<Object>} 사용자 정보 및 토큰
   * @returns {Object} returns.user - 사용자 정보
   * @returns {string} returns.accessToken - 액세스 토큰
   * @returns {string} returns.refreshToken - 리프레시 토큰
   * @throws {ValidationError} 입력값이 유효하지 않은 경우
   * @throws {AuthenticationError} 인증에 실패한 경우
   * 
   * @example
   * const { user, accessToken, refreshToken } = await authService.login(
   *   'user@example.com',
   *   'SecureP@ss123'
   * );
   */
  async login(email, password) {
    this._checkFirestore();

    // 입력 검증
    this._validateEmail(email);

    if (!password || typeof password !== 'string') {
      throw new ValidationError('비밀번호를 입력해주세요');
    }

    const normalizedEmail = email.toLowerCase().trim();

    try {
      // 1. 이메일로 사용자 조회
      const userSnapshot = await this.db
        .collection(COLLECTIONS.USERS)
        .where('email', '==', normalizedEmail)
        .limit(1)
        .get();

      if (userSnapshot.empty) {
        throw new AuthenticationError(ERROR_MESSAGES.INVALID_CREDENTIALS);
      }

      const userDoc = userSnapshot.docs[0];
      const userData = userDoc.data();

      // 2. 비밀번호 검증
      const isPasswordValid = await comparePassword(password, userData.passwordHash);
      
      if (!isPasswordValid) {
        throw new AuthenticationError(ERROR_MESSAGES.INVALID_CREDENTIALS);
      }

      // 3. 로그인 정보 업데이트
      const now = new Date();
      await userDoc.ref.update({
        lastLoginAt: now,
        updatedAt: now,
        'metadata.loginCount': (userData.metadata?.loginCount || 0) + 1
      });

      // 4. JWT 토큰 생성
      const accessToken = generateToken({
        userId: userData.id,
        email: userData.email,
        isPremium: userData.isPremium,
        role: userData.role
      });

      const refreshToken = generateRefreshToken({
        userId: userData.id
      });

      // 5. 응답 데이터 구성
      const safeUserData = this._sanitizeUserData(userData);

      console.log(`✅ 로그인 성공: ${userData.email} (ID: ${userData.id})`);

      return {
        user: safeUserData,
        accessToken,
        refreshToken
      };

    } catch (error) {
      // 이미 처리된 커스텀 에러는 그대로 throw
      if (error instanceof AuthenticationError || error instanceof ValidationError) {
        throw error;
      }

      // Firestore 에러 처리
      console.error('로그인 실패:', error);
      throw new DatabaseError(`로그인 중 오류가 발생했습니다: ${error.message}`);
    }
  }

  // ===== 사용자 조회 =====

  /**
   * ID로 사용자 조회
   * 
   * @param {string} userId - 사용자 고유 식별자
   * @returns {Promise<Object>} 사용자 정보 (비밀번호 해시 제외)
   * @throws {ValidationError} userId가 유효하지 않은 경우
   * @throws {NotFoundError} 사용자를 찾을 수 없는 경우
   * 
   * @example
   * const user = await authService.getUserById('user123');
   */
  async getUserById(userId) {
    this._checkFirestore();

    if (!userId || typeof userId !== 'string') {
      throw new ValidationError('유효하지 않은 사용자 ID입니다');
    }

    try {
      const userDoc = await this.db
        .collection(COLLECTIONS.USERS)
        .doc(userId)
        .get();

      if (!userDoc.exists) {
        throw new NotFoundError(ERROR_MESSAGES.USER_NOT_FOUND);
      }

      const userData = userDoc.data();
      return this._sanitizeUserData(userData);

    } catch (error) {
      if (error instanceof NotFoundError || error instanceof ValidationError) {
        throw error;
      }

      console.error('사용자 조회 실패:', error);
      throw new DatabaseError(`사용자 조회 중 오류가 발생했습니다: ${error.message}`);
    }
  }

  /**
   * 이메일로 사용자 조회
   * 
   * @param {string} email - 사용자 이메일
   * @returns {Promise<Object>} 사용자 정보 (비밀번호 해시 제외)
   * @throws {ValidationError} 이메일이 유효하지 않은 경우
   * @throws {NotFoundError} 사용자를 찾을 수 없는 경우
   * 
   * @example
   * const user = await authService.getUserByEmail('user@example.com');
   */
  async getUserByEmail(email) {
    this._checkFirestore();

    this._validateEmail(email);
    const normalizedEmail = email.toLowerCase().trim();

    try {
      const userSnapshot = await this.db
        .collection(COLLECTIONS.USERS)
        .where('email', '==', normalizedEmail)
        .limit(1)
        .get();

      if (userSnapshot.empty) {
        throw new NotFoundError(ERROR_MESSAGES.USER_NOT_FOUND);
      }

      const userData = userSnapshot.docs[0].data();
      return this._sanitizeUserData(userData);

    } catch (error) {
      if (error instanceof NotFoundError || error instanceof ValidationError) {
        throw error;
      }

      console.error('사용자 조회 실패:', error);
      throw new DatabaseError(`사용자 조회 중 오류가 발생했습니다: ${error.message}`);
    }
  }

  // ===== 프로필 업데이트 =====

  /**
   * 사용자 프로필 업데이트
   * 
   * @param {string} userId - 사용자 고유 식별자
   * @param {Object} updates - 업데이트할 필드
   * @param {string} [updates.name] - 사용자 이름
   * @param {boolean} [updates.isPremium] - 프리미엄 여부
   * @param {string} [updates.subscriptionPlan] - 구독 플랜
   * @returns {Promise<Object>} 업데이트된 사용자 정보
   * @throws {ValidationError} 입력값이 유효하지 않은 경우
   * @throws {NotFoundError} 사용자를 찾을 수 없는 경우
   * 
   * @example
   * const updatedUser = await authService.updateProfile('user123', {
   *   name: 'Jane Doe',
   *   isPremium: true
   * });
   */
  async updateProfile(userId, updates) {
    this._checkFirestore();

    if (!userId || typeof userId !== 'string') {
      throw new ValidationError('유효하지 않은 사용자 ID입니다');
    }

    if (!updates || typeof updates !== 'object') {
      throw new ValidationError('업데이트할 정보를 제공해주세요');
    }

    // 수정 불가 필드 제거
    const forbiddenFields = ['id', 'email', 'passwordHash', 'createdAt', 'role'];
    const sanitizedUpdates = { ...updates };
    forbiddenFields.forEach(field => delete sanitizedUpdates[field]);

    // 업데이트할 필드가 없는 경우
    if (Object.keys(sanitizedUpdates).length === 0) {
      throw new ValidationError('업데이트할 유효한 필드가 없습니다');
    }

    try {
      const userRef = this.db.collection(COLLECTIONS.USERS).doc(userId);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        throw new NotFoundError(ERROR_MESSAGES.USER_NOT_FOUND);
      }

      // updatedAt 추가
      sanitizedUpdates.updatedAt = new Date();

      await userRef.update(sanitizedUpdates);

      // 업데이트된 사용자 데이터 조회
      const updatedDoc = await userRef.get();
      const updatedData = updatedDoc.data();

      console.log(`✅ 프로필 업데이트 성공: ${userId}`);
      return this._sanitizeUserData(updatedData);

    } catch (error) {
      if (error instanceof NotFoundError || error instanceof ValidationError) {
        throw error;
      }

      console.error('프로필 업데이트 실패:', error);
      throw new DatabaseError(`프로필 업데이트 중 오류가 발생했습니다: ${error.message}`);
    }
  }

  // ===== 비밀번호 변경 =====

  /**
   * 비밀번호 변경
   * 
   * @param {string} userId - 사용자 고유 식별자
   * @param {string} oldPassword - 현재 비밀번호
   * @param {string} newPassword - 새 비밀번호
   * @returns {Promise<Object>} 성공 메시지
   * @throws {ValidationError} 입력값이 유효하지 않은 경우
   * @throws {AuthenticationError} 현재 비밀번호가 일치하지 않는 경우
   * @throws {NotFoundError} 사용자를 찾을 수 없는 경우
   * 
   * @example
   * await authService.changePassword('user123', 'OldP@ss123', 'NewP@ss456');
   */
  async changePassword(userId, oldPassword, newPassword) {
    this._checkFirestore();

    if (!userId || typeof userId !== 'string') {
      throw new ValidationError('유효하지 않은 사용자 ID입니다');
    }

    if (!oldPassword || !newPassword) {
      throw new ValidationError('현재 비밀번호와 새 비밀번호를 모두 입력해주세요');
    }

    // 새 비밀번호 강도 검증
    const passwordCheck = validatePasswordStrength(newPassword);
    if (!passwordCheck.isValid) {
      throw new PasswordError(
        `새 비밀번호가 정책을 만족하지 않습니다: ${passwordCheck.missingRequirements.join(', ')}`
      );
    }

    try {
      const userRef = this.db.collection(COLLECTIONS.USERS).doc(userId);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        throw new NotFoundError(ERROR_MESSAGES.USER_NOT_FOUND);
      }

      const userData = userDoc.data();

      // 현재 비밀번호 검증
      const isOldPasswordValid = await comparePassword(oldPassword, userData.passwordHash);
      
      if (!isOldPasswordValid) {
        throw new AuthenticationError('현재 비밀번호가 일치하지 않습니다');
      }

      // 새 비밀번호 해싱
      const newPasswordHash = await hashPassword(newPassword);

      // 비밀번호 업데이트
      await userRef.update({
        passwordHash: newPasswordHash,
        updatedAt: new Date()
      });

      console.log(`✅ 비밀번호 변경 성공: ${userId}`);

      return {
        success: true,
        message: '비밀번호가 성공적으로 변경되었습니다'
      };

    } catch (error) {
      if (
        error instanceof NotFoundError ||
        error instanceof ValidationError ||
        error instanceof AuthenticationError ||
        error instanceof PasswordError
      ) {
        throw error;
      }

      console.error('비밀번호 변경 실패:', error);
      throw new DatabaseError(`비밀번호 변경 중 오류가 발생했습니다: ${error.message}`);
    }
  }
}

// Singleton 인스턴스 생성 및 export
const authService = new AuthService();

module.exports = authService;