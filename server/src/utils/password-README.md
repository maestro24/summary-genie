# 🔐 Password Utility

SummaryGenie 프로젝트의 비밀번호 해싱 및 검증 유틸리티

## 📦 설치

```bash
npm install bcryptjs
```

## 🚀 사용법

### 기본 사용 예제

```javascript
const { 
  hashPassword, 
  comparePassword, 
  validatePasswordStrength 
} = require('./utils/password');

// 1. 비밀번호 해싱
async function registerUser(email, password) {
  // 비밀번호 강도 검증
  const validation = validatePasswordStrength(password);
  
  if (!validation.isValid) {
    throw new Error(`비밀번호 정책 위반: ${validation.missingRequirements.join(', ')}`);
  }
  
  // 비밀번호 해싱
  const hashedPassword = await hashPassword(password);
  
  // DB에 저장
  await User.create({ email, password: hashedPassword });
}

// 2. 비밀번호 비교 (로그인)
async function loginUser(email, password) {
  const user = await User.findOne({ email });
  
  if (!user) {
    throw new Error('사용자를 찾을 수 없습니다');
  }
  
  const isValid = await comparePassword(password, user.password);
  
  if (!isValid) {
    throw new Error('비밀번호가 일치하지 않습니다');
  }
  
  return user;
}
```

### 비밀번호 강도 검증

```javascript
const result = validatePasswordStrength('MyP@ssw0rd123');

console.log(result);
// {
//   isValid: true,
//   strength: 'strong',
//   missingRequirements: [],
//   suggestions: ['12자 이상 사용을 권장합니다']
// }
```

### 비밀번호 재해싱

```javascript
const { needsRehash, hashPassword } = require('./utils/password');

async function checkAndRehash(user, plainPassword) {
  if (needsRehash(user.password)) {
    user.password = await hashPassword(plainPassword);
    await user.save();
  }
}
```

## 📋 API 문서

### `hashPassword(password)`

비밀번호를 bcrypt로 해싱합니다.

**Parameters:**
- `password` (string): 해싱할 평문 비밀번호

**Returns:**
- `Promise<string>`: 해싱된 비밀번호

**Throws:**
- `ValidationError`: 입력값이 유효하지 않음
- `PasswordError`: 비밀번호 정책 위반 (너무 짧음/길음)

**Example:**
```javascript
const hashed = await hashPassword('MySecureP@ss123');
```

---

### `comparePassword(password, hashedPassword)`

평문 비밀번호와 해시를 비교합니다.

**Parameters:**
- `password` (string): 비교할 평문 비밀번호
- `hashedPassword` (string): 저장된 해시

**Returns:**
- `Promise<boolean>`: 일치 여부

**Throws:**
- `ValidationError`: 입력값이 유효하지 않음
- `PasswordError`: 비교 중 오류 발생

**Example:**
```javascript
const isMatch = await comparePassword('MySecureP@ss123', hashedPassword);
```

---

### `validatePasswordStrength(password)`

비밀번호 강도를 검증합니다.

**Parameters:**
- `password` (string): 검증할 비밀번호

**Returns:**
- `Object`:
  - `isValid` (boolean): 정책 통과 여부
  - `strength` (string): 강도 레벨 (`weak`, `medium`, `strong`, `very_strong`)
  - `missingRequirements` (string[]): 미충족 요구사항
  - `suggestions` (string[]): 개선 제안

**Example:**
```javascript
const result = validatePasswordStrength('weak');
// {
//   isValid: false,
//   strength: 'weak',
//   missingRequirements: ['최소 8자 이상', '대문자 포함 필수', ...],
//   suggestions: ['더 복잡한 비밀번호를 사용하세요']
// }
```

---

### `needsRehash(hashedPassword)`

비밀번호 재해싱 필요 여부를 확인합니다.

**Parameters:**
- `hashedPassword` (string): 확인할 해시

**Returns:**
- `boolean`: 재해싱 필요 여부

**Example:**
```javascript
if (needsRehash(user.password)) {
  // 재해싱 필요
}
```

---

## 🔒 비밀번호 정책

### 필수 요구사항
- ✅ 최소 8자 이상
- ✅ 최대 128자 이하
- ✅ 대문자 포함
- ✅ 소문자 포함
- ✅ 숫자 포함

### 권장사항
- 💡 특수문자 포함 (`!@#$%^&*()_+-=[]{}...`)
- 💡 12자 이상
- 💡 예측 가능한 패턴 피하기

### 금지 패턴
- ❌ 같은 문자 반복 (예: `aaaa`)
- ❌ 연속된 숫자 (예: `1234`, `5678`)
- ❌ 연속된 알파벳 (예: `abcd`)
- ❌ 일반적인 단어 (`password`, `qwerty`, `admin`)

---

## 🛡️ 보안 고려사항

### bcrypt Salt Rounds
- **기본값**: 10 rounds
- **처리 시간**: 약 65ms
- **보안 수준**: 현재 권장 수준

### 에러 처리
모든 함수는 커스텀 에러를 throw합니다:

```javascript
const { PasswordError } = require('../middleware/errorHandler');

try {
  await hashPassword('short');
} catch (error) {
  console.log(error.name);       // 'PasswordError'
  console.log(error.code);       // 'PASSWORD_TOO_SHORT'
  console.log(error.message);    // '비밀번호는 최소 8자 이상이어야 합니다'
  console.log(error.statusCode); // 400
}
```

### 타이밍 공격 방어
- bcrypt의 `compare()` 함수는 타이밍 공격에 안전합니다
- 비밀번호가 일치하든 하지 않든 일정한 시간이 소요됩니다

---

## 🧪 테스트

```bash
# 테스트 실행
npm test tests/password.test.js

# 커버리지 확인
npm run test:coverage
```

---

## 📊 성능

### 해싱 속도
- **SALT_ROUNDS=10**: ~65ms
- **SALT_ROUNDS=12**: ~260ms

### 권장사항
- 일반 사용자: 10 rounds
- 고보안 환경: 12 rounds
- 성능 우선 환경: 8 rounds (최소)

---

## 🔄 마이그레이션 가이드

### 기존 bcrypt에서 전환

```javascript
// Before (기존 bcrypt 직접 사용)
const bcrypt = require('bcryptjs');
const hashed = await bcrypt.hash(password, 10);

// After (유틸리티 사용)
const { hashPassword } = require('./utils/password');
const hashed = await hashPassword(password);
```

### 비밀번호 정책 추가

```javascript
// 기존 사용자 비밀번호 검증 추가
app.post('/change-password', async (req, res) => {
  const { newPassword } = req.body;
  
  // 새 비밀번호 강도 검증
  const validation = validatePasswordStrength(newPassword);
  
  if (!validation.isValid) {
    return res.status(400).json({
      error: '비밀번호 정책 위반',
      requirements: validation.missingRequirements
    });
  }
  
  // 비밀번호 변경
  const hashedPassword = await hashPassword(newPassword);
  await User.update({ password: hashedPassword });
  
  res.json({ success: true });
});
```

---

## 🐛 문제 해결

### Q: "비밀번호 해싱 중 오류가 발생했습니다" 에러
**A**: bcryptjs가 설치되어 있는지 확인하세요.
```bash
npm install bcryptjs
```

### Q: 비밀번호 비교가 항상 false 반환
**A**: 
1. 저장된 해시가 유효한지 확인
2. 평문 비밀번호를 정확히 입력했는지 확인
3. 해시 알고리즘이 bcrypt인지 확인

### Q: 성능이 느림
**A**: SALT_ROUNDS를 낮추거나 (최소 8), Redis 캐싱을 고려하세요.

---

## 📚 관련 문서

- [bcryptjs 공식 문서](https://github.com/dcodeIO/bcrypt.js)
- [OWASP 비밀번호 저장 가이드](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [constants/index.js](../constants/index.js) - 프로젝트 상수 정의
- [errors/CustomError.js](../errors/CustomError.js) - 커스텀 에러 클래스

---

## 📝 라이센스

이 유틸리티는 SummaryGenie 프로젝트의 일부입니다.