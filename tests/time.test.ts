import { formatTimeLeft } from '@/helpers/time';

describe('formatTimeLeft', () => {
  const realDateNow = Date.now;

  beforeEach(() => {
    Date.now = jest.fn(() => new Date('2024-01-01T00:00:00Z').getTime());
  });

  afterEach(() => {
    Date.now = realDateNow;
  });

  it('formats remaining time for future date', () => {
    const future = new Date('2024-01-01T02:30:00Z');
    expect(formatTimeLeft(future)).toBe('2h 30m left');
  });

  it('returns empty string for past date', () => {
    const past = new Date('2023-12-31T23:59:00Z');
    expect(formatTimeLeft(past)).toBe('');
  });
});

