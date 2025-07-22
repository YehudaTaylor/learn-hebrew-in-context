# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a production-ready Chrome extension called "Learn Hebrew in Context" that helps users learn Hebrew vocabulary by replacing English words on web pages with their Hebrew translations. Users can hover over replaced words to see the original English text, and can build their vocabulary through an interactive popup interface.

## Architecture

The extension follows Chrome Extension Manifest V3 architecture with TypeScript:

### Core Components
- **Background Service Worker** (`src/background/`): Handles data management, Chrome API interactions, context menus
- **Content Scripts** (`src/content/`): Performs word replacement on web pages, handles user interactions
- **Popup Interface** (`src/popup/`): Vocabulary management, settings, statistics dashboard
- **Shared Utilities** (`src/shared/`): Database layer (IndexedDB), types, utilities

### Database Architecture
- **IndexedDB** for persistent storage with three main stores:
  - `vocabulary`: Stores word pairs with metadata
  - `occurrences`: Tracks when/where words are seen
  - `settings`: User preferences and configuration
- **Database Manager** (`src/shared/database.ts`): Handles all database operations

### Key Features Implemented
- Real-time word replacement with multiple replacement modes
- Hover tooltips showing original words
- Shift+click to add new words to vocabulary
- Statistics tracking and analytics
- Domain exclusions and customizable settings
- Context menu integration
- Data export functionality

## Development Commands

```bash
# Install dependencies
npm install

# Development build with watch mode
npm run dev

# Production build
npm run build

# Run tests
npm run test
npm run test:watch

# Code quality
npm run lint
npm run lint:fix
npm run typecheck

# Package extension for Chrome Store
npm run package
```

## File Structure

```
src/
├── background/          # Service worker
├── content/            # Content scripts for web pages
├── popup/              # Extension popup UI
└── shared/             # Shared utilities and types
    ├── database.ts     # IndexedDB management
    ├── types.ts        # TypeScript interfaces
    └── utils.ts        # Helper functions

public/
├── manifest.json       # Extension manifest
└── icons/              # Extension icons (need to be added)

tests/                  # Jest test suites
```

## Key Development Notes

### Database Operations
- All database operations are async and use the `db` singleton from `src/shared/database.ts`
- Word occurrences are automatically tracked when words are shown to users
- Statistics are calculated dynamically from stored data

### Content Script Behavior
- Uses `MutationObserver` to handle dynamic content
- Respects user settings for replacement modes and percentages
- Excludes script tags, style elements, and form inputs
- Implements debouncing for performance

### Message Passing
- Background service handles all Chrome API interactions
- Content scripts communicate with background via `chrome.runtime.sendMessage`
- Popup communicates with background for data management

### Testing
- Jest with jsdom environment
- Chrome APIs are mocked in `tests/setup.ts`
- Tests cover utilities, database operations, and content script logic

## Installation Instructions

### Load as Unpacked Extension (for testing/development):
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `dist` folder from this project
5. The extension should now appear in your extensions list

### Chrome Store Preparation

For publishing to Chrome Web Store:
1. ✅ Extension icons created (16, 32, 48, 128px)
2. Test across different websites and languages
3. Verify performance with large vocabularies
4. Review manifest permissions for minimal required access
5. Prepare store listing with screenshots and descriptions

## Performance Considerations
- Content scripts use debouncing to limit DOM processing
- Database operations are batched where possible
- Word replacement is optimized with `createTreeWalker` for efficient DOM traversal
- Settings changes notify content scripts to avoid unnecessary reprocessing