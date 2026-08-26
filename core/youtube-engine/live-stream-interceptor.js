/**
 * Live Stream Ad Interceptor — HLS/DASH segment-level filtering
 * Intercepts and filters ad segments from live streams
 * Supports EXT-X-DATERANGE, SCTE-35, and DASH EventStream ad markers
 */

export class LiveStreamInterceptor {
  constructor(context = window) {
    this.context = context;
    this.isActive = false;
    this.stats = {
      hlsIntercepted: 0,
      dashIntercepted: 0,
      adsRemoved: 0,
      segmentsBlocked: 0,
      errors: 0
    };

    // Ad segment detection patterns for URL-based filtering
    this.adSegmentPatterns = [
      // HLS ad markers
      '#EXT-X-DATERANGE',
      '#EXT-X-CUE',
      '#EXT-X-CUE-OUT',
      '#EXT-X-CUE-IN',
      '#EXT-X-SCTE35',
      '#EXT-X-ASSET',
      '#EXT-X-PROGRAM-DATE-TIME',

      // DASH ad markers
      'EventStream',
      'Event',
      'PresentationTimeOffset',
      'Duration',
      'schemeIdUri="urn:scte:scte35:2013:xml"',
      'schemeIdUri="urn:mpeg:dash:event:2012"',

      // Common ad identifiers in segment URLs
      'ad-', 'ad_', 'ad.',
      'adbreak', 'ad-break', 'ad_break',
      'preroll', 'midroll', 'postroll',
      'sponsor', 'promo', 'banner',
      'doubleclick', 'googlesyndication',
      'ima3', 'imasdk',
      'ads.', 'ads-', 'ads_',
      'adserver', 'ad-delivery',
      'scte35', 'cue-out', 'cue-in',
      'placement', 'avail',
      'companion', 'overlay'
    ];

    // EXT-X-DATERANGE ad attribute identifiers
    this.daterangeAdAttributes = [
      'CLASS="com.apple.hls.ad"',
      'CLASS="SCTE35"',
      'CLASS="DATERANGE"',
      'X-AD',
      'X-SCTE35',
      'X-CUE',
      'X-AVAIL',
      'PLACEMENT',
      'AD-ID',
      'AD-SYSTEM',
      'AD-TYPE',
      'PREROLL',
      'MIDROLL',
      'POSTROLL',
      'SPONSOR',
      'PROMO',
      'BANNER',
      'DOUBLECLICK',
      'GOOGLESYNDICATION',
      'IMASDK'
    ];

    // SCTE-35 splice command types indicating ads
    this.scte35AdCommands = [
      'splice_insert',
      'time_signal',
      'bandwidth_reservation',
      'private_command'
    ];

    // DASH EventStream schemeId URIs for ads
    this.dashAdSchemeIds = [
      'urn:scte:scte35:2013:xml',
      'urn:scte:scte35:2014:xml',
      'urn:mpeg:dash:event:2012',
      'urn:com:adobe:dpi:simple:2015',
      'urn:com:adobe:dpi:simple:2016',
      'urn:mpeg:dash:event:2014'
    ];
  }

  /**
   * Initialize live stream interception
   */
  initialize() {
    if (this.isActive) return;

    // Hook into fetch for HLS/DASH manifests
    this._hookFetch();

    // Hook into MediaSource for segment filtering
    this._hookMediaSource();

    this.isActive = true;
    console.log('[LiveStreamInterceptor] Initialized with segment-level filtering');
  }

  /**
   * Hook fetch to intercept HLS/DASH manifests and segment requests
   */
  _hookFetch() {
    const originalFetch = this.context.fetch;
    this.originalFetch = originalFetch;

    this.context.fetch = async (...args) => {
      const url = args[0];
      const response = await originalFetch.apply(this.context, args);

      if (typeof url === 'string') {
        const urlLower = url.toLowerCase();

        // Intercept HLS manifests (.m3u8, /manifest, /playlist)
        if (this._isHLSManifestUrl(urlLower)) {
          const clone = response.clone();
          try {
            const text = await clone.text();
            if (this._isHLSManifest(text)) {
              const cleaned = this._filterHLSManifest(text, url);
              if (cleaned !== text) {
                this.stats.hlsIntercepted++;
                return new Response(cleaned, {
                  status: response.status,
                  statusText: response.statusText,
                  headers: response.headers
                });
              }
            }
          } catch (e) {
            this.stats.errors++;
          }
        }

        // Intercept DASH manifests (.mpd)
        if (this._isDASHManifestUrl(urlLower)) {
          const clone = response.clone();
          try {
            const text = await clone.text();
            if (this._isDASHManifest(text)) {
              const cleaned = this._filterDASHManifest(text, url);
              if (cleaned !== text) {
                this.stats.dashIntercepted++;
                return new Response(cleaned, {
                  status: response.status,
                  statusText: response.statusText,
                  headers: response.headers
                });
              }
            }
          } catch (e) {
            this.stats.errors++;
          }
        }

        // Intercept segment requests (.ts, .m4s, .mp4 segments)
        if (this._isSegmentRequest(url)) {
          if (this._isAdSegment(url)) {
            this.stats.segmentsBlocked++;
            this.stats.adsRemoved++;
            return new Response('', { status: 204, statusText: 'No Content (Ad Blocked)' });
          }
        }
      }

      return response;
    };
  }

  /**
   * Hook MediaSource for segment-level filtering at buffer level
   */
  _hookMediaSource() {
    if (!this.context.MediaSource) return;

    const originalAddSourceBuffer = this.context.MediaSource.prototype.addSourceBuffer;
    this.originalAddSourceBuffer = originalAddSourceBuffer;

    this.context.MediaSource.prototype.addSourceBuffer = function(type) {
      const buffer = originalAddSourceBuffer.call(this, type);

      // Hook appendBuffer to filter segments at buffer level
      const originalAppendBuffer = buffer.appendBuffer;
      buffer.appendBuffer = (data) => {
        // For fragmented MP4 (fMP4), we could inspect moof/mdat boxes
        // This is a more advanced technique for DASH segments
        if (data && data.byteLength > 0) {
          const segmentType = this._detectSegmentType(data);
          if (segmentType === 'fmp4' && this._isAdFMP4Segment(data)) {
            this.stats.segmentsBlocked++;
            this.stats.adsRemoved++;
            return; // Skip appending ad segment
          }
        }
        return originalAppendBuffer.call(this, data);
      }.bind(this);

      return buffer;
    }.bind(this);
  }

  /**
   * Check if URL is an HLS manifest URL
   */
  _isHLSManifestUrl(url) {
    return url.includes('.m3u8') ||
           url.includes('/manifest') ||
           url.includes('/playlist') ||
           url.includes('format=m3u8') ||
           url.includes('m3u8?');
  }

  /**
   * Check if URL is a DASH manifest URL
   */
  _isDASHManifestUrl(url) {
    return url.includes('.mpd') ||
           (url.includes('.xml') && (url.includes('dash') || url.includes('manifest')));
  }

  /**
   * Check if text content is an HLS manifest
   */
  _isHLSManifest(text) {
    return text.startsWith('#EXTM3U');
  }

  /**
   * Check if text content is a DASH manifest
   */
  _isDASHManifest(text) {
    return text.includes('<MPD') ||
           text.includes('xmlns="urn:mpeg:dash') ||
           text.includes('xmlns="urn:mpeg:dash:schema:mpd');
  }

  /**
   * Check if URL is a segment request
   */
  _isSegmentRequest(url) {
    const urlLower = url.toLowerCase();
    return urlLower.includes('.ts') ||
           urlLower.includes('.m4s') ||
           urlLower.includes('.mp4') ||
           urlLower.includes('/segment') ||
           urlLower.includes('/seg-') ||
           urlLower.includes('seg_') ||
           urlLower.match(/\d+\.(ts|m4s|mp4)(\?|$)/);
  }

  /**
   * Check if segment URL indicates an ad
   */
  _isAdSegment(url) {
    const urlLower = url.toLowerCase();
    return this.adSegmentPatterns.some(pattern => urlLower.includes(pattern.toLowerCase()));
  }

  /**
   * Detect segment type from binary data
   */
  _detectSegmentType(data) {
    const view = new DataView(data.buffer || data);
    if (data.byteLength < 8) return 'unknown';

    // Check for fMP4 boxes (ftyp, moof, moov)
    const firstBytes = new Uint8Array(data, 0, 16);
    const boxType = String.fromCharCode(...firstBytes.slice(4, 8));

    if (boxType === 'ftyp' || boxType === 'moof' || boxType === 'moov') {
      return 'fmp4';
    }
    // MPEG-TS starts with 0x47 sync byte
    if (firstBytes[0] === 0x47) {
      return 'ts';
    }
    return 'unknown';
  }

  /**
   * Check if fMP4 segment contains ad metadata (simplified heuristic)
   */
  _isAdFMP4Segment(data) {
    try {
      // Convert to string for pattern matching (only first 4KB for performance)
      const view = new Uint8Array(data, 0, Math.min(4096, data.byteLength));
      const text = new TextDecoder('utf-8', { fatal: false }).decode(view);

      // Check for ad identifiers in fMP4 metadata
      const adIndicators = [
        'ad-', 'ad_', 'ad.',
        'adbreak', 'scte35', 'cue-out', 'cue-in',
        'doubleclick', 'googlesyndication', 'imasdk',
        'urn:scte:scte35', 'urn:mpeg:dash:event'
      ];

      return adIndicators.some(indicator => text.toLowerCase().includes(indicator));
    } catch {
      return false;
    }
  }

  // ============================================================================
  // HLS Manifest Filtering
  // ============================================================================

  /**
   * Filter HLS manifest - remove ad segments, markers, and DATERANGE entries
   */
  _filterHLSManifest(manifest, url) {
    const lines = manifest.split('\n');
    const filtered = [];
    let inAdSegment = false;
    let adSegmentCount = 0;
    let daterangeAdCount = 0;
    let i = 0;

    while (i < lines.length) {
      const line = lines[i].trim();
      const originalLine = lines[i];

      // Check for EXT-X-DATERANGE with ad content
      if (line.startsWith('#EXT-X-DATERANGE')) {
        if (this._isDaterangeAd(line)) {
          daterangeAdCount++;
          this.stats.adsRemoved++;
          i++;
          // Skip any associated segment lines until next segment or marker
          while (i < lines.length && !lines[i].trim().startsWith('#') && !lines[i].trim().endsWith('.ts') && !lines[i].trim().endsWith('.m4s')) {
            i++;
          }
          continue;
        }
        // Keep non-ad DATERANGE (e.g., timed metadata)
        filtered.push(originalLine);
        i++;
        continue;
      }

      // Check for other HLS ad markers
      if (this._isHLSAdMarker(line)) {
        inAdSegment = true;
        adSegmentCount++;
        this.stats.adsRemoved++;
        i++;
        continue;
      }

      // Check for segment URLs
      if (this._isSegmentLine(line)) {
        if (inAdSegment) {
          inAdSegment = false;
          this.stats.segmentsBlocked++;
          i++;
          continue; // Skip ad segment URL
        }

        // Check if segment URL itself indicates ad
        if (this._isAdSegment(line)) {
          this.stats.segmentsBlocked++;
          this.stats.adsRemoved++;
          i++;
          continue; // Skip ad segment
        }

        filtered.push(originalLine);
        i++;
        continue;
      }

      // Check for EXT-X-KEY that might be for ad segments
      if (line.startsWith('#EXT-X-KEY') && inAdSegment) {
        i++;
        continue;
      }

      // Check for EXT-X-MAP that might be for ad segments
      if (line.startsWith('#EXT-X-MAP') && inAdSegment) {
        i++;
        continue;
      }

      filtered.push(originalLine);
      i++;
    }

    const totalRemoved = adSegmentCount + daterangeAdCount;
    if (totalRemoved > 0) {
      console.log(`[LiveStreamInterceptor] HLS: Removed ${adSegmentCount} ad segments, ${daterangeAdCount} ad DATERANGE entries`);
    }

    return filtered.join('\n');
  }

  /**
   * Check if line is an HLS ad marker
   */
  _isHLSAdMarker(line) {
    const adMarkers = [
      '#EXT-X-CUE',
      '#EXT-X-CUE-OUT',
      '#EXT-X-CUE-IN',
      '#EXT-X-SCTE35',
      '#EXT-X-ASSET'
    ];

    const hasMarker = adMarkers.some(marker => line.includes(marker));
    return hasMarker && this._hasAdAttributes(line);
  }

  /**
   * Check if EXT-X-DATERANGE line contains ad attributes
   */
  _isDaterangeAd(line) {
    const upperLine = line.toUpperCase();

    // Check for explicit ad CLASS
    if (upperLine.includes('CLASS="COM.APPLE.HLS.AD"') ||
        upperLine.includes('CLASS="SCTE35"')) {
      return true;
    }

    // Check for ad-related attributes
    return this.daterangeAdAttributes.some(attr => upperLine.includes(attr.toUpperCase()));
  }

  /**
   * Check if line has ad-related attributes
   */
  _hasAdAttributes(line) {
    const adAttrs = [
      'ad', 'sponsor', 'promo', 'banner',
      'doubleclick', 'googlesyndication',
      'imasdk', 'googleads',
      'preroll', 'midroll', 'postroll',
      'scte35', 'cue', 'avail', 'placement'
    ];

    const lowerLine = line.toLowerCase();
    return adAttrs.some(attr => lowerLine.includes(attr));
  }

  /**
   * Check if line is a segment URL line
   */
  _isSegmentLine(line) {
    const trimmed = line.trim();
    return trimmed.endsWith('.ts') ||
           trimmed.endsWith('.m4s') ||
           trimmed.endsWith('.mp4') ||
           trimmed.match(/^seg[-_]\d+/i) ||
           trimmed.match(/^segment[-_]\d+/i);
  }

  // ============================================================================
  // DASH Manifest Filtering
  // ============================================================================

  /**
   * Filter DASH manifest - remove ad Periods, EventStreams, AdaptationSets
   */
  _filterDASHManifest(manifest, url) {
    try {
      const parser = new this.context.DOMParser();
      const doc = parser.parseFromString(manifest, 'application/xml');

      // Check for parse errors
      const parseError = doc.querySelector('parsererror');
      if (parseError) {
        this.stats.errors++;
        return manifest;
      }

      let removedCount = 0;

      // 1. Remove EventStream elements with ad content
      const eventStreams = doc.querySelectorAll('EventStream');
      for (const eventStream of eventStreams) {
        if (this._isAdEventStream(eventStream)) {
          eventStream.remove();
          removedCount++;
          this.stats.adsRemoved++;
        }
      }

      // 2. Remove Period elements that are ads
      const periods = doc.querySelectorAll('Period');
      for (const period of periods) {
        if (this._isAdPeriod(period)) {
          period.remove();
          removedCount++;
          this.stats.adsRemoved++;
        }
      }

      // 3. Remove AdaptationSet elements that are ads
      const adaptationSets = doc.querySelectorAll('AdaptationSet');
      for (const adaptationSet of adaptationSets) {
        if (this._isAdAdaptationSet(adaptationSet)) {
          adaptationSet.remove();
          removedCount++;
          this.stats.adsRemoved++;
        }
      }

      // 4. Remove SegmentTemplate/URL that point to ad segments
      const segmentTemplates = doc.querySelectorAll('SegmentTemplate, SegmentList, SegmentBase');
      for (const template of segmentTemplates) {
        const media = template.getAttribute('media') || '';
        const initialization = template.getAttribute('initialization') || '';
        const mediaUrl = template.getAttribute('media') || template.textContent || '';
        if (this._isAdSegment(media) || this._isAdSegment(initialization) || this._isAdSegment(mediaUrl)) {
          template.remove();
          removedCount++;
        }
      }

      // 5. Remove InbandEventStream with ad schemeId
      const inbandEvents = doc.querySelectorAll('InbandEventStream');
      for (const event of inbandEvents) {
        const schemeId = event.getAttribute('schemeIdUri') || '';
        if (this.dashAdSchemeIds.some(id => schemeId.includes(id))) {
          event.remove();
          removedCount++;
          this.stats.adsRemoved++;
        }
      }

      // 6. Remove Event elements within EventStream that are ads
      const events = doc.querySelectorAll('Event');
      for (const event of events) {
        if (this._isAdEvent(event)) {
          event.remove();
          removedCount++;
          this.stats.adsRemoved++;
        }
      }

      if (removedCount > 0) {
        console.log(`[LiveStreamInterceptor] DASH: Removed ${removedCount} ad elements`);
      }

      const serializer = new this.context.XMLSerializer();
      return serializer.serializeToString(doc);

    } catch (e) {
      this.stats.errors++;
      console.error('[LiveStreamInterceptor] DASH filter error:', e);
      return manifest;
    }
  }

  /**
   * Check if EventStream is ad-related
   */
  _isAdEventStream(eventStream) {
    const schemeId = (eventStream.getAttribute('schemeIdUri') || '').toLowerCase();
    const value = (eventStream.getAttribute('value') || '').toLowerCase();
    const timescale = eventStream.getAttribute('timescale') || '';

    // Check schemeId URI against known ad scheme IDs
    if (this.dashAdSchemeIds.some(id => schemeId.includes(id.toLowerCase()))) {
      return true;
    }

    // Check value attribute for ad indicators
    const adValues = ['ad', 'sponsor', 'promo', 'banner', 'scte35', 'cue', 'placement', 'avail'];
    if (adValues.some(v => value.includes(v))) {
      return true;
    }

    // Check child Events
    const events = eventStream.querySelectorAll('Event');
    for (const event of events) {
      if (this._isAdEvent(event)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if Event element is ad-related
   */
  _isAdEvent(event) {
    const presentationTime = event.getAttribute('presentationTime') || '';
    const duration = event.getAttribute('duration') || '';
    const id = event.getAttribute('id') || '';
    const content = event.textContent || '';

    const adIndicators = ['ad', 'sponsor', 'promo', 'banner', 'scte35', 'cue', 'placement', 'avail'];
    const lowerContent = content.toLowerCase();
    const lowerId = id.toLowerCase();

    return adIndicators.some(ind => lowerContent.includes(ind) || lowerId.includes(ind));
  }

  /**
   * Check if Period is ad-related
   */
  _isAdPeriod(period) {
    const id = (period.getAttribute('id') || '').toLowerCase();
    const start = period.getAttribute('start') || '';
    const duration = period.getAttribute('duration') || '';

    // Check Period id for ad indicators
    const adPeriodIds = ['ad', 'Ad', 'AD', 'preroll', 'midroll', 'postroll', 'sponsor', 'promo', 'avail'];
    if (adPeriodIds.some(adId => id.includes(adId))) {
      return true;
    }

    // Check if Period contains ad AdaptationSets
    const adaptationSets = period.querySelectorAll('AdaptationSet');
    let adAdaptationCount = 0;
    for (const adaptationSet of adaptationSets) {
      if (this._isAdAdaptationSet(adaptationSet)) {
        adAdaptationCount++;
      }
    }

    // If all AdaptationSets in this Period are ads, remove the Period
    return adAdaptationCount > 0 && adAdaptationCount === adaptationSets.length;
  }

  /**
   * Check if AdaptationSet is ad-related
   */
  _isAdAdaptationSet(adaptationSet) {
    const contentType = (adaptationSet.getAttribute('contentType') || '').toLowerCase();
    const mimeType = (adaptationSet.getAttribute('mimeType') || '').toLowerCase();
    const id = (adaptationSet.getAttribute('id') || '').toLowerCase();
    const lang = (adaptationSet.getAttribute('lang') || '').toLowerCase();

    // Check attributes for ad indicators
    if (id.includes('ad') || contentType.includes('ad') || mimeType.includes('ad') || lang.includes('ad')) {
      return true;
    }

    // Check for ad scheme in supplemental properties
    const supplementalProps = adaptationSet.querySelectorAll('SupplementalProperty');
    for (const prop of supplementalProps) {
      const scheme = (prop.getAttribute('schemeIdUri') || '').toLowerCase();
      if (this.dashAdSchemeIds.some(s => scheme.includes(s))) {
        return true;
      }
    }

    // Check Representations for ad content
    const representations = adaptationSet.querySelectorAll('Representation');
    for (const rep of representations) {
      const repId = (rep.getAttribute('id') || '').toLowerCase();
      const baseURL = rep.querySelector('BaseURL')?.textContent || '';
      const segmentTemplate = rep.querySelector('SegmentTemplate')?.getAttribute('media') || '';

      if (repId.includes('ad') ||
          this._isAdSegment(baseURL) ||
          this._isAdSegment(segmentTemplate) ||
          baseURL.includes('doubleclick') ||
          baseURL.includes('googlesyndication')) {
        return true;
      }
    }

    // Check for InbandEventStream in this AdaptationSet
    const inbandEvents = adaptationSet.querySelectorAll('InbandEventStream');
    for (const event of inbandEvents) {
      const schemeId = (event.getAttribute('schemeIdUri') || '').toLowerCase();
      if (this.dashAdSchemeIds.some(s => schemeId.includes(s))) {
        return true;
      }
    }

    return false;
  }

  // ============================================================================
  // SCTE-35 Parsing Support
  // ============================================================================

  /**
   * Parse SCTE-35 data from EXT-X-DATERANGE or DASH EventStream
   * Returns ad info if detected
   */
  parseSCTE35(scte35Data) {
    try {
      // SCTE-35 data is typically base64 encoded
      let binary;
      if (typeof scte35Data === 'string') {
        // Remove data URL prefix if present
        const base64 = scte35Data.replace(/^data:.*;base64,/, '');
        binary = this._base64ToArrayBuffer(base64);
      } else if (scte35Data instanceof ArrayBuffer) {
        binary = scte35Data;
      } else {
        return null;
      }

      const view = new DataView(binary);
      if (binary.byteLength < 12) return null;

      // Parse SCTE-35 splice_info_section
      // Table 5: splice_info_section()
      const tableId = view.getUint8(0);
      if (tableId !== 0xFC) return null; // Not a splice_info_section

      const sectionSyntaxIndicator = (view.getUint8(1) >> 7) & 0x01;
      const privateIndicator = (view.getUint8(1) >> 6) & 0x01;
      const sectionLength = ((view.getUint8(1) & 0x0F) << 8) | view.getUint8(2);

      if (binary.byteLength < 8) return null;

      const protocolVersion = view.getUint8(4);
      const encryptedPacket = (view.getUint8(5) >> 7) & 0x01;
      const encryptionAlgorithm = (view.getUint8(5) >> 3) & 0x0F;
      const ptsAdjustment = ((view.getUint8(5) & 0x07) << 30) |
                           (view.getUint8(6) << 22) |
                           (view.getUint8(7) << 14) |
                           (view.getUint8(8) << 6) |
                           (view.getUint8(9) >> 2);
      const tier = (view.getUint8(9) & 0x03) << 12 | (view.getUint8(10) << 4) | (view.getUint8(11) >> 4);

      const spliceCommandLength = view.getUint8(12);
      const spliceCommandType = view.getUint8(13);

      // Splice command types (Table 7)
      const commandTypes = {
        0x00: 'splice_null',
        0x01: 'splice_schedule',
        0x02: 'splice_insert',
        0x03: 'time_signal',
        0x04: 'bandwidth_reservation',
        0xFF: 'private_command'
      };

      const commandName = commandTypes[spliceCommandType] || `unknown_0x${spliceCommandType.toString(16)}`;

      // Check if this is an ad-related command
      const isAdCommand = [0x02, 0x03, 0x04, 0xFF].includes(spliceCommandType);

      return {
        tableId,
        sectionSyntaxIndicator,
        privateIndicator,
        sectionLength,
        protocolVersion,
        encryptedPacket,
        encryptionAlgorithm,
        ptsAdjustment,
        tier,
        spliceCommandLength,
        spliceCommandType,
        commandName,
        isAdCommand,
        isSpliceInsert: spliceCommandType === 0x02,
        isTimeSignal: spliceCommandType === 0x03,
        isPrivateCommand: spliceCommandType === 0xFF
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * Base64 to ArrayBuffer helper
   */
  _base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Manually filter an HLS manifest string
   */
  filterHLSManifest(manifest, url = '') {
    return this._filterHLSManifest(manifest, url);
  }

  /**
   * Manually filter a DASH manifest string
   */
  filterDASHManifest(manifest, url = '') {
    return this._filterDASHManifest(manifest, url);
  }

  /**
   * Check if a URL should be blocked as an ad segment
   */
  checkSegmentUrl(url) {
    return this._isSegmentRequest(url) && this._isAdSegment(url);
  }

  /**
   * Get interception statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      hlsIntercepted: 0,
      dashIntercepted: 0,
      adsRemoved: 0,
      segmentsBlocked: 0,
      errors: 0
    };
  }

  /**
   * Add custom ad pattern
   */
  addAdPattern(pattern) {
    this.adSegmentPatterns.push(pattern);
  }

  /**
   * Add custom DATERANGE ad attribute
   */
  addDaterangeAdAttribute(attr) {
    this.daterangeAdAttributes.push(attr);
  }

  /**
   * Cleanup and restore original fetch
   */
  cleanup() {
    if (this.originalFetch) {
      this.context.fetch = this.originalFetch;
    }
    if (this.originalAddSourceBuffer) {
      this.context.MediaSource.prototype.addSourceBuffer = this.originalAddSourceBuffer;
    }
    this.isActive = false;
    console.log('[LiveStreamInterceptor] Cleaned up');
  }
}

// ============================================================================
// HLS Segment Filter - Standalone utility for segment-level filtering
// ============================================================================

export class HLSSegmentFilter {
  constructor() {
    this.adSegmentCache = new Map(); // URL -> boolean (isAd)
    this.maxCacheSize = 1000;
  }

  /**
   * Check if HLS segment URL is an ad
   * Uses caching for performance
   */
  isAdSegment(url) {
    if (this.adSegmentCache.has(url)) {
      return this.adSegmentCache.get(url);
    }

    const result = this._analyzeSegmentUrl(url);
    this._cacheResult(url, result);
    return result;
  }

  _analyzeSegmentUrl(url) {
    const urlLower = url.toLowerCase();

    // Direct ad indicators in URL
    const adPatterns = [
      /ad[-_]break/i,
      /ad[-_]segment/i,
      /(pre|mid|post)roll/i,
      /sponsor/i,
      /promo/i,
      /banner/i,
      /doubleclick/i,
      /googlesyndication/i,
      /imasdk/i,
      /scte35/i,
      /cue[-_]out/i,
      /cue[-_]in/i,
      /avail/i,
      /placement/i,
      /adserver/i,
      /ad[-_]delivery/i
    ];

    for (const pattern of adPatterns) {
      if (pattern.test(urlLower)) {
        return true;
      }
    }

    // Check for ad-related query parameters
    try {
      const urlObj = new URL(url);
      const params = urlObj.searchParams;
      const adParams = ['ad', 'adformat', 'ad_type', 'ad_id', 'adtag', 'vast', 'vmap', 'scte'];
      for (const param of adParams) {
        if (params.has(param)) {
          return true;
        }
      }
    } catch {
      // Invalid URL, continue with path analysis
    }

    return false;
  }

  _cacheResult(url, result) {
    if (this.adSegmentCache.size >= this.maxCacheSize) {
      // Remove oldest entries (first 100)
      const keys = Array.from(this.adSegmentCache.keys());
      for (let i = 0; i < 100; i++) {
        this.adSegmentCache.delete(keys[i]);
      }
    }
    this.adSegmentCache.set(url, result);
  }

  clearCache() {
    this.adSegmentCache.clear();
  }
}

// ============================================================================
// DASH Segment Filter - Standalone utility for DASH segment filtering
// ============================================================================

export class DASHSegmentFilter {
  constructor() {
    this.adRepresentationCache = new Map(); // representationId -> boolean
    this.maxCacheSize = 500;
  }

  /**
   * Check if DASH Representation is an ad
   */
  isAdRepresentation(representationElement) {
    const id = representationElement.getAttribute('id') || '';
    if (this.adRepresentationCache.has(id)) {
      return this.adRepresentationCache.get(id);
    }

    const result = this._analyzeRepresentation(representationElement);
    this._cacheResult(id, result);
    return result;
  }

  _analyzeRepresentation(rep) {
    const id = (rep.getAttribute('id') || '').toLowerCase();
    const mimeType = (rep.getAttribute('mimeType') || '').toLowerCase();
    const codecs = (rep.getAttribute('codecs') || '').toLowerCase();

    // Check BaseURL
    const baseURL = rep.querySelector('BaseURL')?.textContent || '';
    if (this._isAdUrl(baseURL)) return true;

    // Check SegmentTemplate
    const segTemplate = rep.querySelector('SegmentTemplate');
    if (segTemplate) {
      const media = segTemplate.getAttribute('media') || '';
      const init = segTemplate.getAttribute('initialization') || '';
      if (this._isAdUrl(media) || this._isAdUrl(init)) return true;
    }

    // Check SegmentList
    const segList = rep.querySelector('SegmentList');
    if (segList) {
      const segmentURLs = segList.querySelectorAll('SegmentURL');
      for (const segURL of segmentURLs) {
        const media = segURL.getAttribute('media') || '';
        const mediaRange = segURL.getAttribute('mediaRange') || '';
        if (this._isAdUrl(media) || this._isAdUrl(mediaRange)) return true;
      }
    }

    // Check id for ad indicators
    const adIndicators = ['ad', 'sponsor', 'promo', 'banner', 'overlay', 'companion', 'preroll', 'midroll', 'postroll'];
    if (adIndicators.some(ind => id.includes(ind))) return true;

    return false;
  }

  _isAdUrl(url) {
    if (!url) return false;
    const lower = url.toLowerCase();
    const adPatterns = [
      'ad-', 'ad_', 'ad.',
      'adbreak', 'sponsor', 'promo', 'banner',
      'doubleclick', 'googlesyndication', 'imasdk',
      'scte35', 'cue-out', 'cue-in', 'avail',
      'placement', 'preroll', 'midroll', 'postroll'
    ];
    return adPatterns.some(p => lower.includes(p));
  }

  _cacheResult(id, result) {
    if (this.adRepresentationCache.size >= this.maxCacheSize) {
      const keys = Array.from(this.adRepresentationCache.keys());
      for (let i = 0; i < 50; i++) {
        this.adRepresentationCache.delete(keys[i]);
      }
    }
    this.adRepresentationCache.set(id, result);
  }

  clearCache() {
    this.adRepresentationCache.clear();
  }
}

// ============================================================================
// Singleton Exports
// ============================================================================

let liveStreamInterceptorInstance = null;

export function getLiveStreamInterceptor(context = window) {
  if (!liveStreamInterceptorInstance) {
    liveStreamInterceptorInstance = new LiveStreamInterceptor(context);
  }
  return liveStreamInterceptorInstance;
}

export function resetLiveStreamInterceptor() {
  if (liveStreamInterceptorInstance) {
    liveStreamInterceptorInstance.cleanup();
  }
  liveStreamInterceptorInstance = null;
}

// Export filter utilities
export const hlsSegmentFilter = new HLSSegmentFilter();
export const dashSegmentFilter = new DASHSegmentFilter();