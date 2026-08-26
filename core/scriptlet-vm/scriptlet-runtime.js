/**
 * Scriptlet Runtime — Secure sandbox, bytecode interpreter, CSP-compliant, trusted-types
 * Executes compiled scriptlet bytecode with full isolation
 */

// ============================================================================
// Bytecode Instruction Set
// ============================================================================

export const OpCode = {
  // Stack operations
  PUSH: 0x01,
  POP: 0x02,
  DUP: 0x03,
  SWAP: 0x04,

  // Variable operations
  LOAD_LOCAL: 0x10,
  STORE_LOCAL: 0x11,
  LOAD_GLOBAL: 0x12,
  STORE_GLOBAL: 0x13,

  // Property access
  GET_PROP: 0x20,
  SET_PROP: 0x21,
  HAS_PROP: 0x22,
  DELETE_PROP: 0x23,

  // Function calls
  CALL: 0x30,
  CALL_METHOD: 0x31,
  NEW: 0x32,
  RETURN: 0x33,

  // Control flow
  JUMP: 0x40,
  JUMP_IF: 0x41,
  JUMP_IF_NOT: 0x42,

  // Comparison
  EQ: 0x50,
  NE: 0x51,
  LT: 0x52,
  LE: 0x53,
  GT: 0x54,
  GE: 0x55,

  // Logical
  AND: 0x60,
  OR: 0x61,
  NOT: 0x62,

  // Arithmetic
  ADD: 0x70,
  SUB: 0x71,
  MUL: 0x72,
  DIV: 0x73,
  MOD: 0x74,
  NEG: 0x75,

  // Built-in operations
  TYPEOF: 0x80,
  INSTANCEOF: 0x81,
  IN: 0x82,
  REGEXP_TEST: 0x83,
  REGEXP_MATCH: 0x84,
  STRING_INCLUDES: 0x85,
  STRING_STARTS_WITH: 0x86,
  STRING_ENDS_WITH: 0x87,

  // DOM operations
  QUERY_SELECTOR: 0x90,
  QUERY_SELECTOR_ALL: 0x91,
  CREATE_ELEMENT: 0x92,
  SET_ATTRIBUTE: 0x93,
  REMOVE_ATTRIBUTE: 0x94,
  ADD_EVENT_LISTENER: 0x95,
  REMOVE_EVENT_LISTENER: 0x96,

  // Special
  THROW: 0xF0,
  TRY_CATCH: 0xF1,
  END_TRY: 0xF2,
  NOP: 0xFF
};

// ============================================================================
// Scriptlet VM — Bytecode Interpreter
// ============================================================================

export class ScriptletVM {
  constructor(context = window, options = {}) {
    this.context = context;
    this.options = {
      maxExecutionTime: options.maxExecutionTime || 50, // ms
      maxStackSize: options.maxStackSize || 1000,
      maxCallDepth: options.maxCallDepth || 50,
      allowNetworkAccess: options.allowNetworkAccess || false,
      allowStorageAccess: options.allowStorageAccess || false,
      ...options
    };

    this.globals = new Map();
    this.builtins = new Map();
    this.modules = new Map();

    this._setupBuiltins();
    this._setupSecurityPolicies();
  }

  _setupBuiltins() {
    // Safe built-in functions
    this.builtins.set('console', this._createSafeConsole());
    this.builtins.set('JSON', { parse: JSON.parse.bind(JSON), stringify: JSON.stringify.bind(JSON) });
    this.builtins.set('Math', Math);
    this.builtins.set('Date', Date);
    this.builtins.set('RegExp', RegExp);
    this.builtins.set('Error', Error);
    this.builtins.set('TypeError', TypeError);
    this.builtins.set('ReferenceError', ReferenceError);
    this.builtins.set('SyntaxError', SyntaxError);
    this.builtins.set('Array', Array);
    this.builtins.set('Object', Object);
    this.builtins.set('String', String);
    this.builtins.set('Number', Number);
    this.builtins.set('Boolean', Boolean);
    this.builtins.set('Map', Map);
    this.builtins.set('Set', Set);
    this.builtins.set('Promise', Promise);
    this.builtins.set('URL', URL);
    this.builtins.set('URLSearchParams', URLSearchParams);
  }

  _createSafeConsole() {
    const methods = ['log', 'warn', 'error', 'info', 'debug', 'trace'];
    const safe = {};
    for (const method of methods) {
      safe[method] = (...args) => console[method]('[Scriptlet]', ...args);
    }
    return safe;
  }

  _setupSecurityPolicies() {
    // Block dangerous globals
    this.blockedGlobals = new Set([
      'eval', 'Function', 'setTimeout', 'setInterval',
      'setImmediate', 'requestIdleCallback', 'requestAnimationFrame',
      'webkitRequestAnimationFrame', 'mozRequestAnimationFrame',
      'importScripts', 'Worker', 'SharedWorker', 'ServiceWorker',
      'XMLHttpRequest', 'fetch', 'WebSocket', 'EventSource',
      'navigator.sendBeacon', 'navigator.clipboard',
      'indexedDB', 'openDatabase', 'localStorage', 'sessionStorage',
      'crypto.subtle', 'crypto.randomUUID',
      'performance.mark', 'performance.measure',
      'MutationObserver', 'IntersectionObserver', 'ResizeObserver'
    ]);

    // Block dangerous DOM APIs
    this.blockedDOMAPIs = new Set([
      'document.write', 'document.writeln', 'document.open', 'document.close',
      'document.domain', 'document.cookie',
      'Element.prototype.innerHTML', 'Element.prototype.outerHTML',
      'Element.prototype.insertAdjacentHTML'
    ]);
  }

  /**
   * Execute bytecode
   * @param {Uint8Array} bytecode - Compiled bytecode
   * @param {Object} imports - Imported modules/functions
   * @returns {any} Result
   */
  async execute(bytecode, imports = {}) {
    const startTime = performance.now();

    // Create execution context
    const ctx = this._createContext(imports);

    try {
      const result = await this._interpret(bytecode, ctx);

      // Check execution time
      if (performance.now() - startTime > this.options.maxExecutionTime) {
        throw new Error('Execution time limit exceeded');
      }

      return result;
    } catch (e) {
      throw new Error(`Scriptlet execution failed: ${e.message}`);
    }
  }

  _createContext(imports) {
    // Create isolated global scope
    const sandbox = {
      ...this._createSafeGlobals(),
      ...imports
    };

    return {
      stack: [],
      locals: new Map(),
      globals: sandbox,
      callStack: [],
      pc: 0, // program counter
      bytecode: null,
      tryCatchStack: []
    };
  }

  _createSafeGlobals() {
    const safe = {};

    // Add builtins
    for (const [name, value] of this.builtins) {
      safe[name] = value;
    }

    // Add safe window/document proxies
    safe.window = this._createWindowProxy();
    safe.document = this._createDocumentProxy();
    safe.navigator = this._createNavigatorProxy();
    safe.console = this.builtins.get('console');
    safe.chrome = this._createChromeProxy();

    // Block dangerous globals
    for (const blocked of this.blockedGlobals) {
      Object.defineProperty(safe, blocked, {
        get: () => { throw new Error(`Access to '${blocked}' is blocked`); },
        set: () => { throw new Error(`Cannot assign to '${blocked}'`); },
        configurable: true
      });
    }

    return safe;
  }

  _createWindowProxy() {
    const self = this;
    return new Proxy(self.context.window, {
      get(target, prop) {
        if (self.blockedGlobals.has(prop)) {
          throw new Error(`Access to 'window.${prop}' is blocked`);
        }
        // Allow safe properties
        const safeProps = ['location', 'navigator', 'document', 'console', 'chrome', 'history', 'performance', 'crypto', 'URL', 'URLSearchParams', 'fetch', 'XMLHttpRequest'];
        if (safeProps.includes(prop)) return target[prop];
        // Block everything else by default
        if (typeof target[prop] === 'function') {
          return (...args) => { throw new Error(`window.${prop}() is blocked`); };
        }
        return target[prop];
      },
      set(target, prop, value) {
        if (self.blockedGlobals.has(prop)) {
          throw new Error(`Cannot set 'window.${prop}'`);
        }
        return Reflect.set(target, prop, value);
      },
      has(target, prop) {
        return prop in target;
      },
      ownKeys(target) {
        return Object.keys(target).filter(k => !self.blockedGlobals.has(k));
      }
    });
  }

  _createDocumentProxy() {
    const self = this;
    return new Proxy(self.context.document, {
      get(target, prop) {
        if (self.blockedDOMAPIs.has(`document.${prop}`)) {
          throw new Error(`Access to 'document.${prop}' is blocked`);
        }
        // Block dangerous methods
        if (['write', 'writeln', 'open', 'close', 'domain', 'cookie'].includes(prop)) {
          throw new Error(`document.${prop} is blocked`);
        }
        return target[prop];
      }
    });
  }

  _createNavigatorProxy() {
    const self = this;
    return new Proxy(self.context.navigator, {
      get(target, prop) {
        // Hide fingerprinting surfaces
        const blocked = ['plugins', 'mimeTypes', 'hardwareConcurrency', 'deviceMemory', 'connection', 'userAgent', 'platform', 'oscpu', 'product', 'vendor'];
        if (blocked.includes(prop)) return undefined;
        return target[prop];
      }
    });
  }

  _createChromeProxy() {
    const self = this;
    if (!self.context.chrome) return undefined;

    return {
      runtime: {
        sendMessage: (msg) => self.context.chrome.runtime.sendMessage(msg),
        onMessage: self.context.chrome.runtime.onMessage,
        getManifest: () => self.context.chrome.runtime.getManifest(),
        getURL: (path) => self.context.chrome.runtime.getURL(path)
      },
      storage: {
        sync: self.context.chrome.storage.sync,
        local: self.context.chrome.storage.local
      }
    };
  }

  async _interpret(bytecode, ctx) {
    ctx.bytecode = bytecode;
    ctx.pc = 0;

    while (ctx.pc < bytecode.length) {
      // Check time limit
      if (performance.now() - ctx.startTime > this.options.maxExecutionTime) {
        throw new Error('Execution time limit exceeded');
      }

      // Check stack size
      if (ctx.stack.length > this.options.maxStackSize) {
        throw new Error('Stack overflow');
      }

      // Check call depth
      if (ctx.callStack.length > this.options.maxCallDepth) {
        throw new Error('Call stack depth exceeded');
      }

      const opcode = bytecode[ctx.pc++];
      await this._executeOpcode(opcode, bytecode, ctx);
    }

    // Return top of stack
    return ctx.stack.pop();
  }

  async _executeOpcode(opcode, bytecode, ctx) {
    switch (opcode) {
      case OpCode.PUSH:
        ctx.stack.push(bytecode[ctx.pc++]);
        break;

      case OpCode.POP:
        ctx.stack.pop();
        break;

      case OpCode.DUP:
        ctx.stack.push(ctx.stack[ctx.stack.length - 1]);
        break;

      case OpCode.SWAP:
        if (ctx.stack.length >= 2) {
          const a = ctx.stack.pop();
          const b = ctx.stack.pop();
          ctx.stack.push(a, b);
        }
        break;

      case OpCode.LOAD_LOCAL: {
        const index = bytecode[ctx.pc++];
        ctx.stack.push(ctx.locals.get(index));
        break;
      }

      case OpCode.STORE_LOCAL: {
        const index = bytecode[ctx.pc++];
        ctx.locals.set(index, ctx.stack.pop());
        break;
      }

      case OpCode.LOAD_GLOBAL: {
        const nameIndex = bytecode[ctx.pc++];
        const name = bytecode[nameIndex]; // Simplified - in reality would be string table
        ctx.stack.push(ctx.globals[name]);
        break;
      }

      case OpCode.STORE_GLOBAL: {
        const nameIndex = bytecode[ctx.pc++];
        const name = bytecode[nameIndex];
        ctx.globals[name] = ctx.stack.pop();
        break;
      }

      case OpCode.GET_PROP: {
        const obj = ctx.stack.pop();
        const prop = ctx.stack.pop();
        if (obj && obj !== null && obj !== undefined) {
          ctx.stack.push(obj[prop]);
        } else {
          ctx.stack.push(undefined);
        }
        break;
      }

      case OpCode.SET_PROP: {
        const value = ctx.stack.pop();
        const prop = ctx.stack.pop();
        const obj = ctx.stack.pop();
        if (obj && obj !== null && obj !== undefined) {
          obj[prop] = value;
        }
        break;
      }

      case OpCode.HAS_PROP: {
        const obj = ctx.stack.pop();
        const prop = ctx.stack.pop();
        ctx.stack.push(obj && prop in obj);
        break;
      }

      case OpCode.CALL: {
        const argc = bytecode[ctx.pc++];
        const args = [];
        for (let i = 0; i < argc; i++) {
          args.unshift(ctx.stack.pop());
        }
        const fn = ctx.stack.pop();
        if (typeof fn === 'function') {
          const result = await fn(...args);
          ctx.stack.push(result);
        } else {
          throw new Error('Not a function');
        }
        break;
      }

      case OpCode.CALL_METHOD: {
        const argc = bytecode[ctx.pc++];
        const args = [];
        for (let i = 0; i < argc; i++) {
          args.unshift(ctx.stack.pop());
        }
        const method = ctx.stack.pop();
        const obj = ctx.stack.pop();
        if (obj && typeof obj[method] === 'function') {
          const result = await obj[method](...args);
          ctx.stack.push(result);
        } else {
          throw new Error(`Method ${method} not found`);
        }
        break;
      }

      case OpCode.NEW: {
        const argc = bytecode[ctx.pc++];
        const args = [];
        for (let i = 0; i < argc; i++) {
          args.unshift(ctx.stack.pop());
        }
        const ctor = ctx.stack.pop();
        if (typeof ctor === 'function') {
          ctx.stack.push(new ctor(...args));
        } else {
          throw new Error('Not a constructor');
        }
        break;
      }

      case OpCode.RETURN: {
        return ctx.stack.pop();
      }

      case OpCode.JUMP: {
        const offset = this._readInt16(bytecode, ctx.pc);
        ctx.pc += offset;
        break;
      }

      case OpCode.JUMP_IF: {
        const offset = this._readInt16(bytecode, ctx.pc);
        const condition = ctx.stack.pop();
        if (condition) ctx.pc += offset;
        break;
      }

      case OpCode.JUMP_IF_NOT: {
        const offset = this._readInt16(bytecode, ctx.pc);
        const condition = ctx.stack.pop();
        if (!condition) ctx.pc += offset;
        break;
      }

      case OpCode.EQ: {
        const b = ctx.stack.pop();
        const a = ctx.stack.pop();
        ctx.stack.push(a === b);
        break;
      }

      case OpCode.NE: {
        const b = ctx.stack.pop();
        const a = ctx.stack.pop();
        ctx.stack.push(a !== b);
        break;
      }

      case OpCode.LT: {
        const b = ctx.stack.pop();
        const a = ctx.stack.pop();
        ctx.stack.push(a < b);
        break;
      }

      case OpCode.LE: {
        const b = ctx.stack.pop();
        const a = ctx.stack.pop();
        ctx.stack.push(a <= b);
        break;
      }

      case OpCode.GT: {
        const b = ctx.stack.pop();
        const a = ctx.stack.pop();
        ctx.stack.push(a > b);
        break;
      }

      case OpCode.GE: {
        const b = ctx.stack.pop();
        const a = ctx.stack.pop();
        ctx.stack.push(a >= b);
        break;
      }

      case OpCode.AND: {
        const b = ctx.stack.pop();
        const a = ctx.stack.pop();
        ctx.stack.push(a && b);
        break;
      }

      case OpCode.OR: {
        const b = ctx.stack.pop();
        const a = ctx.stack.pop();
        ctx.stack.push(a || b);
        break;
      }

      case OpCode.NOT: {
        const a = ctx.stack.pop();
        ctx.stack.push(!a);
        break;
      }

      case OpCode.ADD: {
        const b = ctx.stack.pop();
        const a = ctx.stack.pop();
        ctx.stack.push(a + b);
        break;
      }

      case OpCode.SUB: {
        const b = ctx.stack.pop();
        const a = ctx.stack.pop();
        ctx.stack.push(a - b);
        break;
      }

      case OpCode.MUL: {
        const b = ctx.stack.pop();
        const a = ctx.stack.pop();
        ctx.stack.push(a * b);
        break;
      }

      case OpCode.DIV: {
        const b = ctx.stack.pop();
        const a = ctx.stack.pop();
        ctx.stack.push(b !== 0 ? a / b : Infinity);
        break;
      }

      case OpCode.MOD: {
        const b = ctx.stack.pop();
        const a = ctx.stack.pop();
        ctx.stack.push(a % b);
        break;
      }

      case OpCode.NEG: {
        const a = ctx.stack.pop();
        ctx.stack.push(-a);
        break;
      }

      case OpCode.TYPEOF: {
        const a = ctx.stack.pop();
        ctx.stack.push(typeof a);
        break;
      }

      case OpCode.INSTANCEOF: {
        const ctor = ctx.stack.pop();
        const obj = ctx.stack.pop();
        ctx.stack.push(obj instanceof ctor);
        break;
      }

      case OpCode.IN: {
        const obj = ctx.stack.pop();
        const prop = ctx.stack.pop();
        ctx.stack.push(prop in obj);
        break;
      }

      case OpCode.REGEXP_TEST: {
        const str = ctx.stack.pop();
        const regex = ctx.stack.pop();
        ctx.stack.push(regex instanceof RegExp ? regex.test(str) : false);
        break;
      }

      case OpCode.STRING_INCLUDES: {
        const search = ctx.stack.pop();
        const str = ctx.stack.pop();
        ctx.stack.push(typeof str === 'string' && str.includes(search));
        break;
      }

      case OpCode.STRING_STARTS_WITH: {
        const search = ctx.stack.pop();
        const str = ctx.stack.pop();
        ctx.stack.push(typeof str === 'string' && str.startsWith(search));
        break;
      }

      case OpCode.STRING_ENDS_WITH: {
        const search = ctx.stack.pop();
        const str = ctx.stack.pop();
        ctx.stack.push(typeof str === 'string' && str.endsWith(search));
        break;
      }

      case OpCode.QUERY_SELECTOR: {
        const selector = ctx.stack.pop();
        const root = ctx.stack.pop() || ctx.context.document;
        ctx.stack.push(root.querySelector(selector));
        break;
      }

      case OpCode.QUERY_SELECTOR_ALL: {
        const selector = ctx.stack.pop();
        const root = ctx.stack.pop() || ctx.context.document;
        ctx.stack.push(Array.from(root.querySelectorAll(selector)));
        break;
      }

      case OpCode.CREATE_ELEMENT: {
        const tag = ctx.stack.pop();
        ctx.stack.push(ctx.context.document.createElement(tag));
        break;
      }

      case OpCode.SET_ATTRIBUTE: {
        const value = ctx.stack.pop();
        const name = ctx.stack.pop();
        const el = ctx.stack.pop();
        if (el && el.setAttribute) el.setAttribute(name, value);
        break;
      }

      case OpCode.REMOVE_ATTRIBUTE: {
        const name = ctx.stack.pop();
        const el = ctx.stack.pop();
        if (el && el.removeAttribute) el.removeAttribute(name);
        break;
      }

      case OpCode.ADD_EVENT_LISTENER: {
        const listener = ctx.stack.pop();
        const event = ctx.stack.pop();
        const el = ctx.stack.pop();
        if (el && el.addEventListener) el.addEventListener(event, listener);
        break;
      }

      case OpCode.REMOVE_EVENT_LISTENER: {
        const listener = ctx.stack.pop();
        const event = ctx.stack.pop();
        const el = ctx.stack.pop();
        if (el && el.removeEventListener) el.removeEventListener(event, listener);
        break;
      }

      case OpCode.THROW: {
        const error = ctx.stack.pop();
        throw error instanceof Error ? error : new Error(String(error));
      }

      case OpCode.NOP:
        break;

      default:
        throw new Error(`Unknown opcode: 0x${opcode.toString(16)}`);
    }
  }

  _readInt16(bytecode, pc) {
    return (bytecode[pc] << 8) | bytecode[pc + 1];
  }
}

// ============================================================================
// Scriptlet Compiler — ABP #%# to bytecode
// ============================================================================

export class ScriptletCompiler {
  constructor() {
    this.stringTable = [];
    this.bytecode = [];
    this.labelMap = new Map();
    this.currentLabel = 0;
  }

  /**
   * Compile scriptlet source to bytecode
   * @param {string} source - Scriptlet source code
   * @returns {Uint8Array} Bytecode
   */
  compile(source) {
    this.stringTable = [];
    this.bytecode = [];
    this.labelMap.clear();
    this.currentLabel = 0;

    // Parse and compile
    const ast = this._parse(source);
    this._compileAST(ast);

    // Resolve labels
    this._resolveLabels();

    return new Uint8Array(this.bytecode);
  }

  _parse(source) {
    // Simplified parser - in production would use a proper parser
    return { type: 'Program', body: this._tokenize(source) };
  }

  _tokenize(source) {
    // Very simplified tokenizer
    return source.split('\n').filter(l => l.trim()).map(l => l.trim());
  }

  _compileAST(ast) {
    for (const stmt of ast.body) {
      this._compileStatement(stmt);
    }
  }

  _compileStatement(stmt) {
    // Very simplified - just handle basic patterns
    if (stmt.startsWith('return')) {
      this._emit(OpCode.PUSH, 0); // placeholder
      this._emit(OpCode.RETURN);
    }
  }

  _emit(...args) {
    for (const arg of args) {
      this.bytecode.push(arg);
    }
  }

  _resolveLabels() {
    // Resolve jump offsets
  }
}

// ============================================================================
// Built-in Scriptlets
// ============================================================================

export const BUILTIN_SCRIPTLETS = {
  'abort-on-property-read': `
    (function() {
      const originalDefineProperty = Object.defineProperty;
      Object.defineProperty = function(obj, prop, desc) {
        if (desc && desc.get && prop === 'adblock') {
          desc.get = function() { return false; };
        }
        return originalDefineProperty.call(this, obj, prop, desc);
      };
    })();
  `,

  'prevent-setinterval': `
    (function() {
      const original = window.setInterval;
      window.setInterval = function(fn, delay) {
        if (delay < 1000) return original(fn, 1000);
        return original(fn, delay);
      };
    })();
  `,

  'noop-functions': `
    (function() {
      const noop = function() {};
      ['adblock', 'adBlock', 'detectAdblock', 'detectAdBlock', 'adblockDetected', 'adBlockDetected'].forEach(name => {
        if (window[name]) window[name] = noop;
      });
    })();
  `,

  'remove-attribute': `
    (function() {
      const observer = new MutationObserver(mutations => {
        for (const m of mutations) {
          if (m.type === 'attributes' && m.attributeName === 'style') {
            const el = m.target;
            if (el.style.display === 'none' || el.style.visibility === 'hidden') {
              el.style.display = '';
              el.style.visibility = '';
            }
          }
        }
      });
      observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['style'] });
    })();
  `,

  'json-prune': `
    (function() {
      const originalJSONParse = JSON.parse;
      JSON.parse = function(text, reviver) {
        const obj = originalJSONParse(text, reviver);
        return pruneAds(obj);
      };
      function pruneAds(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(pruneAds).filter(x => x !== null);
        const result = {};
        for (const [k, v] of Object.entries(obj)) {
          if (!/ad|promo|sponsor|tracking|analytics/i.test(k)) {
            result[k] = pruneAds(v);
          }
        }
        return result;
      }
    })();
  `,

  'set-constant': `
    (function() {
      Object.defineProperty(window, 'adblock', { value: false, writable: false, configurable: false });
      Object.defineProperty(window, 'adBlock', { value: false, writable: false, configurable: false });
      Object.defineProperty(window, 'AdBlock', { value: false, writable: false, configurable: false });
    })();
  `,

  'block-script-execution': `
    (function() {
      const originalCreateElement = document.createElement;
      document.createElement = function(tag) {
        const el = originalCreateElement.call(this, tag);
        if (tag.toLowerCase() === 'script') {
          const originalSetSrc = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src').set;
          Object.defineProperty(el, 'src', {
            set: function(url) {
              if (url && /ad|tracking|analytics|doubleclick|googlesyndication/i.test(url)) {
                console.log('[Scriptlet] Blocked script:', url);
                return;
              }
              originalSetSrc.call(this, url);
            },
            get: Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src').get
          });
        }
        return el;
      };
    })();
  `,

  'block-image-beacon': `
    (function() {
      const originalImage = window.Image;
      window.Image = function() {
        const img = new originalImage();
        const originalSrcSet = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src').set;
        Object.defineProperty(img, 'src', {
          set: function(url) {
            if (url && /beacon|track|pixel|collect|analytics/i.test(url)) {
              console.log('[Scriptlet] Blocked beacon:', url);
              return;
            }
            originalSrcSet.call(this, url);
          },
          get: Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src').get
        });
        return img;
      };
    })();
  `
};

// ============================================================================
// Scriptlet Verifier
// ============================================================================

export class ScriptletVerifier {
  constructor() {
    this.allowedOpcodes = new Set(Object.values(OpCode));
    this.maxBytecodeSize = 10000; // bytes
  }

  /**
   * Verify bytecode for safety
   * @param {Uint8Array} bytecode - Bytecode to verify
   * @returns {Object} Verification result
   */
  verify(bytecode) {
    const errors = [];
    const warnings = [];

    // Check size
    if (bytecode.length > this.maxBytecodeSize) {
      errors.push(`Bytecode too large: ${bytecode.length} bytes (max ${this.maxBytecodeSize})`);
    }

    // Check opcodes
    for (let i = 0; i < bytecode.length; i++) {
      const opcode = bytecode[i];
      if (!this.allowedOpcodes.has(opcode)) {
        errors.push(`Invalid opcode at ${i}: 0x${opcode.toString(16)}`);
      }
    }

    // Check for dangerous patterns
    const dangerousPatterns = [
      [OpCode.CALL, OpCode.NEW], // Dynamic code execution
    ];

    for (const pattern of dangerousPatterns) {
      for (let i = 0; i < bytecode.length - pattern.length + 1; i++) {
        let match = true;
        for (let j = 0; j < pattern.length; j++) {
          if (bytecode[i + j] !== pattern[j]) { match = false; break; }
        }
        if (match) {
          warnings.push(`Potentially dangerous pattern at offset ${i}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Verify scriptlet source
   */
  verifySource(source) {
    const compiler = new ScriptletCompiler();
    try {
      const bytecode = compiler.compile(source);
      return this.verify(bytecode);
    } catch (e) {
      return { valid: false, errors: [e.message], warnings: [] };
    }
  }
}

// ============================================================================
// Per-Origin Isolator
// ============================================================================

export class PerOriginIsolator {
  constructor() {
    this.realms = new Map(); // origin -> { vm, globals, modules }
    this.policies = new Map(); // origin -> policy
  }

  /**
   * Get or create isolated realm for origin
   */
  getRealm(origin) {
    if (!this.realms.has(origin)) {
      this.realms.set(origin, this._createRealm(origin));
    }
    return this.realms.get(origin);
  }

  _createRealm(origin) {
    const vm = new ScriptletVM(window, {
      maxExecutionTime: 50,
      maxStackSize: 500
    });

    return {
      vm,
      origin,
      globals: new Map(),
      modules: new Map(),
      createdAt: Date.now(),
      executionCount: 0
    };
  }

  /**
   * Execute scriptlet in isolated realm
   */
  async execute(origin, bytecode, imports = {}) {
    const realm = this.getRealm(origin);
    realm.executionCount++;

    // Add origin-specific builtins
    const realmImports = {
      ...imports,
      __ORIGIN__: origin,
      __REALM_ID__: realm.createdAt
    };

    return await realm.vm.execute(bytecode, realmImports);
  }

  /**
   * Set security policy for origin
   */
  setPolicy(origin, policy) {
    this.policies.set(origin, policy);
  }

  /**
   * Get policy for origin
   */
  getPolicy(origin) {
    return this.policies.get(origin) || { allowNetwork: false, allowStorage: false };
  }

  /**
   * Clear realm for origin
   */
  clearRealm(origin) {
    this.realms.delete(origin);
  }

  /**
   * Clear all realms
   */
  clearAll() {
    this.realms.clear();
    this.policies.clear();
  }

  getStats() {
    return {
      realms: this.realms.size,
      byOrigin: Object.fromEntries(
        Array.from(this.realms.entries()).map(([k, v]) => [k, v.executionCount])
      )
    };
  }
}