import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';

const mockGetIdToken = jest.fn<Promise<string>, []>();
const mockFunctionUrl = jest.fn((name: string) => `https://example.com/${name}`);

jest.mock('@/firebase', () => ({
  auth: {
    currentUser: {
      getIdToken: () => mockGetIdToken(),
    },
  },
}));

jest.mock('@/services/functions', () => ({
  functionUrl: (name: string) => mockFunctionUrl(name),
}));

const interpolate = (template: string, values: Record<string, unknown> = {}) =>
  template.replace(/{{\s*(\w+)\s*}}/g, (_, token: string) => String(values[token] ?? ''));

jest.mock('@/contexts/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string, defaultMessageOrOptions?: unknown, maybeOptions?: Record<string, unknown>) => {
      if (typeof defaultMessageOrOptions === 'string') {
        return interpolate(defaultMessageOrOptions, maybeOptions ?? {});
      }
      if (defaultMessageOrOptions && typeof defaultMessageOrOptions === 'object') {
        return interpolate(key, defaultMessageOrOptions as Record<string, unknown>);
      }
      if (typeof defaultMessageOrOptions === 'undefined') {
        return key;
      }
      return String(defaultMessageOrOptions);
    },
  }),
}));

import useCommunityPulse from '@/hooks/useCommunityPulse';

describe('useCommunityPulse', () => {
  const mockFetch = jest.fn();

  beforeAll(() => {
    (global as unknown as Record<string, unknown>).fetch = mockFetch;
  });

  afterAll(() => {
    delete (global as Record<string, unknown>).fetch;
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    jest.setSystemTime(new Date('2024-01-10T12:00:00Z'));
    mockGetIdToken.mockResolvedValue('token-123');
    mockFunctionUrl.mockReturnValue('https://example.com/getCommunityPulseHttp');
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        boosts: [],
        fulfillments: [],
        supporters: [],
      }),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('combines boost, fulfillment, and supporter stats', async () => {
    const responsePayload = {
      boosts: [
        {
          id: 'boost-1',
          wishId: 'wish-1',
          wishText: 'New microphone',
          wishOwnerName: 'Kai',
          boosterId: 'user-2',
          boosterName: 'Mira',
          amount: 75,
          completedAt: '2024-01-09T12:00:00.000Z',
        },
      ],
      fulfillments: [
        {
          wishId: 'wish-1',
          wishText: 'New microphone',
          wishOwnerName: 'Kai',
          fulfilledAt: '2024-01-08T12:00:00.000Z',
        },
      ],
      supporters: [
        {
          userId: 'user-2',
          displayName: 'Mira',
          avatar: 'https://avatar/mira.png',
          totalGifts: 2,
          totalAmount: 125,
        },
        {
          userId: 'user-3',
          displayName: 'Eli',
          avatar: null,
          totalGifts: 1,
          totalAmount: 35,
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(responsePayload),
    });

    const { result } = renderHook(() => useCommunityPulse());

    await act(async () => {
      await result.current.refresh();
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.boosts).toHaveLength(1);
    expect(result.current.boosts[0]?.boosterName).toBe('Mira');
    expect(result.current.fulfillments).toHaveLength(1);
    expect(result.current.supporters[0]?.tierLabel).toBe('Gold Champion');
  });
});
