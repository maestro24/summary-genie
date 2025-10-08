/**
 * SummaryGenie Security Module (단순화 버전)
 * 필수 보안 유틸리티 함수만 제공합니다.
 * 
 * @module security
 * @version 2.0.0
 */

/**
 * HTML 특수문자를 이스케이프합니다.
 */
function escapeHtml(text) {
  if (typeof text !== 'string') {
    return String(text);
  }

  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * URL이 유효한지 검증합니다.
 */
function isValidUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    const urlObj = new URL(url.trim());
    return ['http:', 'https:'].includes(urlObj.protocol);
  } catch (e) {
    return false;
  }
}

/**
 * URL이 위험한 프로토콜을 사용하는지 검사합니다.
 */
function isDangerousUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  const dangerous = ['javascript:', 'data:', 'file:', 'vbscript:', 'blob:'];
  const lowerUrl = url.toLowerCase().trim();
  
  return dangerous.some(proto => lowerUrl.startsWith(proto));
}

/**
 * URL이 HTTPS인지 확인합니다.
 */
function isSecureUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'https:';
  } catch (e) {
    return false;
  }
}

/**
 * URL을 정제하여 안전하게 만듭니다.
 */
function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }

  if (isDangerousUrl(url)) {
    console.warn('[Security] 위험한 프로토콜 감지:', url);
    return null;
  }

  try {
    const urlObj = new URL(url.trim());

    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      console.warn('[Security] 지원하지 않는 프로토콜:', urlObj.protocol);
      return null;
    }

    return urlObj.href;
  } catch (e) {
    console.warn('[Security] 유효하지 않은 URL:', url);
    return null;
  }
}

/**
 * API 키의 유효성을 검사합니다.
 */
function validateApiKey(key) {
  const result = { valid: true, error: null };

  if (!key || typeof key !== 'string') {
    result.valid = false;
    result.error = 'API 키가 입력되지 않았습니다.';
    return result;
  }

  if (key.startsWith('sk-')) {
    if (key.length < 40) {
      result.valid = false;
      result.error = 'API 키 형식이 올바르지 않습니다.';
      return result;
    }

    if (!/^sk-[A-Za-z0-9]+$/.test(key)) {
      result.valid = false;
      result.error = 'API 키에 유효하지 않은 문자가 포함되어 있습니다.';
      return result;
    }
  } else {
    result.valid = false;
    result.error = 'OpenAI API 키는 "sk-"로 시작해야 합니다.';
    return result;
  }

  return result;
}

/**
 * 사용자 입력값을 검증합니다.
 */
function validateInput(input, rules = {}) {
  const result = {
    valid: true,
    error: null,
    sanitized: input
  };

  if (rules.required && (input === null || input === undefined || input === '')) {
    result.valid = false;
    result.error = '필수 입력값입니다.';
    return result;
  }

  if (input === null || input === undefined || input === '') {
    return result;
  }

  if (rules.type) {
    switch (rules.type) {
      case 'string':
        if (typeof input !== 'string') {
          result.valid = false;
          result.error = '문자열이어야 합니다.';
          return result;
        }
        result.sanitized = input.trim();
        break;

      case 'number':
        const num = Number(input);
        if (isNaN(num)) {
          result.valid = false;
          result.error = '숫자여야 합니다.';
          return result;
        }
        result.sanitized = num;
        break;

      case 'email':
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(input)) {
          result.valid = false;
          result.error = '유효한 이메일 주소가 아닙니다.';
          return result;
        }
        break;

      case 'url':
        if (!isValidUrl(input)) {
          result.valid = false;
          result.error = '유효한 URL이 아닙니다.';
          return result;
        }
        break;

      case 'boolean':
        if (typeof input !== 'boolean') {
          result.valid = false;
          result.error = 'boolean 값이어야 합니다.';
          return result;
        }
        break;
    }
  }

  if (rules.minLength !== undefined) {
    const length = String(result.sanitized).length;
    if (length < rules.minLength) {
      result.valid = false;
      result.error = `최소 ${rules.minLength}자 이상이어야 합니다.`;
      return result;
    }
  }

  if (rules.maxLength !== undefined) {
    const length = String(result.sanitized).length;
    if (length > rules.maxLength) {
      result.valid = false;
      result.error = `최대 ${rules.maxLength}자까지 입력 가능합니다.`;
      return result;
    }
  }

  if (rules.min !== undefined && result.sanitized < rules.min) {
    result.valid = false;
    result.error = `${rules.min} 이상이어야 합니다.`;
    return result;
  }

  if (rules.max !== undefined && result.sanitized > rules.max) {
    result.valid = false;
    result.error = `${rules.max} 이하여야 합니다.`;
    return result;
  }

  if (rules.pattern && !rules.pattern.test(String(result.sanitized))) {
    result.valid = false;
    result.error = '유효하지 않은 형식입니다.';
    return result;
  }

  if (rules.allowedValues && !rules.allowedValues.includes(result.sanitized)) {
    result.valid = false;
    result.error = '허용되지 않은 값입니다.';
    return result;
  }

  return result;
}

/**
 * 신뢰할 수 있는 도메인인지 확인합니다.
 */
function isTrustedDomain(url) {
  try {
    const urlObj = new URL(url);
    const trustedDomains = [
      'api.openai.com',
      'localhost',
      '127.0.0.1'
    ];

    return trustedDomains.some(domain => 
      urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain)
    );
  } catch (e) {
    return false;
  }
}

/**
 * DOM 요소를 안전하게 생성합니다.
 */
function createSafeElement(tagName, attributes = {}, textContent = '') {
  if (!tagName || typeof tagName !== 'string') {
    throw new Error('유효하지 않은 태그 이름입니다.');
  }

  const element = document.createElement(tagName.toLowerCase());

  const dangerousAttributes = [
    'onclick', 'ondblclick', 'onmousedown', 'onmouseup', 'onmouseover', 
    'onmousemove', 'onmouseout', 'onmouseenter', 'onmouseleave',
    'onload', 'onerror', 'onabort', 'onblur', 'onchange', 'onfocus',
    'onkeydown', 'onkeypress', 'onkeyup', 'onsubmit', 'onreset',
    'onscroll', 'onresize', 'ontouchstart', 'ontouchmove', 'ontouchend'
  ];

  if (attributes && typeof attributes === 'object') {
    for (const [key, value] of Object.entries(attributes)) {
      if (dangerousAttributes.includes(key.toLowerCase())) {
        console.warn(`[Security] 위험한 속성 차단: ${key}`);
        continue;
      }

      if (key.toLowerCase() === 'href' || key.toLowerCase() === 'src') {
        if (isDangerousUrl(value)) {
          console.warn(`[Security] 위험한 URL 차단: ${value}`);
          continue;
        }
      }

      if (key.toLowerCase() === 'style') {
        if (/expression\s*\(/i.test(value)) {
          console.warn('[Security] style에서 expression() 차단');
          continue;
        }
      }

      try {
        element.setAttribute(key, String(value));
      } catch (e) {
        console.warn(`[Security] 속성 설정 실패: ${key}`, e);
      }
    }
  }

  if (textContent) {
    element.textContent = String(textContent);
  }

  return element;
}

/**
 * HTML 문자열을 안전하게 정제합니다.
 */
function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') {
    return '';
  }

  const allowedTags = [
    'p', 'div', 'span', 'br', 'strong', 'em', 'b', 'i', 'u',
    'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'a', 'code', 'pre', 'blockquote'
  ];

  const allowedAttributes = {
    'a': ['href', 'title', 'target', 'rel'],
    'div': ['class', 'id'],
    'span': ['class', 'id'],
    'p': ['class', 'id'],
    'h1': ['class', 'id'],
    'h2': ['class', 'id'],
    'h3': ['class', 'id'],
    'h4': ['class', 'id'],
    'h5': ['class', 'id'],
    'h6': ['class', 'id'],
    'ul': ['class', 'id'],
    'ol': ['class', 'id'],
    'li': ['class', 'id'],
    'code': ['class'],
    'pre': ['class'],
    'blockquote': ['class']
  };

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  function sanitizeNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return document.createTextNode(node.textContent);
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }

    const tagName = node.tagName.toLowerCase();

    if (!allowedTags.includes(tagName)) {
      const fragment = document.createDocumentFragment();
      Array.from(node.childNodes).forEach(child => {
        const sanitized = sanitizeNode(child);
        if (sanitized) {
          fragment.appendChild(sanitized);
        }
      });
      return fragment;
    }

    const newElement = document.createElement(tagName);

    const allowed = allowedAttributes[tagName] || [];
    Array.from(node.attributes).forEach(attr => {
      const attrName = attr.name.toLowerCase();

      if (attrName.startsWith('on')) {
        return;
      }

      if (allowed.includes(attrName)) {
        const attrValue = attr.value;

        if (attrName === 'href' || attrName === 'src') {
          if (isDangerousUrl(attrValue)) {
            console.warn(`[Security] 위험한 URL 제거: ${attrValue}`);
            return;
          }
        }

        if (attrName === 'style') {
          if (/expression\s*\(/i.test(attrValue)) {
            console.warn('[Security] style에서 expression() 제거');
            return;
          }
        }

        newElement.setAttribute(attrName, attrValue);
      }
    });

    Array.from(node.childNodes).forEach(child => {
      const sanitized = sanitizeNode(child);
      if (sanitized) {
        newElement.appendChild(sanitized);
      }
    });

    return newElement;
  }

  const sanitizedDiv = document.createElement('div');
  Array.from(tempDiv.childNodes).forEach(node => {
    const sanitized = sanitizeNode(node);
    if (sanitized) {
      sanitizedDiv.appendChild(sanitized);
    }
  });

  return sanitizedDiv.innerHTML;
}

// 전역 객체에 모든 함수 할당
window.escapeHtml = escapeHtml;
window.isValidUrl = isValidUrl;
window.isDangerousUrl = isDangerousUrl;
window.isSecureUrl = isSecureUrl;
window.sanitizeUrl = sanitizeUrl;
window.validateApiKey = validateApiKey;
window.validateInput = validateInput;
window.isTrustedDomain = isTrustedDomain;
window.createSafeElement = createSafeElement;
window.sanitizeHtml = sanitizeHtml;