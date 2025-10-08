/**
 * SummaryGenie Enhanced Background Service Worker
 * 안정적인 탭 관리, 사이트별 처리, JWT 토큰 자동 갱신
 * 
 * @version 3.3.0
 */

// ===== 모듈 로딩 (importScripts 사용) =====
importScripts(
  './modules/token-manager.js',
  './modules/error-handler.js'
);

console.log('[Background] Modules loaded');

// 전역 객체에서 가져오기
const tokenManager = self.tokenManager || globalThis.tokenManager;
const errorHandler = self.errorHandler || globalThis.errorHandler;

if (!tokenManager) {
  console.error('[Background] TokenManager not available!');
}

if (!errorHandler) {
  console.error('[Background] ErrorHandler not available!');
}

console.log('[Background] Initialization complete');

// ===== 사이트 관리자 =====
class SiteManager {
  constructor() {
    this.specialSites = {
      'twitter.com': { spa: true, waitTime: 3000 },
      'x.com': { spa: true, waitTime: 3000 },
      'facebook.com': { spa: true, waitTime: 3000 },
      'instagram.com': { spa: true, waitTime: 3000 },
      'linkedin.com': { spa: true, waitTime: 2000 },
      'youtube.com': { spa: true, waitTime: 2000 },
      'notion.so': { spa: true, waitTime: 3000, requiresAuth: true },
      'docs.google.com': { requiresAuth: true, limited: true },
      'drive.google.com': { requiresAuth: true },
      'medium.com': { cookieWall: true, waitTime: 2000 },
      'tistory.com': { waitTime: 1500 },
      'blog.naver.com': { iframe: true, waitTime: 2000 },
      'velog.io': { spa: true, waitTime: 1500 },
      'nytimes.com': { paywall: true, waitTime: 2000 },
      'wsj.com': { paywall: true },
      'economist.com': { paywall: true },
      'arxiv.org': { pdf: true },
      'scholar.google.com': { waitTime: 1500 },
      'jstor.org': { requiresAuth: true },
      'ieee.org': { requiresAuth: true },
      'github.com': { spa: true, waitTime: 1500 },
      'gitlab.com': { spa: true, waitTime: 1500 },
      'stackoverflow.com': { waitTime: 1000 }
    };
    
    this.restrictedPatterns = [
      /^chrome:\/\//,
      /^chrome-extension:\/\//,
      /^edge:\/\//,
      /^about:/,
      /^file:\/\//,
      /^moz-extension:\/\//,
      /^safari-extension:\/\//,
      /^javascript:/i,
      /^data:/i,
      /^vbscript:/i
    ];
  }
  
  getSiteInfo(url) {
    try {
      // URL 존재 여부 확인
      if (!url) {
        return { type: 'unknown' };
      }
      
      // URL 타입 확인
      if (typeof url !== 'string') {
        console.warn('[Security] Invalid URL type:', typeof url);
        return { type: 'unknown' };
      }
      
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      
      for (const [site, info] of Object.entries(this.specialSites)) {
        if (hostname.includes(site)) {
          return { ...info, site, hostname };
        }
      }
      
      return { hostname, type: 'generic' };
    } catch (error) {
      console.error('[Security] URL 파싱 오류:', error.message);
      errorHandler.handle(error, 'get-site-info');
      return { type: 'unknown' };
    }
  }
  
  isRestricted(url) {
    if (!url || typeof url !== 'string') {
      return true;
    }
    return this.restrictedPatterns.some(pattern => pattern.test(url));
  }
  
  getWaitTime(url) {
    const siteInfo = this.getSiteInfo(url);
    const waitTime = siteInfo.waitTime || 1000;
    return Math.min(waitTime, 10000);
  }
}

// ===== 콘텐츠 스크립트 관리자 =====
class ContentScriptManager {
  constructor() {
    this.injectedTabs = new Set();
    this.pendingInjections = new Map();
  }
  
  async inject(tabId, files = ['content.js'], css = ['content-styles.css']) {
    if (!Number.isInteger(tabId) || tabId < 0) {
      console.error('[Security] Invalid tabId:', tabId);
      const error = new Error('Invalid tab ID');
      errorHandler.handle(error, 'inject-content-script');
      throw error;
    }
    
    if (this.injectedTabs.has(tabId)) {
      console.log(`탭 ${tabId}: 이미 주입됨`);
      return true;
    }
    
    if (this.pendingInjections.has(tabId)) {
      console.log(`탭 ${tabId}: 주입 대기 중`);
      return this.pendingInjections.get(tabId);
    }
    
    const injectionPromise = this.performInjection(tabId, files, css);
    this.pendingInjections.set(tabId, injectionPromise);
    
    try {
      await injectionPromise;
      this.injectedTabs.add(tabId);
      this.pendingInjections.delete(tabId);
      return true;
    } catch (error) {
      this.pendingInjections.delete(tabId);
      errorHandler.handle(error, 'content-script-injection');
      throw error;
    }
  }
  
  async performInjection(tabId, jsFiles, cssFiles) {
    try {
      const tab = await chrome.tabs.get(tabId);
      
      if (!tab.url || siteManager.isRestricted(tab.url)) {
        throw new Error('제한된 URL');
      }
      
      if (tab.status !== 'complete') {
        await this.waitForTabComplete(tabId);
      }
      
      if (cssFiles && cssFiles.length > 0) {
        await chrome.scripting.insertCSS({
          target: { tabId },
          files: cssFiles
        });
      }
      
      await chrome.scripting.executeScript({
        target: { tabId },
        files: jsFiles
      });
      
      console.log(`탭 ${tabId}: 스크립트 주입 완료`);
      
      const waitTime = siteManager.getWaitTime(tab.url);
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      
      return true;
    } catch (error) {
      console.error(`탭 ${tabId} 주입 실패:`, error.message);
      throw error;
    }
  }
  
  async waitForTabComplete(tabId, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const checkTab = async () => {
        try {
          const tab = await chrome.tabs.get(tabId);
          
          if (tab.status === 'complete') {
            resolve();
            return;
          }
          
          if (Date.now() - startTime > timeout) {
            reject(new Error('탭 로드 타임아웃'));
            return;
          }
          
          setTimeout(checkTab, 500);
        } catch (error) {
          reject(error);
        }
      };
      
      checkTab();
    });
  }
  
  async check(tabId) {
    if (!this.injectedTabs.has(tabId)) {
      return false;
    }
    
    try {
      const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      return response && response.success;
    } catch (error) {
      this.injectedTabs.delete(tabId);
      return false;
    }
  }
  
  cleanup(tabId) {
    this.injectedTabs.delete(tabId);
    this.pendingInjections.delete(tabId);
  }
  
  reset() {
    this.injectedTabs.clear();
    this.pendingInjections.clear();
  }
}

// ===== 추출 작업 관리자 =====
class ExtractionManager {
  constructor() {
    this.activeExtractions = new Map();
    this.extractionHistory = [];
    this.maxHistorySize = 100;
  }
  
  async startExtraction(tabId, options = {}) {
    const validatedOptions = this.validateExtractionOptions(options);
    
    if (this.activeExtractions.has(tabId)) {
      console.log(`탭 ${tabId}: 이미 추출 중`);
      return this.activeExtractions.get(tabId);
    }
    
    const extraction = this.performExtraction(tabId, validatedOptions);
    this.activeExtractions.set(tabId, extraction);
    
    try {
      const result = await extraction;
      this.addToHistory(tabId, result);
      this.activeExtractions.delete(tabId);
      return result;
    } catch (error) {
      this.activeExtractions.delete(tabId);
      errorHandler.handle(error, 'extraction');
      throw error;
    }
  }
  
  validateExtractionOptions(options) {
    const defaults = {
      includeImages: true,
      includeTables: true,
      includeCode: true,
      maxScrolls: 3
    };
    
    const validated = { ...defaults };
    
    if (typeof options.includeImages === 'boolean') {
      validated.includeImages = options.includeImages;
    }
    if (typeof options.includeTables === 'boolean') {
      validated.includeTables = options.includeTables;
    }
    if (typeof options.includeCode === 'boolean') {
      validated.includeCode = options.includeCode;
    }
    if (typeof options.maxScrolls === 'number' && options.maxScrolls >= 0 && options.maxScrolls <= 10) {
      validated.maxScrolls = options.maxScrolls;
    }
    
    return validated;
  }
  
  async performExtraction(tabId, options) {
    try {
      const tab = await chrome.tabs.get(tabId);
      console.log('추출 시작:', tab.url.substring(0, 50) + '...');
      
      const isInjected = await contentScriptManager.check(tabId);
      if (!isInjected) {
        await contentScriptManager.inject(tabId);
      }
      
      const siteInfo = siteManager.getSiteInfo(tab.url);
      
      if (siteInfo.requiresAuth) {
        console.warn('인증이 필요한 사이트:', siteInfo.site);
      }
      
      if (siteInfo.paywall) {
        console.warn('페이월 사이트:', siteInfo.site);
      }
      
      const response = await chrome.tabs.sendMessage(tabId, {
        action: 'extractContent',
        options: options
      });
      
      if (!response || !response.success) {
        throw new Error(response?.error || '콘텐츠 추출 실패');
      }
      
      if (!response.content || response.content.length < 50) {
        throw new Error('추출된 콘텐츠가 너무 짧습니다');
      }
      
      return {
        ...response,
        tabId,
        url: tab.url,
        title: tab.title,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('추출 오류:', error.message);
      
      try {
        const fallbackResult = await this.fallbackExtraction(tabId);
        return fallbackResult;
      } catch (fallbackError) {
        errorHandler.handle(error, 'perform-extraction');
        throw error;
      }
    }
  }
  
  async fallbackExtraction(tabId) {
    console.log('폴백 추출 시도');
    
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const content = document.body.innerText || document.body.textContent || '';
        const title = document.title;
        const url = window.location.href;
        
        return {
          content: content.substring(0, 10000),
          metadata: { title, url },
          stats: {
            wordCount: content.split(/\s+/).length,
            charCount: content.length,
            extractionMethod: { type: 'fallback' }
          }
        };
      }
    });
    
    if (result && result[0] && result[0].result) {
      return {
        success: true,
        ...result[0].result,
        tabId,
        timestamp: new Date().toISOString()
      };
    }
    
    throw new Error('폴백 추출도 실패');
  }
  
  addToHistory(tabId, result) {
    this.extractionHistory.unshift({
      tabId,
      url: result.url,
      title: result.title,
      timestamp: result.timestamp,
      stats: result.stats
    });
    
    if (this.extractionHistory.length > this.maxHistorySize) {
      this.extractionHistory = this.extractionHistory.slice(0, this.maxHistorySize);
    }
    
    this.saveHistory();
  }
  
  async saveHistory() {
    try {
      await chrome.storage.local.set({
        extractionHistory: this.extractionHistory.slice(0, 20)
      });
    } catch (error) {
      console.error('히스토리 저장 실패:', error.message);
      errorHandler.handle(error, 'save-extraction-history');
    }
  }
  
  async loadHistory() {
    try {
      const result = await chrome.storage.local.get('extractionHistory');
      if (result.extractionHistory) {
        this.extractionHistory = result.extractionHistory;
      }
    } catch (error) {
      console.error('히스토리 로드 실패:', error.message);
      errorHandler.handle(error, 'load-extraction-history');
    }
  }
}

// ===== 토큰 자동 갱신 관리자 =====
class TokenRefreshManager {
  constructor(tokenMgr) {
    this.tokenManager = tokenMgr;
    this.isOnline = true;
    this.lastRefreshAttempt = 0;
    this.MIN_REFRESH_INTERVAL = 60000; // 최소 1분 간격
  }

  async setupTokenRefreshAlarm() {
    try {
      await chrome.alarms.clear('token-refresh');
      
      chrome.alarms.create('token-refresh', {
        delayInMinutes: 5,
        periodInMinutes: 5
      });
      
      console.log('[TokenRefresh] Alarm set to check every 5 minutes');
    } catch (error) {
      console.error('[TokenRefresh] Setup alarm error:', error);
      errorHandler.handle(error, 'setup-token-refresh-alarm');
    }
  }

  async checkAndRefreshToken() {
    try {
      if (!tokenManager) {
        console.warn('[TokenRefresh] TokenManager not initialized yet');
        return;
      }

      const now = Date.now();
      
      if (now - this.lastRefreshAttempt < this.MIN_REFRESH_INTERVAL) {
        console.log('[TokenRefresh] Too soon to refresh again');
        return;
      }

      // Refresh Token 존재 여부 먼저 확인
      const refreshToken = await tokenManager.getRefreshToken();
      
      if (!refreshToken) {
        // 로그인하지 않은 상태 - 조용히 넘어감 (에러 로그 없음)
        return;
      }

      const hasValidToken = await tokenManager.hasValidToken();
      
      if (!hasValidToken) {
        console.log('[TokenRefresh] Token expired, attempting refresh...');
        
        this.lastRefreshAttempt = now;
        
        try {
          await tokenManager.refreshAccessToken();
          console.log('[TokenRefresh] Token refreshed successfully');
          this.notifyTokenRefreshSuccess();
          
        } catch (refreshError) {
          console.error('[TokenRefresh] Refresh failed:', refreshError);
          this.notifyTokenRefreshFailure();
          errorHandler.handle(refreshError, 'auto-refresh-token');
        }
      } else {
        console.log('[TokenRefresh] Token is still valid');
      }
    } catch (error) {
      console.error('[TokenRefresh] Check and refresh error:', error);
      errorHandler.handle(error, 'check-and-refresh-token');
    }
  }

  notifyTokenRefreshSuccess() {
    console.log('[TokenRefresh] Token auto-refreshed successfully');
  }

  notifyTokenRefreshFailure() {
    chrome.notifications.create('token-refresh-failed', {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'SummaryGenie 인증 만료',
      message: '로그인이 필요합니다. 다시 로그인해주세요.',
      priority: 2
    });
  }

  openLoginPage() {
    chrome.tabs.create({
      url: chrome.runtime.getURL('auth.html')
    });
  }
}

// ===== 전역 인스턴스 생성 =====
const siteManager = new SiteManager();
const contentScriptManager = new ContentScriptManager();
const extractionManager = new ExtractionManager();
const tokenRefreshManager = new TokenRefreshManager(tokenManager);

// ===== Service Worker 이벤트 핸들러 =====

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('SummaryGenie Enhanced 설치:', details.reason);
  
  try {
    if (details.reason === 'install') {
      await chrome.storage.local.set({
        settings: {
          language: 'ko',
          includeImages: true,
          includeTables: true,
          includeCode: true,
          maxScrolls: 3,
          autoExtract: false,
          useProxy: true,
          proxyUrl: 'http://localhost:3000/api/chat'
        }
      });
      
      createContextMenus();
      
      await tokenRefreshManager.setupTokenRefreshAlarm();
    } else if (details.reason === 'update') {
      contentScriptManager.reset();
      
      await tokenRefreshManager.setupTokenRefreshAlarm();
    }
    
    await extractionManager.loadHistory();
  } catch (error) {
    console.error('설치/업데이트 처리 오류:', error);
    errorHandler.handle(error, 'on-installed');
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'token-refresh') {
    console.log('[Alarm] Token refresh alarm triggered');
    await tokenRefreshManager.checkAndRefreshToken();
  }
});

function createContextMenus() {
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: 'extract-content',
        title: '페이지 콘텐츠 추출',
        contexts: ['page']
      });
      
      chrome.contextMenus.create({
        id: 'extract-selection',
        title: '선택 영역 추출',
        contexts: ['selection']
      });
      
      chrome.contextMenus.create({
        type: 'separator',
        contexts: ['page', 'selection']
      });
      
      chrome.contextMenus.create({
        id: 'extract-with-images',
        title: '이미지 포함 추출',
        contexts: ['page']
      });
      
      chrome.contextMenus.create({
        id: 'extract-simplified',
        title: '간단 추출 (텍스트만)',
        contexts: ['page']
      });
    });
  } catch (error) {
    console.error('컨텍스트 메뉴 생성 오류:', error);
    errorHandler.handle(error, 'create-context-menus');
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) return;
  
  try {
    let options = {};
    
    switch (info.menuItemId) {
      case 'extract-content':
        options = { includeImages: true, includeTables: true };
        break;
        
      case 'extract-selection':
        const selectionText = info.selectionText ? 
          info.selectionText.substring(0, 5000) : '';
        options = { selection: selectionText };
        break;
        
      case 'extract-with-images':
        options = { includeImages: true, enrichImages: true };
        break;
        
      case 'extract-simplified':
        options = { includeImages: false, includeTables: false, includeCode: false };
        break;
    }
    
    const result = await extractionManager.startExtraction(tab.id, options);
    
    chrome.runtime.sendMessage({
      action: 'extractionComplete',
      data: result
    });
    
  } catch (error) {
    console.error('추출 오류:', error.message);
    errorHandler.handle(error, 'context-menu-click');
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: '콘텐츠 추출 실패',
      message: '콘텐츠 추출 중 오류가 발생했습니다.'
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('메시지 수신:', request.action);
  
  try {
    switch (request.action) {
      case 'extractContent':
        handleExtractContent(request, sender, sendResponse);
        return true;
        
      case 'checkContentScript':
        handleCheckContentScript(request, sender, sendResponse);
        return true;
        
      case 'getExtractionHistory':
        sendResponse({
          success: true,
          history: extractionManager.extractionHistory
        });
        break;
        
      case 'getSiteInfo':
        handleGetSiteInfo(request, sender, sendResponse);
        break;
        
      case 'injectContentScript':
        handleInjectContentScript(request, sender, sendResponse);
        return true;

      case 'openLoginPage':
        tokenRefreshManager.openLoginPage();
        sendResponse({ success: true });
        break;

      case 'checkTokenStatus':
        handleCheckTokenStatus(request, sender, sendResponse);
        return true;

      case 'refreshToken':
        handleRefreshToken(request, sender, sendResponse);
        return true;

      case 'logout':
        handleLogout(request, sender, sendResponse);
        return true;
    }
  } catch (error) {
    console.error('메시지 핸들러 오류:', error);
    errorHandler.handle(error, 'message-handler');
    sendResponse({ success: false, error: error.message });
  }
});

async function handleExtractContent(request, sender, sendResponse) {
  try {
    const tabId = request.tabId || sender.tab?.id;
    
    if (!tabId) {
      const [activeTab] = await chrome.tabs.query({ 
        active: true, 
        currentWindow: true 
      });
      
      if (!activeTab) {
        throw new Error('활성 탭을 찾을 수 없습니다');
      }
      
      const result = await extractionManager.startExtraction(
        activeTab.id, 
        request.options
      );
      sendResponse({ success: true, ...result });
    } else {
      const result = await extractionManager.startExtraction(
        tabId, 
        request.options
      );
      sendResponse({ success: true, ...result });
    }
  } catch (error) {
    errorHandler.handle(error, 'handle-extract-content');
    sendResponse({ 
      success: false, 
      error: error.message 
    });
  }
}

async function handleCheckContentScript(request, sender, sendResponse) {
  try {
    const tabId = request.tabId || sender.tab?.id;
    const isInjected = await contentScriptManager.check(tabId);
    
    sendResponse({ 
      success: true, 
      injected: isInjected 
    });
  } catch (error) {
    errorHandler.handle(error, 'check-content-script');
    sendResponse({ 
      success: false, 
      error: error.message 
    });
  }
}

function handleGetSiteInfo(request, sender, sendResponse) {
  try {
    const url = request.url || sender.tab?.url;
    const siteInfo = siteManager.getSiteInfo(url);
    const isRestricted = siteManager.isRestricted(url);
    
    sendResponse({
      success: true,
      siteInfo,
      isRestricted
    });
  } catch (error) {
    errorHandler.handle(error, 'get-site-info');
    sendResponse({ 
      success: false, 
      error: error.message 
    });
  }
}

async function handleInjectContentScript(request, sender, sendResponse) {
  try {
    const tabId = request.tabId || sender.tab?.id;
    await contentScriptManager.inject(tabId);
    
    sendResponse({ success: true });
  } catch (error) {
    errorHandler.handle(error, 'inject-content-script-handler');
    sendResponse({ 
      success: false, 
      error: error.message 
    });
  }
}

async function handleCheckTokenStatus(request, sender, sendResponse) {
  try {
    if (!tokenManager) {
      throw new Error('TokenManager not initialized');
    }
    const tokenInfo = await tokenManager.getTokenInfo();
    sendResponse({ 
      success: true, 
      tokenInfo 
    });
  } catch (error) {
    errorHandler.handle(error, 'check-token-status');
    sendResponse({ 
      success: false, 
      error: error.message 
    });
  }
}

async function handleRefreshToken(request, sender, sendResponse) {
  try {
    if (!tokenManager) {
      throw new Error('TokenManager not initialized');
    }
    const newToken = await tokenManager.refreshAccessToken();
    sendResponse({ 
      success: true, 
      accessToken: newToken 
    });
  } catch (error) {
    errorHandler.handle(error, 'handle-refresh-token');
    sendResponse({ 
      success: false, 
      error: error.message 
    });
  }
}

async function handleLogout(request, sender, sendResponse) {
  try {
    console.log('[Background] 로그아웃 처리 시작');
    
    if (!tokenManager) {
      throw new Error('TokenManager not initialized');
    }

    await tokenManager.clearTokens();
    
    await chrome.alarms.clear('token-refresh');
    
    console.log('[Background] 로그아웃 완료');
    
    sendResponse({ 
      success: true,
      message: '로그아웃되었습니다.'
    });
  } catch (error) {
    console.error('[Background] 로그아웃 오류:', error);
    errorHandler.handle(error, 'handle-logout');
    sendResponse({ 
      success: false, 
      error: error.message 
    });
  }
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  try {
    if (changeInfo.url) {
      console.log('URL 변경 감지');
      contentScriptManager.cleanup(tabId);
    }
    
    if (changeInfo.status === 'complete') {
      const settings = await chrome.storage.local.get('settings');
      
      if (settings.settings?.autoExtract && !siteManager.isRestricted(tab.url)) {
        try {
          const result = await extractionManager.startExtraction(tabId, {
            auto: true
          });
          console.log('자동 추출 완료');
        } catch (error) {
          console.error('자동 추출 실패:', error.message);
          errorHandler.handle(error, 'auto-extraction');
        }
      }
    }
  } catch (error) {
    console.error('탭 업데이트 처리 오류:', error);
    errorHandler.handle(error, 'tab-updated');
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  contentScriptManager.cleanup(tabId);
  extractionManager.activeExtractions.delete(tabId);
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    
    const siteInfo = siteManager.getSiteInfo(tab.url);
    if (siteInfo.spa) {
      const isInjected = await contentScriptManager.check(activeInfo.tabId);
      if (!isInjected && !siteManager.isRestricted(tab.url)) {
        await contentScriptManager.inject(activeInfo.tabId);
      }
    }
  } catch (error) {
    console.error('탭 활성화 처리 오류:', error.message);
    errorHandler.handle(error, 'tab-activated');
  }
});

console.log('SummaryGenie Enhanced Background Service 시작 (JWT 토큰 자동 갱신 포함)');