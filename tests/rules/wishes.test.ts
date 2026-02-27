import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { serverTimestamp } from 'firebase/firestore';
import fs from 'fs';

const EMU = process.env.FIRESTORE_EMULATOR_HOST;
const describeMaybe = EMU ? describe : describe.skip;

describeMaybe('firestore rules - wishes', () => {
  let testEnv: any;
  const initialStageDate = new Date('2023-01-01T00:00:00.000Z');

  const seedStageDoc = async (overrides: Record<string, unknown> = {}) => {
    await testEnv.withSecurityRulesDisabled(async (context: any) => {
      await context
        .firestore()
        .doc('wishes/wStage')
        .set({
          userId: 'ownerStage',
          text: 'stage me',
          likes: 0,
          stage: 'seed',
          stageUpdatedAt: initialStageDate,
          ...overrides,
        });
    });
  };

  beforeAll(async () => {
    const [host, portStr] = (EMU || '').split(':');
    const port = Number(portStr) || 8080;
    testEnv = await initializeTestEnvironment({
      projectId: 'whisplist-test-wishes',
      firestore: {
        host,
        port,
        rules: fs.readFileSync('firestore.rules', 'utf8'),
      },
    });

    await testEnv.withSecurityRulesDisabled(async (context: any) => {
      const adminDb = context.firestore();
      await adminDb
        .doc('wishes/w1')
        .set({ userId: 'owner1', text: 'hello', likes: 0 });
      await adminDb
        .doc('wishes/wBoost')
        .set({
          userId: 'owner1',
          text: 'boost me',
          likes: 0,
          boostedUntil: new Date(),
        });
    });

    await seedStageDoc();
  });

  afterAll(async () => {
    await testEnv?.cleanup?.();
  });

  test('anyone can read wishes', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(db.doc('wishes/w1').get());
  });

  test('owner can delete their wish', async () => {
    const db = testEnv.authenticatedContext('owner1').firestore();
    await assertSucceeds(db.doc('wishes/w1').delete());
  });

  test('non-owner cannot delete wish', async () => {
    await testEnv.withSecurityRulesDisabled(async (context: any) => {
      await context
        .firestore()
        .doc('wishes/w2')
        .set({ userId: 'owner2', text: 'x' });
    });
    const db = testEnv.authenticatedContext('intruder').firestore();
    await assertFails(db.doc('wishes/w2').delete());
  });

  test('create allowed for signed-in user with matching userId and short text', async () => {
    const db = testEnv.authenticatedContext('user1').firestore();
    await assertSucceeds(
      db
        .doc('wishes/new1')
        .set({ userId: 'user1', text: 'short text', likes: 0 }),
    );
  });

  test('create denied when text too long or extra keys present', async () => {
    const db = testEnv.authenticatedContext('user2').firestore();
    const longText = 'a'.repeat(500);
    await assertFails(
      db.doc('wishes/new2').set({ userId: 'user2', text: longText }),
    );
    await assertFails(
      db.doc('wishes/new3').set({ userId: 'user2', text: 'ok', hacked: true }),
    );
  });

  test('update denied for changing userId; text length enforced', async () => {
    await testEnv.withSecurityRulesDisabled(async (context: any) => {
      await context
        .firestore()
        .doc('wishes/w3')
        .set({ userId: 'user3', text: 'ok' });
    });
    const db = testEnv.authenticatedContext('user3').firestore();
    await assertFails(db.doc('wishes/w3').update({ userId: 'other' }));
    await assertFails(db.doc('wishes/w3').update({ text: 'x'.repeat(400) }));
    await assertSucceeds(db.doc('wishes/w3').update({ text: 'edited' }));
  });

  test('owner can extend boost within 72 hours but not beyond', async () => {
    const db = testEnv.authenticatedContext('owner1').firestore();
    const withinLimit = new Date(Date.now() + 60 * 60 * 1000);
    await assertSucceeds(
      db.doc('wishes/wBoost').update({ boostedUntil: withinLimit }),
    );
    const beyondLimit = new Date(Date.now() + 80 * 60 * 60 * 1000);
    await assertFails(
      db.doc('wishes/wBoost').update({ boostedUntil: beyondLimit }),
    );
  });

  test('owner can update stage and circle metadata within limits', async () => {
    await seedStageDoc();
    const db = testEnv.authenticatedContext('ownerStage').firestore();
    await assertSucceeds(
      db.doc('wishes/wStage').update({
        stage: 'shared',
        stageUpdatedAt: serverTimestamp(),
        accountabilityCircleId: 'circle-123',
        accountabilityCircleName: 'Focus Crew',
      }),
    );
  });

  test('rejects stage change without timestamp update', async () => {
    await seedStageDoc();
    const db = testEnv.authenticatedContext('ownerStage').firestore();
    await assertFails(
      db.doc('wishes/wStage').update({
        stage: 'shared',
      }),
    );
  });

  test('rejects invalid stage values', async () => {
    await seedStageDoc();
    const db = testEnv.authenticatedContext('ownerStage').firestore();
    await assertFails(db.doc('wishes/wStage').update({ stage: 'not-a-stage' }));
  });

  test('rejects stageUpdatedAt set to arbitrary timestamp', async () => {
    await seedStageDoc();
    const db = testEnv.authenticatedContext('ownerStage').firestore();
    await assertFails(
      db.doc('wishes/wStage').update({
        stageUpdatedAt: new Date('2024-03-01T00:00:00.000Z'),
      }),
    );
  });

  test('rejects overly long circle names', async () => {
    await seedStageDoc();
    const db = testEnv.authenticatedContext('ownerStage').firestore();
    await assertFails(
      db.doc('wishes/wStage').update({
        accountabilityCircleId: 'circle-123',
        accountabilityCircleName: 'a'.repeat(120),
      }),
    );
  });

  test('non-owner cannot change stage metadata', async () => {
    await seedStageDoc();
    const db = testEnv.authenticatedContext('intruder').firestore();
    await assertFails(db.doc('wishes/wStage').update({ stage: 'nurturing' }));
  });

  test('clients cannot change fundedAmount or status directly', async () => {
    const db = testEnv.authenticatedContext('owner1').firestore();
    await assertFails(db.doc('wishes/w1').update({ fundedAmount: 5000 }));
    await assertFails(db.doc('wishes/w1').update({ status: 'fulfilled' }));
  });

  test('pledge subcollection is write-protected', async () => {
    const db = testEnv.authenticatedContext('user-pledger').firestore();
    await assertFails(
      db
        .doc('wishes/w1/pledges/pledge1')
        .set({ amount: 500, status: 'authorized' }),
    );
  });
});
