/**
 * Cosmetic Coordinator — Multi-pass, zero layout shift
 * Orchestrates hiding passes with layout shift prevention
 */

// ============================================================================
// Selector Engine - Parse CSS selectors, compute specificity, detect conflicts
// ============================================================================

export class SelectorEngine {
  constructor() {
    this.selectors = new Map(); // selector -> { specificity, isException, raw }
    this.parsedCache = new Map();
    this.specificityCache = new Map();
  }

  /**
   * Parse CSS selector and compute specificity
   * @param {string} selector - CSS selector
   * @returns {Object} Parsed selector with specificity
   */
  parse(selector) {
    if (this.parsedCache.has(selector)) {
      return this.parsedCache.get(selector);
    }

    const parsed = this._parseSelector(selector);
    this.parsedCache.set(selector, parsed);
    return parsed;
  }

  _parseSelector(selector) {
    const trimmed = selector.trim();
    const isException = trimmed.startsWith('#@#') || trimmed.startsWith('#@##');
    const cleanSelector = isException ? trimmed.replace(/^#@##?/, '').trim() : trimmed;

    const specificity = this._computeSpecificity(cleanSelector);
    const parts = this._splitSelector(cleanSelector);

    return {
      raw: trimmed,
      clean: cleanSelector,
      isException,
      specificity,
      parts,
      pseudoElements: this._extractPseudoElements(cleanSelector),
      pseudoClasses: this._extractPseudoClasses(cleanSelector),
      hasAttributeSelectors: /\[.+\]/.test(cleanSelector),
      hasIdSelector: /#[\w-]+/.test(cleanSelector) && !isException,
      hasClassSelector: /\.[\w-]+/.test(cleanSelector),
      tagName: this._extractTagName(cleanSelector)
    };
  }

  /**
   * Compute CSS specificity (a, b, c) = (ids, classes/attrs/pseudo-classes, elements/pseudo-elements)
   * @param {string} selector - Clean CSS selector
   * @returns {Object} Specificity object
   */
  _computeSpecificity(selector) {
    if (this.specificityCache.has(selector)) {
      return this.specificityCache.get(selector);
    }

    let ids = 0, classes = 0, elements = 0;

    // Count ID selectors
    const idMatches = selector.match(/#[\w-]+/g);
    if (idMatches) ids = idMatches.length;

    // Count class selectors, attribute selectors, pseudo-classes
    const classMatches = selector.match(/\.[\w-]+/g);
    if (classMatches) classes += classMatches.length;

    const attrMatches = selector.match(/\[[^\]]+\]/g);
    if (attrMatches) classes += attrMatches.length;

    const pseudoClassMatches = selector.match(/:[a-z-]+(\([^)]*\))?/gi);
    if (pseudoClassMatches) {
      for (const pc of pseudoClassMatches) {
        if (!pc.startsWith('::')) classes++;
      }
    }

    // Count element selectors and pseudo-elements
    const tagMatches = selector.match(/(^|[\s>+~])([a-z][a-z0-9]*)/gi);
    if (tagMatches) {
      for (const match of tagMatches) {
        const tag = match.trim().split(/\s+/).pop();
        if (tag && !tag.startsWith(':') && !tag.startsWith('.') && !tag.startsWith('#') && !tag.startsWith('[')) {
          elements++;
        }
      }
    }

    const pseudoElementMatches = selector.match(/::[a-z-]+/gi);
    if (pseudoElementMatches) elements += pseudoElementMatches.length;

    const result = { ids, classes, elements, total: ids * 10000 + classes * 100 + elements };
    this.specificityCache.set(selector, result);
    return result;
  }

  _splitSelector(selector) {
    return selector.split(',').map(s => s.trim()).filter(Boolean);
  }

  _extractPseudoElements(selector) {
    const matches = selector.match(/::[a-z-]+/gi);
    return matches || [];
  }

  _extractPseudoClasses(selector) {
    const matches = selector.match(/:([a-z-]+)(\([^)]*\))?/gi);
    return (matches || []).filter(m => !m.startsWith('::'));
  }

  _extractTagName(selector) {
    const match = selector.match(/(^|[\s>+~])([a-z][a-z0-9]*)/i);
    return match ? match[2].toLowerCase() : null;
  }

  /**
   * Add selector to engine
   * @param {string} selector - CSS selector
   * @param {boolean} isException - Whether it's an exception selector
   */
  addSelector(selector, isException = false) {
    const parsed = this.parse(selector);
    this.selectors.set(selector, { ...parsed, isException, addedAt: Date.now() });
  }

  /**
   * Remove selector from engine
   * @param {string} selector - CSS selector
   */
  removeSelector(selector) {
    this.selectors.delete(selector);
    this.parsedCache.delete(selector);
    this.specificityCache.delete(selector);
  }

  /**
   * Get all selectors sorted by specificity (highest first)
   * @param {boolean} exceptionsOnly - Filter for exceptions only
   * @returns {Array} Sorted selectors
   */
  getSortedSelectors(exceptionsOnly = false) {
    const selectors = Array.from(this.selectors.values())
      .filter(s => exceptionsOnly ? s.isException : !s.isException)
      .sort((a, b) => b.specificity.total - a.specificity.total);
    return selectors;
  }

  /**
   * Check if selector conflicts with exceptions
   * @param {string} selector - Selector to check
   * @returns {Object} Conflict info
   */
  checkConflicts(selector) {
    const parsed = this.parse(selector);
    const exceptions = this.getSortedSelectors(true);

    const conflicts = exceptions.filter(exc => this._selectorsConflict(parsed, exc));
    return {
      hasConflicts: conflicts.length > 0,
      conflicts,
      selector: parsed
    };
  }

  _selectorsConflict(a, b) {
    // Simple conflict detection: check if they could match same element
    if (a.tagName && b.tagName && a.tagName !== b.tagName) return false;

    // Check class overlap
    const aClasses = a.clean.match(/\.[\w-]+/g) || [];
    const bClasses = b.clean.match(/\.[\w-]+/g) || [];
    const classOverlap = aClasses.some(c => bClasses.includes(c));

    // Check ID overlap
    const aIds = a.clean.match(/#[\w-]+/g) || [];
    const bIds = b.clean.match(/#[\w-]+/g) || [];
    const idOverlap = aIds.some(id => bIds.includes(id));

    return classOverlap || idOverlap || (!a.tagName && !b.tagName);
  }

  /**
   * Generate CSS for all selectors (with exception handling)
   * @returns {string} CSS rules
   */
  generateCSS() {
    const exceptions = this.getSortedSelectors(true);
    const hideSelectors = this.getSortedSelectors(false);

    // Build exception map for quick lookup
    const exceptionSet = new Set(exceptions.map(e => e.clean));

    // Filter out selectors that have exceptions
    const effectiveSelectors = hideSelectors.filter(s => !exceptionSet.has(s.clean));

    return effectiveSelectors.map(s => this._buildRule(s.clean)).join('\n');
  }

  _buildRule(selector) {
    return `${selector} {
  display: none !important;
  visibility: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
  height: 0 !important;
  width: 0 !important;
  overflow: hidden !important;
  position: absolute !important;
  z-index: -2147483647 !important;
  contain: layout size style paint !important;
}`;
  }

  /**
   * Get all registered selectors
   * @returns {Object} { hide: [], exceptions: [] }
   */
  getAllSelectors() {
    const hide = [], exceptions = [];
    for (const [raw, parsed] of this.selectors) {
      if (parsed.isException) exceptions.push(raw);
      else hide.push(raw);
    }
    return { hide, exceptions };
  }

  clear() {
    this.selectors.clear();
    this.parsedCache.clear();
    this.specificityCache.clear();
  }
}

// ============================================================================
// Pass Manager - 3-pass system (immediate CSS, DOM observation, periodic cleanup)
// ============================================================================

export class PassManager {
  constructor(context, coordinator) {
    this.context = context;
    this.coordinator = coordinator;
    this.passes = {
      immediate: { enabled: true, executed: false },
      observation: { enabled: true, observer: null },
      cleanup: { enabled: true, interval: null }
    };
    this.passCallbacks = new Map(); // passName -> callback
  }

  /**
   * Execute all passes in order
   */
  async executeAllPasses() {
    await this.executePass('immediate');
    this.executePass('observation');
    this.executePass('cleanup');
  }

  /**
   * Execute specific pass
   * @param {string} passName - Pass name (immediate, observation, cleanup)
   */
  async executePass(passName) {
    const pass = this.passes[passName];
    if (!pass || !pass.enabled) return;

    const callback = this.passCallbacks.get(passName);
    if (callback) {
      try {
        await callback();
        pass.executed = true;
      } catch (error) {
        console.error(`[PassManager] Pass ${passName} failed:`, error);
      }
    }
  }

  /**
   * Register callback for a pass
   * @param {string} passName - Pass name
   * @param {Function} callback - Async callback
   */
  registerPass(passName, callback) {
    this.passCallbacks.set(passName, callback);
  }

  /**
   * Enable/disable pass
   * @param {string} passName - Pass name
   * @param {boolean} enabled - Enable state
   */
  setPassEnabled(passName, enabled) {
    if (this.passes[passName]) {
      this.passes[passName].enabled = enabled;
    }
  }

  /**
   * Setup MutationObserver for observation pass
   * @param {Object} options - Observer options
   */
  setupObservation(options = {}) {
    const { debounceMs = 100, filter } = options;

    if (this.passes.observation.observer) {
      this.passes.observation.observer.disconnect();
    }

    this.passes.observation.observer = new this.context.MutationObserver((mutations) => {
      let shouldCheck = false;

      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === this.context.Node.ELEMENT_NODE) {
              if (!filter || filter(node)) {
                shouldCheck = true;
                break;
              }
            }
          }
        }
        if (shouldCheck) break;
      }

      if (shouldCheck) {
        clearTimeout(this.passes.observation.debounce);
        this.passes.observation.debounce = setTimeout(() => {
          this.executePass('immediate');
        }, debounceMs);
      }
    });

    this.passes.observation.observer.observe(this.context.document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'id', 'style', 'src', 'data-ad', 'data-adblocker-hidden']
    });
  }

  /**
   * Setup periodic cleanup pass
   * @param {number} intervalMs - Interval in milliseconds
   */
  setupCleanup(intervalMs = 2000) {
    if (this.passes.cleanup.interval) {
      clearInterval(this.passes.cleanup.interval);
    }

    this.passes.cleanup.interval = setInterval(() => {
      this.executePass('immediate');
      this.coordinator.cleanupPlaceholders();
    }, intervalMs);
  }

  /**
   * Cleanup all passes
   */
  cleanup() {
    if (this.passes.observation.observer) {
      this.passes.observation.observer.disconnect();
      this.passes.observation.observer = null;
    }
    if (this.passes.observation.debounce) {
      clearTimeout(this.passes.observation.debounce);
    }
    if (this.passes.cleanup.interval) {
      clearInterval(this.passes.cleanup.interval);
      this.passes.cleanup.interval = null;
    }
    this.passCallbacks.clear();
  }

  getStatus() {
    return {
      immediate: this.passes.immediate.executed,
      observation: !!this.passes.observation.observer,
      cleanup: !!this.passes.cleanup.interval
    };
  }
}

// ============================================================================
// Hide Strategy - Measure -> Reserve Space -> Hide -> Restore on Unhide
// ============================================================================

export class HideStrategy {
  constructor(context, layoutProtector) {
    this.context = context;
    this.layoutProtector = layoutProtector;
    this.hiddenElements = new WeakMap(); // element -> hide data
    this.measurementCache = new WeakMap();
  }

  /**
   * Hide element with zero layout shift
   * @param {Element} element - Element to hide
   * @param {Object} options - Hide options
   * @returns {Promise<Object>} Hide result
   */
  async hide(element, options = {}) {
    if (this.hiddenElements.has(element)) {
      return { success: false, reason: 'already_hidden' };
    }

    const {
      reserveSpace = true,
      useContainment = true,
      waitForTransitions = true,
      useAnimationFrameBatching = true,
      createPlaceholder = true
    } = options;

    // Measure first (batched read)
    const measurement = await this._measureElement(element, useAnimationFrameBatching);

    // Reserve space with placeholder (batched write)
    let placeholder = null;
    if (reserveSpace && createPlaceholder && measurement.width > 0 && measurement.height > 0) {
      placeholder = await this._reserveSpace(element, measurement, useContainment, useAnimationFrameBatching);
    }

    // Hide the element
    await this._applyHiding(element, measurement, useAnimationFrameBatching);

    // Store hide data for potential restoration
    const hideData = {
      element,
      measurement,
      placeholder,
      originalStyles: this._captureOriginalStyles(element),
      hiddenAt: Date.now(),
      options
    };
    this.hiddenElements.set(element, hideData);

    return { success: true, measurement, placeholder };
  }

  /**
   * Measure element dimensions and styles
   */
  async _measureElement(element, useBatching) {
    const measureFn = () => {
      const rect = element.getBoundingClientRect();
      const computed = this.context.getComputedStyle(element);
      return {
        width: rect.width,
        height: rect.height,
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        display: computed.display,
        position: computed.position,
        margin: {
          top: computed.marginTop,
          right: computed.marginRight,
          bottom: computed.marginBottom,
          left: computed.marginLeft
        },
        padding: {
          top: computed.paddingTop,
          right: computed.paddingRight,
          bottom: computed.paddingBottom,
          left: computed.paddingLeft
        },
        border: {
          top: computed.borderTopWidth,
          right: computed.borderRightWidth,
          bottom: computed.borderBottomWidth,
          left: computed.borderLeftWidth
        },
        boxSizing: computed.boxSizing,
        overflow: computed.overflow,
        flex: computed.flex,
        flexDirection: computed.flexDirection,
        flexWrap: computed.flexWrap,
        gridColumn: computed.gridColumn,
        gridRow: computed.gridRow,
        gridArea: computed.gridArea,
        order: computed.order,
        zIndex: computed.zIndex,
        transform: computed.transform,
        transition: computed.transition
      };
    };

    if (useBatching && this.layoutProtector?.animationFrameBatching) {
      return this.layoutProtector.animationFrameBatching.read(measureFn);
    }
    return measureFn();
  }

  /**
   * Reserve space with placeholder
   */
  async _reserveSpace(element, measurement, useContainment, useBatching) {
    const createPlaceholderFn = () => {
      return this.layoutProtector.reserveSpace.createPlaceholder(element, {
        useContainment,
        containmentOptions: { layout: true, size: true, style: true, paint: true }
      });
    };

    const insertPlaceholderFn = (placeholder) => {
      this.layoutProtector.reserveSpace.insertPlaceholder(element, placeholder);
      return placeholder;
    };

    let placeholder;
    if (useBatching && this.layoutProtector?.animationFrameBatching) {
      placeholder = await this.layoutProtector.animationFrameBatching.read(createPlaceholderFn);
      await this.layoutProtector.animationFrameBatching.write(() => insertPlaceholderFn(placeholder));
    } else {
      placeholder = createPlaceholderFn();
      insertPlaceholderFn(placeholder);
    }

    return placeholder;
  }

  /**
   * Apply hiding styles to element
   */
  async _applyHiding(element, measurement, useBatching) {
    const hideFn = () => {
      // Wait for transitions if needed
      if (measurement.transition && measurement.transition !== 'none') {
        this.layoutProtector.transitionHandling.forceCompleteTransitions(element);
      }

      element._adBlocked = true;
      element.setAttribute('aria-hidden', 'true');
      element.setAttribute('data-adblocker-hidden', 'true');
      element.setAttribute('data-adblocker-measured', 'true');

      element.style.cssText = `
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
        height: 0 !important;
        width: 0 !important;
        overflow: hidden !important;
        position: absolute !important;
        z-index: -2147483647 !important;
        contain: layout size style paint !important;
        transition: none !important;
      `;
    };

    if (useBatching && this.layoutProtector?.animationFrameBatching) {
      await this.layoutProtector.animationFrameBatching.write(hideFn);
    } else {
      hideFn();
    }
  }

  /**
   * Capture original styles for restoration
   */
  _captureOriginalStyles(element) {
    return {
      display: element.style.display,
      visibility: element.style.visibility,
      opacity: element.style.opacity,
      pointerEvents: element.style.pointerEvents,
      position: element.style.position,
      zIndex: element.style.zIndex,
      contain: element.style.contain,
      overflow: element.style.overflow,
      height: element.style.height,
      width: element.style.width,
      margin: element.style.margin,
      padding: element.style.padding,
      border: element.style.border,
      boxSizing: element.style.boxSizing,
      flex: element.style.flex,
      gridColumn: element.style.gridColumn,
      gridRow: element.style.gridRow,
      order: element.style.order,
      transform: element.style.transform,
      transition: element.style.transition
    };
  }

  /**
   * Unhide element (restore)
   * @param {Element} element - Element to unhide
   * @returns {Promise<boolean>} Success
   */
  async unhide(element) {
    const hideData = this.hiddenElements.get(element);
    if (!hideData) return false;

    const { placeholder, originalStyles, options } = hideData;
    const { useAnimationFrameBatching = true } = options;

    // Remove placeholder
    if (placeholder && placeholder.parentNode) {
      const removePlaceholderFn = () => {
        placeholder.parentNode.removeChild(placeholder);
      };

      if (useAnimationFrameBatching && this.layoutProtector?.animationFrameBatching) {
        await this.layoutProtector.animationFrameBatching.write(removePlaceholderFn);
      } else {
        removePlaceholderFn();
      }
    }

    // Restore original styles
    const restoreFn = () => {
      for (const [prop, value] of Object.entries(originalStyles)) {
        if (value !== undefined && value !== '') {
          element.style[prop] = value;
        } else {
          element.style.removeProperty(prop);
        }
      }
      element._adBlocked = false;
      element.removeAttribute('aria-hidden');
      element.removeAttribute('data-adblocker-hidden');
      element.removeAttribute('data-adblocker-measured');
    };

    if (useAnimationFrameBatching && this.layoutProtector?.animationFrameBatching) {
      await this.layoutProtector.animationFrameBatching.write(restoreFn);
    } else {
      restoreFn();
    }

    this.hiddenElements.delete(element);
    return true;
  }

  /**
   * Check if element is hidden
   * @param {Element} element - Element to check
   * @returns {boolean}
   */
  isHidden(element) {
    return this.hiddenElements.has(element);
  }

  /**
   * Get hide data for element
   * @param {Element} element - Element to check
   * @returns {Object|null}
   */
  getHideData(element) {
    return this.hiddenElements.get(element) || null;
  }

  /**
   * Get all hidden elements
   * @returns {Element[]}
   */
  getHiddenElements() {
    return Array.from(this.hiddenElements.keys());
  }

  /**
   * Cleanup
   */
  cleanup() {
    for (const element of this.hiddenElements.keys()) {
      this.unhide(element);
    }
    this.hiddenElements = new WeakMap();
    this.measurementCache = new WeakMap();
  }
}

// ============================================================================
// Layout Shift Prevention - CSS containment, placeholder elements, reserve-space
// ============================================================================

export class LayoutShiftPrevention {
  constructor(context, layoutProtector) {
    this.context = context;
    this.layoutProtector = layoutProtector;
    this.preventedShifts = 0;
    this.containedElements = new WeakSet();
  }

  /**
   * Apply full layout shift prevention to element
   * @param {Element} element - Element to protect
   * @param {Object} options - Protection options
   */
  protect(element, options = {}) {
    const {
      containment = { layout: true, size: true, style: true, paint: true },
      reserveSpace = true,
      useIntrinsicSize = true,
      suppressTransitions = true
    } = options;

    // Apply CSS containment
    this._applyContainment(element, containment);

    // Reserve intrinsic size for stable layout
    if (useIntrinsicSize) {
      this._applyIntrinsicSize(element);
    }

    // Suppress transitions that could cause shift
    if (suppressTransitions) {
      this._suppressTransitions(element);
    }

    this.containedElements.add(element);
    this.preventedShifts++;
  }

  _applyContainment(element, containment) {
    const values = [];
    if (containment.layout) values.push('layout');
    if (containment.size) values.push('size');
    if (containment.style) values.push('style');
    if (containment.paint) values.push('paint');

    element.style.contain = values.join(' ');
  }

  _applyIntrinsicSize(element) {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      element.style.containIntrinsicWidth = `${rect.width}px`;
      element.style.containIntrinsicHeight = `${rect.height}px`;
    }
  }

  _suppressTransitions(element) {
    const computed = this.context.getComputedStyle(element);
    if (computed.transition !== 'none' && computed.transitionDuration !== '0s') {
      element.style.transition = 'none';
      // Restore after layout stabilizes
      this.context.requestAnimationFrame(() => {
        element.style.transition = '';
      });
    }
  }

  /**
   * Create reserve-space placeholder
   * @param {Element} element - Element to create placeholder for
   * @returns {Element} Placeholder element
   */
  createPlaceholder(element) {
    return this.layoutProtector.reserveSpace.createPlaceholder(element, {
      containmentOptions: { layout: true, size: true, style: true, paint: true }
    });
  }

  /**
   * Insert placeholder before element
   * @param {Element} element - Element
   * @param {Element} placeholder - Placeholder
   */
  insertPlaceholder(element, placeholder) {
    this.layoutProtector.reserveSpace.insertPlaceholder(element, placeholder);
  }

  /**
   * Remove placeholder
   * @param {Element} element - Original element
   */
  removePlaceholder(element) {
    this.layoutProtector.reserveSpace.removePlaceholder(element);
  }

  /**
   * Update placeholder dimensions (for responsive)
   * @param {Element} element - Original element
   */
  updatePlaceholder(element) {
    this.layoutProtector.reserveSpace.updatePlaceholder(element);
  }

  /**
   * Assess layout shift risk for element
   * @param {Element} element - Element to assess
   * @returns {Object} Risk assessment
   */
  assessRisk(element) {
    return this.layoutProtector.flexboxGridAwareness.assessLayoutShiftRisk(element);
  }

  /**
   * Protect multiple elements in batch
   * @param {Element[]} elements - Elements to protect
   */
  async protectBatch(elements) {
    if (this.layoutProtector.config.useAnimationFrameBatching) {
      await this.layoutProtector.animationFrameBatching.read(() => {
        elements.forEach(el => this.layoutProtector.reserveSpace.measure(el));
      });

      await this.layoutProtector.animationFrameBatching.write(() => {
        elements.forEach(el => this.protect(el));
      });
    } else {
      elements.forEach(el => this.protect(el));
    }
  }

  getMetrics() {
    return {
      preventedShifts: this.preventedShifts,
      containedElements: this.containedElements.size
    };
  }

  cleanup() {
    for (const element of this.containedElements) {
      element.style.contain = '';
      element.style.containIntrinsicWidth = '';
      element.style.containIntrinsicHeight = '';
      element.style.transition = '';
    }
    this.containedElements = new WeakSet();
    this.preventedShifts = 0;
  }
}

// ============================================================================
// Conflict Resolution - Exception selectors override hide selectors
// ============================================================================

export class ConflictResolution {
  constructor(selectorEngine) {
    this.selectorEngine = selectorEngine;
    this.resolutionCache = new Map();
  }

  /**
   * Resolve conflicts between hide and exception selectors
   * @param {string} hideSelector - Hide selector
   * @returns {Object} Resolution result
   */
  resolve(hideSelector) {
    const cacheKey = hideSelector;
    if (this.resolutionCache.has(cacheKey)) {
      return this.resolutionCache.get(cacheKey);
    }

    const hideParsed = this.selectorEngine.parse(hideSelector);
    const exceptions = this.selectorEngine.getSortedSelectors(true);

    const conflicts = exceptions.filter(exc => this._conflicts(hideParsed, exc));

    let resolution = 'allow';
    let effectiveSelector = hideSelector;
    let reason = '';

    if (conflicts.length > 0) {
      // Check if exception completely overrides
      const hasCompleteOverride = conflicts.some(exc =>
        this._isCompleteOverride(hideParsed, exc)
      );

      if (hasCompleteOverride) {
        resolution = 'block';
        reason = 'Exception selector completely overrides hide selector';
      } else {
        resolution = 'modify';
        // Build modified selector with :not() exceptions
        effectiveSelector = this._buildModifiedSelector(hideSelector, conflicts);
        reason = `Modified with ${conflicts.length} exception(s)`;
      }
    }

    const result = { resolution, effectiveSelector, conflicts, reason };
    this.resolutionCache.set(cacheKey, result);
    return result;
  }

  _conflicts(hideParsed, exceptionParsed) {
    return this.selectorEngine._selectorsConflict(hideParsed, exceptionParsed);
  }

  _isCompleteOverride(hideParsed, exceptionParsed) {
    // Exception is more specific and covers same elements
    return exceptionParsed.specificity.total >= hideParsed.specificity.total &&
           this._isSubset(hideParsed, exceptionParsed);
  }

  _isSubset(hideParsed, exceptionParsed) {
    // Simple check: exception has all the classes/ids of hide selector
    const hideClasses = hideParsed.clean.match(/\.[\w-]+/g) || [];
    const hideIds = hideParsed.clean.match(/#[\w-]+/g) || [];
    const excClasses = exceptionParsed.clean.match(/\.[\w-]+/g) || [];
    const excIds = exceptionParsed.clean.match(/#[\w-]+/g) || [];

    return hideClasses.every(c => excClasses.includes(c)) &&
           hideIds.every(id => excIds.includes(id));
  }

  _buildModifiedSelector(hideSelector, conflicts) {
    const exceptionSelectors = conflicts.map(c => c.clean).join(', ');
    return `${hideSelector}:not(${exceptionSelectors})`;
  }

  /**
   * Resolve all selectors
   * @returns {Object} { allowed: [], blocked: [], modified: [] }
   */
  resolveAll() {
    const hideSelectors = this.selectorEngine.getSortedSelectors(false);
    const result = { allowed: [], blocked: [], modified: [] };

    for (const parsed of hideSelectors) {
      const resolution = this.resolve(parsed.raw);
      if (resolution.resolution === 'allow') {
        result.allowed.push({ selector: parsed.raw, parsed });
      } else if (resolution.resolution === 'block') {
        result.blocked.push({ selector: parsed.raw, reason: resolution.reason });
      } else {
        result.modified.push({
          original: parsed.raw,
          effective: resolution.effectiveSelector,
          conflicts: resolution.conflicts
        });
      }
    }

    return result;
  }

  clearCache() {
    this.resolutionCache.clear();
  }
}

// ============================================================================
// Dynamic Content - MutationObserver with debounce, framework hydration awareness
// ============================================================================

export class DynamicContent {
  constructor(context, frameworkObserver, coordinator) {
    this.context = context;
    this.frameworkObserver = frameworkObserver;
    this.coordinator = coordinator;
    this.observer = null;
    this.debounceTimers = new Map();
    this.hydrationWaiters = new Map();
    this.pendingChecks = new Set();
    this.isProcessing = false;
    this.config = {
      debounceMs: 100,
      maxBatchSize: 50,
      waitForHydration: true,
      hydrationTimeout: 10000
    };
  }

  configure(config) {
    this.config = { ...this.config, ...config };
  }

  /**
   * Initialize dynamic content observation
   */
  initialize() {
    this._setupMutationObserver();
    this._setupFrameworkIntegration();
  }

  _setupMutationObserver() {
    this.observer = new this.context.MutationObserver((mutations) => {
      this._processMutations(mutations);
    });

    this.observer.observe(this.context.document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        'class', 'id', 'style', 'src', 'data-ad',
        'data-adblocker-hidden', 'hidden', 'aria-hidden'
      ],
      characterData: true
    });
  }

  _setupFrameworkIntegration() {
    if (!this.frameworkObserver) return;

    // Listen for framework hydration completion
    this.frameworkObserver.on('hydration-complete', (data) => {
      this._onHydrationComplete(data.element, data.framework);
    });

    this.frameworkObserver.on('ready-for-filtering', (data) => {
      this._scheduleCheck(data.root, 'framework-ready');
    });

    // Listen for component lifecycle events
    this.frameworkObserver.onComponentLifecycle('react', 'component-update', (data) => {
      this._scheduleCheck(data.component, 'react-update');
    });

    this.frameworkObserver.onComponentLifecycle('vue', 'updated', (data) => {
      this._scheduleCheck(data.vm.$el, 'vue-update');
    });

    this.frameworkObserver.onComponentLifecycle('angular', 'oninit', (data) => {
      this._scheduleCheck(data.component, 'angular-init');
    });

    this.frameworkObserver.onComponentLifecycle('svelte', 'mount', (data) => {
      this._scheduleCheck(data.component, 'svelte-mount');
    });
  }

  _processMutations(mutations) {
    let shouldCheck = false;
    const addedElements = [];

    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === this.context.Node.ELEMENT_NODE) {
            addedElements.push(node);
            if (this._isLikelyAdElement(node)) {
              shouldCheck = true;
            }
          }
        }
      }

      if (mutation.type === 'attributes') {
        const target = mutation.target;
        if (target.nodeType === this.context.Node.ELEMENT_NODE) {
          // Style changes might reveal hidden ads
          if (mutation.attributeName === 'style' ||
              mutation.attributeName === 'class' ||
              mutation.attributeName === 'hidden') {
            const style = target.style;
            if (style.display === 'block' || style.visibility === 'visible' || style.opacity === '1') {
              if (this._isLikelyAdElement(target)) {
                shouldCheck = true;
              }
            }
          }
        }
      }
    }

    if (shouldCheck || addedElements.length > 0) {
      this._scheduleBatchCheck(addedElements);
    }
  }

  _isLikelyAdElement(element) {
    const className = (element.className || '').toLowerCase();
    const id = (element.id || '').toLowerCase();
    const adPatterns = [
      'ad', 'ads', 'advert', 'banner', 'sponsor', 'promo',
      'popup', 'modal', 'overlay', 'interstitial', 'lightbox',
      'newsletter', 'subscribe', 'signup', 'google_ads', 'adsbygoogle'
    ];
    return adPatterns.some(p => className.includes(p) || id.includes(p)) ||
           element.hasAttribute('data-ad') ||
           element.querySelector('iframe[src*="ad"], iframe[src*="doubleclick"], iframe[src*="googlesyndication"]') !== null;
  }

  _scheduleBatchCheck(elements) {
    // Add to pending checks
    for (const el of elements) {
      this.pendingChecks.add(el);
    }

    // Debounce
    clearTimeout(this.debounceTimers.get('batch'));
    this.debounceTimers.set('batch', setTimeout(() => {
      this._processBatchChecks();
    }, this.config.debounceMs));
  }

  _scheduleCheck(element, reason) {
    this.pendingChecks.add(element);
    clearTimeout(this.debounceTimers.get('single'));
    this.debounceTimers.set('single', setTimeout(() => {
      this._processBatchChecks();
    }, this.config.debounceMs));
  }

  async _processBatchChecks() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    const elements = Array.from(this.pendingChecks).slice(0, this.config.maxBatchSize);
    this.pendingChecks.clear();

    // Wait for hydration if needed
    if (this.config.waitForHydration && this.frameworkObserver) {
      await this._waitForRelevantHydration(elements);
    }

    // Process elements through coordinator
    for (const element of elements) {
      if (!element.isConnected) continue;
      if (element.hasAttribute('data-adblocker-hidden')) continue;

      try {
        await this.coordinator.processElement(element);
      } catch (error) {
        console.error('[DynamicContent] Error processing element:', error);
      }
    }

    this.isProcessing = false;

    // Process remaining
    if (this.pendingChecks.size > 0) {
      setTimeout(() => this._processBatchChecks(), this.config.debounceMs);
    }
  }

  async _waitForRelevantHydration(elements) {
    const frameworks = this.frameworkObserver.getDetectedFrameworks();
    if (frameworks.length === 0) return;

    // Check if any element is within a framework root
    const frameworkRoots = this.frameworkObserver.getFrameworkRoots();
    const relevantFrameworks = new Set();

    for (const element of elements) {
      for (const { element: root, framework } of frameworkRoots) {
        if (root.contains(element) || root === element) {
          relevantFrameworks.add(framework);
        }
      }
    }

    // Wait for hydration of relevant frameworks
    for (const framework of relevantFrameworks) {
      await this.frameworkObserver.waitForHydration(framework, this.config.hydrationTimeout);
    }
  }

  _onHydrationComplete(element, framework) {
    // Schedule check for this framework root
    this._scheduleCheck(element, `hydration-${framework}`);
  }

  /**
   * Force check specific element
   * @param {Element} element - Element to check
   */
  forceCheck(element) {
    this._scheduleCheck(element, 'forced');
  }

  /**
   * Pause/resume observation
   * @param {boolean} paused - Pause state
   */
  setPaused(paused) {
    if (paused && this.observer) {
      this.observer.disconnect();
    } else if (!paused) {
      this._setupMutationObserver();
    }
  }

  cleanup() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.pendingChecks.clear();
    this.hydrationWaiters.clear();
    this.isProcessing = false;
  }

  getStatus() {
    return {
      isObserving: !!this.observer,
      pendingChecks: this.pendingChecks.size,
      isProcessing: this.isProcessing,
      debounceTimers: this.debounceTimers.size
    };
  }
}

// ============================================================================
// Cosmetic Coordinator - Main Orchestrator Class
// ============================================================================

export class CosmeticCoordinator {
  constructor(context = window) {
    this.context = context;
    this.document = context.document;

    // Core components
    this.selectorEngine = new SelectorEngine();
    this.layoutProtector = null; // Will be initialized lazily
    this.frameworkObserver = null; // Will be initialized lazily
    this.elementReconstructor = null; // Will be initialized lazily
    this.popupEliminator = null; // Will be initialized lazily

    // Strategy modules
    this.passManager = new PassManager(context, this);
    this.hideStrategy = null;
    this.layoutShiftPrevention = null;
    this.conflictResolution = null;
    this.dynamicContent = null;

    // State
    this.initialized = false;
    this.selectors = new Set();
    this.exceptionSelectors = new Set();
    this.hiddenElements = new WeakMap();
    this.injectedStyleElement = null;
    this.metrics = {
      domHidden: 0,
      layoutShiftsPrevented: 0,
      placeholdersCreated: 0,
      conflictsResolved: 0,
      dynamicContentProcessed: 0,
      passesExecuted: { immediate: 0, observation: 0, cleanup: 0 }
    };

    // Configuration
    this.config = {
      // Pass configuration
      enableImmediatePass: true,
      enableObservationPass: true,
      enableCleanupPass: true,
      cleanupIntervalMs: 2000,

      // Layout shift prevention
      enableLayoutShiftPrevention: true,
      useContainment: true,
      usePlaceholders: true,
      useIntrinsicSize: true,
      suppressTransitions: true,

      // Conflict resolution
      enableConflictResolution: true,
      exceptionPrefix: '#@##',

      // Dynamic content
      dynamicContentDebounceMs: 100,
      waitForFrameworkHydration: true,
      hydrationTimeout: 10000,

      // Performance
      useAnimationFrameBatching: true,
      batchReadsWrites: true,
      maxBatchSize: 50,

      // Features
      enablePopupElimination: true,
      enableElementReconstruction: true,
      debugMode: false
    };
  }

  /**
   * Initialize cosmetic coordinator with all subsystems
   * @param {Object} options - Initialization options
   */
  async initialize(options = {}) {
    if (this.initialized) return this;

    this.config = { ...this.config, ...options };

    // Initialize layout protector
    const { LayoutProtector, getLayoutProtector } = await import('./layout-protector.js');
    this.layoutProtector = getLayoutProtector(this.context);
    this.layoutProtector.configure({
      usePredictiveHiding: true,
      useAnimationFrameBatching: this.config.useAnimationFrameBatching,
      useTransitionHandling: this.config.suppressTransitions,
      useFlexboxGridAwareness: true,
      containmentOptions: {
        layout: this.config.useContainment,
        size: this.config.useContainment,
        style: this.config.useContainment,
        paint: this.config.useContainment
      }
    });
    this.layoutProtector.initialize();

    // Initialize framework observer
    const { FrameworkObserver, getFrameworkObserver } = await import('./framework-observer.js');
    this.frameworkObserver = getFrameworkObserver(this.context);
    this.frameworkObserver.initialize();

    // Initialize element reconstructor
    const { ElementReconstructor, getElementReconstructor } = await import('./element-reconstructor.js');
    this.elementReconstructor = getElementReconstructor(this.context);

    // Initialize popup eliminator
    const { PopupEliminator, getPopupEliminator } = await import('./popup-eliminator.js');
    this.popupEliminator = getPopupEliminator(this.context);
    this.popupEliminator.configure({
      enabled: this.config.enablePopupElimination,
      aggressiveMode: false,
      debugMode: this.config.debugMode
    });
    this.popupEliminator.initialize();

    // Initialize strategy modules
    this.hideStrategy = new HideStrategy(this.context, this.layoutProtector);
    this.layoutShiftPrevention = new LayoutShiftPrevention(this.context, this.layoutProtector);
    this.conflictResolution = new ConflictResolution(this.selectorEngine);
    this.dynamicContent = new DynamicContent(this.context, this.frameworkObserver, this);
    this.dynamicContent.configure({
      debounceMs: this.config.dynamicContentDebounceMs,
      waitForHydration: this.config.waitForFrameworkHydration,
      hydrationTimeout: this.config.hydrationTimeout,
      maxBatchSize: this.config.maxBatchSize
    });
    this.dynamicContent.initialize();

    // Setup passes
    this._setupPasses();

    this.initialized = true;
    this._log('[CosmeticCoordinator] Initialized with all subsystems');

    return this;
  }

  _setupPasses() {
    // Pass 1: Immediate CSS injection and hiding
    this.passManager.registerPass('immediate', async () => {
      this._injectHidingStyles();
      await this._immediateHide();
      this.metrics.passesExecuted.immediate++;
    });

    // Pass 2: Observation (handled by DynamicContent)
    this.passManager.registerPass('observation', () => {
      // Already running via DynamicContent
      this.metrics.passesExecuted.observation++;
    });

    // Pass 3: Periodic cleanup
    this.passManager.registerPass('cleanup', () => {
      this._cleanupPlaceholders();
      this._cleanupOrphanedElements();
      this.metrics.passesExecuted.cleanup++;
    });

    // Execute passes
    this.passManager.setPassEnabled('immediate', this.config.enableImmediatePass);
    this.passManager.setPassEnabled('observation', this.config.enableObservationPass);
    this.passManager.setPassEnabled('cleanup', this.config.enableCleanupPass);

    this.passManager.setupObservation({
      debounceMs: this.config.dynamicContentDebounceMs,
      filter: (el) => this._isLikelyAdElement(el)
    });

    this.passManager.setupCleanup(this.config.cleanupIntervalMs);
  }

  /**
   * Add hide selector
   * @param {string} selector - CSS selector
   */
  addSelector(selector) {
    this.selectors.add(selector);
    this.selectorEngine.addSelector(selector, false);
    this._updateHidingStyles();
    this._resolveConflicts();
  }

  /**
   * Add exception selector
   * @param {string} selector - CSS selector (will be prefixed with exception prefix if not already)
   */
  addExceptionSelector(selector) {
    const prefixed = selector.startsWith(this.config.exceptionPrefix)
      ? selector
      : `${this.config.exceptionPrefix}${selector}`;
    this.exceptionSelectors.add(prefixed);
    this.selectorEngine.addSelector(prefixed, true);
    this._updateHidingStyles();
    this._resolveConflicts();
  }

  /**
   * Remove selector
   * @param {string} selector - CSS selector
   * @param {boolean} isException - Whether it's an exception
   */
  removeSelector(selector, isException = false) {
    if (isException) {
      this.exceptionSelectors.delete(selector);
    } else {
      this.selectors.delete(selector);
    }
    this.selectorEngine.removeSelector(selector);
    this._updateHidingStyles();
    this._resolveConflicts();
  }

  /**
   * Load selectors from array
   * @param {string[]} selectors - Hide selectors
   * @param {string[]} exceptions - Exception selectors
   */
  loadSelectors(selectors = [], exceptions = []) {
    this.selectors = new Set(selectors);
    this.exceptionSelectors = new Set(exceptions);

    this.selectorEngine.clear();
    for (const sel of selectors) {
      this.selectorEngine.addSelector(sel, false);
    }
    for (const sel of exceptions) {
      this.selectorEngine.addSelector(sel, true);
    }

    this._updateHidingStyles();
    this._resolveConflicts();
  }

  /**
   * Get all selectors
   * @returns {Object} { hide: [], exceptions: [] }
   */
  getSelectors() {
    return this.selectorEngine.getAllSelectors();
  }

  /**
   * Process single element through all filters
   * @param {Element} element - Element to process
   * @returns {Promise<Object>} Processing result
   */
  async processElement(element) {
    if (!element || !element.isConnected) return { processed: false };
    if (element.hasAttribute('data-adblocker-hidden')) return { processed: false };
    if (element.hasAttribute('data-aeroguard-placeholder')) return { processed: false };

    // Check if protected by framework observer
    if (this.frameworkObserver?.isElementProtected(element)) {
      return { processed: false, reason: 'framework_protected' };
    }

    // Check if would break controlled component
    if (this.frameworkObserver?.wouldBreakControlled(element)) {
      return { processed: false, reason: 'controlled_component' };
    }

    // Check against selectors
    const matchedSelector = this._matchSelectors(element);
    if (!matchedSelector) return { processed: false };

    // Check exceptions
    if (this._matchExceptions(element)) {
      return { processed: false, reason: 'exception_matched' };
    }

    // Hide element
    const result = await this.hideStrategy.hide(element, {
      reserveSpace: this.config.usePlaceholders,
      useContainment: this.config.useContainment,
      waitForTransitions: this.config.suppressTransitions,
      useAnimationFrameBatching: this.config.useAnimationFrameBatching,
      createPlaceholder: this.config.usePlaceholders
    });

    if (result.success) {
      this.hiddenElements.set(element, result);
      this.metrics.domHidden++;
      if (result.placeholder) this.metrics.placeholdersCreated++;

      // Reconstruct structure
      if (this.config.enableElementReconstruction && this.elementReconstructor) {
        this.elementReconstructor.reconstructAfterRemoval(element, element.parentElement);
      }

      this._log('Hidden element:', element, 'matched:', matchedSelector);
    }

    return result;
  }

  /**
   * Immediate hiding pass - hide all matching elements
   */
  async _immediateHide() {
    const hideSelectors = this.selectorEngine.getSortedSelectors(false);

    for (const parsed of hideSelectors) {
      try {
        const elements = this.document.querySelectorAll(parsed.clean);
        for (const element of elements) {
          if (!element._adBlocked && !element.hasAttribute('data-adblocker-hidden')) {
            await this.processElement(element);
          }
        }
      } catch (error) {
        this._log('Selector error:', parsed.clean, error);
      }
    }
  }

  /**
   * Inject hiding CSS styles
   */
  _injectHidingStyles() {
    if (this.document._cosmeticStylesInjected) return;

    const style = this.document.createElement('style');
    style.id = 'aeroguard-cosmetic-hiding';
    style.setAttribute('data-aeroguard', 'cosmetic-hiding');
    style.textContent = this.selectorEngine.generateCSS();

    const head = this.document.head || this.document.documentElement;
    head.insertBefore(style, head.firstChild);

    this.document._cosmeticStylesInjected = true;
    this.injectedStyleElement = style;

    this._log('Injected hiding styles');
  }

  /**
   * Update hiding styles
   */
  _updateHidingStyles() {
    if (this.injectedStyleElement) {
      this.injectedStyleElement.textContent = this.selectorEngine.generateCSS();
    }
  }

  /**
   * Resolve conflicts between hide and exception selectors
   */
  _resolveConflicts() {
    if (!this.config.enableConflictResolution) return;

    const resolution = this.conflictResolution.resolveAll();
    this.metrics.conflictsResolved = resolution.modified.length + resolution.blocked.length;

    if (resolution.modified.length > 0) {
      this._log(`Resolved ${resolution.modified.length} conflicts`);
    }
  }

  /**
   * Match element against hide selectors
   * @returns {Object|null} Matched selector info
   */
  _matchSelectors(element) {
    const hideSelectors = this.selectorEngine.getSortedSelectors(false);

    for (const parsed of hideSelectors) {
      try {
        if (element.matches(parsed.clean)) {
          return parsed;
        }
      } catch (e) {
        // Invalid selector, skip
      }
    }
    return null;
  }

  /**
   * Match element against exception selectors
   * @returns {boolean}
   */
  _matchExceptions(element) {
    const exceptions = this.selectorEngine.getSortedSelectors(true);

    for (const parsed of exceptions) {
      try {
        if (element.matches(parsed.clean)) {
          return true;
        }
      } catch (e) {}
    }
    return false;
  }

  _isLikelyAdElement(element) {
    const className = (element.className || '').toLowerCase();
    const id = (element.id || '').toLowerCase();
    const adPatterns = [
      'ad', 'ads', 'advert', 'banner', 'sponsor', 'promo',
      'popup', 'modal', 'overlay', 'interstitial', 'lightbox',
      'newsletter', 'subscribe', 'signup', 'google_ads', 'adsbygoogle'
    ];
    return adPatterns.some(p => className.includes(p) || id.includes(p)) ||
           element.hasAttribute('data-ad') ||
           element.querySelector('iframe[src*="ad"], iframe[src*="doubleclick"], iframe[src*="googlesyndication"]') !== null;
  }

  /**
   * Cleanup orphaned placeholders
   */
  _cleanupPlaceholders() {
    if (this.layoutProtector) {
      for (const element of this.hiddenElements.keys()) {
        if (!element.isConnected || !element._adBlocked) {
          const hideData = this.hiddenElements.get(element);
          if (hideData?.placeholder?.parentNode) {
            hideData.placeholder.parentNode.removeChild(hideData.placeholder);
          }
          this.hiddenElements.delete(element);
        }
      }
    }
  }

  /**
   * Cleanup orphaned hidden elements
   */
  _cleanupOrphanedElements() {
    for (const element of this.hiddenElements.keys()) {
      if (!element.isConnected) {
        this.hiddenElements.delete(element);
      }
    }
  }

  /**
   * Public cleanup method for placeholders
   */
  cleanupPlaceholders() {
    this._cleanupPlaceholders();
  }

  /**
   * Unhide element (restore)
   * @param {Element} element - Element to unhide
   * @returns {Promise<boolean>}
   */
  async unhideElement(element) {
    const result = await this.hideStrategy.unhide(element);
    if (result) {
      this.hiddenElements.delete(element);
      this.metrics.domHidden = Math.max(0, this.metrics.domHidden - 1);
    }
    return result;
  }

  /**
   * Get comprehensive metrics
   * @returns {Object}
   */
  getMetrics() {
    return {
      ...this.metrics,
      hiddenElements: this.hiddenElements.size,
      registeredSelectors: this.selectors.size,
      exceptionSelectors: this.exceptionSelectors.size,
      passStatus: this.passManager.getStatus(),
      dynamicContentStatus: this.dynamicContent?.getStatus(),
      layoutShiftMetrics: this.layoutShiftPrevention?.getMetrics(),
      layoutProtectorMetrics: this.layoutProtector?.getMetrics?.(),
      frameworkObserverMetrics: this.frameworkObserver?.getMetrics?.(),
      elementReconstructorMetrics: this.elementReconstructor?.getMetrics?.(),
      popupEliminatorMetrics: this.popupEliminator?.getMetrics?.()
    };
  }

  /**
   * Force scan and hide
   */
  async scan() {
    await this._immediateHide();
    if (this.popupEliminator) {
      this.popupEliminator.scan();
    }
  }

  /**
   * Pause cosmetic filtering
   */
  pause() {
    this.dynamicContent?.setPaused(true);
    if (this.injectedStyleElement) {
      this.injectedStyleElement.disabled = true;
    }
    this._log('Cosmetic filtering paused');
  }

  /**
   * Resume cosmetic filtering
   */
  resume() {
    this.dynamicContent?.setPaused(false);
    if (this.injectedStyleElement) {
      this.injectedStyleElement.disabled = false;
    }
    this._log('Cosmetic filtering resumed');
  }

  /**
   * Configure coordinator
   * @param {Object} config - Configuration
   */
  configure(config) {
    this.config = { ...this.config, ...config };

    if (this.layoutProtector) {
      this.layoutProtector.configure({
        useAnimationFrameBatching: this.config.useAnimationFrameBatching,
        useTransitionHandling: this.config.suppressTransitions
      });
    }

    if (this.dynamicContent) {
      this.dynamicContent.configure({
        debounceMs: this.config.dynamicContentDebounceMs,
        waitForHydration: this.config.waitForFrameworkHydration,
        hydrationTimeout: this.config.hydrationTimeout,
        maxBatchSize: this.config.maxBatchSize
      });
    }

    if (this.popupEliminator) {
      this.popupEliminator.configure({
        enabled: this.config.enablePopupElimination,
        debugMode: this.config.debugMode
      });
    }

    this.passManager.setPassEnabled('immediate', this.config.enableImmediatePass);
    this.passManager.setPassEnabled('observation', this.config.enableObservationPass);
    this.passManager.setPassEnabled('cleanup', this.config.enableCleanupPass);

    if (this.config.enableCleanupPass) {
      this.passManager.setupCleanup(this.config.cleanupIntervalMs);
    }
  }

  _log(...args) {
    if (this.config.debugMode) {
      console.log('[CosmeticCoordinator]', ...args);
    }
  }

  /**
   * Full cleanup
   */
  async cleanup() {
    this._log('Cleaning up...');

    // Unhide all elements
    for (const element of this.hiddenElements.keys()) {
      await this.hideStrategy.unhide(element);
    }

    // Cleanup passes
    this.passManager.cleanup();

    // Cleanup dynamic content
    this.dynamicContent?.cleanup();

    // Cleanup subsystems
    this.layoutProtector?.cleanup();
    this.frameworkObserver?.cleanup();
    this.elementReconstructor?.reset();
    this.popupEliminator?.cleanup();
    this.hideStrategy?.cleanup();
    this.layoutShiftPrevention?.cleanup();

    // Remove injected styles
    if (this.injectedStyleElement?.parentNode) {
      this.injectedStyleElement.parentNode.removeChild(this.injectedStyleElement);
    }
    this.document._cosmeticStylesInjected = false;

    // Reset state
    this.hiddenElements = new WeakMap();
    this.selectors.clear();
    this.exceptionSelectors.clear();
    this.selectorEngine.clear();
    this.conflictResolution.clearCache();
    this.initialized = false;

    this._log('Cleanup complete');
  }
}

// ============================================================================
// Singleton Instance Management
// ============================================================================

let cosmeticCoordinatorInstance = null;

/**
 * Get or create CosmeticCoordinator singleton
 * @param {Window} context - Window context
 * @returns {Promise<CosmeticCoordinator>}
 */
export async function getCosmeticCoordinator(context = window) {
  if (!cosmeticCoordinatorInstance) {
    cosmeticCoordinatorInstance = new CosmeticCoordinator(context);
    await cosmeticCoordinatorInstance.initialize();
  }
  return cosmeticCoordinatorInstance;
}

/**
 * Reset singleton instance
 */
export function resetCosmeticCoordinator() {
  if (cosmeticCoordinatorInstance) {
    cosmeticCoordinatorInstance.cleanup();
  }
  cosmeticCoordinatorInstance = null;
}

/**
 * Create new CosmeticCoordinator instance (non-singleton)
 * @param {Window} context - Window context
 * @param {Object} options - Initialization options
 * @returns {Promise<CosmeticCoordinator>}
 */
export async function createCosmeticCoordinator(context = window, options = {}) {
  const coordinator = new CosmeticCoordinator(context);
  await coordinator.initialize(options);
  return coordinator;
}

// Export all classes for direct usage
export {
  SelectorEngine,
  PassManager,
  HideStrategy,
  LayoutShiftPrevention,
  ConflictResolution,
  DynamicContent
};