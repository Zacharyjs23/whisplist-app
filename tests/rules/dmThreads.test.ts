import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import fs from 'fs';

const EMU = process.env.FIRESTORE_EMULATOR_HOST;
const describeMaybe = EMU ? describe : describe.skip;

describeMaybe('firestore rules - dmThreads', () => {
  let testEnv: any;

  beforeAll(async () => {
    const [host, portStr] = (EMU || '').split(':');
    const port = Number(portStr) || 8080;
    testEnv = await initializeTestEnvironment({
      projectId: 'whisplist-test',
      firestore: {
        host,
        port,
        rules: fs.readFileSync('firestore.rules', 'utf8'),
      },
    });

    // Seed a DM thread with participants user1 and user2
    await testEnv.withSecurityRulesDisabled(async (context: any) => {
      const adminDb = context.firestore();
      await adminDb.doc('dmThreads/thread1').set({
        participants: ['user1', 'user2'],
        updatedAt: 123,
      });
      await adminDb.doc('dmThreads/thread1/typing/user1').set({ typing: true });
    });
  });

  afterAll(async () => {
    await testEnv?.cleanup?.();
  });

  test('participant can read dm thread', async () => {
    const db = testEnv.authenticatedContext('user1').firestore();
    await assertSucceeds(db.doc('dmThreads/thread1').get());
  });

  test('participant can query dmThreads by participants', async () => {
    const db = testEnv.authenticatedContext('user1').firestore();
    const snap = await db
      .collection('dmThreads')
      .where('participants', 'array-contains', 'user1')
      .orderBy('updatedAt', 'desc')
      .get();
    expect(snap.empty).toBe(false);
  });

  test('non-participant cannot read dm thread', async () => {
    const db = testEnv.authenticatedContext('user3').firestore();
    await assertFails(db.doc('dmThreads/thread1').get());
  });

  test('participant can create message', async () => {
    const db = testEnv.authenticatedContext('user2').firestore();
    await assertSucceeds(
      db.doc('dmThreads/thread1/messages/m1').set({ senderId: 'user2', text: 'hi', timestamp: 1 }),
    );
  });

  test('non-participant cannot create message', async () => {
    const db = testEnv.authenticatedContext('user3').firestore();
    await assertFails(db.doc('dmThreads/thread1/messages/m2').set({ text: 'nope', ts: 2 }));
  });

  test('participant can write own typing doc', async () => {
    const db = testEnv.authenticatedContext('user1').firestore();
    await assertSucceeds(db.doc('dmThreads/thread1/typing/user1').set({ typing: false }));
  });

  test('typing doc rejects unexpected keys and non-boolean typing', async () => {
    const db = testEnv.authenticatedContext('user1').firestore();
    await assertFails(
      db.doc('dmThreads/thread1/typing/user1').set({ typing: 'yes' }),
    );
    await assertFails(
      db.doc('dmThreads/thread1/typing/user1').set({ typing: false, extra: true }),
    );
  });

  test("participant cannot write another user's typing doc", async () => {
    const db = testEnv.authenticatedContext('user1').firestore();
    await assertFails(db.doc('dmThreads/thread1/typing/user2').set({ isTyping: true }));
  });

  test('non-participant cannot write typing doc', async () => {
    const db = testEnv.authenticatedContext('user3').firestore();
    await assertFails(db.doc('dmThreads/thread1/typing/user3').set({ isTyping: true }));
  });

  test('participant can read typing docs', async () => {
    const db = testEnv.authenticatedContext('user2').firestore();
    await assertSucceeds(db.doc('dmThreads/thread1/typing/user1').get());
  });

  test('non-participant cannot read typing docs', async () => {
    const db = testEnv.authenticatedContext('user3').firestore();
    await assertFails(db.doc('dmThreads/thread1/typing/user1').get());
  });

  test('participant can update readReceipts but not change participants', async () => {
    const db = testEnv.authenticatedContext('user1').firestore();
    // Allowed: update readReceipts field
    await assertSucceeds(db.doc('dmThreads/thread1').update({ ['readReceipts.user1']: 123 }));
    // Disallowed: attempt to change participants array
    await assertFails(db.doc('dmThreads/thread1').update({ participants: ['user1', 'user3'] }));
  });
});
