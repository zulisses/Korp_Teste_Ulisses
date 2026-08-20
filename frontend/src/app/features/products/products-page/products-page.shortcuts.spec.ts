import { resolveProductShortcut } from './products-page';

describe('product productivity shortcuts', () => {
  it('maps the explicit Alt shortcuts', () => {
    expect(resolveProductShortcut(keyboardEvent('n', true))).toBe('create');
    expect(resolveProductShortcut(keyboardEvent('R', true))).toBe('reload');
  });

  it('maps slash to search without modifiers', () => {
    expect(resolveProductShortcut(keyboardEvent('/'))).toBe('search');
  });

  it('ignores conflicting control and meta combinations', () => {
    expect(resolveProductShortcut({ ...keyboardEvent('n', true), ctrlKey: true })).toBeNull();
    expect(resolveProductShortcut({ ...keyboardEvent('/', false), metaKey: true })).toBeNull();
  });
});

function keyboardEvent(
  key: string,
  altKey = false,
): Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'key' | 'metaKey'> {
  return { key, altKey, ctrlKey: false, metaKey: false };
}
