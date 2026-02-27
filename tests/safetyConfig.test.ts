import { getSafetyConfig } from '@/helpers/safety';

describe('getSafetyConfig', () => {
  it('returns region-specific config when region is known', () => {
    expect(getSafetyConfig('US')).toEqual({
      emergencyNumber: '911',
      emergencyUri: 'tel:911',
      resourcesUri: 'https://988lifeline.org/',
    });

    expect(getSafetyConfig('GB')).toEqual({
      emergencyNumber: '999',
      emergencyUri: 'tel:999',
      resourcesUri: 'https://www.samaritans.org/how-we-can-help/',
    });
  });

  it('falls back to defaults for unknown region codes', () => {
    expect(getSafetyConfig('ZZ')).toEqual({
      emergencyNumber: '112',
      emergencyUri: 'tel:112',
      resourcesUri: 'https://www.opencounseling.com/suicide-hotlines',
    });
  });

  it('normalizes region casing and trims whitespace', () => {
    expect(getSafetyConfig('  us  ')).toEqual({
      emergencyNumber: '911',
      emergencyUri: 'tel:911',
      resourcesUri: 'https://988lifeline.org/',
    });
  });
});
