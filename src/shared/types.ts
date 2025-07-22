export interface VocabularyWord {
  id: string;
  english: string;
  hebrew: string;
  dateAdded: Date;
  lastSeen?: Date;
  timesShown: number;
  difficulty: 'easy' | 'medium' | 'hard';
  category: string;
}

export interface WordOccurrence {
  id: string;
  wordId: string;
  url: string;
  timestamp: Date;
  context: string;
}

export interface UserSettings {
  isEnabled: boolean;
  replacementMode: 'all' | 'random' | 'difficulty-based';
  replacementPercentage: number; // 0-100
  showTooltipDelay: number; // milliseconds
  categories: string[];
  excludedDomains: string[];
}

export interface StorageData {
  vocabulary: VocabularyWord[];
  occurrences: WordOccurrence[];
  settings: UserSettings;
}

export type MessageType = 
  | 'GET_VOCABULARY'
  | 'ADD_WORD'
  | 'REMOVE_WORD'
  | 'UPDATE_WORD'
  | 'RECORD_OCCURRENCE'
  | 'GET_SETTINGS'
  | 'UPDATE_SETTINGS'
  | 'TOGGLE_EXTENSION'
  | 'GET_STATISTICS';

export interface Message {
  type: MessageType;
  payload?: unknown;
}

export interface AddWordMessage extends Message {
  type: 'ADD_WORD';
  payload: {
    english: string;
    hebrew: string;
    category: string;
  };
}

export interface RecordOccurrenceMessage extends Message {
  type: 'RECORD_OCCURRENCE';
  payload: {
    wordId: string;
    url: string;
    context: string;
  };
}