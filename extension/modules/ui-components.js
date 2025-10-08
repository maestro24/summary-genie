/**
 * SummaryGenie UI Components (보안 강화 버전)
 * 재사용 가능한 UI 컴포넌트 라이브러리
 * - innerHTML 완전 제거
 * - XSS 방어 강화
 * 
 * @version 3.0.0
 * @requires security.js (전역 - window.createSafeElement, window.sanitizeHtml)
 */

/**
 * Toast 알림 클래스
 * 일시적인 알림 메시지를 표시
 */
class Toast {
  constructor() {
    this.container = null;
    this.queue = [];
    this.isShowing = false;
    this.currentTimeout = null;
    this.initialize();
  }

  initialize() {
    if (this.container) return;

    this.container = window.createSafeElement('div', {
      id: 'toast-container',
      class: 'toast-container',
      role: 'alert',
      'aria-live': 'polite',
      'aria-atomic': 'true'
    });
    
    this.injectStyles();
    document.body.appendChild(this.container);
  }

  injectStyles() {
    if (document.getElementById('toast-styles')) return;

    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = `
      .toast-container {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        pointer-events: none;
      }

      .toast {
        min-width: 250px;
        max-width: 400px;
        padding: 12px 16px;
        margin-bottom: 10px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 14px;
        font-weight: 500;
        pointer-events: auto;
        opacity: 0;
        transform: translateX(100%);
        transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
      }

      .toast.show {
        opacity: 1;
        transform: translateX(0);
      }

      .toast.hide {
        opacity: 0;
        transform: translateX(100%);
      }

      .toast-icon {
        flex-shrink: 0;
        font-size: 20px;
      }

      .toast-message {
        flex: 1;
        word-wrap: break-word;
      }

      .toast-close {
        flex-shrink: 0;
        background: none;
        border: none;
        font-size: 18px;
        cursor: pointer;
        padding: 0;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0.7;
        transition: opacity 0.2s;
      }

      .toast-close:hover {
        opacity: 1;
      }

      .toast.success {
        background: #4CAF50;
        color: white;
      }

      .toast.error {
        background: #f44336;
        color: white;
      }

      .toast.warning {
        background: #ff9800;
        color: white;
      }

      .toast.info {
        background: #2196F3;
        color: white;
      }

      .dark-theme .toast {
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      }
    `;
    
    document.head.appendChild(style);
  }

  show(message, type = 'info', duration = 3000) {
    this.queue.push({ message, type, duration });
    
    if (!this.isShowing) {
      this.showNext();
    }
  }

  showNext() {
    if (this.queue.length === 0) {
      this.isShowing = false;
      return;
    }

    this.isShowing = true;
    const { message, type, duration } = this.queue.shift();

    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };

    const toast = window.createSafeElement('div', {
      class: `toast ${type}`,
      role: 'alert'
    });

    const icon = window.createSafeElement('span', {
      class: 'toast-icon'
    }, icons[type]);

    const messageSpan = window.createSafeElement('span', {
      class: 'toast-message'
    }, message);

    const closeBtn = window.createSafeElement('button', {
      class: 'toast-close',
      'aria-label': 'Close',
      title: 'Close'
    }, '×');

    closeBtn.addEventListener('click', () => this.closeToast(toast));

    toast.appendChild(icon);
    toast.appendChild(messageSpan);
    toast.appendChild(closeBtn);

    this.container.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);

    if (duration > 0) {
      this.currentTimeout = setTimeout(() => {
        this.closeToast(toast);
      }, duration);
    }
  }

  closeToast(toast) {
    if (this.currentTimeout) {
      clearTimeout(this.currentTimeout);
      this.currentTimeout = null;
    }

    toast.classList.remove('show');
    toast.classList.add('hide');

    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
      this.showNext();
    }, 300);
  }

  clearAll() {
    if (this.currentTimeout) {
      clearTimeout(this.currentTimeout);
      this.currentTimeout = null;
    }
    this.queue = [];
    if (this.container) {
      this.container.innerHTML = '';
    }
    this.isShowing = false;
  }

  destroy() {
    this.clearAll();
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.container = null;
  }
}

/**
 * Modal 다이얼로그 클래스
 */
class Modal {
  constructor() {
    this.modals = new Map();
    this.injectStyles();
  }

  injectStyles() {
    if (document.getElementById('modal-styles')) return;

    const style = document.createElement('style');
    style.id = 'modal-styles';
    style.textContent = `
      .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        opacity: 0;
        transition: opacity 0.3s;
        backdrop-filter: blur(2px);
      }

      .modal-overlay.show {
        opacity: 1;
      }

      .modal-container {
        background: white;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        max-width: 90%;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        transform: scale(0.9);
        transition: transform 0.3s;
      }

      .modal-overlay.show .modal-container {
        transform: scale(1);
      }

      .modal-header {
        padding: 20px 24px;
        border-bottom: 1px solid #e0e0e0;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .modal-title {
        font-size: 18px;
        font-weight: 600;
        color: #212121;
        margin: 0;
      }

      .modal-close {
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: #757575;
        padding: 0;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: background 0.2s;
      }

      .modal-close:hover {
        background: #f5f5f5;
      }

      .modal-body {
        padding: 24px;
        overflow-y: auto;
        flex: 1;
      }

      .modal-footer {
        padding: 16px 24px;
        border-top: 1px solid #e0e0e0;
        display: flex;
        gap: 12px;
        justify-content: flex-end;
      }

      .dark-theme .modal-container {
        background: #2d2d2d;
        color: #e0e0e0;
      }

      .dark-theme .modal-title {
        color: #e0e0e0;
      }

      .dark-theme .modal-header,
      .dark-theme .modal-footer {
        border-color: #424242;
      }

      .dark-theme .modal-close {
        color: #9e9e9e;
      }

      .dark-theme .modal-close:hover {
        background: #424242;
      }
    `;
    
    document.head.appendChild(style);
  }

  open(id, title, content, options = {}) {
    const defaultOptions = {
      closeOnBackdrop: true,
      closeOnEsc: true,
      showCloseButton: true,
      footer: null,
      width: '600px',
      onClose: null
    };

    const opts = { ...defaultOptions, ...options };

    if (this.modals.has(id)) {
      this.close(id);
    }

    const overlay = window.createSafeElement('div', {
      class: 'modal-overlay',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': `modal-title-${id}`
    });

    const container = window.createSafeElement('div', {
      class: 'modal-container'
    });
    container.style.width = opts.width;

    const header = window.createSafeElement('div', {
      class: 'modal-header'
    });

    const titleElement = window.createSafeElement('h2', {
      class: 'modal-title',
      id: `modal-title-${id}`
    }, title);

    header.appendChild(titleElement);

    if (opts.showCloseButton) {
      const closeBtn = window.createSafeElement('button', {
        class: 'modal-close',
        'aria-label': 'Close'
      }, '×');
      header.appendChild(closeBtn);
    }

    const body = window.createSafeElement('div', {
      class: 'modal-body'
    });
    
    if (typeof content === 'string') {
      body.innerHTML = window.sanitizeHtml(content);
    } else if (content instanceof HTMLElement) {
      body.appendChild(content);
    }

    let footer = null;
    if (opts.footer) {
      footer = window.createSafeElement('div', {
        class: 'modal-footer'
      });
      if (typeof opts.footer === 'string') {
        footer.innerHTML = window.sanitizeHtml(opts.footer);
      } else if (opts.footer instanceof HTMLElement) {
        footer.appendChild(opts.footer);
      }
    }

    container.appendChild(header);
    container.appendChild(body);
    if (footer) {
      container.appendChild(footer);
    }
    overlay.appendChild(container);

    const closeHandler = () => {
      this.close(id);
      if (opts.onClose) opts.onClose();
    };

    if (opts.showCloseButton) {
      const closeBtn = header.querySelector('.modal-close');
      closeBtn.addEventListener('click', closeHandler);
    }

    if (opts.closeOnBackdrop) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          closeHandler();
        }
      });
    }

    if (opts.closeOnEsc) {
      const escHandler = (e) => {
        if (e.key === 'Escape') {
          closeHandler();
        }
      };
      document.addEventListener('keydown', escHandler);
      
      this.modals.set(id, { overlay, escHandler, closeHandler });
    } else {
      this.modals.set(id, { overlay, escHandler: null, closeHandler });
    }

    document.body.appendChild(overlay);
    this.trapFocus(container);

    setTimeout(() => overlay.classList.add('show'), 10);
  }

  close(id) {
    const modal = this.modals.get(id);
    if (!modal) return;

    const { overlay, escHandler } = modal;

    if (escHandler) {
      document.removeEventListener('keydown', escHandler);
    }

    overlay.classList.remove('show');

    setTimeout(() => {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
      this.modals.delete(id);
    }, 300);
  }

  closeAll() {
    this.modals.forEach((modal, id) => {
      this.close(id);
    });
  }

  trapFocus(container) {
    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    firstElement.focus();

    container.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    });
  }

  destroy() {
    this.closeAll();
  }
}

/**
 * Loading Spinner 클래스
 */
class LoadingSpinner {
  constructor() {
    this.spinners = new Map();
    this.injectStyles();
  }

  injectStyles() {
    if (document.getElementById('spinner-styles')) return;

    const style = document.createElement('style');
    style.id = 'spinner-styles';
    style.textContent = `
      .loading-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(255, 255, 255, 0.9);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        opacity: 0;
        transition: opacity 0.2s;
      }

      .loading-overlay.show {
        opacity: 1;
      }

      .spinner {
        width: 40px;
        height: 40px;
        border: 4px solid #e0e0e0;
        border-top-color: #2196F3;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }

      .spinner-with-text {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
      }

      .spinner-text {
        font-size: 14px;
        color: #757575;
        font-weight: 500;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      .dark-theme .loading-overlay {
        background: rgba(45, 45, 45, 0.9);
      }

      .dark-theme .spinner {
        border-color: #424242;
        border-top-color: #2196F3;
      }

      .dark-theme .spinner-text {
        color: #9e9e9e;
      }
    `;
    
    document.head.appendChild(style);
  }

  show(target, message = '') {
    const element = typeof target === 'string' 
      ? document.querySelector(target) 
      : target;

    if (!element) {
      console.error('[LoadingSpinner] Target element not found');
      return;
    }

    if (this.spinners.has(element)) {
      this.hide(element);
    }

    const overlay = window.createSafeElement('div', {
      class: 'loading-overlay',
      role: 'status',
      'aria-live': 'polite',
      'aria-busy': 'true'
    });

    const content = window.createSafeElement('div');
    
    if (message) {
      content.className = 'spinner-with-text';
      
      const spinner = window.createSafeElement('div', {
        class: 'spinner',
        'aria-hidden': 'true'
      });
      
      const text = window.createSafeElement('div', {
        class: 'spinner-text'
      }, message);
      
      content.appendChild(spinner);
      content.appendChild(text);
      
      overlay.setAttribute('aria-label', message);
    } else {
      content.className = 'spinner';
      content.setAttribute('aria-hidden', 'true');
      overlay.setAttribute('aria-label', 'Loading');
    }

    overlay.appendChild(content);

    const position = window.getComputedStyle(element).position;
    if (position === 'static') {
      element.style.position = 'relative';
    }

    element.appendChild(overlay);
    this.spinners.set(element, overlay);

    setTimeout(() => overlay.classList.add('show'), 10);
  }

  hide(target) {
    const element = typeof target === 'string' 
      ? document.querySelector(target) 
      : target;

    if (!element) return;

    const overlay = this.spinners.get(element);
    if (!overlay) return;

    overlay.classList.remove('show');

    setTimeout(() => {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
      this.spinners.delete(element);
    }, 200);
  }

  hideAll() {
    this.spinners.forEach((overlay, element) => {
      this.hide(element);
    });
  }

  destroy() {
    this.hideAll();
  }
}

/**
 * Confirm Dialog 클래스
 */
class ConfirmDialog {
  constructor() {
    this.modal = new Modal();
  }

  show(message, options = {}) {
    return new Promise((resolve) => {
      const defaultOptions = {
        title: 'Confirm',
        confirmText: 'OK',
        cancelText: 'Cancel',
        confirmClass: '',
        type: 'info'
      };

      const opts = { ...defaultOptions, ...options };

      const typeStyles = {
        info: 'background: #2196F3; color: white;',
        warning: 'background: #ff9800; color: white;',
        danger: 'background: #f44336; color: white;'
      };

      const confirmStyle = typeStyles[opts.type] || typeStyles.info;

      const footer = window.createSafeElement('div');
      footer.style.display = 'flex';
      footer.style.gap = '12px';
      
      const cancelBtn = window.createSafeElement('button', {
        id: 'confirm-cancel'
      }, opts.cancelText);
      cancelBtn.style.cssText = `
        padding: 8px 16px;
        border: 1px solid #e0e0e0;
        background: white;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
      `;
      
      const okBtn = window.createSafeElement('button', {
        id: 'confirm-ok'
      }, opts.confirmText);
      okBtn.style.cssText = `
        padding: 8px 16px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        ${confirmStyle}
      `;
      
      footer.appendChild(cancelBtn);
      footer.appendChild(okBtn);

      const body = window.createSafeElement('div');
      body.style.padding = '8px 0';
      const p = window.createSafeElement('p', {
        style: 'margin: 0; line-height: 1.6;'
      }, message);
      body.appendChild(p);

      this.modal.open('confirm-dialog', opts.title, body, {
        footer: footer,
        width: '400px',
        closeOnBackdrop: false,
        closeOnEsc: false,
        showCloseButton: false,
        onClose: () => resolve(false)
      });

      okBtn.addEventListener('click', () => {
        this.modal.close('confirm-dialog');
        resolve(true);
      });

      cancelBtn.addEventListener('click', () => {
        this.modal.close('confirm-dialog');
        resolve(false);
      });

      setTimeout(() => cancelBtn.focus(), 100);
    });
  }
}

/**
 * UI Components 싱글톤
 */
window.UIComponents = {
  toast: new Toast(),
  modal: new Modal(),
  spinner: new LoadingSpinner(),
  confirm: new ConfirmDialog(),
  
  destroyAll() {
    this.toast.destroy();
    this.modal.destroy();
    this.spinner.destroy();
  }
};