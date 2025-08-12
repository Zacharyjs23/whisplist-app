import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import fs from 'fs';

let testEnv: any;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'whisplist-test',
    firestore: {
      rules: fs.readFileSync('firestore.rules', 'utf8'),
    },
  });

  await testEnv.withSecurityRulesDisabled(async (context: any) => {
    const adminDb = context.firestore();
    await adminDb.doc('wishes/wish1').set({ userId: 'user1' });
    await adminDb.doc('wishes/wish1/gifts/gift1').set({ recipientId: 'user1', amount: 10 });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
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
