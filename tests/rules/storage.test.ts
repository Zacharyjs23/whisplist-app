import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import fs from 'fs';
import { ref as sRef, uploadBytes, getBytes } from 'firebase/storage';

const STORAGE_EMU = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
const describeMaybe = STORAGE_EMU ? describe : describe.skip;

describeMaybe('storage rules', () => {
  let testEnv: any;

  beforeAll(async () => {
    const [host, portStr] = (STORAGE_EMU || '').split(':');
    const port = Number(portStr) || 9199;
    testEnv = await initializeTestEnvironment({
      projectId: 'whisplist-test',
      storage: { host, port, rules: fs.readFileSync('storage.rules', 'utf8') },
    });
  });

  afterAll(async () => {
    await testEnv?.cleanup?.();
  });

  test('users/{uid} write only by owner with image/audio and <10MB', async () => {
    const ownerStorage = testEnv.authenticatedContext('user1').storage();
    const otherStorage = testEnv.authenticatedContext('intruder').storage();

    // Owner can upload small jpeg
    await assertSucceeds(
      uploadBytes(
        sRef(ownerStorage, 'users/user1/avatar.jpg'),
        new Uint8Array([1, 2, 3]),
        { contentType: 'image/jpeg' },
      ),
    );

    // Wrong user cannot write under another uid
    await assertFails(
      uploadBytes(
        sRef(otherStorage, 'users/user1/hack.jpg'),
        new Uint8Array([1, 2, 3]),
        { contentType: 'image/jpeg' },
      ),
    );

    // Wrong content type rejected
    await assertFails(
      uploadBytes(
        sRef(ownerStorage, 'users/user1/file.txt'),
        new Uint8Array([1, 2, 3]),
        { contentType: 'text/plain' },
      ),
    );

    // Larger than 10MB rejected
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    await assertFails(
      uploadBytes(
        sRef(ownerStorage, 'users/user1/big.jpg'),
        big,
        { contentType: 'image/jpeg' },
      ),
    );
  });

  test('wishes/* allows signed-in image/audio <10MB', async () => {
    const storage = testEnv.authenticatedContext('userX').storage();
    const anon = testEnv.unauthenticatedContext().storage();
    await assertSucceeds(
      uploadBytes(
        sRef(storage, 'wishes/w123/photo.jpg'),
        new Uint8Array([1, 2, 3]),
        { contentType: 'image/jpeg' },
      ),
    );
    // Public read
    await assertSucceeds(getBytes(sRef(anon, 'wishes/w123/photo.jpg')));
    await assertFails(
      uploadBytes(
        sRef(storage, 'wishes/w123/doc.txt'),
        new Uint8Array([1, 2, 3]),
        { contentType: 'text/plain' },
      ),
    );
  });

  test('avatars/*: signed-in image <10MB write; public read', async () => {
    const authed = testEnv.authenticatedContext('writer').storage();
    const anon = testEnv.unauthenticatedContext().storage();
    await assertSucceeds(
      uploadBytes(
        sRef(authed, 'avatars/user1.jpg'),
        new Uint8Array([1, 2, 3]),
        { contentType: 'image/jpeg' },
      ),
    );
    await assertFails(
      uploadBytes(
        sRef(authed, 'avatars/user1.txt'),
        new Uint8Array([1, 2, 3]),
        { contentType: 'text/plain' },
      ),
    );
    await assertSucceeds(getBytes(sRef(anon, 'avatars/user1.jpg')));
  });

  test('dm/{threadId} only participants can write', async () => {
    const a = testEnv.authenticatedContext('alice').storage();
    const b = testEnv.authenticatedContext('bob').storage();
    const c = testEnv.authenticatedContext('charlie').storage();
    const threadId = ['alice', 'bob'].sort().join('_');
    // alice can write
    await assertSucceeds(
      uploadBytes(
        sRef(a, `dm/${threadId}/m.jpg`),
        new Uint8Array([1, 2, 3]),
        { contentType: 'image/jpeg' },
      ),
    );
    // bob can write
    await assertSucceeds(
      uploadBytes(
        sRef(b, `dm/${threadId}/m2.jpg`),
        new Uint8Array([1, 2, 3]),
        { contentType: 'image/jpeg' },
      ),
    );
    // charlie cannot
    await assertFails(
      uploadBytes(
        sRef(c, `dm/${threadId}/m3.jpg`),
        new Uint8Array([1, 2, 3]),
        { contentType: 'image/jpeg' },
      ),
    );
    // Participants can read; non-participants cannot
    await assertSucceeds(getBytes(sRef(b, `dm/${threadId}/m.jpg`)));
    await assertFails(getBytes(sRef(c, `dm/${threadId}/m.jpg`)));
  });

  test('public images/audio paths: signed-in write with correct type; public read', async () => {
    const authed = testEnv.authenticatedContext('writer').storage();
    const anon = testEnv.unauthenticatedContext().storage();
    // images path
    await assertSucceeds(
      uploadBytes(
        sRef(authed, 'images/pic.jpg'),
        new Uint8Array([1, 2, 3]),
        { contentType: 'image/jpeg' },
      ),
    );
    await assertFails(
      uploadBytes(
        sRef(anon, 'images/bad.txt'),
        new Uint8Array([1, 2, 3]),
        { contentType: 'text/plain' },
      ),
    );
    await assertSucceeds(getBytes(sRef(anon, 'images/pic.jpg')));
    // audio path
    await assertSucceeds(
      uploadBytes(
        sRef(authed, 'audio/sound.m4a'),
        new Uint8Array([1, 2, 3]),
        { contentType: 'audio/aac' },
      ),
    );
    await assertSucceeds(getBytes(sRef(anon, 'audio/sound.m4a')));
  });
});
