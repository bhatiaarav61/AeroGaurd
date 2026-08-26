/**
 * IMA SDK Neutralizer — Complete API stubbing, not just blocking
 * Neutralizes Google IMA SDK completely without breaking player
 * Provides full stub implementations for google.ima, googletag.pubads, and all methods
 */

export class IMANeutralizer {
  constructor(context = window) {
    this.context = context;
    this.isActive = false;
    this.originalObjects = new Map();
    this.stubs = new Map();
    this.eventListeners = new Map();
  }

  /**
   * Initialize IMA neutralization
   */
  initialize() {
    if (this.isActive) return;

    // 1. Block IMA SDK script loading
    this._blockScriptLoading();

    // 2. Stub google.ima namespace completely
    this._stubGoogleIMA();

    // 3. Stub googletag completely (pubads, cmd, defineSlot, etc.)
    this._stubGoogleTag();

    // 4. Stub IMA event handlers
    this._stubIMAEvents();

    // 5. Block IMA ad requests
    this._blockIMARequests();

    this.isActive = true;
    console.log('[IMANeutralizer] Initialized - Complete API stubbing active');
  }

  _blockScriptLoading() {
    const originalCreateElement = this.context.document.createElement;
    this.originalObjects.set('document.createElement', originalCreateElement);

    this.context.document.createElement = function(tag, options) {
      const el = originalCreateElement.call(this, tag, options);
      if (tag.toLowerCase() === 'script' && el.src) {
        const src = el.src.toLowerCase();
        if (src.includes('imasdk') || src.includes('googleads') ||
            src.includes('doubleclick.net/imasdk') || src.includes('pubads.g.doubleclick.net/imasdk') ||
            src.includes('imasdk.googleapis.com') || src.includes('imasdk.s3.amazonaws.com') ||
            src.includes('gstatic.com/imasdk') || src.includes('cdn.jsdelivr.net/npm/google-ima')) {
          console.log('[IMANeutralizer] Blocked IMA SDK script:', el.src);
          return this.document.createComment('Blocked IMA SDK: ' + el.src);
        }
      }
      return el;
    }.bind(this);
  }

  _stubGoogleIMA() {
    // Save original
    this.originalObjects.set('window.google', this.context.google);

    // ============================================================================
    // COMPLETE google.ima STUB IMPLEMENTATION
    // ============================================================================

    // Define all classes first (before object literal to avoid forward reference issues)
    class AdDisplayContainer {
      constructor(videoElement, adContainer) {
        this.videoElement = videoElement;
        this.adContainer = adContainer;
        this.initialized = false;
        this.destroyed = false;
        this._eventListeners = new Map();
      }
      initialize() {
        this.initialized = true;
        console.log('[IMANeutralizer] AdDisplayContainer.initialize() called');
      }
      destroy() {
        this.initialized = false;
        this.destroyed = true;
        this._eventListeners.clear();
      }
      getVideoElement() { return this.videoElement; }
      getAdContainer() { return this.adContainer; }
      addEventListener(type, listener) {
        if (!this._eventListeners.has(type)) this._eventListeners.set(type, []);
        this._eventListeners.get(type).push(listener);
      }
      removeEventListener(type, listener) {
        if (this._eventListeners.has(type)) {
          const arr = this._eventListeners.get(type);
          const idx = arr.indexOf(listener);
          if (idx !== -1) arr.splice(idx, 1);
        }
      }
      dispatchEvent(event) { return true; }
    }

    class AdsLoader {
      constructor(settings, adDisplayContainer) {
        this.settings = settings || null;
        this.adDisplayContainer = adDisplayContainer || null;
        this._eventListeners = new Map();
        this.destroyed = false;
      }
      addEventListener(type, listener) {
        if (!this._eventListeners.has(type)) this._eventListeners.set(type, []);
        this._eventListeners.get(type).push(listener);
      }
      removeEventListener(type, listener) {
        if (this._eventListeners.has(type)) {
          const arr = this._eventListeners.get(type);
          const idx = arr.indexOf(listener);
          if (idx !== -1) arr.splice(idx, 1);
        }
      }
      requestAds(adsRequest) {
        console.log('[IMANeutralizer] AdsLoader.requestAds() called - neutralized');
        setTimeout(() => {
          if (this._eventListeners.has('error')) {
            const errorEvent = new AdErrorEvent('error', new AdError(1001, 'IMA SDK neutralized'));
            this._eventListeners.get('error').forEach(cb => cb(errorEvent));
          }
          if (this._eventListeners.has('adsLoaded')) {
            const loadedEvent = new AdsLoadedEvent('adsLoaded', null);
            this._eventListeners.get('adsLoaded').forEach(cb => cb(loadedEvent));
          }
        }, 0);
      }
      getSettings() { return this.settings; }
      contentComplete() { console.log('[IMANeutralizer] AdsLoader.contentComplete() called'); }
      destroy() {
        this.destroyed = true;
        this._eventListeners.clear();
      }
    }

    class AdsRequest {
      constructor() {
        this.adTagUrl = '';
        this.adsResponse = null;
        this.linearAdSlotWidth = 640;
        this.linearAdSlotHeight = 360;
        this.nonLinearAdSlotWidth = 640;
        this.nonLinearAdSlotHeight = 360;
          this.forceNonLinearFullSlot = false;
          this.vastLoadTimeout = -1;
          this.adWillAutoPlay = false;
          this.adWillPlayMuted = false;
          this.continuousPlayback = false;
          this.vpaidMode = 'ENABLED';
        }
      },

      // AdsManager - Controls ad playback
      AdsManager: class {
        constructor() {
          this._eventListeners = new Map();
          this.initialized = false;
          this.destroyed = false;
          this.volume = 1;
          this.currentAd = null;
          this._adBuffer = [];
        }
        init(width, height, viewMode) {
          this.initialized = true;
          this._width = width;
          this._height = height;
          this._viewMode = viewMode;
          console.log('[IMANeutralizer] AdsManager.init() called');
        }
        start() {
          console.log('[IMANeutralizer] AdsManager.start() called');
          // Dispatch LOADED and STARTED events
          this._dispatch('loaded');
          this._dispatch('started');
        }
        pause() { console.log('[IMANeutralizer] AdsManager.pause() called'); }
        resume() { console.log('[IMANeutralizer] AdsManager.resume() called'); }
        destroy() {
          this.destroyed = true;
          this.initialized = false;
          this._eventListeners.clear();
        }
        setVolume(vol) { this.volume = Math.max(0, Math.min(1, vol)); }
        getVolume() { return this.volume; }
        addEventListener(type, listener) {
          if (!this._eventListeners.has(type)) this._eventListeners.set(type, []);
          this._eventListeners.get(type).push(listener);
        }
        removeEventListener(type, listener) {
          if (this._eventListeners.has(type)) {
            const arr = this._eventListeners.get(type);
            const idx = arr.indexOf(listener);
            if (idx !== -1) arr.splice(idx, 1);
          }
        }
        discardAdBreak() { console.log('[IMANeutralizer] AdsManager.discardAdBreak() called'); }
        skip() { console.log('[IMANeutralizer] AdsManager.skip() called'); }
        resize(width, height, viewMode) {
          this._width = width;
          this._height = height;
          this._viewMode = viewMode;
        }
        getCuePoints() { return []; }
        getRemainingTime() { return 0; }
        getDuration() { return 0; }
        getCurrentAd() { return null; }
        getAdSkippableState() { return false; }
        _dispatch(type) {
          if (this._eventListeners.has(type)) {
            const event = new IMAAdEvent(type);
            this._eventListeners.get(type).forEach(cb => cb(event));
          }
        }
      },

      // AdsRenderingSettings - Rendering configuration
      AdsRenderingSettings: class {
        constructor() {
          this.enablePreloading = true;
          this.mimeTypes = [];
          this.bitrate = -1;
          this.loadVideoTimeout = -1;
          this.playAdsAfterTime = -1;
          this.uiElements = [];
          this.useCustomClickTracking = false;
          this.useCustomPlaybackForMutedAutoplay = false;
          this.customPlayback = null;
        }
      },

      // AdError - Error representation
      AdError: class {
        constructor(code, message, innerError) {
          this.errorCode = code;
          this.message = message;
          this.innerError = innerError;
        }
        getErrorCode() { return this.errorCode; }
        getMessage() { return this.message; }
        getInnerError() { return this.innerError; }
        toString() { return `AdError ${this.errorCode}: ${this.message}`; }
      },

      // AdErrorEvent - Error event
      AdErrorEvent: class {
        constructor(type, error) {
          this.type = type;
          this.error = error;
        }
        getError() { return this.error; }
        getType() { return this.type; }
      },

      // AdsLoadedEvent - Fired when ads are loaded
      AdsLoadedEvent: class {
        constructor(type, adsManager, userRequestContext) {
          this.type = type;
          this.adsManager = adsManager;
          this.userRequestContext = userRequestContext;
        }
        getAdsManager() { return this.adsManager; }
        getUserRequestContext() { return this.userRequestContext; }
        getType() { return this.type; }
      },

      // AdEvent - Generic ad event
      AdEvent: class {
        constructor(type, ad) {
          this.type = type;
          this.ad = ad;
        }
        getAd() { return this.ad; }
        getType() { return this.type; }
        // Static event types
        static Type = {
          LOADED: 'loaded',
          STARTED: 'started',
          COMPLETE: 'complete',
          PAUSED: 'paused',
          RESUMED: 'resumed',
          SKIPPED: 'skipped',
          VOLUME_CHANGED: 'volumeChanged',
          ALL_ADS_COMPLETED: 'allAdsCompleted',
          CLICK: 'click',
          LOG: 'log',
          ERROR: 'error',
          AD_BREAK_READY: 'adBreakReady',
          CONTENT_PAUSE_REQUESTED: 'contentPauseRequested',
          CONTENT_RESUME_REQUESTED: 'contentResumeRequested',
          LOADED_METADATA: 'loadedMetadata',
          AD_PROGRESS: 'adProgress',
          CUE_POINTS_CHANGED: 'cuePointsChanged',
          ICON_FALLBACK_IMAGE_CLOSED: 'iconFallbackImageClosed',
          INTERACTION: 'interaction',
          LINEAR_CHANGED: 'linearChanged',
          SKIPPABLE_STATE_CHANGED: 'skippableStateChanged',
          AD_BUFFERING: 'adBuffering',
          IMPRESSION: 'impression',
          VIDEO_CLICKED: 'videoClicked',
          VIDEO_ICON_CLICKED: 'videoIconClicked',
          VIDEO_STARTED: 'videoStarted',
          CARD_SHOWN: 'cardShown',
          CARD_DISMISSED: 'cardDismissed',
          THIRD_QUARTILE: 'thirdQuartile',
          MIDPOINT: 'midpoint',
          FIRST_QUARTILE: 'firstQuartile'
        };
      },

      // StreamRequest - For live stream ads
      StreamRequest: class {
        constructor() {
          this.assetKey = '';
          this.apiKey = '';
          this.authToken = '';
          this.streamFormat = 'dash';
          this.adTagParameters = null;
          this.adTagUrl = '';
        }
      },

      // StreamManager - For server-side ad insertion
      StreamManager: class {
        constructor() {
          this._eventListeners = new Map();
          this.initialized = false;
        }
        initialize() { this.initialized = true; }
        requestStream(request) {
          console.log('[IMANeutralizer] StreamManager.requestStream() called');
          setTimeout(() => {
            if (this._eventListeners.has('error')) {
              this._eventListeners.get('error').forEach(cb => cb(new IMAAdErrorEvent('error', new AdError(1001, 'Stream neutralized'))));
            }
          }, 0);
        }
        destroy() { this._eventListeners.clear(); }
        addEventListener(type, listener) {
          if (!this._eventListeners.has(type)) this._eventListeners.set(type, []);
          this._eventListeners.get(type).push(listener);
        }
        removeEventListener(type, listener) {
          if (this._eventListeners.has(type)) {
            const arr = this._eventListeners.get(type);
            const idx = arr.indexOf(listener);
            if (idx !== -1) arr.splice(idx, 1);
          }
        }
        onTimedMetadata(metadata) { }
      },

      // CompanionAdSlot - For companion ads
      CompanionAdSlot: class {
        constructor(id, width, height) {
          this.id = id;
          this.width = width;
          this.height = height;
        }
        setContainer(container) { this.container = container; }
        getContainer() { return this.container; }
      },

      // ViewMode enum
      ViewMode: {
        NORMAL: 'normal',
        FULLSCREEN: 'fullscreen'
      },

      // VpaidMode enum
      VpaidMode: {
        DISABLED: 'disabled',
        ENABLED: 'enabled',
        INSECURE: 'insecure'
      },

      // AdPodInfo - Info about ad pods
      AdPodInfo: class {
        constructor() {
          this.totalAds = 0;
          this.adPosition = 0;
          this.isBumper = false;
          this.podIndex = 0;
          this.timeOffset = 0;
          this.maxDuration = 0;
        }
        getTotalAds() { return this.totalAds; }
        getAdPosition() { return this.adPosition; }
        getIsBumper() { return this.isBumper; }
        getPodIndex() { return this.podIndex; }
        getTimeOffset() { return this.timeOffset; }
        getMaxDuration() { return this.maxDuration; }
      },

      // Ad - Base ad class
      Ad: class {
        constructor() {
          this.adId = '';
          this.adSystem = '';
          this.adTitle = '';
          this.description = '';
          this.surveyUrl = '';
          this.dealId = '';
          this.wrapperAdIds = [];
          this.wrapperAdSystems = [];
          this.wrapperCreativeIds = [];
          this.universalAdIds = [];
          this.creativeAdId = '';
          this.creativeId = '';
          this.width = 0;
          this.height = 0;
          this.duration = 0;
          this.position = 0;
          this.isLinear = false;
          this.skippable = false;
          this.skipTimeOffset = 0;
          this.uiElements = [];
          this.minSuggestedDuration = 0;
          this.contentType = '';
          this.apiFramework = '';
          this.vastMediaWidth = 0;
          this.vastMediaHeight = 0;
          this.vastMediaBitrate = 0;
        }
        getAdId() { return this.adId; }
        getAdSystem() { return this.adSystem; }
        getAdTitle() { return this.adTitle; }
        getDescription() { return this.description; }
        getSurveyUrl() { return this.surveyUrl; }
        getDealId() { return this.dealId; }
        getWrapperAdIds() { return this.wrapperAdIds; }
        getWrapperAdSystems() { return this.wrapperAdSystems; }
        getWrapperCreativeIds() { return this.wrapperCreativeIds; }
        getUniversalAdIds() { return this.universalAdIds; }
        getCreativeAdId() { return this.creativeAdId; }
        getCreativeId() { return this.creativeId; }
        getWidth() { return this.width; }
        getHeight() { return this.height; }
        getDuration() { return this.duration; }
        getPosition() { return this.position; }
        getIsLinear() { return this.isLinear; }
        getSkippable() { return this.skippable; }
        getSkipTimeOffset() { return this.skipTimeOffset; }
        getUiElements() { return this.uiElements; }
        getMinSuggestedDuration() { return this.minSuggestedDuration; }
        getContentType() { return this.contentType; }
        getApiFramework() { return this.apiFramework; }
        getVastMediaWidth() { return this.vastMediaWidth; }
        getVastMediaHeight() { return this.vastMediaHeight; }
        getVastMediaBitrate() { return this.vastMediaBitrate; }
      },

      // LinearAd - Video ad (extends Ad)
      LinearAd: class {
        constructor() {
          const base = new imaStub.Ad();
          Object.assign(this, base);
          this.isLinear = true;
          this.mediaFiles = [];
          this.trackingEvents = [];
          this.videoClicks = [];
          this.icon = null;
        }
        getMediaFiles() { return this.mediaFiles; }
        getTrackingEvents() { return this.trackingEvents; }
        getVideoClicks() { return this.videoClicks; }
        getIcon() { return this.icon; }
      },

      // NonLinearAd - Overlay/banner ad (extends Ad)
      NonLinearAd: class {
        constructor() {
          const base = new imaStub.Ad();
          Object.assign(this, base);
          this.isLinear = false;
          this.staticResource = null;
          this.htmlResource = null;
          this.iframeResource = null;
          this.adSlotIds = [];
        }
        getStaticResource() { return this.staticResource; }
        getHtmlResource() { return this.htmlResource; }
        getIframeResource() { return this.iframeResource; }
        getAdSlotIds() { return this.adSlotIds; }
      },

      // CompanionAd - Companion ad
      CompanionAd: class {
        constructor() {
          this.content = '';
          this.width = 0;
          this.height = 0;
          this.contentType = '';
          this.apiFramework = '';
        }
        getContent() { return this.content; }
        getWidth() { return this.width; }
        getHeight() { return this.height; }
        getContentType() { return this.contentType; }
        getApiFramework() { return this.apiFramework; }
      },

      // Settings - SDK settings
      Settings: class {
        constructor() {
          this.autoPlayAdBreaks = true;
          this.disableCustomPlaybackForIOS10Plus = false;
          this.enableBackgroundPlayback = false;
          this.forceNonLinearFullSlot = false;
          this.language = 'en';
          this.numRedirects = 4;
          this.playerType = 'html5';
          this.playerVersion = '1.0';
          this.ppid = '';
          this.vpaidMode = 'ENABLED';
          this.omidSettings = null;
        }
        setAutoPlayAdBreaks(val) { this.autoPlayAdBreaks = val; }
        setDisableCustomPlaybackForIOS10Plus(val) { this.disableCustomPlaybackForIOS10Plus = val; }
        setEnableBackgroundPlayback(val) { this.enableBackgroundPlayback = val; }
        setForceNonLinearFullSlot(val) { this.forceNonLinearFullSlot = val; }
        setLanguage(val) { this.language = val; }
        setNumRedirects(val) { this.numRedirects = val; }
        setPlayerType(val) { this.playerType = val; }
        setPlayerVersion(val) { this.playerVersion = val; }
        setPpid(val) { this.ppid = val; }
        setVpaidMode(val) { this.vpaidMode = val; }
        setOmidSettings(val) { this.omidSettings = val; }
      },

      // Constants
      AdEvent: imaStub.AdEvent,
      AdError: imaStub.AdError,
      AdErrorEvent: imaStub.AdErrorEvent,
      AdsLoadedEvent: imaStub.AdsLoadedEvent,

      // SDK info
      sdk: {
        isIMA: true,
        version: '3.0.0 (neutralized)',
        getVersion: () => '3.0.0 (neutralized)'
      }
    };

    // Helper classes for events
    function IMAAdEvent(type, ad) {
      return new imaStub.AdEvent(type, ad);
    }
    function IMAAdErrorEvent(type, error) {
      return new imaStub.AdErrorEvent(type, error);
    }
    function IMAAdsLoadedEvent(type, adsManager, userRequestContext) {
      return new imaStub.AdsLoadedEvent(type, adsManager, userRequestContext);
    }
    function AdError(code, message, innerError) {
      return new imaStub.AdError(code, message, innerError);
    }

    // Make them available on the stub
    imaStub.IMAAdEvent = IMAAdEvent;
    imaStub.IMAAdErrorEvent = IMAAdErrorEvent;
    imaStub.IMAAdsLoadedEvent = IMAAdsLoadedEvent;

    // Define google.ima property with Proxy for complete interception
    Object.defineProperty(this.context, 'google', {
      configurable: true,
      enumerable: true,
      get: () => new Proxy(this.originalObjects.get('window.google') || {}, {
        get: (target, prop) => {
          if (prop === 'ima') {
            console.log('[IMANeutralizer] google.ima accessed - returning full stub');
            return imaStub;
          }
          if (prop === 'ima' || prop === 'imaSDK') {
            return imaStub;
          }
          return target[prop];
        },
        has: (target, prop) => prop !== 'ima' && prop in target,
        ownKeys: (target) => Object.keys(target).filter(k => k !== 'ima'),
        getOwnPropertyDescriptor: (target, prop) => {
          if (prop === 'ima') {
            return { configurable: true, enumerable: true, value: imaStub, writable: false };
          }
          return Object.getOwnPropertyDescriptor(target, prop);
        }
      }),
      set: (v) => { this.originalObjects.set('window.google', v); return true; }
    });

    // Also define on window directly if not already
    if (!this.context.hasOwnProperty('google')) {
      Object.defineProperty(this.context, 'google', {
        configurable: true,
        writable: true,
        value: { ima: imaStub }
      });
    } else if (this.context.google && !this.context.google.ima) {
      this.context.google.ima = imaStub;
    }
  }

  _stubGoogleTag() {
    this.originalObjects.set('window.googletag', this.context.googletag);

    // ============================================================================
    // COMPLETE googletag STUB IMPLEMENTATION
    // ============================================================================

    // Slot stub with all methods
    function createSlotStub() {
      const slot = {
        _targeting: new Map(),
        _services: new Set(),
        _categoryExclusions: new Set(),
        _collapseEmptyDiv: false,
        _adUnitPath: '',
        _sizes: [],
        _div: null,
        _defined: false,

        // Targeting
        setTargeting: function(key, value) {
          if (Array.isArray(value)) {
            this._targeting.set(key, value);
          } else {
            this._targeting.set(key, [value]);
          }
          return this;
        },
        getTargeting: function(key) {
          const val = this._targeting.get(key);
          return val ? (val.length === 1 ? val[0] : val) : undefined;
        },
        clearTargeting: function(key) {
          if (key) {
            this._targeting.delete(key);
          } else {
            this._targeting.clear();
          }
          return this;
        },

        // Sizes
        setSizes: function(sizes) { this._sizes = sizes; return this; },
        getSizes: function() { return this._sizes; },

        // Ad unit
        getAdUnitPath: function() { return this._adUnitPath; },
        setAdUnitPath: function(path) { this._adUnitPath = path; return this; },

        // Category exclusions
        addCategoryExclusion: function(cat) { this._categoryExclusions.add(cat); return this; },
        clearCategoryExclusions: function() { this._categoryExclusions.clear(); return this; },

        // Collapse
        setCollapseEmptyDiv: function(collapse) { this._collapseEmptyDiv = collapse; return this; },
        getCollapseEmptyDiv: function() { return this._collapseEmptyDiv; },

        // Services
        addService: function(service) { this._services.add(service); return this; },

        // Div
        setDiv: function(div) { this._div = div; return this; },
        getDiv: function() { return this._div; },

        // Click URL
        setClickUrl: function(url) { return this; },
        getClickUrl: function() { return ''; },

        // Event listeners
        addEventListener: function(event, handler) { return this; },
        removeEventListener: function(event, handler) { return this; },

        // Rendering
        setRenderCallback: function(cb) { return this; },
        getResponseInformation: function() { return null; },

        // SafeFrame
        setForceSafeFrame: function(force) { return this; },
        getForceSafeFrame: function() { return false; },

        // Privacy
        setPrivacyTreatments: function(treatments) { return this; },
        getPrivacyTreatments: function() { return []; }
      };
      return slot;
    }

    // Pubads service stub
    const pubadsStub = {
      _slots: [],
      _targeting: new Map(),
      _categoryExclusions: new Set(),
      _eventListeners: new Map(),
      _enableSyncRendering: false,
      _disableInitialLoad: false,
      _singleRequest: false,
      _pageTargeting: new Map(),

      // Slot management
      defineSlot: function(adUnitPath, size, div) {
        const slot = createSlotStub();
        slot._adUnitPath = adUnitPath;
        slot._sizes = Array.isArray(size[0]) ? size : [size];
        slot._div = div;
        slot._defined = true;
        this._slots.push(slot);
        console.log('[IMANeutralizer] googletag.defineSlot() called:', adUnitPath);
        return slot;
      },
      defineOutOfPageSlot: function(adUnitPath, div) {
        const slot = createSlotStub();
        slot._adUnitPath = adUnitPath;
        slot._sizes = ['fluid'];
        slot._div = div;
        slot._defined = true;
        this._slots.push(slot);
        return slot;
      },
      getSlots: function() { return this._slots; },
      destroySlots: function(slots) {
        const toDestroy = slots || this._slots;
        toDestroy.forEach(slot => { slot._defined = false; });
        this._slots = this._slots.filter(s => !toDestroy.includes(s));
      },

      // Targeting
      setTargeting: function(key, value) {
        if (Array.isArray(value)) {
          this._targeting.set(key, value);
        } else {
          this._targeting.set(key, [value]);
        }
        return this;
      },
      getTargeting: function(key) {
        const val = this._targeting.get(key);
        return val ? (val.length === 1 ? val[0] : val) : undefined;
      },
      clearTargeting: function(key) {
        if (key) {
          this._targeting.delete(key);
        } else {
          this._targeting.clear();
        }
        return this;
      },

      // Category exclusions
      addCategoryExclusion: function(cat) { this._categoryExclusions.add(cat); return this; },
      clearCategoryExclusions: function() { this._categoryExclusions.clear(); return this; },

      // Configuration
      enableSyncRendering: function() { this._enableSyncRendering = true; return this; },
      disableInitialLoad: function() { this._disableInitialLoad = true; return this; },
      enableSingleRequest: function() { this._singleRequest = true; return this; },
      collapseEmptyDivs: function(collapse) { return this; },

      // Requests
      refresh: function(slots, options) {
        console.log('[IMANeutralizer] googletag.pubads().refresh() called - neutralized');
        return Promise.resolve();
      },
      clear: function(slots) {
        console.log('[IMANeutralizer] googletag.pubads().clear() called');
        return this;
      },
      requestNotification: function(handler) { return this; },

      // Events
      addEventListener: function(event, handler) {
        if (!this._eventListeners.has(event)) this._eventListeners.set(event, []);
        this._eventListeners.get(event).push(handler);
        return this;
      },
      removeEventListener: function(event, handler) {
        if (this._eventListeners.has(event)) {
          const arr = this._eventListeners.get(event);
          const idx = arr.indexOf(handler);
          if (idx !== -1) arr.splice(idx, 1);
        }
        return this;
      },

      // Page targeting
      setPageTargeting: function(key, value) {
        if (Array.isArray(value)) {
          this._pageTargeting.set(key, value);
        } else {
          this._pageTargeting.set(key, [value]);
        }
        return this;
      },
      getPageTargeting: function(key) {
        const val = this._pageTargeting.get(key);
        return val ? (val.length === 1 ? val[0] : val) : undefined;
      },
      clearPageTargeting: function(key) {
        if (key) this._pageTargeting.delete(key);
        else this._pageTargeting.clear();
        return this;
      },

      // State
      isInitialLoadDisabled: function() { return this._disableInitialLoad; },
      getSlots: function() { return this._slots; },

      // Companion ads
      companionAds: function() { return companionAdsStub; },

      // Version
      getVersion: function() { return 'neutralized'; }
    };

    // Companion ads stub
    const companionAdsStub = {
      setRefreshUnfilledSlots: function(val) { return this; },
      addEventListener: function(event, handler) { return this; },
      removeEventListener: function(event, handler) { return this; }
    };

    // Main googletag object
    const googletagStub = {
      // Command queue - executes immediately
      cmd: {
        push: function(fn) {
          if (typeof fn === 'function') {
            try { fn(); } catch (e) { console.warn('[IMANeutralizer] googletag.cmd.push error:', e); }
          }
          return this;
        },
        _executed: true
      },

      // Pubads service
      pubads: function() { return pubadsStub; },

      // Slots
      defineSlot: function(adUnitPath, size, div) {
        return pubadsStub.defineSlot(adUnitPath, size, div);
      },
      defineOutOfPageSlot: function(adUnitPath, div) {
        return pubadsStub.defineOutOfPageSlot(adUnitPath, div);
      },

      // Services
      enableServices: function() { console.log('[IMANeutralizer] googletag.enableServices() called'); return this; },
      disablePublisherConsole: function() { return this; },
      openConsole: function() { return this; },

      // Display
      display: function(div, slot) {
        console.log('[IMANeutralizer] googletag.display() called:', div);
        return this;
      },

      // Targeting (delegated to pubads)
      setTargeting: function(key, value) { return pubadsStub.setTargeting(key, value); },
      getTargeting: function(key) { return pubadsStub.getTargeting(key); },
      clearTargeting: function(key) { return pubadsStub.clearTargeting(key); },

      // Category exclusions
      addCategoryExclusion: function(cat) { return pubadsStub.addCategoryExclusion(cat); },
      clearCategoryExclusions: function() { return pubadsStub.clearCategoryExclusions(); },

      // Configuration
      enableSyncRendering: function() { return pubadsStub.enableSyncRendering(); },
      disableInitialLoad: function() { return pubadsStub.disableInitialLoad(); },
      enableSingleRequest: function() { return pubadsStub.enableSingleRequest(); },
      collapseEmptyDivs: function(collapse) { return pubadsStub.collapseEmptyDivs(collapse); },

      // Privacy
      setPrivacySettings: function(settings) { return this; },
      getPrivacySettings: function() { return {}; },

      // Version
      getVersion: function() { return 'neutralized'; },

      // Companion ads
      companionAds: function() { return companionAdsStub; },

      // Size mapping
      sizeMapping: function() {
        return {
          addSize: function() { return this; },
          build: function() { return []; }
        };
      }
    };

    // Define googletag with Proxy for complete interception
    Object.defineProperty(this.context, 'googletag', {
      configurable: true,
      enumerable: true,
      get: () => new Proxy(this.originalObjects.get('window.googletag') || {}, {
        get: (target, prop) => {
          const interceptedProps = [
            'pubads', 'defineSlot', 'defineOutOfPageSlot', 'enableServices',
            'display', 'cmd', 'companionAds', 'setTargeting', 'getTargeting',
            'clearTargeting', 'addCategoryExclusion', 'clearCategoryExclusions',
            'enableSyncRendering', 'disableInitialLoad', 'enableSingleRequest',
            'collapseEmptyDivs', 'sizeMapping', 'getVersion', 'setPrivacySettings',
            'getPrivacySettings', 'destroySlots', 'refresh', 'clear', 'requestNotification',
            'openConsole', 'disablePublisherConsole'
          ];

          if (interceptedProps.includes(prop)) {
            console.log('[IMANeutralizer] googletag.' + prop + ' accessed - returning stub');
            return googletagStub[prop];
          }
          return target[prop];
        },
        has: (target, prop) => {
          const interceptedProps = [
            'pubads', 'defineSlot', 'defineOutOfPageSlot', 'enableServices',
            'display', 'cmd', 'companionAds', 'setTargeting', 'getTargeting',
            'clearTargeting', 'addCategoryExclusion', 'clearCategoryExclusions',
            'enableSyncRendering', 'disableInitialLoad', 'enableSingleRequest',
            'collapseEmptyDivs', 'sizeMapping', 'getVersion', 'setPrivacySettings',
            'getPrivacySettings', 'destroySlots', 'refresh', 'clear', 'requestNotification'
          ];
          return interceptedProps.includes(prop) || prop in target;
        },
        ownKeys: (target) => {
          const interceptedProps = [
            'pubads', 'defineSlot', 'defineOutOfPageSlot', 'enableServices',
            'display', 'cmd', 'companionAds', 'setTargeting', 'getTargeting',
            'clearTargeting', 'addCategoryExclusion', 'clearCategoryExclusions',
            'enableSyncRendering', 'disableInitialLoad', 'enableSingleRequest',
            'collapseEmptyDivs', 'sizeMapping', 'getVersion', 'setPrivacySettings',
            'getPrivacySettings', 'destroySlots', 'refresh', 'clear', 'requestNotification'
          ];
          return [...new Set([...Object.keys(target), ...interceptedProps])];
        },
        getOwnPropertyDescriptor: (target, prop) => {
          const interceptedProps = [
            'pubads', 'defineSlot', 'defineOutOfPageSlot', 'enableServices',
            'display', 'cmd', 'companionAds', 'setTargeting', 'getTargeting',
            'clearTargeting', 'addCategoryExclusion', 'clearCategoryExclusions',
            'enableSyncRendering', 'disableInitialLoad', 'enableSingleRequest',
            'collapseEmptyDivs', 'sizeMapping', 'getVersion', 'setPrivacySettings',
            'getPrivacySettings', 'destroySlots', 'refresh', 'clear', 'requestNotification'
          ];
          if (interceptedProps.includes(prop)) {
            return { configurable: true, enumerable: true, value: googletagStub[prop], writable: false };
          }
          return Object.getOwnPropertyDescriptor(target, prop);
        }
      }),
      set: (v) => { this.originalObjects.set('window.googletag', v); return true; }
    });

    // Also ensure window.googletag exists
    if (!this.context.googletag) {
      this.context.googletag = googletagStub;
    }
  }

  _stubIMAEvents() {
    // Additional event type constants that might be checked
    const eventTypes = [
      'LOADED', 'STARTED', 'COMPLETE', 'PAUSED', 'RESUMED', 'SKIPPED',
      'VOLUME_CHANGED', 'ALL_ADS_COMPLETED', 'CLICK', 'LOG', 'ERROR',
      'AD_BREAK_READY', 'CONTENT_PAUSE_REQUESTED', 'CONTENT_RESUME_REQUESTED',
      'LOADED_METADATA', 'AD_PROGRESS', 'CUE_POINTS_CHANGED',
      'ICON_FALLBACK_IMAGE_CLOSED', 'INTERACTION', 'LINEAR_CHANGED',
      'SKIPPABLE_STATE_CHANGED', 'AD_BUFFERING', 'IMPRESSION',
      'VIDEO_CLICKED', 'VIDEO_ICON_CLICKED', 'VIDEO_STARTED',
      'CARD_SHOWN', 'CARD_DISMISSED', 'THIRD_QUARTILE', 'MIDPOINT', 'FIRST_QUARTILE'
    ];

    // Ensure google.ima.AdEvent.Type has all event types
    if (this.context.google && this.context.google.ima) {
      const adEventType = this.context.google.ima.AdEvent.Type;
      eventTypes.forEach(type => {
        if (!adEventType[type]) {
          adEventType[type] = type.toLowerCase().replace(/_/g, '');
        }
      });
    }
  }

  _blockIMARequests() {
    const originalFetch = this.context.fetch;
    this.originalObjects.set('fetch', originalFetch);

    this.context.fetch = async function(...args) {
      const url = args[0];
      if (typeof url === 'string') {
        const urlLower = url.toLowerCase();
        if (urlLower.includes('imasdk') ||
            urlLower.includes('googleads') ||
            urlLower.includes('doubleclick.net/imasdk') ||
            urlLower.includes('pubads.g.doubleclick.net/imasdk') ||
            urlLower.includes('adservice.google.com/adsid') ||
            urlLower.includes('googleads.g.doubleclick.net/pagead/ads') ||
            urlLower.includes('pagead2.googlesyndication.com/pagead/ads') ||
            urlLower.includes('imasdk.googleapis.com') ||
            urlLower.includes('imasdk.s3.amazonaws.com') ||
            urlLower.includes('gstatic.com/imasdk') ||
            urlLower.includes('cdn.jsdelivr.net/npm/google-ima')) {
          console.log('[IMANeutralizer] Blocked IMA request:', url);
          return new Response('', { status: 204, statusText: 'No Content' });
        }
      }
      return this.originalObjects.get('fetch').apply(this, args);
    }.bind(this);

    // Also block XMLHttpRequest
    const originalXHR = this.context.XMLHttpRequest;
    if (originalXHR) {
      this.originalObjects.set('XMLHttpRequest', originalXHR);

      this.context.XMLHttpRequest = function() {
        const xhr = new originalXHR();
        const originalOpen = xhr.open;
        xhr.open = function(method, url) {
          if (typeof url === 'string') {
            const urlLower = url.toLowerCase();
            if (urlLower.includes('imasdk') ||
                urlLower.includes('googleads') ||
                urlLower.includes('doubleclick.net/imasdk') ||
                urlLower.includes('pubads.g.doubleclick.net/imasdk') ||
                urlLower.includes('googleads.g.doubleclick.net/pagead/ads') ||
                urlLower.includes('pagead2.googlesyndication.com/pagead/ads') ||
                urlLower.includes('imasdk.googleapis.com') ||
                urlLower.includes('imasdk.s3.amazonaws.com')) {
              console.log('[IMANeutralizer] Blocked IMA XHR:', url);
              // Make it a no-op request
              this._blocked = true;
              url = 'about:blank';
            }
          }
          return originalOpen.apply(this, arguments);
        };
        const originalSend = xhr.send;
        xhr.send = function() {
          if (this._blocked) {
            // Simulate empty response
            setTimeout(() => {
              this.readyState = 4;
              this.status = 204;
              this.statusText = 'No Content';
              this.responseText = '';
              this.response = '';
              if (this.onload) this.onload({ target: this });
              if (this.onreadystatechange) this.onreadystatechange({ target: this });
            }, 0);
            return;
          }
          return originalSend.apply(this, arguments);
        };
        return xhr;
      };
      this.context.XMLHttpRequest.prototype = originalXHR.prototype;
    }
  }

  /**
   * Check if IMA is neutralized
   */
  isNeutralized() {
    return this.isActive;
  }

  /**
   * Get neutralization status
   */
  getStatus() {
    return {
      active: this.isActive,
      stubbedNamespaces: ['google.ima', 'googletag', 'googletag.pubads', 'googletag.cmd'],
      blockedScripts: ['imasdk.googleapis.com', 'imasdk.s3.amazonaws.com', 'gstatic.com/imasdk', 'cdn.jsdelivr.net/npm/google-ima'],
      stubbedClasses: [
        'AdDisplayContainer', 'AdsLoader', 'AdsRequest', 'AdsManager',
        'AdError', 'AdEvent', 'AdsRenderingSettings', 'Settings',
        'StreamManager', 'StreamRequest', 'CompanionAdSlot',
        'Ad', 'LinearAd', 'NonLinearAd', 'CompanionAd', 'AdPodInfo'
      ],
      stubbedMethods: [
        'google.ima.*', 'googletag.*', 'googletag.pubads.*', 'googletag.cmd.*'
      ]
    };
  }

  /**
   * Restore original objects
   */
  restore() {
    for (const [key, original] of this.originalObjects) {
      if (key === 'document.createElement') {
        this.context.document.createElement = original;
      } else if (key === 'fetch') {
        this.context.fetch = original;
      } else if (key === 'XMLHttpRequest') {
        this.context.XMLHttpRequest = original;
      } else if (key.startsWith('window.')) {
        const prop = key.substring(7);
        Object.defineProperty(this.context, prop, {
          value: original,
          writable: true,
          configurable: true
        });
      }
    }

    this.isActive = false;
    this.originalObjects.clear();
    this.stubs.clear();
    this.eventListeners.clear();
    console.log('[IMANeutralizer] Restored original objects');
  }
}

// ============================================================================
// Singleton
// ============================================================================

let imaNeutralizerInstance = null;

export function getIMANeutralizer(context = window) {
  if (!imaNeutralizerInstance) {
    imaNeutralizerInstance = new IMANeutralizer(context);
  }
  return imaNeutralizerInstance;
}

export function resetIMANeutralizer() {
  if (imaNeutralizerInstance) {
    imaNeutralizerInstance.restore();
  }
  imaNeutralizerInstance = null;
}