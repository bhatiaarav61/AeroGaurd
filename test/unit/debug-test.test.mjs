import { ElementReconstructor } from '../../core/cosmetic-engine/element-reconstructor.js';

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
  };
};

const mockContext = {
  document: document,
  getComputedStyle: mockGetComputedStyle,
  Node: { ELEMENT_NODE: 1 },
  requestAnimationFrame: (cb) => setTimeout(cb, 0),
  MutationObserver: window.MutationObserver
};

const reconstructor = new ElementReconstructor(mockContext);

const container = document.createElement('div');
container.innerHTML = `
  <div class="ad-container">
    <div style="display: none;">Hidden</div>
    <div style="visibility: hidden;">Hidden</div>
    <div style="opacity: 0;">Hidden</div>
  </div>
`;

console.log('Before reconstruct:');
console.log('ad-container:', container.querySelector('.ad-container'));
console.log('Children:', Array.from(container.querySelector('.ad-container').children).map(c => ({
  style: c.getAttribute('style'),
  display: mockGetComputedStyle(c).display,
  visibility: mockGetComputedStyle(c).visibility,
  opacity: mockGetComputedStyle(c).opacity
})));

await reconstructor._reconstruct(container);

console.log('After reconstruct:');
console.log('ad-container:', container.querySelector('.ad-container'));
console.log('Metrics:', reconstructor.metrics);
