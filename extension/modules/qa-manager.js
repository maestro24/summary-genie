/**
 * SummaryGenie Q&A Manager (ErrorHandler 통합 + 메모리 최적화 버전)
 * 질문/답변 기능을 관리하는 모듈
 * 
 * @module qa-manager
 * @version 2.2.0
 * @requires historyManager - 히스토리 관리자 (전역)
 * @requires apiService - API 서비스 (전역)
 * @requires uiManager - UI 관리자 (전역)
 * @requires errorHandler - 에러 핸들러 (전역)
 */

/**
 * QAManager 클래스
 * 현재 세션의 Q&A 처리 및 히스토리 연동
 */
class QAManager {
  constructor() {
    this.currentHistoryId = null;
    this.currentQAHistory = [];
    this.maxSessionQA = 10;
    this.currentContext = '';
    this.historyRefs = new WeakMap();
    
    console.log('[QAManager] 초기화');
  }

  /**
   * Q&A 매니저 초기화
   * @param {string|null} historyId - 히스토리 ID
   * @param {string} context - 페이지 콘텍스트
   * @returns {Promise<void>}
   */
  async initialize(historyId = null, context = '') {
    try {
      if (historyId && typeof historyId !== 'string') {
        console.error('[QAManager] 유효하지 않은 히스토리 ID:', historyId);
        historyId = null;
      }
      
      if (typeof context !== 'string') {
        console.error('[QAManager] 유효하지 않은 콘텍스트');
        context = '';
      }
      
      this.currentHistoryId = historyId;
      this.currentContext = context;
      
      if (historyId) {
        this.currentQAHistory = await window.historyManager.getQAHistory(historyId);
      } else {
        this.currentQAHistory = [];
      }
      
      window.uiManager.updateQAHistory(this.currentQAHistory);
      
      console.log('[QAManager] 초기화 완료:', {
        historyId,
        qaCount: this.currentQAHistory.length
      });
      
    } catch (error) {
      window.errorHandler.handle(error, 'QAManager.initialize');
      this.currentQAHistory = [];
      window.uiManager.updateQAHistory(this.currentQAHistory);
    }
  }

  /**
   * 히스토리 ID 설정
   * @param {string} historyId - 히스토리 ID
   */
  setHistoryId(historyId) {
    try {
      if (!historyId || typeof historyId !== 'string') {
        throw new Error('유효하지 않은 히스토리 ID입니다');
      }
      
      this.currentHistoryId = historyId;
      console.log('[QAManager] 히스토리 ID 설정:', this.currentHistoryId);
      
    } catch (error) {
      window.errorHandler.handle(error, 'QAManager.setHistoryId');
    }
  }

  /**
   * 질문 처리
   * @param {string} question - 사용자 질문
   * @returns {Promise<string>} 답변
   */
  async processQuestion(question) {
    try {
      if (!question || typeof question !== 'string') {
        throw new Error('유효하지 않은 질문입니다');
      }
      
      const trimmedQuestion = question.trim();
      
      if (trimmedQuestion.length === 0) {
        throw new Error('질문을 입력해주세요');
      }
      
      if (trimmedQuestion.length > 2000) {
        throw new Error('질문이 너무 깁니다 (최대 2000자)');
      }

      if (!this.currentContext) {
        throw new Error('컨텍스트가 설정되지 않았습니다');
      }

      window.uiManager.showProcessingAnswer();
      
      const answer = await window.apiService.askQuestion(
        this.currentContext, 
        trimmedQuestion, 
        this.currentQAHistory
      );
      
      if (!answer || typeof answer !== 'string') {
        throw new Error('유효하지 않은 답변입니다');
      }
      
      if (answer.length > 10000) {
        throw new Error('답변이 너무 깁니다');
      }
      
      await this.addToSessionHistory(trimmedQuestion, answer);
      
      if (this.currentHistoryId) {
        await this.saveToHistory(trimmedQuestion, answer);
      }
      
      window.uiManager.displayAnswer(answer);
      window.uiManager.clearQuestionInput();
      
      return answer;
      
    } catch (error) {
      window.errorHandler.handle(error, 'QAManager.processQuestion');
      throw error;
      
    } finally {
      window.uiManager.endProcessingAnswer();
    }
  }

  /**
   * 세션 Q&A 히스토리에 추가
   * @private
   * @param {string} question - 질문
   * @param {string} answer - 답변
   */
  async addToSessionHistory(question, answer) {
    try {
      const qaItem = {
        question,
        answer,
        timestamp: Date.now()
      };
      
      this.currentQAHistory.push(qaItem);
      
      if (this.currentQAHistory.length > this.maxSessionQA) {
        this.currentQAHistory = this.currentQAHistory.slice(-this.maxSessionQA);
      }
      
      window.uiManager.updateQAHistory(this.currentQAHistory);
      
    } catch (error) {
      window.errorHandler.handle(error, 'QAManager.addToSessionHistory');
    }
  }

  /**
   * 히스토리에 Q&A 저장
   * @private
   * @param {string} question - 질문
   * @param {string} answer - 답변
   * @returns {Promise<void>}
   */
  async saveToHistory(question, answer) {
    if (!this.currentHistoryId) {
      return;
    }
    
    try {
      await window.historyManager.addQA(this.currentHistoryId, question, answer);
      console.log('[QAManager] Q&A 히스토리에 저장 완료');
      
    } catch (error) {
      window.errorHandler.handle(error, 'QAManager.saveToHistory');
    }
  }

  /**
   * 현재 세션 Q&A 히스토리 초기화
   * @param {boolean} clearFromHistory - 히스토리에서도 삭제할지 여부
   * @returns {Promise<void>}
   */
  async clearCurrentSession(clearFromHistory = false) {
    try {
      if (clearFromHistory && this.currentHistoryId) {
        const confirmed = confirm('히스토리에 저장된 질문/답변도 삭제하시겠습니까?');
        
        if (confirmed) {
          try {
            await window.historyManager.clearQAHistory(this.currentHistoryId);
            window.uiManager.showToast('질문/답변 기록이 삭제되었습니다');
          } catch (error) {
            throw error;
          }
        }
      }
      
      this.currentQAHistory = [];
      window.uiManager.updateQAHistory(this.currentQAHistory);
      
    } catch (error) {
      window.errorHandler.handle(error, 'QAManager.clearCurrentSession');
      window.uiManager.showError('기록 삭제에 실패했습니다');
    }
  }

  /**
   * 새 페이지로 리셋
   * @param {string} context - 새로운 콘텍스트
   */
  resetForNewPage(context = '') {
    try {
      if (typeof context !== 'string') {
        console.error('[QAManager] 유효하지 않은 콘텍스트');
        context = '';
      }
      
      this.currentContext = context;
      this.currentHistoryId = null;
      this.currentQAHistory = [];
      
      window.uiManager.updateQAHistory(this.currentQAHistory);
      
      console.log('[QAManager] 리셋 (새 페이지)');
      
    } catch (error) {
      window.errorHandler.handle(error, 'QAManager.resetForNewPage');
    }
  }

  /**
   * 콘텍스트 업데이트
   * @param {string} context - 새로운 콘텍스트
   */
  updateContext(context) {
    try {
      if (typeof context !== 'string') {
        throw new Error('유효하지 않은 콘텍스트입니다');
      }
      
      this.currentContext = context;
      
    } catch (error) {
      window.errorHandler.handle(error, 'QAManager.updateContext');
    }
  }

  /**
   * 현재 Q&A 히스토리 반환
   * @returns {Array} Q&A 히스토리
   */
  getCurrentQAHistory() {
    return this.currentQAHistory;
  }

  /**
   * 특정 히스토리의 Q&A 로드
   * @param {string} historyId - 히스토리 ID
   * @returns {Promise<Array>} Q&A 히스토리
   */
  async loadHistoryQA(historyId) {
    try {
      if (!historyId || typeof historyId !== 'string') {
        throw new Error('유효하지 않은 히스토리 ID입니다');
      }
      
      const qaHistory = await window.historyManager.getQAHistory(historyId);
      return qaHistory;
      
    } catch (error) {
      window.errorHandler.handle(error, 'QAManager.loadHistoryQA');
      return [];
    }
  }

  /**
   * 현재 상태 정보
   * @returns {Object} 상태 정보
   */
  getState() {
    return {
      historyId: this.currentHistoryId,
      qaCount: this.currentQAHistory.length,
      hasContext: !!this.currentContext,
      contextLength: this.currentContext.length
    };
  }

  /**
   * QAManager 정리 (메모리 누수 방지)
   */
  cleanup() {
    console.log('[QAManager] 정리 시작');
    
    if (this.currentQAHistory && this.currentQAHistory.length > 0) {
      this.currentQAHistory = [];
    }
    
    this.currentContext = '';
    this.currentHistoryId = null;
    this.historyRefs = new WeakMap();
    
    try {
      window.uiManager.updateQAHistory([]);
    } catch (error) {
      console.warn('[QAManager] UI 업데이트 실패:', error);
    }
    
    console.log('[QAManager] 정리 완료');
  }

  /**
   * 메모리 사용량 추정
   * @returns {Object} 메모리 사용량 정보
   */
  estimateMemoryUsage() {
    const qaHistorySize = JSON.stringify(this.currentQAHistory).length;
    const contextSize = this.currentContext.length;
    
    return {
      qaHistorySize: `${(qaHistorySize / 1024).toFixed(2)} KB`,
      contextSize: `${(contextSize / 1024).toFixed(2)} KB`,
      totalSize: `${((qaHistorySize + contextSize) / 1024).toFixed(2)} KB`,
      qaCount: this.currentQAHistory.length
    };
  }
}

// 전역 인스턴스 생성
window.qaManager = new QAManager();