import { DatabaseManager } from '../../src/shared/database';
import { VocabularyWord, UserSettings } from '../../src/shared/types';

// Mock IndexedDB
const mockDB = {
  add: jest.fn(),
  get: jest.fn(),
  getAll: jest.fn(),
  getAllFromIndex: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  createObjectStore: jest.fn(),
  createIndex: jest.fn()
};

const mockOpenDB = jest.fn().mockResolvedValue(mockDB);

jest.mock('idb', () => ({
  openDB: (...args: any[]) => mockOpenDB(...args)
}));

describe('DatabaseManager', () => {
  let dbManager: DatabaseManager;

  beforeEach(() => {
    dbManager = new DatabaseManager();
    jest.clearAllMocks();
  });

  describe('initialize', () => {
    it('should initialize database correctly', async () => {
      await dbManager.initialize();
      
      expect(mockOpenDB).toHaveBeenCalledWith('LearnHebrewDB', 1, expect.any(Object));
    });
  });

  describe('addWord', () => {
    beforeEach(async () => {
      await dbManager.initialize();
    });

    it('should add a new word', async () => {
      const wordData = {
        english: 'test',
        hebrew: 'בדיקה',
        difficulty: 'medium' as const,
        category: 'general'
      };

      mockDB.add.mockResolvedValue(undefined);

      const result = await dbManager.addWord(wordData);

      expect(result.english).toBe(wordData.english);
      expect(result.hebrew).toBe(wordData.hebrew);
      expect(result.difficulty).toBe(wordData.difficulty);
      expect(result.id).toBeDefined();
      expect(result.dateAdded).toBeInstanceOf(Date);
      expect(result.timesShown).toBe(0);
      expect(mockDB.add).toHaveBeenCalledWith('vocabulary', result);
    });
  });

  describe('getVocabulary', () => {
    beforeEach(async () => {
      await dbManager.initialize();
    });

    it('should retrieve all vocabulary words', async () => {
      const mockWords: VocabularyWord[] = [
        {
          id: '1',
          english: 'test',
          hebrew: 'בדיקה',
          dateAdded: new Date(),
          timesShown: 0,
          difficulty: 'medium',
          category: 'general'
        }
      ];

      mockDB.getAll.mockResolvedValue(mockWords);

      const result = await dbManager.getVocabulary();

      expect(result).toEqual(mockWords);
      expect(mockDB.getAll).toHaveBeenCalledWith('vocabulary');
    });
  });

  describe('getWordByEnglish', () => {
    beforeEach(async () => {
      await dbManager.initialize();
    });

    it('should find word by English text', async () => {
      const mockWord: VocabularyWord = {
        id: '1',
        english: 'test',
        hebrew: 'בדיקה',
        dateAdded: new Date(),
        timesShown: 0,
        difficulty: 'medium',
        category: 'general'
      };

      mockDB.getAllFromIndex.mockResolvedValue([mockWord]);

      const result = await dbManager.getWordByEnglish('test');

      expect(result).toEqual(mockWord);
      expect(mockDB.getAllFromIndex).toHaveBeenCalledWith('vocabulary', 'english', 'test');
    });

    it('should return undefined if word not found', async () => {
      mockDB.getAllFromIndex.mockResolvedValue([]);

      const result = await dbManager.getWordByEnglish('nonexistent');

      expect(result).toBeUndefined();
    });
  });

  describe('updateWord', () => {
    beforeEach(async () => {
      await dbManager.initialize();
    });

    it('should update an existing word', async () => {
      const word: VocabularyWord = {
        id: '1',
        english: 'test',
        hebrew: 'בדיקה מעודכנת',
        dateAdded: new Date(),
        timesShown: 5,
        difficulty: 'hard',
        category: 'general'
      };

      mockDB.put.mockResolvedValue(undefined);

      await dbManager.updateWord(word);

      expect(mockDB.put).toHaveBeenCalledWith('vocabulary', word);
    });
  });

  describe('removeWord', () => {
    beforeEach(async () => {
      await dbManager.initialize();
    });

    it('should remove word and its occurrences', async () => {
      const wordId = 'test-id';
      const mockOccurrences = [
        { id: 'occ1', wordId, url: 'test.com', timestamp: new Date() },
        { id: 'occ2', wordId, url: 'test2.com', timestamp: new Date() }
      ];

      mockDB.delete.mockResolvedValue(undefined);
      mockDB.getAllFromIndex.mockResolvedValue(mockOccurrences);

      await dbManager.removeWord(wordId);

      expect(mockDB.delete).toHaveBeenCalledWith('vocabulary', wordId);
      expect(mockDB.getAllFromIndex).toHaveBeenCalledWith('occurrences', 'wordId', wordId);
      expect(mockDB.delete).toHaveBeenCalledTimes(3); // 1 word + 2 occurrences
    });
  });

  describe('recordOccurrence', () => {
    beforeEach(async () => {
      await dbManager.initialize();
    });

    it('should record occurrence and update word counter', async () => {
      const wordId = 'test-id';
      const url = 'https://example.com';
      const context = 'test context';
      
      const mockWord: VocabularyWord = {
        id: wordId,
        english: 'test',
        hebrew: 'בדיקה',
        dateAdded: new Date(),
        timesShown: 5,
        difficulty: 'medium',
        category: 'general'
      };

      mockDB.add.mockResolvedValue(undefined);
      mockDB.get.mockResolvedValue(mockWord);
      mockDB.put.mockResolvedValue(undefined);

      await dbManager.recordOccurrence(wordId, url, context);

      expect(mockDB.add).toHaveBeenCalledWith('occurrences', expect.objectContaining({
        wordId,
        url,
        context,
        timestamp: expect.any(Date)
      }));

      expect(mockDB.put).toHaveBeenCalledWith('vocabulary', expect.objectContaining({
        ...mockWord,
        timesShown: 6,
        lastSeen: expect.any(Date)
      }));
    });
  });

  describe('getSettings', () => {
    beforeEach(async () => {
      await dbManager.initialize();
    });

    it('should retrieve user settings', async () => {
      const mockSettings: UserSettings = {
        isEnabled: true,
        replacementMode: 'random',
        replacementPercentage: 75,
        showTooltipDelay: 300,
        categories: ['general', 'work'],
        excludedDomains: ['google.com']
      };

      mockDB.get.mockResolvedValue({ key: 'userSettings', value: mockSettings });

      const result = await dbManager.getSettings();

      expect(result).toEqual(mockSettings);
      expect(mockDB.get).toHaveBeenCalledWith('settings', 'userSettings');
    });

    it('should return undefined if settings not found', async () => {
      mockDB.get.mockResolvedValue(undefined);

      const result = await dbManager.getSettings();

      expect(result).toBeUndefined();
    });
  });

  describe('updateSettings', () => {
    beforeEach(async () => {
      await dbManager.initialize();
    });

    it('should update user settings', async () => {
      const settings: UserSettings = {
        isEnabled: false,
        replacementMode: 'all',
        replacementPercentage: 100,
        showTooltipDelay: 200,
        categories: ['food'],
        excludedDomains: ['example.com']
      };

      mockDB.put.mockResolvedValue(undefined);

      await dbManager.updateSettings(settings);

      expect(mockDB.put).toHaveBeenCalledWith('settings', {
        key: 'userSettings',
        value: settings
      });
    });
  });

  describe('getStatistics', () => {
    beforeEach(async () => {
      await dbManager.initialize();
    });

    it('should calculate and return statistics', async () => {
      const mockVocabulary: VocabularyWord[] = [
        {
          id: '1',
          english: 'test1',
          hebrew: 'בדיקה1',
          dateAdded: new Date(),
          timesShown: 10,
          difficulty: 'easy',
          category: 'general'
        },
        {
          id: '2',
          english: 'test2',
          hebrew: 'בדיקה2',
          dateAdded: new Date(),
          timesShown: 5,
          difficulty: 'medium',
          category: 'general'
        }
      ];

      const mockOccurrences = [
        { id: 'occ1', wordId: '1', url: 'test.com', timestamp: new Date() },
        { id: 'occ2', wordId: '2', url: 'test.com', timestamp: new Date() }
      ];

      mockDB.getAll
        .mockResolvedValueOnce(mockVocabulary)
        .mockResolvedValueOnce(mockOccurrences);

      const result = await dbManager.getStatistics();

      expect(result.totalWords).toBe(2);
      expect(result.totalOccurrences).toBe(2);
      expect(result.mostSeenWords).toHaveLength(2);
      expect(result.mostSeenWords[0].word.id).toBe('1'); // Most seen first
      expect(result.mostSeenWords[0].count).toBe(10);
      expect(result.recentActivity).toHaveLength(2);
    });
  });
});