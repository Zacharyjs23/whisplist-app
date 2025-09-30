import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import fs from 'fs';

const EMU = process.env.FIRESTORE_EMULATOR_HOST;
const describeMaybe = EMU ? describe : describe.skip;

describeMaybe('firestore rules - comments', () => {
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
      await adminDb.doc('wishes/wishC').set({ userId: 'owner1' });
      await adminDb.doc('wishes/wishC/comments/c1').set({ userId: 'user1', text: 'hello' });
      await adminDb.doc('wishes/wishC/comments/c2').set({ userId: 'user1', text: 'world' });
    });
  });

  afterAll(async () => {
    await testEnv?.cleanup?.();
  });

  test('anyone can read comments', async () => {
    const db = testEnv.authenticatedContext('anyUser').firestore();
    await assertSucceeds(db.doc('wishes/wishC/comments/c1').get());
  });

  test('author can create comment <= 280', async () => {
    const db = testEnv.authenticatedContext('user2').firestore();
    await assertSucceeds(db.doc('wishes/wishC/comments/new1').set({ userId: 'user2', text: 'short text' }));
  });

  test('author can create reply when parent exists', async () => {
    const db = testEnv.authenticatedContext('user2').firestore();
    await assertSucceeds(
      db.doc('wishes/wishC/comments/newReply').set({ userId: 'user2', text: 'reply', parentId: 'c1' }),
    );
  });

  test('cannot create reply if parent comment missing', async () => {
    const db = testEnv.authenticatedContext('user2').firestore();
    await assertFails(
      db.doc('wishes/wishC/comments/missingParent').set({ userId: 'user2', text: 'reply', parentId: 'does-not-exist' }),
    );
  });

  test('create with long text fails', async () => {
    const db = testEnv.authenticatedContext('user2').firestore();
    const longText = 'a'.repeat(300);
    await assertFails(db.doc('wishes/wishC/comments/new2').set({ userId: 'user2', text: longText }));
  });

  test('non-author cannot update comment', async () => {
    const db = testEnv.authenticatedContext('intruder').firestore();
    await assertFails(db.doc('wishes/wishC/comments/c1').update({ text: 'hacked' }));
  });

  test('author can update comment within 280 chars', async () => {
    const db = testEnv.authenticatedContext('user1').firestore();
    await assertSucceeds(db.doc('wishes/wishC/comments/c1').update({ text: 'edited' }));
  });

  test('author cannot update comment beyond 280 chars', async () => {
    const db = testEnv.authenticatedContext('user1').firestore();
    const longText = 'x'.repeat(500);
    await assertFails(db.doc('wishes/wishC/comments/c2').update({ text: longText }));
  });

  test('author cannot change parentId after creation', async () => {
    await testEnv.withSecurityRulesDisabled(async (context: any) => {
      await context.firestore().doc('wishes/wishC/comments/childWithParent').set({ userId: 'user1', text: 'child', parentId: 'c1' });
    });
    const db = testEnv.authenticatedContext('user1').firestore();
    await assertFails(
      db.doc('wishes/wishC/comments/childWithParent').update({ parentId: 'c2' }),
    );
  });

  test('author can delete comment', async () => {
    const db = testEnv.authenticatedContext('user1').firestore();
    await assertSucceeds(db.doc('wishes/wishC/comments/c2').delete());
  });

  test('non-author cannot delete comment', async () => {
    // Seed another comment
    await testEnv.withSecurityRulesDisabled(async (context: any) => {
      await context.firestore().doc('wishes/wishC/comments/c3').set({ userId: 'user1', text: 'ok' });
    });
    const db = testEnv.authenticatedContext('user2').firestore();
    await assertFails(db.doc('wishes/wishC/comments/c3').delete());
  });
});
