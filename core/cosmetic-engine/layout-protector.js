/**
 * Layout Protector — CSS containment, reserve-space, intrinsic size, transition handling
 * Prevents layout shift when hiding ad elements
 */

// ============================================================================
// Animation Frame Batching — Read/Write separation for 60fps
// ============================================================================

export class AnimationFrameBatching {
  constructor() {
    this.readQueue = [];
    this.writeQueue = [];
    this.scheduled = false;
  }

  read(fn) {
    return new Promise(resolve => {
      this.readQueue.push({ fn, resolve });
      this.schedule();
    });
  }

  write(fn) {
    return new Promise(resolve => {
      this.writeQueue.push({ fn, resolve });
      this.schedule();
    });
  }

  schedule() {
    if (!this.scheduled) {
      this.scheduled = true;
      requestAnimationFrame(() => this.flush());
    }
  }

  async flush() {
    this.scheduled = false;

    // Execute all reads first
    for (const { fn, resolve } of this.readQueue) {
      try {
        resolve(await fn());
      } catch (e) {
        resolve(undefined);
      }
    }
    this.readQueue = [];

    // Then execute all writes
    for (const { fn, resolve } of this.writeQueue) {
      try {
        resolve(await fn());
      } catch (e) {
        resolve(undefined);
      }
    }
    this.writeQueue = [];
  }
}

// ============================================================================
// Reserve Space — Placeholder elements for layout stability
// ============================================================================

export class ReserveSpace {
  constructor(context) {
    this.context = context;
    this.placeholders = new WeakMap(); // element -> placeholder
    this.measurements = new WeakMap(); // element -> { width, height, ... }
  }

  measure(element) {
    const rect = element.getBoundingClientRect();
    const computed = this.context.getComputedStyle(element);
    this.measurements.set(element, {
      width: rect.width,
      height: rect.height,
      top: rect.top,
      left: rect.left,
      margin: {
        top: computed.marginTop,
        right: computed.marginRight,
        bottom: computed.marginBottom,
        left: computed.marginLeft
      },
      boxSizing: computed.boxSizing
    });
    return this.measurements.get(element);
  }

  createPlaceholder(element, options = {}) {
    const measurement = this.measurements.get(element) || this.measure(element);
    const { useContainment = true, containmentOptions = {} } = options;

    const placeholder = this.context.document.createElement('div');
    placeholder.dataset.aeroguardPlaceholder = 'true';
    placeholder.dataset.aeroguardFor = element.tagName.toLowerCase() + (element.id ? '#' + element.id : '') + (element.className ? '.' + element.className.split(' ')[0] : '');

    // Size
    placeholder.style.width = `${measurement.width}px`;
    placeholder.style.height = `${measurement.height}px`;

    // Display
    const computed = this.context.getComputedStyle(element);
    placeholder.style.display = computed.display;

    // Margins (to preserve layout flow)
    placeholder.style.marginTop = measurement.margin.top;
    placeholder.style.marginRight = measurement.margin.right;
    placeholder.style.marginBottom = measurement.margin.bottom;
    placeholder.style.marginLeft = measurement.margin.left;

    // Box sizing
    placeholder.style.boxSizing = measurement.boxSizing;

    // Visibility: hidden but space preserved
    placeholder.style.visibility = 'hidden';
    placeholder.style.pointerEvents = 'none';
    placeholder.style.opacity = '0';
    placeholder.style.overflow = 'hidden';

    // CSS Containment
    if (useContainment) {
      const containment = [];
      if (containmentOptions.layout) containment.push('layout');
      if (containmentOptions.size) containment.push('size');
      if (containmentOptions.style) containment.push('style');
      if (containmentOptions.paint) containment.push('paint');
      if (containment.length) {
        placeholder.style.contain = containment.join(' ');
      }
    }

    // Intrinsic size (modern browsers)
    if (measurement.width > 0 && measurement.height > 0) {
      placeholder.style.containIntrinsicWidth = `${measurement.width}px`;
      placeholder.style.containIntrinsicHeight = `${measurement.height}px`;
    }

    // Accessibility
    placeholder.setAttribute('aria-hidden', 'true');
    placeholder.setAttribute('role', 'presentation');

    return placeholder;
  }

  insertPlaceholder(element, placeholder) {
    if (element.parentNode) {
      element.parentNode.insertBefore(placeholder, element);
      this.placeholders.set(element, placeholder);
    }
  }

  removePlaceholder(element) {
    const placeholder = this.placeholders.get(element);
    if (placeholder && placeholder.parentNode) {
      placeholder.parentNode.removeChild(placeholder);
      this.placeholders.delete(element);
    }
  }

  updatePlaceholder(element) {
    const placeholder = this.placeholders.get(element);
    if (!placeholder) return;

    const measurement = this.measure(element);
    placeholder.style.width = `${measurement.width}px`;
    placeholder.style.height = `${measurement.height}px`;

    // Update intrinsic size
    if (measurement.width > 0 && measurement.height > 0) {
      placeholder.style.containIntrinsicWidth = `${measurement.width}px`;
      placeholder.style.containIntrinsicHeight = `${measurement.height}px`;
    }
  }

  hasPlaceholder(element) {
    return this.placeholders.has(element);
  }

  getPlaceholder(element) {
    return this.placeholders.get(element);
  }
}

// ============================================================================
// Transition Handling — Force complete transitions to prevent layout shift
// ============================================================================

export class TransitionHandling {
  constructor(context) {
    this.context = context;
  }

  forceCompleteTransitions(element) {
    const computed = this.context.getComputedStyle(element);
    if (computed.transition !== 'none' && computed.transitionDuration !== '0s') {
      // Force transition to end state immediately
      element.style.transition = 'none';
      // Restore after a frame
      this.context.requestAnimationFrame(() => {
        element.style.transition = '';
      });
    }
  }

  suppressTransitions(element, callback) {
    const originalTransition = element.style.transition;
    element.style.transition = 'none';

    try {
      return callback();
    } finally {
      this.context.requestAnimationFrame(() => {
        element.style.transition = originalTransition;
      });
    }
  }

  waitForTransitions(element) {
    return new Promise(resolve => {
      const computed = this.context.getComputedStyle(element);
      if (computed.transition === 'none' || computed.transitionDuration === '0s') {
        resolve();
        return;
      }

      const duration = this.parseTransitionDuration(computed.transitionDuration);
      const handler = () => {
        element.removeEventListener('transitionend', handler);
        resolve();
      };
      element.addEventListener('transitionend', handler);

      // Fallback timeout
      setTimeout(() => {
        element.removeEventListener('transitionend', handler);
        resolve();
      }, duration + 100);
    });
  }

  parseTransitionDuration(str) {
    const matches = str.match(/(\d+(?:\.\d+)?)(ms|s)/g);
    if (!matches) return 0;
    let max = 0;
    for (const match of matches) {
      const value = parseFloat(match);
      const unit = match.endsWith('ms') ? 1 : 1000;
      max = Math.max(max, value * unit);
    }
    return max;
  }
}

// ============================================================================
// Flexbox/Grid Awareness — Detect layout context
// ============================================================================

export class FlexboxGridAwareness {
  constructor(context) {
    this.context = context;
  }

  assessLayoutShiftRisk(element) {
    const parent = element.parentElement;
    if (!parent) return { risk: 'low', reason: 'no_parent' };

    const parentStyle = this.context.getComputedStyle(parent);
    const elementStyle = this.context.getComputedStyle(element);

    // Check for flexbox/grid parent
    const isFlex = parentStyle.display === 'flex' || parentStyle.display === 'inline-flex';
    const isGrid = parentStyle.display === 'grid' || parentStyle.display === 'inline-grid';

    if (!isFlex && !isGrid) {
      return { risk: 'low', reason: 'static_layout' };
    }

    // Check if element has flex/grid properties that affect layout
    const hasFlexBasis = elementStyle.flexBasis !== 'auto' && elementStyle.flexBasis !== '0px';
    const hasFlexGrow = parseFloat(elementStyle.flexGrow) > 0;
    const hasFlexShrink = parseFloat(elementStyle.flexShrink) > 0;
    const hasGridArea = elementStyle.gridArea !== 'auto';
    const hasAlignSelf = elementStyle.alignSelf !== 'auto';
    const hasJustifySelf = elementStyle.justifySelf !== 'auto';

    const affectsLayout = hasFlexBasis || hasFlexGrow || hasFlexShrink || hasGridArea || hasAlignSelf || hasJustifySelf;

    if (affectsLayout) {
      return {
        risk: 'high',
        reason: 'flex_grid_item_with_layout_properties',
        display: parentStyle.display,
        properties: { flexBasis: elementStyle.flexBasis, flexGrow: elementStyle.flexGrow, gridArea: elementStyle.gridArea }
      };
    }

    // Check if removing element would cause reflow
    const siblings = Array.from(parent.children).filter(c => c !== element);
    const hasOtherChildren = siblings.length > 0;

    return {
      risk: hasOtherChildren ? 'medium' : 'high',
      reason: hasOtherChildren ? 'flex_grid_sibling_reflow' : 'only_flex_grid_child',
      display: parentStyle.display
    };
  }

  getSafeHideStrategy(element) {
    const risk = this.assessLayoutShiftRisk(element);

    if (risk.risk === 'high') {
      return {
        strategy: 'placeholder_required',
        reason: 'Hiding will cause significant layout shift in flex/grid container',
        useContainment: true,
        useIntrinsicSize: true,
        reserveSpace: true
      };
    }

    if (risk.risk === 'medium') {
      return {
        strategy: 'placeholder_recommended',
        reason: 'Hiding may cause minor reflow in flex/grid container',
        useContainment: true,
        useIntrinsicSize: true,
        reserveSpace: true
      };
    }

    return {
      strategy: 'direct_hide',
      reason: 'Standard layout, safe to hide directly',
      useContainment: true,
      useIntrinsicSize: false,
      reserveSpace: false
    };
  }
}

// ============================================================================
// Layout Protector — Main Coordinator
// ============================================================================

export class LayoutProtector {
  constructor(context) {
    this.context = context;
    this.config = {
      usePredictiveHiding: true,
      useAnimationFrameBatching: true,
      useTransitionHandling: true,
      useFlexboxGridAwareness: true,
      containmentOptions: {
        layout: true,
        size: true,
        style: true,
        paint: true
      }
    };

    // Sub-modules
    this.animationFrameBatching = new AnimationFrameBatching();
    this.reserveSpace = new ReserveSpace(context);
    this.transitionHandling = new TransitionHandling(context);
    this.flexboxGridAwareness = new FlexboxGridAwareness(context);

    this.metrics = {
      placeholdersCreated: 0,
      transitionsSuppressed: 0,
      layoutShiftsPrevented: 0,
      highRiskElements: 0
    };
  }

  configure(config) {
    this.config = { ...this.config, ...config };
    if (this.reserveSpace) {
      // Reconfigure reserve space if needed
    }
  }

  initialize() {
    // Setup resize observer for responsive placeholder updates
    if (this.context.ResizeObserver) {
      this.resizeObserver = new this.context.ResizeObserver(entries => {
        for (const entry of entries) {
          if (this.reserveSpace.hasPlaceholder(entry.target)) {
            this.reserveSpace.updatePlaceholder(entry.target);
          }
        }
      });
    }
  }

  /**
   * Protect element from layout shift when hiding
   * @param {Element} element - Element to protect
   * @param {Object} options - Protection options
   */
  protect(element, options = {}) {
    const {
      reserveSpace = this.config.useAnimationFrameBatching,
      useContainment = this.config.containmentOptions.layout,
      useIntrinsicSize = true,
      suppressTransitions = this.config.useTransitionHandling
    } = options;

    // Apply CSS containment
    if (useContainment) {
      const values = [];
      if (this.config.containmentOptions.layout) values.push('layout');
      if (this.config.containmentOptions.size) values.push('size');
      if (this.config.containmentOptions.style) values.push('style');
      if (this.config.containmentOptions.paint) values.push('paint');
      element.style.contain = values.join(' ');
    }

    // Reserve intrinsic size
    if (useIntrinsicSize) {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        element.style.containIntrinsicWidth = `${rect.width}px`;
        element.style.containIntrinsicHeight = `${rect.height}px`;
      }
    }

    // Suppress transitions
    if (suppressTransitions) {
      const computed = this.context.getComputedStyle(element);
      if (computed.transition !== 'none' && computed.transitionDuration !== '0s') {
        this.transitionHandling.suppressTransitions(element, () => {});
        this.metrics.transitionsSuppressed++;
      }
    }

    // Check flexbox/grid risk
    if (this.config.useFlexboxGridAwareness) {
      const risk = this.flexboxGridAwareness.assessLayoutShiftRisk(element);
      if (risk.risk === 'high') {
        this.metrics.highRiskElements++;
      }
    }
  }

  /**
   * Create and insert placeholder for element
   */
  createPlaceholder(element) {
    const placeholder = this.reserveSpace.createPlaceholder(element, {
      useContainment: true,
      containmentOptions: this.config.containmentOptions
    });
    this.reserveSpace.insertPlaceholder(element, placeholder);
    this.metrics.placeholdersCreated++;
    return placeholder;
  }

  /**
   * Remove placeholder
   */
  removePlaceholder(element) {
    this.reserveSpace.removePlaceholder(element);
  }

  /**
   * Update placeholder dimensions
   */
  updatePlaceholder(element) {
    this.reserveSpace.updatePlaceholder(element);
  }

  /**
   * Hide element with full layout protection
   */
  async hideWithProtection(element, options = {}) {
    const strategy = this.config.useFlexboxGridAwareness
      ? this.flexboxGridAwareness.getSafeHideStrategy(element)
      : { strategy: 'direct_hide', reserveSpace: true };

    // Create placeholder if needed
    let placeholder = null;
    if (strategy.reserveSpace || options.reserveSpace) {
      placeholder = this.createPlaceholder(element);
    }

    // Hide element
    element.style.display = 'none';
    element.setAttribute('aria-hidden', 'true');
    element.setAttribute('data-aeroguard-hidden', 'true');

    this.metrics.layoutShiftsPrevented++;

    return { placeholder, strategy };
  }

  /**
   * Restore element
   */
  restore(element) {
    this.removePlaceholder(element);
    element.style.display = '';
    element.style.contain = '';
    element.style.containIntrinsicWidth = '';
    element.style.containIntrinsicHeight = '';
    element.removeAttribute('aria-hidden');
    element.removeAttribute('data-aeroguard-hidden');
  }

  getMetrics() {
    return { ...this.metrics };
  }

  cleanup() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    this.metrics = {
      placeholdersCreated: 0,
      transitionsSuppressed: 0,
      layoutShiftsPrevented: 0,
      highRiskElements: 0
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let layoutProtectorInstance = null;

export function getLayoutProtector(context = window) {
  if (!layoutProtectorInstance) {
    layoutProtectorInstance = new LayoutProtector(context);
  }
  return layoutProtectorInstance;
}

export function resetLayoutProtector() {
  if (layoutProtectorInstance) {
    layoutProtectorInstance.cleanup();
  }
  layoutProtectorInstance = null;
}