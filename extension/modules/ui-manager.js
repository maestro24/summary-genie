/**
 * SummaryGenie UI Manager (ErrorHandler 통합 버전)
 * UI 상태 관리 및 DOM 조작을 담당하는 모듈
 * 
 * @module ui-manager
 * @version 4.2.0
 * @requires utils.js (전역 - window.formatRelativeTime)
 * @requires language-manager.js (전역 - window.languageManager)
 * @requires security.js (전역 - window.createSafeElement, window.sanitizeHtml)
 * @requires error-handler.js (전역 - window.errorHandler)
 */

/**
 * UI Manager 클래스
 * 모든 UI 관련 작업을 처리
 */
class UIManager {
  constructor() {
    this.elements = this.initializeElements();
  }

  /**
   * DOM 요소 초기화
   */
  initializeElements() {
    try {
      return {
        pageTitle: document.getElementById('pageTitle'),
        pageUrl: document.getElementById('pageUrl'),
        summarizeBtn: document.getElementById('summarizeBtn'),
        loadingIndicator: document.getElementById('loadingIndicator'),
        summaryResult: document.getElementById('summaryResult'),
        summaryText: document.getElementById('summaryText'),
        copyBtn: document.getElementById('copyBtn'),
        questionSection: document.getElementById('questionSection'),
        questionInput: document.getElementById('questionInput'),
        askBtn: document.getElementById('askBtn'),
        answerResult: document.getElementById('answerResult'),
        qaHistory: document.getElementById('qaHistory'),
        qaHistoryList: document.getElementById('qaHistoryList'),
        clearQABtn: document.getElementById('clearQABtn'),
        settingsBtn: document.getElementById('settingsBtn'),
        usageText: document.getElementById('usageText'),
        toast: document.getElementById('toast')
      };
    } catch (error) {
      window.errorHandler.handle(error, 'UIManager.initializeElements');
      return {};
    }
  }

  /**
   * 페이지 정보 표시
   */
  displayPageInfo(pageInfo) {
    try {
      if (this.elements.pageTitle) {
        this.elements.pageTitle.textContent = pageInfo.title || '';
      }
      if (this.elements.pageUrl) {
        this.elements.pageUrl.textContent = pageInfo.domain || '';
      }
    } catch (error) {
      window.errorHandler.handle(error, 'UIManager.displayPageInfo');
    }
  }

  /**
   * 로딩 상태 표시
   */
  showLoading(show) {
    try {
      if (show) {
        this.elements.loadingIndicator?.classList.remove('hidden');
        if (this.elements.summarizeBtn) {
          this.elements.summarizeBtn.disabled = true;
        }
      } else {
        this.elements.loadingIndicator?.classList.add('hidden');
        if (this.elements.summarizeBtn) {
          this.elements.summarizeBtn.disabled = false;
        }
      }
    } catch (error) {
      window.errorHandler.handle(error, 'UIManager.showLoading');
    }
  }

  /**
   * 요약 결과 표시
   */
  displaySummary(summary) {
    try {
      if (this.elements.summaryText) {
        this.elements.summaryText.textContent = summary || '';
      }
      this.elements.summaryResult?.classList.remove('hidden');
      this.elements.questionSection?.classList.remove('hidden');
    } catch (error) {
      window.errorHandler.handle(error, 'UIManager.displaySummary');
    }
  }

  /**
   * 답변 표시
   */
  displayAnswer(answer) {
    try {
      if (this.elements.answerResult) {
        this.elements.answerResult.textContent = answer || '';
      }
      this.elements.answerResult?.classList.remove('hidden');
    } catch (error) {
      window.errorHandler.handle(error, 'UIManager.displayAnswer');
    }
  }

  /**
   * Q&A 히스토리 UI 업데이트
   */
  updateQAHistory(qaHistory) {
    try {
      if (!this.elements.qaHistoryList) return;
      
      if (!qaHistory || qaHistory.length === 0) {
        this.elements.qaHistory?.classList.add('hidden');
        return;
      }
      
      this.elements.qaHistory?.classList.remove('hidden');
      
      while (this.elements.qaHistoryList.firstChild) {
        this.elements.qaHistoryList.removeChild(this.elements.qaHistoryList.firstChild);
      }
      
      const reversedHistory = [...qaHistory].reverse();
      
      reversedHistory.forEach(item => {
        const qaItem = window.createSafeElement('div', { class: 'qa-item' });
        
        const qaQuestion = window.createSafeElement('div', { class: 'qa-question' });
        const questionIcon = window.createSafeElement('span', { class: 'material-icons' }, 'contact_support');
        qaQuestion.appendChild(questionIcon);
        const questionText = window.createSafeElement('span', { class: 'qa-question-text' }, item.question);
        qaQuestion.appendChild(questionText);
        qaItem.appendChild(qaQuestion);
        
        const qaAnswer = window.createSafeElement('div', { class: 'qa-answer' });
        const answerText = window.createSafeElement('span', { class: 'qa-answer-text' }, item.answer);
        qaAnswer.appendChild(answerText);
        qaItem.appendChild(qaAnswer);
        
        this.elements.qaHistoryList.appendChild(qaItem);
      });
    } catch (error) {
      window.errorHandler.handle(error, 'UIManager.updateQAHistory');
    }
  }

  /**
   * 사용량 표시 업데이트
   */
  updateUsageDisplay(daily, limit) {
    try {
      if (!this.elements.usageText) return;
      
      const usageMessage = window.languageManager.getMessage('usageToday', {
        COUNT: daily,
        LIMIT: limit
      });
      
      this.elements.usageText.textContent = usageMessage;
      
      if (daily >= limit && this.elements.summarizeBtn) {
        this.elements.summarizeBtn.disabled = true;
        const buttonText = this.elements.summarizeBtn.querySelector('span:last-child');
        if (buttonText) {
          buttonText.textContent = window.languageManager.getMessage('dailyLimitExceeded');
        }
      }
    } catch (error) {
      window.errorHandler.handle(error, 'UIManager.updateUsageDisplay');
    }
  }

  /**
   * 직접 토스트 표시 (fallback)
   * @private
   */
  _showToastDirect(message, type = 'info', duration = 3000) {
    try {
      const toast = this.elements.toast || document.getElementById('toast');
      if (!toast) {
        console.warn('[UIManager] 토스트 엘리먼트를 찾을 수 없습니다');
        return;
      }

      toast.textContent = message;
      toast.className = 'toast'; // 기존 클래스 초기화
      toast.classList.add(type);
      toast.classList.remove('hidden');

      setTimeout(() => {
        toast.classList.add('hidden');
        toast.className = 'toast hidden';
      }, duration);
    } catch (error) {
      console.error('[UIManager] 토스트 표시 실패:', error);
    }
  }

  /**
   * 토스트 메시지 표시
   */
  showToast(message, type = 'info', duration = 3000) {
    try {
      // UIComponents가 있으면 사용
      if (typeof window.UIComponents !== 'undefined' && window.UIComponents.toast) {
        window.UIComponents.toast.show(message, type, duration);
      } else {
        // 없으면 직접 표시
        this._showToastDirect(message, type, duration);
      }
    } catch (error) {
      console.error('[UIManager] showToast 실패:', error);
      // 최후의 수단
      this._showToastDirect(message, type, duration);
    }
  }

  /**
   * 에러 표시
   */
  showError(message) {
    try {
      this.showToast(message, 'error', 3000);
    } catch (error) {
      console.error('[UIManager] showError 실패:', error);
      this._showToastDirect(message, 'error', 3000);
    }
  }

  /**
   * 성공 메시지 표시
   */
  showSuccess(message) {
    try {
      this.showToast(message, 'success', 3000);
    } catch (error) {
      console.error('[UIManager] showSuccess 실패:', error);
      this._showToastDirect(message, 'success', 3000);
    }
  }

  /**
   * 경고 메시지 표시
   */
  showWarning(message) {
    try {
      this.showToast(message, 'warning', 3000);
    } catch (error) {
      console.error('[UIManager] showWarning 실패:', error);
      this._showToastDirect(message, 'warning', 3000);
    }
  }

  /**
   * 테마 적용
   */
  applyTheme(theme) {
    try {
      document.body.classList.remove('dark-theme', 'auto-theme');
      
      if (theme === 'dark') {
        document.body.classList.add('dark-theme');
      } else if (theme === 'auto') {
        document.body.classList.add('auto-theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
        if (prefersDark.matches) {
          document.body.classList.add('dark-theme');
        }
        
        prefersDark.addEventListener('change', (e) => {
          if (e.matches) {
            document.body.classList.add('dark-theme');
          } else {
            document.body.classList.remove('dark-theme');
          }
        });
      }
    } catch (error) {
      window.errorHandler.handle(error, 'UIManager.applyTheme');
    }
  }

  /**
   * API 모드 UI 업데이트
   */
  updateApiModeUI(mode) {
    try {
      const proxyUrlItem = document.getElementById('proxyUrlItem');
      const apiKeyItem = document.getElementById('apiKeyItem');
      
      if (proxyUrlItem && apiKeyItem) {
        if (mode === 'proxy') {
          proxyUrlItem.style.display = 'block';
          apiKeyItem.style.display = 'none';
        } else {
          proxyUrlItem.style.display = 'none';
          apiKeyItem.style.display = 'block';
        }
      }
    } catch (error) {
      window.errorHandler.handle(error, 'UIManager.updateApiModeUI');
    }
  }

  /**
   * 설정 모달 표시
   */
  showSettingsModal(content) {
    try {
      if (typeof window.UIComponents !== 'undefined' && window.UIComponents.modal) {
        const title = window.languageManager.getMessage('settings');
        window.UIComponents.modal.open('settings', title, content, {
          width: '500px',
          closeOnBackdrop: true,
          closeOnEsc: true
        });
      }
    } catch (error) {
      window.errorHandler.handle(error, 'UIManager.showSettingsModal');
    }
  }

  /**
   * 설정 모달 숨기기
   */
  hideSettingsModal() {
    try {
      if (typeof window.UIComponents !== 'undefined' && window.UIComponents.modal) {
        window.UIComponents.modal.close('settings');
      }
    } catch (error) {
      window.errorHandler.handle(error, 'UIManager.hideSettingsModal');
    }
  }

  /**
   * 질문 입력 초기화
   */
  clearQuestionInput() {
    try {
      if (this.elements.questionInput) {
        this.elements.questionInput.value = '';
      }
    } catch (error) {
      window.errorHandler.handle(error, 'UIManager.clearQuestionInput');
    }
  }

  /**
   * 요약/질문 섹션 초기화
   */
  resetSections() {
    try {
      this.elements.summaryResult?.classList.add('hidden');
      this.elements.questionSection?.classList.add('hidden');
      this.elements.answerResult?.classList.add('hidden');
    } catch (error) {
      window.errorHandler.handle(error, 'UIManager.resetSections');
    }
  }

  /**
   * 버튼 비활성화 상태
   */
  disablePage() {
    try {
      if (this.elements.summarizeBtn) {
        this.elements.summarizeBtn.disabled = true;
      }
      if (this.elements.pageTitle) {
        this.elements.pageTitle.textContent = window.languageManager.getMessage('errorRestrictedPage');
      }
    } catch (error) {
      window.errorHandler.handle(error, 'UIManager.disablePage');
    }
  }

  /**
   * 복사 버튼 애니메이션
   */
  animateCopyButton() {
    try {
      if (!this.elements.copyBtn) return;
      
      const icon = this.elements.copyBtn.querySelector('.material-icons');
      if (icon) {
        icon.textContent = 'done';
        setTimeout(() => {
          icon.textContent = 'content_copy';
        }, 2000);
      }
    } catch (error) {
      window.errorHandler.handle(error, 'UIManager.animateCopyButton');
    }
  }

  /**
   * 요청 중 상태 표시
   */
  showProcessingAnswer() {
    try {
      if (this.elements.askBtn) {
        this.elements.askBtn.disabled = true;
      }
      if (this.elements.answerResult) {
        const message = window.languageManager.getMessage('generatingAnswer');
        this.elements.answerResult.textContent = message;
        this.elements.answerResult.classList.remove('hidden');
      }
    } catch (error) {
      window.errorHandler.handle(error, 'UIManager.showProcessingAnswer');
    }
  }

  /**
   * 요청 완료 상태
   */
  endProcessingAnswer() {
    try {
      if (this.elements.askBtn) {
        this.elements.askBtn.disabled = false;
      }
    } catch (error) {
      window.errorHandler.handle(error, 'UIManager.endProcessingAnswer');
    }
  }

  /**
   * 로딩 스피너 표시
   */
  showSpinner(target, messageKey) {
    try {
      if (typeof window.UIComponents !== 'undefined' && window.UIComponents.spinner) {
        const message = messageKey ? window.languageManager.getMessage(messageKey) : '';
        window.UIComponents.spinner.show(target, message);
      }
    } catch (error) {
      window.errorHandler.handle(error, 'UIManager.showSpinner');
    }
  }

  /**
   * 로딩 스피너 숨기기
   */
  hideSpinner(target) {
    try {
      if (typeof window.UIComponents !== 'undefined' && window.UIComponents.spinner) {
        window.UIComponents.spinner.hide(target);
      }
    } catch (error) {
      window.errorHandler.handle(error, 'UIManager.hideSpinner');
    }
  }

  /**
   * 확인 다이얼로그 표시
   * @returns {Promise<boolean>}
   */
  async showConfirm(messageKey, options = {}) {
    try {
      if (typeof window.UIComponents !== 'undefined' && window.UIComponents.confirm) {
        const message = window.languageManager.getMessage(messageKey);
        
        const translatedOptions = {
          ...options,
          title: options.title ? window.languageManager.getMessage(options.title) : window.languageManager.getMessage('confirmReset'),
          confirmText: options.confirmText ? window.languageManager.getMessage(options.confirmText) : 'OK',
          cancelText: options.cancelText ? window.languageManager.getMessage(options.cancelText) : 'Cancel'
        };
        
        return await window.UIComponents.confirm.show(message, translatedOptions);
      }
      
      // UIComponents가 없으면 기본 confirm 사용
      const message = window.languageManager.getMessage(messageKey);
      return confirm(message);
      
    } catch (error) {
      window.errorHandler.handle(error, 'UIManager.showConfirm');
      return false;
    }
  }

  /**
   * DOM 요소 가져오기
   */
  getElement(elementName) {
    return this.elements[elementName];
  }

  /**
   * 모든 UI 컴포넌트 정리
   */
  destroy() {
    try {
      if (typeof window.UIComponents !== 'undefined') {
        window.UIComponents.destroyAll();
      }
    } catch (error) {
      window.errorHandler.handle(error, 'UIManager.destroy');
    }
  }
}

// 전역 인스턴스 생성
window.uiManager = new UIManager();