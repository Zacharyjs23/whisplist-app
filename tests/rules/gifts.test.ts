import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import fs from 'fs';

const EMU = process.env.FIRESTORE_EMULATOR_HOST;
const describeMaybe = EMU ? describe : describe.skip;

describeMaybe('firestore rules - gifts', () => {
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

    await testEnv.withSecurityRulesDisabled(async (context: any) => {
      const adminDb = context.firestore();
      await adminDb.doc('wishes/wish1').set({ userId: 'user1' });
      await adminDb.doc('wishes/wish1/gifts/gift1').set({ recipientId: 'user1', amount: 10 });
      // Also create a gift under alternate parent path written by backend
      await adminDb.doc('gifts/wish2/gifts/gift2').set({ recipientId: 'user1', amount: 25 });
    });
  });

  afterAll(async () => {
    await testEnv?.cleanup?.();
  });

  test('unauthorized user cannot read gift', async () => {
    const db = testEnv.authenticatedContext('user2').firestore();
    const giftRef = db.doc('wishes/wish1/gifts/gift1');
    await assertFails(giftRef.get());
  });

  test('unauthorized user cannot write gift', async () => {
    const db = testEnv.authenticatedContext('user2').firestore();
    const giftRef = db.doc('wishes/wish1/gifts/gift2');
    await assertFails(giftRef.set({ recipientId: 'user1', amount: 5 }));
  });

  test('recipient can read direct gift doc', async () => {
    const db = testEnv.authenticatedContext('user1').firestore();
    const giftRef = db.doc('wishes/wish1/gifts/gift1');
    await assertSucceeds(giftRef.get());
  });

  test('recipient can read gifts via collection group query', async () => {
    const db = testEnv.authenticatedContext('user1').firestore();
    const cg = db.collectionGroup('gifts').where('recipientId', '==', 'user1');
    await assertSucceeds(cg.get());
  });

  test('non-recipient cannot read gifts via collection group query', async () => {
    const db = testEnv.authenticatedContext('user2').firestore();
    const cg = db.collectionGroup('gifts').where('recipientId', '==', 'user1');
    await assertFails(cg.get());
  });
});
