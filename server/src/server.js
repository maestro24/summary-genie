/**
 * SummaryGenie 백엔드 서버 시작 파일
 * 서버 초기화, 시작, 종료 및 에러 핸들링 담당
 * 
 * @module server
 * @version 2.0.1
 * 
 * 📝 주요 수정사항:
 * - AuthService 재초기화 추가
 */

require('dotenv').config();

// Constants
const {
  ENVIRONMENTS,
  SHUTDOWN,
  LOGGING
} = require('./constants/index');

// Configuration
const { initializeFirebase, testConnection } = require('./config/firebase');

// Services
const usageService = require('./services/UsageService');
const { historyService } = require('./services/HistoryService');
const authService = require('./services/AuthService'); // ✅ 추가

// Express App
const createApp = require('./app');

// ===== 환경변수 검증 =====

/**
 * 필수 환경변수가 설정되어 있는지 검증
 * 프로덕션 환경에서는 누락 시 프로세스 종료
 * 개발 환경에서는 더미 값 사용
 * 
 * @throws {Error} 프로덕션 환경에서 필수 환경변수 누락 시
 */
function validateEnvironment() {
  console.log('🔍 환경변수 검증 중...');
  
  const required = [
    'OPENAI_API_KEY',
    'JWT_SECRET'
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    const isProduction = process.env.NODE_ENV === ENVIRONMENTS.PRODUCTION;
    
    if (isProduction) {
      console.error('❌ 필수 환경변수 누락:', missing.join(', '));
      throw new Error(`필수 환경변수 누락: ${missing.join(', ')}`);
    } else {
      console.warn('⚠️ 개발 환경: 다음 환경변수가 누락되었습니다:', missing.join(', '));
      console.warn('⚠️ 더미 값을 사용합니다. 프로덕션에서는 반드시 설정하세요!');
      
      // 개발 환경용 더미 값 설정
      if (!process.env.OPENAI_API_KEY) {
        process.env.OPENAI_API_KEY = 'sk-dummy-development-key-not-for-production';
      }
      if (!process.env.JWT_SECRET) {
        process.env.JWT_SECRET = 'dev-jwt-secret-key-change-in-production';
      }
    }
  }
  
  console.log('✅ 환경변수 검증 완료');
}

/**
 * CORS 설정을 위한 확장 ID 검증
 * 프로덕션 환경에서는 ALLOWED_EXTENSION_IDS 필수
 */
function validateCorsConfig() {
  const allowedIds = process.env.ALLOWED_EXTENSION_IDS;
  const isProduction = process.env.NODE_ENV === ENVIRONMENTS.PRODUCTION;
  
  if (!allowedIds || allowedIds.trim() === '') {
    if (isProduction) {
      console.error('❌ ALLOWED_EXTENSION_IDS 환경변수가 설정되지 않았습니다');
      throw new Error('ALLOWED_EXTENSION_IDS 환경변수 필수');
    } else {
      console.warn('⚠️ ALLOWED_EXTENSION_IDS 미설정 - 개발 환경에서는 모든 localhost 및 확장 허용');
    }
  } else {
    const ids = allowedIds.split(',').map(id => id.trim());
    console.log(`✅ CORS: ${ids.length}개의 확장 ID 허용`);
  }
}

// ===== 서버 시작 =====

/**
 * 서버 초기화 및 시작
 * 
 * 실행 순서:
 * 1. 환경변수 검증
 * 2. Firebase 초기화 및 연결 테스트
 * 3. 서비스 재초기화 (✅ AuthService 추가)
 * 4. Express 앱 생성
 * 5. HTTP 서버 시작
 * 6. Graceful shutdown 설정
 * 
 * @async
 * @returns {Promise<void>}
 * @throws {Error} 서버 시작 실패 시
 */
async function startServer() {
  try {
    console.log('='.repeat(60));
    console.log('🚀 SummaryGenie 서버 시작 중...');
    console.log('='.repeat(60));
    
    // 1. 환경변수 검증
    validateEnvironment();
    validateCorsConfig();
    
    // 2. Firebase 초기화 (서비스 로드 전에 먼저!)
    console.log('🔥 Firebase 초기화 중...');
    await initializeFirebase();
    console.log('✅ Firebase 초기화 완료');
    
    // Firebase 연결 테스트 (선택적)
    if (process.env.TEST_FIREBASE_CONNECTION === 'true') {
      console.log('🔍 Firebase 연결 테스트 중...');
      const connected = await testConnection();
      if (!connected) {
        console.warn('⚠️ Firebase 연결 테스트 실패 - 계속 진행');
      }
    }
    
    // 🔥 **중요: Firebase 초기화 후 서비스 재초기화**
    console.log('🔄 서비스 재초기화 중...');
    
    // UsageService 재초기화
    try {
      await usageService.initialize();
      console.log('✅ UsageService 재초기화 완료');
    } catch (error) {
      console.warn('⚠️ UsageService 재초기화 실패:', error.message);
    }
    
    // HistoryService 재초기화
    try {
      await historyService.initialize();
      console.log('✅ HistoryService 재초기화 완료');
    } catch (error) {
      console.warn('⚠️ HistoryService 재초기화 실패:', error.message);
    }
    
    // ✅ AuthService 재초기화 추가
    try {
      await authService.initialize();
      console.log('✅ AuthService 재초기화 완료');
    } catch (error) {
      console.warn('⚠️ AuthService 재초기화 실패:', error.message);
    }
    
    // 3. Express 앱 생성
    console.log('⚙️ Express 앱 생성 중...');
    const app = createApp();
    console.log('✅ Express 앱 생성 완료');
    
    // 4. 서버 시작
    const PORT = process.env.PORT || 3000;
    const server = app.listen(PORT, () => {
      printServerInfo(PORT);
    });
    
    // 5. Graceful shutdown 설정
    setupGracefulShutdown(server);
    
  } catch (error) {
    console.error('❌ 서버 시작 실패:', error.message);
    console.error('상세 오류:', error);
    process.exit(1);
  }
}

/**
 * 서버 정보 출력
 * 
 * @param {number} port - 서버 포트 번호
 */
function printServerInfo(port) {
  const env = process.env.NODE_ENV || ENVIRONMENTS.DEVELOPMENT;
  const baseUrl = `http://localhost:${port}`;
  
  console.log('='.repeat(60));
  console.log(`🚀 SummaryGenie API Server v2.0`);
  console.log(`=`.repeat(60));
  console.log(`📍 포트: ${port}`);
  console.log(`🌍 환경: ${env}`);
  console.log(`🔗 URL: ${baseUrl}`);
  console.log(`=`.repeat(60));
  console.log(`🔧 서비스 상태:`);
  console.log(`   🔐 JWT 인증: 활성화`);
  console.log(`   🔥 Firebase: ${usageService.isAvailable() ? 'Firestore' : 'Memory 모드'}`);
  console.log(`   📊 UsageService: 활성화`);
  console.log(`   📚 HistoryService: ${historyService.isAvailable() ? '활성화' : '비활성화'}`);
  console.log(`   👤 AuthService: ${authService.isAvailable() ? '활성화' : '비활성화'}`); // ✅ 추가
  console.log(`=`.repeat(60));
  console.log(`📡 주요 엔드포인트:`);
  console.log(`   🏠 GET  ${baseUrl}/ (API 정보)`);
  console.log(`   ❤️  GET  ${baseUrl}/health (헬스체크)`);
  console.log(`   💬 POST ${baseUrl}/api/chat (채팅/요약)`);
  console.log(`   📊 GET  ${baseUrl}/api/usage (사용량 조회)`);
  console.log(`   📚 GET  ${baseUrl}/api/history (히스토리 조회)`);
  console.log(`=`.repeat(60));
  console.log(`📁 프로젝트 구조:`);
  console.log(`   server.js (서버 시작/종료)`);
  console.log(`   ├── src/app.js (Express 설정)`);
  console.log(`   ├── src/config/ (설정 파일)`);
  console.log(`   ├── src/routes/ (라우터)`);
  console.log(`   ├── src/services/ (비즈니스 로직)`);
  console.log(`   ├── src/middleware/ (미들웨어)`);
  console.log(`   └── src/utils/ (유틸리티)`);
  console.log('='.repeat(60));
  console.log('✅ 서버가 성공적으로 시작되었습니다!');
  console.log('='.repeat(60));
}

// ===== Graceful Shutdown =====

/**
 * Graceful shutdown 설정
 * SIGTERM, SIGINT 신호 수신 시 안전하게 서버 종료
 * 
 * @param {http.Server} server - HTTP 서버 인스턴스
 */
function setupGracefulShutdown(server) {
  /**
   * 종료 신호 핸들러
   * 
   * @param {string} signal - 종료 신호 (SIGTERM, SIGINT 등)
   */
  const shutdown = (signal) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`⚠️ ${signal} 신호 수신, 서버 종료 시작...`);
    console.log('='.repeat(60));
    
    // HTTP 서버 종료 (새 연결 거부, 기존 연결은 완료 대기)
    server.close(() => {
      console.log('✅ HTTP 서버 종료 완료');
      console.log('✅ 모든 연결이 안전하게 종료되었습니다');
      console.log('='.repeat(60));
      process.exit(0);
    });
    
    // 강제 종료 타이머 (기본 10초)
    setTimeout(() => {
      console.error('⚠️ 타임아웃 도달, 강제 종료');
      console.error('일부 연결이 완료되지 않았을 수 있습니다');
      console.log('='.repeat(60));
      process.exit(1);
    }, SHUTDOWN.TIMEOUT);
  };
  
  // 종료 신호 리스너 등록
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  
  console.log('✅ Graceful shutdown 설정 완료');
}

// ===== 전역 에러 핸들러 =====

/**
 * 처리되지 않은 Promise 거부 핸들러
 * 
 * @param {*} reason - 거부 이유
 * @param {Promise} promise - 거부된 Promise
 */
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Promise Rejection:');
  console.error('  Promise:', promise);
  console.error('  Reason:', reason);
  
  // 프로덕션에서는 로깅 서비스에 전송하는 것을 권장
  if (process.env.NODE_ENV === ENVIRONMENTS.PRODUCTION) {
    // TODO: 로깅 서비스(Sentry, CloudWatch 등)에 전송
  }
});

/**
 * 처리되지 않은 예외 핸들러
 * 심각한 에러이므로 프로세스 종료
 * 
 * @param {Error} error - 예외 객체
 */
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:');
  console.error('  Message:', error.message);
  console.error('  Stack:', error.stack);
  
  // 프로덕션에서는 로깅 후 프로세스 종료
  if (process.env.NODE_ENV === ENVIRONMENTS.PRODUCTION) {
    // TODO: 로깅 서비스에 전송
    console.error('프로세스를 종료합니다...');
    process.exit(1);
  } else {
    console.warn('⚠️ 개발 환경: 프로세스를 계속 실행합니다');
  }
});

/**
 * 경고 핸들러 (Node.js 경고 메시지)
 * 
 * @param {Error} warning - 경고 객체
 */
process.on('warning', (warning) => {
  if (process.env.LOG_LEVEL === LOGGING.LEVELS.DEBUG) {
    console.warn('⚠️ Node.js Warning:');
    console.warn('  Name:', warning.name);
    console.warn('  Message:', warning.message);
    console.warn('  Stack:', warning.stack);
  }
});

// ===== 서버 시작 =====

// 메인 실행
startServer().catch(error => {
  console.error('❌ 치명적 오류:', error);
  process.exit(1);
});