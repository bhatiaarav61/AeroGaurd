/**
 * YouTube Player Patcher — ytInitialData, playerResponse, config surgery
 * Surgical JSON transforms to remove ads from player responses
 */

export class YouTubePlayerPatcher {
  constructor(context = window) {
    this.context = context;
    this.transforms = [];
    this.isActive = false;
    this.stats = { patched: 0, errors: 0 };
    this.experimentDetector = null; // Set by coordinator

    // Default transforms
    this._addDefaultTransforms();
  }

  _addDefaultTransforms() {
    // 1. Remove ad signals from playabilityStatus
    this.addTransform((data) => {
      if (data?.playabilityStatus) {
        delete data.playabilityStatus.adSignalsInfo;
        delete data.playabilityStatus.adsPresentation;
        delete data.playabilityStatus.adPlacements;
        delete data.playabilityStatus.adBreaks;
        data.playabilityStatus.status = data.playabilityStatus.status || 'OK';
      }
    });

    // 2. Remove ad config from playerConfig
    this.addTransform((data) => {
      if (data?.playerConfig) {
        delete data.playerConfig.adConfig;
        delete data.playerConfig.adPlacements;
        delete data.playerConfig.adBreakConfig;
        delete data.playerConfig.adTagUrl;
      }
    });

    // 3. Remove ad info from videoDetails
    this.addTransform((data) => {
      if (data?.videoDetails) {
        delete data.videoDetails.allowAds;
        delete data.videoDetails.adTagUrl;
        delete data.videoDetails.adTagUrlSet;
        delete data.videoDetails.playerAdConfig;
        delete data.videoDetails.adBreakSlots;
        delete data.videoDetails.adSlots;
        delete data.videoDetails.ppvTrackingUrl;
      }
    });

    // 4. Filter adaptive formats - keep only real media
    this.addTransform((data) => {
      if (data?.streamingData?.adaptiveFormats) {
        data.streamingData.adaptiveFormats = data.streamingData.adaptiveFormats
          .filter(f => this._isRealMediaFormat(f))
          .map(f => this._stripAdMetadata(f));
      }
    });

    // 5. Remove ad formats
    this.addTransform((data) => {
      if (data?.streamingData) {
        delete data.streamingData.adFormats;
      }
    });

    // 6. Strip ad periods from DASH manifest
    this.addTransform((data) => {
      if (data?.streamingData?.dashManifest) {
        data.streamingData.dashManifest = this._stripAdPeriods(data.streamingData.dashManifest);
      }
    });

    // 7. Strip ad segments from HLS manifest
    this.addTransform((data) => {
      if (data?.streamingData?.hlsManifest) {
        data.streamingData.hlsManifest = this._stripAdSegments(data.streamingData.hlsManifest);
      }
    });

    // 8. Remove ad-related player response fields
    this.addTransform((data) => {
      if (data?.playerResponse) {
        this.addTransform(data.playerResponse);
      }
    });

    // 9. Remove ad break info from streaming data
    this.addTransform((data) => {
      if (data?.streamingData) {
        delete data.streamingData.adBreakConfig;
        delete data.streamingData.adSlots;
        delete data.streamingData.adBreakSlots;
      }
    });
  }

  _isRealMediaFormat(format) {
    const url = format.url || '';
    const mime = format.mimeType || '';
    const codecs = format.codecs || '';

    // Block manifest/playlist URLs
    if (url.includes('/api/manifest/') || url.includes('/manifest/')) return false;
    if (url.includes('adformat=') || url.includes('ad_type=')) return false;

    // Block ad MIME types
    if (mime.includes('application/vnd.apple.mpegurl') && url.includes('ad')) return false;
    if (mime.includes('application/dash+xml') && url.includes('ad')) return false;

    // Block ad codecs
    if (codecs.includes('ad')) return false;

    return true;
  }

  _stripAdMetadata(format) {
    const clean = { ...format };
    delete clean.adMetadata;
    delete clean.adBreakId;
    delete clean.adTagUrl;
    delete clean.adSlotId;
    return clean;
  }

  _stripAdPeriods(dashManifest) {
    if (!dashManifest) return dashManifest;
    // Remove Period elements with ad content
    return dashManifest.replace(/<Period[^>]*ad[^>]*>[\s\S]*?<\/Period>/gi, '');
  }

  _stripAdSegments(hlsManifest) {
    if (!hlsManifest) return hlsManifest;
    // Remove EXT-X-DATERANGE with ad markers and associated segments
    return hlsManifest
      .split('\n')
      .filter(line => !line.includes('EXT-X-DATERANGE') || !line.toLowerCase().includes('ad'))
      .join('\n');
  }

  /**
   * Add custom transform
   */
  addTransform(fn) {
    this.transforms.push(fn);
  }

  /**
   * Remove transform
   */
  removeTransform(fn) {
    const index = this.transforms.indexOf(fn);
    if (index !== -1) this.transforms.splice(index, 1);
  }

  /**
   * Set experiment detector for rapid response integration
   */
  setExperimentDetector(detector) {
    this.experimentDetector = detector;
  }

  /**
   * Patch player response data
   */
  async patchPlayerResponse(data) {
    if (!this.isActive || !data || typeof data !== 'object') return data;

    try {
      // Deep clone to avoid mutating original
      const patched = JSON.parse(JSON.stringify(data));

      // Apply all transforms
      for (const transform of this.transforms) {
        transform(patched);
      }

      // Check for experiments in patched response (rapid response)
      if (this.experimentDetector) {
        this.experimentDetector.checkPlayerResponse(patched);
      }

      this.stats.patched++;
      return patched;
    } catch (error) {
      this.stats.errors++;
      console.error('[YouTubePlayerPatcher] Transform error:', error);
      return data;
    }
  }

  /**
   * Patch ytInitialData
   */
  patchYtInitialData(data) {
    if (!data || typeof data !== 'object') return;

    const adRendererPatterns = [
      /ad/i, /promo/i, /sponsor/i, /shopping/i, /mealbar/i, /merch/i,
      /masthead/i, /companion/i, /sparkles/i, /banner/i, /overlay/i
    ];

    function isAdRenderer(key) {
      return adRendererPatterns.some(p => p.test(key));
    }

    function processNode(node) {
      if (!node || typeof node !== 'object') return;

      // Handle renderer objects
      if (node.renderer && typeof node.renderer === 'object') {
        const rendererKeys = Object.keys(node.renderer);
        const adKeys = rendererKeys.filter(k => isAdRenderer(k));
        adKeys.forEach(k => {
          console.log('[YouTubePlayerPatcher] Removed ad renderer:', k);
          delete node.renderer[k];
        });
      }

      // Recurse into arrays and objects
      for (const k of Object.keys(node)) {
        const val = node[k];
        if (Array.isArray(val)) {
          // Filter array items with ad renderers
          const filtered = val.filter(item => {
            if (item?.renderer) {
              const rk = Object.keys(item.renderer);
              return !rk.some(rk2 => isAdRenderer(rk2));
            }
            return true;
          });
          if (filtered.length !== val.length) {
            console.log('[YouTubePlayerPatcher] Filtered', val.length - filtered.length, 'ad items from array:', k);
            node[k] = filtered;
          }
          filtered.forEach(item => processNode(item));
        } else if (val && typeof val === 'object') {
          processNode(val);
        }
      }
    }

    processNode(data);
  }

  /**
   * Install fetch interceptor for player responses
   */
  installFetchInterceptor() {
    const originalFetch = this.context.fetch;
    this.originalFetch = originalFetch;

    this.context.fetch = async (...args) => {
      const url = args[0];
      const response = await originalFetch.apply(this.context, args);

      if (typeof url === 'string' && (url.includes('/youtubei/v1/player') || url.includes('/player?') || url.includes('/player/') || url.includes('get_video_info'))) {
        const clone = response.clone();
        try {
          const data = await clone.json();
          if (data) {
            const patched = await this.patchPlayerResponse(data);
            return new Response(JSON.stringify(patched), {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers
            });
          }
        } catch (e) {
          // Not JSON, return original
        }
      }

      return response;
    };
  }

  /**
   * Install ytInitialData proxy
   */
  installYtInitialDataProxy() {
    if (this.context.ytInitialData) {
      this.patchYtInitialData(this.context.ytInitialData);
    }

    let internalData = this.context.ytInitialData;
    Object.defineProperty(this.context, 'ytInitialData', {
      configurable: true,
      get: () => internalData,
      set: (v) => {
        internalData = v;
        if (v) this.patchYtInitialData(v);
      }
    });
  }

  getStats() {
    return { ...this.stats };
  }

  activate() {
    this.isActive = true;
  }

  deactivate() {
    this.isActive = false;
  }

  cleanup() {
    if (this.originalFetch) {
      this.context.fetch = this.originalFetch;
    }
    this.transforms = [];
    this.stats = { patched: 0, errors: 0 };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let playerPatcherInstance = null;

export function getPlayerPatcher(context = window) {
  if (!playerPatcherInstance) {
    playerPatcherInstance = new YouTubePlayerPatcher(context);
  }
  return playerPatcherInstance;
}

export function resetPlayerPatcher() {
  if (playerPatcherInstance) {
    playerPatcherInstance.cleanup();
  }
  playerPatcherInstance = null;
}