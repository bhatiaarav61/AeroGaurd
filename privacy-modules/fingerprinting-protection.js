/**
 * Fingerprinting Protection Module
 * Prevents browser fingerprinting via canvas, WebGL, audio, fonts, client rects,
 * media devices, and other entropy sources
 *
 * Based on Brave's fingerprinting protection implementation
 */

class FingerprintingProtection {
  constructor(options = {}) {
    this.enabled = options.enabled ?? true;
    this.mode = options.mode || 'randomize'; // 'randomize', 'block', 'noise'
    this.protections = {
      canvas: options.canvas ?? true,
      webgl: options.webgl ?? true,
      audio: options.audio ?? true,
      font: options.font ?? true,
      clientRects: options.clientRects ?? true,
      mediaDevices: options.mediaDevices ?? true,
      screen: options.screen ?? true,
      battery: options.battery ?? true,
      hardwareConcurrency: options.hardwareConcurrency ?? true,
      deviceMemory: options.deviceMemory ?? true,
      plugins: options.plugins ?? true,
      mimeTypes: options.mimeTypes ?? true,
      timezone: options.timezone ?? true,
      language: options.language ?? true,
      platform: options.platform ?? true,
      touchSupport: options.touchSupport ?? true,
      webglMetadata: options.webglMetadata ?? true,
      webglParameters: options.webglParameters ?? true,
      canvasReadback: options.canvasReadback ?? true,
      audioContext: options.audioContext ?? true,
      speechSynthesis: options.speechSynthesis ?? true,
      doNotTrack: options.doNotTrack ?? true,
      webdriver: options.webdriver ?? true
    };

    this.noiseCache = new Map();
    this.randomSeeds = new Map();
    this.originalMethods = new Map();
    this.isPatched = false;
    this.blockedAttempts = 0;

    // Generate persistent random seeds per session
    this.sessionSeed = this.generateSeed();
  }

  /**
   * Update settings from background script
   */
  updateSettings(settings) {
    if (settings.enabled !== undefined) {
      this.setEnabled(settings.enabled);
    }
    for (const [key, value] of Object.entries(settings)) {
      if (key !== 'enabled' && this.protections.hasOwnProperty(key)) {
        this.setProtection(key, value);
      }
    }
  }

  /**
   * Update settings (alias for updateSettings)
   */
  updatePageSettings(tabId, settings) {
    this.updateSettings(settings);
  }

  /**
   * Update settings
   */
  setProtection(key, value) {
    if (this.protections.hasOwnProperty(key)) {
      this.protections[key] = value;
    }
  }

  /**
   * Get protection status
   */
  getProtectionStatus() {
    return { ...this.protections };
  }

  /**

  /**

  /**

  /**

  /**
   * Generate a deterministic seed for this session
   * Works in both service worker and browser contexts
   */
  generateSeed() {
    // Use crypto.randomUUID or a simpler approach for service worker
    let entropy = '';
    if (typeof window !== 'undefined') {
      entropy = [
        window.navigator.userAgent,
        window.screen.width,
        window.screen.height,
        window.devicePixelRatio,
        new Date().getTimezoneOffset(),
        window.navigator.hardwareConcurrency || 0,
        window.navigator.deviceMemory || 0,
        window.navigator.platform,
        window.navigator.language
      ].join('|');
    } else if (typeof navigator !== 'undefined') {
      entropy = [
        navigator.userAgent,
        new Date().getTimezoneOffset(),
        navigator.hardwareConcurrency || 0,
        navigator.deviceMemory || 0,
        navigator.platform,
        navigator.language
      ].join('|');
    } else {
      // Fallback for service worker
      entropy = new Date().toISOString() + Math.random().toString(36);
    }

    // Simple hash function
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
  getRandom(key, min = 0, max = 1) {
    if (!this.randomSeeds.has(key)) {
      this.randomSeeds.set(key, this.sessionSeed ^ this.hashString(key));
    }
    const seed = this.randomSeeds.get(key);
    // Simple LCG
    const next = (seed * 1664525 + 1013904223) % 4294967296;
    this.randomSeeds.set(key, next);
    return min + (next / 4294967296) * (max - min);
  }

  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  /**
   * Initialize fingerprinting protection - only runs in browser context
   */
  async initialize() {
    // Skip initialization in service worker context
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      console.log('[FingerprintingProtection] Skipping initialization in service worker context');
      return;
    }
    if (this.isPatched) return;

    if (this.protections.canvas) this.patchCanvas();
    if (this.protections.webgl) this.patchWebGL();
    if (this.protections.audio) this.patchAudio();
    if (this.protections.font) this.patchFonts();
    if (this.protections.clientRects) this.patchClientRects();
    if (this.protections.mediaDevices) this.patchMediaDevices();
    if (this.protections.screen) this.patchScreen();
    if (this.protections.battery) this.patchBattery();
    if (this.protections.hardwareConcurrency) this.patchHardwareConcurrency();
    if (this.protections.deviceMemory) this.patchDeviceMemory();
    if (this.protections.plugins) this.patchPlugins();
    if (this.protections.mimeTypes) this.patchMimeTypes();
    if (this.protections.timezone) this.patchTimezone();
    if (this.protections.language) this.patchLanguage();
    if (this.protections.platform) this.patchPlatform();
    if (this.protections.touchSupport) this.patchTouchSupport();
    if (this.protections.webglMetadata) this.patchWebGLMetadata();
    if (this.protections.webglParameters) this.patchWebGLParameters();
    if (this.protections.canvasReadback) this.patchCanvasReadback();
    if (this.protections.audioContext) this.patchAudioContext();
    if (this.protections.speechSynthesis) this.patchSpeechSynthesis();
    if (this.protections.doNotTrack) this.patchDoNotTrack();
    if (this.protections.webdriver) this.patchWebDriver();

    this.isPatched = true;
    console.log('[FingerprintingProtection] Initialized with mode:', this.mode);
  }

  /**
   * Add noise to a value
   */
  addNoise(value, entropy = 0.01) {
    if (this.mode === 'block') return undefined;
    if (this.mode === 'noise') {
      const noise = (Math.random() - 0.5) * 2 * entropy * value;
      return value + noise;
    }
    // 'randomize' mode - return deterministic but unique value
    return value;
  }

  /**
   * Get deterministic noise for a key
   */
  getNoise(key, entropy = 0.01) {
    return (this.getRandom(key) - 0.5) * 2 * entropy;
  }

  // ==================== Canvas Protection ====================

  patchCanvas() {
    if (typeof HTMLCanvasElement === 'undefined') return;

    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    const originalToBlob = HTMLCanvasElement.prototype.toBlob;
    const originalGetContext = HTMLCanvasElement.prototype.getContext;

    this.originalMethods.set('toDataURL', originalToDataURL);
    this.originalMethods.set('toBlob', originalToBlob);
    this.originalMethods.set('getContext', originalGetContext);

    // Patch getContext to wrap 2d context
    HTMLCanvasElement.prototype.getContext = function(contextType, ...args) {
      const context = originalGetContext.call(this, contextType, ...args);
      if (contextType === '2d' && context) {
        return new Proxy(context, {
          get(target, prop) {
            const original = target[prop];
            if (typeof original === 'function') {
              // Patch readback methods
              if (['getImageData', 'toDataURL', 'toBlob'].includes(prop)) {
                return function(...args) {
                  if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections.canvas) {
                    // Add noise to canvas data
                    if (prop === 'getImageData') {
                      const result = original.apply(this, args);
                      if (result && result.data) {
                        const noise = window.fingerprintingProtection.getNoise('canvas-getImageData', 0.001);
                        for (let i = 0; i < result.data.length; i += 4) {
                          result.data[i] = Math.max(0, Math.min(255, result.data[i] + noise * 255));
                          result.data[i + 1] = Math.max(0, Math.min(255, result.data[i + 1] + noise * 255));
                          result.data[i + 2] = Math.max(0, Math.min(255, result.data[i + 2] + noise * 255));
                        }
                      }
                      return result;
                    }
                  }
                  return original.apply(this, args);
                };
              }
            }
            return original;
          }
        });
      }
      return context;
    };

    // Patch toDataURL
    HTMLCanvasElement.prototype.toDataURL = function(type, quality) {
      if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections.canvas) {
        // Add subtle noise to canvas before export
        const context = this.getContext('2d');
        if (context) {
          const imageData = context.getImageData(0, 0, this.width, this.height);
          const noise = window.fingerprintingProtection.getNoise('canvas-toDataURL', 0.0005);
          for (let i = 0; i < imageData.data.length; i += 4) {
            imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + noise * 255));
            imageData.data[i + 1] = Math.max(0, Math.min(255, imageData.data[i + 1] + noise * 255));
            imageData.data[i + 2] = Math.max(0, Math.min(255, imageData.data[i + 2] + noise * 255));
          }
          context.putImageData(imageData, 0, 0);
        }
      }
      return originalToDataURL.call(this, type, quality);
    };

    // Patch toBlob
    HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) {
      if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections.canvas) {
        const context = this.getContext('2d');
        if (context) {
          const imageData = context.getImageData(0, 0, this.width, this.height);
          const noise = window.fingerprintingProtection.getNoise('canvas-toBlob', 0.0005);
          for (let i = 0; i < imageData.data.length; i += 4) {
            imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + noise * 255));
            imageData.data[i + 1] = Math.max(0, Math.min(255, imageData.data[i + 1] + noise * 255));
            imageData.data[i + 2] = Math.max(0, Math.min(255, imageData.data[i + 2] + noise * 255));
          }
          context.putImageData(imageData, 0, 0);
        }
      }
      return originalToBlob.call(this, callback, type, quality);
    };
  }

  // ==================== WebGL Protection ====================

  patchWebGL() {
    if (typeof WebGLRenderingContext === 'undefined') return;

    const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
    const originalGetExtension = WebGLRenderingContext.prototype.getExtension;
    const originalGetSupportedExtensions = WebGLRenderingContext.prototype.getSupportedExtensions;

    this.originalMethods.set('webgl-getParameter', originalGetParameter);
    this.originalMethods.set('webgl-getExtension', originalGetExtension);
    this.originalMethods.set('webgl-getSupportedExtensions', originalGetSupportedExtensions);

    WebGLRenderingContext.prototype.getParameter = function(pname) {
      if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections.webgl) {
        // Mask identifying parameters
        const fp = window.fingerprintingProtection;

        // VENDOR / RENDERER
        if (pname === this.VENDOR || pname === 0x1F00) {
          return fp.getNoise('webgl-vendor') > 0 ? 'Google Inc.' : 'WebKit';
        }
        if (pname === this.RENDERER || pname === 0x1F01) {
          return fp.getNoise('webgl-renderer') > 0 ? 'ANGLE (Apple, Apple GPU)' : 'WebKit WebGL';
        }
        if (pname === this.VERSION || pname === 0x1F02) {
          return 'OpenGL ES 2.0 (WebGL 1.0)';
        }
        if (pname === this.SHADING_LANGUAGE_VERSION || pname === 0x8B8C) {
          return 'WebGL GLSL ES 1.0';
        }

        // Extensions - return standardized list
        if (pname === this.getExtension) {
          return fp.getStandardExtensions();
        }
      }
      return originalGetParameter.call(this, pname);
    };

    WebGLRenderingContext.prototype.getExtension = function(name) {
      if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections.webgl) {
        // Only allow standard extensions
        const allowed = window.fingerprintingProtection.getStandardExtensions();
        if (!allowed.includes(name)) {
          return null;
        }
      }
      return originalGetExtension.call(this, name);
    };

    WebGLRenderingContext.prototype.getSupportedExtensions = function() {
      if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections.webgl) {
        return window.fingerprintingProtection.getStandardExtensions();
      }
      return originalGetSupportedExtensions.call(this);
    };
  }

  getStandardExtensions() {
    return [
      'ANGLE_instanced_arrays',
      'EXT_blend_minmax',
      'EXT_color_buffer_half_float',
      'EXT_frag_depth',
      'EXT_shader_texture_lod',
      'EXT_sRGB',
      'EXT_texture_filter_anisotropic',
      'OES_element_index_uint',
      'OES_standard_derivatives',
      'OES_texture_float',
      'OES_texture_float_linear',
      'OES_texture_half_float',
      'OES_texture_half_float_linear',
      'OES_vertex_array_object',
      'WEBGL_color_buffer_float',
      'WEBGL_compressed_texture_s3tc',
      'WEBGL_compressed_texture_s3tc_srgb',
      'WEBGL_debug_renderer_info',
      'WEBGL_debug_shaders',
      'WEBGL_depth_texture',
      'WEBGL_draw_buffers',
      'WEBGL_lose_context'
    ];
  }

  patchWebGLMetadata() {
    // Already covered in patchWebGL
  }

  patchWebGLParameters() {
    if (typeof WebGLRenderingContext === 'undefined') return;

    const originalGetParameter = WebGLRenderingContext.prototype.getParameter;

    WebGLRenderingContext.prototype.getParameter = function(pname) {
      if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections.webglParameters) {
        const fp = window.fingerprintingProtection;

        // Mask specific parameters that leak hardware info
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

  // ==================== Audio Protection ====================

  patchAudio() {
    if (typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') return;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const originalCreateAnalyser = AudioContextClass.prototype.createAnalyser;
    const originalCreateOscillator = AudioContextClass.prototype.createOscillator;
    const originalCreateGain = AudioContextClass.prototype.createGain;

    this.originalMethods.set('audio-createAnalyser', originalCreateAnalyser);
    this.originalMethods.set('audio-createOscillator', originalCreateOscillator);
    this.originalMethods.set('audio-createGain', originalCreateGain);

    AudioContextClass.prototype.createAnalyser = function() {
      const analyser = originalCreateAnalyser.call(this);
      if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections.audio) {
        const originalGetFloatFrequencyData = analyser.getFloatFrequencyData.bind(analyser);
        const originalGetByteFrequencyData = analyser.getByteFrequencyData.bind(analyser);
        const originalGetFloatTimeDomainData = analyser.getFloatTimeDomainData.bind(analyser);
        const originalGetByteTimeDomainData = analyser.getByteTimeDomainData.bind(analyser);

        const fp = window.fingerprintingProtection;
        const noise = fp.getNoise('audio-analyser', 0.001);

        analyser.getFloatFrequencyData = function(array) {
          originalGetFloatFrequencyData(array);
          for (let i = 0; i < array.length; i++) {
            array[i] += noise * 100;
          }
        };
        analyser.getByteFrequencyData = function(array) {
          originalGetByteFrequencyData(array);
          for (let i = 0; i < array.length; i++) {
            array[i] = Math.max(0, Math.min(255, array[i] + noise * 255));
          }
        };
        analyser.getFloatTimeDomainData = function(array) {
          originalGetFloatTimeDomainData(array);
          for (let i = 0; i < array.length; i++) {
            array[i] += noise;
          }
        };
        analyser.getByteTimeDomainData = function(array) {
          originalGetByteTimeDomainData(array);
          for (let i = 0; i < array.length; i++) {
            array[i] = Math.max(0, Math.min(255, array[i] + noise * 255));
          }
        };
      }
      return analyser;
    };

    AudioContextClass.prototype.createOscillator = function() {
      const osc = originalCreateOscillator.call(this);
      if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections.audio) {
        // Add slight frequency drift
        const originalFrequency = osc.frequency;
        Object.defineProperty(osc, 'frequency', {
          get() { return originalFrequency; },
          set(value) {
            const fp = window.fingerprintingProtection;
            const noise = fp.getNoise('audio-oscillator', 0.0001);
            originalFrequency.value = value * (1 + noise);
          }
        });
      }
      return osc;
    };
  }

  patchAudioContext() {
    if (typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') return;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const originalConstructor = AudioContextClass;

    // We can't easily patch the constructor, but we can patch the prototype
    const originalGetOutputLatency = AudioContextClass.prototype.getOutputLatency;
    if (originalGetOutputLatency) {
      this.originalMethods.set('audio-getOutputLatency', originalGetOutputLatency);
      AudioContextClass.prototype.getOutputLatency = function() {
        if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections.audioContext) {
          // Return a fixed latency value
          return 0.01;
        }
        return originalGetOutputLatency.call(this);
      };
    }
  }

  // ==================== Font Protection ====================

  patchFonts() {
    if (typeof document === 'undefined') return;

    // Patch document.fonts
    if ('fonts' in document) {
      const originalCheck = document.fonts.check.bind(document.fonts);
      const originalLoad = document.fonts.load.bind(document.fonts);
      const originalReady = document.fonts.ready;

      this.originalMethods.set('fonts-check', originalCheck);
      this.originalMethods.set('fonts-load', originalLoad);

      document.fonts.check = function(font, text) {
        if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections.font) {
          // Always return true for common fonts to prevent enumeration
          const commonFonts = ['Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Verdana', 'Georgia', 'sans-serif', 'serif', 'monospace', 'system-ui'];
          if (commonFonts.some(f => font.includes(f))) {
            return true;
          }
        }
        return originalCheck(font, text);
      };

      document.fonts.load = function(font, text) {
        if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections.font) {
          // Return a resolved promise for common fonts
          const commonFonts = ['Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Verdana', 'Georgia', 'sans-serif', 'serif', 'monospace', 'system-ui'];
          if (commonFonts.some(f => font.includes(f))) {
            return Promise.resolve([]);
          }
        }
        return originalLoad(font, text);
      };
    }

    // Patch canvas measureText
    if (typeof CanvasRenderingContext2D !== 'undefined') {
      const originalMeasureText = CanvasRenderingContext2D.prototype.measureText;
      this.originalMethods.set('canvas-measureText', originalMeasureText);

      CanvasRenderingContext2D.prototype.measureText = function(text) {
        const result = originalMeasureText.call(this, text);
        if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections.font) {
          // Add slight noise to width
          const fp = window.fingerprintingProtection;
          const noise = fp.getNoise('font-measureText', 0.001);
          return new Proxy(result, {
            get(target, prop) {
              if (prop === 'width') {
                return target.width * (1 + noise);
              }
              return target[prop];
            }
          });
        }
        return result;
      };
    }
  }

  // ==================== Client Rects Protection ====================

  patchClientRects() {
    if (typeof Element === 'undefined') return;

    const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
    const originalGetClientRects = Element.prototype.getClientRects;

    this.originalMethods.set('getBoundingClientRect', originalGetBoundingClientRect);
    this.originalMethods.set('getClientRects', originalGetClientRects);

    Element.prototype.getBoundingClientRect = function() {
      const rect = originalGetBoundingClientRect.call(this);
      if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections.clientRects) {
        const fp = window.fingerprintingProtection;
        const noise = fp.getNoise('clientRects-' + this.tagName, 0.0001);

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
      if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections.clientRects) {
        const fp = window.fingerprintingProtection;
        const noise = fp.getNoise('clientRects-list-' + this.tagName, 0.0001);

        // Return a modified DOMRectList
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

        // Create a DOMRectList-like object
        return {
          length: modifiedRects.length,
          item: (index) => modifiedRects[index],
          [Symbol.iterator]: () => modifiedRects[Symbol.iterator]()
        };
      }
      return rects;
    };
  }

  // ==================== Media Devices Protection ====================

  patchMediaDevices() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) return;

    const originalEnumerateDevices = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

    this.originalMethods.set('enumerateDevices', originalEnumerateDevices);
    this.originalMethods.set('getUserMedia', originalGetUserMedia);

    navigator.mediaDevices.enumerateDevices = async function() {
      const devices = await originalEnumerateDevices();
      if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections.mediaDevices) {
        // Filter out device IDs to prevent fingerprinting
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
      if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections.mediaDevices) {
        // Strip deviceId from constraints
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

  // ==================== Screen Protection ====================

  patchScreen() {
    if (typeof screen === 'undefined') return;

    const fp = this;

    // Patch screen properties
    const screenProps = {
      width: screen.width,
      height: screen.height,
      availWidth: screen.availWidth,
      availHeight: screen.availHeight,
      colorDepth: screen.colorDepth,
      pixelDepth: screen.pixelDepth
    };

    this.originalMethods.set('screen-width', Object.getOwnPropertyDescriptor(screen, 'width'));
    this.originalMethods.set('screen-height', Object.getOwnPropertyDescriptor(screen, 'height'));
    this.originalMethods.set('screen-availWidth', Object.getOwnPropertyDescriptor(screen, 'availWidth'));
    this.originalMethods.set('screen-availHeight', Object.getOwnPropertyDescriptor(screen, 'availHeight'));
    this.originalMethods.set('screen-colorDepth', Object.getOwnPropertyDescriptor(screen, 'colorDepth'));
    this.originalMethods.set('screen-pixelDepth', Object.getOwnPropertyDescriptor(screen, 'pixelDepth'));

    // Standardize screen resolution to common values
    const commonResolutions = [
      { width: 1920, height: 1080 },
      { width: 1366, height: 768 },
      { width: 1440, height: 900 },
      { width: 1536, height: 864 },
      { width: 1280, height: 720 },
      { width: 1600, height: 900 }
    ];

    const selected = commonResolutions[fp.getRandom('screen-resolution', 0, commonResolutions.length - 1) | 0];

    Object.defineProperty(screen, 'width', {
      configurable: true,
      get() {
        if (fp.enabled && fp.protections.screen) return selected.width;
        return screenProps.width;
      }
    });

    Object.defineProperty(screen, 'height', {
      configurable: true,
      get() {
        if (fp.enabled && fp.protections.screen) return selected.height;
        return screenProps.height;
      }
    });

    Object.defineProperty(screen, 'availWidth', {
      configurable: true,
      get() {
        if (fp.enabled && fp.protections.screen) return selected.width;
        return screenProps.availWidth;
      }
    });

    Object.defineProperty(screen, 'availHeight', {
      configurable: true,
      get() {
        if (fp.enabled && fp.protections.screen) return selected.height - 40; // Account for taskbar
        return screenProps.availHeight;
      }
    });

    Object.defineProperty(screen, 'colorDepth', {
      configurable: true,
      get() {
        if (fp.enabled && fp.protections.screen) return 24;
        return screenProps.colorDepth;
      }
    });

    Object.defineProperty(screen, 'pixelDepth', {
      configurable: true,
      get() {
        if (fp.enabled && fp.protections.screen) return 24;
        return screenProps.pixelDepth;
      }
    });
  }

  // ==================== Battery Protection ====================

  patchBattery() {
    if (typeof navigator === 'undefined' || !navigator.getBattery) return;

    const originalGetBattery = navigator.getBattery.bind(navigator);
    this.originalMethods.set('getBattery', originalGetBattery);

    navigator.getBattery = async function() {
      const battery = await originalGetBattery();
      if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections.battery) {
        const fp = window.fingerprintingProtection;

        // Return standardized battery info
        return new Proxy(battery, {
          get(target, prop) {
            switch (prop) {
              case 'charging':
                return true;
              case 'chargingTime':
                return 0;
              case 'dischargingTime':
                return Infinity;
              case 'level':
                return 1.0;
              default:
                return target[prop];
            }
          }
        });
      }
      return battery;
    };
  }

  // ==================== Hardware Concurrency Protection ====================

  patchHardwareConcurrency() {
    if (typeof navigator === 'undefined') return;

    const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'hardwareConcurrency');
    this.originalMethods.set('hardwareConcurrency', originalDescriptor);

    const commonValues = [2, 4, 8, 12, 16];
    const selected = commonValues[this.getRandom('hardwareConcurrency', 0, commonValues.length - 1) | 0];

    Object.defineProperty(navigator, 'hardwareConcurrency', {
      configurable: true,
      get() {
        if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections.hardwareConcurrency) {
          return selected;
        }
        return originalDescriptor?.get?.call(this) || 4;
      }
    });
  }

  // ==================== Device Memory Protection ====================

  patchDeviceMemory() {
    if (typeof navigator === 'undefined') return;

    const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'deviceMemory');
    this.originalMethods.set('deviceMemory', originalDescriptor);

    const commonValues = [2, 4, 8, 16, 32];
    const selected = commonValues[this.getRandom('deviceMemory', 0, commonValues.length - 1) | 0];

    Object.defineProperty(navigator, 'deviceMemory', {
      configurable: true,
      get() {
        if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections.deviceMemory) {
          return selected;
        }
        return originalDescriptor?.get?.call(this) || 4;
      }
    });
  }

  // ==================== Plugins Protection ====================

  patchPlugins() {
    if (typeof navigator === 'undefined') return;

    const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'plugins');
    this.originalMethods.set('plugins', originalDescriptor);

    Object.defineProperty(navigator, 'plugins', {
      configurable: true,
      get() {
        if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections.plugins) {
          // Return empty plugins list or standardized list
          return {
            length: 0,
            item: () => null,
            namedItem: () => null,
            refresh: () => {},
            [Symbol.iterator]: () => [][Symbol.iterator]()
          };
        }
        return originalDescriptor?.get?.call(this);
      }
    });
  }

  // ==================== MIME Types Protection ====================

  patchMimeTypes() {
    if (typeof navigator === 'undefined') return;

    const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'mimeTypes');
    this.originalMethods.set('mimeTypes', originalDescriptor);

    Object.defineProperty(navigator, 'mimeTypes', {
      configurable: true,
      get() {
        if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections.mimeTypes) {
          return {
            length: 0,
            item: () => null,
            namedItem: () => null,
            [Symbol.iterator]: () => [][Symbol.iterator]()
          };
        }
        return originalDescriptor?.get?.call(this);
      }
    });
  }

  // ==================== Timezone Protection ====================

  patchTimezone() {
    if (typeof Intl === 'undefined') return;

    const originalDateTimeFormat = Intl.DateTimeFormat;
    this.originalMethods.set('DateTimeFormat', originalDateTimeFormat);

    const commonTimezones = ['America/New_York', 'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Asia/Tokyo'];
    const selected = commonTimezones[this.getRandom('timezone', 0, commonTimezones.length - 1) | 0];

    Intl.DateTimeFormat = function(locales, options) {
      if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections.timezone) {
        options = options || {};
        options.timeZone = selected;
      }
      return new originalDateTimeFormat(locales, options);
    };
    Intl.DateTimeFormat.prototype = originalDateTimeFormat.prototype;

    // Also patch Date.prototype.getTimezoneOffset
    const originalGetTimezoneOffset = Date.prototype.getTimezoneOffset;
    this.originalMethods.set('getTimezoneOffset', originalGetTimezoneOffset);

    Date.prototype.getTimezoneOffset = function() {
      if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections.timezone) {
        // Return offset for selected timezone (approximate)
        const offsets = {
          'America/New_York': -300, // EST/EDT
          'America/Los_Angeles': -420, // PST/PDT
          'Europe/London': 0, // GMT/BST
          'Europe/Paris': 60, // CET/CEST
          'Asia/Tokyo': 540 // JST
        };
        return offsets[selected] || 0;
      }
      return originalGetTimezoneOffset.call(this);
    };
  }

  // ==================== Language Protection ====================

  patchLanguage() {
    if (typeof navigator === 'undefined') return;

    const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'language');
    const originalLanguagesDescriptor = Object.getOwnPropertyDescriptor(navigator, 'languages');

    this.originalMethods.set('language', originalDescriptor);
    this.originalMethods.set('languages', originalLanguagesDescriptor);

    const commonLanguages = ['en-US', 'en-GB', 'en', 'es-ES', 'fr-FR', 'de-DE', 'ja-JP', 'zh-CN'];
    const selected = commonLanguages[this.getRandom('language', 0, commonLanguages.length - 1) | 0];

    Object.defineProperty(navigator, 'language', {
      configurable: true,
      get() {
        if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections.language) {
          return selected;
        }
        return originalDescriptor?.get?.call(this) || 'en-US';
      }
    });

    Object.defineProperty(navigator, 'languages', {
      configurable: true,
      get() {
        if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections.language) {
          return [selected, selected.split('-')[0], 'en'];
        }
        return originalLanguagesDescriptor?.get?.call(this) || ['en-US', 'en'];
      }
    });
  }

  // ==================== Platform Protection ====================

  patchPlatform() {
    if (typeof navigator === 'undefined') return;

    const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'platform');
    this.originalMethods.set('platform', originalDescriptor);

    const commonPlatforms = ['Win32', 'MacIntel', 'Linux x86_64'];
    const selected = commonPlatforms[this.getRandom('platform', 0, commonPlatforms.length - 1) | 0];

    Object.defineProperty(navigator, 'platform', {
      configurable: true,
      get() {
        if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections.platform) {
          return selected;
        }
        return originalDescriptor?.get?.call(this) || 'Win32';
      }
    });
  }

  // ==================== Touch Support Protection ====================

  patchTouchSupport() {
    if (typeof navigator === 'undefined') return;

    const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'maxTouchPoints');
    this.originalMethods.set('maxTouchPoints', originalDescriptor);

    Object.defineProperty(navigator, 'maxTouchPoints', {
      configurable: true,
      get() {
        if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections.touchSupport) {
          // Return 0 for desktop, random for mobile
          return window.innerWidth < 768 ? 5 : 0;
        }
        return originalDescriptor?.get?.call(this) || 0;
      }
    });
  }

  // ==================== Canvas Readback Protection ====================

  patchCanvasReadback() {
    // Already covered in patchCanvas
  }

  // ==================== Speech Synthesis Protection ====================

  patchSpeechSynthesis() {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    const originalGetVoices = window.speechSynthesis.getVoices.bind(window.speechSynthesis);
    this.originalMethods.set('speechSynthesis-getVoices', originalGetVoices);

    window.speechSynthesis.getVoices = function() {
      if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections.speechSynthesis) {
        // Return a standardized set of voices
        return [
          { name: 'Google US English', lang: 'en-US', default: true, localService: true },
          { name: 'Google UK English Male', lang: 'en-GB', default: false, localService: true },
          { name: 'Google UK English Female', lang: 'en-GB', default: false, localService: true }
        ];
      }
      return originalGetVoices();
    };
  }

  // ==================== Do Not Track Protection ====================

  patchDoNotTrack() {
    if (typeof navigator === 'undefined') return;

    const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'doNotTrack');
    this.originalMethods.set('doNotTrack', originalDescriptor);

    Object.defineProperty(navigator, 'doNotTrack', {
      configurable: true,
      get() {
        if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections.doNotTrack) {
          return '1'; // Always signal DNT
        }
        return originalDescriptor?.get?.call(this) || null;
      }
    });
  }

  // ==================== WebDriver Protection ====================

  patchWebDriver() {
    if (typeof navigator === 'undefined') return;

    const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'webdriver');
    this.originalMethods.set('webdriver', originalDescriptor);

    Object.defineProperty(navigator, 'webdriver', {
      configurable: true,
      get() {
        if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections.webdriver) {
          return false; // Hide automation
        }
        return originalDescriptor?.get?.call(this) || false;
      }
    });
  }

  // ==================== Control Methods ====================

  setEnabled(enabled) {
    this.enabled = enabled;
  }

  setMode(mode) {
    if (['randomize', 'block', 'noise'].includes(mode)) {
      this.mode = mode;
    }
  }

  setProtection(name, enabled) {
    if (name in this.protections) {
      this.protections[name] = enabled;
      if (enabled && this.isPatched) {
        this.initialize(); // Re-apply patches
      }
    }
  }

  getStats() {
    return {
      enabled: this.enabled,
      mode: this.mode,
      protections: { ...this.protections },
      isPatched: this.isPatched,
      sessionSeed: this.sessionSeed
    };
  }

  /**
   * Get blocked attempts count (placeholder)
   */
  getBlockedAttempts() {
    return this.blockedAttempts;
  }

  /**
   * Handle fingerprinting attempt
   */
  handleAttempt(tabId, attempt) {
    this.blockedAttempts++;
    // Track blocked fingerprinting attempts
  }

  /**
   * Update settings from background script
   */
  updateSettings(settings) {
    if (settings.enabled !== undefined) {
      this.setEnabled(settings.enabled);
    }
    for (const [key, value] of Object.entries(settings)) {
      if (key !== 'enabled' && this.protections.hasOwnProperty(key)) {
        this.setProtection(key, value);
      }
    }
  }

  /**
   * Update settings (alias for updateSettings)
   */
  updatePageSettings(tabId, settings) {
    this.updateSettings(settings);
  }

  restore() {
    for (const [name, original] of this.originalMethods) {
      try {
        // Restore based on name
        if (name === 'toDataURL' && original) {
          HTMLCanvasElement.prototype.toDataURL = original;
        } else if (name === 'toBlob' && original) {
          HTMLCanvasElement.prototype.toBlob = original;
        } else if (name === 'getContext' && original) {
          HTMLCanvasElement.prototype.getContext = original;
        } else if (name.startsWith('webgl-') && original) {
          // WebGL methods restored via prototype
        } else if (name.startsWith('audio-') && original) {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          if (AudioContextClass) {
            if (name === 'audio-createAnalyser') AudioContextClass.prototype.createAnalyser = original;
            else if (name === 'audio-createOscillator') AudioContextClass.prototype.createOscillator = original;
            else if (name === 'audio-createGain') AudioContextClass.prototype.createGain = original;
          }
        } else if (name === 'fonts-check' && original) {
          document.fonts.check = original;
        } else if (name === 'fonts-load' && original) {
          document.fonts.load = original;
        } else if (name === 'canvas-measureText' && original) {
          CanvasRenderingContext2D.prototype.measureText = original;
        } else if (name === 'getBoundingClientRect' && original) {
          Element.prototype.getBoundingClientRect = original;
        } else if (name === 'getClientRects' && original) {
          Element.prototype.getClientRects = original;
        } else if (name === 'enumerateDevices' && original) {
          navigator.mediaDevices.enumerateDevices = original;
        } else if (name === 'getUserMedia' && original) {
          navigator.mediaDevices.getUserMedia = original;
        } else if (name.startsWith('screen-') && original) {
          Object.defineProperty(screen, name.replace('screen-', ''), original);
        } else if (name === 'getBattery' && original) {
          navigator.getBattery = original;
        } else if (name === 'hardwareConcurrency' && original) {
          Object.defineProperty(navigator, 'hardwareConcurrency', original);
        } else if (name === 'deviceMemory' && original) {
          Object.defineProperty(navigator, 'deviceMemory', original);
        } else if (name === 'plugins' && original) {
          Object.defineProperty(navigator, 'plugins', original);
        } else if (name === 'mimeTypes' && original) {
          Object.defineProperty(navigator, 'mimeTypes', original);
        } else if (name === 'DateTimeFormat' && original) {
          Intl.DateTimeFormat = original;
        } else if (name === 'getTimezoneOffset' && original) {
          Date.prototype.getTimezoneOffset = original;
        } else if (name === 'language' && original) {
          Object.defineProperty(navigator, 'language', original);
        } else if (name === 'languages' && original) {
          Object.defineProperty(navigator, 'languages', original);
        } else if (name === 'platform' && original) {
          Object.defineProperty(navigator, 'platform', original);
        } else if (name === 'maxTouchPoints' && original) {
          Object.defineProperty(navigator, 'maxTouchPoints', original);
        } else if (name === 'speechSynthesis-getVoices' && original) {
          window.speechSynthesis.getVoices = original;
        } else if (name === 'doNotTrack' && original) {
          Object.defineProperty(navigator, 'doNotTrack', original);
        } else if (name === 'webdriver' && original) {
          Object.defineProperty(navigator, 'webdriver', original);
        }
      } catch (e) {
        console.warn('[FingerprintingProtection] Failed to restore', name, e);
      }
    }

    this.originalMethods.clear();
    this.isPatched = false;
  }

  /**
   * Inject fingerprinting protection into a tab
   */
  async injectProtection(tabId) {
    if (typeof chrome === 'undefined' || !chrome.scripting) return;

    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          // Fingerprinting protection is automatically applied when the content script loads
          if (window.FingerprintingProtection && !window.fingerprintingProtection) {
            window.fingerprintingProtection = new FingerprintingProtection();
            window.fingerprintingProtection.initialize();
          }
        }
      });
    } catch (error) {
      console.warn('[FingerprintingProtection] Failed to inject protection:', error);
    }
  }

  /**
   * Update content script config
   */
  async updateContentScriptConfig(tabId, settings) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (config) => {
          if (window.fingerprintingProtection) {
            for (const [key, value] of Object.entries(config)) {
              if (key in window.fingerprintingProtection.protections) {
                window.fingerprintingProtection.setProtection(key, value);
              }
            }
          }
        },
        args: [settings]
      });
    } catch (error) {
      console.warn('[FingerprintingProtection] Failed to update config:', error);
    }
  }
}

export { FingerprintingProtection };

// Export for use in service worker (CommonJS fallback)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FingerprintingProtection };
}

if (typeof window !== 'undefined') {
  window.FingerprintingProtection = FingerprintingProtection;
}

// Initialize globally for easy access
if (typeof window !== 'undefined') {
  window.fingerprintingProtection = new FingerprintingProtection();
  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.fingerprintingProtection.initialize();
    });
  } else {
    window.fingerprintingProtection.initialize();
  }
}