export interface TranslationResult {
  hebrew: string;
  confidence: number;
  source: string;
}

export interface TranslationError {
  message: string;
  code: string;
}

export class TranslationService {
  private static readonly CACHE_KEY = 'translation_cache';
  private cache: Map<string, TranslationResult> = new Map();

  constructor() {
    this.loadCache();
  }

  async translateToHebrew(englishWord: string): Promise<TranslationResult> {
    const normalizedWord = englishWord.toLowerCase().trim();
    
    // Check cache first
    if (this.cache.has(normalizedWord)) {
      return this.cache.get(normalizedWord)!;
    }

    try {
      // Try multiple translation sources
      let result = await this.tryGoogleTranslate(normalizedWord);
      
      if (!result) {
        result = await this.tryLibreTranslate(normalizedWord);
      }
      
      if (!result) {
        result = await this.tryFallbackDictionary(normalizedWord);
      }

      if (!result) {
        throw new Error(`No translation found for "${englishWord}"`);
      }

      // Cache the result
      this.cache.set(normalizedWord, result);
      this.saveCache();
      
      return result;
    } catch (error) {
      console.error('Translation error:', error);
      throw error;
    }
  }

  private async tryGoogleTranslate(word: string): Promise<TranslationResult | null> {
    try {
      // Use Google Translate via unofficial API endpoint
      const response = await fetch(
        `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=he&dt=t&q=${encodeURIComponent(word)}`,
        {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        }
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      
      if (data && data[0] && data[0][0] && data[0][0][0]) {
        const hebrew = data[0][0][0].trim();
        
        // Validate that we got Hebrew text
        if (this.isHebrewText(hebrew)) {
          return {
            hebrew,
            confidence: 0.9,
            source: 'Google Translate'
          };
        }
      }
    } catch (error) {
      console.debug('Google Translate failed:', error);
    }
    
    return null;
  }

  private async tryLibreTranslate(word: string): Promise<TranslationResult | null> {
    try {
      // Use LibreTranslate public instance
      const response = await fetch('https://libretranslate.de/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: word,
          source: 'en',
          target: 'he',
          format: 'text'
        })
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      
      if (data && data.translatedText) {
        const hebrew = data.translatedText.trim();
        
        if (this.isHebrewText(hebrew)) {
          return {
            hebrew,
            confidence: 0.8,
            source: 'LibreTranslate'
          };
        }
      }
    } catch (error) {
      console.debug('LibreTranslate failed:', error);
    }
    
    return null;
  }

  private async tryFallbackDictionary(word: string): Promise<TranslationResult | null> {
    // Static dictionary for common words as fallback
    const commonWords: Record<string, string> = {
      'hello': 'שלום',
      'goodbye': 'להתראות', 
      'thank you': 'תודה',
      'please': 'בבקשה',
      'yes': 'כן',
      'no': 'לא',
      'water': 'מים',
      'food': 'אוכל',
      'house': 'בית',
      'book': 'ספר',
      'time': 'זמן',
      'day': 'יום',
      'night': 'לילה',
      'good': 'טוב',
      'bad': 'רע',
      'big': 'גדול',
      'small': 'קטן',
      'love': 'אהבה',
      'friend': 'חבר',
      'family': 'משפחה',
      'work': 'עבודה',
      'school': 'בית ספר',
      'car': 'מכונית',
      'red': 'אדום',
      'blue': 'כחול',
      'green': 'ירוק',
      'white': 'לבן',
      'black': 'שחור',
      'money': 'כסף',
      'new': 'חדש',
      'old': 'ישן',
      'hot': 'חם',
      'cold': 'קר'
    };

    const hebrew = commonWords[word.toLowerCase()];
    
    if (hebrew) {
      return {
        hebrew,
        confidence: 0.7,
        source: 'Built-in Dictionary'
      };
    }
    
    return null;
  }

  private isHebrewText(text: string): boolean {
    // Check if text contains Hebrew characters
    const hebrewRegex = /[\u0590-\u05FF]/;
    return hebrewRegex.test(text) && text.length > 0;
  }

  private loadCache(): void {
    try {
      const cached = localStorage.getItem(TranslationService.CACHE_KEY);
      if (cached) {
        const data = JSON.parse(cached);
        this.cache = new Map(Object.entries(data));
      }
    } catch (error) {
      console.debug('Failed to load translation cache:', error);
    }
  }

  private saveCache(): void {
    try {
      const data = Object.fromEntries(this.cache.entries());
      localStorage.setItem(TranslationService.CACHE_KEY, JSON.stringify(data));
    } catch (error) {
      console.debug('Failed to save translation cache:', error);
    }
  }

  clearCache(): void {
    this.cache.clear();
    localStorage.removeItem(TranslationService.CACHE_KEY);
  }

  getCacheSize(): number {
    return this.cache.size;
  }
}