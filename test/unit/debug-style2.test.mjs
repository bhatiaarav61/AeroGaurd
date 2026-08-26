import { describe, test, expect } from 'vitest';

describe('Debug style property 2', () => {
  test('test element.style for different values', () => {
    const div1 = document.createElement('div');
    div1.setAttribute('style', 'visibility: hidden;');
    
    const div2 = document.createElement('div');
    div2.setAttribute('style', 'opacity: 0;');
    
    const div3 = document.createElement('div');
    div3.setAttribute('style', 'display: none;');
    
    console.log('div1.style.visibility:', JSON.stringify(div1.style.visibility));
    console.log('div1.style.display:', JSON.stringify(div1.style.display));
    console.log('div1.style.opacity:', JSON.stringify(div1.style.opacity));
    
    console.log('div2.style.visibility:', JSON.stringify(div2.style.visibility));
    console.log('div2.style.display:', JSON.stringify(div2.style.display));
    console.log('div2.style.opacity:', JSON.stringify(div2.style.opacity));
    
    console.log('div3.style.visibility:', JSON.stringify(div3.style.visibility));
    console.log('div3.style.display:', JSON.stringify(div3.style.display));
    console.log('div3.style.opacity:', JSON.stringify(div3.style.opacity));
    
    expect(div1.style.visibility).toBe('hidden');
    expect(div2.style.opacity).toBe('0');
    expect(div3.style.display).toBe('none');
  });
});
