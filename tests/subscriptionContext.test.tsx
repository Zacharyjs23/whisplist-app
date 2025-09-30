import React from 'react';
import { render, screen, act } from '@testing-library/react-native';
import { Text, View } from 'react-native';

// Capture the snapshot callback so we can drive state transitions
let capturedCb: any = null;

jest.mock('firebase/firestore', () => {
  return {
    doc: jest.fn(() => ({})),
    onSnapshot: jest.fn((_ref: any, cb: any) => {
      capturedCb = cb;
      return () => {};
    }),
  } as any;
});

// Avoid importing real Firebase app module
jest.mock('@/firebase', () => ({ db: {} }));

// Mock AuthSession to always return a user
jest.mock('@/contexts/AuthSessionContext', () => ({
  useAuthSession: () => ({ user: { uid: 'u1' } }),
}));

import { SubscriptionProvider, useSubscription } from '@/contexts/SubscriptionContext';

const Consumer = () => {
  const { sub, isActive, loading } = useSubscription();
  if (loading) return <View testID="loading" /> as any;
  return (
    <View>
      <Text testID="active">{isActive ? 'active' : 'inactive'}</Text>
      <Text testID="status">{sub?.status || 'none'}</Text>
    </View>
  ) as any;
};

describe('SubscriptionContext', () => {
  it('computes isActive for trialing and active statuses', async () => {
    render(
      <SubscriptionProvider>
        <Consumer />
      </SubscriptionProvider>,
    );

    // Drive snapshot: trialing
    await act(async () => {
      capturedCb({ exists: () => true, data: () => ({ status: 'trialing' }) });
    });
    expect(screen.getByTestId('active').props.children).toBe('active');
    expect(screen.getByTestId('status').props.children).toBe('trialing');

    // Drive snapshot: active
    await act(async () => {
      capturedCb({ exists: () => true, data: () => ({ status: 'active' }) });
    });
    expect(screen.getByTestId('active').props.children).toBe('active');
    expect(screen.getByTestId('status').props.children).toBe('active');

    // Drive snapshot: canceled
    await act(async () => {
      capturedCb({ exists: () => true, data: () => ({ status: 'canceled' }) });
    });
    expect(screen.getByTestId('active').props.children).toBe('inactive');
    expect(screen.getByTestId('status').props.children).toBe('canceled');
  });
});
