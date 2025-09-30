import { generateQuote } from '@/helpers/quoteGenerator';

describe('quoteGenerator', () => {
  const t = (key: string, opts?: { returnObjects?: boolean }) => {
    if (!opts?.returnObjects) return '';
    if (key.endsWith('starts')) return ['Start A', 'Start B', 'Start C'];
    if (key.endsWith('actions')) return ['do things', 'keep going', 'stay present'];
    if (key.endsWith('endings')) return ['and smile.', 'with heart.', 'today.'];
    return [] as any;
  };

  it('returns a composed quote string when banks exist', () => {
    const q = generateQuote(t as any);
    expect(typeof q).toBe('string');
    expect(q).toBeTruthy();
  });

  it('returns null when banks are missing', () => {
    const emptyT = ((key: string, opts?: { returnObjects?: boolean }) => []) as any;
    const q = generateQuote(emptyT);
    expect(q).toBeNull();
  });
});

