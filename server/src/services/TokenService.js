/**
 * 토큰 관리 서비스
 * Firestore를 사용한 토큰 저장, 조회, 무효화
 * 
 * @module services/TokenService
 */

const { getFirestore, isFirebaseInitialized } = require('../config/firebase');
const admin = require('firebase-admin');
const {
  ValidationError,
  NotFoundError,
  AuthenticationError
} = require('../middleware/errorHandler');

/**
 * 토큰 타입
 */
const TOKEN_TYPES = {
  PASSWORD_RESET: 'password-reset',
  EMAIL_VERIFICATION: 'email-verification'
};

/**
 * 토큰 관리 서비스 클래스
 */
class TokenService {
  constructor() {
    this.db = null;
    this.isFirestoreAvailable = false;
    this._initializeFirestore();
  }

  _initializeFirestore() {
    try {
      if (isFirebaseInitialized()) {
        this.db = getFirestore();
        this.isFirestoreAvailable = true;
        console.log('✅ TokenService: Firestore 연결 성공');
      }
    } catch (error) {
      console.error('❌ TokenService: Firestore 초기화 실패:', error.message);
      this.isFirestoreAvailable = false;
    }
  }

  /**
   * 토큰 저장
   * 
   * @param {string} userId - 사용자 ID
   * @param {string} hashedToken - 해시된 토큰
   * @param {string} type - 토큰 타입
   * @param {number} expiresIn - 만료 시간 (밀리초)
   * @returns {Promise<string>} 토큰 ID
   */
  async saveToken(userId, hashedToken, type, expiresIn) {
    if (!this.isFirestoreAvailable) {
      throw new Error('Firestore를 사용할 수 없습니다');
    }

    const tokenRef = this.db
      .collection('users')
      .doc(userId)
      .collection('tokens')
      .doc();

    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiresIn);

    const tokenData = {
      id: tokenRef.id,
      userId,
      token: hashedToken,
      type,
      used: false,
      expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await tokenRef.set(tokenData);

    console.log(`✅ 토큰 저장: ${userId} - ${type} (만료: ${expiresAt.toISOString()})`);

    return tokenRef.id;
  }

  /**
   * 토큰 조회 및 검증
   * 
   * @param {string} userId - 사용자 ID
   * @param {string} hashedToken - 해시된 토큰
   * @param {string} type - 토큰 타입
   * @returns {Promise<Object>} 토큰 데이터
   * @throws {NotFoundError} 토큰을 찾을 수 없는 경우
   * @throws {AuthenticationError} 토큰이 유효하지 않은 경우
   */
  async verifyAndGetToken(userId, hashedToken, type) {
    if (!this.isFirestoreAvailable) {
      throw new Error('Firestore를 사용할 수 없습니다');
    }

    const tokensSnapshot = await this.db
      .collection('users')
      .doc(userId)
      .collection('tokens')
      .where('token', '==', hashedToken)
      .where('type', '==', type)
      .limit(1)
      .get();

    if (tokensSnapshot.empty) {
      throw new NotFoundError('유효하지 않은 토큰입니다');
    }

    const tokenDoc = tokensSnapshot.docs[0];
    const tokenData = tokenDoc.data();

    // 이미 사용된 토큰
    if (tokenData.used) {
      throw new AuthenticationError('이미 사용된 토큰입니다');
    }

    // 만료 확인
    const now = new Date();
    const expiresAt = tokenData.expiresAt.toDate();

    if (now > expiresAt) {
      throw new AuthenticationError('만료된 토큰입니다');
    }

    return {
      ...tokenData,
      docId: tokenDoc.id
    };
  }

  /**
   * 토큰 무효화 (사용 완료)
   * 
   * @param {string} userId - 사용자 ID
   * @param {string} tokenId - 토큰 문서 ID
   * @returns {Promise<void>}
   */
  async markTokenAsUsed(userId, tokenId) {
    if (!this.isFirestoreAvailable) {
      throw new Error('Firestore를 사용할 수 없습니다');
    }

    await this.db
      .collection('users')
      .doc(userId)
      .collection('tokens')
      .doc(tokenId)
      .update({
        used: true,
        usedAt: admin.firestore.FieldValue.serverTimestamp()
      });

    console.log(`✅ 토큰 무효화: ${userId} - ${tokenId}`);
  }

  /**
   * 만료된 토큰 정리
   * 
   * @param {string} userId - 사용자 ID (선택)
   * @returns {Promise<number>} 삭제된 토큰 수
   */
  async cleanupExpiredTokens(userId = null) {
    if (!this.isFirestoreAvailable) {
      return 0;
    }

    const now = admin.firestore.Timestamp.now();
    let query;

    if (userId) {
      query = this.db
        .collection('users')
        .doc(userId)
        .collection('tokens')
        .where('expiresAt', '<', now);
    } else {
      // 전체 사용자 (비효율적, 백그라운드 작업으로 실행 권장)
      console.warn('⚠️ 전체 사용자 토큰 정리는 비효율적입니다');
      return 0;
    }

    const snapshot = await query.get();
    const batch = this.db.batch();

    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    console.log(`🗑️ 만료된 토큰 ${snapshot.size}개 삭제`);
    return snapshot.size;
  }

  /**
   * 사용자의 모든 토큰 무효화
   * 
   * @param {string} userId - 사용자 ID
   * @param {string} type - 토큰 타입 (선택)
   * @returns {Promise<number>} 무효화된 토큰 수
   */
  async invalidateAllUserTokens(userId, type = null) {
    if (!this.isFirestoreAvailable) {
      return 0;
    }

    let query = this.db
      .collection('users')
      .doc(userId)
      .collection('tokens')
      .where('used', '==', false);

    if (type) {
      query = query.where('type', '==', type);
    }

    const snapshot = await query.get();
    const batch = this.db.batch();

    snapshot.docs.forEach(doc => {
      batch.update(doc.ref, {
        used: true,
        usedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });

    await batch.commit();

    console.log(`🔒 사용자 토큰 ${snapshot.size}개 무효화: ${userId}`);
    return snapshot.size;
  }

  isAvailable() {
    return this.isFirestoreAvailable;
  }
}

// Singleton 인스턴스
const tokenService = new TokenService();

module.exports = {
  tokenService,
  TOKEN_TYPES
};