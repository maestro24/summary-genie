/**
 * SummaryGenie 옵션 페이지 스크립트 (웹 개선 버전)
 * UI 표시 및 사용자 인터랙션 담당
 * 
 * 전역 방식: 모든 모듈은 window 객체에 이미 노출되어 있습니다.
 */

// 전역 객체 사용 확인 (디버깅용)
(function() {
  const requiredGlobals = [
    'languageManager',
    'UIComponents', 
    'storageManager',
    'settingsManager',
    'historyManager',
    'errorHandler',
    'createSafeElement',
    'validateInput',
    'formatRelativeTime',
    'formatDate'
  ];
  
  const missing = requiredGlobals.filter(name => !window[name]);
  
  if (missing.length > 0) {
    console.error('[Options] 누락된 전역 객체:', missing);
  } else {
    console.log('[Options] 모든 전역 객체 로드 완료');
  }
})();

const elements = {
  languageSelect: document.getElementById('languageSelect'),
  themeSelect: document.getElementById('themeSelect'),
  viewHistoryBtn: document.getElementById('viewHistoryBtn'),
  exportHistoryBtn: document.getElementById('exportHistoryBtn'),
  importHistoryBtn: document.getElementById('importHistoryBtn'),
  clearHistoryBtn: document.getElementById('clearHistoryBtn'),
  importFile: document.getElementById('importFile'),
  subscribeBtn: document.getElementById('subscribeBtn'),
  historyModal: document.getElementById('historyModal'),
  closeHistoryBtn: document.getElementById('closeHistoryBtn'),
  searchHistory: document.getElementById('searchHistory'),
  filterPeriod: document.getElementById('filterPeriod'),
  historyList: document.getElementById('historyList'),
  historyDetailModal: document.getElementById('historyDetailModal'),
  closeDetailBtn: document.getElementById('closeDetailBtn'),
  detailTitle: document.getElementById('detailTitle'),
  detailUrl: document.getElementById('detailUrl'),
  detailTime: document.getElementById('detailTime'),
  detailSummary: document.getElementById('detailSummary'),
  detailQASection: document.getElementById('detailQASection'),
  detailQAList: document.getElementById('detailQAList'),
  openPageBtn: document.getElementById('openPageBtn'),
  version: document.getElementById('version'),
  privacyLink: document.getElementById('privacyLink'),
  termsLink: document.getElementById('termsLink'),
  resetBtn: document.getElementById('resetBtn'),
  saveBtn: document.getElementById('saveBtn'),
  messageBox: document.getElementById('message-box')
};

let appState = {
  currentHistoryPage: 0,
  historyPageSize: 50
};

/**
 * 메시지 표시 함수 (Toast 대체)
 * @param {string} message - 표시할 메시지
 * @param {string} type - 메시지 타입 ('success', 'error', 'info')
 */
function showMessage(message, type = 'success') {
  const messageBox = elements.messageBox;
  messageBox.textContent = message;
  
  // 기존 클래스 제거
  messageBox.classList.remove('show', 'success', 'error', 'info');
  
  // 새 클래스 추가
  messageBox.classList.add('show', type);
  
  // 3초 후 메시지 숨기기
  setTimeout(() => {
    messageBox.classList.remove('show');
  }, 3000);
}

async function initialize() {
  try {
    await window.languageManager.initialize();
    await window.settingsManager.initialize();
    await window.historyManager.initialize();
    
    updateUIFromSettings();
    
    const manifest = chrome.runtime.getManifest();
    elements.version.textContent = manifest.version;
    
    updateSelectOptions();
    setupEventListeners();
    
    window.settingsManager.onSettingsChange((newSettings, oldSettings) => {
      console.log('[Settings] 설정 변경 감지');
      
      if (oldSettings.language !== newSettings.language) {
        window.languageManager.changeLanguage(newSettings.language).then(() => {
          updateSelectOptions();
        });
      }
    });
    
    console.log('[Options] 초기화 완료');
  } catch (error) {
    console.error('[Options] 초기화 오류:', error);
    window.errorHandler.handle(error, 'options-initialization');
    showMessage(window.languageManager.getMessage('toastError'), 'error');
  }
}

function updateUIFromSettings() {
  const settings = window.settingsManager.getSettings();
  
  elements.languageSelect.value = settings.language;
  elements.themeSelect.value = settings.theme;
}

function collectAndValidateSettings() {
  const languageValidation = window.validateInput(elements.languageSelect.value, {
    type: 'string',
    required: true,
    allowedValues: ['ko', 'en', 'ja', 'zh']
  });
  
  if (!languageValidation.valid) {
    throw new Error(`언어 설정: ${languageValidation.error}`);
  }
  
  const themeValidation = window.validateInput(elements.themeSelect.value, {
    type: 'string',
    required: true,
    allowedValues: ['light', 'dark', 'auto']
  });
  
  if (!themeValidation.valid) {
    throw new Error(`테마 설정: ${themeValidation.error}`);
  }
  
  return {
    language: languageValidation.sanitized,
    theme: themeValidation.sanitized
  };
}

async function saveSettings() {
  try {
    const previousLanguage = window.settingsManager.getSetting('language');
    const newSettings = collectAndValidateSettings();
    
    console.log('[Options] 설정 저장 중...');
    
    await window.settingsManager.saveSettings(newSettings);
    
    if (previousLanguage !== newSettings.language) {
      await window.languageManager.changeLanguage(newSettings.language);
      updateSelectOptions();
    }
    
    showMessage(window.languageManager.getMessage('toastSettingsSaved'), 'success');
    
  } catch (error) {
    console.error('[Options] 설정 저장 오류:', error);
    window.errorHandler.handle(error, 'save-settings');
    showMessage(error.message || window.languageManager.getMessage('toastError'), 'error');
  }
}

async function resetSettings() {
  const confirmed = await window.UIComponents.confirm.show(
    window.languageManager.getMessage('confirmReset'),
    {
      title: window.languageManager.getMessage('confirm') || 'Confirm',
      confirmText: window.languageManager.getMessage('reset') || 'Reset',
      cancelText: window.languageManager.getMessage('cancel') || 'Cancel',
      type: 'warning'
    }
  );
  
  if (!confirmed) return;
  
  try {
    await window.settingsManager.resetSettings();
    updateUIFromSettings();
    
    const newLanguage = window.settingsManager.getSetting('language');
    if (newLanguage !== window.languageManager.getCurrentLanguage()) {
      await window.languageManager.changeLanguage(newLanguage);
      updateSelectOptions();
    }
    
    showMessage(window.languageManager.getMessage('toastResetComplete'), 'success');
  } catch (error) {
    console.error('[Options] 설정 초기화 오류:', error);
    window.errorHandler.handle(error, 'reset-settings');
    showMessage(window.languageManager.getMessage('toastError'), 'error');
  }
}

async function displayHistory(filter = 'all', searchTerm = '') {
  try {
    const result = await window.historyManager.getHistory({
      query: searchTerm,
      filter: filter,
      sort: searchTerm ? 'relevance' : 'date',
      limit: appState.historyPageSize,
      offset: appState.currentHistoryPage * appState.historyPageSize
    });
    
    while (elements.historyList.firstChild) {
      elements.historyList.removeChild(elements.historyList.firstChild);
    }
    
    if (result.items.length === 0) {
      const noHistoryMessage = window.languageManager.getMessage('noHistory');
      const noHistoryDiv = window.createSafeElement('div', {
        style: 'text-align: center; color: var(--text-disabled); padding: 40px;'
      });
      
      const icon = window.createSafeElement('span', {
        class: 'material-icons',
        style: 'font-size: 48px; color: var(--border-color);'
      }, 'history');
      
      const text = window.createSafeElement('p', {
        style: 'margin-top: 16px;'
      }, noHistoryMessage);
      
      noHistoryDiv.appendChild(icon);
      noHistoryDiv.appendChild(text);
      elements.historyList.appendChild(noHistoryDiv);
      return;
    }
    
    const timeMessages = {
      justNow: window.languageManager.getMessage('justNow') || '방금 전',
      minutesAgo: (n) => window.languageManager.getMessage('minutesAgo', [n]) || `${n}분 전`,
      hoursAgo: (n) => window.languageManager.getMessage('hoursAgo', [n]) || `${n}시간 전`,
      daysAgo: (n) => window.languageManager.getMessage('daysAgo', [n]) || `${n}일 전`
    };
    
    result.items.forEach(item => {
      const historyItem = window.createSafeElement('div', { class: 'history-item' });
      
      const header = window.createSafeElement('div', { class: 'history-item-header' });
      const title = window.createSafeElement('div', { class: 'history-item-title' }, item.title);
      const date = window.createSafeElement('div', { class: 'history-item-date' },
        window.formatRelativeTime(item.timestamp, window.languageManager.getCurrentLanguage(), timeMessages)
      );
      
      header.appendChild(title);
      header.appendChild(date);
      
      const url = window.createSafeElement('div', { class: 'history-item-url' }, item.url);
      const summary = window.createSafeElement('div', { class: 'history-item-summary' }, item.summary);
      
      historyItem.appendChild(header);
      historyItem.appendChild(url);
      historyItem.appendChild(summary);
      
      historyItem.addEventListener('click', () => {
        viewHistoryDetail(item.id);
      });
      
      elements.historyList.appendChild(historyItem);
    });
    
  } catch (error) {
    console.error('[Options] 히스토리 표시 오류:', error);
    window.errorHandler.handle(error, 'display-history');
    showMessage(window.languageManager.getMessage('toastError'), 'error');
  }
}

async function viewHistoryDetail(historyId) {
  try {
    const item = await window.historyManager.getHistoryById(historyId);
    
    if (!item) {
      showMessage('히스토리를 찾을 수 없습니다', 'error');
      return;
    }
    
    elements.detailTitle.textContent = item.title || window.languageManager.getMessage('noTitle') || '제목 없음';
    elements.detailUrl.textContent = item.url;
    elements.detailTime.textContent = window.formatDate(
      item.timestamp,
      {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      },
      window.languageManager.getCurrentLanguage()
    );
    elements.detailSummary.textContent = item.summary;
    
    while (elements.detailQAList.firstChild) {
      elements.detailQAList.removeChild(elements.detailQAList.firstChild);
    }
    
    if (item.qaHistory && item.qaHistory.length > 0) {
      elements.detailQASection.classList.remove('hidden');
      
      item.qaHistory.forEach(qa => {
        const qaItem = window.createSafeElement('div', { class: 'detail-qa-item' });
        const question = window.createSafeElement('div', { class: 'detail-qa-question' }, `Q: ${qa.question}`);
        const answer = window.createSafeElement('div', { class: 'detail-qa-answer' }, `A: ${qa.answer}`);
        
        qaItem.appendChild(question);
        qaItem.appendChild(answer);
        elements.detailQAList.appendChild(qaItem);
      });
    } else {
      elements.detailQASection.classList.add('hidden');
    }
    
    elements.openPageBtn.onclick = () => {
      chrome.tabs.create({ url: item.url });
    };
    
    elements.historyDetailModal.classList.remove('hidden');
    
  } catch (error) {
    console.error('[Options] 히스토리 상세보기 오류:', error);
    window.errorHandler.handle(error, 'view-history-detail');
    showMessage(window.languageManager.getMessage('toastError'), 'error');
  }
}

async function exportHistory() {
  try {
    const stats = await window.historyManager.getStatistics();
    
    if (stats.total === 0) {
      showMessage(window.languageManager.getMessage('noHistoryExport'), 'error');
      return;
    }
    
    const jsonData = await window.historyManager.exportHistory('json', {
      includeQA: true
    });
    
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `summarygenie-history-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    const message = window.languageManager.getMessage('historyExported', [stats.total]) ||
                    `${stats.total}개의 히스토리를 내보냈습니다`;
    showMessage(message, 'success');
    
  } catch (error) {
    console.error('[Options] 히스토리 내보내기 오류:', error);
    window.errorHandler.handle(error, 'export-history');
    showMessage(window.languageManager.getMessage('toastError'), 'error');
  }
}

function importHistory(file) {
  const reader = new FileReader();
  
  reader.onload = async (e) => {
    try {
      const importData = e.target.result;
      
      const result = await window.historyManager.importHistory(importData, {
        merge: true,
        replace: false
      });
      
      const message = window.languageManager.getMessage('historyImported', [result.imported]) ||
                      `${result.imported}개의 새로운 히스토리를 가져왔습니다`;
      showMessage(message, 'success');
      
      const filter = elements.filterPeriod.value;
      const searchTerm = elements.searchHistory.value;
      await displayHistory(filter, searchTerm);
      
    } catch (error) {
      console.error('[Options] 히스토리 가져오기 오류:', error);
      window.errorHandler.handle(error, 'import-history');
      showMessage(error.message || window.languageManager.getMessage('importFailed') || '파일을 가져올 수 없습니다', 'error');
    }
  };
  
  reader.readAsText(file);
}

async function clearHistory() {
  const confirmed = await window.UIComponents.confirm.show(
    window.languageManager.getMessage('confirmDeleteHistory'),
    {
      title: window.languageManager.getMessage('confirm') || 'Confirm',
      confirmText: window.languageManager.getMessage('delete') || 'Delete',
      cancelText: window.languageManager.getMessage('cancel') || 'Cancel',
      type: 'danger'
    }
  );
  
  if (!confirmed) return;
  
  try {
    await window.historyManager.clearHistory();
    
    await displayHistory();
    
    showMessage(window.languageManager.getMessage('toastHistoryCleared'), 'success');
    
  } catch (error) {
    console.error('[Options] 히스토리 삭제 오류:', error);
    window.errorHandler.handle(error, 'clear-history');
    showMessage(window.languageManager.getMessage('historyDeleteFailed') || '히스토리 삭제에 실패했습니다', 'error');
  }
}

/**
 * 구독 버튼 클릭 핸들러
 */
function handleSubscribe() {
  // 구독 페이지로 이동 (실제 구현 시 결제 페이지 URL로 변경)
  chrome.tabs.create({ 
    url: 'https://summarygenie.com/subscribe' 
  });
  
  showMessage(window.languageManager.getMessage('redirectingToSubscription') || '구독 페이지로 이동합니다...', 'info');
}

function updateSelectOptions() {
  if (elements.themeSelect) {
    const options = elements.themeSelect.querySelectorAll('option');
    options[0].textContent = window.languageManager.getMessage('themeLight');
    options[1].textContent = window.languageManager.getMessage('themeDark');
    options[2].textContent = window.languageManager.getMessage('themeAuto');
  }
  
  if (elements.filterPeriod) {
    const options = elements.filterPeriod.querySelectorAll('option');
    options[0].textContent = window.languageManager.getMessage('filterAll');
    options[1].textContent = window.languageManager.getMessage('filterToday');
    options[2].textContent = window.languageManager.getMessage('filterWeek');
    options[3].textContent = window.languageManager.getMessage('filterMonth');
  }
}

function setupEventListeners() {
  // 테마 변경
  elements.themeSelect.addEventListener('change', (e) => {
    window.settingsManager.applyTheme(e.target.value);
  });
  
  // 언어 변경
  elements.languageSelect.addEventListener('change', async (e) => {
    const newLanguage = e.target.value;
    await window.languageManager.changeLanguage(newLanguage);
    updateSelectOptions();
    
    if (!elements.historyModal.classList.contains('hidden')) {
      const filter = elements.filterPeriod.value;
      const searchTerm = elements.searchHistory.value;
      await displayHistory(filter, searchTerm);
    }
  });
  
  // 히스토리 보기
  elements.viewHistoryBtn.addEventListener('click', async () => {
    elements.historyModal.classList.remove('hidden');
    await displayHistory();
  });
  
  // 히스토리 모달 닫기
  elements.closeHistoryBtn.addEventListener('click', () => {
    elements.historyModal.classList.add('hidden');
  });
  
  // 히스토리 상세 모달 닫기
  elements.closeDetailBtn?.addEventListener('click', () => {
    elements.historyDetailModal.classList.add('hidden');
  });
  
  // 모달 외부 클릭 시 닫기
  elements.historyModal.addEventListener('click', (e) => {
    if (e.target === elements.historyModal) {
      elements.historyModal.classList.add('hidden');
    }
  });
  
  elements.historyDetailModal?.addEventListener('click', (e) => {
    if (e.target === elements.historyDetailModal) {
      elements.historyDetailModal.classList.add('hidden');
    }
  });
  
  // 히스토리 검색
  elements.searchHistory.addEventListener('input', async (e) => {
    const filter = elements.filterPeriod.value;
    await displayHistory(filter, e.target.value);
  });
  
  // 히스토리 필터
  elements.filterPeriod.addEventListener('change', async (e) => {
    const searchTerm = elements.searchHistory.value;
    await displayHistory(e.target.value, searchTerm);
  });
  
  // 히스토리 내보내기
  elements.exportHistoryBtn.addEventListener('click', exportHistory);
  
  // 히스토리 가져오기
  elements.importHistoryBtn.addEventListener('click', () => {
    elements.importFile.click();
  });
  
  elements.importFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      importHistory(file);
      e.target.value = '';
    }
  });
  
  // 히스토리 삭제
  elements.clearHistoryBtn.addEventListener('click', clearHistory);
  
  // 구독 버튼 (NEW)
  elements.subscribeBtn.addEventListener('click', handleSubscribe);
  
  // 설정 저장
  elements.saveBtn.addEventListener('click', saveSettings);
  
  // 설정 초기화
  elements.resetBtn.addEventListener('click', resetSettings);
  
  // 개인정보 처리방침
  elements.privacyLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'https://summarygenie.com/privacy' });
  });
  
  // 이용약관
  elements.termsLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'https://summarygenie.com/terms' });
  });
}

// 초기화
document.addEventListener('DOMContentLoaded', initialize);