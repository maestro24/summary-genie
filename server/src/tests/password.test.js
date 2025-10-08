/**
 * 비밀번호 유틸리티 테스트
 * Jest를 사용한 단위 테스트
 * 
 * @module tests/password.test
 */

const {
  hashPassword,
  comparePassword,
  validatePasswordStrength,
  needsRehash,
  PASSWORD_STRENGTH
} = require('../utils/password');

const { ValidationError, PasswordError } = require('../middleware/errorHandler');

describe('Password Utils', () => {
  describe('hashPassword', () => {
    it('유효한 비밀번호를 성공적으로 해싱해야 함', async () => {
      // Given
      const password = 'MySecureP@ss123';
      
      // When
      const hashedPassword = await hashPassword(password);
      
      // Then
      expect(hashedPassword).toBeDefined();
      expect(hashedPassword).not.toBe(password);
      expect(hashedPassword).toMatch(/^\$2[aby]\$.{56}$/); // bcrypt 패턴
    });

    it('같은 비밀번호를 여러 번 해싱하면 다른 해시를 생성해야 함', async () => {
      // Given
      const password = 'MySecureP@ss123';
      
      // When
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);
      
      // Then
      expect(hash1).not.toBe(hash2);
    });

    it('빈 비밀번호는 ValidationError를 발생시켜야 함', async () => {
      // Given
      const password = '';
      
      // Then
      await expect(hashPassword(password)).rejects.toThrow();
    });

    it('너무 짧은 비밀번호는 PasswordError를 발생시켜야 함', async () => {
      // Given
      const password = 'Short1!';
      
      // Then
      await expect(hashPassword(password)).rejects.toThrow('최소 8자');
    });

    it('너무 긴 비밀번호는 PasswordError를 발생시켜야 함', async () => {
      // Given
      const password = 'A'.repeat(129) + '1!';
      
      // Then
      await expect(hashPassword(password)).rejects.toThrow('최대 128자');
    });

    it('null 또는 undefined는 ValidationError를 발생시켜야 함', async () => {
      await expect(hashPassword(null)).rejects.toThrow();
      await expect(hashPassword(undefined)).rejects.toThrow();
    });
  });

  describe('comparePassword', () => {
    it('올바른 비밀번호는 true를 반환해야 함', async () => {
      // Given
      const password = 'MySecureP@ss123';
      const hashedPassword = await hashPassword(password);
      
      // When
      const isMatch = await comparePassword(password, hashedPassword);
      
      // Then
      expect(isMatch).toBe(true);
    });

    it('틀린 비밀번호는 false를 반환해야 함', async () => {
      // Given
      const password = 'MySecureP@ss123';
      const wrongPassword = 'WrongPassword123!';
      const hashedPassword = await hashPassword(password);
      
      // When
      const isMatch = await comparePassword(wrongPassword, hashedPassword);
      
      // Then
      expect(isMatch).toBe(false);
    });

    it('빈 비밀번호는 ValidationError를 발생시켜야 함', async () => {
      // Given
      const hashedPassword = await hashPassword('ValidP@ss123');
      
      // Then
      await expect(comparePassword('', hashedPassword)).rejects.toThrow();
    });

    it('유효하지 않은 해시는 PasswordError를 발생시켜야 함', async () => {
      // Given
      const password = 'MySecureP@ss123';
      const invalidHash = 'not-a-valid-hash';
      
      // Then
      await expect(comparePassword(password, invalidHash)).rejects.toThrow();
    });
  });

  describe('validatePasswordStrength', () => {
    it('강한 비밀번호는 valid=true를 반환해야 함', () => {
      // Given
      const password = 'MySecureP@ss123';
      
      // When
      const result = validatePasswordStrength(password);
      
      // Then
      expect(result.isValid).toBe(true);
      expect(result.strength).toMatch(/strong|very_strong/);
      expect(result.missingRequirements).toHaveLength(0);
    });

    it('약한 비밀번호는 valid=false와 누락 요구사항을 반환해야 함', () => {
      // Given
      const password = 'weak';
      
      // When
      const result = validatePasswordStrength(password);
      
      // Then
      expect(result.isValid).toBe(false);
      expect(result.missingRequirements.length).toBeGreaterThan(0);
      expect(result.strength).toBe(PASSWORD_STRENGTH.WEAK);
    });

    it('대문자가 없으면 요구사항에 표시되어야 함', () => {
      // Given
      const password = 'mypass123!';
      
      // When
      const result = validatePasswordStrength(password);
      
      // Then
      expect(result.isValid).toBe(false);
      expect(result.missingRequirements).toContain('대문자 포함 필수');
    });

    it('소문자가 없으면 요구사항에 표시되어야 함', () => {
      // Given
      const password = 'MYPASS123!';
      
      // When
      const result = validatePasswordStrength(password);
      
      // Then
      expect(result.isValid).toBe(false);
      expect(result.missingRequirements).toContain('소문자 포함 필수');
    });

    it('숫자가 없으면 요구사항에 표시되어야 함', () => {
      // Given
      const password = 'MyPassword!';
      
      // When
      const result = validatePasswordStrength(password);
      
      // Then
      expect(result.isValid).toBe(false);
      expect(result.missingRequirements).toContain('숫자 포함 필수');
    });

    it('특수문자가 없으면 제안사항에 표시되어야 함', () => {
      // Given
      const password = 'MyPassword123';
      
      // When
      const result = validatePasswordStrength(password);
      
      // Then
      expect(result.isValid).toBe(true);
      expect(result.suggestions.some(s => s.includes('특수문자'))).toBe(true);
    });

    it('일반적인 패턴을 감지해야 함', () => {
      // Given
      const passwords = [
        'password123!A',
        '1234567890aB!',
        'Qwerty123!'
      ];
      
      // When & Then
      passwords.forEach(password => {
        const result = validatePasswordStrength(password);
        expect(result.suggestions.some(s => s.includes('예측 가능한 패턴'))).toBe(true);
      });
    });

    it('빈 문자열은 invalid를 반환해야 함', () => {
      // Given
      const password = '';
      
      // When
      const result = validatePasswordStrength(password);
      
      // Then
      expect(result.isValid).toBe(false);
      expect(result.missingRequirements.length).toBeGreaterThan(0);
    });

    it('12자 이상인 경우 추가 점수를 받아야 함', () => {
      // Given
      const shortPassword = 'MyPass1!';
      const longPassword = 'MyLongPassword123!';
      
      // When
      const shortResult = validatePasswordStrength(shortPassword);
      const longResult = validatePasswordStrength(longPassword);
      
      // Then
      expect(longResult.strength).not.toBe(shortResult.strength);
    });
  });

  describe('needsRehash', () => {
    it('현재 SALT_ROUNDS로 해싱된 비밀번호는 false를 반환해야 함', async () => {
      // Given
      const password = 'MySecureP@ss123';
      const hashedPassword = await hashPassword(password);
      
      // When
      const result = needsRehash(hashedPassword);
      
      // Then
      expect(result).toBe(false);
    });

    it('유효하지 않은 해시는 true를 반환해야 함', () => {
      // Given
      const invalidHash = 'not-a-valid-hash';
      
      // When
      const result = needsRehash(invalidHash);
      
      // Then
      expect(result).toBe(true);
    });
  });

  describe('Integration Tests', () => {
    it('전체 플로우: 해싱 → 검증 → 비교가 정상 작동해야 함', async () => {
      // Given
      const password = 'TestP@ssw0rd123';
      
      // When: 비밀번호 강도 검증
      const validation = validatePasswordStrength(password);
      expect(validation.isValid).toBe(true);
      
      // When: 비밀번호 해싱
      const hashedPassword = await hashPassword(password);
      expect(hashedPassword).toBeDefined();
      
      // When: 비밀번호 비교
      const isMatch = await comparePassword(password, hashedPassword);
      expect(isMatch).toBe(true);
      
      // When: 틀린 비밀번호 비교
      const wrongMatch = await comparePassword('WrongP@ss123', hashedPassword);
      expect(wrongMatch).toBe(false);
    });

    it('사용자 등록 시나리오', async () => {
      // Given: 사용자가 비밀번호 입력
      const userPassword = 'NewUser@2024';
      
      // When: 강도 검증
      const validation = validatePasswordStrength(userPassword);
      if (!validation.isValid) {
        throw new Error('비밀번호가 정책을 충족하지 않습니다');
      }
      
      // When: 해싱 및 저장
      const hashedPassword = await hashPassword(userPassword);
      
      // Then: 저장된 해시로 로그인 검증
      const loginSuccess = await comparePassword(userPassword, hashedPassword);
      expect(loginSuccess).toBe(true);
    });

    it('비밀번호 변경 시나리오', async () => {
      // Given: 기존 비밀번호
      const oldPassword = 'OldP@ss123';
      const oldHash = await hashPassword(oldPassword);
      
      // When: 새 비밀번호로 변경
      const newPassword = 'NewP@ss456';
      const newValidation = validatePasswordStrength(newPassword);
      expect(newValidation.isValid).toBe(true);
      
      const newHash = await hashPassword(newPassword);
      
      // Then: 새 비밀번호로 로그인 성공, 옛 비밀번호로 실패
      const newPasswordMatch = await comparePassword(newPassword, newHash);
      const oldPasswordMatch = await comparePassword(oldPassword, newHash);
      
      expect(newPasswordMatch).toBe(true);
      expect(oldPasswordMatch).toBe(false);
    });
  });
});