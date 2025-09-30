import { getLocalDateKey } from '@/helpers/date';

describe('getLocalDateKey', () => {
  it('formats date as YYYY-MM-DD in local time', () => {
    const d = new Date('2025-01-02T03:04:05.000Z');
    const key = getLocalDateKey(d);
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

