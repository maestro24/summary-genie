set -e  # 에러 발생 시 중단

# 환경변수
export PROJECT_ID="summary-genie-prod"
export REGION="asia-northeast3"
export SERVICE_NAME="summarygenie-server"
export VERSION="v1"

echo "🔍 프로젝트: $PROJECT_ID"
echo "📍 리전: $REGION"
echo "🏷️  버전: $VERSION"

# Docker 인증
echo "🔐 Docker 인증 중..."
gcloud auth configure-docker --quiet

# 빌드
echo "🏗️  이미지 빌드 중..."
cd server
docker build -t gcr.io/$PROJECT_ID/$SERVICE_NAME:$VERSION .
docker tag gcr.io/$PROJECT_ID/$SERVICE_NAME:$VERSION gcr.io/$PROJECT_ID/$SERVICE_NAME:latest

# 푸시
echo "📤 이미지 푸시 중..."
docker push gcr.io/$PROJECT_ID/$SERVICE_NAME:$VERSION
docker push gcr.io/$PROJECT_ID/$SERVICE_NAME:latest

# 확인
echo "✅ 완료!"
gcloud container images list-tags gcr.io/$PROJECT_ID/$SERVICE_NAME

echo "🚀 이미지 URL: gcr.io/$PROJECT_ID/$SERVICE_NAME:$VERSION"
echo "➡️  다음 단계: 5단계 Cloud Run 배포"