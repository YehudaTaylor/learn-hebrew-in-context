import {
  normalizeWord,
  isWordBoundary,
  shouldReplaceWord,
  extractContext,
  isValidUrl,
  isDomainExcluded,
  validateHebrewText,
  formatDate
} from '../../src/shared/utils';
import { VocabularyWord, UserSettings } from '../../src/shared/types';

describe('Utils', () => {
  describe('normalizeWord', () => {
    it('should normalize words correctly', () => {
      expect(normalizeWord('Hello')).toBe('hello');
      expect(normalizeWord('  Word  ')).toBe('word');
      expect(normalizeWord('word!')).toBe('word');
      expect(normalizeWord('café')).toBe('caf');
    });
  });

  describe('isWordBoundary', () => {
    it('should detect word boundaries correctly', () => {
      const text = 'Hello world test';
      expect(isWordBoundary(text, 0, 5)).toBe(true); // 'Hello'
      expect(isWordBoundary(text, 6, 5)).toBe(true); // 'world'
      expect(isWordBoundary(text, 12, 4)).toBe(true); // 'test'
      expect(isWordBoundary(text, 1, 4)).toBe(false); // 'ello'
    });
  });

  describe('shouldReplaceWord', () => {
    const mockWord: VocabularyWord = {
      id: '1',
      english: 'test',
      hebrew: 'בדיקה',
      dateAdded: new Date(),
      timesShown: 0,
      difficulty: 'medium',
      category: 'general'
    };

    const mockSettings: UserSettings = {
      isEnabled: true,
      replacementMode: 'random',
      replacementPercentage: 50,
      showTooltipDelay: 500,
      categories: ['general'],
      excludedDomains: []
    };

    it('should not replace when extension is disabled', () => {
      const disabledSettings = { ...mockSettings, isEnabled: false };
      expect(shouldReplaceWord(mockWord, disabledSettings)).toBe(false);
    });

    it('should replace all words when mode is "all"', () => {
      const allSettings = { ...mockSettings, replacementMode: 'all' as const };
      expect(shouldReplaceWord(mockWord, allSettings)).toBe(true);
    });

    it('should handle difficulty-based replacement', () => {
      const difficultySettings = { ...mockSettings, replacementMode: 'difficulty-based' as const };
      
      const easyWord = { ...mockWord, difficulty: 'easy' as const, category: 'general' };
      const hardWord = { ...mockWord, difficulty: 'hard' as const, category: 'general' };

      // Note: These tests involve randomness, so we'll just check they return boolean
      const easyResult = shouldReplaceWord(easyWord, difficultySettings);
      const hardResult = shouldReplaceWord(hardWord, difficultySettings);
      
      expect(typeof easyResult).toBe('boolean');
      expect(typeof hardResult).toBe('boolean');
    });
  });

  describe('extractContext', () => {
    it('should extract context around a word', () => {
      const text = 'This is a long sentence with many words to test context extraction';
      const context = extractContext(text, 30, 4); // Around 'many'
      
      expect(context).toContain('many');
      expect(context.length).toBeLessThanOrEqual(104); // 50 chars each side + word
    });
  });

  describe('isValidUrl', () => {
    it('should validate URLs correctly', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('http://test.org')).toBe(true);
      expect(isValidUrl('ftp://files.com')).toBe(false);
      expect(isValidUrl('not-a-url')).toBe(false);
      expect(isValidUrl('')).toBe(false);
    });
  });

  describe('isDomainExcluded', () => {
    const excludedDomains = ['google.com', 'facebook.com'];

    it('should detect excluded domains correctly', () => {
      expect(isDomainExcluded('https://google.com', excludedDomains)).toBe(true);
      expect(isDomainExcluded('https://www.google.com', excludedDomains)).toBe(true);
      expect(isDomainExcluded('https://example.com', excludedDomains)).toBe(false);
    });

    it('should handle invalid URLs', () => {
      expect(isDomainExcluded('invalid-url', excludedDomains)).toBe(true);
    });
  });

  describe('validateHebrewText', () => {
    it('should validate Hebrew text correctly', () => {
      expect(validateHebrewText('שלום')).toBe(true);
      expect(validateHebrewText('בדיקה')).toBe(true);
      expect(validateHebrewText('hello')).toBe(false);
      expect(validateHebrewText('123')).toBe(false);
      expect(validateHebrewText('')).toBe(false);
      expect(validateHebrewText('שלום world')).toBe(true); // Mixed text should still pass
    });
  });

  describe('formatDate', () => {
    it('should format dates correctly', () => {
      const date = new Date('2023-12-25T10:30:00');
      const formatted = formatDate(date);
      
      expect(formatted).toContain('Dec');
      expect(formatted).toContain('25');
      expect(formatted).toContain('2023');
      expect(formatted).toContain('10:30');
    });
  });
});