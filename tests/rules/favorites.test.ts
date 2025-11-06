import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import fs from 'fs';

const EMU = process.env.FIRESTORE_EMULATOR_HOST;
const describeMaybe = EMU ? describe : describe.skip;

describeMaybe('firestore rules - anonymous favorites', () => {
  let testEnv: any;

  const seedToken = async (
    wishId: string,
    anonHash: string,
    permitOffsetMs = 60_000,
    cooldownOffsetMs = 3_600_000,
  ) => {
    await testEnv.withSecurityRulesDisabled(async (context: any) => {
      await context
        .firestore()
        .doc(`wishFavoriteTokens/${wishId}:${anonHash}`)
        .set({
          wishId,
          anonHash,
          permitExpiresAt: new Date(Date.now() + permitOffsetMs),
          cooldownUntil: new Date(Date.now() + cooldownOffsetMs),
        });
    });
  };

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

    await seedToken('wishFav1', 'hash1234');
  });

  afterAll(async () => {
    await testEnv?.cleanup?.();
  });

  test('allows create when token exists and note length valid', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(
      db
        .doc('wishFavorites/wishFav1/entries/hash1234')
        .set({
          anonHash: 'hash1234',
          note: 'Lovely wish',
          createdAt: new Date(),
        }),
    );
  });

  test('rejects create when note too long', async () => {
    await seedToken('wishFav2', 'hash9999');
    const db = testEnv.unauthenticatedContext().firestore();
    const longNote = 'a'.repeat(200);
    await assertFails(
      db
        .doc('wishFavorites/wishFav2/entries/hash9999')
        .set({ anonHash: 'hash9999', note: longNote, createdAt: new Date() }),
    );
  });

  test('rejects create when token missing', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      db
        .doc('wishFavorites/wishFav3/entries/hash5555')
        .set({ anonHash: 'hash5555', note: 'Hi', createdAt: new Date() }),
    );
  });

  test('allows update to note with same anon hash', async () => {
    await seedToken('wishFav4', 'hash7777');
    await testEnv.withSecurityRulesDisabled(async (context: any) => {
      await context
        .firestore()
        .doc('wishFavorites/wishFav4/entries/hash7777')
        .set({
          anonHash: 'hash7777',
          note: 'Initial',
          createdAt: new Date(),
        });
    });
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(
      db
        .doc('wishFavorites/wishFav4/entries/hash7777')
        .update({ anonHash: 'hash7777', note: 'Updated note' }),
    );
    await assertFails(
      db
        .doc('wishFavorites/wishFav4/entries/hash7777')
        .update({ anonHash: 'hash7777', note: 'x'.repeat(150) }),
    );
  });

  test('allows delete when anon hash matches entry', async () => {
    await testEnv.withSecurityRulesDisabled(async (context: any) => {
      await context
        .firestore()
        .doc('wishFavorites/wishFav5/entries/hash0001')
        .set({
          anonHash: 'hash0001',
          note: 'Bye',
        });
    });
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(
      db.doc('wishFavorites/wishFav5/entries/hash0001').delete(),
    );
  });
});
