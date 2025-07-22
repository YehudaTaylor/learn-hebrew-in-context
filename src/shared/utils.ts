import { VocabularyWord, UserSettings } from './types';

export function generateId(): string {
  return crypto.randomUUID();
}

export function normalizeWord(word: string): string {
  return word.toLowerCase().trim().replace(/[^\w]/g, '');
}

export function isWordBoundary(text: string, index: number, wordLength: number): boolean {
  const before = index > 0 ? text[index - 1] : ' ';
  const after = index + wordLength < text.length ? text[index + wordLength] : ' ';
  
  const wordBoundaryRegex = /[\s\p{P}]/u;
  return wordBoundaryRegex.test(before) && wordBoundaryRegex.test(after);
}

export function shouldReplaceWord(
  word: VocabularyWord, 
  settings: UserSettings
): boolean {
  if (!settings.isEnabled) return false;

  switch (settings.replacementMode) {
    case 'all':
      return true;
    case 'random':
      return Math.random() * 100 < settings.replacementPercentage;
    case 'difficulty-based':
      // Replace easier words more frequently
      const difficultyMultiplier = {
        'easy': 0.8,
        'medium': 0.5,
        'hard': 0.3
      };
      const threshold = settings.replacementPercentage * difficultyMultiplier[word.difficulty];
      return Math.random() * 100 < threshold;
    default:
      return false;
  }
}

export function extractContext(text: string, wordIndex: number, wordLength: number): string {
  const contextRadius = 50;
  const start = Math.max(0, wordIndex - contextRadius);
  const end = Math.min(text.length, wordIndex + wordLength + contextRadius);
  return text.slice(start, end).trim();
}

export function isValidUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return ['http:', 'https:'].includes(urlObj.protocol);
  } catch {
    return false;
  }
}

export function isDomainExcluded(url: string, excludedDomains: string[]): boolean {
  try {
    const domain = new URL(url).hostname;
    return excludedDomains.some(excluded => 
      domain === excluded || domain.endsWith('.' + excluded)
    );
  } catch {
    return true; // Exclude invalid URLs
  }
}

export function debounce<T extends (...args: unknown[]) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: number | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = window.setTimeout(() => func(...args), wait);
  };
}

export function throttle<T extends (...args: unknown[]) => void>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

export function sanitizeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

export function exportToJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function validateHebrewText(text: string): boolean {
  const hebrewRegex = /[\u0590-\u05FF]/;
  return hebrewRegex.test(text);
}