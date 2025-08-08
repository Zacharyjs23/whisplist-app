import { normalizeAndValidateUrl } from '@/helpers/url';

describe('normalizeAndValidateUrl', () => {
  it('accepts and normalizes allowed hosts', () => {
    expect(normalizeAndValidateUrl('amazon.com/path')).toBe(
      'https://amazon.com/path',
    );
    expect(normalizeAndValidateUrl('https://subdomain.amazon.com/')).toBe(
      'https://subdomain.amazon.com/',
    );
  });

  it('rejects non-https or disallowed hosts', () => {
    expect(normalizeAndValidateUrl('http://amazon.com')).toBeNull();
    expect(normalizeAndValidateUrl('https://evil.com')).toBeNull();
  });

  it('supports custom host lists', () => {
    expect(normalizeAndValidateUrl('example.com', ['example.com'])).toBe(
      'https://example.com/',
    );
    expect(normalizeAndValidateUrl('example.com')).toBeNull();
  });
});
