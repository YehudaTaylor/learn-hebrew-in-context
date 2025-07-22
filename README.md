# Learn Hebrew in Context

A Chrome extension that helps you learn Hebrew vocabulary by replacing English words on web pages with their Hebrew translations. Hover over Hebrew words to see the original English, build your vocabulary, and track your learning progress.

## Features

- **Contextual Learning**: Words are replaced directly on web pages for natural learning
- **Interactive Tooltips**: Hover over Hebrew words to see English translations
- **Vocabulary Management**: Add, remove, and organize your vocabulary through an intuitive popup interface
- **Multiple Learning Modes**: 
  - Replace all words
  - Random replacement based on percentage
  - Difficulty-based replacement
- **Smart Word Selection**: Shift+click any word on a page to add it to your vocabulary
- **Statistics Tracking**: Monitor your learning progress with detailed statistics
- **Customizable Settings**: 
  - Exclude specific domains
  - Adjust replacement percentages
  - Configure tooltip timing
- **Data Export**: Export your vocabulary and statistics for backup or analysis

## Installation

### From Source
1. Clone this repository
2. Install dependencies: `npm install`
3. Build the extension: `npm run build`
4. Load the `dist` folder as an unpacked extension in Chrome

### Development Setup
```bash
# Install dependencies
npm install

# Start development build with watch mode
npm run dev

# Run tests
npm run test

# Lint and type check
npm run lint
npm run typecheck
```

## Usage

1. **Install and Enable**: Install the extension and ensure it's enabled
2. **Add Vocabulary**: Use the popup to add English-Hebrew word pairs
3. **Browse Naturally**: Visit any website - English words in your vocabulary will be replaced with Hebrew
4. **Learn Interactively**: Hover over Hebrew words to see the English translation
5. **Expand Vocabulary**: Shift+click any word on a page to add it to your vocabulary
6. **Track Progress**: View statistics and learning progress in the popup

## Architecture

Built with modern web technologies:
- **TypeScript** for type safety and better development experience
- **Webpack** for efficient bundling and development
- **IndexedDB** for robust local data storage
- **Chrome Extension Manifest V3** for security and performance
- **Jest** for comprehensive testing

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with appropriate tests
4. Ensure all tests pass: `npm test`
5. Submit a pull request

## Privacy

This extension:
- Stores all data locally in your browser
- Does not send any data to external servers
- Only accesses web page content to perform word replacement
- Respects your privacy and learning preferences

## License

MIT License - see LICENSE file for details
