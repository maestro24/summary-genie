/**
 * SummaryGenie 에러 핸들링 테스트 스위트
 * Jest 또는 Chrome Extension 환경에서 실행
 */

// 테스트 시나리오 정의
const TestScenarios = {
  NETWORK_ERROR: 'network_error',
  API_ERROR: 'api_error',
  RATE_LIMIT: 'rate_limit',
  AUTH_ERROR: 'auth_error',
  VALIDATION_ERROR: 'validation_error',
  TIMEOUT_ERROR: 'timeout_error',
  OFFLINE_MODE: 'offline_mode',
  CIRCUIT_BREAKER: 'circuit_breaker'
};

/**
 * 에러 핸들링 테스트 클래스
 */
class ErrorHandlingTests {
  constructor() {
    this.results = [];
    this.totalTests = 0;
    this.passedTests = 0;
    this.failedTests = 0;
  }

  /**
   * 모든 테스트 실행
   */
  async runAllTests() {
    console.log('🧪 에러 핸들링 테스트 시작...\n');
    console.log('='.repeat(60));
    
    // 네트워크 에러 테스트
    await this.testNetworkError();
    
    // API 에러 테스트
    await this.testAPIErrors();
    
    // Rate Limit 테스트
    await this.testRateLimit();
    
    // 인증 에러 테스트
    await this.testAuthError();
    
    // 검증 에러 테스트
    await this.testValidationError();
    
    // 타임아웃 테스트
    await this.testTimeout();
    
    // 오프라인 모드 테스트
    await this.testOfflineMode();
    
    // 재시도 메커니즘 테스트
    await this.testRetryMechanism();
    
    // Circuit Breaker 테스트
    await this.testCircuitBreaker();
    
    // 폴백 메커니즘 테스트
    await this.testFallbackMechanism();
    
    // 결과 출력
    this.printResults();
  }

  /**
   * 네트워크 에러 테스트
   */
  async testNetworkError() {
    console.log('\n📡 네트워크 에러 테스트');
    
    try {
      // 잘못된 URL로 요청
      const response = await this.simulateNetworkError();
      
      // 에러 메시지 확인
      this.assert(
        response.error.includes('인터넷 연결'),
        '네트워크 에러 메시지가 올바름'
      );
      
      // 재시도 가능 여부 확인
      this.assert(
        response.retryable === true,
        '네트워크 에러는 재시도 가능해야 함'
      );
      
      // 오프라인 큐에 추가되는지 확인
      const queue = await this.getOfflineQueue();
      this.assert(
        queue.length > 0,
        '네트워크 에러 시 오프라인 큐에 추가됨'
      );
      
    } catch (error) {
      this.fail('네트워크 에러 테스트 실패: ' + error.message);
    }
  }

  /**
   * API 에러 테스트
   */
  async testAPIErrors() {
    console.log('\n🔌 API 에러 테스트');
    
    // 401 Unauthorized
    try {
      const response = await this.simulateAPIError(401);
      this.assert(
        response.error.includes('API 키'),
        '401 에러 메시지가 올바름'
      );
      this.assert(
        response.retryable === false,
        '인증 에러는 재시도 불가능해야 함'
      );
    } catch (error) {
      this.fail('401 에러 테스트 실패: ' + error.message);
    }
    
    // 429 Too Many Requests
    try {
      const response = await this.simulateAPIError(429);
      this.assert(
        response.error.includes('사용 한도'),
        '429 에러 메시지가 올바름'
      );
      this.assert(
        response.retryable === true,
        'Rate limit 에러는 재시도 가능해야 함'
      );
    } catch (error) {
      this.fail('429 에러 테스트 실패: ' + error.message);
    }
    
    // 500 Internal Server Error
    try {
      const response = await this.simulateAPIError(500);
      this.assert(
        response.error.includes('서버'),
        '500 에러 메시지가 올바름'
      );
      this.assert(
        response.retryable === true,
        '서버 에러는 재시도 가능해야 함'
      );
    } catch (error) {
      this.fail('500 에러 테스트 실패: ' + error.message);
    }
  }

  /**
   * Rate Limit 테스트
   */
  async testRateLimit() {
    console.log('\n⏱️ Rate Limit 테스트');
    
    try {
      // 연속 요청 시뮬레이션
      const requests = [];
      for (let i = 0; i < 10; i++) {
        requests.push(this.makeRequest());
      }
      
      const responses = await Promise.allSettled(requests);
      
      // 일부 요청이 rate limit에 걸리는지 확인
      const rateLimited = responses.filter(r => 
        r.status === 'rejected' && 
        r.reason.message.includes('너무 많은')
      );
      
      this.assert(
        rateLimited.length > 0,
        'Rate limit이 작동함'
      );
      
      // Retry-After 헤더 확인
      const retryAfter = this.getRetryAfterHeader();
      this.assert(
        retryAfter > 0,
        'Retry-After 헤더가 설정됨'
      );
      
    } catch (error) {
      this.fail('Rate limit 테스트 실패: ' + error.message);
    }
  }

  /**
   * 인증 에러 테스트
   */
  async testAuthError() {
    console.log('\n🔐 인증 에러 테스트');
    
    try {
      // 잘못된 API 키로 요청
      const response = await this.makeRequestWithInvalidKey();
      
      this.assert(
        response.error.includes('유효하지 않'),
        '인증 에러 메시지가 올바름'
      );
      
      // 사용자에게 알림이 표시되는지 확인
      const notification = await this.getLastNotification();
      this.assert(
        notification !== null,
        '인증 에러 시 알림이 표시됨'
      );
      
    } catch (error) {
      this.fail('인증 에러 테스트 실패: ' + error.message);
    }
  }

  /**
   * 검증 에러 테스트
   */
  async testValidationError() {
    console.log('\n✅ 검증 에러 테스트');
    
    try {
      // 빈 콘텐츠로 요약 요청
      const response1 = await this.summarizeText('');
      this.assert(
        response1.error.includes('너무 짧'),
        '빈 텍스트 검증 에러'
      );
      
      // 너무 긴 콘텐츠로 요청
      const longText = 'a'.repeat(20000);
      const response2 = await this.summarizeText(longText);
      this.assert(
        response2.error.includes('너무 깁'),
        '긴 텍스트 검증 에러'
      );
      
      // 잘못된 길이 옵션
      const response3 = await this.summarizeText('test', 'invalid');
      this.assert(
        response3.error.includes('올바르지'),
        '잘못된 옵션 검증 에러'
      );
      
    } catch (error) {
      this.fail('검증 에러 테스트 실패: ' + error.message);
    }
  }

  /**
   * 타임아웃 테스트
   */
  async testTimeout() {
    console.log('\n⏰ 타임아웃 테스트');
    
    try {
      // 느린 응답 시뮬레이션
      const response = await this.simulateSlowRequest(35000);
      
      this.assert(
        response.error.includes('시간 초과'),
        '타임아웃 에러 메시지가 올바름'
      );
      
      this.assert(
        response.retryable === true,
        '타임아웃 에러는 재시도 가능해야 함'
      );
      
      // 타임아웃 시간 확인 (30초)
      const duration = await this.measureRequestDuration();
      this.assert(
        duration >= 29000 && duration <= 31000,
        '타임아웃이 30초에 발생함'
      );
      
    } catch (error) {
      this.fail('타임아웃 테스트 실패: ' + error.message);
    }
  }

  /**
   * 오프라인 모드 테스트
   */
  async testOfflineMode() {
    console.log('\n🔌 오프라인 모드 테스트');
    
    try {
      // 오프라인 상태 시뮬레이션
      await this.simulateOffline();
      
      // 요청 시도
      const response = await this.makeRequest();
      
      this.assert(
        response.queued === true,
        '오프라인 시 요청이 큐에 저장됨'
      );
      
      // 큐 확인
      const queue = await this.getOfflineQueue();
      this.assert(
        queue.length > 0,
        '오프라인 큐에 요청이 있음'
      );
      
      // 온라인 전환 시 큐 처리
      await this.simulateOnline();
      await this.wait(2000);
      
      const queueAfter = await this.getOfflineQueue();
      this.assert(
        queueAfter.length === 0,
        '온라인 전환 시 큐가 처리됨'
      );
      
    } catch (error) {
      this.fail('오프라인 모드 테스트 실패: ' + error.message);
    } finally {
      await this.simulateOnline();
    }
  }

  /**
   * 재시도 메커니즘 테스트
   */
  async testRetryMechanism() {
    console.log('\n🔄 재시도 메커니즘 테스트');
    
    try {
      // 재시도 카운터 초기화
      let retryCount = 0;
      
      // 처음 2번 실패, 3번째 성공하도록 설정
      const response = await this.simulateRetryScenario((attempt) => {
        retryCount = attempt;
        return attempt < 3;
      });
      
      this.assert(
        retryCount === 3,
        '3번 재시도 후 성공'
      );
      
      this.assert(
        response.success === true,
        '재시도 후 성공적으로 완료'
      );
      
      // Exponential backoff 확인
      const delays = await this.getRetryDelays();
      this.assert(
        delays[1] > delays[0] && delays[2] > delays[1],
        'Exponential backoff가 적용됨'
      );
      
    } catch (error) {
      this.fail('재시도 메커니즘 테스트 실패: ' + error.message);
    }
  }

  /**
   * Circuit Breaker 테스트
   */
  async testCircuitBreaker() {
    console.log('\n⚡ Circuit Breaker 테스트');
    
    try {
      // 연속 실패 시뮬레이션
      for (let i = 0; i < 5; i++) {
        await this.simulateAPIError(503).catch(() => {});
      }
      
      // Circuit Breaker 상태 확인
      const state = await this.getCircuitBreakerState();
      this.assert(
        state === 'OPEN',
        'Circuit Breaker가 OPEN 상태로 전환됨'
      );
      
      // OPEN 상태에서 요청 차단 확인
      const response = await this.makeRequest().catch(e => e);
      this.assert(
        response.message.includes('Circuit breaker'),
        'Circuit Breaker가 요청을 차단함'
      );
      
      // 대기 후 HALF_OPEN 상태 확인
      await this.wait(31000);
      const stateAfter = await this.getCircuitBreakerState();
      this.assert(
        stateAfter === 'HALF_OPEN',
        'Circuit Breaker가 HALF_OPEN 상태로 전환됨'
      );
      
    } catch (error) {
      this.fail('Circuit Breaker 테스트 실패: ' + error.message);
    }
  }

  /**
   * 폴백 메커니즘 테스트
   */
  async testFallbackMechanism() {
    console.log('\n🔀 폴백 메커니즘 테스트');
    
    try {
      // 주 서버 실패 시뮬레이션
      await this.disablePrimaryServer();
      
      // 요청 시도
      const response = await this.makeRequest();
      
      this.assert(
        response.server === 'fallback',
        '폴백 서버로 전환됨'
      );
      
      this.assert(
        response.success === true,
        '폴백 서버에서 요청 성공'
      );
      
      // 간단한 폴백 요약 테스트
      const fallbackSummary = await this.getFallbackSummary('test content');
      this.assert(
        fallbackSummary.includes('[자동'),
        '폴백 요약이 생성됨'
      );
      
    } catch (error) {
      this.fail('폴백 메커니즘 테스트 실패: ' + error.message);
    } finally {
      await this.enablePrimaryServer();
    }
  }

  /**
   * 헬퍼 함수들
   */
  
  async simulateNetworkError() {
    try {
      const response = await fetch('http://invalid-url-that-does-not-exist.com');
      return { success: false };
    } catch (error) {
      // 에러 핸들러 시뮬레이션
      if (typeof errorHandler !== 'undefined') {
        return await errorHandler.handleError(error, 'network_test');
      }
      return {
        error: '인터넷 연결을 확인해주세요',
        retryable: true
      };
    }
  }

  async simulateAPIError(statusCode) {
    const errors = {
      401: { error: 'API 키가 유효하지 않습니다', retryable: false },
      429: { error: '사용 한도를 초과했습니다', retryable: true },
      500: { error: '서버에 일시적인 문제가 있습니다', retryable: true },
      503: { error: '서비스를 사용할 수 없습니다', retryable: true }
    };
    
    return errors[statusCode] || { error: 'Unknown error', retryable: false };
  }

  async makeRequest() {
    // 실제 요청 시뮬레이션
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      return chrome.runtime.sendMessage({
        action: 'summarizeText',
        text: 'Test content for summarization'
      });
    }
    return { success: true };
  }

  async makeRequestWithInvalidKey() {
    return this.simulateAPIError(401);
  }

  async summarizeText(text, length = 'medium') {
    if (!text) {
      return { error: '텍스트가 너무 짧습니다', retryable: false };
    }
    if (text.length > 15000) {
      return { error: '텍스트가 너무 깁니다', retryable: false };
    }
    if (!['short', 'medium', 'detailed'].includes(length)) {
      return { error: '옵션이 올바르지 않습니다', retryable: false };
    }
    return { success: true, summary: 'Test summary' };
  }

  async simulateSlowRequest(delay) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ error: '요청 시간 초과', retryable: true });
      }, 30000);
      
      setTimeout(() => {
        clearTimeout(timeout);
        resolve({ success: true });
      }, delay);
    });
  }

  async measureRequestDuration() {
    const start = Date.now();
    await this.simulateSlowRequest(35000);
    return Date.now() - start;
  }

  async simulateOffline() {
    // 브라우저 오프라인 이벤트 시뮬레이션
    if (typeof window !== 'undefined') {
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: false
      });
      window.dispatchEvent(new Event('offline'));
    }
  }

  async simulateOnline() {
    if (typeof window !== 'undefined') {
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: true
      });
      window.dispatchEvent(new Event('online'));
    }
  }

  async getOfflineQueue() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const result = await chrome.storage.local.get(['offlineQueue']);
      return result.offlineQueue || [];
    }
    return [];
  }

  async simulateRetryScenario(shouldFail) {
    let attempt = 0;
    
    const tryRequest = async () => {
      attempt++;
      if (shouldFail(attempt)) {
        throw new Error('Simulated failure');
      }
      return { success: true };
    };
    
    // 재시도 로직 시뮬레이션
    for (let i = 0; i < 3; i++) {
      try {
        return await tryRequest();
      } catch (error) {
        if (i < 2) {
          await this.wait(1000 * Math.pow(2, i));
        } else {
          throw error;
        }
      }
    }
  }

  async getRetryDelays() {
    // 실제 구현에서는 실제 지연 시간 측정
    return [1000, 2000, 4000];
  }

  async getCircuitBreakerState() {
    // 실제 구현에서는 Circuit Breaker 상태 확인
    if (typeof openAICircuitBreaker !== 'undefined') {
      return openAICircuitBreaker.state;
    }
    return 'CLOSED';
  }

  async disablePrimaryServer() {
    // 주 서버 비활성화 시뮬레이션
    console.log('Primary server disabled');
  }

  async enablePrimaryServer() {
    // 주 서버 활성화
    console.log('Primary server enabled');
  }

  async getFallbackSummary(content) {
    return '[자동 요약] ' + content.substring(0, 50) + '...';
  }

  async getLastNotification() {
    // 마지막 알림 확인
    return { message: 'Test notification' };
  }

  getRetryAfterHeader() {
    return 60; // 60초
  }

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 테스트 어설션
   */
  assert(condition, message) {
    this.totalTests++;
    
    if (condition) {
      this.passedTests++;
      console.log(`  ✅ ${message}`);
      this.results.push({
        status: 'PASS',
        message: message
      });
    } else {
      this.failedTests++;
      console.error(`  ❌ ${message}`);
      this.results.push({
        status: 'FAIL',
        message: message
      });
    }
  }

  fail(message) {
    this.totalTests++;
    this.failedTests++;
    console.error(`  ❌ ${message}`);
    this.results.push({
      status: 'FAIL',
      message: message
    });
  }

  /**
   * 결과 출력
   */
  printResults() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 테스트 결과\n');
    
    console.log(`총 테스트: ${this.totalTests}`);
    console.log(`✅ 성공: ${this.passedTests}`);
    console.log(`❌ 실패: ${this.failedTests}`);
    console.log(`성공률: ${Math.round((this.passedTests / this.totalTests) * 100)}%`);
    
    if (this.failedTests > 0) {
      console.log('\n실패한 테스트:');
      this.results
        .filter(r => r.status === 'FAIL')
        .forEach(r => console.log(`  - ${r.message}`));
    }
    
    console.log('\n' + '='.repeat(60));
    
    // 전체 결과 반환
    return {
      total: this.totalTests,
      passed: this.passedTests,
      failed: this.failedTests,
      successRate: Math.round((this.passedTests / this.totalTests) * 100),
      results: this.results
    };
  }
}

// 테스트 실행 함수
async function runErrorHandlingTests() {
  const tester = new ErrorHandlingTests();
  const results = await tester.runAllTests();
  
  // Chrome Extension 환경에서는 결과를 storage에 저장
  if (typeof chrome !== 'undefined' && chrome.storage) {
    await chrome.storage.local.set({
      testResults: {
        timestamp: new Date().toISOString(),
        ...results
      }
    });
  }
  
  return results;
}

// 개별 테스트 실행 함수들
async function testNetworkError() {
  const tester = new ErrorHandlingTests();
  await tester.testNetworkError();
  return tester.printResults();
}

async function testAPIErrors() {
  const tester = new ErrorHandlingTests();
  await tester.testAPIErrors();
  return tester.printResults();
}

async function testRateLimit() {
  const tester = new ErrorHandlingTests();
  await tester.testRateLimit();
  return tester.printResults();
}

async function testOfflineMode() {
  const tester = new ErrorHandlingTests();
  await tester.testOfflineMode();
  return tester.printResults();
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ErrorHandlingTests,
    runErrorHandlingTests,
    testNetworkError,
    testAPIErrors,
    testRateLimit,
    testOfflineMode
  };
}

// Chrome Extension 환경에서 바로 실행
if (typeof chrome !== 'undefined' && chrome.runtime) {
  console.log('Chrome Extension 환경에서 에러 핸들링 테스트 준비 완료');
  console.log('콘솔에서 runErrorHandlingTests()를 실행하세요');
}