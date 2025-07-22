import { openDB, IDBPDatabase } from 'idb';
import { VocabularyWord, WordOccurrence, UserSettings } from './types';

const DB_NAME = 'LearnHebrewDB';
const DB_VERSION = 1;

export class DatabaseManager {
  private db: IDBPDatabase | null = null;

  async initialize(): Promise<void> {
    this.db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Vocabulary store
        const vocabularyStore = db.createObjectStore('vocabulary', {
          keyPath: 'id'
        });
        vocabularyStore.createIndex('english', 'english', { unique: false });
        vocabularyStore.createIndex('hebrew', 'hebrew', { unique: false });
        vocabularyStore.createIndex('category', 'category', { unique: false });

        // Word occurrences store
        const occurrencesStore = db.createObjectStore('occurrences', {
          keyPath: 'id'
        });
        occurrencesStore.createIndex('wordId', 'wordId', { unique: false });
        occurrencesStore.createIndex('url', 'url', { unique: false });
        occurrencesStore.createIndex('timestamp', 'timestamp', { unique: false });

        // Settings store
        db.createObjectStore('settings', {
          keyPath: 'key'
        });
      }
    });

    // Initialize default settings if not exists
    await this.initializeDefaultSettings();
  }

  private async initializeDefaultSettings(): Promise<void> {
    const existingSettings = await this.getSettings();
    if (!existingSettings) {
      const defaultSettings: UserSettings = {
        isEnabled: true,
        replacementMode: 'random',
        replacementPercentage: 50,
        showTooltipDelay: 500,
        categories: ['general'],
        excludedDomains: []
      };
      await this.updateSettings(defaultSettings);
    }
  }

  async addWord(word: Omit<VocabularyWord, 'id' | 'dateAdded' | 'timesShown'>): Promise<VocabularyWord> {
    if (!this.db) throw new Error('Database not initialized');

    const newWord: VocabularyWord = {
      ...word,
      id: crypto.randomUUID(),
      dateAdded: new Date(),
      timesShown: 0
    };

    await this.db.add('vocabulary', newWord);
    return newWord;
  }

  async getVocabulary(): Promise<VocabularyWord[]> {
    if (!this.db) throw new Error('Database not initialized');
    return await this.db.getAll('vocabulary');
  }

  async getWordByEnglish(english: string): Promise<VocabularyWord | undefined> {
    if (!this.db) throw new Error('Database not initialized');
    const words = await this.db.getAllFromIndex('vocabulary', 'english', english.toLowerCase());
    return words[0];
  }

  async updateWord(word: VocabularyWord): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.put('vocabulary', word);
  }

  async removeWord(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.delete('vocabulary', id);
    
    // Also remove associated occurrences
    const occurrences = await this.db.getAllFromIndex('occurrences', 'wordId', id);
    for (const occurrence of occurrences) {
      await this.db.delete('occurrences', occurrence.id);
    }
  }

  async recordOccurrence(wordId: string, url: string, context: string = ''): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const occurrence: WordOccurrence = {
      id: crypto.randomUUID(),
      wordId,
      url,
      timestamp: new Date(),
      context
    };

    await this.db.add('occurrences', occurrence);

    // Update word's timesShown counter
    const word = await this.db.get('vocabulary', wordId);
    if (word) {
      word.timesShown += 1;
      word.lastSeen = new Date();
      await this.db.put('vocabulary', word);
    }
  }

  async getWordOccurrences(wordId: string): Promise<WordOccurrence[]> {
    if (!this.db) throw new Error('Database not initialized');
    return await this.db.getAllFromIndex('occurrences', 'wordId', wordId);
  }

  async getSettings(): Promise<UserSettings | undefined> {
    if (!this.db) throw new Error('Database not initialized');
    const result = await this.db.get('settings', 'userSettings');
    return result?.value;
  }

  async updateSettings(settings: UserSettings): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.put('settings', { key: 'userSettings', value: settings });
  }

  async getStatistics(): Promise<{
    totalWords: number;
    totalOccurrences: number;
    mostSeenWords: Array<{ word: VocabularyWord; count: number }>;
    recentActivity: WordOccurrence[];
  }> {
    if (!this.db) throw new Error('Database not initialized');

    const vocabulary = await this.getVocabulary();
    const allOccurrences = await this.db.getAll('occurrences');

    const mostSeenWords = vocabulary
      .sort((a, b) => b.timesShown - a.timesShown)
      .slice(0, 10)
      .map(word => ({ word, count: word.timesShown }));

    const recentActivity = allOccurrences
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 20);

    return {
      totalWords: vocabulary.length,
      totalOccurrences: allOccurrences.length,
      mostSeenWords,
      recentActivity
    };
  }
}

// Singleton instance
export const db = new DatabaseManager();