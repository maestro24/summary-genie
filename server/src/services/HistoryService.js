/**
 * Firestore 기반 히스토리 영구 저장 서비스
 * 사용자의 요약/질문 히스토리를 관리합니다.
 * 
 * 데이터 구조:
 * /users/{userId}/history/{historyId}
 * {
 *   id: string,
 *   userId: string,
 *   title: string,
 *   url: string,
 *   summary: string,
 *   qaHistory: [{question, answer, timestamp}],
 *   metadata: {domain, language, wordCount, tags},
 *   createdAt: Timestamp,
 *   updatedAt: Timestamp,
 *   deletedAt: Timestamp | null
 * }
 * 
 * @module HistoryService
 */

const { getFirestore } = require('../config/firebase');
const admin = require('firebase-admin');
const { LIMITS } = require('../constants');

/**
 * 제목 최소 길이
 * @type {number}
 */
const TITLE_MIN_LENGTH = LIMITS.MIN_TITLE_LENGTH;

/**
 * 제목 최대 길이
 * @type {number}
 */
const TITLE_MAX_LENGTH = LIMITS.MAX_TITLE_LENGTH;

/**
 * 요약 최소 길이
 * @type {number}
 */
const SUMMARY_MIN_LENGTH = LIMITS.MIN_SUMMARY_LENGTH;

/**
 * 요약 최대 길이
 * @type {number}
 */
const SUMMARY_MAX_LENGTH = LIMITS.MAX_SUMMARY_LENGTH;

/**
 * 질문/답변 최소 길이
 * @type {number}
 */
const QA_MIN_LENGTH = LIMITS.MIN_QUESTION_LENGTH;

/**
 * 질문/답변 최대 길이
 * @type {number}
 */
const QA_MAX_LENGTH = LIMITS.MAX_QUESTION_LENGTH;

/**
 * 기본 페이지 크기
 * @type {number}
 */
const DEFAULT_PAGE_SIZE = 20;

/**
 * 최대 페이지 크기
 * @type {number}
 */
const MAX_PAGE_SIZE = 100;

/**
 * 커스텀 에러: 권한 없음
 */
class PermissionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PermissionError';
  }
}

/**
 * 커스텀 에러: 문서 없음
 */
class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
  }
}

/**
 * 커스텀 에러: 검증 실패
 */
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Firestore 기반 히스토리 관리 서비스 클래스
 * Singleton 패턴으로 구현
 */
class HistoryService {
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
    
    this._initializeFirestore();
  }
  
  /**
   * Firestore 초기화
   * @private
   * @async
   * @returns {Promise<void>}
   */
  async _initializeFirestore() {
    try {
      this.db = getFirestore();
      this.isFirestoreAvailable = true;
      console.log('✅ HistoryService: Firestore 초기화 완료');
    } catch (error) {
      console.error('⚠️ HistoryService: Firestore 초기화 실패:', error.message);
      this.isFirestoreAvailable = false;
    }
  }
  
  /**
   * 서비스 재초기화
   * Firebase가 초기화된 후 호출하여 Firestore 연결을 재시도
   * 
   * @async
   * @returns {Promise<void>}
   * 
   * @example
   * await historyService.initialize();
   */
  async initialize() {
    console.log('🔄 HistoryService 재초기화 시작...');
    await this._initializeFirestore();
  }
  
  /**
   * URL 유효성 검증
   * @private
   * @param {string} url - 검증할 URL
   * @returns {boolean} 유효성 여부
   */
  _isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * 도메인 추출
   * @private
   * @param {string} url - URL
   * @returns {string} 도메인
   */
  _extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return 'unknown';
    }
  }
  
  /**
   * 히스토리 데이터 유효성 검증
   * @private
   * @param {Object} historyData - 검증할 데이터
   * @throws {ValidationError} 검증 실패 시
   */
  _validateHistoryData(historyData) {
    // title 검증
    if (!historyData.title || typeof historyData.title !== 'string') {
      throw new ValidationError('제목은 필수입니다');
    }
    
    if (historyData.title.length < TITLE_MIN_LENGTH || historyData.title.length > TITLE_MAX_LENGTH) {
      throw new ValidationError(`제목은 ${TITLE_MIN_LENGTH}-${TITLE_MAX_LENGTH}자 사이여야 합니다`);
    }
    
    // url 검증
    if (!historyData.url || typeof historyData.url !== 'string') {
      throw new ValidationError('URL은 필수입니다');
    }
    
    if (!this._isValidUrl(historyData.url)) {
      throw new ValidationError('유효하지 않은 URL 형식입니다');
    }
    
    // summary 검증
    if (!historyData.summary || typeof historyData.summary !== 'string') {
      throw new ValidationError('요약은 필수입니다');
    }
    
    if (historyData.summary.length < SUMMARY_MIN_LENGTH || historyData.summary.length > SUMMARY_MAX_LENGTH) {
      throw new ValidationError(`요약은 ${SUMMARY_MIN_LENGTH}-${SUMMARY_MAX_LENGTH}자 사이여야 합니다`);
    }
  }
  
  /**
   * 질문/답변 유효성 검증
   * @private
   * @param {string} text - 검증할 텍스트
   * @param {string} fieldName - 필드 이름
   * @throws {ValidationError} 검증 실패 시
   */
  _validateQAText(text, fieldName) {
    if (!text || typeof text !== 'string') {
      throw new ValidationError(`${fieldName}은 필수입니다`);
    }
    
    if (text.length < QA_MIN_LENGTH || text.length > QA_MAX_LENGTH) {
      throw new ValidationError(`${fieldName}은 ${QA_MIN_LENGTH}-${QA_MAX_LENGTH}자 사이여야 합니다`);
    }
  }
  
  /**
   * 히스토리 저장
   * 
   * @async
   * @param {string} userId - 사용자 ID
   * @param {Object} historyData - 히스토리 데이터
   * @param {string} historyData.title - 제목
   * @param {string} historyData.url - URL
   * @param {string} historyData.summary - 요약
   * @param {Array<Object>} [historyData.qaHistory=[]] - 질문/답변 히스토리
   * @param {Object} [historyData.metadata={}] - 메타데이터
   * @returns {Promise<string>} 저장된 문서 ID
   * @throws {ValidationError} 유효성 검증 실패 시
   * @throws {Error} Firestore 오류 시
   * 
   * @example
   * const historyId = await historyService.saveHistory('user123', {
   *   title: '뉴스 기사 제목',
   *   url: 'https://example.com/article',
   *   summary: '기사 요약 내용...',
   *   metadata: {
   *     language: 'ko',
   *     wordCount: 1500,
   *     tags: ['tech', 'ai']
   *   }
   * });
   */
  async saveHistory(userId, historyData) {
    if (!userId) {
      throw new ValidationError('userId는 필수입니다');
    }
    
    if (!this.isFirestoreAvailable) {
      throw new Error('Firestore를 사용할 수 없습니다');
    }
    
    // 유효성 검증
    this._validateHistoryData(historyData);
    
    try {
      const historyRef = this.db
        .collection('users')
        .doc(userId)
        .collection('history')
        .doc(); // 자동 ID 생성
      
      const domain = this._extractDomain(historyData.url);
      
      const newHistory = {
        id: historyRef.id,
        userId: userId,
        title: historyData.title.trim(),
        url: historyData.url.trim(),
        summary: historyData.summary.trim(),
        qaHistory: historyData.qaHistory || [],
        metadata: {
          domain: domain,
          language: historyData.metadata?.language || 'unknown',
          wordCount: historyData.metadata?.wordCount || 0,
          tags: historyData.metadata?.tags || []
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        deletedAt: null
      };
      
      await historyRef.set(newHistory);
      
      console.log(`📚 히스토리 저장: ${userId} - ${historyRef.id}`);
      
      return historyRef.id;
      
    } catch (error) {
      console.error('❌ saveHistory 오류:', error.message);
      throw error;
    }
  }
  
  /**
   * 히스토리 목록 조회 (페이지네이션, 검색 지원)
   * 
   * @async
   * @param {string} userId - 사용자 ID
   * @param {Object} [options={}] - 조회 옵션
   * @param {number} [options.limit=20] - 페이지 크기 (1-100)
   * @param {string} [options.query] - 검색 쿼리 (제목, URL)
   * @param {Object} [options.startAfter] - 페이지네이션 커서
   * @returns {Promise<Object>} 히스토리 목록 및 페이지네이션 정보
   * @property {Array<Object>} items - 히스토리 목록
   * @property {Object|null} lastDoc - 다음 페이지를 위한 커서
   * @property {boolean} hasMore - 다음 페이지 존재 여부
   * 
   * @example
   * // 첫 페이지 조회
   * const result = await historyService.getHistory('user123', { limit: 20 });
   * 
   * // 다음 페이지 조회
   * const nextPage = await historyService.getHistory('user123', {
   *   limit: 20,
   *   startAfter: result.lastDoc
   * });
   * 
   * // 검색
   * const searchResult = await historyService.getHistory('user123', {
   *   query: 'AI',
   *   limit: 10
   * });
   */
  async getHistory(userId, options = {}) {
    if (!userId) {
      throw new ValidationError('userId는 필수입니다');
    }
    
    if (!this.isFirestoreAvailable) {
      throw new Error('Firestore를 사용할 수 없습니다');
    }
    
    try {
      const limit = Math.min(options.limit || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
      
      let query = this.db
        .collection('users')
        .doc(userId)
        .collection('history')
        .where('deletedAt', '==', null)
        .orderBy('createdAt', 'desc')
        .limit(limit + 1); // hasMore 확인용으로 1개 더 조회
      
      // 페이지네이션 커서
      if (options.startAfter) {
        query = query.startAfter(options.startAfter);
      }
      
      const snapshot = await query.get();
      
      // 검색 필터링 (클라이언트 사이드)
      let items = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          _doc: doc // 페이지네이션용
        };
      });
      
      // 검색 쿼리 적용
      if (options.query) {
        const searchQuery = options.query.toLowerCase();
        items = items.filter(item => 
          item.title.toLowerCase().includes(searchQuery) ||
          item.url.toLowerCase().includes(searchQuery)
        );
      }
      
      // hasMore 확인
      const hasMore = items.length > limit;
      if (hasMore) {
        items.pop(); // 추가로 조회한 1개 제거
      }
      
      // _doc 제거 및 lastDoc 추출
      const lastDoc = items.length > 0 ? items[items.length - 1]._doc : null;
      items = items.map(item => {
        const { _doc, ...rest } = item;
        return rest;
      });
      
      return {
        items,
        lastDoc,
        hasMore,
        total: items.length
      };
      
    } catch (error) {
      console.error('❌ getHistory 오류:', error.message);
      throw error;
    }
  }
  
  /**
   * 단일 히스토리 조회
   * 
   * @async
   * @param {string} userId - 사용자 ID
   * @param {string} historyId - 히스토리 ID
   * @returns {Promise<Object>} 히스토리 데이터
   * @throws {NotFoundError} 히스토리를 찾을 수 없는 경우
   * @throws {PermissionError} 권한이 없는 경우
   * 
   * @example
   * const history = await historyService.getHistoryById('user123', 'hist456');
   * console.log(history.title, history.summary);
   */
  async getHistoryById(userId, historyId) {
    if (!userId || !historyId) {
      throw new ValidationError('userId와 historyId는 필수입니다');
    }
    
    if (!this.isFirestoreAvailable) {
      throw new Error('Firestore를 사용할 수 없습니다');
    }
    
    try {
      const docRef = this.db
        .collection('users')
        .doc(userId)
        .collection('history')
        .doc(historyId);
      
      const doc = await docRef.get();
      
      if (!doc.exists) {
        throw new NotFoundError('히스토리를 찾을 수 없습니다');
      }
      
      const data = doc.data();
      
      // 권한 확인
      if (data.userId !== userId) {
        throw new PermissionError('이 히스토리에 접근할 권한이 없습니다');
      }
      
      // 삭제된 문서
      if (data.deletedAt) {
        throw new NotFoundError('삭제된 히스토리입니다');
      }
      
      return data;
      
    } catch (error) {
      console.error('❌ getHistoryById 오류:', error.message);
      throw error;
    }
  }
  
  /**
   * 질문/답변 추가
   * 
   * @async
   * @param {string} userId - 사용자 ID
   * @param {string} historyId - 히스토리 ID
   * @param {string} question - 질문
   * @param {string} answer - 답변
   * @returns {Promise<void>}
   * @throws {ValidationError} 유효성 검증 실패 시
   * @throws {NotFoundError} 히스토리를 찾을 수 없는 경우
   * 
   * @example
   * await historyService.addQA('user123', 'hist456', '주요 내용은?', '주요 내용은 ...');
   */
  async addQA(userId, historyId, question, answer) {
    if (!userId || !historyId) {
      throw new ValidationError('userId와 historyId는 필수입니다');
    }
    
    if (!this.isFirestoreAvailable) {
      throw new Error('Firestore를 사용할 수 없습니다');
    }
    
    // 유효성 검증
    this._validateQAText(question, '질문');
    this._validateQAText(answer, '답변');
    
    try {
      const docRef = this.db
        .collection('users')
        .doc(userId)
        .collection('history')
        .doc(historyId);
      
      // 문서 존재 여부 및 권한 확인
      const doc = await docRef.get();
      
      if (!doc.exists) {
        throw new NotFoundError('히스토리를 찾을 수 없습니다');
      }
      
      const data = doc.data();
      
      if (data.userId !== userId) {
        throw new PermissionError('이 히스토리에 접근할 권한이 없습니다');
      }
      
      if (data.deletedAt) {
        throw new NotFoundError('삭제된 히스토리입니다');
      }
      
      // QA 추가
      const newQA = {
        question: question.trim(),
        answer: answer.trim(),
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      };
      
      await docRef.update({
        qaHistory: admin.firestore.FieldValue.arrayUnion(newQA),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      console.log(`💬 QA 추가: ${userId} - ${historyId}`);
      
    } catch (error) {
      console.error('❌ addQA 오류:', error.message);
      throw error;
    }
  }
  
  /**
   * 히스토리 삭제
   * 
   * @async
   * @param {string} userId - 사용자 ID
   * @param {string} historyId - 히스토리 ID
   * @param {boolean} [hardDelete=false] - true면 완전 삭제, false면 soft delete
   * @returns {Promise<void>}
   * @throws {NotFoundError} 히스토리를 찾을 수 없는 경우
   * @throws {PermissionError} 권한이 없는 경우
   * 
   * @example
   * // Soft delete
   * await historyService.deleteHistory('user123', 'hist456');
   * 
   * // Hard delete
   * await historyService.deleteHistory('user123', 'hist456', true);
   */
  async deleteHistory(userId, historyId, hardDelete = false) {
    if (!userId || !historyId) {
      throw new ValidationError('userId와 historyId는 필수입니다');
    }
    
    if (!this.isFirestoreAvailable) {
      throw new Error('Firestore를 사용할 수 없습니다');
    }
    
    try {
      const docRef = this.db
        .collection('users')
        .doc(userId)
        .collection('history')
        .doc(historyId);
      
      // 문서 존재 여부 및 권한 확인
      const doc = await docRef.get();
      
      if (!doc.exists) {
        throw new NotFoundError('히스토리를 찾을 수 없습니다');
      }
      
      const data = doc.data();
      
      if (data.userId !== userId) {
        throw new PermissionError('이 히스토리에 접근할 권한이 없습니다');
      }
      
      if (hardDelete) {
        // Hard delete: 완전 삭제
        await docRef.delete();
        console.log(`🗑️ 히스토리 완전 삭제: ${userId} - ${historyId}`);
      } else {
        // Soft delete: deletedAt 설정
        await docRef.update({
          deletedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`🗑️ 히스토리 soft delete: ${userId} - ${historyId}`);
      }
      
    } catch (error) {
      console.error('❌ deleteHistory 오류:', error.message);
      throw error;
    }
  }
  
  /**
   * 사용자 히스토리 통계 조회
   * 
   * @async
   * @param {string} userId - 사용자 ID
   * @returns {Promise<Object>} 통계 정보
   * @property {number} totalCount - 이 히스토리 수
   * @property {Object} domainStats - 도메인별 통계
   * @property {Array<Object>} recentActivity - 최근 활동 (7일)
   * 
   * @example
   * const stats = await historyService.getStatistics('user123');
   * console.log('이 히스토리:', stats.totalCount);
   * console.log('도메인별:', stats.domainStats);
   */
  async getStatistics(userId) {
    if (!userId) {
      throw new ValidationError('userId는 필수입니다');
    }
    
    if (!this.isFirestoreAvailable) {
      throw new Error('Firestore를 사용할 수 없습니다');
    }
    
    try {
      // 모든 히스토리 조회 (삭제되지 않은 것만)
      const snapshot = await this.db
        .collection('users')
        .doc(userId)
        .collection('history')
        .where('deletedAt', '==', null)
        .get();
      
      const totalCount = snapshot.size;
      
      // 도메인별 통계
      const domainMap = new Map();
      const languageMap = new Map();
      const tagMap = new Map();
      
      // 최근 7일 활동
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      let recentCount = 0;
      
      snapshot.forEach(doc => {
        const data = doc.data();
        
        // 도메인 카운트
        const domain = data.metadata?.domain || 'unknown';
        domainMap.set(domain, (domainMap.get(domain) || 0) + 1);
        
        // 언어 카운트
        const language = data.metadata?.language || 'unknown';
        languageMap.set(language, (languageMap.get(language) || 0) + 1);
        
        // 태그 카운트
        const tags = data.metadata?.tags || [];
        tags.forEach(tag => {
          tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
        });
        
        // 최근 활동
        if (data.createdAt && data.createdAt.toDate() > sevenDaysAgo) {
          recentCount++;
        }
      });
      
      // Map을 배열로 변환 및 정렬
      const domainStats = Array.from(domainMap.entries())
        .map(([domain, count]) => ({ domain, count }))
        .sort((a, b) => b.count - a.count);
      
      const languageStats = Array.from(languageMap.entries())
        .map(([language, count]) => ({ language, count }))
        .sort((a, b) => b.count - a.count);
      
      const topTags = Array.from(tagMap.entries())
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10); // 상위 10개
      
      return {
        totalCount,
        domainStats: {
          total: domainMap.size,
          top10: domainStats.slice(0, 10)
        },
        languageStats: {
          total: languageMap.size,
          breakdown: languageStats
        },
        topTags,
        recentActivity: {
          last7Days: recentCount,
          percentage: totalCount > 0 ? Math.round((recentCount / totalCount) * 100) : 0
        }
      };
      
    } catch (error) {
      console.error('❌ getStatistics 오류:', error.message);
      throw error;
    }
  }
  
  /**
   * Firestore 사용 가능 여부 반환
   * @returns {boolean} Firestore 연결 상태
   */
  isAvailable() {
    return this.isFirestoreAvailable;
  }
}

// Singleton 인스턴스 생성 및 export
const historyService = new HistoryService();

module.exports = {
  historyService,
  PermissionError,
  NotFoundError,
  ValidationError
};