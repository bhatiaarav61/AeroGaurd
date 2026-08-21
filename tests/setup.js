import { TextEncoder, TextDecoder } from 'util';

// Polyfill for Node.js globals
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock chrome API
global.chrome = {
  runtime: {
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    onInstalled: { addListener: jest.fn() },
    onStartup: { addListener: jest.fn() },
    getManifest: () => ({ version: '2.0.0' }),
    getURL: (path) => `chrome-extension://test/${path}`,
    lastError: null,
  },
  storage: {
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
      onChanged: { addListener: jest.fn() },
    },
    sync: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined),
    },
  },
  tabs: {
    query: jest.fn().mockResolvedValue([]),
    sendMessage: jest.fn(),
    onUpdated: { addListener: jest.fn() },
    onActivated: { addListener: jest.fn() },
    onRemoved: { addListener: jest.fn() },
  },
  declarativeNetRequest: {
    updateDynamicRules: jest.fn().mockResolvedValue(undefined),
    getDynamicRules: jest.fn().mockResolvedValue([]),
    updateEnabledRulesets: jest.fn().mockResolvedValue(undefined),
    getMatchedRules: jest.fn().mockResolvedValue([]),
    onRuleMatchedDebug: { addListener: jest.fn() },
  },
  action: {
    setBadgeText: jest.fn().mockResolvedValue(undefined),
    setBadgeBackgroundColor: jest.fn().mockResolvedValue(undefined),
    onClicked: { addListener: jest.fn() },
  },
  alarms: {
    create: jest.fn().mockResolvedValue(undefined),
    onAlarm: { addListener: jest.fn() },
  },
  webNavigation: {
    onBeforeNavigate: { addListener: jest.fn() },
  },
  cookies: {
    onChanged: { addListener: jest.fn() },
    getAll: jest.fn().mockResolvedValue([]),
    set: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
  },
  scripting: {
    executeScript: jest.fn().mockResolvedValue([]),
  },
  notifications: {
    create: jest.fn().mockResolvedValue(undefined),
  },
};

// Mock fetch
global.fetch = jest.fn();

// Mock URL and URLSearchParams
global.URL = URL;
global.URLSearchParams = URLSearchParams;

// Console mock to reduce noise in tests
const originalConsole = global.console;
global.console = {
  ...originalConsole,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

// Test utilities
global.createMockTab = (id = 1, url = 'https://example.com') => ({
  id,
  url,
  active: true,
  windowId: 1,
});

global.createMockRequest = (url, type = 'script', tabId = 1) => ({
  url,
  type,
  tabId,
  frameId: 0,
  method: 'GET',
  requestHeaders: [],
});

global.waitFor = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Reset all mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
  chrome.storage.local.get.mockResolvedValue({});
  chrome.storage.local.set.mockResolvedValue(undefined);
  chrome.tabs.query.mockResolvedValue([]);
  chrome.declarativeNetRequest.getDynamicRules.mockResolvedValue([]);
});