const mockStorage: Record<string, string> = {};

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((key: string) => Promise.resolve(mockStorage[key] ?? null)),
    setItem: jest.fn((key: string, value: string) => {
      mockStorage[key] = value;
      return Promise.resolve();
    }),
    removeItem: jest.fn((key: string) => {
      delete mockStorage[key];
      return Promise.resolve();
    }),
  },
}));
jest.mock('@/helpers/wishes', () => ({ addWish: jest.fn(() => Promise.resolve()) }));
jest.mock('@/helpers/analytics', () => ({ trackEvent: jest.fn() }));
jest.mock('@/helpers/engagement', () => ({ recordEngagementEvent: jest.fn(() => Promise.resolve()) }));
jest.mock('@/helpers/postPreferences', () => ({ recordPostTypeUsage: jest.fn(() => Promise.resolve()) }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { addWish } from '@/helpers/wishes';
import { trackEvent } from '@/helpers/analytics';
import { recordPostTypeUsage } from '@/helpers/postPreferences';
import { enqueuePendingWish, flushPendingWishes } from '@/helpers/offlineQueue';

const queueKey = 'pendingWishQueue.v1';

declare let fetch: jest.Mock;

describe('offline queue analytics metadata', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
    fetch = jest.fn(() => Promise.resolve({ ok: true }));
    global.fetch = fetch as unknown as typeof global.fetch;
  });

  it('logs post type when enqueueing pending wish', async () => {
    await enqueuePendingWish({ type: 'confession', text: 'Queued!' });

    expect(trackEvent).toHaveBeenCalledWith(
      'offline_queue_enqueued',
      expect.objectContaining({ post_type: 'struggle' }),
    );
    expect(mockStorage[queueKey]).toBeDefined();
  });

  it('tracks post type on successful flush', async () => {
    await enqueuePendingWish({
      type: 'confession',
      text: 'Queued!',
      userId: 'tester',
    });

    (trackEvent as jest.Mock).mockClear();
    await flushPendingWishes();

    expect(addWish).toHaveBeenCalled();
    expect(trackEvent).toHaveBeenCalledWith(
      'post_success',
      expect.objectContaining({ post_type: 'struggle', offline: true }),
    );
    expect(recordPostTypeUsage).toHaveBeenCalledWith('tester', 'struggle');
    const stored = JSON.parse(mockStorage[queueKey]);
    expect(Array.isArray(stored)).toBe(true);
  });

  it('reports offline state with type metadata when offline', async () => {
    await enqueuePendingWish({ type: 'advice', text: 'Need help', userId: 'u4' });
    (trackEvent as jest.Mock).mockClear();

    fetch.mockImplementation(() => Promise.resolve({ ok: false }));
    const result = await flushPendingWishes();

    expect(result.posted).toBe(0);
    expect(trackEvent).toHaveBeenCalledWith(
      'offline_queue_state',
      expect.objectContaining({ online: false, next_type: 'advice' }),
    );
  });
});
