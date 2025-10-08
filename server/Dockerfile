# ===================================================================
# SummaryGenie Server - Multi-stage Docker Build
# Node.js 18 기반, 최적화된 프로덕션 이미지
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

# ===== Stage 2: Build (필요시) =====
# 현재 프로젝트는 빌드 단계가 없으므로 생략
# TypeScript나 번들러 사용 시 여기서 빌드

# ===== Stage 3: Production =====
FROM node:18-alpine AS production

# 메타데이터
LABEL maintainer="SummaryGenie Team"
LABEL version="2.0.0"
LABEL description="AI-powered web summarization service"

# 비루트 사용자 생성 (보안)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# 작업 디렉토리 설정
WORKDIR /app

# 의존성 복사
COPY --from=dependencies --chown=nodejs:nodejs /app/node_modules ./node_modules

# 애플리케이션 소스 복사
COPY --chown=nodejs:nodejs . .

# 환경변수 설정 (기본값)
ENV NODE_ENV=production
ENV PORT=8080

# 헬스체크 설정
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:8080/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 포트 노출
EXPOSE 8080

# 비루트 사용자로 전환
USER nodejs

# 애플리케이션 시작
CMD ["node", "src/server.js"]

# ===================================================================
# 빌드 및 실행 명령어:
#
# 1. 이미지 빌드:
#    docker build -t summarygenie-server:latest .
#
# 2. 로컬 실행:
#    docker run -p 8080:8080 \
#      --env-file .env \
#      summarygenie-server:latest
#
# 3. 환경변수 직접 전달:
#    docker run -p 8080:8080 \
#      -e OPENAI_API_KEY=sk-xxx \
#      -e JWT_SECRET=your-secret \
#      summarygenie-server:latest
#
# 4. 볼륨 마운트 (로그):
#    docker run -p 8080:8080 \
#      --env-file .env \
#      -v $(pwd)/logs:/app/logs \
#      summarygenie-server:latest
# ===================================================================