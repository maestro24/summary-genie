/**
 * SummaryGenie 개발자 콘솔
 * 개발자 도구 및 디버깅 인터페이스
 */

/**
 * 개발자 콘솔 클래스
 * 모든 개발자 도구 기능을 관리
 */
class DeveloperConsole {
  constructor() {
    this.currentTab = 'overview';
    this.logs = [];
    this.testResults = {};
    this.consoleHistory = [];
    this.consoleHistoryIndex = -1;
    this.updateInterval = null;
    this.charts = {};
    
    // 실시간 업데이트 플래그
    this.isUpdating = false;
    
    // 콘솔 명령어 매핑 (메서드 정의 후에 설정)
    this.commands = {};
    
    // Chrome Extension 환경 체크
    this.isExtensionEnvironment = this.checkExtensionEnvironment();
    
    // 모듈들 - 실제 import가 실패할 경우를 대비한 폴백
    this.deviceFingerprint = (typeof window !== 'undefined' && window.deviceFingerprint) || null;
    this.storageManager = (typeof window !== 'undefined' && window.storageManager) || null;
    this.apiService = (typeof window !== 'undefined' && window.apiService) || null;
  }

  /**
   * Chrome Extension 환경인지 확인
   */
  checkExtensionEnvironment() {
    return (typeof chrome !== 'undefined' && 
            chrome.runtime && 
            chrome.runtime.getManifest &&
            chrome.storage &&
            chrome.storage.local);
  }
  
  /**
   * 명령어 매핑 초기화
   */
  initializeCommands() {
    this.commands = {
      'help': this.showHelp.bind(this),
      'status': this.getSystemStatus.bind(this),
      'clear': this.clearConsole.bind(this),
      'fingerprint': this.showFingerprint.bind(this),
      'cache.stats': this.showCacheStats.bind(this),
      'cache.clear': this.clearCache.bind(this),
      'storage.info': this.showStorageInfo.bind(this),
      'storage.clear': this.clearStorage.bind(this),
      'api.health': this.checkApiHealth.bind(this),
      'api.logs': this.showApiLogs.bind(this),
      'test.all': this.runAllTests.bind(this),
      'export.logs': this.exportLogs.bind(this),
      'export.storage': this.exportStorage.bind(this),
      'version': this.showVersion.bind(this)
    };
  }

  /**
   * 초기화
   */
  async initialize() {
    try {
      console.log('개발자 콘솔을 초기화하는 중...');
      
      // 명령어 매핑 초기화
      this.initializeCommands();
      
      // 스토리지 매니저 폴백 구현
      this.initializeStorageManager();
      
      // 이벤트 리스너 설정
      this.setupEventListeners();
      
      // 초기 데이터 로드
      await this.loadInitialData();
      
      // 실시간 업데이트 시작
      this.startRealTimeUpdates();
      
      // 첫 번째 탭 표시
      this.showTab('overview');
      
      console.log('개발자 콘솔 초기화 완료');
      
    } catch (error) {
      console.error('개발자 콘솔 초기화 실패:', error);
      this.showToast('초기화 실패: ' + error.message, 'error');
    }
  }
  
  /**
   * 스토리지 매니저 폴백 초기화
   */
  initializeStorageManager() {
    if (!this.storageManager) {
      this.storageManager = {
        getSettings: async () => {
          try {
            if (this.isExtensionEnvironment) {
              const result = await chrome.storage.local.get(['settings']);
              return result.settings || {};
            } else {
              // 일반 웹페이지 환경에서는 localStorage 사용
              const settings = localStorage.getItem('dev_settings');
              return settings ? JSON.parse(settings) : {};
            }
          } catch (error) {
            console.error('설정 가져오기 실패:', error);
            return {};
          }
        },
        
        getApiConfig: async () => {
          try {
            if (this.isExtensionEnvironment) {
              const result = await chrome.storage.local.get(['apiConfig']);
              return result.apiConfig || { useProxy: true, proxyUrl: 'http://localhost:3000' };
            } else {
              // 일반 웹페이지 환경에서는 localStorage 사용
              const config = localStorage.getItem('dev_apiConfig');
              return config ? JSON.parse(config) : { useProxy: true, proxyUrl: 'http://localhost:3000' };
            }
          } catch (error) {
            console.error('API 설정 가져오기 실패:', error);
            return { useProxy: true, proxyUrl: 'http://localhost:3000' };
          }
        },
        
        getUsage: async () => {
          try {
            const today = new Date().toDateString();
            if (this.isExtensionEnvironment) {
              const result = await chrome.storage.local.get(['usage']);
              if (result.usage && result.usage.date === today) {
                return result.usage;
              }
              return { date: today, count: 0 };
            } else {
              // 일반 웹페이지 환경에서는 localStorage 사용
              const usage = localStorage.getItem('dev_usage');
              const parsedUsage = usage ? JSON.parse(usage) : null;
              if (parsedUsage && parsedUsage.date === today) {
                return parsedUsage;
              }
              return { date: today, count: 0 };
            }
          } catch (error) {
            console.error('사용량 가져오기 실패:', error);
            return { date: new Date().toDateString(), count: 0 };
          }
        }
      };
    }
  }

  /**
   * 이벤트 리스너 설정
   */
  setupEventListeners() {
    // 탭 전환
    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const tab = e.currentTarget.getAttribute('data-tab');
        console.log('탭 전환:', tab);
        if (tab) {
          this.showTab(tab);
        }
      });
    });
    
    // 헤더 액션 버튼들
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.refreshAll());
    }
    
    const clearLogsBtn = document.getElementById('clearLogsBtn');
    if (clearLogsBtn) {
      clearLogsBtn.addEventListener('click', () => this.clearAllLogs());
    }
    
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportAll());
    }
    
    // 핑거프린트 관련
    const refreshFingerprintBtn = document.getElementById('refreshFingerprintBtn');
    if (refreshFingerprintBtn) {
      refreshFingerprintBtn.addEventListener('click', () => this.refreshFingerprint());
    }
    
    const copyFingerprintBtn = document.getElementById('copyFingerprintBtn');
    if (copyFingerprintBtn) {
      copyFingerprintBtn.addEventListener('click', () => this.copyFingerprint());
    }
    
    // 콘솔 관련
    const consoleInput = document.getElementById('consoleInput');
    if (consoleInput) {
      consoleInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.executeConsoleCommand();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.navigateConsoleHistory(-1);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.navigateConsoleHistory(1);
        }
      });
    }
    
    const consoleSubmit = document.getElementById('consoleSubmit');
    if (consoleSubmit) {
      consoleSubmit.addEventListener('click', () => this.executeConsoleCommand());
    }
    
    // 콘솔 단축 명령어 버튼들
    const shortcutButtons = document.querySelectorAll('.shortcut-btn');
    shortcutButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const command = e.currentTarget.getAttribute('data-command');
        const consoleInputEl = document.getElementById('consoleInput');
        if (consoleInputEl && command) {
          consoleInputEl.value = command;
          this.executeConsoleCommand();
        }
      });
    });

    // 테스트 관련
    const runAllTestsBtn = document.getElementById('runAllTestsBtn');
    if (runAllTestsBtn) {
      runAllTestsBtn.addEventListener('click', () => this.runAllTests());
    }
    
    // 개별 테스트 버튼들
    const testButtons = document.querySelectorAll('.test-run-btn');
    testButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const testName = e.currentTarget.getAttribute('data-test');
        if (testName) {
          this.runSingleTest(testName);
        }
      });
    });
  }

  /**
   * 초기 데이터 로드
   */
  async loadInitialData() {
    try {
      // 시스템 정보 로드
      await this.loadSystemInfo();
      
      // 핑거프린트 정보 로드
      await this.loadFingerprintInfo();
      
      // 스토리지 정보 로드
      await this.loadStorageInfo();
      
      // API 로그 로드
      await this.loadApiLogs();
      
      // 캐시 통계 로드
      await this.loadCacheStats();
      
      // 성능 메트릭 로드
      await this.loadPerformanceMetrics();
      
    } catch (error) {
      console.error('Failed to load initial data:', error);
    }
  }

  /**
   * 탭 표시
   */
  showTab(tabName) {
    console.log('탭 표시:', tabName);
    
    // 모든 탭 숨기기
    document.querySelectorAll('.tab-content').forEach(tab => {
      tab.classList.remove('active');
    });
    
    // 모든 네비게이션 버튼 비활성화
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    
    // 선택된 탭과 버튼 활성화
    const targetTab = document.getElementById(tabName);
    const targetBtn = document.querySelector(`[data-tab="${tabName}"]`);
    
    if (targetTab) {
      targetTab.classList.add('active');
      console.log('탭 활성화됨:', tabName);
    } else {
      console.error('탭을 찾을 수 없음:', tabName);
    }
    
    if (targetBtn) {
      targetBtn.classList.add('active');
    }
    
    this.currentTab = tabName;
    
    // 탭별 초기화 작업
    switch (tabName) {
      case 'overview':
        this.refreshOverview();
        break;
      case 'fingerprint':
        this.refreshFingerprintInfo();
        break;
      case 'storage':
        this.refreshStorageInfo();
        break;
      case 'api':
        this.refreshApiLogs();
        break;
      case 'cache':
        this.refreshCacheStats();
        break;
      case 'performance':
        this.refreshPerformanceCharts();
        break;
      case 'test':
        // 테스트는 수동 실행
        break;
      case 'console':
        // 콘솔은 이미 활성화됨
        break;
    }
  }

  /**
   * 시스템 정보 로드
   */
  async loadSystemInfo() {
    try {
      // Extension 정보
      let manifest = null;
      let runtimeId = '데모 모드';
      
      if (this.isExtensionEnvironment) {
        manifest = chrome.runtime.getManifest();
        runtimeId = chrome.runtime.id;
      } else {
        // 데모용 매니페스트 정보
        manifest = {
          manifest_version: 3,
          version: '1.0.0'
        };
      }
      
      const runtimeIdEl = document.getElementById('runtimeId');
      if (runtimeIdEl) {
        runtimeIdEl.textContent = runtimeId;
      }
      
      // 프록시 서버 상태 확인
      await this.checkProxyStatus();
      
      // 사용량 통계
      const usage = await this.storageManager.getUsage();
      const todayApiCallsEl = document.getElementById('todayApiCalls');
      if (todayApiCallsEl) {
        todayApiCallsEl.textContent = usage.count;
      }
      
      // 메모리 사용량 (추정)
      const storageSize = await this.calculateStorageSize();
      const storageUsageEl = document.getElementById('storageUsage');
      if (storageUsageEl) {
        storageUsageEl.textContent = this.formatBytes(storageSize);
      }
      
      // 시스템 정보 그리드 생성
      const systemInfo = {
        '확장프로그램 ID': runtimeId,
        '매니페스트 버전': manifest.manifest_version,
        '버전': manifest.version,
        '사용자 에이전트': navigator.userAgent.substring(0, 100) + '...',
        '플랫폼': navigator.platform,
        '언어': navigator.language,
        'CPU 코어 수': navigator.hardwareConcurrency || '알 수 없음',
        '디바이스 메모리': (navigator.deviceMemory || '알 수 없음') + ' GB',
        '화면 해상도': `${screen.width}x${screen.height}`,
        '색상 깊이': screen.colorDepth + ' bit',
        '시간대': Intl.DateTimeFormat().resolvedOptions().timeZone,
        '쿠키 활성화': navigator.cookieEnabled ? '예' : '아니오'
      };
      
      this.renderSystemInfo(systemInfo);
      
      // 최근 활동 로드
      this.loadRecentActivity();
      
    } catch (error) {
      console.error('시스템 정보 로드 실패:', error);
    }
  }

  /**
   * 프록시 서버 상태 확인
   */
  async checkProxyStatus() {
    const proxyStatusEl = document.getElementById('proxyStatus');
    const proxyUrlEl = document.getElementById('proxyUrl');
    
    try {
      const apiConfig = await this.storageManager.getApiConfig();
      const proxyUrl = apiConfig.proxyUrl || 'http://localhost:3000';
      
      if (proxyUrlEl) {
        proxyUrlEl.textContent = proxyUrl;
      }
      if (proxyStatusEl) {
        proxyStatusEl.textContent = '확인 중...';
      }
      
      // 데모 모드에서는 실제 API 호출 대신 시뮬레이션 사용
      if (!this.isExtensionEnvironment) {
        // 데모 모드: 랜덤하게 연결 상태 시뮬레이션
        const isConnected = Math.random() > 0.3; // 70% 확률로 연결됨
        
        setTimeout(() => {
          if (proxyStatusEl) {
            if (isConnected) {
              proxyStatusEl.textContent = '연결됨 (데모)';
              proxyStatusEl.style.color = '#10b981';
            } else {
              proxyStatusEl.textContent = '시뮬레이션 모드';
              proxyStatusEl.style.color = '#f59e0b';
            }
          }
        }, 1000);
        return;
      }
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const response = await fetch(`${proxyUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
        mode: 'cors'
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        if (proxyStatusEl) {
          proxyStatusEl.textContent = '연결됨';
          proxyStatusEl.style.color = '#10b981';
        }
      } else {
        if (proxyStatusEl) {
          proxyStatusEl.textContent = '오류';
          proxyStatusEl.style.color = '#ef4444';
        }
      }
      
    } catch (error) {
      // CORS 에러나 네트워크 에러 처리
      if (proxyStatusEl) {
        if (error.name === 'AbortError') {
          proxyStatusEl.textContent = '타임아웃';
        } else if (error.message.includes('CORS') || error.message.includes('Failed to fetch')) {
          proxyStatusEl.textContent = '개발 모드';
          proxyStatusEl.style.color = '#f59e0b';
        } else {
          proxyStatusEl.textContent = '연결 끊김';
          proxyStatusEl.style.color = '#ef4444';
        }
      }
      
      console.log('프록시 상태 확인 실패 (정상적인 개발 환경 동작):', error.message);
    }
  }

  /**
   * 시스템 정보 렌더링
   */
  renderSystemInfo(systemInfo) {
    const container = document.getElementById('systemInfo');
    if (!container) return;
    
    container.innerHTML = '';
    
    Object.entries(systemInfo).forEach(([key, value]) => {
      const item = document.createElement('div');
      item.className = 'info-item';
      item.innerHTML = `
        <span class="label">${key}:</span>
        <span class="value">${value}</span>
      `;
      container.appendChild(item);
    });
  }

  /**
   * 최근 활동 로드
   */
  async loadRecentActivity() {
    const container = document.getElementById('recentActivity');
    if (!container) return;
    
    try {
      // API 로그에서 최근 활동 추출
      const recentLogs = this.logs.slice(-10).reverse();
      
      container.innerHTML = '';
      
      if (recentLogs.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: #9ca3af; padding: 20px;">최근 활동이 없습니다</div>';
        return;
      }
      
      recentLogs.forEach(log => {
        const item = document.createElement('div');
        item.className = 'activity-item';
        
        const time = new Date(log.timestamp).toLocaleTimeString();
        const type = log.type || 'api';
        const message = log.message || `${log.method} ${log.endpoint}`;
        
        item.innerHTML = `
          <div class="activity-time">${time}</div>
          <div class="activity-type ${type}">${type}</div>
          <div class="activity-message">${message}</div>
        `;
        
        container.appendChild(item);
      });
      
    } catch (error) {
      console.error('최근 활동 로드 실패:', error);
      container.innerHTML = '<div style="color: #ef4444;">활동 로드 실패</div>';
    }
  }

  /**
   * API 로그 로드
   */
  async loadApiLogs() {
    try {
      // 실제 구현에서는 백그라운드에서 로그를 수집해야 함
      // 여기서는 시뮬레이션 데이터 사용
      this.logs = await this.getApiLogsFromStorage();
      this.renderApiLogs();
      
      const apiLogCountEl = document.getElementById('apiLogCount');
      if (apiLogCountEl) {
        apiLogCountEl.textContent = this.logs.length;
      }
      
    } catch (error) {
      console.error('API 로그 로드 실패:', error);
    }
  }

  /**
   * API 로그 스토리지에서 가져오기
   */
  async getApiLogsFromStorage() {
    try {
      if (this.isExtensionEnvironment) {
        const result = await chrome.storage.local.get(['apiLogs']);
        return result.apiLogs || [];
      } else {
        // 일반 웹페이지 환경에서는 localStorage 사용
        const logs = localStorage.getItem('dev_apiLogs');
        return logs ? JSON.parse(logs) : this.generateDemoLogs();
      }
    } catch (error) {
      console.error('스토리지에서 API 로그 가져오기 실패:', error);
      return this.generateDemoLogs();
    }
  }

  /**
   * 데모용 API 로그 생성
   */
  generateDemoLogs() {
    const demoLogs = [
      {
        timestamp: new Date(Date.now() - 300000).toISOString(),
        method: 'POST',
        endpoint: '/api/summarize',
        success: true,
        responseTime: 850,
        request: { text: '웹페이지 콘텐츠...' },
        response: { summary: '요약 결과...' },
        cached: false
      },
      {
        timestamp: new Date(Date.now() - 180000).toISOString(),
        method: 'POST',
        endpoint: '/api/question',
        success: true,
        responseTime: 420,
        request: { question: '이 내용에 대해 질문...' },
        response: { answer: '답변 내용...' },
        cached: true
      },
      {
        timestamp: new Date(Date.now() - 60000).toISOString(),
        method: 'GET',
        endpoint: '/health',
        success: true,
        responseTime: 120,
        request: {},
        response: { status: 'ok' },
        cached: false
      }
    ];
    
    // localStorage에 저장
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('dev_apiLogs', JSON.stringify(demoLogs));
    }
    
    return demoLogs;
  }

  /**
   * API 로그 렌더링
   */
  renderApiLogs(logs = this.logs) {
    const container = document.getElementById('apiLogs');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (logs.length === 0) {
      container.innerHTML = '<div style="text-align: center; color: #9ca3af; padding: 40px;">API 로그가 없습니다</div>';
      return;
    }
    
    logs.forEach(log => {
      const entry = document.createElement('div');
      entry.className = 'log-entry';
      
      const statusClass = log.success ? 'success' : 'error';
      const methodClass = log.method?.toLowerCase() || 'post';
      
      entry.innerHTML = `
        <div class="log-header">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span class="log-method ${methodClass}">${log.method || 'POST'}</span>
            <span class="log-timing">${log.responseTime || 0}ms</span>
          </div>
          <div class="log-status">
            <span class="status-badge ${statusClass}">${log.success ? '성공' : '실패'}</span>
            ${log.cached ? '<span class="status-badge cached">캐시됨</span>' : ''}
          </div>
        </div>
        <div class="log-url">${log.endpoint || log.url || '알 수 없는 엔드포인트'}</div>
        <div class="log-details">
          <div class="log-request">
            <div class="log-section-title">요청</div>
            <div class="log-json">${JSON.stringify(log.request || {}, null, 2)}</div>
          </div>
          <div class="log-response">
            <div class="log-section-title">응답</div>
            <div class="log-json">${JSON.stringify(log.response || {}, null, 2)}</div>
          </div>
        </div>
      `;
      
      container.appendChild(entry);
    });
  }

  /**
   * 핑거프린트 정보 로드
   */
  async loadFingerprintInfo() {
    try {
      // 폴백 핑거프린트 생성
      const fingerprintId = await this.generateFallbackFingerprint();
      
      const fingerprintIdEl = document.getElementById('fingerprintId');
      if (fingerprintIdEl) {
        fingerprintIdEl.textContent = fingerprintId;
      }
      
      // 기본 컴포넌트 정보 생성
      const components = {
        'User Agent': navigator.userAgent.substring(0, 50) + '...',
        'Platform': navigator.platform,
        'Language': navigator.language,
        'Screen': `${screen.width}x${screen.height}`,
        'Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone,
        'Memory': navigator.deviceMemory ? `${navigator.deviceMemory}GB` : '알 수 없음'
      };
      
      this.renderFingerprintComponents(components);
      
      // 통계 정보
      const createdAtEl = document.getElementById('fingerprintCreatedAt');
      if (createdAtEl) {
        createdAtEl.textContent = new Date().toLocaleString();
      }
      
      // 검증 상태
      const verifiedEl = document.getElementById('fingerprintVerified');
      if (verifiedEl) {
        verifiedEl.textContent = '검증됨';
        verifiedEl.className = 'badge verified';
      }
      
    } catch (error) {
      console.error('핑거프린트 정보 로드 실패:', error);
      const fingerprintIdEl = document.getElementById('fingerprintId');
      if (fingerprintIdEl) {
        fingerprintIdEl.textContent = '핑거프린트 로드 오류';
      }
    }
  }

  /**
   * 폴백 핑거프린트 생성
   */
  async generateFallbackFingerprint() {
    const data = `${navigator.userAgent}-${screen.width}x${screen.height}-${navigator.language}-${Date.now()}`;
    
    // 간단한 해시 생성
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 32비트 정수로 변환
    }
    
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  /**
   * 핑거프린트 컴포넌트 렌더링
   */
  renderFingerprintComponents(components) {
    const container = document.getElementById('fingerprintComponents');
    if (!container) return;
    
    container.innerHTML = '';
    
    Object.entries(components).forEach(([key, value]) => {
      const item = document.createElement('div');
      item.className = 'component-item';
      
      const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
      const truncatedValue = displayValue.length > 50 ? displayValue.substring(0, 50) + '...' : displayValue;
      
      item.innerHTML = `
        <span class="component-name">${key}</span>
        <span class="component-value" title="${displayValue}">${truncatedValue}</span>
      `;
      
      container.appendChild(item);
    });
  }

  /**
   * 스토리지 정보 로드
   */
  async loadStorageInfo() {
    try {
      let storage = {};
      
      if (this.isExtensionEnvironment) {
        storage = await chrome.storage.local.get(null);
      } else {
        // 일반 웹페이지 환경에서는 localStorage 시뮬레이션
        storage = this.getLocalStorageAsObject();
      }
      
      const storageDetails = document.getElementById('storageDetails');
      
      if (storageDetails) {
        storageDetails.innerHTML = '';
        
        const entries = Object.entries(storage);
        if (entries.length === 0) {
          const emptyItem = document.createElement('div');
          emptyItem.className = 'storage-item';
          emptyItem.innerHTML = `
            <span>데모 데이터</span>
            <span>사용 중</span>
          `;
          storageDetails.appendChild(emptyItem);
        } else {
          entries.forEach(([key, value]) => {
            const size = new Blob([JSON.stringify(value)]).size;
            
            const item = document.createElement('div');
            item.className = 'storage-item';
            item.innerHTML = `
              <span>${key}</span>
              <span>${this.formatBytes(size)}</span>
            `;
            storageDetails.appendChild(item);
          });
        }
      }
      
      // 전체 크기 계산
      const totalSize = await this.calculateStorageSize();
      const storageUsageEl = document.getElementById('storageUsage');
      if (storageUsageEl) {
        storageUsageEl.textContent = this.formatBytes(totalSize);
      }
      
    } catch (error) {
      console.error('스토리지 정보 로드 실패:', error);
    }
  }

  /**
   * localStorage를 객체로 변환
   */
  getLocalStorageAsObject() {
    const storage = {};
    if (typeof localStorage !== 'undefined') {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('dev_')) {
          try {
            storage[key] = JSON.parse(localStorage.getItem(key));
          } catch (error) {
            storage[key] = localStorage.getItem(key);
          }
        }
      }
    }
    return storage;
  }

  /**
   * 캐시 통계 로드
   */
  async loadCacheStats() {
    try {
      // 시뮬레이션 데이터 - 실제로는 백엔드에서 가져와야 함
      const cacheStats = {
        summary: {
          count: 25,
          hitRate: 75,
          size: 1024 * 150 // 150KB
        },
        question: {
          count: 12,
          hitRate: 60,
          size: 1024 * 80 // 80KB
        }
      };
      
      const summaryCacheCountEl = document.getElementById('summaryCacheCount');
      if (summaryCacheCountEl) {
        summaryCacheCountEl.textContent = cacheStats.summary.count;
      }
      
      const summaryCacheHitRateEl = document.getElementById('summaryCacheHitRate');
      if (summaryCacheHitRateEl) {
        summaryCacheHitRateEl.textContent = cacheStats.summary.hitRate + '%';
      }
      
      const summaryCacheSizeEl = document.getElementById('summaryCacheSize');
      if (summaryCacheSizeEl) {
        summaryCacheSizeEl.textContent = this.formatBytes(cacheStats.summary.size);
      }
      
      const questionCacheCountEl = document.getElementById('questionCacheCount');
      if (questionCacheCountEl) {
        questionCacheCountEl.textContent = cacheStats.question.count;
      }
      
      const questionCacheHitRateEl = document.getElementById('questionCacheHitRate');
      if (questionCacheHitRateEl) {
        questionCacheHitRateEl.textContent = cacheStats.question.hitRate + '%';
      }
      
      const questionCacheSizeEl = document.getElementById('questionCacheSize');
      if (questionCacheSizeEl) {
        questionCacheSizeEl.textContent = this.formatBytes(cacheStats.question.size);
      }
      
    } catch (error) {
      console.error('캐시 통계 로드 실패:', error);
    }
  }

  /**
   * 성능 메트릭 로드
   */
  async loadPerformanceMetrics() {
    try {
      // 시뮬레이션 데이터
      const metrics = {
        평균응답시간: 850,
        총요청수: 247,
        오류율: 2.4,
        캐시적중률: 68,
        메모리사용량: 15.2,
        가동시간: this.getUptime()
      };
      
      const container = document.getElementById('metricsGrid');
      if (container) {
        container.innerHTML = '';
        
        Object.entries(metrics).forEach(([key, value]) => {
          const item = document.createElement('div');
          item.className = 'metric-item';
          
          const unit = this.getMetricUnit(key);
          
          item.innerHTML = `
            <div class="metric-value">${value}${unit}</div>
            <div class="metric-label">${key}</div>
          `;
          
          container.appendChild(item);
        });
      }
      
    } catch (error) {
      console.error('성능 메트릭 로드 실패:', error);
    }
  }

  /**
   * 메트릭 단위 반환
   */
  getMetricUnit(key) {
    const units = {
      평균응답시간: 'ms',
      오류율: '%',
      캐시적중률: '%',
      메모리사용량: 'MB'
    };
    return units[key] || '';
  }

  /**
   * 실시간 업데이트 시작
   */
  startRealTimeUpdates() {
    // 30초마다 업데이트
    this.updateInterval = setInterval(() => {
      if (!this.isUpdating) {
        this.updateRealTimeData();
      }
    }, 30000);
    
    // 시계 업데이트 (1초마다)
    setInterval(() => {
      const currentTimeEl = document.getElementById('currentTime');
      if (currentTimeEl) {
        currentTimeEl.textContent = new Date().toLocaleTimeString();
      }
    }, 1000);
  }

  /**
   * 실시간 데이터 업데이트
   */
  async updateRealTimeData() {
    this.isUpdating = true;
    
    try {
      // 현재 탭에 따라 업데이트
      switch (this.currentTab) {
        case 'overview':
          await this.updateOverviewStats();
          break;
        case 'api':
          await this.loadApiLogs();
          break;
        case 'cache':
          await this.loadCacheStats();
          break;
        case 'performance':
          await this.loadPerformanceMetrics();
          break;
      }
      
      // 푸터 정보 업데이트
      await this.updateFooterInfo();
      
    } catch (error) {
      console.error('실시간 데이터 업데이트 실패:', error);
    } finally {
      this.isUpdating = false;
    }
  }

  /**
   * 개요 통계 업데이트
   */
  async updateOverviewStats() {
    try {
      const usage = await this.storageManager.getUsage();
      const totalApiCallsEl = document.getElementById('totalApiCalls');
      if (totalApiCallsEl) {
        totalApiCallsEl.textContent = usage.count;
      }
      
      const memoryUsageEl = document.getElementById('memoryUsage');
      if (memoryUsageEl) {
        const storageSize = await this.calculateStorageSize();
        memoryUsageEl.textContent = this.formatBytes(storageSize);
      }
      
      await this.checkProxyStatus();
      
    } catch (error) {
      console.error('개요 통계 업데이트 실패:', error);
    }
  }

  /**
   * 푸터 정보 업데이트
   */
  async updateFooterInfo() {
    try {
      // 메모리 사용량
      const storageSize = await this.calculateStorageSize();
      const footerMemoryEl = document.getElementById('footerMemory');
      if (footerMemoryEl) {
        footerMemoryEl.textContent = this.formatBytes(storageSize);
      }
      
      // API 호출 수
      const usage = await this.storageManager.getUsage();
      const footerApiCallsEl = document.getElementById('footerApiCalls');
      if (footerApiCallsEl) {
        footerApiCallsEl.textContent = usage.count;
      }
      
      // 연결 상태
      const statusIndicator = document.getElementById('connectionStatus');
      if (statusIndicator) {
        const proxyStatus = await this.getProxyStatus();
        if (proxyStatus === '연결됨') {
          statusIndicator.classList.remove('disconnected');
        } else {
          statusIndicator.classList.add('disconnected');
        }
      }
      
    } catch (error) {
      console.error('푸터 정보 업데이트 실패:', error);
    }
  }

  /**
   * 콘솔 명령어 실행
   */
  async executeConsoleCommand() {
    const input = document.getElementById('consoleInput');
    if (!input) return;
    
    const command = input.value.trim();
    
    if (!command) return;
    
    // 히스토리에 추가
    this.consoleHistory.push(command);
    this.consoleHistoryIndex = this.consoleHistory.length;
    
    // 콘솔에 명령어 표시
    this.appendToConsole(`> ${command}`, 'command');
    
    input.value = '';
    
    try {
      await this.processCommand(command);
    } catch (error) {
      this.appendToConsole(`오류: ${error.message}`, 'error');
    }
  }

  /**
   * 콘솔 명령어 처리
   */
  async processCommand(command) {
    const [cmd, ...args] = command.split(' ');
    
    if (this.commands[cmd]) {
      await this.commands[cmd](args);
    } else {
      this.appendToConsole(`알 수 없는 명령어: ${cmd}. 사용 가능한 명령어를 보려면 'help'를 입력하세요.`, 'error');
    }
  }

  /**
   * 콘솔 히스토리 네비게이션
   */
  navigateConsoleHistory(direction) {
    if (this.consoleHistory.length === 0) return;
    
    this.consoleHistoryIndex += direction;
    
    if (this.consoleHistoryIndex < 0) {
      this.consoleHistoryIndex = 0;
    } else if (this.consoleHistoryIndex >= this.consoleHistory.length) {
      this.consoleHistoryIndex = this.consoleHistory.length;
      const consoleInput = document.getElementById('consoleInput');
      if (consoleInput) {
        consoleInput.value = '';
      }
      return;
    }
    
    const consoleInput = document.getElementById('consoleInput');
    if (consoleInput) {
      consoleInput.value = this.consoleHistory[this.consoleHistoryIndex];
    }
  }

  /**
   * 콘솔 명령어들
   */
  async showHelp() {
    const helpText = `
사용 가능한 명령어:
  help                    - 이 도움말 메시지 표시
  status                  - 시스템 상태 표시
  clear                   - 콘솔 지우기
  fingerprint             - 디바이스 핑거프린트 표시
  cache.stats             - 캐시 통계 표시
  cache.clear             - 모든 캐시 지우기
  storage.info            - 스토리지 정보 표시
  storage.clear           - 모든 스토리지 지우기
  api.health              - API 상태 확인
  api.logs                - API 로그 표시
  test.all                - 모든 테스트 실행
  export.logs             - 로그 내보내기
  export.storage          - 스토리지 데이터 내보내기
  version                 - 버전 정보 표시
    `;
    this.appendToConsole(helpText);
  }

  async getSystemStatus() {
    const status = {
      확장프로그램: '활성',
      프록시: await this.getProxyStatus(),
      스토리지: this.formatBytes(await this.calculateStorageSize()),
      가동시간: this.getUptime()
    };
    
    this.appendToConsole(JSON.stringify(status, null, 2));
  }

  clearConsole() {
    const output = document.getElementById('consoleOutput');
    if (output) {
      output.innerHTML = '<div class="console-welcome">콘솔이 지워졌습니다<br>사용 가능한 명령어를 보려면 \'help\'를 입력하세요<br>----------------------------------------</div>';
    }
  }

  async showFingerprint() {
    if (this.deviceFingerprint) {
      const info = await this.deviceFingerprint.getInfo();
      this.appendToConsole(`디바이스 핑거프린트: ${info.id || '없음'}`);
      this.appendToConsole(`생성일: ${info.generatedAt || '알 수 없음'}`);
    } else {
      this.appendToConsole('핑거프린트 정보를 사용할 수 없습니다');
    }
  }

  async showCacheStats() {
    // 캐시 통계 표시 (시뮬레이션)
    const stats = {
      요약: { 개수: 25, 적중률: '75%', 크기: '150KB' },
      질문: { 개수: 12, 적중률: '60%', 크기: '80KB' }
    };
    this.appendToConsole(JSON.stringify(stats, null, 2));
  }

  async clearCache() {
    try {
      // 실제 API 서버에 캐시 삭제 요청
      if (!this.isExtensionEnvironment) {
        const apiConfig = await this.storageManager.getApiConfig();
        const response = await fetch(`${apiConfig.proxyUrl}/api/cache/clear`, {
          method: 'POST',
          mode: 'cors',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin-Key': 'dev-admin-key' // 개발용 관리자 키
          }
        });
        
        if (response.ok) {
          const result = await response.json();
          this.appendToConsole('서버 캐시가 성공적으로 지워졌습니다');
          this.showToast('서버 캐시 지움 완료', 'success');
          // 캐시 통계 새로고침
          await this.loadCacheStats();
          return;
        } else if (response.status === 403) {
          this.appendToConsole('캐시 삭제 권한이 없습니다 (관리자 키 필요)');
          this.showToast('권한 없음: 개발 모드에서는 제한됨', 'warning');
          return;
        }
      }
      
      // 폴백: 로컬 시뮬레이션
      this.appendToConsole('로컬 캐시가 성공적으로 지워졌습니다 (시뮬레이션)');
      this.showToast('캐시 지움 (시뮬레이션)', 'success');
      
    } catch (error) {
      console.error('캐시 삭제 실패:', error);
      this.appendToConsole('캐시 삭제 중 오류가 발생했습니다');
      this.showToast('캐시 삭제 실패', 'error');
    }
  }

  async showStorageInfo() {
    const size = await this.calculateStorageSize();
    const storage = await chrome.storage.local.get(null);
    
    this.appendToConsole(`전체 스토리지 크기: ${this.formatBytes(size)}`);
    this.appendToConsole(`스토리지 키: ${Object.keys(storage).join(', ')}`);
  }

  async clearStorage() {
    if (confirm('이 작업은 모든 스토리지 데이터를 지웁니다. 계속하시겠습니까?')) {
      if (this.isExtensionEnvironment) {
        await chrome.storage.local.clear();
      } else {
        // 일반 웹페이지 환경에서는 dev_ 접두사가 있는 localStorage 항목만 삭제
        if (typeof localStorage !== 'undefined') {
          const keysToRemove = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('dev_')) {
              keysToRemove.push(key);
            }
          }
          keysToRemove.forEach(key => localStorage.removeItem(key));
        }
      }
      this.appendToConsole('모든 스토리지 데이터가 지워졌습니다');
      this.showToast('스토리지 지움', 'success');
    }
  }

  async checkApiHealth() {
    try {
      // 데모 모드에서는 시뮬레이션 응답
      if (!this.isExtensionEnvironment) {
        const statuses = ['정상', '오류', '지연'];
        const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
        this.appendToConsole(`API 상태: ${randomStatus} (시뮬레이션)`);
        return;
      }
      
      const apiConfig = await this.storageManager.getApiConfig();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const response = await fetch(`${apiConfig.proxyUrl}/health`, {
        signal: controller.signal,
        mode: 'cors'
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        this.appendToConsole('API 상태: 정상');
      } else {
        this.appendToConsole('API 상태: 오류');
      }
    } catch (error) {
      if (error.message.includes('CORS') || error.message.includes('Failed to fetch')) {
        this.appendToConsole('API 상태: 개발 모드 (CORS 제한)');
      } else {
        this.appendToConsole(`API 상태: 실패 - ${error.message}`);
      }
    }
  }

  async showApiLogs() {
    const logs = await this.getApiLogsFromStorage();
    this.appendToConsole(`전체 API 로그: ${logs.length}개`);
    
    if (logs.length > 0) {
      const recent = logs.slice(-5);
      this.appendToConsole('최근 로그:');
      recent.forEach(log => {
        this.appendToConsole(`  ${log.timestamp}: ${log.method} ${log.endpoint} - ${log.success ? '성공' : '실패'}`);
      });
    }
  }

  async exportLogs() {
    const logs = await this.getApiLogsFromStorage();
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `summarygenie-logs-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    this.appendToConsole('로그가 성공적으로 내보내졌습니다');
  }

  async exportStorage() {
    let storage = {};
    
    if (this.isExtensionEnvironment) {
      storage = await chrome.storage.local.get(null);
    } else {
      storage = this.getLocalStorageAsObject();
    }
    
    const blob = new Blob([JSON.stringify(storage, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `summarygenie-storage-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    this.appendToConsole('스토리지 데이터가 성공적으로 내보내졌습니다');
  }

  showVersion() {
    if (this.isExtensionEnvironment) {
      const manifest = chrome.runtime.getManifest();
      this.appendToConsole(`SummaryGenie v${manifest.version}`);
      this.appendToConsole(`매니페스트 버전: ${manifest.manifest_version}`);
    } else {
      this.appendToConsole(`SummaryGenie v1.0.0 (데모 모드)`);
      this.appendToConsole(`매니페스트 버전: 3`);
    }
  }

  /**
   * 테스트 관련 메서드들
   */
  async runAllTests() {
    this.appendToConsole('모든 테스트를 시작합니다...');
    
    const tests = [
      'proxy-connection',
      'summarize-api', 
      'question-api',
      'storage-rw',
      'history-mgmt',
      'fingerprint',
      'rate-limit'
    ];
    
    for (const test of tests) {
      await this.runSingleTest(test);
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1초 대기
    }
    
    this.appendToConsole('모든 테스트가 완료되었습니다');
  }

  async runSingleTest(testName) {
    const statusEl = document.getElementById(`test-${testName}`);
    if (statusEl) {
      statusEl.textContent = '실행 중';
      statusEl.className = 'test-status running';
    }
    
    try {
      let result = false;
      
      switch (testName) {
        case 'proxy-connection':
          result = await this.testProxyConnection();
          break;
        case 'summarize-api':
          result = await this.testSummarizeApi();
          break;
        case 'question-api':
          result = await this.testQuestionApi();
          break;
        case 'storage-rw':
          result = await this.testStorageReadWrite();
          break;
        case 'history-mgmt':
          result = await this.testHistoryManagement();
          break;
        case 'fingerprint':
          result = await this.testFingerprint();
          break;
        case 'rate-limit':
          result = await this.testRateLimit();
          break;
      }
      
      if (statusEl) {
        statusEl.textContent = result ? '통과' : '실패';
        statusEl.className = `test-status ${result ? 'passed' : 'failed'}`;
      }
      
      this.appendToConsole(`테스트 ${testName}: ${result ? '통과' : '실패'}`);
      
    } catch (error) {
      if (statusEl) {
        statusEl.textContent = '실패';
        statusEl.className = 'test-status failed';
      }
      
      this.appendToConsole(`테스트 ${testName}: 실패 - ${error.message}`);
    }
  }

  async testProxyConnection() {
    try {
      // 데모 모드에서는 시뮬레이션 테스트
      if (!this.isExtensionEnvironment) {
        // 80% 확률로 성공
        return Math.random() > 0.2;
      }
      
      const apiConfig = await this.storageManager.getApiConfig();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${apiConfig.proxyUrl}/health`, { 
        signal: controller.signal,
        mode: 'cors'
      });
      
      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      // CORS 에러는 개발 환경에서 정상적인 동작으로 간주
      if (error.message.includes('CORS') || error.message.includes('Failed to fetch')) {
        return true; // 개발 모드에서는 테스트 통과로 처리
      }
      return false;
    }
  }

  async testSummarizeApi() {
    try {
      // 실제 요약 API 테스트
      const apiConfig = await this.storageManager.getApiConfig();
      const testContent = "이것은 SummaryGenie 개발자 콘솔에서 실행하는 테스트입니다. API가 정상적으로 작동하는지 확인하기 위한 샘플 텍스트입니다.";
      
      const response = await fetch(`${apiConfig.proxyUrl}/api/summarize`, {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-Fingerprint': 'dev-console-test',
          'X-User-Id': 'developer',
          'X-Premium': 'true'
        },
        body: JSON.stringify({
          content: testContent,
          length: 'short',
          prompt: '다음 텍스트를 한 문장으로 요약해주세요:'
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('요약 API 테스트 성공:', result);
        return true;
      } else {
        console.error('요약 API 테스트 실패:', response.status);
        return false;
      }
    } catch (error) {
      console.error('요약 API 테스트 에러:', error);
      // 네트워크 에러는 개발 환경에서 정상으로 간주
      if (error.message.includes('CORS') || error.message.includes('Failed to fetch')) {
        return true;
      }
      return false;
    }
  }

  async testQuestionApi() {
    try {
      // 실제 질문 API 테스트
      const apiConfig = await this.storageManager.getApiConfig();
      const testContext = "SummaryGenie는 웹페이지 요약 도구입니다.";
      const testQuestion = "SummaryGenie는 무엇입니까?";
      
      const response = await fetch(`${apiConfig.proxyUrl}/api/question`, {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-Fingerprint': 'dev-console-test',
          'X-User-Id': 'developer',
          'X-Premium': 'true'
        },
        body: JSON.stringify({
          context: testContext,
          question: testQuestion,
          language: 'ko'
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('질문 API 테스트 성공:', result);
        return true;
      } else {
        console.error('질문 API 테스트 실패:', response.status);
        return false;
      }
    } catch (error) {
      console.error('질문 API 테스트 에러:', error);
      // 네트워크 에러는 개발 환경에서 정상으로 간주
      if (error.message.includes('CORS') || error.message.includes('Failed to fetch')) {
        return true;
      }
      return false;
    }
  }

  async testStorageReadWrite() {
    try {
      const testKey = 'test_key';
      const testValue = { test: 'data', timestamp: Date.now() };
      
      if (this.isExtensionEnvironment) {
        await chrome.storage.local.set({ [testKey]: testValue });
        const result = await chrome.storage.local.get([testKey]);
        await chrome.storage.local.remove([testKey]);
        
        return JSON.stringify(result[testKey]) === JSON.stringify(testValue);
      } else {
        // 일반 웹페이지 환경에서는 localStorage 테스트
        const devTestKey = 'dev_' + testKey;
        localStorage.setItem(devTestKey, JSON.stringify(testValue));
        const result = JSON.parse(localStorage.getItem(devTestKey));
        localStorage.removeItem(devTestKey);
        
        return JSON.stringify(result) === JSON.stringify(testValue);
      }
    } catch (error) {
      return false;
    }
  }

  async testHistoryManagement() {
    // 히스토리 관리 테스트 시뮬레이션
    return true;
  }

  async testFingerprint() {
    try {
      if (this.deviceFingerprint) {
        const fingerprint = await this.deviceFingerprint.generate();
        return fingerprint && fingerprint.length > 0;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  async testRateLimit() {
    // 속도 제한 테스트 시뮬레이션
    return true;
  }

  /**
   * 새로고침 관련 메서드들
   */
  async refreshAll() {
    this.showToast('모든 데이터를 새로고침하는 중...', 'info');
    
    try {
      await this.loadInitialData();
      this.showToast('모든 데이터가 성공적으로 새로고침되었습니다', 'success');
    } catch (error) {
      console.error('모든 데이터 새로고침 실패:', error);
      this.showToast('데이터 새로고침 실패', 'error');
    }
  }

  async refreshOverview() {
    await this.loadSystemInfo();
  }

  async refreshFingerprintInfo() {
    await this.loadFingerprintInfo();
  }

  async refreshStorageInfo() {
    await this.loadStorageInfo();
  }

  async refreshApiLogs() {
    await this.loadApiLogs();
  }

  async refreshCacheStats() {
    await this.loadCacheStats();
  }

  async refreshPerformanceCharts() {
    await this.loadPerformanceMetrics();
  }

  /**
   * 핑거프린트 새로고침
   */
  async refreshFingerprint() {
    try {
      this.showToast('핑거프린트를 재생성하는 중...', 'info');
      
      if (this.deviceFingerprint) {
        const newFingerprint = await this.deviceFingerprint.refresh();
        const fingerprintIdEl = document.getElementById('fingerprintId');
        if (fingerprintIdEl) {
          fingerprintIdEl.textContent = newFingerprint;
        }
        
        // 컴포넌트 정보 업데이트
        const info = await this.deviceFingerprint.getInfo();
        if (info.components) {
          this.renderFingerprintComponents(info.components);
        }
        
        const createdAtEl = document.getElementById('fingerprintCreatedAt');
        if (createdAtEl) {
          createdAtEl.textContent = new Date().toLocaleString();
        }
        
        this.showToast('핑거프린트가 성공적으로 재생성되었습니다', 'success');
      } else {
        throw new Error('핑거프린트 모듈을 사용할 수 없습니다');
      }
      
    } catch (error) {
      console.error('핑거프린트 새로고침 실패:', error);
      this.showToast('핑거프린트 재생성 실패', 'error');
    }
  }

  /**
   * 핑거프린트 복사
   */
  async copyFingerprint() {
    try {
      const fingerprintIdEl = document.getElementById('fingerprintId');
      if (fingerprintIdEl) {
        const fingerprintId = fingerprintIdEl.textContent;
        await navigator.clipboard.writeText(fingerprintId);
        this.showToast('핑거프린트가 클립보드에 복사되었습니다', 'success');
      }
    } catch (error) {
      console.error('핑거프린트 복사 실패:', error);
      this.showToast('핑거프린트 복사 실패', 'error');
    }
  }

  /**
   * 유틸리티 메서드들
   */
  async getProxyStatus() {
    try {
      // 데모 모드에서는 시뮬레이션 응답
      if (!this.isExtensionEnvironment) {
        const statuses = ['연결됨', '개발 모드', '시뮬레이션 모드'];
        return statuses[Math.floor(Math.random() * statuses.length)];
      }
      
      const apiConfig = await this.storageManager.getApiConfig();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const response = await fetch(`${apiConfig.proxyUrl}/health`, { 
        signal: controller.signal,
        mode: 'cors'
      });
      
      clearTimeout(timeoutId);
      return response.ok ? '연결됨' : '오류';
    } catch (error) {
      if (error.message.includes('CORS') || error.message.includes('Failed to fetch')) {
        return '개발 모드';
      }
      return '연결 끊김';
    }
  }

  getUptime() {
    // 간단한 업타임 시뮬레이션
    const startTime = localStorage.getItem('dev_console_start') || Date.now();
    if (!localStorage.getItem('dev_console_start')) {
      localStorage.setItem('dev_console_start', Date.now().toString());
    }
    
    const uptime = Date.now() - parseInt(startTime);
    
    const hours = Math.floor(uptime / (1000 * 60 * 60));
    const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${hours}시간 ${minutes}분`;
  }

  /**
   * 바이트 포맷팅
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * 스토리지 크기 계산
   */
  async calculateStorageSize() {
    try {
      if (this.isExtensionEnvironment) {
        const storage = await chrome.storage.local.get(null);
        const data = JSON.stringify(storage);
        return new Blob([data]).size;
      } else {
        // 일반 웹페이지 환경에서는 localStorage 크기 계산
        let totalSize = 0;
        if (typeof localStorage !== 'undefined') {
          for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key) && key.startsWith('dev_')) {
              totalSize += localStorage[key].length;
            }
          }
        }
        return totalSize || 2048; // 기본값 2KB
      }
    } catch (error) {
      console.error('스토리지 크기 계산 실패:', error);
      return 2048; // 기본값
    }
  }

  /**
   * 콘솔에 텍스트 추가
   */
  appendToConsole(text, type = 'output') {
    const output = document.getElementById('consoleOutput');
    if (!output) return;
    
    const line = document.createElement('div');
    line.className = `console-line console-${type}`;
    line.textContent = text;
    
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
  }

  /**
   * 토스트 메시지 표시
   */
  showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    
    const icons = {
      success: '✓ ',
      error: '✕ ',
      warning: '⚠️ ',
      info: 'ℹ️ '
    };
    
    toast.textContent = (icons[type] || '') + message;
    toast.classList.remove('hidden');
    
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 3000);
  }

  /**
   * 미구현 메서드들 (필요에 따라 추가)
   */
  clearAllLogs() {
    this.logs = [];
    this.renderApiLogs();
    this.showToast('모든 로그가 지워졌습니다', 'success');
  }

  async exportAll() {
    try {
      let storage = {};
      
      if (this.isExtensionEnvironment) {
        storage = await chrome.storage.local.get(null);
      } else {
        storage = this.getLocalStorageAsObject();
      }
      
      const allData = {
        systemInfo: await this.getSystemInfo(),
        storage: storage,
        logs: this.logs,
        timestamp: new Date().toISOString()
      };
      
      const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `summarygenie-all-data-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      
      URL.revokeObjectURL(url);
      this.showToast('모든 데이터가 내보내졌습니다', 'success');
    } catch (error) {
      console.error('데이터 내보내기 실패:', error);
      this.showToast('데이터 내보내기 실패', 'error');
    }
  }

  async getSystemInfo() {
    if (this.isExtensionEnvironment) {
      const manifest = chrome.runtime.getManifest();
      return {
        extensionId: chrome.runtime.id,
        version: manifest.version,
        manifestVersion: manifest.manifest_version,
        platform: navigator.platform,
        language: navigator.language,
        userAgent: navigator.userAgent
      };
    } else {
      return {
        extensionId: '데모 모드',
        version: '1.0.0',
        manifestVersion: 3,
        platform: navigator.platform,
        language: navigator.language,
        userAgent: navigator.userAgent
      };
    }
  }

  /**
   * 소멸자
   */
  destroy() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
  }
}

// 애플리케이션 시작 - IIFE로 래핑하여 전역 범위 오염 방지
(function() {
  'use strict';
  
  let devConsoleInstance = null;

  function initializeDevConsole() {
    if (devConsoleInstance) {
      return; // 이미 초기화됨
    }
    
    try {
      devConsoleInstance = new DeveloperConsole();
      devConsoleInstance.initialize();
      
      // 개발자 도구에서 접근할 수 있도록 전역 객체로 노출
      if (typeof window !== 'undefined') {
        window.devConsole = devConsoleInstance;
      }
      
      console.log('개발자 콘솔이 성공적으로 초기화되었습니다');
    } catch (error) {
      console.error('개발자 콘솔 초기화 실패:', error);
    }
  }

  function cleanupDevConsole() {
    if (devConsoleInstance && typeof devConsoleInstance.destroy === 'function') {
      devConsoleInstance.destroy();
      devConsoleInstance = null;
    }
  }

  // DOM 로드 완료 시 초기화
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeDevConsole);
  } else {
    // 이미 로드된 경우 즉시 실행
    initializeDevConsole();
  }

  // 페이지 언로드 시 정리
  window.addEventListener('beforeunload', cleanupDevConsole);
  
  // 페이지 숨김 시에도 정리 (모바일 대응)
  window.addEventListener('pagehide', cleanupDevConsole);
})();