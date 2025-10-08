/**
 * 인증 API 라우터
 * 회원가입, 로그인, 프로필 관리, 토큰 갱신, 비밀번호 재설정, 이메일 인증
 * 
 * @module routes/api/auth
 */

const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

// Constants
const {
  HTTP_STATUS,
  ERROR_CODES,
  ERROR_MESSAGES
} = require('../../constants');

// Middleware
const { authenticate } = require('../../middleware/auth');
const {
  validate,
  signupValidator,
  loginValidator,
  emailValidator,
  passwordValidator
} = require('../../middleware/validator');
const {
  authLimiter,
  signupLimiter,
  passwordResetLimiter
} = require('../../middleware/rateLimiter');
const { asyncHandler } = require('../../middleware/errorHandler');

// Services
const authService = require('../../services/AuthService');
const emailService = require('../../services/EmailService');
const { tokenService, TOKEN_TYPES } = require('../../services/TokenService');

// Utils
const {
  refreshToken: refreshTokenUtil,
  verifyToken
} = require('../../utils/jwt');
const {
  generatePasswordResetToken,
  generateEmailVerificationToken,
  hashToken
} = require('../../utils/tokenUtils');

// Error Classes
const {
  ValidationError,
  AuthenticationError,
  NotFoundError
} = require('../../middleware/errorHandler');

// ===== POST /signup - 회원가입 =====

/**
 * 회원가입
 * 
 * @route POST /api/auth/signup
 * @middleware validate(signupValidator) - 회원가입 데이터 검증
 * @middleware signupLimiter - Rate limiting (시간당 3회)
 * 
 * @body {string} email - 사용자 이메일 (유효한 이메일 형식)
 * @body {string} password - 비밀번호 (8자 이상, 대소문자+숫자 포함)
 * @body {string} confirmPassword - 비밀번호 확인 (password와 일치)
 * @body {string} [name] - 사용자 이름 (선택, 2-50자)
 */
router.post('/signup',
  validate(signupValidator),
  signupLimiter,
  asyncHandler(async (req, res) => {
    const { email, password, name } = req.body;
    
    console.log(`[Auth Signup] 회원가입 시도: ${email}`);
    
    // AuthService를 통한 회원가입
    const result = await authService.signup(email, password, name);
    
    // 환영 이메일 및 인증 이메일 발송
    if (emailService.isAvailable()) {
      try {
        // 환영 이메일
        await emailService.sendWelcomeEmail(result.user.email, result.user.name);
        console.log(`✅ 환영 이메일 발송: ${result.user.email}`);
        
        // 이메일 인증 토큰 생성 및 발송
        const { rawToken, hashedToken, expiresIn } = generateEmailVerificationToken(
          result.user.id,
          result.user.email
        );
        
        await tokenService.saveToken(
          result.user.id,
          hashedToken,
          TOKEN_TYPES.EMAIL_VERIFICATION,
          expiresIn
        );
        
        await emailService.sendVerificationEmail(
          result.user.email,
          result.user.name,
          rawToken
        );
        console.log(`✅ 인증 이메일 발송: ${result.user.email}`);
      } catch (emailError) {
        console.error('⚠️ 이메일 발송 실패:', emailError.message);
      }
    }
    
    console.log(`✅ [Auth Signup] 회원가입 성공: ${email} (ID: ${result.user.id})`);
    
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: '회원가입이 완료되었습니다',
      user: result.user,
      tokens: {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken
      }
    });
  })
);

// ===== POST /login - 로그인 =====

/**
 * 로그인
 * 
 * @route POST /api/auth/login
 * @middleware validate(loginValidator) - 로그인 데이터 검증
 * @middleware authLimiter - Rate limiting (분당 5회)
 */
router.post('/login',
  validate(loginValidator),
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    
    console.log(`[Auth Login] 로그인 시도: ${email}`);
    
    // AuthService를 통한 로그인
    const result = await authService.login(email, password);
    
    console.log(`✅ [Auth Login] 로그인 성공: ${email}`);
    
    res.json({
      success: true,
      message: '로그인되었습니다',
      user: result.user,
      tokens: {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken
      }
    });
  })
);

// ===== POST /logout - 로그아웃 =====

/**
 * 로그아웃
 * 
 * @route POST /api/auth/logout
 * @middleware authenticate - JWT 인증 필수
 */
router.post('/logout',
  authenticate,
  asyncHandler(async (req, res) => {
    const { userId, email } = req.user;
    
    console.log(`[Auth Logout] 로그아웃: ${email}`);
    
    // TODO: 토큰 블랙리스트에 추가 (Redis 사용 권장)
    
    res.json({
      success: true,
      message: '로그아웃되었습니다'
    });
  })
);

// ===== GET /me - 현재 사용자 정보 조회 =====

/**
 * 현재 사용자 정보 조회
 * 
 * @route GET /api/auth/me
 * @middleware authenticate - JWT 인증 필수
 */
router.get('/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const { userId } = req.user;
    
    console.log(`[Auth Me] 사용자 정보 조회: ${userId}`);
    
    const user = await authService.getUserById(userId);
    
    res.json({
      success: true,
      user
    });
  })
);

// ===== PUT /profile - 프로필 업데이트 =====

/**
 * 프로필 업데이트
 * 
 * @route PUT /api/auth/profile
 * @middleware authenticate - JWT 인증 필수
 */
router.put('/profile',
  authenticate,
  asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const updates = req.body;
    
    console.log(`[Auth Profile] 프로필 업데이트: ${userId}`);
    
    if (!updates || Object.keys(updates).length === 0) {
      throw new ValidationError('업데이트할 정보를 제공해주세요');
    }
    
    const updatedUser = await authService.updateProfile(userId, updates);
    
    console.log(`✅ [Auth Profile] 프로필 업데이트 성공: ${userId}`);
    
    res.json({
      success: true,
      message: '프로필이 업데이트되었습니다',
      user: updatedUser
    });
  })
);

// ===== POST /change-password - 비밀번호 변경 =====

/**
 * 비밀번호 변경
 * 
 * @route POST /api/auth/change-password
 * @middleware authenticate - JWT 인증 필수
 */
router.post('/change-password',
  authenticate,
  asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { oldPassword, newPassword, confirmPassword } = req.body;
    
    console.log(`[Auth Change Password] 비밀번호 변경 시도: ${userId}`);
    
    if (!oldPassword || !newPassword || !confirmPassword) {
      throw new ValidationError('모든 필드를 입력해주세요');
    }
    
    if (newPassword !== confirmPassword) {
      throw new ValidationError('새 비밀번호가 일치하지 않습니다');
    }
    
    if (oldPassword === newPassword) {
      throw new ValidationError('새 비밀번호는 이전 비밀번호와 달라야 합니다');
    }
    
    await authService.changePassword(userId, oldPassword, newPassword);
    
    // 비밀번호 변경 확인 이메일 발송
    if (emailService.isAvailable()) {
      try {
        const user = await authService.getUserById(userId);
        await emailService.sendPasswordChangedEmail(user.email, user.name);
      } catch (emailError) {
        console.error('⚠️ 이메일 발송 실패:', emailError.message);
      }
    }
    
    console.log(`✅ [Auth Change Password] 비밀번호 변경 성공: ${userId}`);
    
    res.json({
      success: true,
      message: '비밀번호가 성공적으로 변경되었습니다'
    });
  })
);

// ===== POST /refresh - 토큰 갱신 =====

/**
 * 액세스 토큰 갱신
 * 
 * @route POST /api/auth/refresh
 */
router.post('/refresh',
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      throw new ValidationError('리프레시 토큰이 필요합니다');
    }
    
    console.log('[Auth Refresh] 토큰 갱신 시도');
    
    try {
      const newTokens = refreshTokenUtil(refreshToken, true);
      
      console.log('✅ [Auth Refresh] 토큰 갱신 성공');
      
      res.json({
        success: true,
        message: '토큰이 갱신되었습니다',
        tokens: {
          accessToken: newTokens.accessToken,
          refreshToken: newTokens.refreshToken
        }
      });
    } catch (error) {
      console.error('[Auth Refresh] 토큰 갱신 실패:', error.message);
      throw new AuthenticationError('유효하지 않거나 만료된 리프레시 토큰입니다');
    }
  })
);

// ===== POST /forgot-password - 비밀번호 재설정 요청 =====

/**
 * 비밀번호 재설정 요청 (이메일 발송)
 * 
 * @route POST /api/auth/forgot-password
 * @middleware validate(emailValidator) - 이메일 검증
 * @middleware passwordResetLimiter - Rate limiting (시간당 3회)
 */
router.post('/forgot-password',
  validate(emailValidator),
  passwordResetLimiter,
  asyncHandler(async (req, res) => {
    const { email } = req.body;
    
    console.log(`[Auth Forgot Password] 비밀번호 재설정 요청: ${email}`);
    
    try {
      // 1. 사용자 존재 확인
      const user = await authService.getUserByEmail(email);
      
      // 2. 기존 미사용 토큰 무효화
      await tokenService.invalidateAllUserTokens(
        user.id, 
        TOKEN_TYPES.PASSWORD_RESET
      );
      
      // 3. 재설정 토큰 생성
      const { rawToken, hashedToken, expiresIn } = generatePasswordResetToken(
        user.id,
        user.email
      );
      
      // 4. Firestore에 토큰 저장
      await tokenService.saveToken(
        user.id,
        hashedToken,
        TOKEN_TYPES.PASSWORD_RESET,
        expiresIn
      );
      
      // 5. 이메일 발송
      if (emailService.isAvailable()) {
        await emailService.sendPasswordResetEmail(
          user.email,
          user.name,
          rawToken
        );
        console.log(`✅ [Auth Forgot Password] 재설정 이메일 발송: ${email}`);
      } else {
        console.warn(`⚠️ [Auth Forgot Password] 이메일 서비스 비활성화: ${email}`);
      }
      
    } catch (error) {
      // 보안: 사용자 존재 여부 노출 방지
      console.log(`[Auth Forgot Password] 에러 (무시): ${email} - ${error.message}`);
    }
    
    // 보안: 항상 동일한 응답
    res.json({
      success: true,
      message: '등록된 이메일인 경우 비밀번호 재설정 링크가 발송됩니다'
    });
  })
);

// ===== POST /reset-password - 비밀번호 재설정 실행 =====

/**
 * 비밀번호 재설정 실행
 * 
 * @route POST /api/auth/reset-password
 */
router.post('/reset-password',
  asyncHandler(async (req, res) => {
    const { token, newPassword, confirmPassword } = req.body;
    
    console.log('[Auth Reset Password] 비밀번호 재설정 실행');
    
    // 1. 입력값 검증
    if (!token || !newPassword || !confirmPassword) {
      throw new ValidationError('모든 필드를 입력해주세요');
    }
    
    if (newPassword !== confirmPassword) {
      throw new ValidationError('비밀번호가 일치하지 않습니다');
    }
    
    // 2. 비밀번호 강도 검증
    const { validatePasswordStrength } = require('../../utils/password');
    const passwordCheck = validatePasswordStrength(newPassword);
    
    if (!passwordCheck.isValid) {
      throw new ValidationError(
        `비밀번호가 정책을 만족하지 않습니다: ${passwordCheck.missingRequirements.join(', ')}`
      );
    }
    
    // 3. 토큰 해싱
    const hashedToken = hashToken(token);
    
    // 4. 토큰으로 사용자 찾기
    const usersSnapshot = await tokenService.db
      .collectionGroup('tokens')
      .where('token', '==', hashedToken)
      .where('type', '==', TOKEN_TYPES.PASSWORD_RESET)
      .where('used', '==', false)
      .limit(1)
      .get();
    
    if (usersSnapshot.empty) {
      throw new AuthenticationError('유효하지 않거나 만료된 토큰입니다');
    }
    
    const tokenDoc = usersSnapshot.docs[0];
    const tokenData = tokenDoc.data();
    
    // 5. 만료 확인
    const now = new Date();
    const expiresAt = tokenData.expiresAt.toDate();
    
    if (now > expiresAt) {
      throw new AuthenticationError('만료된 토큰입니다');
    }
    
    const userId = tokenData.userId;
    
    // 6. 비밀번호 업데이트
    const { hashPassword } = require('../../utils/password');
    const newPasswordHash = await hashPassword(newPassword);
    
    await tokenService.db
      .collection('users')
      .doc(userId)
      .update({
        passwordHash: newPasswordHash,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    
    // 7. 토큰 무효화
    await tokenDoc.ref.update({
      used: true,
      usedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // 8. 비밀번호 변경 확인 이메일 발송
    if (emailService.isAvailable()) {
      try {
        const user = await authService.getUserById(userId);
        await emailService.sendPasswordChangedEmail(user.email, user.name);
        console.log(`✅ [Auth Reset Password] 변경 확인 이메일 발송: ${user.email}`);
      } catch (emailError) {
        console.error('⚠️ 이메일 발송 실패:', emailError.message);
      }
    }
    
    console.log(`✅ [Auth Reset Password] 비밀번호 재설정 완료: ${userId}`);
    
    res.json({
      success: true,
      message: '비밀번호가 재설정되었습니다'
    });
  })
);

// ===== POST /verify-email - 이메일 인증 =====

/**
 * 이메일 인증
 * 
 * @route POST /api/auth/verify-email
 */
router.post('/verify-email',
  asyncHandler(async (req, res) => {
    const { token } = req.body;
    
    if (!token) {
      throw new ValidationError('인증 토큰이 필요합니다');
    }
    
    console.log('[Auth Verify Email] 이메일 인증 시도');
    
    // 1. 토큰 해싱
    const hashedToken = hashToken(token);
    
    // 2. 토큰으로 사용자 찾기
    const usersSnapshot = await tokenService.db
      .collectionGroup('tokens')
      .where('token', '==', hashedToken)
      .where('type', '==', TOKEN_TYPES.EMAIL_VERIFICATION)
      .where('used', '==', false)
      .limit(1)
      .get();
    
    if (usersSnapshot.empty) {
      throw new AuthenticationError('유효하지 않거나 만료된 토큰입니다');
    }
    
    const tokenDoc = usersSnapshot.docs[0];
    const tokenData = tokenDoc.data();
    
    // 3. 만료 확인
    const now = new Date();
    const expiresAt = tokenData.expiresAt.toDate();
    
    if (now > expiresAt) {
      throw new AuthenticationError('만료된 토큰입니다');
    }
    
    const userId = tokenData.userId;
    
    // 4. 이메일 인증 상태 업데이트
    await tokenService.db
      .collection('users')
      .doc(userId)
      .update({
        'metadata.emailVerified': true,
        'metadata.emailVerifiedAt': admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    
    // 5. 토큰 무효화
    await tokenDoc.ref.update({
      used: true,
      usedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ [Auth Verify Email] 이메일 인증 완료: ${userId}`);
    
    res.json({
      success: true,
      message: '이메일 인증이 완료되었습니다'
    });
  })
);

// ===== POST /resend-verification - 인증 이메일 재발송 =====

/**
 * 이메일 인증 링크 재발송
 * 
 * @route POST /api/auth/resend-verification
 * @middleware authenticate - JWT 인증 필수
 */
router.post('/resend-verification',
  authenticate,
  asyncHandler(async (req, res) => {
    const { userId, email } = req.user;
    
    console.log(`[Auth Resend Verification] 인증 이메일 재발송: ${email}`);
    
    // 1. 사용자 정보 조회
    const user = await authService.getUserById(userId);
    
    // 2. 이미 인증된 경우
    if (user.metadata?.emailVerified) {
      return res.json({
        success: true,
        message: '이미 인증된 이메일입니다'
      });
    }
    
    // 3. 기존 미사용 토큰 무효화
    await tokenService.invalidateAllUserTokens(
      userId,
      TOKEN_TYPES.EMAIL_VERIFICATION
    );
    
    // 4. 새 토큰 생성
    const { rawToken, hashedToken, expiresIn } = generateEmailVerificationToken(
      userId,
      email
    );
    
    // 5. Firestore에 토큰 저장
    await tokenService.saveToken(
      userId,
      hashedToken,
      TOKEN_TYPES.EMAIL_VERIFICATION,
      expiresIn
    );
    
    // 6. 이메일 발송
    if (emailService.isAvailable()) {
      await emailService.sendVerificationEmail(email, user.name, rawToken);
      console.log(`✅ [Auth Resend Verification] 인증 이메일 재발송: ${email}`);
    }
    
    res.json({
      success: true,
      message: '인증 이메일이 재발송되었습니다'
    });
  })
);

module.exports = router;