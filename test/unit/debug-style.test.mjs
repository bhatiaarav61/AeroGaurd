import { describe, test, expect } from 'vitest';

describe('Debug style property', () => {
  test('test element.style', () => {
    const div = document.createElement('div');
    div.setAttribute('style', 'visibility: hidden;');
    
    console.log('style object:', div.style);
    console.log('style.visibility:', div.style.visibility);
    console.log('style.display:', div.style.display);
    console.log('style.opacity:', div.style.opacity);
    console.log('getAttribute:', div.getAttribute('style'));
    
    expect(div.style.visibility).toBe('hidden');
  });
});
