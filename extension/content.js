/**
 * SummaryGenie Content Script (Simplified)
 * 웹페이지에서 콘텐츠를 추출하는 간결한 스크립트
 * 
 * @version 3.0.0
 */

if (!window.summaryGenieInitialized) {
  window.summaryGenieInitialized = true;

  /**
   * 콘텐츠 추출기 클래스
   */
  class ContentExtractor {
    constructor() {
      this.config = {
        minContentLength: 100,
        maxContentLength: 50000
      };
    }

    /**
     * 메인 추출 함수
     */
    async extract() {
      console.log('[ContentExtractor] 추출 시작');

      try {
        // 동적 콘텐츠 대기
        await this.waitForContent();

        // 메인 콘텐츠 추출
        const mainContent = this.extractMainContent();

        // iframe 콘텐츠 추출
        const iframeContent = this.extractFromIframes();

        // Shadow DOM 콘텐츠 추출 (1단계만)
        const shadowContent = this.extractFromShadowDOM();

        // 콘텐츠 결합
        const combinedContent = [mainContent, iframeContent, shadowContent]
          .filter(c => c && c.length > 0)
          .join('\n\n---\n\n');

        // 메타데이터 추출
        const metadata = this.extractMetadata();

        // 콘텐츠 정제
        const cleanedContent = this.cleanContent(combinedContent);

        return {
          content: cleanedContent,
          metadata: metadata,
          stats: {
            charCount: cleanedContent.length,
            wordCount: this.countWords(cleanedContent)
          }
        };

      } catch (error) {
        console.error('[ContentExtractor] 추출 오류:', error);
        throw error;
      }
    }

    /**
     * 동적 콘텐츠 로딩 대기
     */
    async waitForContent() {
      return new Promise((resolve) => {
        const selectors = ['article', 'main', '[role="main"]', '.content', '#content'];
        const maxWait = 3000;
        const startTime = Date.now();

        const check = () => {
          for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent.length > this.config.minContentLength) {
              console.log('[ContentExtractor] 콘텐츠 발견:', selector);
              resolve();
              return;
            }
          }

          if (Date.now() - startTime > maxWait) {
            console.log('[ContentExtractor] 대기 시간 초과');
            resolve();
            return;
          }

          setTimeout(check, 500);
        };

        check();
      });
    }

    /**
     * 메인 콘텐츠 추출
     */
    extractMainContent() {
      // 우선순위 선택자
      const selectors = [
        'article',
        'main',
        '[role="main"]',
        '[role="article"]',
        '.article',
        '.post',
        '.content',
        '#content',
        '.post-content',
        '.entry-content',
        '.article-content',
        '.blog-post'
      ];

      // 가장 적합한 요소 찾기
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          const content = this.extractTextFromElement(element);
          if (content.length > this.config.minContentLength) {
            console.log('[ContentExtractor] 메인 콘텐츠 발견:', selector);
            return content;
          }
        }
      }

      // 폴백: body 전체
      console.log('[ContentExtractor] 폴백: body에서 추출');
      return this.extractTextFromElement(document.body);
    }

    /**
     * 요소에서 텍스트 추출
     */
    extractTextFromElement(element) {
      if (!element) return '';

      // 복제하여 원본 보호
      const clone = element.cloneNode(true);

      // 불필요한 요소 제거
      const removeSelectors = [
        'script', 'style', 'noscript', 'svg', 'iframe',
        'nav', 'header', 'footer', 'aside',
        '.sidebar', '.navigation', '.menu',
        '.advertisement', '.ads', '.ad', '.banner',
        '.popup', '.modal', '.social-share', '.comments'
      ];

      removeSelectors.forEach(selector => {
        clone.querySelectorAll(selector).forEach(el => el.remove());
      });

      // 텍스트 추출
      let text = clone.textContent || '';

      // 이미지 alt 텍스트 추가
      const images = clone.querySelectorAll('img[alt]');
      const imageTexts = Array.from(images)
        .map(img => img.getAttribute('alt'))
        .filter(alt => alt && alt.length > 0)
        .map(alt => `[이미지: ${alt}]`);

      if (imageTexts.length > 0) {
        text += '\n\n' + imageTexts.join('\n');
      }

      return text;
    }

    /**
     * iframe에서 콘텐츠 추출
     */
    extractFromIframes() {
      const contents = [];
      const iframes = document.querySelectorAll('iframe');

      for (const iframe of iframes) {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (iframeDoc) {
            const content = iframeDoc.body?.textContent || '';
            if (content.length > this.config.minContentLength) {
              console.log('[ContentExtractor] iframe 콘텐츠 발견');
              contents.push(content);
            }
          }
        } catch (error) {
          // 크로스 오리진 iframe 접근 불가
        }
      }

      return contents.join('\n\n');
    }

    /**
     * Shadow DOM에서 콘텐츠 추출 (1단계만)
     */
    extractFromShadowDOM() {
      const contents = [];
      const elements = document.querySelectorAll('*');

      for (const element of elements) {
        if (element.shadowRoot) {
          const shadowText = element.shadowRoot.textContent || '';
          if (shadowText.length > 50) {
            console.log('[ContentExtractor] Shadow DOM 발견:', element.tagName);
            contents.push(shadowText);
          }
        }
      }

      return contents.join('\n\n');
    }

    /**
     * 메타데이터 추출
     */
    extractMetadata() {
      const metadata = {
        title: document.title || '',
        url: window.location.href,
        domain: window.location.hostname,
        language: document.documentElement.lang || 'unknown',
        description: '',
        author: '',
        keywords: []
      };

      // 메타 태그 파싱
      const metaTags = document.querySelectorAll('meta');
      metaTags.forEach(meta => {
        const name = meta.getAttribute('name') || meta.getAttribute('property');
        const content = meta.getAttribute('content');

        if (!name || !content) return;

        if (name === 'description' || name === 'og:description') {
          metadata.description = content;
        }
        if (name === 'author') {
          metadata.author = content;
        }
        if (name === 'keywords') {
          metadata.keywords = content.split(',').map(k => k.trim());
        }
      });

      return metadata;
    }

    /**
     * 콘텐츠 정제
     */
    cleanContent(content) {
      if (!content) return '';

      // 과도한 공백 정리
      content = content.replace(/\n{3,}/g, '\n\n');
      content = content.replace(/[ \t]{2,}/g, ' ');

      // 특수 문자 정리
      content = content.replace(/[\u200B-\u200D\uFEFF]/g, ''); // Zero-width
      content = content.replace(/\u00A0/g, ' '); // Non-breaking space

      // 줄 시작/끝 공백 제거
      content = content.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n');

      // 길이 제한
      if (content.length > this.config.maxContentLength) {
        content = content.substring(0, this.config.maxContentLength) + '...';
      }

      return content.trim();
    }

    /**
     * 단어 수 계산
     */
    countWords(text) {
      if (!text) return 0;
      const words = text.match(/[\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\uAC00-\uD7AF]+/g);
      return words ? words.length : 0;
    }
  }

  /**
   * 메시지 리스너
   */
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractContent') {
      console.log('[ContentExtractor] 추출 요청 받음');

      const extractor = new ContentExtractor();

      extractor.extract()
        .then(result => {
          console.log('[ContentExtractor] 추출 완료:', result.stats);
          sendResponse({
            success: true,
            content: result.content,
            metadata: result.metadata,
            stats: result.stats
          });
        })
        .catch(error => {
          console.error('[ContentExtractor] 추출 실패:', error);
          sendResponse({
            success: false,
            error: error.message,
            content: ''
          });
        });

      return true; // 비동기 응답
    }
  });

  console.log('[ContentExtractor] 초기화 완료');
}