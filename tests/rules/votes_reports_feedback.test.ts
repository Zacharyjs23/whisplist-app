import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import fs from 'fs';

const EMU = process.env.FIRESTORE_EMULATOR_HOST;
const describeMaybe = EMU ? describe : describe.skip;

describeMaybe('firestore rules - votes/reports/feedback', () => {
  let testEnv: any;

  beforeAll(async () => {
    const [host, portStr] = (EMU || '').split(':');
    const port = Number(portStr) || 8080;
    testEnv = await initializeTestEnvironment({
      projectId: 'whisplist-test',
      firestore: { host, port, rules: fs.readFileSync('firestore.rules', 'utf8') },
    });
  });

  afterAll(async () => {
    await testEnv?.cleanup?.();
  });

  describe('votes/{wishId}/users/{uid}', () => {
    test('owner-only read/write with valid options A|B', async () => {
      const db = testEnv.authenticatedContext('u1').firestore();
      // Create with option A
      await assertSucceeds(
        db.doc('votes/w1/users/u1').set({ option: 'A', timestamp: Date.now() }),
      );
      // Update to option B
      await assertSucceeds(
        db.doc('votes/w1/users/u1').set({ option: 'B', timestamp: Date.now() }),
      );
      // Owner can read
      await assertSucceeds(db.doc('votes/w1/users/u1').get());
      // Other user cannot read
      const other = testEnv.authenticatedContext('intruder').firestore();
      await assertFails(other.doc('votes/w1/users/u1').get());
      // Cannot write another user's doc
      await assertFails(
        db.doc('votes/w1/users/other').set({ option: 'A', timestamp: Date.now() }),
      );
    });

    test('reject invalid option or extra keys', async () => {
      const db = testEnv.authenticatedContext('u2').firestore();
      await assertFails(
        db.doc('votes/w2/users/u2').set({ option: 'C', timestamp: Date.now() }),
      );
      await assertFails(
        db
          .doc('votes/w2/users/u2')
          .set({ option: 'A', note: 'nope', timestamp: Date.now() }),
      );
    });
  });

  describe('reports/*', () => {
    test('signed-in can create; reads/updates/deletes denied', async () => {
      const db = testEnv.authenticatedContext('reporter').firestore();
      const ref = db.doc('reports/r1');
      await assertSucceeds(
        ref.set({ itemId: 'w1', type: 'comment', reason: 'abuse', timestamp: Date.now() }),
      );
      await assertFails(ref.get());
      await assertFails(ref.update({ reason: 'edited' }));
      await assertFails(ref.delete());
    });

    test('reject extra keys', async () => {
      const db = testEnv.authenticatedContext('reporter2').firestore();
      await assertFails(
        db.doc('reports/r2').set({ itemId: 'w2', type: 'wish', reason: 'spam', timestamp: Date.now(), extra: true }),
      );
    });
  });

  describe('feedback/*', () => {
    test('signed-in can create; reads/updates/deletes denied', async () => {
      const db = testEnv.authenticatedContext('fb').firestore();
      const ref = db.doc('feedback/f1');
      await assertSucceeds(ref.set({ text: 'Great app!', timestamp: Date.now() }));
      await assertFails(ref.get());
      await assertFails(ref.update({ text: 'Edited' }));
      await assertFails(ref.delete());
    });

    test('reject extra keys', async () => {
      const db = testEnv.authenticatedContext('fb2').firestore();
      await assertFails(
        db.doc('feedback/f2').set({ text: 'x', timestamp: Date.now(), extra: true }),
      );
    });
  });
});

