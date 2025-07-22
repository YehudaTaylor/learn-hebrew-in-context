import { db } from '../shared/database';
import { 
  Message, 
  AddWordMessage, 
  RecordOccurrenceMessage, 
  VocabularyWord, 
  UserSettings 
} from '../shared/types';
import { TranslationService } from '../shared/translation-service';

class BackgroundService {
  private initialized = false;
  private translationService = new TranslationService();

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await db.initialize();
      this.setupMessageHandlers();
      this.setupContextMenus();
      this.initialized = true;
      console.log('Background service initialized');
    } catch (error) {
      console.error('Failed to initialize background service:', error);
    }
  }

  private setupMessageHandlers(): void {
    chrome.runtime.onMessage.addListener((
      message: Message,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response: any) => void
    ) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep the message channel open for async responses
    });
  }

  private async handleMessage(
    message: Message,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: any) => void
  ): Promise<void> {
    try {
      switch (message.type) {
        case 'GET_VOCABULARY':
          const vocabulary = await db.getVocabulary();
          sendResponse({ success: true, vocabulary });
          break;

        case 'ADD_WORD':
          const addWordPayload = (message as AddWordMessage).payload;
          const newWord = await db.addWord({
            english: addWordPayload.english,
            hebrew: addWordPayload.hebrew,
            category: addWordPayload.category || 'general',
            difficulty: 'medium' // Default difficulty
          });
          
          // Notify content scripts of vocabulary update
          this.notifyContentScripts('VOCABULARY_UPDATED');
          
          sendResponse({ success: true, word: newWord });
          break;

        case 'REMOVE_WORD':
          const { id } = (message.payload as any);
          await db.removeWord(id);
          
          // Notify content scripts of vocabulary update
          this.notifyContentScripts('VOCABULARY_UPDATED');
          
          sendResponse({ success: true });
          break;

        case 'UPDATE_WORD':
          const wordToUpdate = (message.payload as any).word as VocabularyWord;
          await db.updateWord(wordToUpdate);
          
          // Notify content scripts of vocabulary update
          this.notifyContentScripts('VOCABULARY_UPDATED');
          
          sendResponse({ success: true });
          break;

        case 'RECORD_OCCURRENCE':
          const occurrencePayload = (message as RecordOccurrenceMessage).payload;
          await db.recordOccurrence(
            occurrencePayload.wordId,
            occurrencePayload.url,
            occurrencePayload.context
          );
          sendResponse({ success: true });
          break;

        case 'GET_SETTINGS':
          const settings = await db.getSettings();
          sendResponse({ success: true, settings });
          break;

        case 'UPDATE_SETTINGS':
          const newSettings = (message.payload as any).settings as UserSettings;
          await db.updateSettings(newSettings);
          
          // Notify content scripts of settings update
          this.notifyContentScripts('SETTINGS_UPDATED');
          
          sendResponse({ success: true });
          break;

        case 'GET_STATISTICS':
          const statistics = await db.getStatistics();
          sendResponse({ success: true, statistics });
          break;

        case 'TOGGLE_EXTENSION':
          const currentSettings = await db.getSettings();
          if (currentSettings) {
            currentSettings.isEnabled = !currentSettings.isEnabled;
            await db.updateSettings(currentSettings);
            this.notifyContentScripts('SETTINGS_UPDATED');
            sendResponse({ success: true, enabled: currentSettings.isEnabled });
          } else {
            sendResponse({ success: false, error: 'Settings not found' });
          }
          break;

        default:
          console.warn('Unknown message type:', message.type);
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ success: false, error: (error as Error).message });
    }
  }

  private async notifyContentScripts(type: string): Promise<void> {
    try {
      const tabs = await chrome.tabs.query({ active: true });
      
      for (const tab of tabs) {
        if (tab.id && tab.url && (tab.url.startsWith('http') || tab.url.startsWith('https'))) {
          try {
            await chrome.tabs.sendMessage(tab.id, { type });
          } catch (error) {
            // Content script might not be injected yet, that's okay
            console.debug('Could not notify content script in tab:', tab.id);
          }
        }
      }
    } catch (error) {
      console.error('Error notifying content scripts:', error);
    }
  }

  private setupContextMenus(): void {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: 'add-hebrew-word',
        title: 'Add "%s" to Hebrew vocabulary',
        contexts: ['selection']
      });

      chrome.contextMenus.create({
        id: 'toggle-extension',
        title: 'Toggle Hebrew learning',
        contexts: ['page']
      });
    });

    chrome.contextMenus.onClicked.addListener(async (info, _tab) => {
      if (info.menuItemId === 'add-hebrew-word' && info.selectionText) {
        const selectedText = info.selectionText.trim();
        
        if (selectedText.length > 0) {
          // Check if word already exists
          const existingWord = await db.getWordByEnglish(selectedText.toLowerCase());
          
          if (existingWord) {
            this.showNotification(
              'Word Already Exists',
              `"${selectedText}" is already in your vocabulary.`
            );
          } else {
            // Try to auto-translate the word
            try {
              this.showNotification(
                'Translating...',
                `Looking up Hebrew translation for "${selectedText}"`
              );

              const translation = await this.translationService.translateToHebrew(selectedText);
              
              await db.addWord({
                english: selectedText.toLowerCase(),
                hebrew: translation.hebrew,
                difficulty: 'medium',
                category: 'context-menu'
              });

              this.notifyContentScripts('VOCABULARY_UPDATED');
              
              this.showNotification(
                'Word Added',
                `"${selectedText}" → "${translation.hebrew}" (via ${translation.source})`
              );

            } catch (error) {
              // Fallback to placeholder if translation fails
              console.error('Context menu translation failed:', error);
              
              await db.addWord({
                english: selectedText.toLowerCase(),
                hebrew: '[Add Hebrew translation]',
                difficulty: 'medium',
                category: 'context-menu'
              });

              this.notifyContentScripts('VOCABULARY_UPDATED');
              
              this.showNotification(
                'Word Added (Translation Failed)',
                `"${selectedText}" added to vocabulary. Please add Hebrew translation in the extension popup.`
              );
            }
          }
        }
      } else if (info.menuItemId === 'toggle-extension') {
        const settings = await db.getSettings();
        if (settings) {
          settings.isEnabled = !settings.isEnabled;
          await db.updateSettings(settings);
          this.notifyContentScripts('SETTINGS_UPDATED');
          
          this.showNotification(
            'Extension Toggled',
            `Hebrew learning is now ${settings.isEnabled ? 'enabled' : 'disabled'}.`
          );
        }
      }
    });
  }

  private showNotification(title: string, message: string): void {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon-48.png',
      title,
      message
    });
  }
}

// Chrome extension service worker event handlers
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('Extension installed:', details.reason);
  
  const backgroundService = new BackgroundService();
  await backgroundService.initialize();

  // Add some default vocabulary words on first install
  if (details.reason === 'install') {
    try {
      const defaultWords = [
        { english: 'hello', hebrew: 'שלום', difficulty: 'easy' as const, category: 'greetings' },
        { english: 'thank you', hebrew: 'תודה', difficulty: 'easy' as const, category: 'greetings' },
        { english: 'water', hebrew: 'מים', difficulty: 'easy' as const, category: 'basic' },
        { english: 'food', hebrew: 'אוכל', difficulty: 'easy' as const, category: 'basic' },
        { english: 'house', hebrew: 'בית', difficulty: 'easy' as const, category: 'basic' }
      ];

      for (const word of defaultWords) {
        await db.addWord(word);
      }

      console.log('Added default vocabulary words');
    } catch (error) {
      console.error('Failed to add default words:', error);
    }
  }
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('Extension startup');
  const backgroundService = new BackgroundService();
  await backgroundService.initialize();
});

// Handle extension icon click
chrome.action.onClicked.addListener(async (_tab) => {
  // This won't be called if we have a popup, but keeping it for completeness
  console.log('Extension icon clicked');
});

// Handle tab updates to inject content script if needed
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && 
      (tab.url.startsWith('http') || tab.url.startsWith('https'))) {
    
    // Check if content script is already injected
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    } catch (error) {
      // Content script not injected, inject it
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js']
        });
        console.log('Content script injected into tab:', tabId);
      } catch (injectionError) {
        console.debug('Could not inject content script:', injectionError);
      }
    }
  }
});

// Initialize background service immediately
const backgroundService = new BackgroundService();
backgroundService.initialize();