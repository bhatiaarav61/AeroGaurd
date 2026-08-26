/**
 * Element Reconstructor — Semantic restoration after ad removal
 * Heals DOM structure, removes empty containers, restores semantic meaning
 */

// ============================================================================
// Element Reconstructor
// ============================================================================

export class ElementReconstructor {
  constructor(context = window) {
    this.context = context;
    this.document = context.document;
    this.reconstructionQueue = [];
    this.isProcessing = false;
    this.metrics = {
      reconstructions: 0,
      emptyContainersRemoved: 0,
      semanticRestored: 0,
      placeholdersCleaned: 0
    };
  }

  /**
   * Reconstruct DOM after ad element removal
   * @param {Element} removedElement - The element that was removed
   * @param {Element} parent - Parent of removed element
   */
  reconstructAfterRemoval(removedElement, parent) {
    if (!parent || !this.document.contains(parent)) return;

    this.reconstructionQueue.push({ removedElement, parent, timestamp: Date.now() });
    this._processQueue();
  }

  async _processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.reconstructionQueue.length > 0) {
      const { removedElement, parent } = this.reconstructionQueue.shift();
      try {
        await this._reconstruct(parent);
      } catch (e) {
        console.error('[ElementReconstructor] Reconstruction error:', e);
      }
    }

    this.isProcessing = false;
  }

  async _reconstruct(parent) {
    // 1. Remove empty containers
    this._removeEmptyContainers(parent);

    // 2. Fix flexbox/grid gaps
    this._fixLayoutGaps(parent);

    // 3. Restore semantic structure
    this._restoreSemanticStructure(parent);

    // 4. Clean up placeholders
    this._cleanupPlaceholders(parent);

    this.metrics.reconstructions++;
  }

  /**
   * Remove empty container elements that only contained ads
   */
  _removeEmptyContainers(container) {
    const emptySelectors = [
      // Empty ad containers
      '.ad-container:empty', '.ad-wrapper:empty', '.ad-zone:empty', '.ad-space:empty',
      '.ad-box:empty', '.banner-container:empty', '.ad-slot:empty',

      // Generic empty containers that might have held ads
      'div[class*="ad"]:empty', 'div[id*="ad"]:empty',
      'div[class*="banner"]:empty', 'div[id*="banner"]:empty',
      'div[class*="sponsor"]:empty', 'div[id*="sponsor"]:empty',

      // Empty promotional containers
      '.promo-container:empty', '.promo-wrapper:empty',
      '.sponsor-container:empty', '.sponsor-wrapper:empty'
    ];

    for (const selector of emptySelectors) {
      try {
        const elements = container.querySelectorAll(selector);
        for (const el of elements) {
          if (this._isSafeToRemove(el)) {
            el.remove();
            this.metrics.emptyContainersRemoved++;
          }
        }
      } catch (e) { /* ignore */ }
    }

    // Also check for containers with only hidden children
    const allDivs = container.querySelectorAll('div, section, aside, header, footer, main');
    for (const el of allDivs) {
      if (this._hasOnlyHiddenChildren(el)) {
        if (this._isSafeToRemove(el)) {
          el.remove();
          this.metrics.emptyContainersRemoved++;
        }
      }
    }
  }

  _isSafeToRemove(element) {
    // Don't remove if it has visible content
    const text = (element.textContent || '').trim();
    if (text.length > 10) return false;

    // Don't remove semantic landmarks
    const semanticTags = ['main', 'header', 'footer', 'nav', 'aside', 'article', 'section'];
    if (semanticTags.includes(element.tagName.toLowerCase())) return false;

    // Don't remove if it has important attributes
    if (element.id && (element.id.includes('main') || element.id.includes('content') || element.id.includes('app'))) return false;
    if (element.classList.contains('main') || element.classList.contains('content') || element.classList.contains('container') || element.classList.contains('wrapper')) return false;

    // Don't remove if it has ARIA roles
    if (element.hasAttribute('role') && ['main', 'banner', 'navigation', 'contentinfo', 'complementary'].includes(element.getAttribute('role'))) return false;

    // Don't remove if it has visible children
    const visibleChildren = Array.from(element.children).some(child => {
      const style = this.context.getComputedStyle(child);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    });
    if (visibleChildren) return false;

    return true;
  }

  _hasOnlyHiddenChildren(element) {
    const children = Array.from(element.children);
    if (children.length === 0) return true; // Empty element

    return children.every(child => {
      if (child.hasAttribute('data-aeroguard-hidden')) return true;
      if (child.hasAttribute('data-aeroguard-placeholder')) return true;
      const style = this.context.getComputedStyle(child);
      return style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0';
    });
  }

  /**
   * Fix layout gaps caused by removed elements in flexbox/grid
   */
  _fixLayoutGaps(container) {
    // Flexbox containers
    const flexContainers = container.querySelectorAll('[style*="flex"], [class*="flex"], [class*="grid"]');
    for (const flexContainer of flexContainers) {
      const style = this.context.getComputedStyle(flexContainer);
      if (style.display === 'flex' || style.display === 'inline-flex' ||
          style.display === 'grid' || style.display === 'inline-grid') {

        // Check if justify-content or align-items would cause gaps
        if (style.justifyContent === 'space-between' || style.justifyContent === 'space-around' ||
            style.alignItems === 'stretch') {
          // Add a zero-size spacer if needed
          this._ensureNoLayoutShift(flexContainer);
        }
      }
    }
  }

  _ensureNoLayoutShift(container) {
    // Ensure container has stable dimensions
    const computed = this.context.getComputedStyle(container);
    if (computed.minHeight === '0px' && computed.height === 'auto') {
      container.style.minHeight = '0';
    }
  }

  /**
   * Restore semantic HTML structure
   */
  _restoreSemanticStructure(container) {
    // Fix heading hierarchy
    this._fixHeadingHierarchy(container);

    // Fix list structures
    this._fixListStructures(container);

    // Fix table structures
    this._fixTableStructures(container);

    // Fix form structures
    this._fixFormStructures(container);

    this.metrics.semanticRestored++;
  }

  _fixHeadingHierarchy(container) {
    const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
    let lastLevel = 0;

    for (const heading of headings) {
      if (heading.hasAttribute('data-aeroguard-hidden')) continue;

      const level = parseInt(heading.tagName[1]);
      if (level <= lastLevel + 1) {
        lastLevel = level;
      } else {
        // Heading level skipped - demote to correct level
        const correctTag = `h${Math.min(lastLevel + 1, 6)}`;
        if (correctTag !== heading.tagName.toLowerCase()) {
          this._replaceElement(heading, correctTag);
          lastLevel = parseInt(correctTag[1]);
        }
      }
    }
  }

  _replaceElement(oldElement, newTag) {
    const newElement = this.document.createElement(newTag);
    // Copy attributes
    for (const attr of oldElement.attributes) {
      if (attr.name !== 'data-aeroguard-hidden' && attr.name !== 'data-aeroguard-placeholder') {
        newElement.setAttribute(attr.name, attr.value);
      }
    }
    // Copy content
    newElement.innerHTML = oldElement.innerHTML;
    // Replace
    oldElement.parentNode?.replaceChild(newElement, oldElement);
  }

  _fixListStructures(container) {
    const lists = container.querySelectorAll('ul, ol');
    for (const list of lists) {
      // Remove empty list items
      const items = list.querySelectorAll('li');
      for (const item of items) {
        if (item.hasAttribute('data-aeroguard-hidden') || this._hasOnlyHiddenChildren(item)) {
          item.remove();
        }
      }

      // If list is now empty, remove it
      if (list.children.length === 0) {
        list.remove();
      }
    }
  }

  _fixTableStructures(container) {
    const tables = container.querySelectorAll('table');
    for (const table of tables) {
      // Remove empty rows
      const rows = table.querySelectorAll('tr');
      for (const row of rows) {
        if (row.hasAttribute('data-aeroguard-hidden') || this._hasOnlyHiddenChildren(row)) {
          row.remove();
        }
      }

      // Remove empty thead/tbody/tfoot
      const sections = table.querySelectorAll('thead, tbody, tfoot');
      for (const section of sections) {
        if (section.children.length === 0) {
          section.remove();
        }
      }
    }
  }

  _fixFormStructures(container) {
    const forms = container.querySelectorAll('form');
    for (const form of forms) {
      // Remove hidden fieldsets
      const fieldsets = form.querySelectorAll('fieldset');
      for (const fs of fieldsets) {
        if (fs.hasAttribute('data-aeroguard-hidden')) {
          fs.remove();
        }
      }
    }
  }

  /**
   * Clean up placeholder elements
   */
  _cleanupPlaceholders(container) {
    const placeholders = container.querySelectorAll('[data-aeroguard-placeholder="true"]');
    for (const placeholder of placeholders) {
      if (!placeholder.hasAttribute('data-aeroguard-for')) {
        placeholder.remove();
        this.metrics.placeholdersCleaned++;
      }
    }
  }

  /**
   * Force full reconstruction scan
   */
  scan() {
    this._reconstruct(this.document.body);
  }

  /**
   * Reset metrics
   */
  reset() {
    this.metrics = {
      reconstructions: 0,
      emptyContainersRemoved: 0,
      semanticRestored: 0,
      placeholdersCleaned: 0
    };
  }

  getMetrics() {
    return { ...this.metrics };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let elementReconstructorInstance = null;

export function getElementReconstructor(context = window) {
  if (!elementReconstructorInstance) {
    elementReconstructorInstance = new ElementReconstructor(context);
  }
  return elementReconstructorInstance;
}

export function resetElementReconstructor() {
  if (elementReconstructorInstance) {
    elementReconstructorInstance.reset();
  }
  elementReconstructorInstance = null;
}