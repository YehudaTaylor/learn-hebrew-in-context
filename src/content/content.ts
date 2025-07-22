import { VocabularyWord, UserSettings, RecordOccurrenceMessage } from '../shared/types';
import { 
  normalizeWord, 
  shouldReplaceWord, 
  extractContext,
  isDomainExcluded,
  debounce
} from '../shared/utils';

class ContentScript {
  private vocabulary: VocabularyWord[] = [];
  private settings: UserSettings | null = null;
  private replacedWords: Map<HTMLElement, { original: string; word: VocabularyWord }> = new Map();
  private tooltip: HTMLElement | null = null;
  private isProcessing = false;
  private observer: MutationObserver | null = null;

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
        this.promptAddWord(selectedText);
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

  private promptAddWord(englishWord: string): void {
    const hebrewTranslation = prompt(
      `Add "${englishWord}" to your vocabulary.\nEnter the Hebrew translation:`
    );

    if (hebrewTranslation && hebrewTranslation.trim()) {
      chrome.runtime.sendMessage({
        type: 'ADD_WORD',
        payload: {
          english: englishWord.toLowerCase(),
          hebrew: hebrewTranslation.trim(),
          category: 'user-added'
        }
      });
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