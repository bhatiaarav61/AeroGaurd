/**
 * Element Reconstructor Tests (ESM version for Vitest)
 * Tests semantic restoration, placeholder removal, and structure healing
 */

import { ElementReconstructor, getElementReconstructor, resetElementReconstructor } from '../../core/cosmetic-engine/element-reconstructor.js';

// Mock DOM environment with proper getComputedStyle that reads inline styles
const createMockContext = () => {
  const mockGetComputedStyle = (element) => {
    const style = element.style || {};
    // Parse inline style attribute if style object is empty
    const inlineStyle = element.getAttribute('style') || '';
    const parseInlineStyle = (attr) => {
      const regex = new RegExp(`${attr.replace('-', '\\-')}\\s*:\\s*([^;]+)`);
      const match = inlineStyle.match(regex);
      return match ? match[1].trim() : null;
    };

    return {
      display: style.display || parseInlineStyle('display') || (element.tagName ? 'block' : 'none'),
      visibility: style.visibility || parseInlineStyle('visibility') || 'visible',
      opacity: style.opacity !== undefined && style.opacity !== '' ? style.opacity : (parseInlineStyle('opacity') || '1'),
      marginTop: style.marginTop || parseInlineStyle('margin-top') || '0px',
      marginRight: style.marginRight || parseInlineStyle('margin-right') || '0px',
      marginBottom: style.marginBottom || parseInlineStyle('margin-bottom') || '0px',
      marginLeft: style.marginLeft || parseInlineStyle('margin-left') || '0px',
      paddingTop: style.paddingTop || parseInlineStyle('padding-top') || '0px',
      paddingRight: style.paddingRight || parseInlineStyle('padding-right') || '0px',
      paddingBottom: style.paddingBottom || parseInlineStyle('padding-bottom') || '0px',
      paddingLeft: style.paddingLeft || parseInlineStyle('padding-left') || '0px',
      borderTopWidth: style.borderTopWidth || parseInlineStyle('border-top-width') || '0px',
      borderRightWidth: style.borderRightWidth || parseInlineStyle('border-right-width') || '0px',
      borderBottomWidth: style.borderBottomWidth || parseInlineStyle('border-bottom-width') || '0px',
      borderLeftWidth: style.borderLeftWidth || parseInlineStyle('border-left-width') || '0px',
      boxSizing: style.boxSizing || parseInlineStyle('box-sizing') || 'border-box',
      overflow: style.overflow || parseInlineStyle('overflow') || 'visible',
      flex: style.flex || parseInlineStyle('flex') || '0 1 auto',
      flexDirection: style.flexDirection || parseInlineStyle('flex-direction') || 'row',
      flexWrap: style.flexWrap || parseInlineStyle('flex-wrap') || 'nowrap',
      flexBasis: style.flexBasis || parseInlineStyle('flex-basis') || 'auto',
      flexGrow: style.flexGrow || parseInlineStyle('flex-grow') || '0',
      flexShrink: style.flexShrink || parseInlineStyle('flex-shrink') || '1',
      gridColumn: style.gridColumn || parseInlineStyle('grid-column') || 'auto',
      gridRow: style.gridRow || parseInlineStyle('grid-row') || 'auto',
      gridArea: style.gridArea || parseInlineStyle('grid-area') || 'auto',
      alignSelf: style.alignSelf || parseInlineStyle('align-self') || 'auto',
      justifySelf: style.justifySelf || parseInlineStyle('justify-self') || 'auto',
      order: style.order || parseInlineStyle('order') || '0',
      zIndex: style.zIndex || parseInlineStyle('z-index') || 'auto',
      transform: style.transform || parseInlineStyle('transform') || 'none',
      transition: style.transition || parseInlineStyle('transition') || 'none',
      transitionDuration: style.transitionDuration || parseInlineStyle('transition-duration') || '0s',
      minHeight: style.minHeight || parseInlineStyle('min-height') || 'auto',
      height: style.height || parseInlineStyle('height') || 'auto',
      contain: style.contain || parseInlineStyle('contain') || 'none',
      containIntrinsicWidth: style.containIntrinsicWidth || parseInlineStyle('contain-intrinsic-width') || 'none',
      containIntrinsicHeight: style.containIntrinsicHeight || parseInlineStyle('contain-intrinsic-height') || 'none',
      justifyContent: style.justifyContent || parseInlineStyle('justify-content') || 'flex-start',
      alignItems: style.alignItems || parseInlineStyle('align-items') || 'stretch',
    };
  };

  return {
    document: document,
    getComputedStyle: mockGetComputedStyle,
    Node: { ELEMENT_NODE: 1 },
    requestAnimationFrame: (cb) => setTimeout(cb, 0),
    MutationObserver: window.MutationObserver
  };
};

describe('ElementReconstructor', () => {
  let reconstructor;
  let mockContext;
  let container;

  beforeEach(() => {
    // Reset singleton
    resetElementReconstructor();

    // Create test container
    container = document.createElement('div');
    container.id = 'test-container';
    container.setAttribute('data-test', 'true');
    document.body.appendChild(container);

    // Setup mock context
    mockContext = createMockContext();

    reconstructor = new ElementReconstructor(mockContext);
  });

  afterEach(() => {
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
    resetElementReconstructor();
    // Clean up any test elements
    document.querySelectorAll('[data-test="true"]').forEach(el => el.remove());
  });

  describe('Empty Container Removal', () => {
    test('should remove empty ad containers', async () => {
      container.innerHTML = `
        <div class="ad-container"></div>
        <div class="ad-wrapper"></div>
        <div class="ad-zone"></div>
        <div class="ad-space"></div>
        <div class="banner-container"></div>
        <div class="ad-slot"></div>
      `;

      await reconstructor._reconstruct(container);

      expect(container.querySelector('.ad-container')).toBeNull();
      expect(container.querySelector('.ad-wrapper')).toBeNull();
      expect(container.querySelector('.ad-zone')).toBeNull();
      expect(container.querySelector('.ad-space')).toBeNull();
      expect(container.querySelector('.banner-container')).toBeNull();
      expect(container.querySelector('.ad-slot')).toBeNull();
      expect(reconstructor.metrics.emptyContainersRemoved).toBe(6);
    });

    test('should remove empty promo/sponsor containers', async () => {
      container.innerHTML = `
        <div class="promo-container"></div>
        <div class="promo-wrapper"></div>
        <div class="sponsor-container"></div>
        <div class="sponsor-wrapper"></div>
      `;

      await reconstructor._reconstruct(container);

      expect(container.querySelector('.promo-container')).toBeNull();
      expect(container.querySelector('.promo-wrapper')).toBeNull();
      expect(container.querySelector('.sponsor-container')).toBeNull();
      expect(container.querySelector('.sponsor-wrapper')).toBeNull();
      expect(reconstructor.metrics.emptyContainersRemoved).toBe(4);
    });

    test('should remove divs with ad/banner/sponsor in class/id that are empty', async () => {
      container.innerHTML = `
        <div class="my-ad-banner"></div>
        <div id="top-ad"></div>
        <div class="sponsor-box"></div>
        <div id="banner-ad"></div>
      `;

      await reconstructor._reconstruct(container);

      expect(container.querySelector('.my-ad-banner')).toBeNull();
      expect(container.querySelector('#top-ad')).toBeNull();
      expect(container.querySelector('.sponsor-box')).toBeNull();
      expect(container.querySelector('#banner-ad')).toBeNull();
      expect(reconstructor.metrics.emptyContainersRemoved).toBe(4);
    });

    test('should NOT remove containers with visible text content', async () => {
      container.innerHTML = `
        <div class="ad-container">Real content here</div>
        <div class="ad-wrapper">More content</div>
      `;

      await reconstructor._reconstruct(container);

      expect(container.querySelector('.ad-container')).not.toBeNull();
      expect(container.querySelector('.ad-wrapper')).not.toBeNull();
      expect(reconstructor.metrics.emptyContainersRemoved).toBe(0);
    });

    test('should NOT remove semantic landmark elements', async () => {
      container.innerHTML = `
        <main class="ad-container"></main>
        <header class="ad-wrapper"></header>
        <footer id="footer-ad"></footer>
        <nav class="banner-nav"></nav>
        <aside class="sponsor-aside"></aside>
        <article class="promo-article"></article>
        <section class="ad-section"></section>
      `;

      await reconstructor._reconstruct(container);

      expect(container.querySelector('main')).not.toBeNull();
      expect(container.querySelector('header')).not.toBeNull();
      expect(container.querySelector('footer')).not.toBeNull();
      expect(container.querySelector('nav')).not.toBeNull();
      expect(container.querySelector('aside')).not.toBeNull();
      expect(container.querySelector('article')).not.toBeNull();
      expect(container.querySelector('section')).not.toBeNull();
      expect(reconstructor.metrics.emptyContainersRemoved).toBe(0);
    });

    test('should NOT remove elements with important IDs', async () => {
      container.innerHTML = `
        <div id="main-content" class="ad-container"></div>
        <div id="app-wrapper" class="ad-wrapper"></div>
        <div id="content-area" class="banner-container"></div>
      `;

      await reconstructor._reconstruct(container);

      expect(container.querySelector('#main-content')).not.toBeNull();
      expect(container.querySelector('#app-wrapper')).not.toBeNull();
      expect(container.querySelector('#content-area')).not.toBeNull();
      expect(reconstructor.metrics.emptyContainersRemoved).toBe(0);
    });

    test('should NOT remove elements with important class names', async () => {
      container.innerHTML = `
        <div class="main ad-container"></div>
        <div class="content ad-wrapper"></div>
        <div class="container banner-container"></div>
        <div class="wrapper promo-container"></div>
      `;

      await reconstructor._reconstruct(container);

      expect(container.querySelector('.main')).not.toBeNull();
      expect(container.querySelector('.content')).not.toBeNull();
      expect(container.querySelector('.container')).not.toBeNull();
      expect(container.querySelector('.wrapper')).not.toBeNull();
      expect(reconstructor.metrics.emptyContainersRemoved).toBe(0);
    });

    test('should NOT remove elements with ARIA landmark roles', async () => {
      container.innerHTML = `
        <div role="main" class="ad-container"></div>
        <div role="banner" class="ad-wrapper"></div>
        <div role="navigation" class="banner-container"></div>
        <div role="contentinfo" class="promo-container"></div>
        <div role="complementary" class="sponsor-container"></div>
      `;

      await reconstructor._reconstruct(container);

      expect(container.querySelector('[role="main"]')).not.toBeNull();
      expect(container.querySelector('[role="banner"]')).not.toBeNull();
      expect(container.querySelector('[role="navigation"]')).not.toBeNull();
      expect(container.querySelector('[role="contentinfo"]')).not.toBeNull();
      expect(container.querySelector('[role="complementary"]')).not.toBeNull();
      expect(reconstructor.metrics.emptyContainersRemoved).toBe(0);
    });

    test('should remove containers with only hidden children', async () => {
      container.innerHTML = `
        <div class="ad-container">
          <div style="display: none;">Hidden</div>
          <div style="visibility: hidden;">Hidden</div>
          <div style="opacity: 0;">Hidden</div>
        </div>
        <div class="ad-wrapper">
          <div data-aeroguard-hidden="true">Marked hidden</div>
          <div data-aeroguard-placeholder="true">Placeholder</div>
        </div>
      `;

      await reconstructor._reconstruct(container);

      expect(container.querySelector('.ad-container')).toBeNull();
      expect(container.querySelector('.ad-wrapper')).toBeNull();
      expect(reconstructor.metrics.emptyContainersRemoved).toBe(2);
    });

    test('should NOT remove containers with visible children', async () => {
      container.innerHTML = `
        <div class="ad-container">
          <div style="display: none;">Hidden</div>
          <div>Visible content</div>
        </div>
      `;

      await reconstructor._reconstruct(container);

      expect(container.querySelector('.ad-container')).not.toBeNull();
      expect(reconstructor.metrics.emptyContainersRemoved).toBe(0);
    });
  });

  describe('Layout Gap Fixing', () => {
    test('should handle flexbox containers with space-between', async () => {
      container.innerHTML = `
        <div style="display: flex; justify-content: space-between;">
          <div class="item">Item 1</div>
          <div class="ad-slot" style="width: 100px;"></div>
          <div class="item">Item 3</div>
        </div>
      `;

      // The ad-slot will be removed by empty container removal
      container.querySelector('.ad-slot').remove();

      await reconstructor._reconstruct(container);

      const flexContainer = container.querySelector('[style*="flex"]');
      expect(flexContainer).not.toBeNull();
      // Should have minHeight set to prevent layout shift
      expect(flexContainer.style.minHeight).toBe('0');
    });

    test('should handle grid containers', async () => {
      container.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr;">
          <div class="item">Item 1</div>
          <div class="ad-slot"></div>
          <div class="item">Item 3</div>
        </div>
      `;

      container.querySelector('.ad-slot').remove();

      await reconstructor._reconstruct(container);

      const gridContainer = container.querySelector('[style*="grid"]');
      expect(gridContainer).not.toBeNull();
    });
  });

  describe('Semantic Structure Restoration', () => {
    test('should fix heading hierarchy - demote skipped levels', async () => {
      container.innerHTML = `
        <h1>Main Title</h1>
        <h3>Subsection (skipped h2)</h3>
        <h4>Sub-subsection</h4>
        <h2>Another section</h2>
        <h5>Deep subsection (skipped h3,h4)</h5>
      `;

      await reconstructor._reconstruct(container);

      const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
      expect(headings[0].tagName).toBe('H1');
      expect(headings[1].tagName).toBe('H2'); // Was h3, demoted to h2
      expect(headings[2].tagName).toBe('H3'); // Was h4, demoted to h3
      expect(headings[3].tagName).toBe('H2');
      expect(headings[4].tagName).toBe('H3'); // Was h5, demoted to h3 (h2+1)
    });

    test('should NOT modify headings marked as hidden', async () => {
      container.innerHTML = `
        <h1>Main Title</h1>
        <h3 data-aeroguard-hidden="true">Hidden subsection</h3>
        <h2>Another section</h2>
      `;

      await reconstructor._reconstruct(container);

      const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
      expect(headings[0].tagName).toBe('H1');
      expect(headings[1].tagName).toBe('H3'); // Hidden, should not be modified
      expect(headings[2].tagName).toBe('H2');
    });

    test('should remove empty list items', async () => {
      container.innerHTML = `
        <ul>
          <li>Item 1</li>
          <li data-aeroguard-hidden="true"></li>
          <li>Item 3</li>
          <li><div style="display: none;">Hidden only</div></li>
        </ul>
      `;

      await reconstructor._reconstruct(container);

      const items = container.querySelectorAll('li');
      expect(items.length).toBe(2); // Only visible items remain
      expect(items[0].textContent).toBe('Item 1');
      expect(items[1].textContent).toBe('Item 3');
    });

    test('should remove empty lists', async () => {
      container.innerHTML = `
        <ul>
          <li data-aeroguard-hidden="true"></li>
          <li data-aeroguard-placeholder="true"></li>
        </ul>
        <ol>
          <li>Real item</li>
        </ol>
      `;

      await reconstructor._reconstruct(container);

      const lists = container.querySelectorAll('ul, ol');
      expect(lists.length).toBe(1); // Empty ul removed
      expect(lists[0].tagName).toBe('OL');
    });

    test('should remove empty table rows', async () => {
      container.innerHTML = `
        <table>
          <thead>
            <tr><th>Header</th></tr>
            <tr data-aeroguard-hidden="true"><th>Hidden</th></tr>
          </thead>
          <tbody>
            <tr><td>Data</td></tr>
            <tr><td style="display: none;"></td></tr>
          </tbody>
          <tfoot>
            <tr data-aeroguard-placeholder="true"><td></td></tr>
          </tfoot>
        </table>
      `;

      await reconstructor._reconstruct(container);

      const rows = container.querySelectorAll('tr');
      expect(rows.length).toBe(2); // Header row + data row
      expect(rows[0].closest('thead')).not.toBeNull();
      expect(rows[1].closest('tbody')).not.toBeNull();
    });

    test('should remove empty thead/tbody/tfoot', async () => {
      container.innerHTML = `
        <table>
          <thead></thead>
          <tbody><tr><td>Data</td></tr></tbody>
          <tfoot data-aeroguard-hidden="true"></tfoot>
        </table>
      `;

      await reconstructor._reconstruct(container);

      const sections = container.querySelectorAll('thead, tbody, tfoot');
      expect(sections.length).toBe(1); // Only tbody remains
      expect(sections[0].tagName).toBe('TBODY');
    });

    test('should remove hidden fieldsets in forms', async () => {
      container.innerHTML = `
        <form>
          <fieldset><legend>Visible</legend><input></fieldset>
          <fieldset data-aeroguard-hidden="true"><legend>Hidden</legend><input></fieldset>
          <fieldset><legend>Also visible</legend><input></fieldset>
        </form>
      `;

      await reconstructor._reconstruct(container);

      const fieldsets = container.querySelectorAll('fieldset');
      expect(fieldsets.length).toBe(2);
    });
  });

  describe('Placeholder Cleanup', () => {
    test('should remove placeholders without data-aeroguard-for attribute', async () => {
      container.innerHTML = `
        <div data-aeroguard-placeholder="true"></div>
        <div data-aeroguard-placeholder="true" data-aeroguard-for="something"></div>
        <div data-aeroguard-placeholder="true"></div>
      `;

      await reconstructor._reconstruct(container);

      const placeholders = container.querySelectorAll('[data-aeroguard-placeholder="true"]');
      expect(placeholders.length).toBe(1); // Only the one with data-aeroguard-for remains
      expect(placeholders[0].hasAttribute('data-aeroguard-for')).toBe(true);
      expect(reconstructor.metrics.placeholdersCleaned).toBe(2);
    });

    test('should keep placeholders with data-aeroguard-for attribute', async () => {
      container.innerHTML = `
        <div data-aeroguard-placeholder="true" data-aeroguard-for="div.ad-slot"></div>
        <div data-aeroguard-placeholder="true" data-aeroguard-for="iframe.ad"></div>
      `;

      await reconstructor._reconstruct(container);

      const placeholders = container.querySelectorAll('[data-aeroguard-placeholder="true"]');
      expect(placeholders.length).toBe(2);
      expect(reconstructor.metrics.placeholdersCleaned).toBe(0);
    });
  });

  describe('Full Reconstruction Flow', () => {
    test('should execute full reconstruction pipeline', async () => {
      container.innerHTML = `
        <div class="ad-container"></div>
        <h1>Title</h1>
        <h3>Skipped h2</h3>
        <ul>
          <li>Item 1</li>
          <li data-aeroguard-hidden="true"></li>
        </ul>
        <div data-aeroguard-placeholder="true"></div>
        <div data-aeroguard-placeholder="true" data-aeroguard-for="ad"></div>
      `;

      await reconstructor._reconstruct(container);

      // Empty ad container removed
      expect(container.querySelector('.ad-container')).toBeNull();
      // Heading fixed
      const headings = container.querySelectorAll('h1, h2, h3');
      expect(headings[1].tagName).toBe('H2');
      // Empty list item removed
      expect(container.querySelectorAll('li').length).toBe(1);
      // Placeholder without 'for' removed
      const placeholders = container.querySelectorAll('[data-aeroguard-placeholder="true"]');
      expect(placeholders.length).toBe(1);
      expect(placeholders[0].hasAttribute('data-aeroguard-for')).toBe(true);

      expect(reconstructor.metrics.reconstructions).toBe(1);
      expect(reconstructor.metrics.emptyContainersRemoved).toBe(1);
      expect(reconstructor.metrics.semanticRestored).toBe(1);
      expect(reconstructor.metrics.placeholdersCleaned).toBe(1);
    });

    test('should handle reconstructAfterRemoval queue', async () => {
      const parent = document.createElement('div');
      parent.setAttribute('data-test', 'true');
      parent.innerHTML = '<div class="ad-container"></div>';
      container.appendChild(parent);

      const removedElement = parent.querySelector('.ad-container');
      reconstructor.reconstructAfterRemoval(removedElement, parent);

      // Wait for async queue processing
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(parent.querySelector('.ad-container')).toBeNull();
      expect(reconstructor.metrics.reconstructions).toBe(1);
    });
  });

  describe('Metrics', () => {
    test('should track metrics correctly', async () => {
      container.innerHTML = `
        <div class="ad-container"></div>
        <div class="ad-wrapper"></div>
        <h1>Title</h1>
        <h3>Sub</h3>
        <div data-aeroguard-placeholder="true"></div>
      `;

      await reconstructor._reconstruct(container);
      await reconstructor._reconstruct(container); // Second reconstruction

      const metrics = reconstructor.getMetrics();
      expect(metrics.reconstructions).toBe(2);
      expect(metrics.emptyContainersRemoved).toBe(4); // 2 per reconstruction
      expect(metrics.semanticRestored).toBe(2);
      expect(metrics.placeholdersCleaned).toBe(2);
    });

    test('should reset metrics', async () => {
      container.innerHTML = `<div class="ad-container"></div>`;
      await reconstructor._reconstruct(container);

      reconstructor.reset();
      const metrics = reconstructor.getMetrics();

      expect(metrics.reconstructions).toBe(0);
      expect(metrics.emptyContainersRemoved).toBe(0);
      expect(metrics.semanticRestored).toBe(0);
      expect(metrics.placeholdersCleaned).toBe(0);
    });
  });

  describe('Singleton Management', () => {
    test('should return same instance from getElementReconstructor', () => {
      const instance1 = getElementReconstructor(mockContext);
      const instance2 = getElementReconstructor(mockContext);
      expect(instance1).toBe(instance2);
    });

    test('should create new instance after reset', () => {
      const instance1 = getElementReconstructor(mockContext);
      resetElementReconstructor();
      const instance2 = getElementReconstructor(mockContext);
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('scan() method', () => {
    test('should scan entire document body', async () => {
      document.body.innerHTML = `
        <div class="ad-container"></div>
        <h1>Title</h1>
        <h3>Sub</h3>
      `;

      await reconstructor.scan();

      expect(document.querySelector('.ad-container')).toBeNull();
      const headings = document.querySelectorAll('h1, h2, h3');
      expect(headings[1].tagName).toBe('H2');
    });
  });
});