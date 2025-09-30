const mockStorage: Record<string, string> = {};

jest.mock('@/firebase', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  getDocs: jest.fn(),
}));
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

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDocs } from 'firebase/firestore';
import { getPreferredPostType, recordPostTypeUsage } from '@/helpers/postPreferences';

const preferredKey = (userId: string) => `preferredPostType.v1:${userId}`;
const usageKey = (userId: string) => `postTypeUsage.v1:${userId}`;

describe('postPreferences helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
  });

  it('records usage increments and updates preferred type', async () => {
    await recordPostTypeUsage('user1', 'celebration');
    expect(mockStorage[usageKey('user1')]).toBeDefined();
    const preferred = JSON.parse(mockStorage[preferredKey('user1')]);
    expect(preferred.type).toBe('celebration');

    await recordPostTypeUsage('user1', 'goal');
    const updatedPreferred = JSON.parse(mockStorage[preferredKey('user1')]);
    expect(updatedPreferred.type).toBe('goal');

    const storedCounts = JSON.parse(mockStorage[usageKey('user1')]);
    expect(storedCounts.counts.goal).toBe(1);
    expect(storedCounts.counts.celebration).toBe(1);
  });

  it('returns cached preferred type without hitting Firestore', async () => {
    const cached = { type: 'struggle', sampledAt: Date.now() };
    mockStorage[preferredKey('user2')] = JSON.stringify(cached);

    const result = await getPreferredPostType('user2');
    expect(result).toBe('struggle');
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('guards when user id is missing', async () => {
    await recordPostTypeUsage(null, 'goal');
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    const result = await getPreferredPostType(null);
    expect(result).toBeNull();
  });
});
