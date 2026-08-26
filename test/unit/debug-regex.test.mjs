import { describe, test, expect } from 'vitest';

describe('Debug regex', () => {
  test('test parse inline style', () => {
    const inlineStyle = 'visibility: hidden;';
    const attr = 'visibility';
    const regex = new RegExp(`${attr.replace('-', '\-')}\s*:\s*([^;]+)`);
    const match = inlineStyle.match(regex);
    console.log('inlineStyle:', inlineStyle);
    console.log('regex:', regex);
    console.log('match:', match);
    expect(match).not.toBeNull();
    expect(match[1].trim()).toBe('hidden');
  });

  test('test opacity', () => {
    const inlineStyle = 'opacity: 0;';
    const attr = 'opacity';
    const regex = new RegExp(`${attr.replace('-', '\-')}\s*:\s*([^;]+)`);
    const match = inlineStyle.match(regex);
    console.log('inlineStyle:', inlineStyle);
    console.log('regex:', regex);
    console.log('match:', match);
    expect(match).not.toBeNull();
    expect(match[1].trim()).toBe('0');
  });
});
