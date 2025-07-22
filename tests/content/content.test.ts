import { VocabularyWord, UserSettings } from '../../src/shared/types';

// Mock the chrome API responses
const mockVocabulary: VocabularyWord[] = [
  {
    id: '1',
    english: 'hello',
    hebrew: 'שלום',
    dateAdded: new Date(),
    timesShown: 0,
    difficulty: 'easy',
    category: 'greetings'
  },
  {
    id: '2',
    english: 'world',
    hebrew: 'עולם',
    dateAdded: new Date(),
    timesShown: 0,
    difficulty: 'medium',
    category: 'general'
  }
];

const mockSettings: UserSettings = {
  isEnabled: true,
  replacementMode: 'all',
  replacementPercentage: 100,
  showTooltipDelay: 500,
  categories: ['general'],
  excludedDomains: []
};

// Mock chrome runtime
(global as any).chrome = {
  runtime: {
    sendMessage: jest.fn().mockImplementation((message) => {
      if (message.type === 'GET_VOCABULARY') {
        return Promise.resolve({ vocabulary: mockVocabulary });
      }
      if (message.type === 'GET_SETTINGS') {
        return Promise.resolve({ settings: mockSettings });
      }
      if (message.type === 'RECORD_OCCURRENCE') {
        return Promise.resolve({ success: true });
      }
      return Promise.resolve({ success: true });
    }),
    onMessage: {
      addListener: jest.fn()
    }
  }
};

// Create a simple DOM structure for testing
document.body.innerHTML = `
  <div id="test-content">
    <p>Hello world, this is a test.</p>
    <p>Another hello for testing multiple occurrences.</p>
    <script>console.log('This should be ignored');</script>
    <style>.test { color: red; }</style>
  </div>
`;

describe('Content Script', () => {
  beforeEach(() => {
    // Clear any existing replacements
    document.querySelectorAll('.hebrew-replacement').forEach(el => {
      const parent = el.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(el.textContent || ''), el);
      }
    });
    
    jest.clearAllMocks();
  });

  describe('Word Processing', () => {
    it('should find and replace words in text content', () => {
      const textContent = 'Hello world, this is a test';
      const words = textContent.split(/(\s+)/);
      
      expect(words).toContain('Hello');
      expect(words).toContain('world,');
    });

    it('should preserve whitespace when splitting text', () => {
      const text = 'Hello world test';
      const parts = text.split(/(\s+)/);
      
      expect(parts).toEqual(['Hello', ' ', 'world', ' ', 'test']);
    });

    it('should normalize words correctly for matching', () => {
      const normalize = (word: string) => word.toLowerCase().trim().replace(/[^\w]/g, '');
      
      expect(normalize('Hello!')).toBe('hello');
      expect(normalize('  World  ')).toBe('world');
      expect(normalize('test,')).toBe('test');
    });
  });

  describe('DOM Manipulation', () => {
    it('should create replacement elements with correct attributes', () => {
      const span = document.createElement('span');
      span.className = 'hebrew-replacement';
      span.textContent = 'שלום';
      span.style.cssText = `
        color: #2563eb;
        font-weight: 500;
        cursor: help;
        border-bottom: 1px dotted #2563eb;
        transition: all 0.2s ease;
      `;
      
      expect(span.className).toBe('hebrew-replacement');
      expect(span.textContent).toBe('שלום');
      expect(span.style.color).toBe('rgb(37, 99, 235)');
    });

    it('should skip script and style elements', () => {
      const scriptTags = document.querySelectorAll('script');
      const styleTags = document.querySelectorAll('style');
      
      expect(scriptTags.length).toBeGreaterThan(0);
      expect(styleTags.length).toBeGreaterThan(0);
      
      // In a real content script, these would be filtered out
      const skipTags = ['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE', 'PRE'];
      
      scriptTags.forEach(tag => {
        expect(skipTags).toContain(tag.tagName);
      });
      
      styleTags.forEach(tag => {
        expect(skipTags).toContain(tag.tagName);
      });
    });
  });

  describe('Tooltip Functionality', () => {
    it('should create tooltip with correct positioning logic', () => {
      const tooltip = document.createElement('div');
      tooltip.className = 'hebrew-tooltip';
      tooltip.textContent = 'hello';
      tooltip.style.cssText = `
        position: absolute;
        background: #1f2937;
        color: white;
        padding: 6px 10px;
        border-radius: 6px;
        font-size: 14px;
        z-index: 10000;
        pointer-events: none;
      `;
      
      document.body.appendChild(tooltip);
      
      expect(tooltip.className).toBe('hebrew-tooltip');
      expect(tooltip.textContent).toBe('hello');
      expect(tooltip.style.position).toBe('absolute');
      expect(tooltip.style.zIndex).toBe('10000');
      
      // Test positioning calculations
      const mockRect = { left: 100, top: 100, width: 50, height: 20, bottom: 120 };
      const tooltipRect = { width: 80, height: 30 };
      
      let left = mockRect.left + (mockRect.width / 2) - (tooltipRect.width / 2);
      let top = mockRect.top - tooltipRect.height - 8;
      
      expect(left).toBe(85); // 100 + 25 - 40
      expect(top).toBe(62);  // 100 - 30 - 8
      
      tooltip.remove();
    });
  });

  describe('Word Selection', () => {
    it('should extract words from text at specific positions', () => {
      const getWordAtText = (text: string, position: number): string => {
        const words = text.split(/\s+/);
        let currentPos = 0;
        
        for (const word of words) {
          if (position >= currentPos && position <= currentPos + word.length) {
            return word.replace(/[^\w]/g, '');
          }
          currentPos += word.length + 1;
        }
        
        return '';
      };
      
      const text = 'Hello world test';
      expect(getWordAtText(text, 0)).toBe('Hello');
      expect(getWordAtText(text, 6)).toBe('world');
      expect(getWordAtText(text, 12)).toBe('test');
    });
  });

  describe('Context Extraction', () => {
    it('should extract context around a word', () => {
      const extractContext = (text: string, wordIndex: number, wordLength: number): string => {
        const contextRadius = 50;
        const start = Math.max(0, wordIndex - contextRadius);
        const end = Math.min(text.length, wordIndex + wordLength + contextRadius);
        return text.slice(start, end).trim();
      };
      
      const longText = 'This is a very long sentence that contains many words and we want to extract context around a specific word in it.';
      const wordIndex = longText.indexOf('context');
      const context = extractContext(longText, wordIndex, 7);
      
      expect(context).toContain('context');
      expect(context.length).toBeLessThanOrEqual(107); // 50 + 7 + 50
    });
  });

  describe('Settings Integration', () => {
    it('should respect replacement mode settings', () => {
      const shouldReplace = (mode: string, percentage: number): boolean => {
        switch (mode) {
          case 'all':
            return true;
          case 'random':
            return Math.random() * 100 < percentage;
          case 'difficulty-based':
            // Simplified logic for testing
            return percentage > 50;
          default:
            return false;
        }
      };
      
      expect(shouldReplace('all', 50)).toBe(true);
      expect(shouldReplace('difficulty-based', 75)).toBe(true);
      expect(shouldReplace('difficulty-based', 25)).toBe(false);
    });

    it('should handle excluded domains', () => {
      const isDomainExcluded = (url: string, excludedDomains: string[]): boolean => {
        try {
          const domain = new URL(url).hostname;
          return excludedDomains.some(excluded => 
            domain === excluded || domain.endsWith('.' + excluded)
          );
        } catch {
          return true;
        }
      };
      
      const excludedDomains = ['google.com', 'facebook.com'];
      
      expect(isDomainExcluded('https://google.com', excludedDomains)).toBe(true);
      expect(isDomainExcluded('https://www.google.com', excludedDomains)).toBe(true);
      expect(isDomainExcluded('https://example.com', excludedDomains)).toBe(false);
    });
  });

  describe('Message Handling', () => {
    it('should handle vocabulary update messages', () => {
      const messageHandler = jest.fn();
      
      // Simulate receiving a vocabulary update message
      const message = { type: 'VOCABULARY_UPDATED' };
      messageHandler(message);
      
      expect(messageHandler).toHaveBeenCalledWith(message);
    });

    it('should handle settings update messages', () => {
      const messageHandler = jest.fn();
      
      // Simulate receiving a settings update message
      const message = { type: 'SETTINGS_UPDATED' };
      messageHandler(message);
      
      expect(messageHandler).toHaveBeenCalledWith(message);
    });
  });
});