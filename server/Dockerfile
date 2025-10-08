# ===================================================================
# SummaryGenie Server - Google Cloud Run 최적화 빌드
# Node.js 18 기반, 프로덕션 최적화 이미지
# ===================================================================

# ===== Stage 1: Dependencies =====
FROM node:18-alpine AS dependencies

# 작업 디렉토리 설정
WORKDIR /app

# 패키지 파일만 먼저 복사 (레이어 캐싱 최적화)
COPY package*.json ./

# 프로덕션 의존성만 설치
RUN npm ci --only=production && \
    npm cache clean --force

# ===== Stage 2: Production =====
FROM node:18-alpine AS production

# 메타데이터
LABEL maintainer="SummaryGenie Team"
LABEL version="2.0.0"
LABEL description="AI-powered web summarization service for Google Cloud Run"

# 비루트 사용자 생성 (보안)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# 작업 디렉토리 설정
WORKDIR /app

# 의존성 복사
COPY --from=dependencies --chown=nodejs:nodejs /app/node_modules ./node_modules

# 애플리케이션 소스 복사
COPY --chown=nodejs:nodejs . .

# 환경변수 설정 (Cloud Run 기본값)
ENV NODE_ENV=production
ENV PORT=8080

# ===== Cloud Run 최적화 헬스체크 =====
# Cloud Run은 자체 헬스체크를 수행하지만, 
# 로컬 테스트나 다른 환경에서도 유용함
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD node -e "require('http').get('http://localhost:8080/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 포트 노출 (Cloud Run은 8080 포트 사용)
EXPOSE 8080

# 비루트 사용자로 전환 (보안 강화)
USER nodejs

# ===== 애플리케이션 시작 =====
# Cloud Run은 PORT 환경변수를 동적으로 할당하므로
# server.js에서 process.env.PORT를 읽도록 구현 필요
CMD ["node", "src/server.js"]

# ===================================================================
# 빌드 및 실행 명령어:
#
# 1. 로컬 이미지 빌드:
#    docker build -t summarygenie-server:latest .
#
# 2. 로컬 테스트 실행:
#    docker run -p 8080:8080 \
#      -e OPENAI_API_KEY=sk-xxx \
#      -e JWT_SECRET=your-secret \
#      summarygenie-server:latest
#
# 3. Cloud Run 배포용 빌드 & 푸시:
#    docker build -t gcr.io/PROJECT_ID/summarygenie-server:v1 .
#    docker push gcr.io/PROJECT_ID/summarygenie-server:v1
#
# 4. Cloud Run 배포:
#    gcloud run deploy summarygenie-server \
#      --image gcr.io/PROJECT_ID/summarygenie-server:v1 \
#      --platform managed \
#      --region asia-northeast3 \
#      --allow-unauthenticated \
#      --memory 512Mi \
#      --cpu 1
# ===================================================================