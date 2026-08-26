/**
 * SponsorBlock Native — Offline, zero-dep, privacy-first
 * Local IndexedDB database of sponsor segments with efficient segment skipping
 * No network requests, no external dependencies, fully self-contained
 */

// ============================================================================
// IndexedDB Wrapper — Zero-dep, Promise-based
// ============================================================================

class SponsorBlockDB {
  constructor(dbName = 'SponsorBlockNative', version = 1) {
    this.dbName = dbName;
    this.version = version;
    this.db = null;
    this.ready = this._init();
  }

  _init() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB not available'));
        return;
      }

      const request = indexedDB.open(this.dbName, this.version);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Segments store: videoId -> { segments, updatedAt, version }
        if (!db.objectStoreNames.contains('segments')) {
          const store = db.createObjectStore('segments', { keyPath: 'videoId' });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        // Metadata store: key-value for stats, settings, etc.
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'key' });
        }

        // Cache store: for temporary data like pending writes
        if (!db.objectStoreNames.contains('cache')) {
          const store = db.createObjectStore('cache', { keyPath: 'key' });
          store.createIndex('expiresAt', 'expiresAt', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        this.db.onerror = (e) => console.error('[SponsorBlockDB] Database error:', e.target.error);
        resolve(this.db);
      };

      request.onerror = (event) => {
        reject(new Error(`IndexedDB open failed: ${event.target.error}`));
      };

      request.onblocked = () => {
        console.warn('[SponsorBlockDB] Database blocked - close other tabs');
      };
    });
  }

  async _ensureReady() {
    if (!this.db) await this.ready;
    return this.db;
  }

  // ---- Segments ----

  async getSegments(videoId) {
    const db = await this._ensureReady();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('segments', 'readonly');
      const store = tx.objectStore('segments');
      const request = store.get(videoId);
      request.onsuccess = () => resolve(request.result?.segments || []);
      request.onerror = () => reject(request.error);
    });
  }

  async setSegments(videoId, segments, metadata = {}) {
    const db = await this._ensureReady();
    const record = {
      videoId,
      segments: this._normalizeSegments(segments),
      updatedAt: Date.now(),
      version: metadata.version || 1,
      source: metadata.source || 'unknown',
      ...metadata
    };
    return new Promise((resolve, reject) => {
      const tx = db.transaction('segments', 'readwrite');
      const store = tx.objectStore('segments');
      const request = store.put(record);
      request.onsuccess = () => resolve(record);
      request.onerror = () => reject(request.error);
    });
  }

  async addSegments(videoId, newSegments, metadata = {}) {
    const existing = await this.getSegments(videoId);
    const merged = this._mergeSegments(existing, newSegments);
    return this.setSegments(videoId, merged, metadata);
  }

  async deleteSegments(videoId) {
    const db = await this._ensureReady();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('segments', 'readwrite');
      const store = tx.objectStore('segments');
      const request = store.delete(videoId);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllVideoIds() {
    const db = await this._ensureReady();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('segments', 'readonly');
      const store = tx.objectStore('segments');
      const request = store.getAllKeys();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getStats() {
    const db = await this._ensureReady();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('segments', 'readonly');
      const store = tx.objectStore('segments');
      const request = store.getAll();
      request.onsuccess = () => {
        const records = request.result;
        let totalSegments = 0;
        let totalVideos = records.length;
        const categoryCounts = {};

        for (const record of records) {
          totalSegments += record.segments?.length || 0;
          for (const seg of record.segments || []) {
            categoryCounts[seg.category] = (categoryCounts[seg.category] || 0) + 1;
          }
        }

        resolve({ totalVideos, totalSegments, categoryCounts });
      };
      request.onerror = () => reject(request.error);
    });
  }

  // ---- Metadata ----

  async setMetadata(key, value) {
    const db = await this._ensureReady();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('metadata', 'readwrite');
      const store = tx.objectStore('metadata');
      const request = store.put({ key, value, updatedAt: Date.now() });
      request.onsuccess = () => resolve(value);
      request.onerror = () => reject(request.error);
    });
  }

  async getMetadata(key, defaultValue = null) {
    const db = await this._ensureReady();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('metadata', 'readonly');
      const store = tx.objectStore('metadata');
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result?.value ?? defaultValue);
      request.onerror = () => reject(request.error);
    });
  }

  // ---- Cache with TTL ----

  async setCache(key, value, ttlMs = 86400000) { // 24h default
    const db = await this._ensureReady();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('cache', 'readwrite');
      const store = tx.objectStore('cache');
      const request = store.put({
        key,
        value,
        createdAt: Date.now(),
        expiresAt: Date.now() + ttlMs
      });
      request.onsuccess = () => resolve(value);
      request.onerror = () => reject(request.error);
    });
  }

  async getCache(key) {
    const db = await this._ensureReady();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('cache', 'readonly');
      const store = tx.objectStore('cache');
      const request = store.get(key);
      request.onsuccess = () => {
        const record = request.result;
        if (!record) return resolve(null);
        if (record.expiresAt < Date.now()) {
          // Expired - delete and return null
          this.deleteCache(key).catch(() => {});
          return resolve(null);
        }
        resolve(record.value);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteCache(key) {
    const db = await this._ensureReady();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('cache', 'readwrite');
      const store = tx.objectStore('cache');
      const request = store.delete(key);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  async clearExpiredCache() {
    const db = await this._ensureReady();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('cache', 'readwrite');
      const store = tx.objectStore('cache');
      const index = store.index('expiresAt');
      const range = IDBKeyRange.upperBound(Date.now());
      const request = index.openCursor(range);
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve(true);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  // ---- Import/Export ----

  async exportDatabase() {
    const db = await this._ensureReady();
    const [segments, metadata] = await Promise.all([
      this._exportStore('segments'),
      this._exportStore('metadata')
    ]);
    return {
      version: this.version,
      exportedAt: Date.now(),
      segments,
      metadata
    };
  }

  async _exportStore(storeName) {
    const db = await this._ensureReady();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async importDatabase(data, { merge = true } = {}) {
    if (!data?.segments) return { imported: 0, skipped: 0 };

    let imported = 0, skipped = 0;
    for (const record of data.segments) {
      if (!record.videoId || !Array.isArray(record.segments)) {
        skipped++;
        continue;
      }

      if (merge) {
        const existing = await this.getSegments(record.videoId);
        if (existing.length > 0) {
          const merged = this._mergeSegments(existing, record.segments);
          await this.setSegments(record.videoId, merged, { source: record.source, version: record.version });
          imported++;
          continue;
        }
      }

      await this.setSegments(record.videoId, record.segments, { source: record.source, version: record.version });
      imported++;
    }
    return { imported, skipped };
  }

  // ---- Helpers ----

  _normalizeSegments(segments) {
    return segments
      .filter(s => s && typeof s.start === 'number' && typeof s.end === 'number' && s.end > s.start)
      .map(s => ({
        start: Math.max(0, s.start),
        end: s.end,
        category: s.category || 'sponsor',
        UUID: s.UUID || this._generateUUID(),
        votes: s.votes || 0,
        locked: s.locked || false,
        shadowHidden: s.shadowHidden || false,
        submitter: s.submitter || 'unknown',
        videoDuration: s.videoDuration || 0
      }))
      .sort((a, b) => a.start - b.start);
  }

  _mergeSegments(existing, incoming) {
    const merged = [...existing];
    for (const seg of this._normalizeSegments(incoming)) {
      const duplicate = merged.find(s =>
        Math.abs(s.start - seg.start) < 0.5 &&
        Math.abs(s.end - seg.end) < 0.5 &&
        s.category === seg.category
      );
      if (!duplicate) {
        merged.push(seg);
      }
    }
    return merged.sort((a, b) => a.start - b.start);
  }

  _generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  async close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  async clear() {
    const db = await this._ensureReady();
    const storeNames = ['segments', 'metadata', 'cache'];
    await Promise.all(storeNames.map(name =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(name, 'readwrite');
        const store = tx.objectStore(name);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      })
    ));
  }
}

// ============================================================================
// Segment Lookup — Binary search on sorted segments (O(log n))
// ============================================================================

class SegmentIndex {
  constructor(segments = []) {
    this.segments = [...segments].sort((a, b) => a.start - b.start);
    this._rebuildIndex();
  }

  _rebuildIndex() {
    // For binary search, we just need sorted array
    // Could add interval tree for complex queries but overkill here
    this.segments.sort((a, b) => a.start - b.start);
  }

  // Find segment containing time, or null
  findAtTime(time) {
    let left = 0, right = this.segments.length - 1;
    while (left <= right) {
      const mid = (left + right) >> 1;
      const seg = this.segments[mid];
      if (time < seg.start) {
        right = mid - 1;
      } else if (time >= seg.end) {
        left = mid + 1;
      } else {
        return seg; // time >= start && time < end
      }
    }
    return null;
  }

  // Find next segment after time
  findNextAfter(time) {
    let left = 0, right = this.segments.length - 1;
    let result = null;
    while (left <= right) {
      const mid = (left + right) >> 1;
      if (this.segments[mid].start > time) {
        result = this.segments[mid];
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }
    return result;
  }

  // Get all segments overlapping a range
  findOverlapping(start, end) {
    const result = [];
    // Binary search for first segment that could overlap
    let left = 0, right = this.segments.length - 1;
    let first = this.segments.length;
    while (left <= right) {
      const mid = (left + right) >> 1;
      if (this.segments[mid].end > start) {
        first = mid;
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }
    // Collect overlapping
    for (let i = first; i < this.segments.length; i++) {
      if (this.segments[i].start >= end) break;
      result.push(this.segments[i]);
    }
    return result;
  }

  // Filter by category
  filterByCategory(categories) {
    if (!categories || categories.size === 0) return [];
    const catSet = categories instanceof Set ? categories : new Set(categories);
    return this.segments.filter(s => catSet.has(s.category));
  }

  setSegments(segments) {
    this.segments = [...segments].sort((a, b) => a.start - b.start);
  }

  getSegments() {
    return [...this.segments];
  }

  get length() {
    return this.segments.length;
  }
}

// ============================================================================
// Built-in Segment Database (minimal, can be extended)
// ============================================================================

const BUILTIN_SEGMENTS = {
  // Format: videoId: [{ start, end, category, ... }]
  // This is a minimal sample - in production, load from SponsorBlock export
  // See: https://sponsor.ajay.app/database
};

// SponsorBlock category definitions
const CATEGORIES = Object.freeze({
  sponsor: 'Sponsor',
  selfpromo: 'Self Promotion',
  intro: 'Intro',
  outro: 'Outro',
  interaction: 'Interaction Reminder',
  music_offtopic: 'Music: Off-topic',
  preview: 'Preview/Recap',
  filler: 'Filler',
  exclusive_access: 'Exclusive Access',
  poi_highlight: 'Point of Interest',
  chapter: 'Chapter' // Not skippable by default
});

// Default categories to skip (user configurable)
const DEFAULT_SKIP_CATEGORIES = Object.freeze(new Set([
  'sponsor', 'selfpromo', 'intro', 'outro', 'interaction',
  'music_offtopic', 'preview', 'filler'
]));

// ============================================================================
// Video Element Manager — Handles video hooking and segment skipping
// ============================================================================

class VideoManager {
  constructor(context, options = {}) {
    this.context = context;
    this.options = {
      skipDelay: options.skipDelay ?? 0.1,      // Seconds to add after segment end
      checkInterval: options.checkInterval ?? 100, // ms between time checks (fallback)
      minSegmentLength: options.minSegmentLength ?? 0.5, // Minimum segment to skip
      maxSegmentLength: options.maxSegmentLength ?? 600, // Maximum segment (10 min)
      ...options
    };

    this.trackedVideos = new Map(); // video element -> { videoId, index, state }
    this.observer = null;
    this.intervalId = null;
    this.isActive = false;

    // Bind methods
    this._onTimeUpdate = this._onTimeUpdate.bind(this);
    this._onSeeking = this._onSeeking.bind(this);
    this._onSeeked = this._onSeeked.bind(this);
    this._onPlay = this._onPlay.bind(this);
    this._onRateChange = this._onRateChange.bind(this);
  }

  /**
   * Start monitoring for video elements
   */
  start() {
    if (this.isActive) return;
    this.isActive = true;

    // Check existing videos
    this._scanForVideos(this.context.document);

    // Observe for new videos
    this.observer = new this.context.MutationObserver(this._onMutations.bind(this));
    this.observer.observe(this.context.document.documentElement || this.context.document.body, {
      childList: true,
      subtree: true
    });

    // Fallback polling for edge cases (some players don't fire timeupdate reliably)
    this.intervalId = this.context.setInterval(() => {
      for (const [video, data] of this.trackedVideos) {
        if (video.paused || video.ended) continue;
        this._checkAndSkip(video, data);
      }
    }, this.options.checkInterval);

    console.log('[SponsorBlockNative] VideoManager started');
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (!this.isActive) return;
    this.isActive = false;

    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.intervalId) {
      this.context.clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Clean up tracked videos
    for (const [video, data] of this.trackedVideos) {
      this._detachVideo(video);
    }
    this.trackedVideos.clear();

    console.log('[SponsorBlockNative] VideoManager stopped');
  }

  /**
   * Register segments for a video ID
   */
  registerSegments(videoId, segments) {
    const index = new SegmentIndex(segments);

    // Update already-tracked videos with this ID
    for (const [video, data] of this.trackedVideos) {
      if (data.videoId === videoId) {
        data.index = index;
        this._attachVideoEvents(video);
      }
    }

    // Return index for external use
    return index;
  }

  /**
   * Manually attach a video element
   */
  attachVideo(video, videoId) {
    if (!video || video.tagName !== 'VIDEO') return false;

    const existing = this.trackedVideos.get(video);
    if (existing && existing.videoId === videoId) return true;

    this.trackedVideos.set(video, {
      videoId,
      index: null,
      state: 'idle',
      lastSkipTime: 0,
      skipCount: 0
    });

    this._attachVideoEvents(video);
    return true;
  }

  /**
   * Detach a video element
   */
  detachVideo(video) {
    const data = this.trackedVideos.get(video);
    if (data) {
      this._detachVideo(video);
      this.trackedVideos.delete(video);
    }
  }

  /**
   * Get tracked video data
   */
  getVideoData(video) {
    return this.trackedVideos.get(video) || null;
  }

  /**
   * Get all tracked videos
   */
  getAllVideos() {
    return Array.from(this.trackedVideos.entries()).map(([video, data]) => ({
      video,
      videoId: data.videoId,
      segmentCount: data.index?.length || 0,
      skipCount: data.skipCount,
      state: data.state
    }));
  }

  // ---- Internal ----

  _scanForVideos(root) {
    const videos = root.querySelectorAll?.('video') || [];
    for (const video of videos) {
      this._tryAttachVideo(video);
    }
  }

  _onMutations(mutations) {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== this.context.Node.ELEMENT_NODE) continue;

        if (node.tagName === 'VIDEO') {
          this._tryAttachVideo(node);
        } else if (node.querySelectorAll) {
          node.querySelectorAll('video').forEach(v => this._tryAttachVideo(v));
        }
      }
    }
  }

  _tryAttachVideo(video) {
    // Skip if already tracked
    if (this.trackedVideos.has(video)) return;

    // Must have a src or be a YouTube player
    const videoId = this._extractVideoId(video);
    if (!videoId) return;

    // Check if we have segments for this video (will be set later via registerSegments)
    this.trackedVideos.set(video, {
      videoId,
      index: null,
      state: 'idle',
      lastSkipTime: 0,
      skipCount: 0
    });

    this._attachVideoEvents(video);
  }

  _attachVideoEvents(video) {
    // Avoid duplicate listeners
    if (video._sponsorBlockAttached) return;
    video._sponsorBlockAttached = true;

    video.addEventListener('timeupdate', this._onTimeUpdate, { passive: true });
    video.addEventListener('seeking', this._onSeeking, { passive: true });
    video.addEventListener('seeked', this._onSeeked, { passive: true });
    video.addEventListener('play', this._onPlay, { passive: true });
    video.addEventListener('ratechange', this._onRateChange, { passive: true });
  }

  _detachVideo(video) {
    if (!video._sponsorBlockAttached) return;
    video._sponsorBlockAttached = false;

    video.removeEventListener('timeupdate', this._onTimeUpdate);
    video.removeEventListener('seeking', this._onSeeking);
    video.removeEventListener('seeked', this._onSeeked);
    video.removeEventListener('play', this._onPlay);
    video.removeEventListener('ratechange', this._onRateChange);

    // Clean up properties
    delete video._sponsorBlockSegments;
    delete video._sponsorBlockSkipping;
    delete video._sponsorBlockLastCheck;
  }

  _onTimeUpdate(event) {
    const video = event.target;
    const data = this.trackedVideos.get(video);
    if (data) this._checkAndSkip(video, data);
  }

  _onSeeking(event) {
    const video = event.target;
    const data = this.trackedVideos.get(video);
    if (data) data.state = 'seeking';
  }

  _onSeeked(event) {
    const video = event.target;
    const data = this.trackedVideos.get(video);
    if (data) {
      data.state = 'idle';
      // Check immediately after seek in case we landed in a segment
      this._checkAndSkip(video, data);
    }
  }

  _onPlay(event) {
    const video = event.target;
    const data = this.trackedVideos.get(video);
    if (data && data.state !== 'seeking') {
      this._checkAndSkip(video, data);
    }
  }

  _onRateChange(event) {
    const video = event.target;
    const data = this.trackedVideos.get(video);
    if (data && video.playbackRate !== 1) {
      // Playback rate changed - segments still work but timing is scaled
      // Could adjust check frequency here
    }
  }

  _checkAndSkip(video, data) {
    if (!data.index || data.index.length === 0) return;
    if (video.paused || video.ended || video._sponsorBlockSkipping) return;
    if (data.state === 'seeking') return;

    // Throttle checks (timeupdate fires ~4-60fps, we don't need every frame)
    const now = this.context.performance.now();
    if (data.lastCheck && now - data.lastCheck < 50) return;
    data.lastCheck = now;

    const currentTime = video.currentTime;
    const segment = data.index.findAtTime(currentTime);

    if (segment) {
      // Verify segment meets criteria
      if (this._shouldSkipSegment(segment, video)) {
        this._performSkip(video, data, segment);
      }
    }
  }

  _shouldSkipSegment(segment, video) {
    // Check length constraints
    const length = segment.end - segment.start;
    if (length < this.options.minSegmentLength) return false;
    if (length > this.options.maxSegmentLength) return false;

    // Check if segment is valid for this video duration
    if (video.duration && !isNaN(video.duration)) {
      if (segment.start >= video.duration) return false;
      if (segment.end > video.duration + 1) return false; // Small tolerance
    }

    return true;
  }

  _performSkip(video, data, segment) {
    video._sponsorBlockSkipping = true;
    data.state = 'skipping';
    data.lastSkipTime = this.context.performance.now();
    data.skipCount++;

    // Skip to just after segment end
    const targetTime = Math.min(segment.end + this.options.skipDelay, video.duration || segment.end + this.options.skipDelay);
    video.currentTime = targetTime;

    // Dispatch event for UI notification
    this.context.dispatchEvent(new CustomEvent('aeroguard:sponsorblock-skip', {
      detail: {
        videoId: data.videoId,
        segment: { ...segment },
        skippedAt: segment.start,
        skippedTo: targetTime,
        duration: segment.end - segment.start
      }
    }));

    console.log(`[SponsorBlockNative] Skipped ${segment.category} segment: ${segment.start.toFixed(1)}s - ${segment.end.toFixed(1)}s (video: ${data.videoId})`);

    // Reset after a short delay to allow seek to complete
    this.context.setTimeout(() => {
      video._sponsorBlockSkipping = false;
      data.state = 'idle';
    }, 100);
  }

  _extractVideoId(video) {
    // 1. From video src
    if (video.src) {
      const match = video.src.match(/(?:v=|v\/|embed\/|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{11})/);
      if (match) return match[1];
    }

    // 2. From YouTube player data
    const ytData = this.context.ytInitialData?.videoDetails?.videoId;
    if (ytData) return ytData;

    const ytPlayer = this.context.ytplayer?.config?.args?.video_id;
    if (ytPlayer) return ytPlayer;

    // 3. From data attributes
    if (video.dataset?.videoId) return video.dataset.videoId;
    if (video.dataset?.ytid) return video.dataset.ytid;

    // 4. From parent player element
    const player = video.closest('#movie_player, .html5-video-player, ytd-player');
    if (player?.dataset?.videoId) return player.dataset.videoId;

    return null;
  }
}

// ============================================================================
// Main SponsorBlock Native Class
// ============================================================================

export class SponsorBlockNative {
  constructor(context = window, options = {}) {
    this.context = context;
    this.options = {
      autoInitialize: options.autoInitialize ?? true,
      skipCategories: options.skipCategories ?? DEFAULT_SKIP_CATEGORIES,
      enableBuiltin: options.enableBuiltin ?? true,
      ...options
    };

    this.db = new SponsorBlockDB();
    this.videoManager = new VideoManager(context, options);
    this.skipCategories = new Set(this.options.skipCategories);
    this.isInitialized = false;
    this.stats = {
      skipped: 0,
      loaded: 0,
      errors: 0,
      videosProcessed: 0,
      segmentsRegistered: 0
    };

    // Built-in segments (loaded once)
    this._builtinLoaded = false;

    if (this.options.autoInitialize) {
      // Defer to next tick to allow constructor to complete
      Promise.resolve().then(() => this.initialize());
    }
  }

  /**
   * Get video manager's tracked videos map
   */
  get trackedVideos() {
    return this.videoManager.trackedVideos;
  }

  /**
   * Initialize SponsorBlock
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      // Initialize database
      await this.db.ready;

      // Load built-in segments if enabled
      if (this.options.enableBuiltin) {
        await this._loadBuiltinSegments();
      }

      // Load custom segments from database
      await this._loadCustomSegments();

      // Start video monitoring
      this.videoManager.start();

      this.isInitialized = true;
      console.log('[SponsorBlockNative] Initialized:', this.getStats());
    } catch (error) {
      this.stats.errors++;
      console.error('[SponsorBlockNative] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Load built-in segment database
   */
  async _loadBuiltinSegments() {
    if (this._builtinLoaded) return;

    try {
      // Check if we've already imported builtin
      const imported = await this.db.getMetadata('builtinImported', false);
      if (imported) {
        this._builtinLoaded = true;
        return;
      }

      // Import built-in segments
      if (Object.keys(BUILTIN_SEGMENTS).length > 0) {
        for (const [videoId, segments] of Object.entries(BUILTIN_SEGMENTS)) {
          await this.db.setSegments(videoId, segments, { source: 'builtin', version: 1 });
        }
      }

      await this.db.setMetadata('builtinImported', true);
      this._builtinLoaded = true;
    } catch (error) {
      console.warn('[SponsorBlockNative] Failed to load builtin segments:', error);
    }
  }

  /**
   * Load custom segments and register with video manager
   */
  async _loadCustomSegments() {
    try {
      const videoIds = await this.db.getAllVideoIds();
      let loaded = 0;

      for (const videoId of videoIds) {
        const segments = await this.db.getSegments(videoId);
        if (segments.length > 0) {
          // Filter by skip categories
          const filtered = segments.filter(s => this.skipCategories.has(s.category));
          if (filtered.length > 0) {
            this.videoManager.registerSegments(videoId, filtered);
            loaded++;
            this.stats.segmentsRegistered += filtered.length;
          }
        }
      }

      this.stats.loaded = loaded;
      this.stats.videosProcessed = videoIds.length;
    } catch (error) {
      this.stats.errors++;
      console.warn('[SponsorBlockNative] Failed to load custom segments:', error);
    }
  }

  /**
   * Add segments for a video (from API, user submission, or import)
   */
  async addSegments(videoId, segments, metadata = {}) {
    if (!videoId || !Array.isArray(segments) || segments.length === 0) {
      return { added: 0, skipped: 0 };
    }

    // Normalize and filter
    const normalized = segments
      .filter(s => s && typeof s.start === 'number' && typeof s.end === 'number' && s.end > s.start)
      .map(s => ({
        start: Math.max(0, s.start),
        end: s.end,
        category: s.category || 'sponsor',
        UUID: s.UUID || this._generateUUID(),
        votes: s.votes || 0,
        locked: s.locked || false,
        submitter: s.submitter || 'local',
        videoDuration: s.videoDuration || 0,
        ...s
      }));

    // Filter by skip categories for video manager
    const toRegister = normalized.filter(s => this.skipCategories.has(s.category));

    try {
      await this.db.addSegments(videoId, normalized, { source: metadata.source || 'manual', version: metadata.version || 1 });

      if (toRegister.length > 0) {
        this.videoManager.registerSegments(videoId, toRegister);
        this.stats.segmentsRegistered += toRegister.length;
      }

      return { added: normalized.length, registered: toRegister.length };
    } catch (error) {
      this.stats.errors++;
      console.error('[SponsorBlockNative] Failed to add segments:', error);
      return { added: 0, skipped: normalized.length, error: error.message };
    }
  }

  /**
   * Get segments for a video
   */
  async getSegments(videoId) {
    return this.db.getSegments(videoId);
  }

  /**
   * Get filtered (skippable) segments for a video
   */
  async getSkippableSegments(videoId) {
    const segments = await this.db.getSegments(videoId);
    return segments.filter(s => this.skipCategories.has(s.category));
  }

  /**
   * Set categories to skip
   */
  setSkipCategories(categories) {
    this.skipCategories = new Set(categories);
    // Re-register all videos with new filter
    this._reloadAllVideos();
  }

  /**
   * Get available categories
   */
  getCategories() {
    return { ...CATEGORIES };
  }

  /**
   * Get current skip categories
   */
  getSkipCategories() {
    return new Set(this.skipCategories);
  }

  /**
   * Manually attach a video element
   */
  attachVideo(video, videoId) {
    return this.videoManager.attachVideo(video, videoId);
  }

  /**
   * Detach a video element
   */
  detachVideo(video) {
    this.videoManager.detachVideo(video);
  }

  /**
   * Get tracked video info
   */
  getTrackedVideos() {
    return this.videoManager.getAllVideos();
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      skipCategories: Array.from(this.skipCategories),
      isInitialized: this.isInitialized,
      trackedVideos: this.videoManager.trackedVideos.size
    };
  }

  /**
   * Export database for backup
   */
  async exportDatabase() {
    return this.db.exportDatabase();
  }

  /**
   * Import database from backup
   */
  async importDatabase(data, options = {}) {
    const result = await this.db.importDatabase(data, options);
    if (result.imported > 0) {
      await this._loadCustomSegments();
    }
    return result;
  }

  /**
   * Import from SponsorBlock API format
   * Expected format: { [videoId]: [{ segment, category, ... }] }
   */
  async importFromSponsorBlock(data, options = {}) {
    if (!data || typeof data !== 'object') return { imported: 0, errors: 0 };

    let imported = 0, errors = 0;

    for (const [videoId, segments] of Object.entries(data)) {
      if (!Array.isArray(segments)) { errors++; continue; }

      // Convert SponsorBlock format to internal format
      const normalized = segments
        .filter(s => s.segment && Array.isArray(s.segment) && s.segment.length === 2)
        .map(s => ({
          start: s.segment[0],
          end: s.segment[1],
          category: s.category || 'sponsor',
          UUID: s.UUID || this._generateUUID(),
          votes: s.votes || 0,
          locked: s.locked || false,
          submitter: s.submitter || 'sponsorblock',
          videoDuration: s.videoDuration || 0
        }));

      if (normalized.length > 0) {
        const result = await this.addSegments(videoId, normalized, { source: 'sponsorblock-api', version: 1 });
        imported += result.added;
      }
    }

    return { imported, errors };
  }

  /**
   * Reload all tracked videos with current filters
   */
  async _reloadAllVideos() {
    for (const [video, data] of this.videoManager.trackedVideos) {
      const segments = await this.db.getSegments(data.videoId);
      const filtered = segments.filter(s => this.skipCategories.has(s.category));
      if (filtered.length > 0) {
        data.index = new SegmentIndex(filtered);
      } else {
        data.index = new SegmentIndex([]);
      }
    }
  }

  /**
   * Cleanup and shutdown
   */
  async cleanup() {
    this.videoManager.stop();
    await this.db.close();
    this.isInitialized = false;
    console.log('[SponsorBlockNative] Cleaned up');
  }

  // ---- Helpers ----

  _generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }
}

// ============================================================================
// Singleton / Factory
// ============================================================================

let sponsorBlockNativeInstance = null;

export function getSponsorBlockNative(context = window, options = {}) {
  if (!sponsorBlockNativeInstance) {
    sponsorBlockNativeInstance = new SponsorBlockNative(context, options);
  }
  return sponsorBlockNativeInstance;
}

export function resetSponsorBlockNative() {
  if (sponsorBlockNativeInstance) {
    sponsorBlockNativeInstance.cleanup();
  }
  sponsorBlockNativeInstance = null;
}

// ============================================================================
// Utility: Create segment from SponsorBlock API response
// ============================================================================

export function createSegmentFromAPI(apiSegment) {
  // apiSegment: { segment: [start, end], category, UUID, votes, locked, ... }
  if (!apiSegment?.segment || !Array.isArray(apiSegment.segment) || apiSegment.segment.length !== 2) {
    return null;
  }

  return {
    start: apiSegment.segment[0],
    end: apiSegment.segment[1],
    category: apiSegment.category || 'sponsor',
    UUID: apiSegment.UUID,
    votes: apiSegment.votes || 0,
    locked: apiSegment.locked || false,
    submitter: apiSegment.submitter || 'unknown',
    videoDuration: apiSegment.videoDuration || 0
  };
}

// ============================================================================
// Export constants
// ============================================================================

export { CATEGORIES, DEFAULT_SKIP_CATEGORIES, SponsorBlockDB, SegmentIndex, VideoManager };

export default SponsorBlockNative;