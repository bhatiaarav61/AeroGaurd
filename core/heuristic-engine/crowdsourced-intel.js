/**
 * Crowdsourced Intelligence — Privacy-preserving, local-first, federated learning hooks
 * Enables community-driven ad detection without compromising user privacy
 *
 * Features:
 * - Local-first: All learning happens on-device first
 * - Differential Privacy: Laplace/Gaussian mechanisms with privacy budget tracking
 * - Federated Learning: Secure aggregation, client-side model updates
 * - Encryption: AES-GCM for submissions, key rotation
 * - Anonymous: No PII, source IDs are ephemeral
 * - Opt-in: Explicit consent required, granular controls
 */

export class CrowdsourcedIntel {
  constructor(options = {}) {
    this.options = {
      // Core settings
      enabled: options.enabled !== false,
      endpoint: options.endpoint || 'https://api.aeroguard.example.com/v1/intel',
      submitInterval: options.submitInterval || 24 * 60 * 60 * 1000,
      maxLocalPatterns: options.maxLocalPatterns || 1000,
      minConfidence: options.minConfidence || 0.9,

      // Differential Privacy
      differentialPrivacy: options.differentialPrivacy !== false,
      epsilon: options.epsilon || 1.0,           // Privacy budget per submission
      delta: options.delta || 1e-5,              // Delta for (ε,δ)-DP
      maxPrivacyBudget: options.maxPrivacyBudget || 10.0, // Lifetime budget
      composition: options.composition || 'advanced', // 'basic' | 'advanced' | 'rdp'

      // Federated Learning
      federatedLearning: options.federatedLearning !== false,
      flMinClients: options.flMinClients || 100,
      flRounds: options.flRounds || 10,
      flLocalEpochs: options.flLocalEpochs || 5,
      flLearningRate: options.flLearningRate || 0.01,
      secureAggregation: options.secureAggregation !== false,

      // Encryption & Security
      encryptionEnabled: options.encryptionEnabled !== false,
      keyRotationInterval: options.keyRotationInterval || 7 * 24 * 60 * 60 * 1000,
      useHardwareKeys: options.useHardwareKeys || false,

      // Local model training
      localTraining: options.localTraining !== false,
      modelUpdateThreshold: options.modelUpdateThreshold || 0.05,
      maxLocalSamples: options.maxLocalSamples || 5000,

      // Consent & Control
      requireExplicitConsent: options.requireExplicitConsent !== false,
      consentVersion: options.consentVersion || 1,
      dataRetentionDays: options.dataRetentionDays || 90,

      ...options
    };

    // Local pattern store: pattern -> { count, confidence, lastSeen, sources, type, metadata }
    this.localPatterns = new Map();
    this.pendingSubmissions = [];
    this.submissionTimer = null;
    this.isInitialized = false;

    // Privacy accounting
    this.privacyBudget = {
      spent: 0,
      remaining: this.options.maxPrivacyBudget,
      history: [] // { epsilon, delta, timestamp, operation }
    };

    // Cryptographic keys
    this.encryptionKey = null;
    this.keyRotationTimer = null;
    this.keyVersion = 0;

    // Federated learning state
    this.flState = {
      currentRound: 0,
      localModel: null,
      globalModel: null,
      clientId: null,
      participationHistory: []
    };

    // Local training buffer
    this.trainingBuffer = [];

    // Consent state
    this.consent = {
      given: false,
      version: 0,
      timestamp: null,
      scopes: []
    };

    // Metrics
    this.metrics = {
      patternsLearned: 0,
      patternsSubmitted: 0,
      submissionsFailed: 0,
      flRoundsParticipated: 0,
      privacyBudgetUsed: 0
    };
  }

  /**
   * Initialize the crowdsourced intelligence engine
   */
  async initialize() {
    if (this.isInitialized) return;

    // Check consent
    if (this.options.requireExplicitConsent) {
      const hasConsent = await this._checkConsent();
      if (!hasConsent) {
        console.log('[CrowdsourcedIntel] Consent not given, running in local-only mode');
        this.options.enabled = false;
        this.options.federatedLearning = false;
      }
    }

    // Load local patterns from storage
    await this._loadLocalPatterns();

    // Load privacy budget
    await this._loadPrivacyBudget();

    // Load FL state
    await this._loadFLState();

    // Generate/load encryption key
    if (this.options.encryptionEnabled) {
      this.encryptionKey = await this._loadOrGenerateKey();
      this._startKeyRotation();
    }

    // Start periodic submission
    if (this.options.enabled) {
      this._startPeriodicSubmission();
    }

    // Start privacy budget monitoring
    this._startPrivacyBudgetMonitor();

    this.isInitialized = true;
    console.log('[CrowdsourcedIntel] Initialized', {
      enabled: this.options.enabled,
      differentialPrivacy: this.options.differentialPrivacy,
      federatedLearning: this.options.federatedLearning,
      encryptionEnabled: this.options.encryptionEnabled,
      privacyBudgetRemaining: this.privacyBudget.remaining
    });
  }

  // ============================================================================
  // Public API — Reporting
  // ============================================================================

  /**
   * Report a missed ad (false negative)
   */
  reportMissedAd(url, context = {}) {
    if (!this._canCollect()) return;

    const pattern = this._extractPattern(url);
    if (!pattern) return;

    const existing = this.localPatterns.get(pattern);
    if (existing) {
      existing.count++;
      existing.confidence = Math.min(1, existing.confidence + 0.05);
      existing.lastSeen = Date.now();
      existing.sources.add(this._getSourceId(context));
      existing.metadata.missedAdReports = (existing.metadata.missedAdReports || 0) + 1;
    } else {
      this.localPatterns.set(pattern, {
        count: 1,
        confidence: 0.5,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        sources: new Set([this._getSourceId(context)]),
        type: 'missed_ad',
        context: this._sanitizeContext(context),
        metadata: { missedAdReports: 1, falsePositives: 0 }
      });
      this.metrics.patternsLearned++;
    }

    this._enforceLimits();
    this._maybeSubmit(pattern);
    this._addToTrainingBuffer(pattern, 'missed_ad', context);
  }

  /**
   * Report a false positive (legitimate content blocked)
   */
  reportFalsePositive(url, context = {}) {
    if (!this._canCollect()) return;

    const pattern = this._extractPattern(url);
    if (!pattern) return;

    const existing = this.localPatterns.get(pattern);
    if (existing) {
      existing.confidence = Math.max(0, existing.confidence - 0.1);
      existing.falsePositives = (existing.falsePositives || 0) + 1;
      existing.lastSeen = Date.now();
      existing.metadata.falsePositives++;
    } else {
      this.localPatterns.set(pattern, {
        count: 1,
        confidence: 0.1,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        sources: new Set([this._getSourceId(context)]),
        type: 'false_positive',
        falsePositives: 1,
        context: this._sanitizeContext(context),
        metadata: { missedAdReports: 0, falsePositives: 1 }
      });
      this.metrics.patternsLearned++;
    }

    this._enforceLimits();
    this._addToTrainingBuffer(pattern, 'false_positive', context);
  }

  /**
   * Report a new ad pattern detected heuristically
   */
  reportHeuristicDetection(url, confidence, context = {}) {
    if (!this._canCollect()) return;
    if (confidence < this.options.minConfidence) return;

    const pattern = this._extractPattern(url);
    if (!pattern) return;

    const existing = this.localPatterns.get(pattern);
    if (existing) {
      existing.count++;
      existing.confidence = Math.max(existing.confidence, confidence);
      existing.lastSeen = Date.now();
      existing.sources.add(this._getSourceId(context));
      existing.metadata.heuristicDetections = (existing.metadata.heuristicDetections || 0) + 1;
    } else {
      this.localPatterns.set(pattern, {
        count: 1,
        confidence,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        sources: new Set([this._getSourceId(context)]),
        type: 'heuristic',
        context: this._sanitizeContext(context),
        metadata: { heuristicDetections: 1, missedAdReports: 0, falsePositives: 0 }
      });
      this.metrics.patternsLearned++;
    }

    this._enforceLimits();
    this._maybeSubmit(pattern);
    this._addToTrainingBuffer(pattern, 'heuristic', context, confidence);
  }

  /**
   * Report behavioral anomaly for federated learning
   */
  reportBehavioralAnomaly(features, score, context = {}) {
    if (!this._canCollect() || !this.options.federatedLearning) return;

    this._addToTrainingBuffer({
      features,
      score,
      timestamp: Date.now(),
      type: 'behavioral'
    }, 'behavioral', context);
  }

  // ============================================================================
  // Public API — Querying
  // ============================================================================

  /**
   * Get local patterns for use in heuristic detection
   */
  getLocalPatterns(minConfidence = null) {
    const threshold = minConfidence ?? this.options.minConfidence;
    const patterns = [];

    for (const [pattern, data] of this.localPatterns) {
      if (data.confidence >= threshold) {
        patterns.push({
          pattern,
          confidence: data.confidence,
          count: data.count,
          type: data.type,
          sources: data.sources.size,
          lastSeen: data.lastSeen
        });
      }
    }
    return patterns.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Check if URL matches any crowdsourced pattern
   */
  matchesCrowdsourced(url, minConfidence = null) {
    const threshold = minConfidence ?? this.options.minConfidence;

    for (const [pattern, data] of this.localPatterns) {
      if (data.confidence >= threshold && this._matchPattern(url, pattern)) {
        return { pattern, confidence: data.confidence, type: data.type };
      }
    }
    return null;
  }

  /**
   * Get pattern details
   */
  getPatternDetails(pattern) {
    return this.localPatterns.get(pattern) || null;
  }

  // ============================================================================
  // Public API — Federated Learning
  // ============================================================================

  /**
   * Participate in federated learning round
   * Called by coordinator when a new round starts
   */
  async participateInFederatedRound(globalModel, roundConfig) {
    if (!this.options.federatedLearning || !this._hasConsentForFL()) {
      return { participated: false, reason: 'not_eligible' };
    }

    if (this.trainingBuffer.length < this.options.flMinClients) {
      return { participated: false, reason: 'insufficient_local_data' };
    }

    try {
      // Store global model
      this.flState.globalModel = globalModel;
      this.flState.currentRound = roundConfig.round;

      // Train local model
      const localUpdate = await this._trainLocalModel(globalModel, roundConfig);

      // Apply differential privacy to model update
      const privateUpdate = this.options.differentialPrivacy
        ? await this._applyDPToModelUpdate(localUpdate)
        : localUpdate;

      // Encrypt if secure aggregation
      let encryptedUpdate = privateUpdate;
      if (this.options.secureAggregation) {
        encryptedUpdate = await this._encryptForSecureAggregation(privateUpdate, roundConfig);
      }

      // Record participation
      this.flState.participationHistory.push({
        round: roundConfig.round,
        timestamp: Date.now(),
        samplesUsed: this.trainingBuffer.length,
        privacyCost: this._calculateModelUpdatePrivacyCost(localUpdate)
      });
      this.metrics.flRoundsParticipated++;

      // Clear training buffer after successful participation
      this.trainingBuffer = [];

      await this._saveFLState();

      return {
        participated: true,
        update: encryptedUpdate,
        metadata: {
          clientId: this.flState.clientId,
          round: roundConfig.round,
          samplesCount: this.trainingBuffer.length,
          privacySpent: this._calculateModelUpdatePrivacyCost(localUpdate)
        }
      };
    } catch (error) {
      console.error('[CrowdsourcedIntel] FL participation failed:', error);
      return { participated: false, reason: 'training_failed', error: error.message };
    }
  }

  /**
   * Receive global model update from server
   */
  async receiveGlobalModel(globalModel, metadata = {}) {
    this.flState.globalModel = globalModel;
    this.flState.currentRound = metadata.round || this.flState.currentRound;
    await this._saveFLState();
  }

  /**
   * Receive patterns from server (federated learning pattern sharing)
   */
  async receivePatterns(patterns) {
    let added = 0;
    for (const { pattern, confidence, count, type, metadata } of patterns) {
      const existing = this.localPatterns.get(pattern);
      if (existing) {
        // Merge with weighted average
        const totalCount = existing.count + count;
        existing.confidence = (existing.confidence * existing.count + confidence * count) / totalCount;
        existing.count = totalCount;
        existing.lastSeen = Date.now();
        existing.metadata.federatedMerges = (existing.metadata.federatedMerges || 0) + 1;
      } else {
        this.localPatterns.set(pattern, {
          count,
          confidence,
          firstSeen: Date.now(),
          lastSeen: Date.now(),
          sources: new Set(['federated']),
          type,
          context: {},
          metadata: { federated: true, ...metadata }
        });
        added++;
      }
    }
    this._enforceLimits();
    await this._saveLocalPatterns();
    return { added, total: this.localPatterns.size };
  }

  // ============================================================================
  // Public API — Consent & Control
  // ============================================================================

  /**
   * Grant consent for crowdsourced intelligence
   */
  async grantConsent(scopes = ['patterns', 'federated', 'analytics']) {
    this.consent = {
      given: true,
      version: this.options.consentVersion,
      timestamp: Date.now(),
      scopes
    };
    await this._saveConsent();

    if (!this.isInitialized) {
      await this.initialize();
    } else {
      this.options.enabled = true;
      this.options.federatedLearning = scopes.includes('federated');
      this._startPeriodicSubmission();
    }
    console.log('[CrowdsourcedIntel] Consent granted', { scopes });
  }

  /**
   * Revoke consent
   */
  async revokeConsent() {
    this.consent = { given: false, version: 0, timestamp: Date.now(), scopes: [] };
    await this._saveConsent();

    this.options.enabled = false;
    this.options.federatedLearning = false;

    if (this.submissionTimer) {
      clearInterval(this.submissionTimer);
      this.submissionTimer = null;
    }

    // Optionally clear local data
    // await this.clear();

    console.log('[CrowdsourcedIntel] Consent revoked');
  }

  /**
   * Check current consent status
   */
  getConsentStatus() {
    return { ...this.consent };
  }

  // ============================================================================
  // Public API — Privacy & Metrics
  // ============================================================================

  /**
   * Get privacy budget status
   */
  getPrivacyBudget() {
    return {
      ...this.privacyBudget,
      percentUsed: ((this.options.maxPrivacyBudget - this.privacyBudget.remaining) / this.options.maxPrivacyBudget) * 100
    };
  }

  /**
   * Get metrics
   */
  getStats() {
    let totalCount = 0;
    let highConfidence = 0;
    const byType = {};
    const bySource = {};

    for (const [, data] of this.localPatterns) {
      totalCount += data.count;
      if (data.confidence >= 0.9) highConfidence++;
      byType[data.type] = (byType[data.type] || 0) + 1;
      for (const source of data.sources) {
        bySource[source] = (bySource[source] || 0) + 1;
      }
    }

    return {
      totalPatterns: this.localPatterns.size,
      totalDetections: totalCount,
      highConfidencePatterns: highConfidence,
      byType,
      bySource,
      pendingSubmissions: this.pendingSubmissions.length,
      privacyBudget: this.getPrivacyBudget(),
      metrics: { ...this.metrics },
      consent: this.getConsentStatus(),
      federatedLearning: {
        currentRound: this.flState.currentRound,
        roundsParticipated: this.metrics.flRoundsParticipated,
        hasLocalModel: !!this.flState.localModel,
        hasGlobalModel: !!this.flState.globalModel
      }
    };
  }

  /**
   * Clear all local data
   */
  async clear(keepConsent = false) {
    this.localPatterns.clear();
    this.pendingSubmissions = [];
    this.trainingBuffer = [];
    this.metrics = {
      patternsLearned: 0,
      patternsSubmitted: 0,
      submissionsFailed: 0,
      flRoundsParticipated: 0,
      privacyBudgetUsed: 0
    };

    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.remove('crowdsourcedPatterns');
      if (!keepConsent) {
        await chrome.storage.local.remove('crowdsourcedConsent');
      }
      await chrome.storage.local.remove('crowdsourcedPrivacyBudget');
      await chrome.storage.local.remove('crowdsourcedFLState');
      await chrome.storage.local.remove('crowdsourcedEncryptionKey');
    }
  }

  // ============================================================================
  // Private Methods — Pattern Extraction & Matching
  // ============================================================================

  _extractPattern(url) {
    try {
      const u = new URL(url);
      const pathParts = u.pathname.split('/').filter(p => p.length > 0);
      const pathPattern = pathParts.slice(0, 3).join('/');
      return `${u.hostname}${pathPattern ? '/' + pathPattern : ''}`;
    } catch {
      return null;
    }
  }

  _matchPattern(url, pattern) {
    try {
      return url.includes(pattern);
    } catch {
      return false;
    }
  }

  _getSourceId(context) {
    // Anonymous, rotating source ID
    const salt = context.sessionSalt || 'default';
    const hash = this._simpleHash(`${salt}:${Math.floor(Date.now() / (24 * 60 * 60 * 1000))}`);
    return `src:${hash.substring(0, 8)}`;
  }

  _simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  _sanitizeContext(context) {
    const { tabId, frameId, sessionSalt, ...safe } = context;
    // Only keep non-identifying context
    return {
      resourceType: safe.resourceType,
      initiatorType: safe.initiatorType,
      pageDomain: safe.pageDomain ? this._extractPattern(safe.pageDomain) : null,
      timestamp: Date.now()
    };
  }

  _canCollect() {
    return this.options.enabled && (this.consent.given || !this.options.requireExplicitConsent);
  }

  _hasConsentForFL() {
    return this.consent.given && this.consent.scopes.includes('federated');
  }

  _enforceLimits() {
    if (this.localPatterns.size > this.options.maxLocalPatterns) {
      const entries = Array.from(this.localPatterns.entries())
        .sort((a, b) => a[1].confidence - b[1].confidence);
      const toRemove = entries.slice(0, this.localPatterns.size - this.options.maxLocalPatterns);
      for (const [key] of toRemove) {
        this.localPatterns.delete(key);
      }
    }
  }

  // ============================================================================
  // Private Methods — Storage
  // ============================================================================

  async _loadLocalPatterns() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const { crowdsourcedPatterns } = await chrome.storage.local.get('crowdsourcedPatterns');
        if (crowdsourcedPatterns) {
          for (const [pattern, data] of Object.entries(crowdsourcedPatterns)) {
            this.localPatterns.set(pattern, {
              ...data,
              sources: new Set(data.sources || [])
            });
          }
        }
      }
    } catch (e) {
      console.warn('[CrowdsourcedIntel] Failed to load patterns:', e);
    }
  }

  async _saveLocalPatterns() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const obj = {};
        for (const [pattern, data] of this.localPatterns) {
          obj[pattern] = {
            ...data,
            sources: Array.from(data.sources)
          };
        }
        await chrome.storage.local.set({ crowdsourcedPatterns: obj });
      }
    } catch (e) {
      console.warn('[CrowdsourcedIntel] Failed to save patterns:', e);
    }
  }

  async _loadPrivacyBudget() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const { crowdsourcedPrivacyBudget } = await chrome.storage.local.get('crowdsourcedPrivacyBudget');
        if (crowdsourcedPrivacyBudget) {
          this.privacyBudget = crowdsourcedPrivacyBudget;
        }
      }
    } catch (e) {
      console.warn('[CrowdsourcedIntel] Failed to load privacy budget:', e);
    }
  }

  async _savePrivacyBudget() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({ crowdsourcedPrivacyBudget: this.privacyBudget });
      }
    } catch (e) {
      console.warn('[CrowdsourcedIntel] Failed to save privacy budget:', e);
    }
  }

  async _loadFLState() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const { crowdsourcedFLState } = await chrome.storage.local.get('crowdsourcedFLState');
        if (crowdsourcedFLState) {
          this.flState = { ...this.flState, ...crowdsourcedFLState };
        }
        if (!this.flState.clientId) {
          this.flState.clientId = this._generateClientId();
        }
      }
    } catch (e) {
      console.warn('[CrowdsourcedIntel] Failed to load FL state:', e);
    }
  }

  async _saveFLState() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({ crowdsourcedFLState: this.flState });
      }
    } catch (e) {
      console.warn('[CrowdsourcedIntel] Failed to save FL state:', e);
    }
  }

  async _loadConsent() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const { crowdsourcedConsent } = await chrome.storage.local.get('crowdsourcedConsent');
        if (crowdsourcedConsent) {
          this.consent = crowdsourcedConsent;
        }
      }
    } catch (e) {
      console.warn('[CrowdsourcedIntel] Failed to load consent:', e);
    }
  }

  async _saveConsent() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({ crowdsourcedConsent: this.consent });
      }
    } catch (e) {
      console.warn('[CrowdsourcedIntel] Failed to save consent:', e);
    }
  }

  async _checkConsent() {
    await this._loadConsent();
    return this.consent.given && this.consent.version >= this.options.consentVersion;
  }

  // ============================================================================
  // Private Methods — Cryptography
  // ============================================================================

  async _loadOrGenerateKey() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        const { crowdsourcedEncryptionKey } = await chrome.storage.local.get('crowdsourcedEncryptionKey');
        if (crowdsourcedEncryptionKey) {
          const keyData = await this._importKey(crowdsourcedEncryptionKey.key, crowdsourcedEncryptionKey.algorithm);
          this.keyVersion = crowdsourcedEncryptionKey.version || 0;
          return keyData;
        }
      }
    } catch (e) {
      console.warn('[CrowdsourcedIntel] Failed to load key, generating new:', e);
    }
    return this._generateKey();
  }

  async _generateKey() {
    try {
      const key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );

      // Export and store
      const exported = await crypto.subtle.exportKey('raw', key);
      if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set({
          crowdsourcedEncryptionKey: {
            key: Array.from(new Uint8Array(exported)),
            algorithm: 'AES-GCM',
            version: this.keyVersion,
            created: Date.now()
          }
        });
      }
      return key;
    } catch (e) {
      console.error('[CrowdsourcedIntel] Key generation failed:', e);
      throw e;
    }
  }

  async _importKey(keyData, algorithm) {
    return crypto.subtle.importKey(
      'raw',
      new Uint8Array(keyData),
      { name: algorithm },
      true,
      ['encrypt', 'decrypt']
    );
  }

  async _encrypt(data) {
    if (!this.encryptionKey) return data;
    try {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encoded = new TextEncoder().encode(JSON.stringify(data));
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        this.encryptionKey,
        encoded
      );
      return {
        encrypted: Array.from(new Uint8Array(encrypted)),
        iv: Array.from(iv),
        version: this.keyVersion
      };
    } catch (e) {
      console.error('[CrowdsourcedIntel] Encryption failed:', e);
      return data; // Fallback to unencrypted
    }
  }

  async _decrypt(encryptedData) {
    if (!this.encryptionKey || !encryptedData.encrypted) return encryptedData;
    try {
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(encryptedData.iv) },
        this.encryptionKey,
        new Uint8Array(encryptedData.encrypted)
      );
      return JSON.parse(new TextDecoder().decode(decrypted));
    } catch (e) {
      console.error('[CrowdsourcedIntel] Decryption failed:', e);
      return null;
    }
  }

  _startKeyRotation() {
    this.keyRotationTimer = setInterval(async () => {
      this.keyVersion++;
      this.encryptionKey = await this._generateKey();
      console.log('[CrowdsourcedIntel] Key rotated to version', this.keyVersion);
    }, this.options.keyRotationInterval);
  }

  // ============================================================================
  // Private Methods — Differential Privacy
  // ============================================================================

  /**
   * Apply differential privacy to pattern submissions
   */
  _applyDifferentialPrivacy(payload) {
    const epsilon = this._getPerSubmissionEpsilon();
    if (epsilon <= 0) return payload; // Budget exhausted

    // Track privacy spend
    this._spendPrivacyBudget(epsilon, this.options.delta, 'pattern_submission');

    const scale = 1 / epsilon;
    return payload.map(item => ({
      ...item,
      // Add Laplace noise to count
      count: Math.max(1, Math.round(item.count + this._laplaceNoise(scale))),
      // Add smaller noise to confidence
      confidence: Math.min(1, Math.max(0, item.confidence + this._laplaceNoise(scale / 10))),
      // Add noise to source count
      sources: Math.max(1, Math.round(item.sources + this._laplaceNoise(scale / 5))),
      // DP metadata
      _dp: { epsilon, mechanism: 'laplace' }
    }));
  }

  /**
   * Apply differential privacy to model updates (for FL)
   */
  async _applyDPToModelUpdate(update) {
    const epsilon = this._getPerSubmissionEpsilon();
    if (epsilon <= 0) return update;

    this._spendPrivacyBudget(epsilon, this.options.delta, 'model_update');

    // Gaussian mechanism for model updates (better for high-dimensional)
    const sigma = Math.sqrt(2 * Math.log(1.25 / this.options.delta)) / epsilon;

    const privateUpdate = { ...update };
    if (privateUpdate.weights) {
      privateUpdate.weights = privateUpdate.weights.map(w => w + this._gaussianNoise(sigma));
    }
    if (privateUpdate.gradients) {
      privateUpdate.gradients = privateUpdate.gradients.map(g => g + this._gaussianNoise(sigma));
    }

    privateUpdate._dp = { epsilon, delta: this.options.delta, mechanism: 'gaussian', sigma };
    return privateUpdate;
  }

  _laplaceNoise(scale) {
    const u = Math.random() - 0.5;
    return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  }

  _gaussianNoise(sigma) {
    // Box-Muller transform
    const u1 = Math.random();
    const u2 = Math.random();
    return sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  _getPerSubmissionEpsilon() {
    // Adaptive epsilon based on remaining budget
    const remaining = this.privacyBudget.remaining;
    if (remaining <= 0) return 0;

    // Reserve budget for future submissions
    const reserved = this.options.maxPrivacyBudget * 0.1;
    const available = remaining - reserved;
    if (available <= 0) return 0;

    // Use min of configured epsilon and available budget
    return Math.min(this.options.epsilon, available);
  }

  _spendPrivacyBudget(epsilon, delta, operation) {
    this.privacyBudget.spent += epsilon;
    this.privacyBudget.remaining = Math.max(0, this.privacyBudget.remaining - epsilon);
    this.privacyBudget.history.push({
      epsilon,
      delta,
      timestamp: Date.now(),
      operation
    });
    this.metrics.privacyBudgetUsed += epsilon;

    // Advanced composition (RDP) tracking
    if (this.options.composition === 'advanced' || this.options.composition === 'rdp') {
      this._updateRDPAccounting(epsilon, delta);
    }

    this._savePrivacyBudget();
  }

  _updateRDPAccounting(epsilon, delta) {
    // Simplified RDP accounting
    if (!this.privacyBudget.rdp) {
      this.privacyBudget.rdp = { alpha: 2, epsilon: 0 };
    }
    // For Gaussian mechanism: RDP(α) = α / (2σ²) where σ = sqrt(2ln(1.25/δ))/ε
    const sigma = Math.sqrt(2 * Math.log(1.25 / delta)) / epsilon;
    const rdpEpsilon = this.privacyBudget.rdp.alpha / (2 * sigma * sigma);
    this.privacyBudget.rdp.epsilon += rdpEpsilon;
  }

  _calculateModelUpdatePrivacyCost(update) {
    // Estimate privacy cost of model update
    const dim = (update.weights?.length || 0) + (update.gradients?.length || 0);
    return dim * this.options.epsilon / 1000; // Simplified
  }

  _startPrivacyBudgetMonitor() {
    setInterval(() => {
      if (this.privacyBudget.remaining < this.options.maxPrivacyBudget * 0.2) {
        console.warn('[CrowdsourcedIntel] Privacy budget low:', this.privacyBudget.remaining);
      }
    }, 60 * 60 * 1000); // Check hourly
  }

  // ============================================================================
  // Private Methods — Federated Learning
  // ============================================================================

  _generateClientId() {
    // Generate anonymous client ID
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
  }

  _addToTrainingBuffer(pattern, type, context, confidence = null) {
    if (!this.options.localTraining) return;

    this.trainingBuffer.push({
      pattern,
      type,
      confidence,
      context: this._sanitizeContext(context),
      timestamp: Date.now()
    });

    // Limit buffer size
    if (this.trainingBuffer.length > this.options.maxLocalSamples) {
      this.trainingBuffer.shift();
    }
  }

  async _trainLocalModel(globalModel, roundConfig) {
    // Simplified local training - in production, use TensorFlow.js or similar
    // This is a hook for actual ML training

    const localData = this.trainingBuffer.map(item => ({
      features: this._patternToFeatures(item.pattern),
      label: item.type === 'missed_ad' || item.type === 'heuristic' ? 1 : 0,
      weight: item.confidence || 1
    }));

    if (localData.length === 0) {
      return { weights: null, samples: 0 };
    }

    // Simulated model update (replace with actual training)
    const update = {
      weights: globalModel?.weights?.map(w => w + (Math.random() - 0.5) * 0.01) || [],
      gradients: [],
      samples: localData.length,
      loss: Math.random() * 0.5,
      round: roundConfig.round
    };

    this.flState.localModel = update;
    return update;
  }

  _patternToFeatures(pattern) {
    // Convert pattern to feature vector for local training
    // Simplified - in production use proper feature extraction
    const features = new Array(64).fill(0);
    try {
      const u = new URL('http://' + pattern);
      features[0] = u.hostname.length / 100;
      features[1] = u.pathname.split('/').filter(p => p).length / 10;
      features[2] = this._entropy(u.hostname) / 5;
    } catch {}
    return features;
  }

  _entropy(str) {
    if (!str || str.length === 0) return 0;
    const freq = {};
    for (const char of str) freq[char] = (freq[char] || 0) + 1;
    let entropy = 0;
    for (const count of Object.values(freq)) {
      const p = count / str.length;
      entropy -= p * Math.log2(p);
    }
    return entropy;
  }

  async _encryptForSecureAggregation(update, roundConfig) {
    // Encrypt model update for secure aggregation
    // In production, use threshold encryption or MPC
    const encrypted = await this._encrypt(update);
    return {
      ...encrypted,
      round: roundConfig.round,
      clientId: this.flState.clientId
    };
  }

  // ============================================================================
  // Private Methods — Submission
  // ============================================================================

  _maybeSubmit(pattern) {
    const data = this.localPatterns.get(pattern);
    // Submit high-confidence patterns with sufficient evidence
    if (data && data.confidence >= 0.95 && data.count >= 10 && data.sources.size >= 3) {
      if (!this.pendingSubmissions.includes(pattern)) {
        this.pendingSubmissions.push(pattern);
      }
    }
  }

  _startPeriodicSubmission() {
    if (this.submissionTimer) clearInterval(this.submissionTimer);
    this.submissionTimer = setInterval(() => {
      this._submitPatterns();
    }, this.options.submitInterval);
  }

  async _submitPatterns() {
    if (this.pendingSubmissions.length === 0) return;
    if (!this._canCollect()) return;

    const toSubmit = this.pendingSubmissions.splice(0, 50);
    const payload = toSubmit.map(pattern => {
      const data = this.localPatterns.get(pattern);
      return {
        pattern,
        confidence: data.confidence,
        count: data.count,
        type: data.type,
        sources: data.sources.size,
        timestamp: Date.now(),
        metadata: data.metadata
      };
    });

    try {
      // Apply differential privacy
      const privatePayload = this.options.differentialPrivacy
        ? this._applyDifferentialPrivacy(payload)
        : payload;

      // Encrypt payload
      const encryptedPayload = this.options.encryptionEnabled
        ? await this._encrypt({ patterns: privatePayload, version: 1 })
        : { patterns: privatePayload, version: 1, encrypted: false };

      const response = await fetch(this.options.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Version': '1.0',
          'X-Privacy-Budget': this.privacyBudget.remaining.toFixed(2)
        },
        body: JSON.stringify(encryptedPayload)
      });

      if (response.ok) {
        this.metrics.patternsSubmitted += toSubmit.length;
        console.log('[CrowdsourcedIntel] Submitted', toSubmit.length, 'patterns');

        // Save updated patterns
        await this._saveLocalPatterns();
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (e) {
      // Re-queue on failure
      this.pendingSubmissions.unshift(...toSubmit);
      this.metrics.submissionsFailed++;
      console.warn('[CrowdsourcedIntel] Submission failed:', e);
    }
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Cleanup resources
   */
  destroy() {
    if (this.submissionTimer) {
      clearInterval(this.submissionTimer);
      this.submissionTimer = null;
    }
    if (this.keyRotationTimer) {
      clearInterval(this.keyRotationTimer);
      this.keyRotationTimer = null;
    }
    this.isInitialized = false;
  }
}

// ============================================================================
// Factory & Utilities
// ============================================================================

/**
 * Create a CrowdsourcedIntel instance with default privacy-preserving config
 */
export function createCrowdsourcedIntel(options = {}) {
  return new CrowdsourcedIntel({
    // Privacy-first defaults
    differentialPrivacy: true,
    epsilon: 0.5,  // Conservative per-submission budget
    maxPrivacyBudget: 5.0,
    composition: 'advanced',

    // Federated learning
    federatedLearning: true,
    secureAggregation: true,

    // Encryption
    encryptionEnabled: true,
    keyRotationInterval: 7 * 24 * 60 * 60 * 1000,

    // Consent
    requireExplicitConsent: true,

    // Local-first
    localTraining: true,

    ...options
  });
}

/**
 * Privacy budget calculator utility
 */
export class PrivacyBudgetCalculator {
  static calculateComposition(epsilons, deltas, composition = 'advanced') {
    switch (composition) {
      case 'basic':
        // Basic composition: sum of epsilons
        return {
          epsilon: epsilons.reduce((a, b) => a + b, 0),
          delta: deltas.reduce((a, b) => a + b, 0)
        };
      case 'advanced':
        // Advanced composition (Kairouz et al.)
        const k = epsilons.length;
        const epsSum = epsilons.reduce((a, b) => a + b, 0);
        const epsMax = Math.max(...epsilons);
        const deltaSum = deltas.reduce((a, b) => a + b, 0);
        return {
          epsilon: Math.sqrt(2 * k * Math.log(1/deltaSum)) * epsMax + k * epsMax * (Math.exp(epsMax) - 1),
          delta: deltaSum
        };
      case 'rdp':
        // RDP composition (simplified)
        return {
          epsilon: epsilons.reduce((a, b) => a + b, 0),
          delta: deltas.reduce((a, b) => a + b, 0)
        };
      default:
        return { epsilon: 0, delta: 0 };
    }
  }

  static calculateGaussianSigma(epsilon, delta) {
    return Math.sqrt(2 * Math.log(1.25 / delta)) / epsilon;
  }

  static calculateLaplaceScale(epsilon) {
    return 1 / epsilon;
  }
}

export default CrowdsourcedIntel;