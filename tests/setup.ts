// Mock Chrome APIs for testing
const mockChrome = {
  runtime: {
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    },
    getURL: jest.fn((path: string) => `chrome-extension://test/${path}`)
  },
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
      clear: jest.fn()
    },
    sync: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
      clear: jest.fn()
    }
  },
  tabs: {
    query: jest.fn(),
    sendMessage: jest.fn(),
    onUpdated: {
      addListener: jest.fn()
    }
  },
  scripting: {
    executeScript: jest.fn()
  },
  contextMenus: {
    create: jest.fn(),
    removeAll: jest.fn(),
    onClicked: {
      addListener: jest.fn()
    }
  },
  notifications: {
    create: jest.fn()
  },
  action: {
    onClicked: {
      addListener: jest.fn()
    }
  }
};

// Make chrome API available globally
(global as any).chrome = mockChrome;

// Mock crypto.randomUUID for Node.js environment
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: jest.fn(() => 'test-uuid-' + Math.random().toString(36).substr(2, 9))
  }
});

// Mock window.URL for tests that need it
if (!global.URL) {
  (global as any).URL = class MockURL {
    hostname: string;
    protocol: string;

    constructor(_url: string) {
      this.hostname = 'example.com';
      this.protocol = 'https:';
    }
  };
}

// Mock DOM APIs that might not be available in jsdom
if (!global.Range) {
  (global as any).Range = class MockRange {
    startOffset = 0;
    endOffset = 0;
  };
}

if (!document.caretRangeFromPoint) {
  document.caretRangeFromPoint = jest.fn(() => null);
}

// Mock IntersectionObserver if not available
if (!global.IntersectionObserver) {
  (global as any).IntersectionObserver = class MockIntersectionObserver {
    constructor() {}
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Mock MutationObserver if not available
if (!global.MutationObserver) {
  (global as any).MutationObserver = class MockMutationObserver {
    constructor() {}
    observe() {}
    disconnect() {}
  };
}

export { mockChrome };