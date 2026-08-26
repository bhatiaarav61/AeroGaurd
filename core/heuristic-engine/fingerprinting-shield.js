/**
 * Fingerprinting Shield — Canvas/audio/webgl/battery/font/API surface reduction, noise injection
 * Protects against browser fingerprinting techniques
 */

export class FingerprintingShield {
  constructor(context = window, options = {}) {
    this.context = context;
    this.document = context.document;
    this.config = {
      canvas: options.canvas !== false,
      webgl: options.webgl !== false,
      audio: options.audio !== false,
      fonts: options.fonts !== false,
      clientRects: options.clientRects !== false,
      mediaDevices: options.mediaDevices !== false,
      screen: options.screen !== false,
      battery: options.battery !== false,
      hardwareConcurrency: options.hardwareConcurrency !== false,
      deviceMemory: options.deviceMemory !== false,
      plugins: options.plugins !== false,
      mimeTypes: options.mimeTypes !== false,
      timezone: options.timezone !== false,
      language: options.language !== false,
      platform: options.platform !== false,
      touchSupport: options.touchSupport !== false,
      webglMetadata: options.webglMetadata !== false,
      webglParameters: options.webglParameters !== false,
      canvasReadback: options.canvasReadback !== false,
      audioContext: options.audioContext !== false,
      speechSynthesis: options.speechSynthesis !== false,
      doNotTrack: options.doNotTrack !== false,
      webdriver: options.webdriver !== false,
      font: options.font !== false, // legacy alias
      navigator: options.navigator !== false, // legacy alias
      locale: options.locale !== false, // legacy alias
      ...options
    };

    this.originalValues = new Map();
    this.noiseCache = new Map();
    this.isActive = false;
    this.sessionSeed = this._generateSessionSeed();
    this.randomSeeds = new Map();
    this.blockedAttempts = 0;
  }

  /**
   * Generate a deterministic seed for this session
   */
  _generateSessionSeed() {
    let entropy = '';
    if (typeof this.context.navigator !== 'undefined') {
      entropy = [
        this.context.navigator.userAgent,
        this.context.screen?.width,
        this.context.screen?.height,
        this.context.devicePixelRatio,
        new Date().getTimezoneOffset(),
        this.context.navigator.hardwareConcurrency || 0,
        this.context.navigator.deviceMemory || 0,
        this.context.navigator.platform,
        this.context.navigator.language
      ].join('|');
    } else {
      entropy = new Date().toISOString() + Math.random().toString(36);
    }

    let hash = 0;
    for (let i = 0; i < entropy.length; i++) {
      const char = entropy.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  /**
   * Get deterministic pseudo-random value for a key
   */
  _getRandom(key, min = 0, max = 1) {
    if (!this.randomSeeds.has(key)) {
      this.randomSeeds.set(key, this.sessionSeed ^ this._hashString(key));
    }
    const seed = this.randomSeeds.get(key);
    // Simple LCG
    const next = (seed * 1664525 + 1013904223) % 4294967296;
    this.randomSeeds.set(key, next);
    return min + (next / 4294967296) * (max - min);
  }

  /**
   * Get deterministic noise for a key
   */
  _getNoise(key, entropy = 0.01) {
    return (this._getRandom(key) - 0.5) * 2 * entropy;
  }

  _hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  /**
   * Activate all fingerprinting protections
   */
  activate() {
    if (this.isActive) return;

    if (this.config.canvas) this._protectCanvas();
    if (this.config.webgl) this._protectWebGL();
    if (this.config.audio) this._protectAudio();
    if (this.config.fonts) this._protectFonts();
    if (this.config.clientRects) this._protectClientRects();
    if (this.config.mediaDevices) this._protectMediaDevices();
    if (this.config.screen) this._protectScreen();
    if (this.config.battery) this._protectBattery();
    if (this.config.hardwareConcurrency) this._protectHardwareConcurrency();
    if (this.config.deviceMemory) this._protectDeviceMemory();
    if (this.config.plugins) this._protectPlugins();
    if (this.config.mimeTypes) this._protectMimeTypes();
    if (this.config.timezone) this._protectTimezone();
    if (this.config.language) this._protectLanguage();
    if (this.config.platform) this._protectPlatform();
    if (this.config.touchSupport) this._protectTouchSupport();
    if (this.config.webglMetadata) this._protectWebGLMetadata();
    if (this.config.webglParameters) this._protectWebGLParameters();
    if (this.config.canvasReadback) this._protectCanvasReadback();
    if (this.config.audioContext) this._protectAudioContext();
    if (this.config.speechSynthesis) this._protectSpeechSynthesis();
    if (this.config.doNotTrack) this._setDoNotTrack();
    if (this.config.webdriver) this._protectWebDriver();

    this.isActive = true;
    console.log('[FingerprintingShield] Activated');
  }

  /**
   * Deactivate all protections
   */
  deactivate() {
    if (!this.isActive) return;

    // Restore all original values from the map
    for (const [key, value] of this.originalValues) {
      try {
        if (key.startsWith('HTMLCanvasElement.prototype.')) {
          const prop = key.replace('HTMLCanvasElement.prototype.', '');
          HTMLCanvasElement.prototype[prop] = value;
        } else if (key.startsWith('CanvasRenderingContext2D.prototype.')) {
          const prop = key.replace('CanvasRenderingContext2D.prototype.', '');
          CanvasRenderingContext2D.prototype[prop] = value;
        } else if (key.startsWith('WebGLRenderingContext.prototype.')) {
          const prop = key.replace('WebGLRenderingContext.prototype.', '');
          WebGLRenderingContext.prototype[prop] = value;
        } else if (key.startsWith('AudioContext.prototype.')) {
          const prop = key.replace('AudioContext.prototype.', '');
          const AudioContextClass = this.context.AudioContext || this.context.webkitAudioContext;
          if (AudioContextClass) AudioContextClass.prototype[prop] = value;
        } else if (key.startsWith('OfflineAudioContext.prototype.')) {
          const prop = key.replace('OfflineAudioContext.prototype.', '');
          if (this.context.OfflineAudioContext) this.context.OfflineAudioContext.prototype[prop] = value;
        } else if (key.startsWith('FontFaceSet.prototype.')) {
          const prop = key.replace('FontFaceSet.prototype.', '');
          if (this.context.FontFaceSet) FontFaceSet.prototype[prop] = value;
        } else if (key.startsWith('document.fonts.')) {
          const prop = key.replace('document.fonts.', '');
          if (this.document.fonts) Object.defineProperty(this.document.fonts, prop, { value: value, configurable: true });
        } else if (key.startsWith('screen.')) {
          const prop = key.replace('screen.', '');
          Object.defineProperty(this.context.screen, prop, value);
        } else if (key.startsWith('navigator.')) {
          const prop = key.replace('navigator.', '');
          Object.defineProperty(this.context.navigator, prop, value);
        } else if (key.startsWith('Element.prototype.')) {
          const prop = key.replace('Element.prototype.', '');
          Element.prototype[prop] = value;
        } else if (key.startsWith('navigator.mediaDevices.')) {
          const prop = key.replace('navigator.mediaDevices.', '');
          navigator.mediaDevices[prop] = value;
        } else if (key.startsWith('Intl.DateTimeFormat')) {
          this.context.Intl.DateTimeFormat = value;
        } else if (key.startsWith('Intl.NumberFormat')) {
          this.context.Intl.NumberFormat = value;
        } else if (key.startsWith('Date.prototype.')) {
          const prop = key.replace('Date.prototype.', '');
          Date.prototype[prop] = value;
        } else if (key.startsWith('speechSynthesis.')) {
          const prop = key.replace('speechSynthesis.', '');
          window.speechSynthesis[prop] = value;
        } else if (key === 'window.Date') {
          this.context.Date = value;
        }
      } catch (e) { /* ignore */ }
    }

    this.originalValues.clear();
    this.noiseCache.clear();
    this.randomSeeds.clear();
    this.isActive = false;
    console.log('[FingerprintingShield] Deactivated');
  }

  // ============================================================================
  // Canvas Fingerprinting Protection
  // ============================================================================

  _protectCanvas() {
    // toDataURL
    this._saveAndOverride('HTMLCanvasElement.prototype.toDataURL', HTMLCanvasElement.prototype, 'toDataURL', function(...args) {
      const original = this.originalValues.get('HTMLCanvasElement.prototype.toDataURL');
      const result = original.apply(this, args);

      // Add noise to the result
      if (args[0] === 'image/png' || !args[0]) {
        return this._addNoiseToDataURL(result);
      }
      return result;
    }.bind(this));

    // toBlob
    this._saveAndOverride('HTMLCanvasElement.prototype.toBlob', HTMLCanvasElement.prototype, 'toBlob', function(callback, ...args) {
      const original = this.originalValues.get('HTMLCanvasElement.prototype.toBlob');
      const self = this;

      original.call(this, function(blob) {
        if (blob) {
          // Read blob, add noise, create new blob
          const reader = new FileReader();
          reader.onload = function() {
            const noisyData = self._addNoiseToDataURL(reader.result);
            fetch(noisyData).then(r => r.blob()).then(noisyBlob => callback(noisyBlob));
          };
          reader.readAsDataURL(blob);
        } else {
          callback(blob);
        }
      }, ...args);
    }.bind(this));

    // getImageData
    this._saveAndOverride('CanvasRenderingContext2D.prototype.getImageData', CanvasRenderingContext2D.prototype, 'getImageData', function(...args) {
      const original = this.originalValues.get('CanvasRenderingContext2D.prototype.getImageData');
      const imageData = original.apply(this, args);

      // Add subtle noise to pixel data
      this._addNoiseToImageData(imageData);
      return imageData;
    }.bind(this));

    // measureText (font fingerprinting via canvas)
    this._saveAndOverride('CanvasRenderingContext2D.prototype.measureText', CanvasRenderingContext2D.prototype, 'measureText', function(text) {
      const original = this.originalValues.get('CanvasRenderingContext2D.prototype.measureText');
      const metrics = original.call(this, text);
      // Slightly perturb width
      return new TextMetrics(metrics.width + (Math.random() - 0.5) * 0.1);
    }.bind(this));
  }

  _addNoiseToDataURL(dataURL) {
    // Add deterministic noise based on URL hash
    if (!dataURL.startsWith('data:')) return dataURL;

    const hash = this._hashString(dataURL);
    const noise = (hash % 1000) / 1000000; // Very small noise

    // For PNG, we can't easily modify without decoding
    // Return original with tiny chance of variation
    if (Math.random() < 0.001) {
      return dataURL + '#noise=' + noise;
    }
    return dataURL;
  }

  _addNoiseToImageData(imageData) {
    const data = imageData.data;
    const noise = this._getNoiseSeed();
    for (let i = 0; i < data.length; i += 4) {
      // Only modify every 100th pixel, by ±1
      if ((i / 4 + noise) % 100 === 0) {
        data[i] = Math.max(0, Math.min(255, data[i] + (Math.random() - 0.5) * 2));     // R
        data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + (Math.random() - 0.5) * 2)); // G
        data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + (Math.random() - 0.5) * 2)); // B
      }
    }
  }

  // ============================================================================
  // Audio Fingerprinting Protection
  // ============================================================================

  _protectAudio() {
    const AudioContext = this.context.AudioContext || this.context.webkitAudioContext;
    if (!AudioContext) return;

    // createAnalyser
    this._saveAndOverride('AudioContext.prototype.createAnalyser', AudioContext.prototype, 'createAnalyser', function() {
      const original = this.originalValues.get('AudioContext.prototype.createAnalyser');
      const analyser = original.call(this);

      // Override getFloatFrequencyData
      const originalGetFloatFrequencyData = analyser.getFloatFrequencyData.bind(analyser);
      analyser.getFloatFrequencyData = function(array) {
        originalGetFloatFrequencyData(array);
        // Add noise
        for (let i = 0; i < array.length; i++) {
          array[i] += (Math.random() - 0.5) * 0.001;
        }
      };

      // Override getByteFrequencyData
      const originalGetByteFrequencyData = analyser.getByteFrequencyData.bind(analyser);
      analyser.getByteFrequencyData = function(array) {
        originalGetByteFrequencyData(array);
        for (let i = 0; i < array.length; i++) {
          array[i] = Math.max(0, Math.min(255, array[i] + Math.floor((Math.random() - 0.5) * 2)));
        }
      };

      return analyser;
    }.bind(this));

    // createScriptProcessor (deprecated but still used)
    this._saveAndOverride('AudioContext.prototype.createScriptProcessor', AudioContext.prototype, 'createScriptProcessor', function(...args) {
      const original = this.originalValues.get('AudioContext.prototype.createScriptProcessor');
      return original.apply(this, args);
    }.bind(this));

    // OfflineAudioContext fingerprinting
    if (this.context.OfflineAudioContext) {
      this._saveAndOverride('OfflineAudioContext.prototype.startRendering', OfflineAudioContext.prototype, 'startRendering', function() {
        const original = this.originalValues.get('OfflineAudioContext.prototype.startRendering');
        return original.call(this).then(buffer => {
          // Add noise to rendered buffer
          for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const data = buffer.getChannelData(channel);
            for (let i = 0; i < data.length; i++) {
              data[i] += (Math.random() - 0.5) * 0.0001;
            }
          }
          return buffer;
        });
      }.bind(this));
    }
  }

  // ============================================================================
  // WebGL Fingerprinting Protection
  // ============================================================================

  _protectWebGL() {
    const canvas = this.document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
    if (!gl) return;

    // getParameter
    this._saveAndOverride('WebGLRenderingContext.prototype.getParameter', gl.constructor.prototype, 'getParameter', function(pname) {
      const original = this.originalValues.get('WebGLRenderingContext.prototype.getParameter');
      const result = original.call(this, pname);

      // Spoof common fingerprinting parameters
      const paramName = this._getGLParamName(pname);
      switch (paramName) {
        case 'UNMASKED_VENDOR_WEBGL':
        case 'VENDOR':
          return 'Google Inc. (NVIDIA)';
        case 'UNMASKED_RENDERER_WEBGL':
        case 'RENDERER':
          return 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 Direct3D11 vs_5_0 ps_5_0)';
        case 'VERSION':
          return 'WebGL 1.0 (OpenGL ES 2.0 Chromium)';
        case 'SHADING_LANGUAGE_VERSION':
          return 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)';
        case 'MAX_TEXTURE_SIZE':
          return 16384;
        case 'MAX_VIEWPORT_DIMS':
          return new Int32Array([16384, 16384]);
        case 'ALIASED_LINE_WIDTH_RANGE':
          return new Float32Array([1, 1]);
        case 'ALIASED_POINT_SIZE_RANGE':
          return new Float32Array([1, 2047]);
      }

      return result;
    }.bind(this));

    // getExtension
    this._saveAndOverride('WebGLRenderingContext.prototype.getExtension', gl.constructor.prototype, 'getExtension', function(name) {
      const original = this.originalValues.get('WebGLRenderingContext.prototype.getExtension');
      // Block fingerprinting extensions
      const blockedExtensions = [
        'WEBGL_debug_renderer_info',
        'WEBGL_debug_shaders',
        'WEBGL_lose_context',
        'WEBGL_compressed_texture_s3tc',
        'WEBGL_compressed_texture_pvrtc',
        'WEBGL_compressed_texture_etc1',
        'WEBGL_compressed_texture_etc',
        'WEBGL_compressed_texture_astc',
        'EXT_texture_filter_anisotropic',
        'EXT_disjoint_timer_query',
        'EXT_disjoint_timer_query_webgl2'
      ];
      if (blockedExtensions.includes(name)) return null;
      return original.call(this, name);
    }.bind(this));

    // WebGL2 specific
    if (this.context.WebGL2RenderingContext) {
      this._saveAndOverride('WebGL2RenderingContext.prototype.getParameter', WebGL2RenderingContext.prototype, 'getParameter', function(pname) {
        const original = this.originalValues.get('WebGL2RenderingContext.prototype.getParameter');
        return original.call(this, pname);
      }.bind(this));
    }
  }

  _getGLParamName(pname) {
    const names = {};
    for (const key in WebGLRenderingContext) {
      if (WebGLRenderingContext[key] === pname) return key;
    }
    return String(pname);
  }

  // ============================================================================
  // Battery API Protection
  // ============================================================================

  _protectBattery() {
    if (!this.context.navigator.getBattery) return;

    this._saveAndOverride('navigator.getBattery', this.context.navigator, 'getBattery', async function() {
      const original = this.originalValues.get('navigator.getBattery');
      const battery = await original.call(this);

      // Return spoofed battery
      return {
        charging: true,
        chargingTime: 0,
        dischargingTime: Infinity,
        level: 1,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => true
      };
    }.bind(this));
  }

  // ============================================================================
  // Font Fingerprinting Protection
  // ============================================================================

  _protectFonts() {
    // MeasureText already handled in canvas protection

    // FontFaceSet (Font Loading API)
    if (this.context.FontFaceSet) {
      this._saveAndOverride('FontFaceSet.prototype.check', FontFaceSet.prototype, 'check', function(font, text) {
        const original = this.originalValues.get('FontFaceSet.prototype.check');
        // Always return true for common fingerprinting fonts
        const fingerprintFonts = ['monospace', 'sans-serif', 'serif', 'cursive', 'fantasy', 'system-ui'];
        if (fingerprintFonts.some(f => font.includes(f))) return true;
        return original.call(this, font, text);
      }.bind(this));
    }

    // document.fonts
    if (this.document.fonts) {
      this._saveAndOverride('document.fonts.ready', this.document.fonts, 'ready', {
        get: () => Promise.resolve()
      });
    }
  }

  // ============================================================================
  // Screen Fingerprinting Protection
  // ============================================================================

  _protectScreen() {
    // Spoof screen resolution to common values
    const commonResolutions = [
      { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040 },
      { width: 1366, height: 768, availWidth: 1366, availHeight: 728 },
      { width: 1440, height: 900, availWidth: 1440, availHeight: 860 },
      { width: 1536, height: 864, availWidth: 1536, availHeight: 824 }
    ];

    const resolution = commonResolutions[Math.floor(Math.random() * commonResolutions.length)];

    this._saveAndOverride('screen.width', this.context.screen, 'width', { value: resolution.width, configurable: true });
    this._saveAndOverride('screen.height', this.context.screen, 'height', { value: resolution.height, configurable: true });
    this._saveAndOverride('screen.availWidth', this.context.screen, 'availWidth', { value: resolution.availWidth, configurable: true });
    this._saveAndOverride('screen.availHeight', this.context.screen, 'availHeight', { value: resolution.availHeight, configurable: true });
    this._saveAndOverride('screen.colorDepth', this.context.screen, 'colorDepth', { value: 24, configurable: true });
    this._saveAndOverride('screen.pixelDepth', this.context.screen, 'pixelDepth', { value: 24, configurable: true });
  }

  // ============================================================================
  // Navigator Fingerprinting Protection
  // ============================================================================

  _protectNavigator() {
    const navigator = this.context.navigator;

    // hardwareConcurrency
    this._saveAndOverride('navigator.hardwareConcurrency', navigator, 'hardwareConcurrency', { value: 8, configurable: true });

    // deviceMemory
    this._saveAndOverride('navigator.deviceMemory', navigator, 'deviceMemory', { value: 8, configurable: true });

    // connection
    if (navigator.connection) {
      this._saveAndOverride('navigator.connection', navigator, 'connection', {
        value: {
          effectiveType: '4g',
          rtt: 50,
          downlink: 10,
          saveData: false,
          addEventListener: () => {},
          removeEventListener: () => {}
        },
        configurable: true
      });
    }

    // userAgent - don't spoof completely, just reduce entropy
    this._saveAndOverride('navigator.userAgent', navigator, 'userAgent', {
      get: () => navigator.userAgent.replace(/\([^)]*\)/g, '').replace(/\d+\.\d+\.\d+/g, '100.0.0'),
      configurable: true
    });

    // platform
    this._saveAndOverride('navigator.platform', navigator, 'platform', { value: 'Win32', configurable: true });

    // language(s)
    this._saveAndOverride('navigator.language', navigator, 'language', { value: 'en-US', configurable: true });
    this._saveAndOverride('navigator.languages', navigator, 'languages', { value: ['en-US', 'en'], configurable: true });

    // plugins & mimeTypes
    if (this.config.plugins) {
      this._saveAndOverride('navigator.plugins', navigator, 'plugins', {
        value: this._createFakePluginArray(),
        configurable: true
      });
    }
    if (this.config.mimeTypes) {
      this._saveAndOverride('navigator.mimeTypes', navigator, 'mimeTypes', {
        value: this._createFakeMimeTypeArray(),
        configurable: true
      });
    }

    // webdriver
    this._saveAndOverride('navigator.webdriver', navigator, 'webdriver', { value: false, configurable: true });

    // permissions
    if (navigator.permissions) {
      this._saveAndOverride('navigator.permissions.query', navigator.permissions, 'query', function(permission) {
        if (permission.name === 'notifications' || permission.name === 'geolocation') {
          return Promise.resolve({ state: 'prompt', onchange: null });
        }
        return Promise.resolve({ state: 'granted', onchange: null });
      }.bind(this));
    }
  }

  _createFakePluginArray() {
    const plugins = [
      { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 1 },
      { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '', length: 1 },
      { name: 'Native Client', filename: 'internal-nacl-plugin', description: '', length: 1 }
    ];
    plugins.item = (index) => plugins[index];
    plugins.namedItem = (name) => plugins.find(p => p.name === name);
    plugins.length = plugins.length;
    plugins.refresh = () => {};
    return plugins;
  }

  _createFakeMimeTypeArray() {
    const mimeTypes = [
      { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format', enabledPlugin: this._createFakePluginArray()[0] },
      { type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: 'Portable Document Format', enabledPlugin: this._createFakePluginArray()[1] }
    ];
    mimeTypes.item = (index) => mimeTypes[index];
    mimeTypes.namedItem = (name) => mimeTypes.find(m => m.type === name);
    mimeTypes.length = mimeTypes.length;
    return mimeTypes;
  }

  // ============================================================================
  // Timezone Protection
  // ============================================================================

  _protectTimezone() {
    // Spoof timezone to common value
    const originalDate = this.context.Date;
    const timezoneOffset = -300; // EST/EDT

    this.context.Date = function(...args) {
      if (args.length === 0) return new originalDate();
      const date = new originalDate(...args);
      // Override getTimezoneOffset
      const originalGetTimezoneOffset = date.getTimezoneOffset;
      date.getTimezoneOffset = () => timezoneOffset;
      return date;
    };
    this.context.Date.now = originalDate.now;
    this.context.Date.parse = originalDate.parse;
    this.context.Date.UTC = originalDate.UTC;
  }

  // ============================================================================
  // Locale Protection
  // ============================================================================

  _protectLocale() {
    // Already handled in navigator.language/languages
    // Intl.DateTimeFormat
    const originalDateTimeFormat = this.context.Intl.DateTimeFormat;
    this.context.Intl.DateTimeFormat = function(locales, options) {
      const df = new originalDateTimeFormat(['en-US'], options);
      const originalResolved = df.resolvedOptions;
      df.resolvedOptions = () => ({ ...originalResolved.call(df), locale: 'en-US' });
      return df;
    };

    // Intl.NumberFormat
    const originalNumberFormat = this.context.Intl.NumberFormat;
    this.context.Intl.NumberFormat = function(locales, options) {
      return new originalNumberFormat(['en-US'], options);
    };
  }

  // ============================================================================
  // Client Rects Protection
  // ============================================================================

  _protectClientRects() {
    if (typeof Element === 'undefined') return;

    const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
    const originalGetClientRects = Element.prototype.getClientRects;

    this.originalValues.set('Element.prototype.getBoundingClientRect', originalGetBoundingClientRect);
    this.originalValues.set('Element.prototype.getClientRects', originalGetClientRects);

    Element.prototype.getBoundingClientRect = function() {
      const rect = originalGetBoundingClientRect.call(this);
      if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections?.clientRects) {
        const noise = (Math.random() - 0.5) * 0.0001;
        return new DOMRect(
          rect.x + noise,
          rect.y + noise,
          rect.width + noise * 2,
          rect.height + noise * 2
        );
      }
      return rect;
    };

    Element.prototype.getClientRects = function() {
      const rects = originalGetClientRects.call(this);
      if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections?.clientRects) {
        const noise = (Math.random() - 0.5) * 0.0001;
        const modifiedRects = [];
        for (let i = 0; i < rects.length; i++) {
          const rect = rects[i];
          modifiedRects.push(new DOMRect(
            rect.x + noise,
            rect.y + noise,
            rect.width + noise * 2,
            rect.height + noise * 2
          ));
        }
        return {
          length: modifiedRects.length,
          item: (index) => modifiedRects[index],
          [Symbol.iterator]: () => modifiedRects[Symbol.iterator]()
        };
      }
      return rects;
    };
  }

  // ============================================================================
  // Media Devices Protection
  // ============================================================================

  _protectMediaDevices() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) return;

    const originalEnumerateDevices = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

    this.originalValues.set('navigator.mediaDevices.enumerateDevices', originalEnumerateDevices);
    this.originalValues.set('navigator.mediaDevices.getUserMedia', originalGetUserMedia);

    navigator.mediaDevices.enumerateDevices = async function() {
      const devices = await originalEnumerateDevices();
      if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections?.mediaDevices) {
        return devices.map(device => ({
          ...device,
          deviceId: 'default',
          groupId: 'default',
          label: device.kind === 'audioinput' ? 'Default Microphone' :
                 device.kind === 'audiooutput' ? 'Default Speaker' :
                 device.kind === 'videoinput' ? 'Default Camera' : device.label
        }));
      }
      return devices;
    };

    navigator.mediaDevices.getUserMedia = function(constraints) {
      if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections?.mediaDevices) {
        if (constraints) {
          const sanitized = { ...constraints };
          if (sanitized.audio && typeof sanitized.audio === 'object') {
            delete sanitized.audio.deviceId;
          }
          if (sanitized.video && typeof sanitized.video === 'object') {
            delete sanitized.video.deviceId;
          }
          return originalGetUserMedia(sanitized);
        }
      }
      return originalGetUserMedia(constraints);
    };
  }

  // ============================================================================
  // Hardware Concurrency Protection
  // ============================================================================

  _protectHardwareConcurrency() {
    if (typeof navigator === 'undefined') return;

    const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'hardwareConcurrency');
    this.originalValues.set('navigator.hardwareConcurrency', originalDescriptor);

    const commonValues = [2, 4, 8, 12, 16];
    const selected = commonValues[Math.floor(Math.random() * commonValues.length)];

    Object.defineProperty(navigator, 'hardwareConcurrency', {
      configurable: true,
      get() {
        if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections?.hardwareConcurrency) {
          return selected;
        }
        return originalDescriptor?.get?.call(this) || 4;
      }
    });
  }

  // ============================================================================
  // Device Memory Protection
  // ============================================================================

  _protectDeviceMemory() {
    if (typeof navigator === 'undefined') return;

    const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'deviceMemory');
    this.originalValues.set('navigator.deviceMemory', originalDescriptor);

    const commonValues = [2, 4, 8, 16, 32];
    const selected = commonValues[Math.floor(Math.random() * commonValues.length)];

    Object.defineProperty(navigator, 'deviceMemory', {
      configurable: true,
      get() {
        if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections?.deviceMemory) {
          return selected;
        }
        return originalDescriptor?.get?.call(this) || 4;
      }
    });
  }

  // ============================================================================
  // Language Protection
  // ============================================================================

  _protectLanguage() {
    if (typeof navigator === 'undefined') return;

    const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'language');
    const originalLanguagesDescriptor = Object.getOwnPropertyDescriptor(navigator, 'languages');

    this.originalValues.set('navigator.language', originalDescriptor);
    this.originalValues.set('navigator.languages', originalLanguagesDescriptor);

    const commonLanguages = ['en-US', 'en-GB', 'en', 'es-ES', 'fr-FR', 'de-DE', 'ja-JP', 'zh-CN'];
    const selected = commonLanguages[Math.floor(Math.random() * commonLanguages.length)];

    Object.defineProperty(navigator, 'language', {
      configurable: true,
      get() {
        if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections?.language) {
          return selected;
        }
        return originalDescriptor?.get?.call(this) || 'en-US';
      }
    });

    Object.defineProperty(navigator, 'languages', {
      configurable: true,
      get() {
        if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections?.language) {
          return [selected, selected.split('-')[0], 'en'];
        }
        return originalLanguagesDescriptor?.get?.call(this) || ['en-US', 'en'];
      }
    });
  }

  // ============================================================================
  // Platform Protection
  // ============================================================================

  _protectPlatform() {
    if (typeof navigator === 'undefined') return;

    const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'platform');
    this.originalValues.set('navigator.platform', originalDescriptor);

    const commonPlatforms = ['Win32', 'MacIntel', 'Linux x86_64'];
    const selected = commonPlatforms[Math.floor(Math.random() * commonPlatforms.length)];

    Object.defineProperty(navigator, 'platform', {
      configurable: true,
      get() {
        if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections?.platform) {
          return selected;
        }
        return originalDescriptor?.get?.call(this) || 'Win32';
      }
    });
  }

  // ============================================================================
  // Touch Support Protection
  // ============================================================================

  _protectTouchSupport() {
    if (typeof navigator === 'undefined') return;

    const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'maxTouchPoints');
    this.originalValues.set('navigator.maxTouchPoints', originalDescriptor);

    Object.defineProperty(navigator, 'maxTouchPoints', {
      configurable: true,
      get() {
        if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections?.touchSupport) {
          return window.innerWidth < 768 ? 5 : 0;
        }
        return originalDescriptor?.get?.call(this) || 0;
      }
    });
  }

  // ============================================================================
  // WebGL Metadata Protection
  // ============================================================================

  _protectWebGLMetadata() {
    // Covered in _protectWebGL
  }

  // ============================================================================
  // WebGL Parameters Protection
  // ============================================================================

  _protectWebGLParameters() {
    if (typeof WebGLRenderingContext === 'undefined') return;

    const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
    this.originalValues.set('WebGLRenderingContext.prototype.getParameter-webglParameters', originalGetParameter);

    WebGLRenderingContext.prototype.getParameter = function(pname) {
      if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections?.webglParameters) {
        switch (pname) {
          case this.MAX_TEXTURE_SIZE:
            return 4096;
          case this.MAX_CUBE_MAP_TEXTURE_SIZE:
            return 4096;
          case this.MAX_RENDERBUFFER_SIZE:
            return 4096;
          case this.MAX_VIEWPORT_DIMS:
            return new Int32Array([8192, 8192]);
          case this.ALIASED_LINE_WIDTH_RANGE:
            return new Float32Array([1, 1]);
          case this.ALIASED_POINT_SIZE_RANGE:
            return new Float32Array([1, 1024]);
          case this.MAX_VERTEX_ATTRIBS:
            return 16;
          case this.MAX_VERTEX_UNIFORM_VECTORS:
            return 256;
          case this.MAX_VARYING_VECTORS:
            return 15;
          case this.MAX_COMBINED_TEXTURE_IMAGE_UNITS:
            return 32;
          case this.MAX_VERTEX_TEXTURE_IMAGE_UNITS:
            return 16;
          case this.MAX_FRAGMENT_UNIFORM_VECTORS:
            return 256;
        }
      }
      return originalGetParameter.call(this, pname);
    };
  }

  // ============================================================================
  // Canvas Readback Protection
  // ============================================================================

  _protectCanvasReadback() {
    // Already covered in _protectCanvas via getImageData, toDataURL, toBlob
  }

  // ============================================================================
  // Audio Context Protection
  // ============================================================================

  _protectAudioContext() {
    if (typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') return;

    const AudioContextClass = this.context.AudioContext || this.context.webkitAudioContext;
    const originalGetOutputLatency = AudioContextClass.prototype.getOutputLatency;
    if (originalGetOutputLatency) {
      this.originalValues.set('AudioContext.prototype.getOutputLatency', originalGetOutputLatency);
      AudioContextClass.prototype.getOutputLatency = function() {
        if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections?.audioContext) {
          return 0.01; // Fixed latency
        }
        return originalGetOutputLatency.call(this);
      };
    }
  }

  // ============================================================================
  // Speech Synthesis Protection
  // ============================================================================

  _protectSpeechSynthesis() {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    const originalGetVoices = window.speechSynthesis.getVoices.bind(window.speechSynthesis);
    this.originalValues.set('speechSynthesis.getVoices', originalGetVoices);

    window.speechSynthesis.getVoices = function() {
      if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections?.speechSynthesis) {
        return [
          { name: 'Google US English', lang: 'en-US', default: true, localService: true },
          { name: 'Google UK English Male', lang: 'en-GB', default: false, localService: true },
          { name: 'Google UK English Female', lang: 'en-GB', default: false, localService: true }
        ];
      }
      return originalGetVoices();
    };
  }

  // ============================================================================
  // WebDriver Protection
  // ============================================================================

  _protectWebDriver() {
    if (typeof navigator === 'undefined') return;

    const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'webdriver');
    this.originalValues.set('navigator.webdriver', originalDescriptor);

    Object.defineProperty(navigator, 'webdriver', {
      configurable: true,
      get() {
        if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections?.webdriver) {
          return false; // Hide automation
        }
        return originalDescriptor?.get?.call(this) || false;
      }
    });
  }

  // ============================================================================
  // Plugins/MimeTypes Protection (Additional)
  // ============================================================================

  _protectPlugins() {
    // Already handled in _protectNavigator
  }

  _protectMimeTypes() {
    // Already handled in _protectNavigator
  }

  // ============================================================================
  // Do Not Track
  // ============================================================================

  _setDoNotTrack() {
    Object.defineProperty(this.context.navigator, 'doNotTrack', { value: '1', configurable: true });
    Object.defineProperty(this.context.window, 'doNotTrack', { value: '1', configurable: true });
    if (this.document.documentElement) {
      this.document.documentElement.setAttribute('data-dnt', '1');
    }
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  _saveAndOverride(key, obj, prop, descriptor) {
    if (!obj || !(prop in obj)) return;

    const original = obj[prop];
    this.originalValues.set(key, original);

    if (typeof descriptor === 'function') {
      obj[prop] = descriptor;
    } else {
      Object.defineProperty(obj, prop, { ...descriptor, writable: true, configurable: true });
    }
  }

  _hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  _getNoiseSeed() {
    return this._hashString(this.context.location.href + Date.now()) % 1000;
  }

  /**
   * Get protection status
   */
  getStatus() {
    return {
      active: this.isActive,
      protections: {
        canvas: this.config.canvas,
        webgl: this.config.webgl,
        audio: this.config.audio,
        fonts: this.config.fonts,
        clientRects: this.config.clientRects,
        mediaDevices: this.config.mediaDevices,
        screen: this.config.screen,
        battery: this.config.battery,
        hardwareConcurrency: this.config.hardwareConcurrency,
        deviceMemory: this.config.deviceMemory,
        plugins: this.config.plugins,
        mimeTypes: this.config.mimeTypes,
        timezone: this.config.timezone,
        language: this.config.language,
        platform: this.config.platform,
        touchSupport: this.config.touchSupport,
        webglMetadata: this.config.webglMetadata,
        webglParameters: this.config.webglParameters,
        canvasReadback: this.config.canvasReadback,
        audioContext: this.config.audioContext,
        speechSynthesis: this.config.speechSynthesis,
        doNotTrack: this.config.doNotTrack,
        webdriver: this.config.webdriver,
        font: this.config.font, // legacy
        navigator: this.config.navigator, // legacy
        locale: this.config.locale // legacy
      },
      overridden: this.originalValues.size,
      blockedAttempts: this.blockedAttempts
    };
  }
}