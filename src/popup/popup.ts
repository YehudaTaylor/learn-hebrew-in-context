import { VocabularyWord, UserSettings, AddWordMessage } from '../shared/types';
import { validateHebrewText, formatDate, exportToJson } from '../shared/utils';

class PopupManager {
  private vocabulary: VocabularyWord[] = [];
  private settings: UserSettings | null = null;

  async initialize(): Promise<void> {
    this.setupEventListeners();
    await this.loadData();
    this.updateUI();
  }

  private setupEventListeners(): void {
    // Tab navigation
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const tabName = (e.target as HTMLElement).dataset.tab!;
        this.switchTab(tabName);
      });
    });

    // Main toggle
    const mainToggle = document.getElementById('mainToggle')!;
    mainToggle.addEventListener('click', () => this.toggleExtension());

    // Add word form
    const addWordBtn = document.getElementById('addWordBtn')!;
    addWordBtn.addEventListener('click', () => this.addWord());

    const englishWordInput = document.getElementById('englishWord') as HTMLInputElement;
    const hebrewWordInput = document.getElementById('hebrewWord') as HTMLInputElement;
    [englishWordInput, hebrewWordInput].forEach(input => {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.addWord();
        }
      });
    });

    // Settings
    const saveSettingsBtn = document.getElementById('saveSettingsBtn')!;
    saveSettingsBtn.addEventListener('click', () => this.saveSettings());

    const replacementPercentage = document.getElementById('replacementPercentage') as HTMLInputElement;
    replacementPercentage.addEventListener('input', () => {
      document.getElementById('percentageValue')!.textContent = `${replacementPercentage.value}%`;
    });

    const tooltipDelay = document.getElementById('tooltipDelay') as HTMLInputElement;
    tooltipDelay.addEventListener('input', () => {
      document.getElementById('delayValue')!.textContent = `${tooltipDelay.value}ms`;
    });

    const addDomainBtn = document.getElementById('addDomainBtn')!;
    addDomainBtn.addEventListener('click', () => this.addExcludedDomain());

    // Export data
    const exportDataBtn = document.getElementById('exportDataBtn')!;
    exportDataBtn.addEventListener('click', () => this.exportData());
  }

  private async loadData(): Promise<void> {
    try {
      const [vocabularyResponse, settingsResponse] = await Promise.all([
        chrome.runtime.sendMessage({ type: 'GET_VOCABULARY' }),
        chrome.runtime.sendMessage({ type: 'GET_SETTINGS' })
      ]);

      this.vocabulary = vocabularyResponse?.vocabulary || [];
      this.settings = settingsResponse?.settings || this.getDefaultSettings();
    } catch (error) {
      console.error('Failed to load data:', error);
      this.showError('Failed to load data. Please try again.');
    }
  }

  private getDefaultSettings(): UserSettings {
    return {
      isEnabled: true,
      replacementMode: 'random',
      replacementPercentage: 50,
      showTooltipDelay: 500,
      categories: ['general'],
      excludedDomains: []
    };
  }

  private updateUI(): void {
    this.updateMainToggle();
    this.updateVocabularyTab();
    this.updateSettingsTab();
    this.updateStatsTab();
  }

  private updateMainToggle(): void {
    const toggle = document.getElementById('mainToggle')!;
    const isEnabled = this.settings?.isEnabled || false;
    
    if (isEnabled) {
      toggle.classList.add('active');
    } else {
      toggle.classList.remove('active');
    }
  }

  private updateVocabularyTab(): void {
    const wordList = document.getElementById('wordList')!;
    
    if (this.vocabulary.length === 0) {
      wordList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📚</div>
          <p>No words in your vocabulary yet.</p>
          <p>Add some words above to get started!</p>
        </div>
      `;
      return;
    }

    const sortedVocabulary = [...this.vocabulary].sort((a, b) => 
      b.dateAdded.getTime() - a.dateAdded.getTime()
    );

    wordList.innerHTML = sortedVocabulary.map(word => `
      <div class="word-item">
        <div class="word-info">
          <div class="word-english">${this.escapeHtml(word.english)}</div>
          <div class="word-hebrew">${this.escapeHtml(word.hebrew)}</div>
          <div class="word-meta">
            ${word.category || 'general'} • 
            Seen ${word.timesShown} times • 
            Added ${formatDate(word.dateAdded)}
          </div>
        </div>
        <button class="btn btn-small btn-danger" onclick="removeWord('${word.id}')">
          Remove
        </button>
      </div>
    `).join('');

    // Make removeWord function available globally
    (window as any).removeWord = (id: string) => this.removeWord(id);
  }

  private updateSettingsTab(): void {
    if (!this.settings) return;

    (document.getElementById('replacementMode') as HTMLSelectElement).value = this.settings.replacementMode;
    (document.getElementById('replacementPercentage') as HTMLInputElement).value = this.settings.replacementPercentage.toString();
    (document.getElementById('tooltipDelay') as HTMLInputElement).value = this.settings.showTooltipDelay.toString();
    
    document.getElementById('percentageValue')!.textContent = `${this.settings.replacementPercentage}%`;
    document.getElementById('delayValue')!.textContent = `${this.settings.showTooltipDelay}ms`;

    this.updateExcludedDomainsList();
  }

  private updateExcludedDomainsList(): void {
    const container = document.getElementById('excludedDomainsList')!;
    const domains = this.settings?.excludedDomains || [];

    if (domains.length === 0) {
      container.innerHTML = '<p style="color: #6b7280; font-size: 14px;">No excluded domains</p>';
      return;
    }

    container.innerHTML = domains.map(domain => `
      <div class="setting-item">
        <span>${this.escapeHtml(domain)}</span>
        <button class="btn btn-small btn-danger" onclick="removeDomain('${domain}')">
          Remove
        </button>
      </div>
    `).join('');

    (window as any).removeDomain = (domain: string) => this.removeDomain(domain);
  }

  private async updateStatsTab(): Promise<void> {
    try {
      const statsResponse = await chrome.runtime.sendMessage({ type: 'GET_STATISTICS' });
      const stats = statsResponse?.statistics;

      if (stats) {
        document.getElementById('totalWords')!.textContent = stats.totalWords.toString();
        document.getElementById('totalOccurrences')!.textContent = stats.totalOccurrences.toString();

        const mostSeenContainer = document.getElementById('mostSeenWords')!;
        
        if (stats.mostSeenWords.length === 0) {
          mostSeenContainer.innerHTML = `
            <div class="empty-state">
              <p>No word statistics yet.</p>
              <p>Browse some websites to start collecting data!</p>
            </div>
          `;
        } else {
          mostSeenContainer.innerHTML = stats.mostSeenWords.map((item: any) => `
            <div class="word-item">
              <div class="word-info">
                <div class="word-english">${this.escapeHtml(item.word.english)}</div>
                <div class="word-hebrew">${this.escapeHtml(item.word.hebrew)}</div>
                <div class="word-meta">Seen ${item.count} times</div>
              </div>
            </div>
          `).join('');
        }
      }
    } catch (error) {
      console.error('Failed to load statistics:', error);
      document.getElementById('mostSeenWords')!.innerHTML = '<p>Failed to load statistics</p>';
    }
  }

  private switchTab(tabName: string): void {
    // Update active tab button
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`)!.classList.add('active');

    // Update active tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    document.getElementById(tabName)!.classList.add('active');

    // Refresh stats when switching to stats tab
    if (tabName === 'stats') {
      this.updateStatsTab();
    }
  }

  private async toggleExtension(): Promise<void> {
    if (!this.settings) return;

    this.settings.isEnabled = !this.settings.isEnabled;
    
    try {
      await chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        payload: { settings: this.settings }
      });
      
      this.updateMainToggle();
    } catch (error) {
      console.error('Failed to toggle extension:', error);
      this.showError('Failed to update settings. Please try again.');
    }
  }

  private async addWord(): Promise<void> {
    const englishInput = document.getElementById('englishWord') as HTMLInputElement;
    const hebrewInput = document.getElementById('hebrewWord') as HTMLInputElement;
    const categorySelect = document.getElementById('category') as HTMLSelectElement;

    const english = englishInput.value.trim().toLowerCase();
    const hebrew = hebrewInput.value.trim();
    const category = categorySelect.value;

    this.clearMessages();

    // Validation
    if (!english || !hebrew) {
      this.showError('Please fill in both English and Hebrew fields.');
      return;
    }

    if (!validateHebrewText(hebrew)) {
      this.showError('Please enter valid Hebrew text.');
      return;
    }

    // Check for duplicates
    const existing = this.vocabulary.find(word => 
      word.english.toLowerCase() === english
    );
    
    if (existing) {
      this.showError(`"${english}" is already in your vocabulary.`);
      return;
    }

    try {
      const message: AddWordMessage = {
        type: 'ADD_WORD',
        payload: { english, hebrew, category }
      };

      const response = await chrome.runtime.sendMessage(message);
      
      if (response.success) {
        this.showSuccess(`Added "${english}" to your vocabulary!`);
        
        // Clear form
        englishInput.value = '';
        hebrewInput.value = '';
        categorySelect.value = 'general';

        // Reload and update UI
        await this.loadData();
        this.updateVocabularyTab();
      } else {
        this.showError('Failed to add word. Please try again.');
      }
    } catch (error) {
      console.error('Failed to add word:', error);
      this.showError('Failed to add word. Please try again.');
    }
  }

  private async removeWord(id: string): Promise<void> {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'REMOVE_WORD',
        payload: { id }
      });

      if (response.success) {
        await this.loadData();
        this.updateVocabularyTab();
        this.showSuccess('Word removed from vocabulary.');
      } else {
        this.showError('Failed to remove word. Please try again.');
      }
    } catch (error) {
      console.error('Failed to remove word:', error);
      this.showError('Failed to remove word. Please try again.');
    }
  }

  private async saveSettings(): Promise<void> {
    if (!this.settings) return;

    const replacementMode = (document.getElementById('replacementMode') as HTMLSelectElement).value as any;
    const replacementPercentage = parseInt((document.getElementById('replacementPercentage') as HTMLInputElement).value);
    const tooltipDelay = parseInt((document.getElementById('tooltipDelay') as HTMLInputElement).value);

    this.settings.replacementMode = replacementMode;
    this.settings.replacementPercentage = replacementPercentage;
    this.settings.showTooltipDelay = tooltipDelay;

    try {
      await chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        payload: { settings: this.settings }
      });
      
      this.showSuccess('Settings saved successfully!');
    } catch (error) {
      console.error('Failed to save settings:', error);
      this.showError('Failed to save settings. Please try again.');
    }
  }

  private addExcludedDomain(): void {
    const input = document.getElementById('excludeDomain') as HTMLInputElement;
    const domain = input.value.trim().toLowerCase();

    if (!domain) {
      this.showError('Please enter a domain.');
      return;
    }

    if (this.settings && !this.settings.excludedDomains.includes(domain)) {
      this.settings.excludedDomains.push(domain);
      input.value = '';
      this.updateExcludedDomainsList();
    }
  }

  private removeDomain(domain: string): void {
    if (this.settings) {
      this.settings.excludedDomains = this.settings.excludedDomains.filter(d => d !== domain);
      this.updateExcludedDomainsList();
    }
  }

  private async exportData(): Promise<void> {
    try {
      const statsResponse = await chrome.runtime.sendMessage({ type: 'GET_STATISTICS' });
      
      const exportData = {
        vocabulary: this.vocabulary,
        settings: this.settings,
        statistics: statsResponse?.statistics,
        exportDate: new Date().toISOString()
      };

      const dataStr = exportToJson(exportData);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `hebrew-vocabulary-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      
      URL.revokeObjectURL(url);
      this.showSuccess('Data exported successfully!');
    } catch (error) {
      console.error('Failed to export data:', error);
      this.showError('Failed to export data. Please try again.');
    }
  }

  private showError(message: string): void {
    const errorElement = document.getElementById('errorMessage')!;
    const successElement = document.getElementById('successMessage')!;
    
    successElement.style.display = 'none';
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    
    setTimeout(() => {
      errorElement.style.display = 'none';
    }, 5000);
  }

  private showSuccess(message: string): void {
    const errorElement = document.getElementById('errorMessage')!;
    const successElement = document.getElementById('successMessage')!;
    
    errorElement.style.display = 'none';
    successElement.textContent = message;
    successElement.style.display = 'block';
    
    setTimeout(() => {
      successElement.style.display = 'none';
    }, 3000);
  }

  private clearMessages(): void {
    document.getElementById('errorMessage')!.style.display = 'none';
    document.getElementById('successMessage')!.style.display = 'none';
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new PopupManager().initialize();
});