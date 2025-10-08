/**
 * SummaryGenie User Database Module (Firebase Firestore Version)
 * Firebase Firestore를 사용한 사용자 및 구독 정보 관리
 */

const admin = require('firebase-admin');
const jwt = require('jsonwebtoken');

class UserDatabase {
  constructor() {
    this.db = null;
    this.auth = null;
    this.initialized = false;
    
    // Firestore 컬렉션 참조
    this.usersCollection = null;
    this.subscriptionsCollection = null;
    this.usageHistoryCollection = null;
  }
  
  /**
   * Firebase 초기화 및 데이터베이스 연결
   */
async connect() {
  try {
    if (this.initialized) {
      console.log('✅ Firebase already initialized');
      return;
    }
    
    // Firebase Admin 초기화 - 파일 직접 읽기
    const path = require('path');
    const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
    
    // serviceAccountKey.json 파일 확인
    const fs = require('fs');
    if (!fs.existsSync(serviceAccountPath)) {
      console.error('❌ serviceAccountKey.json 파일을 찾을 수 없습니다.');
      console.log('Firebase Console에서 서비스 계정 키를 다운로드하여');
      console.log('server/serviceAccountKey.json으로 저장하세요.');
      throw new Error('Firebase 서비스 계정 키 파일 없음');
    }
    
    // 파일 직접 읽기
    const serviceAccount = require(serviceAccountPath);
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL || `https://${serviceAccount.project_id}.firebaseio.com`
    });
    
    this.db = admin.firestore();
    this.auth = admin.auth();
    
    // 컬렉션 참조 초기화
    this.usersCollection = this.db.collection('users');
    this.subscriptionsCollection = this.db.collection('subscriptions');
    this.usageHistoryCollection = this.db.collection('usageHistory');
    
    // Firestore 설정
    this.db.settings({
      timestampsInSnapshots: true,
      ignoreUndefinedProperties: true
    });
    
    this.initialized = true;
    console.log('✅ Firebase Firestore 연결 성공');
    
    // 복합 인덱스 정보 출력 (수동으로 Firebase Console에서 생성 필요)
    this.logRequiredIndexes();
    
  } catch (error) {
    console.error('❌ Firebase 연결 실패:', error);
    throw error;
  }
}
  
  /**
   * 필요한 복합 인덱스 로깅 (Firebase Console에서 생성 필요)
   */
  logRequiredIndexes() {
    console.log('📋 Required Firestore Composite Indexes:');
    console.log('1. users: extensionId (ASC), createdAt (DESC)');
    console.log('2. subscriptions: userId (ASC), status (ASC)');
    console.log('3. usageHistory: userId (ASC), date (DESC), type (ASC)');
    console.log('Please create these indexes in Firebase Console');
  }
  
  /**
   * 사용자 생성
   * @param {string} email - 사용자 이메일
   * @param {string} password - 비밀번호 (Firebase Auth 사용)
   * @param {string} extensionId - 크롬 확장프로그램 ID
   * @param {object} metadata - 추가 메타데이터
   */
  async createUser(email, password, extensionId, metadata = {}) {
    const batch = this.db.batch();
    
    try {
      let firebaseUser = null;
      let uid = null;
      
      // Firebase Auth 사용자 생성
      if (email && password) {
        try {
          firebaseUser = await this.auth.createUser({
            email,
            password,
            emailVerified: false
          });
          uid = firebaseUser.uid;
        } catch (authError) {
          if (authError.code === 'auth/email-already-exists') {
            // 이미 존재하는 사용자 - uid 가져오기
            firebaseUser = await this.auth.getUserByEmail(email);
            uid = firebaseUser.uid;
          } else {
            throw authError;
          }
        }
      } else {
        // 이메일/비밀번호 없이 익명 사용자 생성
        uid = this.db.collection('users').doc().id; // 랜덤 ID 생성
      }
      
      // Firestore에 사용자 문서 생성
      const userRef = this.usersCollection.doc(uid);
      const userData = {
        uid,
        email: email || `${extensionId}@summarygenie.temp`,
        extensionId,
        stripeCustomerId: null,
        plan: 'free',
        role: 'user',
        metadata: metadata || {},
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastLogin: null,
        isActive: true,
        emailVerified: false
      };
      
      batch.set(userRef, userData);
      
      // 기본 구독 정보 생성
      const subscriptionRef = this.subscriptionsCollection.doc(uid);
      const subscriptionData = {
        userId: uid,
        plan: 'free',
        status: 'active',
        stripeSubscriptionId: null,
        stripeCustomerId: null,
        currentPeriodStart: admin.firestore.FieldValue.serverTimestamp(),
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        trialEnd: null,
        limits: this.getPlanLimits('free'),
        usage: {
          summaries: 0,
          questions: 0,
          lastReset: admin.firestore.FieldValue.serverTimestamp()
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      
      batch.set(subscriptionRef, subscriptionData);
      
      // 배치 커밋
      await batch.commit();
      
      // 생성된 사용자 반환
      return this.sanitizeUser({
        _id: uid,
        ...userData,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
    } catch (error) {
      if (error.code === 'auth/email-already-exists') {
        throw new Error('이미 등록된 이메일입니다');
      }
      console.error('사용자 생성 실패:', error);
      throw error;
    }
  }
  
  /**
   * 사용자 조회 (이메일)
   */
  async getUserByEmail(email) {
    try {
      const snapshot = await this.usersCollection
        .where('email', '==', email)
        .limit(1)
        .get();
      
      if (snapshot.empty) {
        return null;
      }
      
      const doc = snapshot.docs[0];
      return this.sanitizeUser({
        _id: doc.id,
        ...doc.data()
      });
    } catch (error) {
      console.error('사용자 조회 실패:', error);
      return null;
    }
  }
  
  /**
   * 사용자 조회 (ID)
   */
  async getUserById(userId) {
    try {
      const doc = await this.usersCollection.doc(userId).get();
      
      if (!doc.exists) {
        return null;
      }
      
      return this.sanitizeUser({
        _id: doc.id,
        ...doc.data()
      });
    } catch (error) {
      console.error('사용자 조회 실패:', error);
      return null;
    }
  }
  
  /**
   * 사용자 조회 (Extension ID)
   */
  async getUserByExtensionId(extensionId) {
    try {
      const snapshot = await this.usersCollection
        .where('extensionId', '==', extensionId)
        .limit(1)
        .get();
      
      if (snapshot.empty) {
        return null;
      }
      
      const doc = snapshot.docs[0];
      return this.sanitizeUser({
        _id: doc.id,
        ...doc.data()
      });
    } catch (error) {
      console.error('사용자 조회 실패:', error);
      return null;
    }
  }
  
  /**
   * 사용자 조회 (Stripe Customer ID)
   */
  async getUserByStripeCustomerId(stripeCustomerId) {
    try {
      const snapshot = await this.usersCollection
        .where('stripeCustomerId', '==', stripeCustomerId)
        .limit(1)
        .get();
      
      if (snapshot.empty) {
        return null;
      }
      
      const doc = snapshot.docs[0];
      return this.sanitizeUser({
        _id: doc.id,
        ...doc.data()
      });
    } catch (error) {
      console.error('사용자 조회 실패:', error);
      return null;
    }
  }
  
  /**
   * 사용자 정보 업데이트
   */
  async updateUser(userId, updates) {
    try {
      const allowedUpdates = [
        'email', 'plan', 'stripeCustomerId', 
        'metadata', 'lastLogin', 'emailVerified'
      ];
      
      const filteredUpdates = {};
      for (const key of allowedUpdates) {
        if (updates[key] !== undefined) {
          filteredUpdates[key] = updates[key];
        }
      }
      
      filteredUpdates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
      
      await this.usersCollection.doc(userId).update(filteredUpdates);
      
      // 업데이트된 사용자 반환
      return await this.getUserById(userId);
      
    } catch (error) {
      console.error('사용자 업데이트 실패:', error);
      throw error;
    }
  }
  
  /**
   * 비밀번호 변경 (Firebase Auth 사용)
   */
  async updatePassword(userId, newPassword) {
    try {
      await this.auth.updateUser(userId, {
        password: newPassword
      });
      
      // 업데이트 시간 기록
      await this.updateUser(userId, {
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
    } catch (error) {
      console.error('비밀번호 변경 실패:', error);
      throw error;
    }
  }
  
  /**
   * 로그인 검증 (Firebase Auth 사용)
   * 참고: 실제 로그인은 클라이언트에서 Firebase SDK로 처리
   * 여기서는 서버 사이드 검증용
   */
  async verifyLogin(email, idToken) {
    try {
      // ID 토큰 검증
      const decodedToken = await this.auth.verifyIdToken(idToken);
      
      if (decodedToken.email !== email) {
        return null;
      }
      
      // 사용자 정보 가져오기
      const user = await this.getUserById(decodedToken.uid);
      
      if (!user) {
        return null;
      }
      
      // 마지막 로그인 시간 업데이트
      await this.updateUser(user._id, {
        lastLogin: admin.firestore.FieldValue.serverTimestamp()
      });
      
      return user;
      
    } catch (error) {
      console.error('로그인 검증 실패:', error);
      return null;
    }
  }
  
  /**
   * JWT 토큰 생성 (커스텀 토큰)
   */
  generateToken(user) {
    return jwt.sign(
      {
        userId: user._id,
        email: user.email,
        plan: user.plan
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '30d' }
    );
  }
  
  /**
   * JWT 토큰 검증
   */
  verifyToken(token) {
    try {
      return jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    } catch (error) {
      return null;
    }
  }
  
  /**
   * 구독 정보 조회
   */
  async getSubscription(userId) {
    try {
      const doc = await this.subscriptionsCollection.doc(userId).get();
      
      if (!doc.exists) {
        return null;
      }
      
      return doc.data();
    } catch (error) {
      console.error('구독 정보 조회 실패:', error);
      return null;
    }
  }
  
  /**
   * 구독 정보 업데이트 (트랜잭션 사용)
   */
  async updateSubscription(userId, subscriptionData) {
    try {
      return await this.db.runTransaction(async (transaction) => {
        const subscriptionRef = this.subscriptionsCollection.doc(userId);
        const userRef = this.usersCollection.doc(userId);
        
        const subscriptionDoc = await transaction.get(subscriptionRef);
        
        const updates = {
          ...subscriptionData,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        
        // 플랜별 한도 설정
        if (subscriptionData.plan) {
          updates.limits = this.getPlanLimits(subscriptionData.plan);
        }
        
        if (!subscriptionDoc.exists) {
          // 구독 정보가 없으면 생성
          transaction.set(subscriptionRef, {
            userId,
            ...updates,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
        } else {
          // 구독 정보 업데이트
          transaction.update(subscriptionRef, updates);
        }
        
        // 사용자 플랜도 업데이트
        if (subscriptionData.plan) {
          transaction.update(userRef, {
            plan: subscriptionData.plan,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
        
        return { ...subscriptionDoc.data(), ...updates };
      });
      
    } catch (error) {
      console.error('구독 정보 업데이트 실패:', error);
      throw error;
    }
  }
  
  /**
   * 플랜별 한도 가져오기
   */
  getPlanLimits(plan) {
    const limits = {
      free: {
        dailySummaries: 5,
        monthlyQuestions: 50,
        pdfSupport: false,
        historyDays: 7,
        teamMembers: 0,
        apiCalls: 100
      },
      pro: {
        dailySummaries: -1, // 무제한
        monthlyQuestions: -1,
        pdfSupport: true,
        historyDays: 90,
        teamMembers: 0,
        apiCalls: 10000
      },
      team: {
        dailySummaries: -1,
        monthlyQuestions: -1,
        pdfSupport: true,
        historyDays: 365,
        teamMembers: 5,
        apiCalls: 50000
      },
      enterprise: {
        dailySummaries: -1,
        monthlyQuestions: -1,
        pdfSupport: true,
        historyDays: -1, // 무제한
        teamMembers: -1,
        apiCalls: -1
      }
    };
    
    return limits[plan] || limits.free;
  }
  
  /**
   * 사용량 기록
   */
  async recordUsage(userId, type, metadata = {}) {
    try {
      const today = new Date().toDateString();
      const batch = this.db.batch();
      
      // 사용 기록 추가
      const usageRef = this.usageHistoryCollection.doc();
      batch.set(usageRef, {
        userId,
        type, // 'summary', 'question', 'api', 'pdf'
        date: today,
        metadata: metadata || {},
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // 구독 정보의 사용량 업데이트
      const subscriptionRef = this.subscriptionsCollection.doc(userId);
      const updateField = type === 'summary' ? 'usage.summaries' : 'usage.questions';
      
      batch.update(subscriptionRef, {
        [updateField]: admin.firestore.FieldValue.increment(1),
        'usage.lastActivity': admin.firestore.FieldValue.serverTimestamp()
      });
      
      await batch.commit();
      
      // 30일 이상 된 사용 기록 자동 삭제 (Cloud Functions로 구현 권장)
      this.cleanOldUsageHistory(userId);
      
    } catch (error) {
      console.error('사용량 기록 실패:', error);
      throw error;
    }
  }
  
  /**
   * 오래된 사용 기록 삭제 (비동기 실행)
   */
  async cleanOldUsageHistory(userId) {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const snapshot = await this.usageHistoryCollection
        .where('userId', '==', userId)
        .where('createdAt', '<', thirtyDaysAgo)
        .get();
      
      if (!snapshot.empty) {
        const batch = this.db.batch();
        snapshot.docs.forEach(doc => {
          batch.delete(doc.ref);
        });
        await batch.commit();
      }
    } catch (error) {
      // 삭제 실패해도 메인 프로세스에는 영향 없음
      console.log('오래된 사용 기록 삭제 실패:', error);
    }
  }
  
  /**
   * 사용량 확인 (제한 체크)
   */
  async checkUsageLimit(userId, type) {
    try {
      const subscription = await this.getSubscription(userId);
      
      if (!subscription) {
        return { 
          allowed: false, 
          reason: 'No subscription found',
          current: 0,
          limit: 0
        };
      }
      
      // 무제한 체크
      if (subscription.limits.dailySummaries === -1) {
        return { 
          allowed: true,
          current: 0,
          limit: -1
        };
      }
      
      // 오늘 사용량 계산
      const today = new Date().toDateString();
      const snapshot = await this.usageHistoryCollection
        .where('userId', '==', userId)
        .where('type', '==', type)
        .where('date', '==', today)
        .get();
      
      const todayUsage = snapshot.size;
      
      const limit = type === 'summary' 
        ? subscription.limits.dailySummaries 
        : subscription.limits.monthlyQuestions;
      
      if (todayUsage >= limit) {
        return { 
          allowed: false, 
          reason: 'Daily limit exceeded',
          current: todayUsage,
          limit: limit,
          remaining: 0
        };
      }
      
      return { 
        allowed: true,
        current: todayUsage,
        limit: limit,
        remaining: limit - todayUsage
      };
      
    } catch (error) {
      console.error('사용량 확인 실패:', error);
      return {
        allowed: false,
        reason: 'Error checking usage limit'
      };
    }
  }
  
  /**
   * 사용량 통계
   */
  async getUsageStats(userId, days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const snapshot = await this.usageHistoryCollection
        .where('userId', '==', userId)
        .where('createdAt', '>=', startDate)
        .orderBy('createdAt', 'desc')
        .get();
      
      // 날짜와 타입별로 그룹화
      const stats = {};
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const key = `${data.date}_${data.type}`;
        
        if (!stats[key]) {
          stats[key] = {
            _id: {
              date: data.date,
              type: data.type
            },
            count: 0
          };
        }
        stats[key].count++;
      });
      
      return Object.values(stats);
      
    } catch (error) {
      console.error('사용량 통계 조회 실패:', error);
      return [];
    }
  }
  
  /**
   * 팀 멤버 관리
   */
  async addTeamMember(ownerId, memberEmail) {
    try {
      const owner = await this.getUserById(ownerId);
      const subscription = await this.getSubscription(ownerId);
      
      if (!subscription || subscription.plan !== 'team') {
        throw new Error('Team subscription required');
      }
      
      // 팀 멤버 수 체크
      const snapshot = await this.usersCollection
        .where('metadata.teamOwnerId', '==', ownerId)
        .get();
      
      const currentMembers = snapshot.size;
      
      if (currentMembers >= subscription.limits.teamMembers) {
        throw new Error('Team member limit reached');
      }
      
      // 멤버 추가 또는 생성
      let member = await this.getUserByEmail(memberEmail);
      
      if (member) {
        // 기존 사용자를 팀에 추가
        await this.updateUser(member._id, {
          plan: 'team_member',
          metadata: {
            ...member.metadata,
            teamOwnerId: ownerId
          }
        });
      } else {
        // 새 사용자 생성
        member = await this.createUser(memberEmail, null, null, {
          teamOwnerId: ownerId
        });
        
        await this.updateUser(member._id, { plan: 'team_member' });
      }
      
      return member;
      
    } catch (error) {
      console.error('팀 멤버 추가 실패:', error);
      throw error;
    }
  }
  
  /**
   * 팀 멤버 제거
   */
  async removeTeamMember(ownerId, memberId) {
    try {
      const member = await this.getUserById(memberId);
      
      if (!member || member.metadata?.teamOwnerId !== ownerId) {
        throw new Error('Team member not found');
      }
      
      await this.updateUser(memberId, {
        plan: 'free',
        metadata: {
          ...member.metadata,
          teamOwnerId: null
        }
      });
      
    } catch (error) {
      console.error('팀 멤버 제거 실패:', error);
      throw error;
    }
  }
  
  /**
   * 실시간 구독 상태 리스너 (선택사항)
   * 클라이언트에서 구독 상태 변경을 실시간으로 감지
   */
  subscribeToUserChanges(userId, callback) {
    const unsubscribe = this.usersCollection.doc(userId)
      .onSnapshot((doc) => {
        if (doc.exists) {
          const userData = {
            _id: doc.id,
            ...doc.data()
          };
          callback(this.sanitizeUser(userData));
        }
      }, (error) => {
        console.error('실시간 구독 에러:', error);
      });
    
    return unsubscribe;
  }
  
  /**
   * 실시간 구독 정보 리스너
   */
  subscribeToSubscriptionChanges(userId, callback) {
    const unsubscribe = this.subscriptionsCollection.doc(userId)
      .onSnapshot((doc) => {
        if (doc.exists) {
          callback(doc.data());
        }
      }, (error) => {
        console.error('실시간 구독 에러:', error);
      });
    
    return unsubscribe;
  }
  
  /**
   * 사용자 정보 정리 (민감 정보 제거)
   */
  sanitizeUser(user) {
    if (!user) return null;
    
    // password 필드 제거 (Firebase Auth 사용으로 불필요)
    const { password, ...sanitized } = user;
    
    // Firestore Timestamp를 Date 객체로 변환
    if (sanitized.createdAt && sanitized.createdAt.toDate) {
      sanitized.createdAt = sanitized.createdAt.toDate();
    }
    if (sanitized.updatedAt && sanitized.updatedAt.toDate) {
      sanitized.updatedAt = sanitized.updatedAt.toDate();
    }
    if (sanitized.lastLogin && sanitized.lastLogin.toDate) {
      sanitized.lastLogin = sanitized.lastLogin.toDate();
    }
    
    return sanitized;
  }
  
  /**
   * 배치 작업을 위한 헬퍼 메서드
   * 여러 사용자의 정보를 한 번에 가져오기
   */
  async getUsersByIds(userIds) {
    try {
      if (!userIds || userIds.length === 0) {
        return [];
      }
      
      // Firestore는 'in' 쿼리에 10개 제한이 있음
      const chunks = [];
      for (let i = 0; i < userIds.length; i += 10) {
        chunks.push(userIds.slice(i, i + 10));
      }
      
      const users = [];
      for (const chunk of chunks) {
        const snapshot = await this.usersCollection
          .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
          .get();
        
        snapshot.docs.forEach(doc => {
          users.push(this.sanitizeUser({
            _id: doc.id,
            ...doc.data()
          }));
        });
      }
      
      return users;
      
    } catch (error) {
      console.error('배치 사용자 조회 실패:', error);
      return [];
    }
  }
  
  /**
   * 데이터베이스 연결 해제
   * Firebase Admin SDK는 명시적 연결 해제 불필요
   */
  async disconnect() {
    try {
      // Firestore 리스너 정리 (있는 경우)
      // 실제로는 각 리스너의 unsubscribe 함수를 호출해야 함
      
      console.log('Firebase Firestore 정리 완료');
      this.initialized = false;
    } catch (error) {
      console.error('Firebase 정리 실패:', error);
    }
  }
  
  /**
   * 테스트용 데이터 초기화 메서드
   * 주의: 프로덕션에서는 사용하지 마세요!
   */
  async clearTestData(confirmDelete = false) {
    if (process.env.NODE_ENV !== 'test' || !confirmDelete) {
      throw new Error('Test data can only be cleared in test environment');
    }
    
    try {
      // 배치 삭제 (최대 500개씩)
      const collections = [
        this.usersCollection,
        this.subscriptionsCollection,
        this.usageHistoryCollection
      ];
      
      for (const collection of collections) {
        const snapshot = await collection.limit(500).get();
        
        if (!snapshot.empty) {
          const batch = this.db.batch();
          snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
          });
          await batch.commit();
        }
      }
      
      console.log('테스트 데이터 초기화 완료');
    } catch (error) {
      console.error('테스트 데이터 초기화 실패:', error);
      throw error;
    }
  }
}

module.exports = new UserDatabase();