jest.mock(
  'firebase-functions',
  () => ({
    firestore: {
      document: jest.fn(() => ({ onUpdate: jest.fn(), onCreate: jest.fn() })),
    },
    pubsub: { schedule: jest.fn(() => ({ onRun: jest.fn() })) },
    https: { onRequest: jest.fn((handler: any) => handler) },
    runWith: jest.fn().mockReturnValue({ https: { onRequest: (h: any) => h } }),
    logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
  }),
  { virtual: true },
);

jest.mock(
  'firebase-functions/params',
  () => ({
    defineSecret: jest.fn(() => ({ value: jest.fn(() => 'secret') })),
  }),
  { virtual: true },
);

jest.mock('stripe', () => jest.fn(), { virtual: true });

jest.mock(
  'firebase-functions/v2/https',
  () => ({ onRequest: (h: any) => h }),
  { virtual: true },
);

jest.mock('expo-server-sdk', () => ({ Expo: class {} }), { virtual: true });

const mockMessagingSend = jest.fn();
const mockMetaSet = jest.fn();
const mockUserRef = {
  get: jest.fn().mockResolvedValue({
    get: (f: string) => (f === 'fcmToken' ? 'FcmToken' : undefined),
  }),
  collection: () => ({
    doc: () => ({
      get: jest.fn().mockResolvedValue({ exists: false }),
      set: mockMetaSet,
    }),
  }),
};
jest.mock(
  'firebase-admin',
  () => ({
    __esModule: true,
    initializeApp: jest.fn(),
    firestore: Object.assign(
      () => ({ collection: () => ({ doc: () => mockUserRef }) }),
      { FieldValue: { serverTimestamp: jest.fn() } },
    ),
    messaging: jest.fn(() => ({ send: mockMessagingSend })),
  }),
  { virtual: true },
);

import * as functions from 'firebase-functions';

import { __test } from '../functions/src/index';
const { sendPush } = __test;

describe('sendPush', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends notification via FCM token', async () => {
    await sendPush('user1', 'Title', 'Body');
    expect(mockMessagingSend).toHaveBeenCalledWith({
      token: 'FcmToken',
      notification: { title: 'Title', body: 'Body' },
    });
    expect((functions as any).logger.error).not.toHaveBeenCalled();
  });

  it('logs error when FCM send fails', async () => {
    mockMessagingSend.mockRejectedValueOnce(new Error('fcm fail'));
    await sendPush('user1', 'Title', 'Body');
    expect((functions as any).logger.error).toHaveBeenCalledWith('Error sending FCM notification', expect.any(Error));
  });
});
