jest.mock(
  'firebase-admin',
  () => ({
    firestore: {
      FieldPath: { documentId: () => '__name__' },
    },
  }),
  { virtual: true },
);

import { backfillPostTypes } from '../functions/src/backfillPostTypes';

type DocRecord = { id: string; payload: Record<string, any> };

const makeSnapshot = (doc: DocRecord) => ({
  id: doc.id,
  data: () => ({ ...doc.payload }),
  ref: {
    update: (patch: Record<string, unknown>) => {
      Object.assign(doc.payload, patch);
    },
  },
});

const createQuery = (docs: DocRecord[], field: 'type' | 'category', value: string, startAfterId: string | null, limit: number) => {
  let filtered = docs
    .filter((doc) => doc.payload[field] === value)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (startAfterId) {
    const idx = filtered.findIndex((doc) => doc.id === startAfterId);
    filtered = filtered.slice(idx + 1);
  }
  const sliced = filtered.slice(0, limit);
  return {
    empty: sliced.length === 0,
    docs: sliced.map((doc) => makeSnapshot(doc)),
  };
};

const createFakeDb = (docs: DocRecord[]) => {
  const data = docs;
  return {
    collection: () => ({
      where: (field: 'type' | 'category', _op: string, value: string) => ({
        orderBy: () => ({
          limit: (limit: number) => ({
            startAfter: (last: { id: string }) => ({
              get: () => Promise.resolve(createQuery(data, field, value, last?.id ?? null, limit)),
            }),
            get: () => Promise.resolve(createQuery(data, field, value, null, limit)),
          }),
        }),
      }),
    }),
    batch: () => {
      const ops: { ref: { update: (patch: Record<string, unknown>) => void }; patch: Record<string, unknown> }[] = [];
      return {
        update: (ref: { update: (patch: Record<string, unknown>) => void }, patch: Record<string, unknown>) => {
          ops.push({ ref, patch });
        },
        commit: () => {
          ops.forEach(({ ref, patch }) => ref.update(patch));
          return Promise.resolve();
        },
      };
    },
  };
};

describe('backfillPostTypes', () => {
  const buildDocs = (): DocRecord[] => [
    { id: 'a', payload: { type: 'wish', category: 'wish' } },
    { id: 'b', payload: { type: 'confession', category: 'confession' } },
    { id: 'c', payload: { type: 'goal', category: 'goal' } },
    { id: 'd', payload: { type: 'goal', category: 'wish' } },
  ];

  it('updates legacy post types and categories', async () => {
    const docs = buildDocs();
    const db = createFakeDb(docs);

    const result = await backfillPostTypes(db as any, { dryRun: false, log: () => {} });

    expect(docs[0].payload).toEqual({ type: 'goal', category: 'goal' });
    expect(docs[1].payload).toEqual({ type: 'struggle', category: 'struggle' });
    expect(docs[2].payload).toEqual({ type: 'goal', category: 'goal' });
    expect(docs[3].payload).toEqual({ type: 'goal', category: 'goal' });
    expect(result.typeUpdates).toMatchObject({ wish: expect.any(Number), confession: expect.any(Number) });
  });

  it('respects dry-run mode', async () => {
    const docs = buildDocs();
    const db = createFakeDb(docs);

    await backfillPostTypes(db as any, { dryRun: true, log: () => {} });

    expect(docs[0].payload).toEqual({ type: 'wish', category: 'wish' });
    expect(docs[3].payload).toEqual({ type: 'goal', category: 'wish' });
  });
});
