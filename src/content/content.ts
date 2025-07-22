import { VocabularyWord, UserSettings, RecordOccurrenceMessage } from '../shared/types';
import { 
  normalizeWord, 
  shouldReplaceWord, 
  extractContext,
  isDomainExcluded,
  debounce
} from '../shared/utils';
import { TranslationService, TranslationResult } from '../shared/translation-service';

class ContentScript {
  private vocabulary: VocabularyWord[] = [];
  private settings: UserSettings | null = null;
  private replacedWords: Map<HTMLElement, { original: string; word: VocabularyWord }> = new Map();
  private tooltip: HTMLElement | null = null;
  private isProcessing = false;
  private observer: MutationObserver | null = null;
  private translationService: TranslationService = new TranslationService();
  private loadingTooltip: HTMLElement | null = null;

  async initialize(): Promise<void> {
    if (isDomainExcluded(window.location.href, this.settings?.excludedDomains || [])) {
      return;
    }

    await this.loadData();
    this.setupEventListeners();
    this.setupMutationObserver();
    this.processPage();
  }

  private async loadData(): Promise<void> {
    try {
      const [vocabularyResponse, settingsResponse] = await Promise.all([
        chrome.runtime.sendMessage({ type: 'GET_VOCABULARY' }),
        chrome.runtime.sendMessage({ type: 'GET_SETTINGS' })
      ]);

      this.vocabulary = vocabularyResponse?.vocabulary || [];
      this.settings = settingsResponse?.settings || null;
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  }

  private setupEventListeners(): void {
    document.addEventListener('mouseover', this.handleMouseOver.bind(this));
    document.addEventListener('mouseout', this.handleMouseOut.bind(this));
    document.addEventListener('click', this.handleClick.bind(this));
    
    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === 'VOCABULARY_UPDATED') {
        this.loadData().then(() => this.processPage());
      } else if (message.type === 'SETTINGS_UPDATED') {
        this.loadData().then(() => this.processPage());
      }
      sendResponse({ success: true });
    });
  }

  private setupMutationObserver(): void {
    this.observer = new MutationObserver(debounce(() => {
      if (!this.isProcessing) {
        this.processPage();
      }
    }, 1000));

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  private async processPage(): Promise<void> {
    if (!this.settings?.isEnabled || this.vocabulary.length === 0) {
      return;
    }

    this.isProcessing = true;
    
    // Reset previous replacements
    this.resetReplacements();

    // Process text nodes
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;

          // Skip certain elements
          const skipTags = ['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE', 'PRE'];
          if (skipTags.includes(parent.tagName)) {
            return NodeFilter.FILTER_REJECT;
          }

          // Skip already processed elements
          if (parent.classList.contains('hebrew-replacement')) {
            return NodeFilter.FILTER_REJECT;
          }

          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const textNodes: Text[] = [];
    let node;
    while (node = walker.nextNode()) {
      textNodes.push(node as Text);
    }

    for (const textNode of textNodes) {
      await this.processTextNode(textNode);
    }

    this.isProcessing = false;
  }

  private async processTextNode(textNode: Text): Promise<void> {
    if (!textNode.textContent) return;

    const text = textNode.textContent;
    const words = text.split(/(\s+)/); // Split but keep whitespace
    let hasReplacements = false;
    const newContent: Array<string | HTMLElement> = [];

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      
      if (/\s/.test(word)) {
        // It's whitespace, keep as is
        newContent.push(word);
        continue;
      }

      const normalizedWord = normalizeWord(word);
      const vocabularyWord = this.vocabulary.find(
        vw => normalizeWord(vw.english) === normalizedWord
      );

      if (vocabularyWord && shouldReplaceWord(vocabularyWord, this.settings!)) {
        const replacement = this.createReplacement(word, vocabularyWord, text);
        newContent.push(replacement);
        hasReplacements = true;

        // Record the occurrence
        this.recordOccurrence(vocabularyWord, text);
      } else {
        newContent.push(word);
      }
    }

    if (hasReplacements) {
      this.replaceTextNode(textNode, newContent);
    }
  }

  private createReplacement(
    originalWord: string, 
    vocabularyWord: VocabularyWord, 
    _context: string
  ): HTMLElement {
    const span = document.createElement('span');
    span.className = 'hebrew-replacement';
    span.textContent = vocabularyWord.hebrew;
    span.style.cssText = `
      color: #2563eb;
      font-weight: 500;
      cursor: help;
      border-bottom: 1px dotted #2563eb;
      transition: all 0.2s ease;
    `;

    // Store replacement data
    this.replacedWords.set(span, { original: originalWord, word: vocabularyWord });

    return span;
  }

  private replaceTextNode(textNode: Text, content: Array<string | HTMLElement>): void {
    const fragment = document.createDocumentFragment();
    
    for (const item of content) {
      if (typeof item === 'string') {
        fragment.appendChild(document.createTextNode(item));
      } else {
        fragment.appendChild(item);
      }
    }

    textNode.parentNode?.replaceChild(fragment, textNode);
  }

  private handleMouseOver(event: Event): void {
    const target = event.target as HTMLElement;
    
    if (target.classList.contains('hebrew-replacement')) {
      const replacementData = this.replacedWords.get(target);
      if (replacementData) {
        this.showTooltip(target, replacementData.original);
        
        // Highlight effect
        target.style.backgroundColor = '#dbeafe';
        target.style.color = '#1d4ed8';
      }
    }
  }

  private handleMouseOut(event: Event): void {
    const target = event.target as HTMLElement;
    
    if (target.classList.contains('hebrew-replacement')) {
      this.hideTooltip();
      
      // Remove highlight
      target.style.backgroundColor = 'transparent';
      target.style.color = '#2563eb';
    }
  }

  private handleClick(event: Event): void {
    const target = event.target as HTMLElement;
    
    // Shift+click to add word to vocabulary
    if (event instanceof MouseEvent && event.shiftKey) {
      const selection = window.getSelection();
      let selectedText = selection?.toString().trim();
      
      if (!selectedText && target.nodeType === Node.TEXT_NODE) {
        selectedText = this.getWordAtPosition(target, event);
      }

      if (selectedText && selectedText.length > 0) {
        this.autoAddWord(selectedText, event.clientX, event.clientY);
        event.preventDefault();
      }
    }
  }

  private getWordAtPosition(element: HTMLElement, event: MouseEvent): string {
    const textContent = element.textContent || '';
    const range = document.caretRangeFromPoint(event.clientX, event.clientY);
    
    if (!range) return '';

    const offset = range.startOffset;
    const words = textContent.split(/\s+/);
    let currentPos = 0;

    for (const word of words) {
      if (offset >= currentPos && offset <= currentPos + word.length) {
        return word.replace(/[^\w]/g, '');
      }
      currentPos += word.length + 1; // +1 for space
    }

    return '';
  }

  private showTooltip(target: HTMLElement, originalWord: string): void {
    this.hideTooltip(); // Hide any existing tooltip

    this.tooltip = document.createElement('div');
    this.tooltip.className = 'hebrew-tooltip';
    this.tooltip.textContent = originalWord;
    this.tooltip.style.cssText = `
      position: absolute;
      background: #1f2937;
      color: white;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 14px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      z-index: 10000;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
      pointer-events: none;
      white-space: nowrap;
    `;

    document.body.appendChild(this.tooltip);

    const rect = target.getBoundingClientRect();
    const tooltipRect = this.tooltip.getBoundingClientRect();
    
    let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
    let top = rect.top - tooltipRect.height - 8;

    // Adjust if tooltip goes off screen
    if (left < 0) left = 8;
    if (left + tooltipRect.width > window.innerWidth) {
      left = window.innerWidth - tooltipRect.width - 8;
    }
    if (top < 0) {
      top = rect.bottom + 8;
    }

    this.tooltip.style.left = `${left + window.scrollX}px`;
    this.tooltip.style.top = `${top + window.scrollY}px`;
  }

  private hideTooltip(): void {
    if (this.tooltip) {
      this.tooltip.remove();
      this.tooltip = null;
    }
  }

  private async autoAddWord(englishWord: string, x: number, y: number): Promise<void> {
    // Check if word already exists
    const existingWord = this.vocabulary.find(
      w => normalizeWord(w.english) === normalizeWord(englishWord)
    );
    
    if (existingWord) {
      this.showTemporaryMessage(
        `"${englishWord}" is already in your vocabulary (${existingWord.hebrew})`,
        x, y, 'info'
      );
      return;
    }

    // Show loading indicator
    this.showLoadingTooltip(englishWord, x, y);

    try {
      // Get automatic translation
      const translation: TranslationResult = await this.translationService.translateToHebrew(englishWord);
      
      // Hide loading tooltip
      this.hideLoadingTooltip();

      // Add word to vocabulary
      await chrome.runtime.sendMessage({
        type: 'ADD_WORD',
        payload: {
          english: englishWord.toLowerCase(),
          hebrew: translation.hebrew,
          category: 'auto-added'
        }
      });

      // Show success message
      this.showTemporaryMessage(
        `Added "${englishWord}" → "${translation.hebrew}" (via ${translation.source})`,
        x, y, 'success'
      );

    } catch (error) {
      console.error('Auto-translation failed:', error);
      this.hideLoadingTooltip();
      
      // Fallback to manual input
      this.showManualTranslationPrompt(englishWord, x, y);
    }
  }

  private showLoadingTooltip(word: string, x: number, y: number): void {
    this.hideLoadingTooltip();
    
    this.loadingTooltip = document.createElement('div');
    this.loadingTooltip.className = 'hebrew-loading-tooltip';
    this.loadingTooltip.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <div class="loading-spinner"></div>
        <span>Translating "${word}"...</span>
      </div>
    `;
    
    this.loadingTooltip.style.cssText = `
      position: absolute;
      background: #1f2937;
      color: white;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 14px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      z-index: 10001;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
      pointer-events: none;
      white-space: nowrap;
    `;

    // Add CSS for loading spinner
    if (!document.getElementById('hebrew-loading-styles')) {
      const style = document.createElement('style');
      style.id = 'hebrew-loading-styles';
      style.textContent = `
        .loading-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top: 2px solid white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(this.loadingTooltip);

    // Position tooltip
    const tooltipRect = this.loadingTooltip.getBoundingClientRect();
    let left = x - (tooltipRect.width / 2);
    let top = y - tooltipRect.height - 10;

    // Adjust if tooltip goes off screen
    if (left < 0) left = 8;
    if (left + tooltipRect.width > window.innerWidth) {
      left = window.innerWidth - tooltipRect.width - 8;
    }
    if (top < 0) {
      top = y + 10;
    }

    this.loadingTooltip.style.left = `${left + window.scrollX}px`;
    this.loadingTooltip.style.top = `${top + window.scrollY}px`;
  }

  private hideLoadingTooltip(): void {
    if (this.loadingTooltip) {
      this.loadingTooltip.remove();
      this.loadingTooltip = null;
    }
  }

  private showTemporaryMessage(message: string, x: number, y: number, type: 'success' | 'error' | 'info'): void {
    const colors = {
      success: { bg: '#10b981', border: '#059669' },
      error: { bg: '#ef4444', border: '#dc2626' },
      info: { bg: '#3b82f6', border: '#2563eb' }
    };

    const messageEl = document.createElement('div');
    messageEl.className = `hebrew-temp-message ${type}`;
    messageEl.textContent = message;
    
    messageEl.style.cssText = `
      position: absolute;
      background: ${colors[type].bg};
      color: white;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 14px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      z-index: 10002;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
      pointer-events: none;
      max-width: 300px;
      opacity: 0;
      transform: translateY(10px);
      transition: all 0.3s ease;
    `;

    document.body.appendChild(messageEl);

    // Position message
    const messageRect = messageEl.getBoundingClientRect();
    let left = x - (messageRect.width / 2);
    let top = y - messageRect.height - 10;

    if (left < 0) left = 8;
    if (left + messageRect.width > window.innerWidth) {
      left = window.innerWidth - messageRect.width - 8;
    }
    if (top < 0) {
      top = y + 10;
    }

    messageEl.style.left = `${left + window.scrollX}px`;
    messageEl.style.top = `${top + window.scrollY}px`;

    // Animate in
    requestAnimationFrame(() => {
      messageEl.style.opacity = '1';
      messageEl.style.transform = 'translateY(0)';
    });

    // Remove after delay
    setTimeout(() => {
      messageEl.style.opacity = '0';
      messageEl.style.transform = 'translateY(-10px)';
      setTimeout(() => {
        messageEl.remove();
      }, 300);
    }, 3000);
  }

  private showManualTranslationPrompt(englishWord: string, x: number, y: number): void {
    const hebrewTranslation = prompt(
      `Auto-translation failed for "${englishWord}".\nPlease enter the Hebrew translation manually:`
    );

    if (hebrewTranslation && hebrewTranslation.trim()) {
      chrome.runtime.sendMessage({
        type: 'ADD_WORD',
        payload: {
          english: englishWord.toLowerCase(),
          hebrew: hebrewTranslation.trim(),
          category: 'manual-added'
        }
      });

      this.showTemporaryMessage(
        `Added "${englishWord}" → "${hebrewTranslation}" (manual entry)`,
        x, y, 'success'
      );
    }
  }

  private async recordOccurrence(word: VocabularyWord, context: string): Promise<void> {
    const message: RecordOccurrenceMessage = {
      type: 'RECORD_OCCURRENCE',
      payload: {
        wordId: word.id,
        url: window.location.href,
        context: extractContext(context, 0, word.english.length)
      }
    };

    try {
      await chrome.runtime.sendMessage(message);
    } catch (error) {
      console.error('Failed to record occurrence:', error);
    }
  }

  private resetReplacements(): void {
    // Remove all existing replacements
    const existingReplacements = document.querySelectorAll('.hebrew-replacement');
    existingReplacements.forEach(element => {
      const parent = element.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(element.textContent || ''), element);
      }
    });

    this.replacedWords.clear();
    this.hideTooltip();
  }

  destroy(): void {
    this.resetReplacements();
    this.observer?.disconnect();
    this.hideTooltip();
    this.hideLoadingTooltip();
    
    // Clean up any temporary messages
    document.querySelectorAll('.hebrew-temp-message').forEach(el => el.remove());
    
    document.removeEventListener('mouseover', this.handleMouseOver);
    document.removeEventListener('mouseout', this.handleMouseOut);
    document.removeEventListener('click', this.handleClick);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new ContentScript().initialize();
  });
} else {
  new ContentScript().initialize();
}