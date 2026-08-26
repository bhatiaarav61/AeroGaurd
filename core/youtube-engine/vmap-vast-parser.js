/**
 * VMAP/VAST/VPAD Parser & Blocker — Server-side manifest destruction
 * Parses and strips ad content from VMAP, VAST, and VPAD manifests
 * Enhanced with HLS/DASH segment filtering and ad period removal
 */

export class VMAPVASTParser {
  constructor(context = window) {
    this.context = context;
    this.stats = { parsed: 0, adsRemoved: 0, errors: 0 };

    // Ad detection patterns for HLS/DASH
    this.adPatterns = {
      hlsMarkers: [
        '#EXT-X-DATERANGE',
        '#EXT-X-CUE',
        '#EXT-X-CUE-OUT',
        '#EXT-X-CUE-IN',
        '#EXT-X-SCTE35',
        '#EXT-X-ASSET',
        '#EXT-X-PROGRAM-DATE-TIME'
      ],
      dashMarkers: [
        'EventStream',
        'Event',
        'PresentationTimeOffset',
        'Duration',
        'schemeIdUri="urn:scte:scte35:2013:xml"',
        'schemeIdUri="urn:mpeg:dash:event:2012"'
      ],
      adIdentifiers: [
        'ad-', 'ad_', 'ad.', 'ad=', 'ad"', "ad'", 'ad:', 'ad ',
        'adbreak', 'ad-break', 'ad_break',
        'preroll', 'midroll', 'postroll',
        'pre-roll', 'pre_roll', 'preRoll',
        'mid-roll', 'mid_roll', 'midRoll',
        'post-roll', 'post_roll', 'postRoll',
        'sponsor', 'promo', 'banner',
        'doubleclick', 'googlesyndication',
        'ima3', 'imasdk',
        'googleads', 'pagead',
        'advertisement', 'adslot', 'adunit',
        'vpaid', 'vast', 'vmap',
        'freewheel', 'brightcove', 'ooyala',
        'theplatform', 'kaltura', 'jwplayer',
        'videojs-ad', 'google-ima', 'ad-tech',
        'x-ad', 'X-AD', 'X-Ad'
      ],
      adDomains: [
        'doubleclick.net',
        'googlesyndication.com',
        'googleadservices.com',
        'googletagmanager.com',
        'googletagservices.com',
        'pagead2.googlesyndication.com',
        'pubads.g.doubleclick.net',
        'securepubads.g.doubleclick.net',
        'adservice.google.com',
        'imasdk.googleapis.com',
        'imasdk.s3.amazonaws.com',
        'gstatic.com/imasdk',
        'ads.youtube.com',
        'advertising.youtube.com',
        'partneradvertising.youtube.com',
        'sponsorships.youtube.com',
        'paidcontent.youtube.com',
        'googleads.g.doubleclick.net',
        'fls.doubleclick.net',
        'ad.doubleclick.net',
        'advertiser.youtube.com',
        'ads-pa.googleapis.com'
      ]
    };
  }

  /**
   * Parse and strip ads from VMAP manifest
   * @param {string} vmapXml - VMAP XML string
   * @returns {string} Cleaned VMAP XML
   */
  stripVMAPAds(vmapXml) {
    if (!vmapXml) return vmapXml;

    try {
      this.stats.parsed++;

      const parser = new this.context.DOMParser();
      const doc = parser.parseFromString(vmapXml, 'application/xml');

      // Check for parse errors
      const parseError = doc.querySelector('parsererror');
      if (parseError) {
        this.stats.errors++;
        return vmapXml;
      }

      // Remove AdBreak elements
      const adBreaks = doc.querySelectorAll('AdBreak');
      for (const adBreak of adBreaks) {
        adBreak.remove();
        this.stats.adsRemoved++;
      }

      // Remove AdSource elements with ad content
      const adSources = doc.querySelectorAll('AdSource');
      for (const adSource of adSources) {
        if (this._isAdSource(adSource)) {
          adSource.remove();
          this.stats.adsRemoved++;
        }
      }

      // Remove Tracking elements for ads
      const trackings = doc.querySelectorAll('Tracking');
      for (const tracking of trackings) {
        if (this._isAdTracking(tracking)) {
          tracking.remove();
        }
      }

      // Remove Extensions that might contain ad config
      const extensions = doc.querySelectorAll('Extensions');
      for (const ext of extensions) {
        if (this._isAdExtension(ext)) {
          ext.remove();
        }
      }

      // Serialize back to string
      const serializer = new this.context.XMLSerializer();
      return serializer.serializeToString(doc);

    } catch (e) {
      this.stats.errors++;
      console.error('[VMAPVASTParser] VMAP parse error:', e);
      return vmapXml;
    }
  }

  /**
   * Parse and strip ads from VAST manifest
   * @param {string} vastXml - VAST XML string
   * @returns {string} Cleaned VAST XML
   */
  stripVASTAds(vastXml) {
    if (!vastXml) return vastXml;

    try {
      this.stats.parsed++;

      const parser = new this.context.DOMParser();
      const doc = parser.parseFromString(vastXml, 'application/xml');

      const parseError = doc.querySelector('parsererror');
      if (parseError) {
        this.stats.errors++;
        return vastXml;
      }

      // Remove Ad elements
      const ads = doc.querySelectorAll('Ad');
      for (const ad of ads) {
        ad.remove();
        this.stats.adsRemoved++;
      }

      // Remove InLine ads
      const inLines = doc.querySelectorAll('InLine');
      for (const inLine of inLines) {
        inLine.remove();
        this.stats.adsRemoved++;
      }

      // Remove Wrapper ads (they redirect to other VAST)
      const wrappers = doc.querySelectorAll('Wrapper');
      for (const wrapper of wrappers) {
        wrapper.remove();
        this.stats.adsRemoved++;
      }

      // Remove Creative elements that are ads
      const creatives = doc.querySelectorAll('Creative');
      for (const creative of creatives) {
        if (this._isAdCreative(creative)) {
          creative.remove();
          this.stats.adsRemoved++;
        }
      }

      // Remove Tracking events for ads
      const trackings = doc.querySelectorAll('Tracking');
      for (const tracking of trackings) {
        if (this._isAdTracking(tracking)) {
          tracking.remove();
        }
      }

      // Remove MediaFile elements that are ads
      const mediaFiles = doc.querySelectorAll('MediaFile');
      for (const mediaFile of mediaFiles) {
        if (this._isAdMediaFile(mediaFile)) {
          mediaFile.remove();
        }
      }

      const serializer = new this.context.XMLSerializer();
      return serializer.serializeToString(doc);

    } catch (e) {
      this.stats.errors++;
      console.error('[VMAPVASTParser] VAST parse error:', e);
      return vastXml;
    }
  }

  /**
   * Parse and strip ads from VPAD (Video Player-Ad Interface Definition)
   * @param {string} vpadJson - VPAD JSON string
   * @returns {string} Cleaned VPAD JSON
   */
  stripVPADAds(vpadJson) {
    if (!vpadJson) return vpadJson;

    try {
      this.stats.parsed++;
      const data = JSON.parse(vpadJson);

      // Remove ad plugins
      if (data.plugins) {
        data.plugins = data.plugins.filter(p => !this._isAdPlugin(p));
      }

      // Remove ad schedules
      if (data.adSchedule) {
        delete data.adSchedule;
      }

      // Remove ad breaks
      if (data.adBreaks) {
        delete data.adBreaks;
      }

      // Remove ad tags
      if (data.adTagUrl) {
        delete data.adTagUrl;
      }

      return JSON.stringify(data);

    } catch (e) {
      this.stats.errors++;
      console.error('[VMAPVASTParser] VPAD parse error:', e);
      return vpadJson;
    }
  }

  // ============================================================================
  // HLS Manifest Filtering
  // ============================================================================

  /**
   * Filter HLS manifest - remove ad segments, markers, and cue points
   * @param {string} manifest - HLS manifest content
   * @param {string} baseUrl - Base URL for resolving relative segments
   * @returns {string} Cleaned HLS manifest
   */
  filterHLSManifest(manifest, baseUrl = '') {
    if (!manifest) return manifest;

    if (!this._isHLSManifest(manifest)) {
      return manifest;
    }

    try {
      this.stats.parsed++;
      const lines = manifest.split('\n');
      const filtered = [];
      let inAdCue = false; // Tracks CUE-OUT/CUE-IN state
      let adSegmentCount = 0;
      let skipUntilNextSegment = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Skip empty lines
        if (!line) {
          filtered.push(lines[i]);
          continue;
        }

        // Check for CUE-OUT / CUE-IN markers (these define ad regions)
        if (line.includes('#EXT-X-CUE-OUT') || line.includes('#EXT-X-CUE-OUT:')) {
          inAdCue = true;
          adSegmentCount++;
          this.stats.adsRemoved++;
          continue;
        }
        if (line.includes('#EXT-X-CUE-IN')) {
          inAdCue = false;
          this.stats.adsRemoved++;
          continue;
        }

        // Check for EXT-X-DATERANGE with ad content - these are markers, don't set inAdCue
        if (line.includes('#EXT-X-DATERANGE') && this._hasAdAttributes(line)) {
          this.stats.adsRemoved++;
          continue;
        }

        // Check for EXT-X-SCTE35 with ad content
        if (line.includes('#EXT-X-SCTE35') && this._hasAdAttributes(line)) {
          this.stats.adsRemoved++;
          continue;
        }

        // Check for EXT-X-CUE (generic) with ad content
        if (line.includes('#EXT-X-CUE') && this._hasAdAttributes(line) &&
            !line.includes('#EXT-X-CUE-OUT') && !line.includes('#EXT-X-CUE-IN')) {
          this.stats.adsRemoved++;
          continue;
        }

        // Check for EXT-X-KEY that might be for ad segments (only if in ad cue)
        if (line.startsWith('#EXT-X-KEY') && inAdCue) {
          this.stats.adsRemoved++;
          continue;
        }

        // Check for EXT-X-MAP (initialization segment) for ads (only if in ad cue)
        if (line.startsWith('#EXT-X-MAP') && inAdCue) {
          this.stats.adsRemoved++;
          continue;
        }

        // Check for segment URLs
        if (this._isHLSSegmentLine(line)) {
          if (inAdCue) {
            continue; // Skip ad segment URL
          }

          // Check if segment URL itself indicates ad
          if (this._isAdSegmentUrl(line, baseUrl)) {
            this.stats.adsRemoved++;
            skipUntilNextSegment = true;
            continue;
          }
        }

        // Skip EXTINF lines for ad segments (when URL was ad)
        if (line.startsWith('#EXTINF') && skipUntilNextSegment) {
          continue;
        }

        // Reset skip flag when we hit a non-EXTINF line after ad segment
        if (skipUntilNextSegment && !line.startsWith('#EXTINF') && !line.startsWith('#EXT-X-')) {
          skipUntilNextSegment = false;
        }

        // Check for EXT-X-SESSION-DATA with ad content
        if (line.includes('#EXT-X-SESSION-DATA') && this._hasAdAttributes(line)) {
          this.stats.adsRemoved++;
          continue;
        }

        // Check for EXT-X-MEDIA with ad content (alternate audio for ads)
        if (line.includes('#EXT-X-MEDIA') && this._hasAdAttributes(line)) {
          this.stats.adsRemoved++;
          continue;
        }

        // Check for EXT-X-STREAM-INF with ad content
        if (line.includes('#EXT-X-STREAM-INF') && this._hasAdAttributes(line)) {
          this.stats.adsRemoved++;
          // Skip the next line (the URI)
          i++;
          continue;
        }

        filtered.push(lines[i]);
      }

      if (adSegmentCount > 0) {
        console.log('[VMAPVASTParser] Removed', adSegmentCount, 'ad segments from HLS manifest');
      }

      // Clean up: remove any remaining ad marker lines
      const cleaned = filtered.join('\n')
        .replace(/#EXT-X-DATERANGE[^\n]*\n/g, '')
        .replace(/#EXT-X-CUE[^\n]*\n/g, '')
        .replace(/#EXT-X-SCTE35[^\n]*\n/g, '');

      return cleaned;

    } catch (e) {
      this.stats.errors++;
      console.error('[VMAPVASTParser] HLS filter error:', e);
      return manifest;
    }
  }

  /**
   * Filter HLS master playlist - remove ad variant streams
   * @param {string} manifest - HLS master playlist content
   * @returns {string} Cleaned master playlist
   */
  filterHLSMasterPlaylist(manifest) {
    if (!manifest || !manifest.startsWith('#EXTM3U')) return manifest;

    try {
      const lines = manifest.split('\n');
      const filtered = [];
      let skipNextLine = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (skipNextLine) {
          skipNextLine = false;
          continue;
        }

        // Check for ad variant streams
        if (line.startsWith('#EXT-X-STREAM-INF')) {
          if (this._hasAdAttributes(line)) {
            this.stats.adsRemoved++;
            skipNextLine = true; // Skip the URI line
            continue;
          }
        }

        // Check for ad media groups
        if (line.startsWith('#EXT-X-MEDIA') && this._hasAdAttributes(line)) {
          this.stats.adsRemoved++;
          continue;
        }

        // Check for ad session data
        if (line.startsWith('#EXT-X-SESSION-DATA') && this._hasAdAttributes(line)) {
          this.stats.adsRemoved++;
          continue;
        }

        filtered.push(lines[i]);
      }

      // Also clean up any remaining X-AD attributes in the output
      const cleaned = filtered.join('\n')
        .replace(/X-AD="[^"]*"\s*,?/g, '')
        .replace(/X-AD=[^,\s]+\s*,?/g, '')
        .replace(/X-AD="[^"]*"\s*$/g, '')
        .replace(/X-AD=[^,\s]+\s*$/g, '');

      return cleaned;

    } catch (e) {
      this.stats.errors++;
      console.error('[VMAPVASTParser] HLS master playlist filter error:', e);
      return manifest;
    }
  }

  _isHLSManifest(text) {
    return text.startsWith('#EXTM3U');
  }

  _isHLSSegmentLine(line) {
    return line.endsWith('.ts') ||
           line.endsWith('.m4s') ||
           line.endsWith('.mp4') ||
           line.match(/^seg-\d+/) ||
           line.match(/^segment-\d+/) ||
           line.includes('/seg/') ||
           line.includes('/segment/');
  }

  _isHLSAdMarker(line) {
    return this.adPatterns.hlsMarkers.some(marker => line.includes(marker)) &&
           this._hasAdAttributes(line);
  }

  _hasAdAttributes(line) {
    const lineLower = line.toLowerCase();
    return this.adPatterns.adIdentifiers.some(pattern =>
      lineLower.includes(pattern.toLowerCase())
    ) || this.adPatterns.adDomains.some(domain =>
      lineLower.includes(domain.toLowerCase())
    );
  }

  _isAdSegmentUrl(url, baseUrl) {
    const urlLower = url.toLowerCase();
    const fullUrl = baseUrl ? new URL(url, baseUrl).href.toLowerCase() : urlLower;

    // Check for ad identifiers in URL
    for (const pattern of this.adPatterns.adIdentifiers) {
      if (urlLower.includes(pattern.toLowerCase())) {
        return true;
      }
    }

    // Check for ad domains in URL
    for (const domain of this.adPatterns.adDomains) {
      if (fullUrl.includes(domain.toLowerCase())) {
        return true;
      }
    }

    // Check for common ad path patterns
    const adPaths = [
      '/ad/', '/ads/', '/advert/', '/advertisement/',
      '/vast/', '/vmap/', '/vpaid/',
      '/preroll/', '/midroll/', '/postroll/',
      '/adbreak/', '/ad-break/',
      '/doubleclick/', '/googlesyndication/',
      '/ima3/', '/imasdk/'
    ];

    for (const path of adPaths) {
      if (urlLower.includes(path)) {
        return true;
      }
    }

    return false;
  }

  // ============================================================================
  // DASH Manifest Filtering
  // ============================================================================

  /**
   * Filter DASH manifest - remove ad periods, event streams, and ad adaptation sets
   * @param {string} manifest - DASH MPD manifest content
   * @returns {string} Cleaned DASH manifest
   */
  filterDASHManifest(manifest) {
    if (!manifest) return manifest;

    if (!this._isDASHManifest(manifest)) {
      return manifest;
    }

    try {
      this.stats.parsed++;
      const parser = new this.context.DOMParser();
      const doc = parser.parseFromString(manifest, 'application/xml');

      // Remove EventStream elements with ad content
      const eventStreams = doc.querySelectorAll('EventStream');
      for (const eventStream of eventStreams) {
        if (this._isAdEventStream(eventStream)) {
          eventStream.remove();
          this.stats.adsRemoved++;
        }
      }

      // Remove Period elements that are ads
      const periods = doc.querySelectorAll('Period');
      for (const period of periods) {
        if (this._isAdPeriod(period)) {
          period.remove();
          this.stats.adsRemoved++;
        }
      }

      // Remove AdaptationSet elements that are ads
      const adaptationSets = doc.querySelectorAll('AdaptationSet');
      for (const adaptationSet of adaptationSets) {
        if (this._isAdAdaptationSet(adaptationSet)) {
          adaptationSet.remove();
          this.stats.adsRemoved++;
        }
      }

      // Remove Representation elements that are ads
      const representations = doc.querySelectorAll('Representation');
      for (const rep of representations) {
        if (this._isAdRepresentation(rep)) {
          rep.remove();
          this.stats.adsRemoved++;
        }
      }

      // Remove SegmentTemplate/URL that point to ad segments
      const segmentTemplates = doc.querySelectorAll('SegmentTemplate, SegmentList, SegmentBase');
      for (const template of segmentTemplates) {
        const media = template.getAttribute('media') || '';
        const initialization = template.getAttribute('initialization') || '';
        if (this._isAdSegment(media) || this._isAdSegment(initialization)) {
          template.remove();
        }
      }

      // Remove ContentProtection for ad content (DRM for ads)
      const contentProtections = doc.querySelectorAll('ContentProtection');
      for (const cp of contentProtections) {
        const schemeId = cp.getAttribute('schemeIdUri') || '';
        if (schemeId.includes('ad') || schemeId.includes('widevine') && this._hasAdSibling(cp)) {
          cp.remove();
        }
      }

      // Remove SupplementalProperty that might contain ad metadata
      const supplementalProps = doc.querySelectorAll('SupplementalProperty');
      for (const prop of supplementalProps) {
        if (this._isAdSupplementalProperty(prop)) {
          prop.remove();
        }
      }

      // Remove UTCTiming elements that might be for ad synchronization
      const utcTimings = doc.querySelectorAll('UTCTiming');
      for (const utc of utcTimings) {
        const schemeId = utc.getAttribute('schemeIdUri') || '';
        if (schemeId.includes('scte') || schemeId.includes('ad')) {
          utc.remove();
        }
      }

      const serializer = new this.context.XMLSerializer();
      return serializer.serializeToString(doc);

    } catch (e) {
      this.stats.errors++;
      console.error('[VMAPVASTParser] DASH filter error:', e);
      return manifest;
    }
  }

  _isDASHManifest(text) {
    return text.includes('<MPD') || text.includes('xmlns="urn:mpeg:dash');
  }

  _isAdEventStream(eventStream) {
    const schemeId = eventStream.getAttribute('schemeIdUri') || '';
    const value = eventStream.getAttribute('value') || '';
    const timescale = eventStream.getAttribute('timescale') || '';

    // Check schemeIdUri for ad-related schemes
    const adSchemes = [
      'scte35',
      'ad',
      'urn:mpeg:dash:event:2012',
      'urn:scte:scte35:2013:xml',
      'urn:com:adobe:dpi:simple:2015',
      'urn:com:adobe:dpi:simple:2016'
    ];

    for (const scheme of adSchemes) {
      if (schemeId.includes(scheme)) {
        return true;
      }
    }

    // Check value for ad identifiers
    const valueLower = value.toLowerCase();
    for (const pattern of this.adPatterns.adIdentifiers) {
      if (valueLower.includes(pattern.toLowerCase())) {
        return true;
      }
    }

    return false;
  }

  _isAdPeriod(period) {
    const id = period.getAttribute('id') || '';
    const start = period.getAttribute('start') || '';
    const duration = period.getAttribute('duration') || '';
    const bitstreamSwitching = period.getAttribute('bitstreamSwitching') || '';

    // Check ID for ad identifiers
    const idLower = id.toLowerCase();
    for (const pattern of this.adPatterns.adIdentifiers) {
      if (idLower.includes(pattern.toLowerCase())) {
        return true;
      }
    }

    // Check start time for ad markers
    const startLower = start.toLowerCase();
    for (const pattern of this.adPatterns.adIdentifiers) {
      if (startLower.includes(pattern.toLowerCase())) {
        return true;
      }
    }

    // Check for very short periods (typical ad durations: 15s, 30s, 60s)
    if (duration) {
      const durSeconds = this._parseDuration(duration);
      if (durSeconds > 0 && durSeconds <= 120) {
        // Additional check: look for ad content in this period
        const adaptationSets = period.querySelectorAll('AdaptationSet');
        for (const as of adaptationSets) {
          if (this._isAdAdaptationSet(as)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  _isAdAdaptationSet(adaptationSet) {
    const contentType = adaptationSet.getAttribute('contentType') || '';
    const mimeType = adaptationSet.getAttribute('mimeType') || '';
    const id = adaptationSet.getAttribute('id') || '';
    const lang = adaptationSet.getAttribute('lang') || '';
    const group = adaptationSet.getAttribute('group') || '';

    // Check for ad-related attributes
    for (const attr of [contentType, mimeType, id, lang, group]) {
      const attrLower = attr.toLowerCase();
      for (const pattern of this.adPatterns.adIdentifiers) {
        if (attrLower.includes(pattern.toLowerCase())) {
          return true;
        }
      }
    }

    // Check representations
    const representations = adaptationSet.querySelectorAll('Representation');
    for (const rep of representations) {
      if (this._isAdRepresentation(rep)) {
        return true;
      }
    }

    // Check BaseURL
    const baseURLs = adaptationSet.querySelectorAll('BaseURL');
    for (const baseURL of baseURLs) {
      const url = baseURL.textContent || '';
      if (this._isAdSegment(url)) {
        return true;
      }
    }

    // Check SegmentTemplate
    const segTemplates = adaptationSet.querySelectorAll('SegmentTemplate');
    for (const st of segTemplates) {
      const media = st.getAttribute('media') || '';
      const init = st.getAttribute('initialization') || '';
      if (this._isAdSegment(media) || this._isAdSegment(init)) {
        return true;
      }
    }

    // Check ContentComponent
    const contentComponents = adaptationSet.querySelectorAll('ContentComponent');
    for (const cc of contentComponents) {
      const ccId = cc.getAttribute('id') || '';
      const ccLang = cc.getAttribute('lang') || '';
      const ccContentType = cc.getAttribute('contentType') || '';
      for (const attr of [ccId, ccLang, ccContentType]) {
        const attrLower = attr.toLowerCase();
        for (const pattern of this.adPatterns.adIdentifiers) {
          if (attrLower.includes(pattern.toLowerCase())) {
            return true;
          }
        }
      }
    }

    return false;
  }

  _isAdRepresentation(representation) {
    const id = representation.getAttribute('id') || '';
    const bandwidth = representation.getAttribute('bandwidth') || '';
    const codecs = representation.getAttribute('codecs') || '';
    const mimeType = representation.getAttribute('mimeType') || '';

    // Check ID for ad identifiers
    const idLower = id.toLowerCase();
    for (const pattern of this.adPatterns.adIdentifiers) {
      if (idLower.includes(pattern.toLowerCase())) {
        return true;
      }
    }

    // Check BaseURL
    const baseURL = representation.querySelector('BaseURL');
    if (baseURL) {
      const url = baseURL.textContent || '';
      if (this._isAdSegment(url)) {
        return true;
      }
    }

    // Check SegmentBase/SegmentList/SegmentTemplate
    const segBases = representation.querySelectorAll('SegmentBase, SegmentList, SegmentTemplate');
    for (const sb of segBases) {
      const init = sb.getAttribute('initialization') || '';
      const media = sb.getAttribute('media') || '';
      if (this._isAdSegment(init) || this._isAdSegment(media)) {
        return true;
      }
    }

    // Check for very low bandwidth (typical for ad manifests)
    if (bandwidth) {
      const bw = parseInt(bandwidth, 10);
      if (bw > 0 && bw < 50000) { // Less than 50kbps is suspicious for video
        // Check if this looks like an ad
        const parentAdapt = representation.closest('AdaptationSet');
        if (parentAdapt && this._isAdAdaptationSet(parentAdapt)) {
          return true;
        }
      }
    }

    return false;
  }

  _isAdSegment(url) {
    if (!url) return false;
    const urlLower = url.toLowerCase();

    for (const pattern of this.adPatterns.adIdentifiers) {
      if (urlLower.includes(pattern.toLowerCase())) {
        return true;
      }
    }

    for (const domain of this.adPatterns.adDomains) {
      if (urlLower.includes(domain.toLowerCase())) {
        return true;
      }
    }

    return false;
  }

  _hasAdSibling(element) {
    const parent = element.parentElement;
    if (!parent) return false;

    // Check siblings for ad content
    const siblings = parent.querySelectorAll('*');
    for (const sib of siblings) {
      if (sib === element) continue;
      const text = sib.textContent || '';
      const id = sib.getAttribute('id') || '';
      for (const pattern of this.adPatterns.adIdentifiers) {
        if (text.toLowerCase().includes(pattern.toLowerCase()) ||
            id.toLowerCase().includes(pattern.toLowerCase())) {
          return true;
        }
      }
    }
    return false;
  }

  _isAdSupplementalProperty(prop) {
    const schemeId = prop.getAttribute('schemeIdUri') || '';
    const value = prop.getAttribute('value') || '';

    const adSchemes = ['ad', 'scte35', 'adobe:dpi'];
    for (const scheme of adSchemes) {
      if (schemeId.includes(scheme)) return true;
    }

    const valueLower = value.toLowerCase();
    for (const pattern of this.adPatterns.adIdentifiers) {
      if (valueLower.includes(pattern.toLowerCase())) return true;
    }

    return false;
  }

  _parseDuration(duration) {
    // Parse ISO 8601 duration (PT15S, PT1M30S, etc.)
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
    if (!match) return 0;
    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    const seconds = parseFloat(match[3] || '0');
    return hours * 3600 + minutes * 60 + seconds;
  }

  // ============================================================================
  // Unified Interface
  // ============================================================================

  /**
   * Auto-detect manifest type and strip ads
   * @param {string} manifest - Manifest content
   * @param {string} baseUrl - Base URL for resolving relative URLs
   * @returns {string} Cleaned manifest
   */
  stripAds(manifest, baseUrl = '') {
    if (!manifest) return manifest;

    // Detect VMAP
    if (manifest.includes('<vmap:VMAP') || manifest.includes('<VMAP')) {
      return this.stripVMAPAds(manifest);
    }

    // Detect VAST
    if (manifest.includes('<VAST') || manifest.includes('<vast:')) {
      return this.stripVASTAds(manifest);
    }

    // Detect DASH MPD
    if (this._isDASHManifest(manifest)) {
      return this.filterDASHManifest(manifest);
    }

    // Detect HLS manifest
    if (this._isHLSManifest(manifest)) {
      // Check if it's a master playlist or media playlist
      if (manifest.includes('#EXT-X-STREAM-INF')) {
        return this.filterHLSMasterPlaylist(manifest);
      }
      return this.filterHLSManifest(manifest, baseUrl);
    }

    // Detect VPAD (JSON)
    try {
      const parsed = JSON.parse(manifest);
      if (parsed.adSchedule || parsed.adBreaks || parsed.adTagUrl) {
        return this.stripVPADAds(manifest);
      }
    } catch {}

    return manifest;
  }

  /**
   * Process multiple manifests in batch
   * @param {Array<{content: string, type: string, baseUrl: string}>} manifests
   * @returns {Array<string>} Cleaned manifests
   */
  stripAdsBatch(manifests) {
    return manifests.map(m => this.stripAds(m.content, m.baseUrl || ''));
  }

  // ============================================================================
  // Helper Methods for VMAP/VAST/VPAD
  // ============================================================================

  _isAdSource(adSource) {
    const type = adSource.getAttribute('id') || '';
    const allowType = adSource.getAttribute('allowType') || '';
    const text = adSource.textContent || '';

    // Check for ad-related attributes
    return type.includes('ad') ||
           allowType.includes('ad') ||
           text.includes('doubleclick') ||
           text.includes('googlesyndication') ||
           text.includes('vast') ||
           this._containsAdIdentifier(text);
  }

  _isAdTracking(tracking) {
    const event = tracking.getAttribute('event') || '';
    const text = tracking.textContent || '';
    const eventLower = event.toLowerCase();
    const textLower = text.toLowerCase();

    return eventLower.includes('ad') ||
           textLower.includes('doubleclick') ||
           textLower.includes('googlesyndication') ||
           textLower.includes('googleads') ||
           textLower.includes('analytics') ||
           textLower.includes('tracking') ||
           this._containsAdIdentifier(text);
  }

  _isAdExtension(ext) {
    const text = ext.textContent || '';
    const textLower = text.toLowerCase();
    return textLower.includes('ad') ||
           textLower.includes('google') ||
           textLower.includes('doubleclick') ||
           textLower.includes('vast') ||
           this._containsAdIdentifier(text);
  }

  _isAdCreative(creative) {
    const id = creative.getAttribute('id') || '';
    const sequence = creative.getAttribute('sequence') || '';

    // Check creative type
    const linear = creative.querySelector('Linear');
    const nonLinear = creative.querySelector('NonLinearAds');
    const companion = creative.querySelector('CompanionAds');

    return !!linear || !!nonLinear || !!companion || id.includes('ad') || this._containsAdIdentifier(id);
  }

  _isAdMediaFile(mediaFile) {
    const type = mediaFile.getAttribute('type') || '';
    const url = mediaFile.textContent || '';

    return type.includes('video') && (
      url.includes('ad') ||
      url.includes('doubleclick') ||
      url.includes('googlesyndication') ||
      this._containsAdIdentifier(url)
    );
  }

  _isAdPlugin(plugin) {
    return plugin.type === 'ads' ||
           plugin.name?.includes('ad') ||
           plugin.adTagUrl ||
           plugin.adSchedule;
  }

  _containsAdIdentifier(text) {
    if (!text) return false;
    const textLower = text.toLowerCase();
    return this.adPatterns.adIdentifiers.some(pattern =>
      textLower.includes(pattern.toLowerCase())
    ) || this.adPatterns.adDomains.some(domain =>
      textLower.includes(domain.toLowerCase())
    );
  }

  /**
   * Extract ad information for reporting
   */
  extractAdInfo(manifest) {
    const ads = [];

    if (manifest.includes('<vmap:VMAP') || manifest.includes('<VMAP')) {
      const parser = new this.context.DOMParser();
      const doc = parser.parseFromString(manifest, 'application/xml');
      const adBreaks = doc.querySelectorAll('AdBreak');

      for (const adBreak of adBreaks) {
        const timeOffset = adBreak.getAttribute('timeOffset');
        const breakType = adBreak.getAttribute('breakType');
        const adSource = adBreak.querySelector('AdSource');
        const adUrl = adSource?.textContent || '';

        ads.push({ type: 'vmap', timeOffset, breakType, url: adUrl });
      }
    }

    if (manifest.includes('<VAST') || manifest.includes('<vast:')) {
      const parser = new this.context.DOMParser();
      const doc = parser.parseFromString(manifest, 'application/xml');
      const vastAds = doc.querySelectorAll('Ad');

      for (const ad of vastAds) {
        const id = ad.getAttribute('id');
        const inLine = ad.querySelector('InLine');
        const wrapper = ad.querySelector('Wrapper');

        if (inLine) {
          const adSystem = inLine.querySelector('AdSystem')?.textContent || '';
          const adTitle = inLine.querySelector('AdTitle')?.textContent || '';
          ads.push({ type: 'vast', id, adSystem, adTitle, inline: true });
        } else if (wrapper) {
          const wrapperUrl = wrapper.querySelector('VASTAdTagURI')?.textContent || '';
          ads.push({ type: 'vast', wrapper: true, url: wrapperUrl });
        }
      }
    }

    // Extract HLS ad info
    if (this._isHLSManifest(manifest)) {
      const lines = manifest.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (this._isHLSAdMarker(line)) {
          ads.push({ type: 'hls', marker: line.trim() });
        }
      }
    }

    // Extract DASH ad info
    if (this._isDASHManifest(manifest)) {
      try {
        const parser = new this.context.DOMParser();
        const doc = parser.parseFromString(manifest, 'application/xml');
        const periods = doc.querySelectorAll('Period');
        for (const period of periods) {
          if (this._isAdPeriod(period)) {
            ads.push({ type: 'dash', periodId: period.getAttribute('id') });
          }
        }
      } catch {}
    }

    return ads;
  }

  getStats() {
    return { ...this.stats };
  }

  resetStats() {
    this.stats = { parsed: 0, adsRemoved: 0, errors: 0 };
  }
}

// ============================================================================
// Server-Side Manifest Destruction (Node.js compatible)
// ============================================================================

let xmldomModule = null;

async function loadXmlDom() {
  if (!xmldomModule) {
    xmldomModule = await import('xmldom');
  }
  return xmldomModule;
}

export class ServerSideManifestProcessor {
  constructor() {
    this.parser = null;
    this._initPromise = this._initialize();
  }

  async _initialize() {
    try {
      const xmldom = await loadXmlDom();
      this.parser = new VMAPVASTParser({
        DOMParser: globalThis.DOMParser || xmldom.DOMParser,
        XMLSerializer: globalThis.XMLSerializer || xmldom.XMLSerializer
      });
    } catch (e) {
      // Fallback for environments without xmldom
      this.parser = new VMAPVASTParser({
        DOMParser: globalThis.DOMParser,
        XMLSerializer: globalThis.XMLSerializer
      });
    }
  }

  async _ensureParser() {
    if (!this.parser) {
      await this._initPromise;
    }
    return this.parser;
  }

  /**
   * Process VMAP manifest server-side
   */
  async processVMAP(vmapXml) {
    const parser = await this._ensureParser();
    return parser.stripVMAPAds(vmapXml);
  }

  /**
   * Process VAST manifest server-side
   */
  async processVAST(vastXml) {
    const parser = await this._ensureParser();
    return parser.stripVASTAds(vastXml);
  }

  /**
   * Process HLS manifest server-side
   */
  async processHLS(manifest, baseUrl) {
    const parser = await this._ensureParser();
    if (manifest.includes('#EXT-X-STREAM-INF')) {
      return parser.filterHLSMasterPlaylist(manifest);
    }
    return parser.filterHLSManifest(manifest, baseUrl);
  }

  /**
   * Process DASH manifest server-side
   */
  async processDASH(manifest) {
    const parser = await this._ensureParser();
    return parser.filterDASHManifest(manifest);
  }

  /**
   * Process any manifest server-side (auto-detect)
   */
  async processManifest(manifest, baseUrl = '') {
    const parser = await this._ensureParser();
    return parser.stripAds(manifest, baseUrl);
  }

  async getStats() {
    const parser = await this._ensureParser();
    return parser.getStats();
  }
}

// ============================================================================
// Singleton
// ============================================================================

let vmapVastParserInstance = null;

export function getVMAPVASTParser(context = window) {
  if (!vmapVastParserInstance) {
    vmapVastParserInstance = new VMAPVASTParser(context);
  }
  return vmapVastParserInstance;
}

export function resetVMAPVASTParser() {
  if (vmapVastParserInstance) {
    vmapVastParserInstance = null;
  }
}

let serverSideProcessorInstance = null;

export function getServerSideProcessor() {
  if (!serverSideProcessorInstance) {
    serverSideProcessorInstance = new ServerSideManifestProcessor();
  }
  return serverSideProcessorInstance;
}

export function resetServerSideProcessor() {
  if (serverSideProcessorInstance) {
    serverSideProcessorInstance = null;
  }
}

// ============================================================================
// Export for different environments
// ============================================================================

export default VMAPVASTParser;

// Node.js/Server-side usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    VMAPVASTParser,
    ServerSideManifestProcessor,
    getVMAPVASTParser,
    resetVMAPVASTParser,
    getServerSideProcessor,
    resetServerSideProcessor
  };
}