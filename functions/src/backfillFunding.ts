import * as admin from 'firebase-admin';
import type { firestore } from 'firebase-admin';

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  if (!admin.apps.length) {
    admin.initializeApp();
  }

  const db = admin.firestore();
  const stats = new Map<string, { raised: number; supporters: number }>();
  const seen = new Map<string, Set<string>>();

  const includeGift = (wishId: string, giftId: string, data: firestore.DocumentData) => {
    if (!wishId || !giftId) return;
    const wishSeen = seen.get(wishId) ?? new Set<string>();
    if (wishSeen.has(giftId)) {
      return;
    }

    const status = (data?.status ?? '').toString().toLowerCase();
    if (status !== 'completed') {
      return;
    }

    const amountRaw = data?.amount;
    let amount = 0;
    if (typeof amountRaw === 'number' && Number.isFinite(amountRaw)) {
      amount = amountRaw;
    } else if (typeof amountRaw === 'string') {
      const parsed = Number(amountRaw);
      amount = Number.isFinite(parsed) ? parsed : 0;
    } else if (typeof data?.amount_total === 'number' && Number.isFinite(data.amount_total)) {
      amount = Math.round((data.amount_total / 100) * 100) / 100;
    }

    wishSeen.add(giftId);
    seen.set(wishId, wishSeen);

    const entry = stats.get(wishId) ?? { raised: 0, supporters: 0 };
    entry.supporters += 1;
    if (amount > 0) {
      entry.raised += amount;
    }
    stats.set(wishId, entry);
  };

  const giftHeads = await db.collection('gifts').get();
  for (const head of giftHeads.docs) {
    const wishId = head.id;
    const snap = await head.ref.collection('gifts').get();
    snap.forEach((giftDoc) => includeGift(wishId, giftDoc.id, giftDoc.data()));
  }

  const nestedSnap = await db.collectionGroup('gifts').get();
  nestedSnap.forEach((giftDoc) => {
    const parentPath = giftDoc.ref.parent.path.split('/');
    if (parentPath[0] !== 'wishes' || parentPath.length < 2) {
      return;
    }
    const wishId = parentPath[1];
    includeGift(wishId, giftDoc.id, giftDoc.data());
  });

  const updates = Array.from(stats.entries())
    .map(([wishId, values]) => ({
      wishId,
      raised: Math.round(values.raised * 100) / 100,
      supporters: values.supporters,
    }))
    .sort((a, b) => a.wishId.localeCompare(b.wishId));

  console.log(`Aggregated ${updates.length} wishes from gifts.`);

  if (dryRun) {
    updates.slice(0, 20).forEach((u) => {
      console.log(`[DRY RUN] ${u.wishId}: raised=${u.raised}, supporters=${u.supporters}`);
    });
    if (updates.length > 20) {
      console.log(`[DRY RUN] ...and ${updates.length - 20} more wishes.`);
    }
    return;
  }

  const BATCH_LIMIT = 400;
  let processed = 0;
  while (processed < updates.length) {
    const batch = db.batch();
    for (let i = processed; i < Math.min(processed + BATCH_LIMIT, updates.length); i += 1) {
      const { wishId, raised, supporters } = updates[i]!;
      const ref = db.collection('wishes').doc(wishId);
      batch.set(
        ref,
        {
          fundingRaised: raised,
          fundingSupporters: supporters,
        },
        { merge: true },
      );
    }
    await batch.commit();
    processed += BATCH_LIMIT;
    console.log(`Committed ${Math.min(processed, updates.length)} of ${updates.length} wish updates.`);
  }

  console.log('Backfill complete.');
}

main().catch((err) => {
  console.error('Backfill failed', err);
  process.exit(1);
});
