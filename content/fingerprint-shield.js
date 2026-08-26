// content/fingerprint-shield.js — Anti-fingerprinting shield (MAIN world at document_start)
(() => {
  'use strict';

  const CONFIG = {
    canvas: true,
    webgl: true,
    audio: true,
    fonts: true,
    clientRects: true,
    mediaDevices: true,
    screen: true,
    battery: true,
    hardwareConcurrency: true,
    deviceMemory: true,
    plugins: true,
    mimeTypes: true,
    timezone: true,
    language: true,
    platform: true,
    touchSupport: true,
    webglMetadata: true,
    webglParameters: true,
    canvasReadback: true,
    audioContext: true,
    speechSynthesis: true,
    doNotTrack: true,
    webdriver: true
  };

  let initialized = false;

  // Deterministic noise generator
  const seed = Math.floor(Math.random() * 1000000);
  let noiseState = seed;

  function nextNoise() {
    noiseState = (noiseState * 1664525 + 1013904223) % 4294967296;
    return noiseState / 4294967296;
  }

  function addNoise(value, entropy = 0.01) {
    return value + (nextNoise() - 0.5) * 2 * entropy * value;
  }

  function init() {
    if (initialized) return;
    initialized = true;

    if (CONFIG.canvas) patchCanvas();
    if (CONFIG.webgl) patchWebGL();
    if (CONFIG.audio) patchAudio();
    if (CONFIG.fonts) patchFonts();
    if (CONFIG.clientRects) patchClientRects();
    if (CONFIG.mediaDevices) patchMediaDevices();
    if (CONFIG.screen) patchScreen();
    if (CONFIG.battery) patchBattery();
    if (CONFIG.hardwareConcurrency) patchHardwareConcurrency();
    if (CONFIG.deviceMemory) patchDeviceMemory();
    if (CONFIG.plugins) patchPlugins();
    if (CONFIG.mimeTypes) patchMimeTypes();
    if (CONFIG.timezone) patchTimezone();
    if (CONFIG.language) patchLanguage();
    if (CONFIG.platform) patchPlatform();
    if (CONFIG.touchSupport) patchTouchSupport();
    if (CONFIG.webglMetadata) patchWebGLMetadata();
    if (CONFIG.webglParameters) patchWebGLParameters();
    if (CONFIG.canvasReadback) patchCanvasReadback();
    if (CONFIG.audioContext) patchAudioContext();
    if (CONFIG.speechSynthesis) patchSpeechSynthesis();
    if (CONFIG.doNotTrack) patchDoNotTrack();
    if (CONFIG.webdriver) patchWebDriver();

    // Block known fingerprinting vectors
    blockFingerprintingVectors();
  }

  // === CANVAS FINGERPRINTING ===
  function patchCanvas() {
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    const originalToBlob = HTMLCanvasElement.prototype.toBlob;
    const originalGetContext = HTMLCanvasElement.prototype.getContext;

    HTMLCanvasElement.prototype.getContext = function(contextType, ...args) {
      const context = originalGetContext.apply(this, contextType, ...args);
      if (contextType === '2d' && context) {
        return new Proxy(context, {
          get(target, prop) {
            const original = target[prop];
            if (typeof original === 'function') {
              if (['getImageData', 'toDataURL', 'toBlob'].includes(prop)) {
                return function(...args) {
                  const result = original.apply(this, args);
                  if (prop === 'getImageData' && result && result.data) {
                    // Add noise to pixel data
                    for (let i = 0; i < result.data.length; i += 4) {
                      const noise = (Math.random() - 0.5) * 0.001 * 255;
                      result.data[i] = Math.max(0, Math.min(255, result.data[i] + noise));
                      result.data[i + 1] = Math.max(0, Math.min(255, result.data[i + 1] + noise));
                      result.data[i + 2] = Math.max(0, Math.min(255, result.data[i + 2] + noise));
                    }
                  }
                  return result;
                };
              }
            }
            return original;
          }
        });
      }
      return context;
    };

    HTMLCanvasElement.prototype.toDataURL = function(type, quality) {
      const context = this.getContext('2d');
      if (context) {
        const imageData = context.getImageData(0, 0, this.width, this.height);
        for (let i = 0; i < imageData.data.length; i += 4) {
          const noise = (Math.random() - 0.5) * 0.0005 * 255;
          imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + noise));
          imageData.data[i + 1] = Math.max(0, Math.min(255, imageData.data[i + 1] + noise));
          imageData.data[i + 2] = Math.max(0, Math.min(255, imageData.data[i + 2] + noise));
        }
        context.putImageData(imageData, 0, 0);
      }
      return originalToDataURL.call(this, type, quality);
    };

    HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) {
      const context = this.getContext('2d');
      if (context) {
        const imageData = context.getImageData(0, 0, this.width, this.height);
        for (let i = 0; i < imageData.data.length; i += 4) {
          const noise = (Math.random() - 0.5) * 0.0005 * 255;
          imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + noise));
          imageData.data[i + 1] = Math.max(0, Math.min(255, imageData.data[i + 1] + noise));
          imageData.data[i + 2] = Math.max(0, Math.min(255, imageData.data[i + 2] + noise));
        }
        context.putImageData(imageData, 0, 0);
      }
      return originalToBlob.call(this, callback, type, quality);
    };
  }

  // === WEBGL FINGERPRINTING ===
  function patchWebGL() {
    const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
    const originalGetExtension = WebGLRenderingContext.prototype.getExtension;
    const originalGetSupportedExtensions = WebGLRenderingContext.prototype.getSupportedExtensions;

    WebGLRenderingContext.prototype.getParameter = function(pname) {
      // VENDOR / RENDERER
      if (pname === this.VENDOR || pname === 0x1F00) {
        return 'Google Inc.';
      }
      if (pname === this.RENDERER || pname === 0x1F01) {
        return 'ANGLE (Apple, Apple GPU)';
      }
      if (pname === this.VERSION || pname === 0x1F02) {
        return 'OpenGL ES 2.0 (WebGL 1.0)';
      }
      if (pname === this.SHADING_LANGUAGE_VERSION || pname === 0x8B8C) {
        return 'WebGL GLSL ES 1.0';
      }

      // Extensions - return standardized list
      if (pname === this.getExtension) {
        return getStandardExtensions();
      }

      return originalGetParameter.call(this, pname);
    };

    WebGLRenderingContext.prototype.getExtension = function(name) {
      const allowed = getStandardExtensions();
      if (!allowed.includes(name)) {
        return null;
      }
      return originalGetExtension.call(this, name);
    };

    WebGLRenderingContext.prototype.getSupportedExtensions = function() {
      return getStandardExtensions();
    };

    function getStandardExtensions() {
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
  }

  function patchWebGLMetadata() {
    // Covered in patchWebGL
  }

  function patchWebGLParameters() {
    const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(pname) {
      // Mask specific parameters that leak hardware info
      const maskedParams = {
        [this.MAX_TEXTURE_SIZE]: 4096,
        [this.MAX_CUBE_MAP_TEXTURE_SIZE]: 4096,
        [this.MAX_RENDERBUFFER_SIZE]: 4096,
        [this.MAX_VIEWPORT_DIMS]: new Int32Array([8192, 8192]),
        [this.ALIASED_LINE_WIDTH_RANGE]: new Float32Array([1, 1]),
        [this.ALIASED_POINT_SIZE_RANGE]: new Float32Array([1, 1024]),
        [this.MAX_VERTEX_ATTRIBS]: 16,
        [this.MAX_VERTEX_UNIFORM_VECTORS]: 256,
        [this.MAX_VARYING_VECTORS]: 15,
        [this.MAX_COMBINED_TEXTURE_IMAGE_UNITS]: 32,
        [this.MAX_VERTEX_TEXTURE_IMAGE_UNITS]: 16,
        [this.MAX_FRAGMENT_UNIFORM_VECTORS]: 256
      };

      if (maskedParams.hasOwnProperty(pname)) {
        return maskedParams[pname];
      }
      return originalGetParameter.call(this, pname);
    };
  }

  // === AUDIO FINGERPRINTING ===
  function patchAudio() {
    if (typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') return;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const originalCreateAnalyser = AudioContextClass.prototype.createAnalyser;
    const originalCreateOscillator = AudioContextClass.prototype.createOscillator;
    const originalCreateGain = AudioContextClass.prototype.createGain;

    AudioContextClass.prototype.createAnalyser = function() {
      const analyser = originalCreateAnalyser.call(this);
      const originalGetFloatFrequencyData = analyser.getFloatFrequencyData.bind(analyser);
      const originalGetByteFrequencyData = analyser.getByteFrequencyData.bind(analyser);
      const originalGetFloatTimeDomainData = analyser.getFloatTimeDomainData.bind(analyser);
      const originalGetByteTimeDomainData = analyser.getByteTimeDomainData.bind(analyser);

      analyser.getFloatFrequencyData = function(array) {
        originalGetFloatFrequencyData(array);
        for (let i = 0; i < array.length; i++) {
          array[i] += (Math.random() - 0.5) * 0.001;
        }
      };
      analyser.getByteFrequencyData = function(array) {
        originalGetByteFrequencyData(array);
        for (let i = 0; i < array.length; i++) {
          array[i] = Math.max(0, Math.min(255, array[i] + (Math.random() - 0.5) * 0.001 * 255));
        }
      };
      analyser.getFloatTimeDomainData = function(array) {
        originalGetFloatTimeDomainData(array);
        for (let i = 0; i < array.length; i++) {
          array[i] += (Math.random() - 0.5) * 0.001;
        }
      };
      analyser.getByteTimeDomainData = function(array) {
        originalGetByteTimeDomainData(array);
        for (let i = 0; i < array.length; i++) {
          array[i] = Math.max(0, Math.min(255, array[i] + (Math.random() - 0.5) * 0.001 * 255));
        }
      };
      return analyser;
    };

    AudioContextClass.prototype.createOscillator = function() {
      const osc = originalCreateOscillator.call(this);
      const originalFrequency = osc.frequency;
      Object.defineProperty(osc, 'frequency', {
        get() { return originalFrequency; },
        set(value) {
          const noise = (Math.random() - 0.5) * 0.0001;
          originalFrequency.value = value * (1 + noise);
        }
      });
      return osc;
    };
  }

  function patchAudioContext() {
    if (typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') return;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const originalGetOutputLatency = AudioContextClass.prototype.getOutputLatency;
    if (originalGetOutputLatency) {
      AudioContextClass.prototype.getOutputLatency = function() {
        if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections.audioContext) {
          return 0.01; // Fixed latency
        }
        return originalGetOutputLatency.call(this);
      };
    }
  }

  // === FONTS ===
  function patchFonts() {
    if (typeof document === 'undefined') return;

    // Patch document.fonts
    if ('fonts' in document) {
      const originalCheck = document.fonts.check.bind(document.fonts);
      const originalLoad = document.fonts.load.bind(document.fonts);

      document.fonts.check = function(font, text) {
        if (CONFIG.fonts) {
          // Always return true for common fonts to prevent enumeration
          const commonFonts = ['Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Verdana', 'Georgia', 'sans-serif', 'serif', 'monospace', 'system-ui'];
          if (commonFonts.some(f => font.includes(f))) {
            return true;
          }
        }
        return originalCheck(font, text);
      };

      document.fonts.load = function(font, text) {
        if (CONFIG.fonts) {
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
      CanvasRenderingContext2D.prototype.measureText = function(text) {
        const result = originalMeasureText.call(this, text);
        if (CONFIG.fonts) {
          const noise = (Math.random() - 0.5) * 0.001;
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

  // === CLIENT RECTS ===
  function patchClientRects() {
    if (typeof Element === 'undefined') return;

    const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
    const originalGetClientRects = Element.prototype.getClientRects;

    Element.prototype.getBoundingClientRect = function() {
      const rect = originalGetBoundingClientRect.call(this);
      if (CONFIG.clientRects) {
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
      if (CONFIG.clientRects) {
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

  // === MEDIA DEVICES ===
  function patchMediaDevices() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) return;

    const originalEnumerateDevices = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

    navigator.mediaDevices.enumerateDevices = async function() {
      const devices = await originalEnumerateDevices();
      if (CONFIG.mediaDevices) {
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
      if (CONFIG.mediaDevices) {
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

  // === SCREEN ===
  function patchScreen() {
    if (typeof screen === 'undefined') return;

    const fp = this;
    const screenProps = {
      width: screen.width,
      height: screen.height,
      availWidth: screen.availWidth,
      availHeight: screen.availHeight,
      colorDepth: screen.colorDepth,
      pixelDepth: screen.pixelDepth
    };

    fp.originalMethods.set('screen-width', Object.getOwnPropertyDescriptor(screen, 'width'));
    fp.originalMethods.set('screen-height', Object.getOwnPropertyDescriptor(screen, 'height'));
    fp.originalMethods.set('screen-availWidth', Object.getOwnPropertyDescriptor(screen, 'availWidth'));
    fp.originalMethods.set('screen-availHeight', Object.getOwnPropertyDescriptor(screen, 'availHeight'));
    fp.originalMethods.set('screen-colorDepth', Object.getOwnPropertyDescriptor(screen, 'colorDepth'));
    fp.originalMethods.set('screen-pixelDepth', Object.getOwnPropertyDescriptor(screen, 'pixelDepth'));

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

  // === BATTERY ===
  function patchBattery() {
    if (typeof navigator === 'undefined' || !navigator.getBattery) return;

    const originalGetBattery = navigator.getBattery.bind(navigator);
    navigator.getBattery = async function() {
      const battery = await originalGetBattery();
      if (CONFIG.battery) {
        // Return standardized battery info
        return new Proxy(battery, {
          get(target, prop) {
            switch (prop) {
              case 'charging': return true;
              case 'chargingTime': return 0;
              case 'dischargingTime': return Infinity;
              case 'level': return 1.0;
              default: return target[prop];
            }
          }
        });
      }
      return battery;
    };
  }

  // === HARDWARE CONCURRENCY ===
  function patchHardwareConcurrency() {
    if (typeof navigator === 'undefined') return;

    const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'hardwareConcurrency');
    const commonValues = [2, 4, 8, 12, 16];
    const selected = commonValues[Math.floor(Math.random() * commonValues.length)];

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

  // === DEVICE MEMORY ===
  function patchDeviceMemory() {
    if (typeof navigator === 'undefined') return;

    const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'deviceMemory');
    const commonValues = [2, 4, 8, 16, 32];
    const selected = commonValues[Math.floor(Math.random() * commonValues.length)];

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

  // === PLUGINS ===
  function patchPlugins() {
    if (typeof navigator === 'undefined') return;

    const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'plugins');
    Object.defineProperty(navigator, 'plugins', {
      configurable: true,
      get() {
        if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections.plugins) {
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

  // === MIME TYPES ===
  function patchMimeTypes() {
    if (typeof navigator === 'undefined') return;

    const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'mimeTypes');
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

  // === TIMEZONE ===
  function patchTimezone() {
    if (typeof Intl === 'undefined') return;

    const originalDateTimeFormat = Intl.DateTimeFormat;
    const commonTimezones = ['America/New_York', 'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Asia/Tokyo'];
    const selected = commonTimezones[Math.floor(Math.random() * commonTimezones.length)];

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

  // === LANGUAGE ===
  function patchLanguage() {
    if (typeof navigator === 'undefined') return;

    const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'language');
    const originalLanguagesDescriptor = Object.getOwnPropertyDescriptor(navigator, 'languages');

    const commonLanguages = ['en-US', 'en-GB', 'en', 'es-ES', 'fr-FR', 'de-DE', 'ja-JP', 'zh-CN'];
    const selected = commonLanguages[Math.floor(Math.random() * commonLanguages.length)];

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

  // === PLATFORM ===
  function patchPlatform() {
    if (typeof navigator === 'undefined') return;

    const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'platform');
    const commonPlatforms = ['Win32', 'MacIntel', 'Linux x86_64'];
    const selected = commonPlatforms[Math.floor(Math.random() * commonPlatforms.length)];

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

  // === TOUCH SUPPORT ===
  function patchTouchSupport() {
    if (typeof navigator === 'undefined') return;

    const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'maxTouchPoints');
    Object.defineProperty(navigator, 'maxTouchPoints', {
      configurable: true,
      get() {
        if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections.touchSupport) {
          return window.innerWidth < 768 ? 5 : 0;
        }
        return originalDescriptor?.get?.call(this) || 0;
      }
    });
  }

  // === CANVAS READBACK ===
  function patchCanvasReadback() {
    // Already covered in patchCanvas
  }

  // === AUDIO CONTEXT ===
  function patchAudioContext() {
    if (typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') return;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const originalGetOutputLatency = AudioContextClass.prototype.getOutputLatency;
    if (originalGetOutputLatency) {
      AudioContextClass.prototype.getOutputLatency = function() {
        if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections.audioContext) {
          return 0.01; // Fixed latency
        }
        return originalGetOutputLatency.call(this);
      };
    }
  }

  // === SPEECH SYNTHESIS ===
  function patchSpeechSynthesis() {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    const originalGetVoices = window.speechSynthesis.getVoices.bind(window.speechSynthesis);
    window.speechSynthesis.getVoices = function() {
      if (window.fingerprintingProtection?.enabled && window.fingerprintingProtection.protections.speechSynthesis) {
        return [
          { name: 'Google US English', lang: 'en-US', default: true, localService: true },
          { name: 'Google UK English Male', lang: 'en-GB', default: false, localService: true },
          { name: 'Google UK English Female', lang: 'en-GB', default: false, localService: true }
        ];
      }
      return originalGetVoices();
    };
  }

  // === DO NOT TRACK ===
  function patchDoNotTrack() {
    if (typeof navigator === 'undefined') return;

    const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'doNotTrack');
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

  // === WEBDRIVER ===
  function patchWebDriver() {
    if (typeof navigator === 'undefined') return;

    const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'webdriver');
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

  // === BLOCK FINGERPRINTING VECTORS ===
  function blockFingerprintingVectors() {
    // Block known fingerprinting libraries
    const blockedFingerprinters = [
      'fingerprintjs2', 'fingerprintjs', 'fingerprint', 'fingerprint2',
      'ClientJS', 'DeviceInfo', 'detect', 'fingerprint', 'fingerprint2'
    ];

    blockedFingerprinters.forEach(name => {
      if (window[name]) {
        try { window[name] = undefined; } catch(e) {}
      }
    });

    // Block known fingerprinting functions
    const fingerprintFunctions = [
      'getFingerprint', 'getFingerprint2', 'getClientFingerprint',
      'getDeviceFingerprint', 'getBrowserFingerprint'
    ];

    fingerprintFunctions.forEach(name => {
      if (window[name]) {
        try { window[name] = () => Promise.resolve(''); } catch(e) {}
      }
    }
  }

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose API
  window.fingerprintingProtection = {
    init,
    setEnabled: (enabled) => { CONFIG.enabled = enabled; },
    setMode: (mode) => { if (['randomize', 'block', 'noise'].includes(mode)) CONFIG.mode = mode; },
    setProtection: (name, enabled) => { if (name in CONFIG) CONFIG[name] = enabled; },
    getStats: () => ({ enabled: CONFIG.enabled, mode: 'randomize', protections: { ...CONFIG } })
  };

  // Auto-initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();