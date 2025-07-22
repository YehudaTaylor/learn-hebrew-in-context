import { TranslationService } from '../../src/shared/translation-service';

// Mock fetch
global.fetch = jest.fn();

describe('TranslationService', () => {
  let translationService: TranslationService;

  beforeEach(() => {
    jest.clearAllMocks();
    // Clear localStorage
    localStorage.clear();
    // Create new service instance after clearing
    translationService = new TranslationService();
  });

  describe('translateToHebrew', () => {
    it('should return cached translation if available', async () => {
      // Pre-populate cache
      const cachedResult = {
        hebrew: 'שלום',
        confidence: 0.9,
        source: 'Cache'
      };
      
      // Mock localStorage to return cached data
      localStorage.setItem('translation_cache', JSON.stringify({
        'hello': cachedResult
      }));

      // Create new service instance to load cache
      const service = new TranslationService();
      const result = await service.translateToHebrew('hello');

      expect(result).toEqual(cachedResult);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should use fallback dictionary for common words', async () => {
      // Use a word that's not in cache from previous test
      const result = await translationService.translateToHebrew('water');

      expect(result.hebrew).toBe('מים');
      expect(result.source).toBe('Built-in Dictionary');
      expect(result.confidence).toBe(0.7);
    });

    it('should handle Google Translate API response', async () => {
      const mockResponse = [
        [['שלום', 'hello', null, null, 3, null, null, [], [[]]]]
      ];

      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const result = await translationService.translateToHebrew('peace');

      expect(result.hebrew).toBe('שלום');
      expect(result.source).toBe('Google Translate');
      expect(result.confidence).toBe(0.9);
    });

    it('should handle LibreTranslate API response when Google fails', async () => {
      // Mock Google Translate failure
      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 429
        })
        // Mock LibreTranslate success
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            translatedText: 'בדיקה'
          })
        });

      const result = await translationService.translateToHebrew('test');

      expect(result.hebrew).toBe('בדיקה');
      expect(result.source).toBe('LibreTranslate');
      expect(result.confidence).toBe(0.8);
    });

    it('should throw error when no translation is found', async () => {
      // Mock all APIs to fail
      (fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      await expect(translationService.translateToHebrew('unknownword123'))
        .rejects.toThrow('No translation found for "unknownword123"');
    });

    it('should cache successful translations', async () => {
      const result = await translationService.translateToHebrew('water');

      expect(result.hebrew).toBe('מים');
      
      // Check that result is cached
      const cached = JSON.parse(localStorage.getItem('translation_cache') || '{}');
      expect(cached['water']).toEqual(result);
    });

    it('should normalize input words', async () => {
      const result1 = await translationService.translateToHebrew('HELLO');
      const result2 = await translationService.translateToHebrew('  hello  ');
      const result3 = await translationService.translateToHebrew('hello');

      expect(result1).toEqual(result2);
      expect(result2).toEqual(result3);
      expect(result1.hebrew).toBe('שלום');
    });
  });

  describe('cache management', () => {
    it('should clear cache', () => {
      localStorage.setItem('translation_cache', JSON.stringify({ 'test': 'בדיקה' }));
      
      translationService.clearCache();
      
      expect(localStorage.getItem('translation_cache')).toBeNull();
      expect(translationService.getCacheSize()).toBe(0);
    });

    it('should return correct cache size', async () => {
      expect(translationService.getCacheSize()).toBe(0);
      
      await translationService.translateToHebrew('hello');
      expect(translationService.getCacheSize()).toBe(1);
      
      await translationService.translateToHebrew('water');
      expect(translationService.getCacheSize()).toBe(2);
    });
  });

  describe('Hebrew text validation', () => {
    it('should validate Hebrew text correctly', () => {
      // Access private method for testing
      const service = translationService as any;
      
      expect(service.isHebrewText('שלום')).toBe(true);
      expect(service.isHebrewText('hello שלום')).toBe(true);
      expect(service.isHebrewText('hello')).toBe(false);
      expect(service.isHebrewText('123')).toBe(false);
      expect(service.isHebrewText('')).toBe(false);
    });
  });
});