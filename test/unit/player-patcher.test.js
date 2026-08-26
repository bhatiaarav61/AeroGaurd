/**
 * Comprehensive Test Suite for YouTube Player Patcher
 * Tests ytInitialData, playerResponse, config surgery, surgical JSON transforms
 */

import { YouTubePlayerPatcher, getPlayerPatcher, resetPlayerPatcher } from '../../core/youtube-engine/player-patcher.js';

// Test utilities
const createMockPlayerResponse = (overrides = {}) => ({
  playabilityStatus: {
    status: 'OK',
    adSignalsInfo: { test: 'ad-signals' },
    adsPresentation: { test: 'ads-presentation' },
    adPlacements: [{ test: 'ad-placement' }],
    adBreaks: [{ test: 'ad-break' }],
    ...overrides.playabilityStatus
  },
  playerConfig: {
    adConfig: { test: 'ad-config' },
    adPlacements: [{ test: 'ad-placement' }],
    adBreakConfig: { test: 'ad-break-config' },
    adTagUrl: 'https://example.com/adtag',
    ...overrides.playerConfig
  },
  videoDetails: {
    videoId: 'test123',
    title: 'Test Video',
    allowAds: true,
    adTagUrl: 'https://example.com/adtag',
    adTagUrlSet: true,
    playerAdConfig: { test: 'player-ad-config' },
    adBreakSlots: [{ test: 'ad-break-slot' }],
    adSlots: [{ test: 'ad-slot' }],
    ppvTrackingUrl: 'https://example.com/ppv',
    ...overrides.videoDetails
  },
  streamingData: {
    adaptiveFormats: [
      { url: 'https://googlevideo.com/videoplayback?itag=137', mimeType: 'video/mp4', codecs: 'avc1.640028', qualityLabel: '1080p' },
      { url: 'https://googlevideo.com/videoplayback?itag=248', mimeType: 'video/webm', codecs: 'vp9', qualityLabel: '1080p' },
      { url: 'https://example.com/api/manifest/ad', mimeType: 'application/dash+xml', codecs: 'ad', adMetadata: { test: 'ad-meta' } },
      { url: 'https://example.com/manifest/ad', mimeType: 'application/vnd.apple.mpegurl', codecs: 'avc1', adMetadata: { test: 'ad-meta-hls' } },
      { url: 'https://googlevideo.com/videoplayback?itag=140', mimeType: 'audio/mp4', codecs: 'mp4a.40.2', adBreakId: 'ad-break-1' }
    ],
    dashManifest: '<MPD><Period id="1"><AdaptationSet/></Period><Period id="ad"><AdaptationSet/><AdSource/></Period></MPD>',
    hlsManifest: '#EXTM3U\n#EXT-X-DATERANGE:ID="ad1",CLASS="ad"\n#EXTINF:10,\nsegment1.ts\n#EXTINF:10,\nsegment2.ts\n',
    adFormats: [{ test: 'ad-format' }],
    adBreakConfig: { test: 'ad-break-config' },
    adSlots: [{ test: 'ad-slot' }],
    adBreakSlots: [{ test: 'ad-break-slot' }],
    ...overrides.streamingData
  },
  playerResponse: {
    playabilityStatus: { status: 'OK', adSignalsInfo: { nested: true } },
    ...overrides.playerResponse
  },
  ...overrides
});

const createMockYtInitialData = () => ({
  contents: {
    twoColumnWatchNextResults: {
      results: {
        results: {
          contents: [
            { videoRenderer: { videoId: 'test123' } },
            { adSlotRenderer: { adSlotId: 'ad-1' } },
            { promotedVideoRenderer: { videoId: 'promo1' } },
            { bannerAdRenderer: { adUrl: 'https://ad.com' } },
            { videoRenderer: { videoId: 'test456' } }
          ]
        }
      }
    }
  },
  sidebar: {
    playlistSidebarRenderer: {
      items: [
        { videoRenderer: { videoId: 'next1' } },
        { adRenderer: { adId: 'ad-2' } },
        { videoRenderer: { videoId: 'next2' } }
      ]
    }
  },
  responseContext: {
    serviceTrackingParams: [{ service: 'youtube', params: [] }]
  }
});

describe('YouTubePlayerPatcher', () => {
  let patcher;
  let mockContext;

  beforeEach(() => {
    mockContext = {
      fetch: jest.fn(),
      ytInitialData: null,
      console: { log: jest.fn(), error: jest.fn(), warn: jest.fn() }
    };
    global.console = mockContext.console;
    patcher = new YouTubePlayerPatcher(mockContext);
  });

  afterEach(() => {
    patcher.cleanup();
    resetPlayerPatcher();
    jest.clearAllMocks();
  });

  // ==================== Constructor Tests ====================

  describe('Constructor', () => {
    test('should initialize with default context', () => {
      const defaultPatcher = new YouTubePlayerPatcher();
      expect(defaultPatcher.context).toBe(window);
      expect(defaultPatcher.isActive).toBe(false);
      expect(defaultPatcher.stats).toEqual({ patched: 0, errors: 0 });
      expect(defaultPatcher.transforms).toBeInstanceOf(Array);
      expect(defaultPatcher.transforms.length).toBeGreaterThan(0);
    });

    test('should initialize with custom context', () => {
      expect(patcher.context).toBe(mockContext);
      expect(patcher.isActive).toBe(false);
      expect(patcher.stats).toEqual({ patched: 0, errors: 0 });
    });

    test('should have default transforms registered', () => {
      expect(patcher.transforms.length).toBe(9); // 9 default transforms
    });
  });

  // ==================== Default Transforms Tests ====================

  describe('Default Transforms - playabilityStatus', () => {
    test('should remove adSignalsInfo from playabilityStatus', async () => {
      const data = createMockPlayerResponse();
      const patched = await patcher.patchPlayerResponse(data);
      expect(patched.playabilityStatus.adSignalsInfo).toBeUndefined();
    });

    test('should remove adsPresentation from playabilityStatus', async () => {
      const data = createMockPlayerResponse();
      const patched = await patcher.patchPlayerResponse(data);
      expect(patched.playabilityStatus.adsPresentation).toBeUndefined();
    });

    test('should remove adPlacements from playabilityStatus', async () => {
      const data = createMockPlayerResponse();
      const patched = await patcher.patchPlayerResponse(data);
      expect(patched.playabilityStatus.adPlacements).toBeUndefined();
    });

    test('should remove adBreaks from playabilityStatus', async () => {
      const data = createMockPlayerResponse();
      const patched = await patcher.patchPlayerResponse(data);
      expect(patched.playabilityStatus.adBreaks).toBeUndefined();
    });

    test('should ensure status is OK', async () => {
      const data = createMockPlayerResponse({
        playabilityStatus: { status: 'ERROR', adSignalsInfo: {} }
      });
      const patched = await patcher.patchPlayerResponse(data);
      expect(patched.playabilityStatus.status).toBe('OK');
    });

    test('should not mutate original data', async () => {
      const data = createMockPlayerResponse();
      const originalAdSignals = data.playabilityStatus.adSignalsInfo;
      await patcher.patchPlayerResponse(data);
      expect(data.playabilityStatus.adSignalsInfo).toBe(originalAdSignals);
    });
  });

  describe('Default Transforms - playerConfig', () => {
    test('should remove adConfig from playerConfig', async () => {
      const data = createMockPlayerResponse();
      const patched = await patcher.patchPlayerResponse(data);
      expect(patched.playerConfig.adConfig).toBeUndefined();
    });

    test('should remove adPlacements from playerConfig', async () => {
      const data = createMockPlayerResponse();
      const patched = await patcher.patchPlayerResponse(data);
      expect(patched.playerConfig.adPlacements).toBeUndefined();
    });

    test('should remove adBreakConfig from playerConfig', async () => {
      const data = createMockPlayerResponse();
      const patched = await patcher.patchPlayerResponse(data);
      expect(patched.playerConfig.adBreakConfig).toBeUndefined();
    });

    test('should remove adTagUrl from playerConfig', async () => {
      const data = createMockPlayerResponse();
      const patched = await patcher.patchPlayerResponse(data);
      expect(patched.playerConfig.adTagUrl).toBeUndefined();
    });
  });

  describe('Default Transforms - videoDetails', () => {
    test('should remove allowAds from videoDetails', async () => {
      const data = createMockPlayerResponse();
      const patched = await patcher.patchPlayerResponse(data);
      expect(patched.videoDetails.allowAds).toBeUndefined();
    });

    test('should remove adTagUrl from videoDetails', async () => {
      const data = createMockPlayerResponse();
      const patched = await patcher.patchPlayerResponse(data);
      expect(patched.videoDetails.adTagUrl).toBeUndefined();
    });

    test('should remove adTagUrlSet from videoDetails', async () => {
      const data = createMockPlayerResponse();
      const patched = await patcher.patchPlayerResponse(data);
      expect(patched.videoDetails.adTagUrlSet).toBeUndefined();
    });

    test('should remove playerAdConfig from videoDetails', async () => {
      const data = createMockPlayerResponse();
      const patched = await patcher.patchPlayerResponse(data);
      expect(patched.videoDetails.playerAdConfig).toBeUndefined();
    });

    test('should remove adBreakSlots from videoDetails', async () => {
      const data = createMockPlayerResponse();
      const patched = await patcher.patchPlayerResponse(data);
      expect(patched.videoDetails.adBreakSlots).toBeUndefined();
    });

    test('should remove adSlots from videoDetails', async () => {
      const data = createMockPlayerResponse();
      const patched = await patcher.patchPlayerResponse(data);
      expect(patched.videoDetails.adSlots).toBeUndefined();
    });

    test('should remove ppvTrackingUrl from videoDetails', async () => {
      const data = createMockPlayerResponse();
      const patched = await patcher.patchPlayerResponse(data);
      expect(patched.videoDetails.ppvTrackingUrl).toBeUndefined();
    });

    test('should preserve videoId and title', async () => {
      const data = createMockPlayerResponse();
      const patched = await patcher.patchPlayerResponse(data);
      expect(patched.videoDetails.videoId).toBe('test123');
      expect(patched.videoDetails.title).toBe('Test Video');
    });
  });

  describe('Default Transforms - streamingData adaptiveFormats', () => {
    test('should filter out ad manifest URLs', async () => {
      const data = createMockPlayerResponse();
      const patched = await patcher.patchPlayerResponse(data);

      const urls = patched.streamingData.adaptiveFormats.map(f => f.url);
      expect(urls).not.toContain('https://example.com/api/manifest/ad');
      expect(urls).not.toContain('https://example.com/manifest/ad');
    });

    test('should filter out ad MIME types', async () => {
      const data = createMockPlayerResponse();
      const patched = await patcher.patchPlayerResponse(data);

      const mimeTypes = patched.streamingData.adaptiveFormats.map(f => f.mimeType);
      expect(mimeTypes).not.toContain('application/dash+xml');
      expect(mimeTypes).not.toContain('application/vnd.apple.mpegurl');
    });

    test('should filter out ad codecs', async () => {
      const data = createMockPlayerResponse();
      const patched = await patcher.patchPlayerResponse(data);

      const codecs = patched.streamingData.adaptiveFormats.map(f => f.codecs);
      expect(codecs).not.toContain('ad');
    });

    test('should keep real video formats', async () => {
      const data = createMockPlayerResponse();
      const patched = await patcher.patchPlayerResponse(data);

      const urls = patched.streamingData.adaptiveFormats.map(f => f.url);
      expect(urls).toContain('https://googlevideo.com/videoplayback?itag=137');
      expect(urls).toContain('https://googlevideo.com/videoplayback?itag=248');
      expect(urls).toContain('https://googlevideo.com/videoplayback?itag=140');
    });

    test('should strip ad metadata from remaining formats', async () => {
      const data = createMockPlayerResponse();
      const patched = await patcher.patchPlayerResponse(data);

      for (const format of patched.streamingData.adaptiveFormats) {
        expect(format.adMetadata).toBeUndefined();
        expect(format.adBreakId).toBeUndefined();
        expect(format.adTagUrl).toBeUndefined();
        expect(format.adSlotId).toBeUndefined();
      }
    });
  });

  describe('Default Transforms - streamingData adFormats', () => {
    test('should remove adFormats from streamingData', async () => {
      const data = createMockPlayerResponse();
      const patched = await patcher.patchPlayerResponse(data);
      expect(patched.streamingData.adFormats).toBeUndefined();
    });
  });

  describe('Default Transforms - DASH manifest', () => {
    test('should strip ad Period elements from DASH manifest', async () => {
      const data = createMockPlayerResponse();
      const patched = await patcher.patchPlayerResponse(data);

      expect(patched.streamingData.dashManifest).not.toContain('<Period id="ad"');
      expect(patched.streamingData.dashManifest).not.toContain('<AdSource/>');
      expect(patched.streamingData.dashManifest).toContain('<Period id="1"');
    });

    test('should handle empty DASH manifest', async () => {
      const data = createMockPlayerResponse({ streamingData: { dashManifest: '' } });
      const patched = await patcher.patchPlayerResponse(data);
      expect(patched.streamingData.dashManifest).toBe('');
    });

    test('should handle null DASH manifest', async () => {
      const data = createMockPlayerResponse({ streamingData: { dashManifest: null } });
      const patched = await patcher.patchPlayerResponse(data);
      expect(patched.streamingData.dashManifest).toBeNull();
    });
  });

  describe('Default Transforms - HLS manifest', () => {
    test('should strip EXT-X-DATERANGE with ad markers', async () => {
      const data = createMockPlayerResponse();
      const patched = await patcher.patchPlayerResponse(data);

      expect(patched.streamingData.hlsManifest).not.toContain('EXT-X-DATERANGE');
      expect(patched.streamingData.hlsManifest).not.toContain('CLASS="ad"');
    });

    test('should keep non-ad segments', async () => {
      const data = createMockPlayerResponse();
      const patched = await patcher.patchPlayerResponse(data);

      expect(patched.streamingData.hlsManifest).toContain('segment1.ts');
      expect(patched.streamingData.hlsManifest).toContain('segment2.ts');
    });

    test('should handle empty HLS manifest', async () => {
      const data = createMockPlayerResponse({ streamingData: { hlsManifest: '' } });
      const patched = await patcher.patchPlayerResponse(data);
      expect(patched.streamingData.hlsManifest).toBe('');
    });
  });

  describe('Default Transforms - nested playerResponse', () => {
    test('should recursively patch nested playerResponse', async () => {
      const data = createMockPlayerResponse();
      const patched = await patcher.patchPlayerResponse(data);

      expect(patched.playerResponse.playabilityStatus.adSignalsInfo).toBeUndefined();
    });
  });

  describe('Default Transforms - streamingData ad break fields', () => {
    test('should remove adBreakConfig from streamingData', async () => {
      const data = createMockPlayerResponse();
      const patched = await patcher.patchPlayerResponse(data);
      expect(patched.streamingData.adBreakConfig).toBeUndefined();
    });

    test('should remove adSlots from streamingData', async () => {
      const data = createMockPlayerResponse();
      const patched = await patcher.patchPlayerResponse(data);
      expect(patched.streamingData.adSlots).toBeUndefined();
    });

    test('should remove adBreakSlots from streamingData', async () => {
      const data = createMockPlayerResponse();
      const patched = await patcher.patchPlayerResponse(data);
      expect(patched.streamingData.adBreakSlots).toBeUndefined();
    });
  });

  // ==================== Helper Methods Tests ====================

  describe('_isRealMediaFormat', () => {
    test('should return true for real video formats', () => {
      const format = { url: 'https://googlevideo.com/videoplayback?itag=137', mimeType: 'video/mp4', codecs: 'avc1.640028' };
      expect(patcher._isRealMediaFormat(format)).toBe(true);
    });

    test('should return true for real audio formats', () => {
      const format = { url: 'https://googlevideo.com/videoplayback?itag=140', mimeType: 'audio/mp4', codecs: 'mp4a.40.2' };
      expect(patcher._isRealMediaFormat(format)).toBe(true);
    });

    test('should return false for /api/manifest/ URLs', () => {
      const format = { url: 'https://example.com/api/manifest/ad', mimeType: 'application/dash+xml', codecs: 'vp9' };
      expect(patcher._isRealMediaFormat(format)).toBe(false);
    });

    test('should return false for /manifest/ URLs', () => {
      const format = { url: 'https://example.com/manifest/ad', mimeType: 'application/vnd.apple.mpegurl', codecs: 'avc1' };
      expect(patcher._isRealMediaFormat(format)).toBe(false);
    });

    test('should return false for adformat= URLs', () => {
      const format = { url: 'https://example.com/video?adformat=1', mimeType: 'video/mp4', codecs: 'avc1' };
      expect(patcher._isRealMediaFormat(format)).toBe(false);
    });

    test('should return false for ad_type= URLs', () => {
      const format = { url: 'https://example.com/video?ad_type=video', mimeType: 'video/mp4', codecs: 'avc1' };
      expect(patcher._isRealMediaFormat(format)).toBe(false);
    });

    test('should return false for ad MIME types with ad in URL', () => {
      const format = { url: 'https://example.com/ad/stream.m3u8', mimeType: 'application/vnd.apple.mpegurl', codecs: 'avc1' };
      expect(patcher._isRealMediaFormat(format)).toBe(false);
    });

    test('should return false for ad codecs', () => {
      const format = { url: 'https://example.com/video', mimeType: 'video/mp4', codecs: 'ad' };
      expect(patcher._isRealMediaFormat(format)).toBe(false);
    });
  });

  describe('_stripAdMetadata', () => {
    test('should remove adMetadata', () => {
      const format = { url: 'https://example.com/video', adMetadata: { test: 'meta' }, qualityLabel: '1080p' };
      const stripped = patcher._stripAdMetadata(format);
      expect(stripped.adMetadata).toBeUndefined();
      expect(stripped.qualityLabel).toBe('1080p');
    });

    test('should remove adBreakId', () => {
      const format = { url: 'https://example.com/video', adBreakId: 'break-1', qualityLabel: '1080p' };
      const stripped = patcher._stripAdMetadata(format);
      expect(stripped.adBreakId).toBeUndefined();
    });

    test('should remove adTagUrl', () => {
      const format = { url: 'https://example.com/video', adTagUrl: 'https://ad.com', qualityLabel: '1080p' };
      const stripped = patcher._stripAdMetadata(format);
      expect(stripped.adTagUrl).toBeUndefined();
    });

    test('should remove adSlotId', () => {
      const format = { url: 'https://example.com/video', adSlotId: 'slot-1', qualityLabel: '1080p' };
      const stripped = patcher._stripAdMetadata(format);
      expect(stripped.adSlotId).toBeUndefined();
    });

    test('should not mutate original', () => {
      const format = { url: 'https://example.com/video', adMetadata: { test: 'meta' } };
      const original = { ...format };
      patcher._stripAdMetadata(format);
      expect(format.adMetadata).toEqual(original.adMetadata);
    });
  });

  describe('_stripAdPeriods', () => {
    test('should remove Period elements with ad content', () => {
      const manifest = '<MPD><Period id="1"><AdaptationSet/></Period><Period id="ad"><AdaptationSet/><AdSource/></Period></MPD>';
      const stripped = patcher._stripAdPeriods(manifest);
      expect(stripped).not.toContain('<Period id="ad"');
      expect(stripped).not.toContain('<AdSource/>');
      expect(stripped).toContain('<Period id="1"');
    });

    test('should handle case insensitive ad', () => {
      const manifest = '<MPD><Period id="AD"><AdaptationSet/></Period><Period id="Ad"><AdaptationSet/></Period></MPD>';
      const stripped = patcher._stripAdPeriods(manifest);
      expect(stripped).not.toContain('<Period id="AD"');
      expect(stripped).not.toContain('<Period id="Ad"');
    });

    test('should handle empty manifest', () => {
      expect(patcher._stripAdPeriods('')).toBe('');
      expect(patcher._stripAdPeriods(null)).toBeNull();
    });
  });

  describe('_stripAdSegments', () => {
    test('should remove EXT-X-DATERANGE lines with ad markers', () => {
      const manifest = '#EXTM3U\n#EXT-X-DATERANGE:ID="ad1",CLASS="ad"\n#EXTINF:10,\nsegment1.ts\n#EXTINF:10,\nsegment2.ts';
      const stripped = patcher._stripAdSegments(manifest);
      expect(stripped).not.toContain('EXT-X-DATERANGE');
      expect(stripped).not.toContain('CLASS="ad"');
      expect(stripped).toContain('segment1.ts');
      expect(stripped).toContain('segment2.ts');
    });

    test('should keep non-ad DATERANGE lines', () => {
      const manifest = '#EXTM3U\n#EXT-X-DATERANGE:ID="program",CLASS="program"\n#EXTINF:10,\nsegment1.ts';
      const stripped = patcher._stripAdSegments(manifest);
      expect(stripped).toContain('EXT-X-DATERANGE');
      expect(stripped).toContain('CLASS="program"');
    });

    test('should handle empty manifest', () => {
      expect(patcher._stripAdSegments('')).toBe('');
      expect(patcher._stripAdSegments(null)).toBeNull();
    });
  });

  // ==================== addTransform / removeTransform Tests ====================

  describe('addTransform / removeTransform', () => {
    test('should add custom transform', () => {
      const initialLength = patcher.transforms.length;
      const customTransform = jest.fn((data) => { data.custom = true; });
      patcher.addTransform(customTransform);
      expect(patcher.transforms.length).toBe(initialLength + 1);
      expect(patcher.transforms[patcher.transforms.length - 1]).toBe(customTransform);
    });

    test('should remove custom transform', () => {
      const customTransform = jest.fn((data) => { data.custom = true; });
      patcher.addTransform(customTransform);
      const lengthAfterAdd = patcher.transforms.length;
      patcher.removeTransform(customTransform);
      expect(patcher.transforms.length).toBe(lengthAfterAdd - 1);
      expect(patcher.transforms).not.toContain(customTransform);
    });

    test('should not error when removing non-existent transform', () => {
      const customTransform = jest.fn();
      expect(() => patcher.removeTransform(customTransform)).not.toThrow();
    });
  });

  // ==================== patchPlayerResponse Tests ====================

  describe('patchPlayerResponse', () => {
    test('should return original data when not active', async () => {
      patcher.deactivate();
      const data = createMockPlayerResponse();
      const result = await patcher.patchPlayerResponse(data);
      expect(result).toBe(data);
    });

    test('should return original data for null input', async () => {
      const result = await patcher.patchPlayerResponse(null);
      expect(result).toBeNull();
    });

    test('should return original data for non-object input', async () => {
      const result = await patcher.patchPlayerResponse('string');
      expect(result).toBe('string');
    });

    test('should apply all transforms and return patched data', async () => {
      const data = createMockPlayerResponse();
      const patched = await patcher.patchPlayerResponse(data);

      expect(patched.playabilityStatus.adSignalsInfo).toBeUndefined();
      expect(patched.videoDetails.allowAds).toBeUndefined();
      expect(patched.streamingData.adFormats).toBeUndefined();
    });

    test('should increment stats.patched on success', async () => {
      const data = createMockPlayerResponse();
      await patcher.patchPlayerResponse(data);
      expect(patcher.stats.patched).toBe(1);
    });

    test('should increment stats.errors on transform error', async () => {
      patcher.addTransform(() => { throw new Error('Transform error'); });
      const data = createMockPlayerResponse();
      const result = await patcher.patchPlayerResponse(data);
      expect(patcher.stats.errors).toBe(1);
      expect(result).toBe(data); // Returns original on error
    });

    test('should deep clone data to avoid mutation', async () => {
      const data = createMockPlayerResponse();
      const originalAdSignals = data.playabilityStatus.adSignalsInfo;
      await patcher.patchPlayerResponse(data);
      expect(data.playabilityStatus.adSignalsInfo).toBe(originalAdSignals);
    });
  });

  // ==================== patchYtInitialData Tests ====================

  describe('patchYtInitialData', () => {
    test('should return early for null input', () => {
      expect(() => patcher.patchYtInitialData(null)).not.toThrow();
      expect(() => patcher.patchYtInitialData(undefined)).not.toThrow();
    });

    test('should remove adSlotRenderer', () => {
      const data = createMockYtInitialData();
      patcher.patchYtInitialData(data);

      const contents = data.contents.twoColumnWatchNextResults.results.results.contents;
      const adSlots = contents.filter(c => c.adSlotRenderer);
      expect(adSlots.length).toBe(0);
    });

    test('should remove promotedVideoRenderer', () => {
      const data = createMockYtInitialData();
      patcher.patchYtInitialData(data);

      const contents = data.contents.twoColumnWatchNextResults.results.results.contents;
      const promoted = contents.filter(c => c.promotedVideoRenderer);
      expect(promoted.length).toBe(0);
    });

    test('should remove bannerAdRenderer', () => {
      const data = createMockYtInitialData();
      patcher.patchYtInitialData(data);

      const contents = data.contents.twoColumnWatchNextResults.results.results.contents;
      const banners = contents.filter(c => c.bannerAdRenderer);
      expect(banners.length).toBe(0);
    });

    test('should remove adRenderer from sidebar', () => {
      const data = createMockYtInitialData();
      patcher.patchYtInitialData(data);

      const items = data.sidebar.playlistSidebarRenderer.items;
      const ads = items.filter(c => c.adRenderer);
      expect(ads.length).toBe(0);
    });

    test('should keep videoRenderer items', () => {
      const data = createMockYtInitialData();
      patcher.patchYtInitialData(data);

      const contents = data.contents.twoColumnWatchNextResults.results.results.contents;
      const videos = contents.filter(c => c.videoRenderer);
      expect(videos.length).toBe(2);
      expect(videos[0].videoRenderer.videoId).toBe('test123');
      expect(videos[1].videoRenderer.videoId).toBe('test456');
    });

    test('should keep non-ad sidebar items', () => {
      const data = createMockYtInitialData();
      patcher.patchYtInitialData(data);

      const items = data.sidebar.playlistSidebarRenderer.items;
      const videos = items.filter(c => c.videoRenderer);
      expect(videos.length).toBe(2);
    });

    test('should handle deeply nested structures', () => {
      const data = {
        contents: {
          twoColumnWatchNextResults: {
            results: {
              results: {
                contents: [
                  { adSlotRenderer: { adSlotId: 'ad-1' } },
                  { videoRenderer: { videoId: 'test' } }
                ]
              }
            }
          }
        }
      };
      patcher.patchYtInitialData(data);
      expect(data.contents.twoColumnWatchNextResults.results.results.contents.length).toBe(1);
    });

    test('should handle arrays with mixed ad and non-ad items', () => {
      const data = {
        items: [
          { renderer: { videoRenderer: {} } },
          { renderer: { adSlotRenderer: {} } },
          { renderer: { videoRenderer: {} } }
        ]
      };
      patcher.patchYtInitialData(data);
      expect(data.items.length).toBe(2);
      expect(data.items[0].renderer.videoRenderer).toBeDefined();
      expect(data.items[1].renderer.videoRenderer).toBeDefined();
    });

    test('should detect ad renderer patterns', () => {
      const patterns = [
        'ad', 'promo', 'sponsor', 'shopping', 'mealbar', 'merch',
        'masthead', 'companion', 'sparkles', 'banner', 'overlay'
      ];

      for (const pattern of patterns) {
        const data = { items: [{ renderer: { [`${pattern}Renderer`]: {} } }] };
        patcher.patchYtInitialData(data);
        expect(data.items.length).toBe(0);
      }
    });
  });

  // ==================== installFetchInterceptor Tests ====================

  describe('installFetchInterceptor', () => {
    test('should install fetch interceptor', async () => {
      const mockResponse = {
        clone: jest.fn().mockReturnThis(),
        json: jest.fn().mockResolvedValue({ playabilityStatus: { status: 'OK' } }),
        status: 200,
        statusText: 'OK',
        headers: new Headers()
      };

      mockContext.fetch.mockResolvedValue(mockResponse);
      patcher.installFetchInterceptor();

      const response = await mockContext.fetch('https://youtube.com/youtubei/v1/player');
      expect(mockContext.fetch).toHaveBeenCalled();
      expect(response).toBeInstanceOf(Response);
    });

    test('should patch player response from youtubei/v1/player', async () => {
      const mockResponse = {
        clone: jest.fn().mockReturnThis(),
        json: jest.fn().mockResolvedValue(createMockPlayerResponse()),
        status: 200,
        statusText: 'OK',
        headers: new Headers()
      };

      mockContext.fetch.mockResolvedValue(mockResponse);
      patcher.installFetchInterceptor();

      await mockContext.fetch('https://youtube.com/youtubei/v1/player');
      expect(mockResponse.json).toHaveBeenCalled();
    });

    test('should patch player response from get_video_info', async () => {
      const mockResponse = {
        clone: jest.fn().mockReturnThis(),
        json: jest.fn().mockResolvedValue(createMockPlayerResponse()),
        status: 200,
        statusText: 'OK',
        headers: new Headers()
      };

      mockContext.fetch.mockResolvedValue(mockResponse);
      patcher.installFetchInterceptor();

      await mockContext.fetch('https://youtube.com/get_video_info?video_id=test');
      expect(mockResponse.json).toHaveBeenCalled();
    });

    test('should not patch non-player URLs', async () => {
      const mockResponse = {
        clone: jest.fn().mockReturnThis(),
        json: jest.fn().mockResolvedValue({ other: 'data' }),
        status: 200,
        statusText: 'OK',
        headers: new Headers()
      };

      mockContext.fetch.mockResolvedValue(mockResponse);
      patcher.installFetchInterceptor();

      await mockContext.fetch('https://example.com/api/other');
      expect(mockResponse.json).not.toHaveBeenCalled();
    });

    test('should handle non-JSON responses gracefully', async () => {
      const mockResponse = {
        clone: jest.fn().mockReturnThis(),
        json: jest.fn().mockRejectedValue(new Error('Not JSON')),
        status: 200,
        statusText: 'OK',
        headers: new Headers()
      };

      mockContext.fetch.mockResolvedValue(mockResponse);
      patcher.installFetchInterceptor();

      const response = await mockContext.fetch('https://youtube.com/youtubei/v1/player');
      expect(response).toBeInstanceOf(Response);
    });
  });

  // ==================== installYtInitialDataProxy Tests ====================

  describe('installYtInitialDataProxy', () => {
    test('should patch existing ytInitialData', () => {
      mockContext.ytInitialData = createMockYtInitialData();
      patcher.installYtInitialDataProxy();

      expect(mockContext.ytInitialData.contents.twoColumnWatchNextResults.results.results.contents.length).toBe(2);
    });

    test('should intercept future ytInitialData assignments', () => {
      patcher.installYtInitialDataProxy();

      mockContext.ytInitialData = createMockYtInitialData();
      expect(mockContext.ytInitialData.contents.twoColumnWatchNextResults.results.results.contents.length).toBe(2);
    });

    test('should allow getting patched data', () => {
      patcher.installYtInitialDataProxy();
      mockContext.ytInitialData = createMockYtInitialData();

      const data = mockContext.ytInitialData;
      expect(data.contents.twoColumnWatchNextResults.results.results.contents.length).toBe(2);
    });
  });

  // ==================== Stats Tests ====================

  describe('getStats', () => {
    test('should return current stats', async () => {
      const data = createMockPlayerResponse();
      await patcher.patchPlayerResponse(data);
      await patcher.patchPlayerResponse(data);

      const stats = patcher.getStats();
      expect(stats.patched).toBe(2);
      expect(stats.errors).toBe(0);
    });

    test('should return copy of stats', () => {
      const stats1 = patcher.getStats();
      const stats2 = patcher.getStats();
      expect(stats1).not.toBe(stats2);
      expect(stats1).toEqual(stats2);
    });
  });

  // ==================== Activate/Deactivate Tests ====================

  describe('activate / deactivate', () => {
    test('should activate patcher', () => {
      patcher.deactivate();
      expect(patcher.isActive).toBe(false);
      patcher.activate();
      expect(patcher.isActive).toBe(true);
    });

    test('should deactivate patcher', () => {
      expect(patcher.isActive).toBe(false); // Default is false
      patcher.activate();
      expect(patcher.isActive).toBe(true);
      patcher.deactivate();
      expect(patcher.isActive).toBe(false);
    });

    test('should not patch when deactivated', async () => {
      patcher.deactivate();
      const data = createMockPlayerResponse();
      const result = await patcher.patchPlayerResponse(data);
      expect(result).toBe(data);
      expect(patcher.stats.patched).toBe(0);
    });
  });

  // ==================== Cleanup Tests ====================

  describe('cleanup', () => {
    test('should restore original fetch', () => {
      const originalFetch = mockContext.fetch;
      patcher.installFetchInterceptor();
      patcher.cleanup();
      expect(mockContext.fetch).toBe(originalFetch);
    });

    test('should clear transforms', () => {
      patcher.cleanup();
      expect(patcher.transforms.length).toBe(0);
    });

    test('should reset stats', () => {
      const data = createMockPlayerResponse();
      patcher.patchPlayerResponse(data);
      patcher.cleanup();
      expect(patcher.stats.patched).toBe(0);
      expect(patcher.stats.errors).toBe(0);
    });
  });

  // ==================== Singleton Tests ====================

  describe('getPlayerPatcher / resetPlayerPatcher', () => {
    afterEach(() => {
      resetPlayerPatcher();
    });

    test('should return singleton instance', () => {
      const instance1 = getPlayerPatcher();
      const instance2 = getPlayerPatcher();
      expect(instance1).toBe(instance2);
    });

    test('should create new instance after reset', () => {
      const instance1 = getPlayerPatcher();
      resetPlayerPatcher();
      const instance2 = getPlayerPatcher();
      expect(instance1).not.toBe(instance2);
    });

    test('should cleanup on reset', () => {
      const instance1 = getPlayerPatcher();
      instance1.addTransform(() => {});
      const transformCount = instance1.transforms.length;
      expect(transformCount).toBeGreaterThan(9); // Has custom transform

      resetPlayerPatcher();
      const instance2 = getPlayerPatcher();
      expect(instance2.transforms.length).toBe(9); // Only defaults
    });
  });

  // ==================== Edge Cases Tests ====================

  describe('Edge Cases', () => {
    test('should handle missing playabilityStatus', async () => {
      const data = { videoDetails: { videoId: 'test' } };
      const patched = await patcher.patchPlayerResponse(data);
      expect(patched.videoDetails.videoId).toBe('test');
    });

    test('should handle missing playerConfig', async () => {
      const data = { playabilityStatus: { status: 'OK' } };
      const patched = await patcher.patchPlayerResponse(data);
      expect(patched.playabilityStatus.status).toBe('OK');
    });

    test('should handle missing videoDetails', async () => {
      const data = { playabilityStatus: { status: 'OK', adSignalsInfo: {} } };
      const patched = await patcher.patchPlayerResponse(data);
      expect(patched.playabilityStatus.adSignalsInfo).toBeUndefined();
    });

    test('should handle missing streamingData', async () => {
      const data = { playabilityStatus: { status: 'OK', adSignalsInfo: {} } };
      const patched = await patcher.patchPlayerResponse(data);
      expect(patched.playabilityStatus.adSignalsInfo).toBeUndefined();
    });

    test('should handle missing adaptiveFormats', async () => {
      const data = { streamingData: { dashManifest: 'test' } };
      const patched = await patcher.patchPlayerResponse(data);
      expect(patched.streamingData.dashManifest).toBe('test');
    });

    test('should handle empty adaptiveFormats array', async () => {
      const data = { streamingData: { adaptiveFormats: [] } };
      const patched = await patcher.patchPlayerResponse(data);
      expect(patched.streamingData.adaptiveFormats).toEqual([]);
    });

    test('should handle formats without url', async () => {
      const data = { streamingData: { adaptiveFormats: [{ mimeType: 'video/mp4', codecs: 'avc1' }] } };
      const patched = await patcher.patchPlayerResponse(data);
      expect(patched.streamingData.adaptiveFormats.length).toBe(1);
    });

    test('should handle nested objects in ytInitialData', () => {
      const data = {
        contents: {
          tabRenderer: {
            content: {
              sectionListRenderer: {
                contents: [
                  { itemSectionRenderer: { contents: [{ adSlotRenderer: {} }] } },
                  { itemSectionRenderer: { contents: [{ videoRenderer: { videoId: 'test' } }] } }
                ]
              }
            }
          }
        }
      };
      patcher.patchYtInitialData(data);
      const contents = data.contents.tabRenderer.content.sectionListRenderer.contents;
      expect(contents[0].itemSectionRenderer.contents.length).toBe(0);
      expect(contents[1].itemSectionRenderer.contents.length).toBe(1);
    });
  });

  // ==================== Integration Tests ====================

  describe('Integration', () => {
    test('should handle full player response with all ad fields', async () => {
      const data = createMockPlayerResponse({
        playabilityStatus: {
          status: 'OK',
          adSignalsInfo: {},
          adsPresentation: {},
          adPlacements: [{}],
          adBreaks: [{}]
        },
        playerConfig: { adConfig: {}, adPlacements: [{}], adBreakConfig: {}, adTagUrl: '' },
        videoDetails: { allowAds: true, adTagUrl: '', adTagUrlSet: true, playerAdConfig: {}, adBreakSlots: [{}], adSlots: [{}], ppvTrackingUrl: '' },
        streamingData: { adFormats: [{}], adBreakConfig: {}, adSlots: [{}], adBreakSlots: [{}] }
      });

      const patched = await patcher.patchPlayerResponse(data);

      // Verify all ad fields removed
      expect(patched.playabilityStatus.adSignalsInfo).toBeUndefined();
      expect(patched.playabilityStatus.adsPresentation).toBeUndefined();
      expect(patched.playabilityStatus.adPlacements).toBeUndefined();
      expect(patched.playabilityStatus.adBreaks).toBeUndefined();
      expect(patched.playerConfig.adConfig).toBeUndefined();
      expect(patched.playerConfig.adPlacements).toBeUndefined();
      expect(patched.playerConfig.adBreakConfig).toBeUndefined();
      expect(patched.playerConfig.adTagUrl).toBeUndefined();
      expect(patched.videoDetails.allowAds).toBeUndefined();
      expect(patched.videoDetails.adTagUrl).toBeUndefined();
      expect(patched.videoDetails.adTagUrlSet).toBeUndefined();
      expect(patched.videoDetails.playerAdConfig).toBeUndefined();
      expect(patched.videoDetails.adBreakSlots).toBeUndefined();
      expect(patched.videoDetails.adSlots).toBeUndefined();
      expect(patched.videoDetails.ppvTrackingUrl).toBeUndefined();
      expect(patched.streamingData.adFormats).toBeUndefined();
      expect(patched.streamingData.adBreakConfig).toBeUndefined();
      expect(patched.streamingData.adSlots).toBeUndefined();
      expect(patched.streamingData.adBreakSlots).toBeUndefined();
    });

    test('should preserve all non-ad fields', async () => {
      const data = createMockPlayerResponse();
      const patched = await patcher.patchPlayerResponse(data);

      // Video details preserved
      expect(patched.videoDetails.videoId).toBe('test123');
      expect(patched.videoDetails.title).toBe('Test Video');

      // Streaming formats preserved
      expect(patched.streamingData.adaptiveFormats.length).toBe(3); // 3 real formats kept

      // DASH/HLS manifests processed
      expect(patched.streamingData.dashManifest).toContain('<Period id="1"');
      expect(patched.streamingData.hlsManifest).toContain('segment1.ts');
    });

    test('should handle multiple patch calls', async () => {
      const data1 = createMockPlayerResponse({ videoDetails: { videoId: 'video1' } });
      const data2 = createMockPlayerResponse({ videoDetails: { videoId: 'video2' } });

      const patched1 = await patcher.patchPlayerResponse(data1);
      const patched2 = await patcher.patchPlayerResponse(data2);

      expect(patched1.videoDetails.videoId).toBe('video1');
      expect(patched2.videoDetails.videoId).toBe('video2');
      expect(patcher.stats.patched).toBe(2);
    });
  });
});