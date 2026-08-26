import { describe, test, expect, beforeEach } from 'vitest';
import { ElementReconstructor, resetElementReconstructor } from '../../core/cosmetic-engine/element-reconstructor.js';

const mockGetComputedStyle = (element) => {
  const style = element.style || {};
  const inlineStyle = element.getAttribute('style') || '';
  const parseInlineStyle = (attr) => {
    const regex = new RegExp(`${attr.replace('-', '\-')}\s*:\s*([^;]+)`);
    const match = inlineStyle.match(regex);
    return match ? match[1].trim() : null;
  };

  return {
    display: style.display || parseInlineStyle('display') || (element.tagName ? 'block' : 'none'),
    visibility: style.visibility || parseInlineStyle('visibility') || 'visible',
    opacity: style.opacity !== undefined && style.opacity !== '' ? style.opacity : (parseInlineStyle('opacity') || '1'),
    marginTop: '0px', marginRight: '0px', marginBottom: '0px', marginLeft: '0px',
    paddingTop: '0px', paddingRight: '0px', paddingBottom: '0px', paddingLeft: '0px',
    borderTopWidth: '0px', borderRightWidth: '0px', borderBottomWidth: '0px', borderLeftWidth: '0px',
    boxSizing: 'border-box', overflow: 'visible',
    flex: '0 1 auto', flexDirection: 'row', flexWrap: 'nowrap', flexBasis: 'auto',
    flexGrow: '0', flexShrink: '1', gridColumn: 'auto', gridRow: 'auto', gridArea: 'auto',
    alignSelf: 'auto', justifySelf: 'auto', order: '0', zIndex: 'auto',
    transform: 'none', transition: 'none', transitionDuration: '0s',
    minHeight: 'auto', height: 'auto', contain: 'none',
    containIntrinsicWidth: 'none', containIntrinsicHeight: 'none',
    justifyContent: 'flex-start', alignItems: 'stretch',
  };
};

const mockContext = {
  document: document,
  getComputedStyle: mockGetComputedStyle,
  Node: { ELEMENT_NODE: 1 },
  requestAnimationFrame: (cb) => setTimeout(cb, 0),
  MutationObserver: window.MutationObserver
};

describe('Debug full reconstructor', () => {
  let reconstructor;
  let container;

  beforeEach(() => {
    resetElementReconstructor();
    container = document.createElement('div');
    document.body.appendChild(container);
    reconstructor = new ElementReconstructor(mockContext);
  });

  test('should debug _hasOnlyHiddenChildren', async () => {
    container.innerHTML = `
      <div class="ad-container">
        <div style="display: none;">Hidden</div>
        <div style="visibility: hidden;">Hidden</div>
        <div style="opacity: 0;">Hidden</div>
      </div>
    `;
    
    const parent = container.querySelector('.ad-container');
    console.log('Parent textContent:', JSON.stringify(parent.textContent));
    console.log('Parent textContent length:', parent.textContent.trim().length);
    
    // Test _hasOnlyHiddenChildren
    const hasOnlyHidden = reconstructor._hasOnlyHiddenChildren(parent);
    console.log('_hasOnlyHiddenChildren:', hasOnlyHidden);
    
    // Test _isSafeToRemove
    const safeToRemove = reconstructor._isSafeToRemove(parent);
    console.log('_isSafeToRemove:', safeToRemove);
    
    await reconstructor._reconstruct(container);
    
    console.log('After reconstruct:');
    console.log('ad-container exists:', !!container.querySelector('.ad-container'));
    console.log('Metrics:', reconstructor.metrics);
  });
});
