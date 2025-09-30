import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import fs from 'fs';

const EMU = process.env.FIRESTORE_EMULATOR_HOST;
const describeMaybe = EMU ? describe : describe.skip;

describeMaybe('firestore rules - users and reactions', () => {
  let testEnv: any;

  beforeAll(async () => {
    const [host, portStr] = (EMU || '').split(':');
    const port = Number(portStr) || 8080;
    testEnv = await initializeTestEnvironment({
      projectId: 'whisplist-test',
      firestore: { host, port, rules: fs.readFileSync('firestore.rules', 'utf8') },
    });

    await testEnv.withSecurityRulesDisabled(async (context: any) => {
      const adminDb = context.firestore();
      await adminDb.doc('users/user1').set({ displayName: 'U1' });
      await adminDb.doc('users/user2').set({ displayName: 'U2' });
      await adminDb.doc('wishes/w1').set({ userId: 'user1', text: 'hello' });
      await adminDb
        .doc('users/user1/notifications/n1')
        .set({
          type: 'generic',
          message: 'hello',
          timestamp: { seconds: 0, nanoseconds: 0 },
          read: false,
        });
    });
  });

  afterAll(async () => {
    await testEnv?.cleanup?.();
  });

  test('savedWishes only owner can write', async () => {
    const db1 = testEnv.authenticatedContext('user1').firestore();
    await assertSucceeds(db1.doc('users/user1/savedWishes/w1').set({ createdAt: 1 }));
    const db2 = testEnv.authenticatedContext('user2').firestore();
    await assertFails(db2.doc('users/user1/savedWishes/w1').set({ createdAt: 1 }));
  });

  test('journalEntries read/write by owner only', async () => {
    const db1 = testEnv.authenticatedContext('user1').firestore();
    await assertSucceeds(db1.doc('users/user1/journalEntries/j1').set({ text: 'note' }));
    const db2 = testEnv.authenticatedContext('user2').firestore();
    await assertFails(db2.doc('users/user1/journalEntries/j1').get());
  });

  test('followers: owner and follower can write; third party cannot', async () => {
    const asFollower = testEnv.authenticatedContext('user2').firestore();
    await assertSucceeds(asFollower.doc('users/user1/followers/user2').set({}));
    const asOwner = testEnv.authenticatedContext('user1').firestore();
    await assertSucceeds(asOwner.doc('users/user1/followers/user3').set({}));
    const asOther = testEnv.authenticatedContext('intruder').firestore();
    await assertFails(asOther.doc('users/user1/followers/user4').set({}));
  });

  test('following: only owner can write', async () => {
    const asOwner = testEnv.authenticatedContext('user1').firestore();
    await assertSucceeds(asOwner.doc('users/user1/following/user2').set({}));
    const asOther = testEnv.authenticatedContext('user2').firestore();
    await assertFails(asOther.doc('users/user1/following/user3').set({}));
  });

  test('reactions: public read; only user can write own reaction', async () => {
    const asU1 = testEnv.authenticatedContext('user1').firestore();
    await assertSucceeds(asU1.doc('reactions/w1/users/user1').set({ like: true }));
    const asU2 = testEnv.authenticatedContext('user2').firestore();
    await assertFails(asU2.doc('reactions/w1/users/user1').set({ like: false }));
    await assertSucceeds(asU2.doc('reactions/w1/users/user1').get());
  });

  test('notifications: owner can read and mark as read', async () => {
    const db = testEnv.authenticatedContext('user1').firestore();
    await assertSucceeds(db.doc('users/user1/notifications/n1').get());
    await assertSucceeds(
      db.doc('users/user1/notifications/n1').update({ read: true }),
    );
  });

  test('notifications: other users cannot read', async () => {
    const db = testEnv.authenticatedContext('user2').firestore();
    await assertFails(db.doc('users/user1/notifications/n1').get());
  });
});
