/**
 * 비밀번호 관리 유틸리티
 * bcrypt를 사용한 안전한 비밀번호 해싱 및 검증
 * 
 * @module utils/password
 * @description 비밀번호 해싱, 비교, 강도 검증 기능을 제공합니다
 */

const bcrypt = require('bcryptjs');
const { ERROR_CODES, ERROR_MESSAGES, PASSWORD } = require('../constants');
const { ValidationError, PasswordError } = require('../middleware/errorHandler');

/**
 * bcrypt salt rounds
 * constants에서 가져옴
 */
const SALT_ROUNDS = PASSWORD.SALT_ROUNDS;

/**
 * 비밀번호 정책 상수
 * @property {number} MIN_LENGTH - 최소 길이 (8자)
 * @property {number} MAX_LENGTH - 최대 길이 (128자)
 * @property {RegExp} UPPERCASE_PATTERN - 대문자 패턴
 * @property {RegExp} LOWERCASE_PATTERN - 소문자 패턴
 * @property {RegExp} NUMBER_PATTERN - 숫자 패턴
 * @property {RegExp} SPECIAL_CHAR_PATTERN - 특수문자 패턴
 */
const PASSWORD_POLICY = {
  MIN_LENGTH: 8,
  MAX_LENGTH: 128,
  UPPERCASE_PATTERN: /[A-Z]/,
  LOWERCASE_PATTERN: /[a-z]/,
  NUMBER_PATTERN: /[0-9]/,
  SPECIAL_CHAR_PATTERN: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/
};

/**
 * 비밀번호 강도 레벨
 * @enum {string}
 */
const PASSWORD_STRENGTH = {
  WEAK: 'weak',
  MEDIUM: 'medium',
  STRONG: 'strong',
  VERY_STRONG: 'very_strong'
};

/**
 * 비밀번호를 bcrypt를 사용하여 해싱합니다
 * 
 * @param {string} password - 해싱할 평문 비밀번호
 * @returns {Promise<string>} 해싱된 비밀번호
 * @throws {Error} 비밀번호가 유효하지 않거나 해싱 중 오류 발생 시
 * 
 * @example
 * const hashedPassword = await hashPassword('MySecureP@ss123');
 * console.log(hashedPassword); // $2a$10$...
 */
async function hashPassword(password) {
  // 입력값 검증
  if (!password || typeof password !== 'string') {
    throw new ValidationError(ERROR_MESSAGES.INVALID_INPUT || '유효하지 않은 비밀번호입니다');
  }

  // 길이 검증
  if (password.length < PASSWORD_POLICY.MIN_LENGTH) {
    throw new PasswordError(
      `비밀번호는 최소 ${PASSWORD_POLICY.MIN_LENGTH}자 이상이어야 합니다`,
      'PASSWORD_TOO_SHORT'
    );
  }

  if (password.length > PASSWORD_POLICY.MAX_LENGTH) {
    throw new PasswordError(
      `비밀번호는 최대 ${PASSWORD_POLICY.MAX_LENGTH}자 이하여야 합니다`,
      'PASSWORD_TOO_LONG'
    );
  }

  try {
    // Salt 생성 및 해싱
    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    return hashedPassword;
  } catch (error) {
    // bcrypt 에러를 커스텀 에러로 래핑
    throw new PasswordError('비밀번호 해싱 중 오류가 발생했습니다', 'PASSWORD_HASH_ERROR');
  }
}

/**
 * 평문 비밀번호와 해싱된 비밀번호를 비교합니다
 * 
 * @param {string} password - 비교할 평문 비밀번호
 * @param {string} hashedPassword - 저장된 해싱된 비밀번호
 * @returns {Promise<boolean>} 일치 여부 (true: 일치, false: 불일치)
 * @throws {Error} 입력값이 유효하지 않거나 비교 중 오류 발생 시
 * 
 * @example
 * const isValid = await comparePassword('MySecureP@ss123', hashedPassword);
 * if (isValid) {
 *   console.log('비밀번호가 일치합니다');
 * }
 */
async function comparePassword(password, hashedPassword) {
  // 입력값 검증
  if (!password || typeof password !== 'string') {
    throw new ValidationError(ERROR_MESSAGES.INVALID_INPUT || '유효하지 않은 비밀번호입니다');
  }

  if (!hashedPassword || typeof hashedPassword !== 'string') {
    throw new PasswordError('유효하지 않은 해시값입니다', 'INVALID_HASH');
  }

  try {
    // bcrypt를 사용하여 비밀번호 비교
    const isMatch = await bcrypt.compare(password, hashedPassword);
    return isMatch;
  } catch (error) {
    // bcrypt 에러를 커스텀 에러로 래핑
    throw new PasswordError('비밀번호 비교 중 오류가 발생했습니다', 'PASSWORD_COMPARE_ERROR');
  }
}

/**
 * 비밀번호 강도를 검증합니다
 * 
 * @param {string} password - 검증할 비밀번호
 * @returns {Object} 검증 결과
 * @returns {boolean} returns.isValid - 정책 통과 여부
 * @returns {string} returns.strength - 강도 레벨 (weak/medium/strong/very_strong)
 * @returns {string[]} returns.missingRequirements - 미충족 요구사항 목록
 * @returns {string[]} returns.suggestions - 개선 제안 사항
 * 
 * @example
 * const result = validatePasswordStrength('MyP@ss123');
 * // {
 * //   isValid: true,
 * //   strength: 'strong',
 * //   missingRequirements: [],
 * //   suggestions: []
 * // }
 */
function validatePasswordStrength(password) {
  const result = {
    isValid: true,
    strength: PASSWORD_STRENGTH.WEAK,
    missingRequirements: [],
    suggestions: []
  };

  // 입력값 검증
  if (!password || typeof password !== 'string') {
    result.isValid = false;
    result.missingRequirements.push('비밀번호가 제공되지 않았습니다');
    return result;
  }

  // 길이 검증
  if (password.length < PASSWORD_POLICY.MIN_LENGTH) {
    result.isValid = false;
    result.missingRequirements.push(`최소 ${PASSWORD_POLICY.MIN_LENGTH}자 이상`);
  }

  if (password.length > PASSWORD_POLICY.MAX_LENGTH) {
    result.isValid = false;
    result.missingRequirements.push(`최대 ${PASSWORD_POLICY.MAX_LENGTH}자 이하`);
  }

  // 필수 요구사항 검증
  const hasUppercase = PASSWORD_POLICY.UPPERCASE_PATTERN.test(password);
  const hasLowercase = PASSWORD_POLICY.LOWERCASE_PATTERN.test(password);
  const hasNumber = PASSWORD_POLICY.NUMBER_PATTERN.test(password);
  const hasSpecialChar = PASSWORD_POLICY.SPECIAL_CHAR_PATTERN.test(password);

  if (!hasUppercase) {
    result.isValid = false;
    result.missingRequirements.push('대문자 포함 필수');
  }

  if (!hasLowercase) {
    result.isValid = false;
    result.missingRequirements.push('소문자 포함 필수');
  }

  if (!hasNumber) {
    result.isValid = false;
    result.misValid = false;
    result.missingRequirements.push('숫자 포함 필수');
  }

  // 특수문자는 선택적이지만 권장
  if (!hasSpecialChar) {
    result.suggestions.push('특수문자를 포함하면 더 안전합니다');
  }

  // 강도 계산
  let strengthScore = 0;
  
  if (password.length >= PASSWORD_POLICY.MIN_LENGTH) strengthScore++;
  if (password.length >= 12) strengthScore++;
  if (hasUppercase) strengthScore++;
  if (hasLowercase) strengthScore++;
  if (hasNumber) strengthScore++;
  if (hasSpecialChar) strengthScore++;

  // 강도 레벨 결정
  if (strengthScore <= 3) {
    result.strength = PASSWORD_STRENGTH.WEAK;
    result.suggestions.push('비밀번호가 약합니다. 더 복잡한 비밀번호를 사용하세요');
  } else if (strengthScore === 4) {
    result.strength = PASSWORD_STRENGTH.MEDIUM;
    result.suggestions.push('비밀번호 강도가 보통입니다');
  } else if (strengthScore === 5) {
    result.strength = PASSWORD_STRENGTH.STRONG;
  } else {
    result.strength = PASSWORD_STRENGTH.VERY_STRONG;
  }

  // 추가 제안사항
  if (password.length < 12) {
    result.suggestions.push('12자 이상 사용을 권장합니다');
  }

  // 일반적인 패턴 검사
  const commonPatterns = [
    /^(.)\1+$/, // 같은 문자 반복 (예: aaaa)
    /^(012|123|234|345|456|567|678|789|890)+/, // 연속된 숫자
    /^(abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)+/i, // 연속된 알파벳
    /password|1234|qwerty|admin/i // 일반적인 단어
  ];

  for (const pattern of commonPatterns) {
    if (pattern.test(password)) {
      result.suggestions.push('예측 가능한 패턴을 피하세요');
      if (result.strength === PASSWORD_STRENGTH.VERY_STRONG) {
        result.strength = PASSWORD_STRENGTH.STRONG;
      } else if (result.strength === PASSWORD_STRENGTH.STRONG) {
        result.strength = PASSWORD_STRENGTH.MEDIUM;
      }
      break;
    }
  }

  return result;
}

/**
 * 비밀번호 재해싱 필요 여부를 확인합니다
 * bcrypt 라운드 수가 변경되었을 때 사용
 * 
 * @param {string} hashedPassword - 확인할 해시된 비밀번호
 * @returns {boolean} 재해싱 필요 여부
 * 
 * @example
 * if (needsRehash(user.password)) {
 *   user.password = await hashPassword(plainPassword);
 *   await user.save();
 * }
 */
function needsRehash(hashedPassword) {
  try {
    const rounds = bcrypt.getRounds(hashedPassword);
    return rounds !== SALT_ROUNDS;
  } catch (error) {
    // 유효하지 않은 해시인 경우 재해싱 필요
    return true;
  }
}

// Export
module.exports = {
  hashPassword,
  comparePassword,
  validatePasswordStrength,
  needsRehash,
  PASSWORD_STRENGTH,
  PASSWORD_POLICY
};