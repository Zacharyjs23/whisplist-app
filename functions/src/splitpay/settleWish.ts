import { https, pubsub, logger, runWith } from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import type { CallableContext } from 'firebase-functions/v1/https';
import type {
  DocumentData,
  DocumentReference,
  FieldValue,
  QueryDocumentSnapshot,
  Timestamp,
  Transaction,
} from 'firebase-admin/firestore';
import {
  capturePaymentIntent,
  cancelPaymentIntent,
  retrievePaymentIntent,
} from '../payments/stripe';
import { STRIPE_SECRET_KEY } from '../secrets';
import {
  logPledgeCaptureFailed,
  logPledgeCaptureSuccess,
  logPledgeCanceled,
  logWishExpired,
  logWishFulfilled,
} from '../analytics/splitPay';
import {
  notifyOwnerWishFunded,
  notifyPledgerCaptured,
  notifyPledgerExpired,
} from './notifications';
import { isGiftPotEnabledForUser } from '../featureFlags';

const db = admin.firestore();
const { HttpsError } = https;

const SUPPORTED_ACTIVE_STATUSES = new Set(['open', 'funding']);

type WishRecord = {
  splitPayEnabled?: boolean;
  targetAmount?: number;
  fundedAmount?: number;
  status?: string;
  deadline?: Timestamp | null;
  userId?: string;
  title?: string;
  fundingCurrency?: string;
};

type PledgeRecord = {
  uid?: string | null;
  amount: number;
  status: string;
  paymentIntentId: string;
  currency?: string;
  createdAt?: Timestamp | FieldValue;
  updatedAt?: Timestamp | FieldValue;
  lastError?: string | null;
};

type SettlementOptions = {
  trigger: 'manual' | 'schedule';
  now?: Date;
  allowWhenBelowTarget?: boolean;
};

type SettlementResult = {
  wishId: string;
  status: 'fulfilled' | 'expired' | 'skipped';
  capturedAmount: number;
  canceledAmount: number;
  reason?: string;
  processedPledges: number;
};

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return 0;
}

async function markStatusIfCurrent(
  ref: DocumentReference,
  from: string,
  to: string,
  extra: Record<string, unknown> = {},
): Promise<boolean> {
  return db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const current = snap.get('status');
    if (current !== from) {
      return false;
    }
    tx.update(ref, {
      status: to,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...extra,
    });
    return true;
  });
}

export async function settleWishInternal(
  wishId: string,
  options: SettlementOptions,
): Promise<SettlementResult> {
  const now = options.now ?? new Date();
  const wishRef = db.collection('wishes').doc(wishId);
  const wishSnap = await wishRef.get();
  if (!wishSnap.exists) {
    throw new HttpsError('not-found', 'Wish not found');
  }
  const wish = wishSnap.data() as WishRecord;
  if (!wish.splitPayEnabled) {
    return {
      wishId,
      status: 'skipped',
      capturedAmount: 0,
      canceledAmount: 0,
      reason: 'split_pay_disabled',
      processedPledges: 0,
    };
  }
  const status = wish.status ?? 'open';
  if (status === 'fulfilled') {
    return {
      wishId,
      status: 'skipped',
      capturedAmount: 0,
      canceledAmount: 0,
      reason: 'already_fulfilled',
      processedPledges: 0,
    };
  }
  if (status === 'expired') {
    return {
      wishId,
      status: 'skipped',
      capturedAmount: 0,
      canceledAmount: 0,
      reason: 'already_expired',
      processedPledges: 0,
    };
  }
  if (!SUPPORTED_ACTIVE_STATUSES.has(status)) {
    return {
      wishId,
      status: 'skipped',
      capturedAmount: 0,
      canceledAmount: 0,
      reason: 'inactive_status',
      processedPledges: 0,
    };
  }

  const targetAmount = Math.max(0, asNumber(wish.targetAmount));
  const fundedAmount = Math.max(0, asNumber(wish.fundedAmount));
  const remainingTarget =
    targetAmount > fundedAmount ? targetAmount - fundedAmount : 0;

  const deadline = wish.deadline?.toMillis?.() ?? null;
  const pastDeadline =
    typeof deadline === 'number' && deadline <= now.getTime();

  const pledgesSnap = await wishRef
    .collection('pledges')
    .where('status', '==', 'authorized')
    .orderBy('createdAt', 'asc')
    .get();

  type LoadedPledge = {
    id: string;
    ref: DocumentReference<PledgeRecord>;
    data: PledgeRecord;
  };
  const pledges: LoadedPledge[] = pledgesSnap.docs.map(
    (doc: QueryDocumentSnapshot<DocumentData>) => ({
      id: doc.id,
      ref: doc.ref as DocumentReference<PledgeRecord>,
      data: doc.data() as PledgeRecord,
    }),
  );

  let authorizedTotal = 0;
  for (const pledge of pledges) {
    authorizedTotal += asNumber(pledge.data.amount);
  }
  const canReachTarget =
    targetAmount > 0 && fundedAmount + authorizedTotal >= targetAmount;

  const shouldCapture = canReachTarget || options.allowWhenBelowTarget === true;
  const shouldCancel = !canReachTarget && pastDeadline;

  if (!shouldCapture && !shouldCancel) {
    return {
      wishId,
      status: 'skipped',
      capturedAmount: 0,
      canceledAmount: 0,
      reason: 'not_ready',
      processedPledges: pledges.length,
    };
  }

  let totalCaptured = 0;
  let totalCanceled = 0;
  let processed = 0;
  let capturedPledgeCount = 0;

  if (shouldCapture && pledges.length) {
    let remaining = remainingTarget;
    for (const pledge of pledges) {
      if (remaining <= 0) {
        break;
      }
      const locked = await markStatusIfCurrent(
        pledge.ref,
        'authorized',
        'capturing',
      );
      if (!locked) {
        continue;
      }
      try {
        const intent = await retrievePaymentIntent(pledge.data.paymentIntentId);
        const capturable = intent.amount_capturable ?? 0;
        if (capturable <= 0) {
          await pledge.ref.update({
            status: 'failed',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastError: 'no_capturable_amount',
          });
          pledge.data.status = 'failed';
          continue;
        }
        const captureAmount = remaining < capturable ? remaining : capturable;
        const result = await capturePaymentIntent(intent.id, {
          amount: captureAmount < capturable ? captureAmount : undefined,
        });
        totalCaptured += captureAmount;
        remaining -= captureAmount;
        await pledge.ref.update({
          status: 'captured',
          capturedAmount: captureAmount,
          capturedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          paymentIntentStatus: result.status,
          lastError: null,
        });
        pledge.data.status = 'captured';
        (pledge.data as any).capturedAmount = captureAmount;
        logPledgeCaptureSuccess({
          wishId,
          pledgeId: pledge.id,
          userId: pledge.data.uid ?? null,
          amount: captureAmount,
          status: 'captured',
          trigger: options.trigger,
        });
        await notifyPledgerCaptured({
          userId: pledge.data.uid ?? null,
          wishId,
          wishTitle: wish.title,
          amountCents: captureAmount,
          currency: wish.fundingCurrency ?? 'usd',
        });
        capturedPledgeCount += 1;
      } catch (error) {
        logger.error('Failed to capture pledge', {
          wishId,
          pledgeId: pledge.id,
          error,
        });
        await pledge.ref.update({
          status: 'failed',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastError: (error as Error)?.message ?? 'capture_failed',
        });
        pledge.data.status = 'failed';
        logPledgeCaptureFailed({
          wishId,
          pledgeId: pledge.id,
          userId: pledge.data.uid ?? null,
          amount: pledge.data.amount,
          status: 'failed',
          reason: (error as Error)?.message ?? 'capture_failed',
          trigger: options.trigger,
        });
      }
      processed += 1;
    }
  }

  if (shouldCancel) {
    await Promise.all(
      pledges.map(async (pledge) => {
        const locked = await markStatusIfCurrent(
          pledge.ref,
          'authorized',
          'canceling',
        );
        if (!locked) return;
        try {
          await cancelPaymentIntent(pledge.data.paymentIntentId);
          totalCanceled += asNumber(pledge.data.amount);
          await pledge.ref.update({
            status: 'canceled',
            canceledAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastError: null,
          });
          pledge.data.status = 'canceled';
          logPledgeCanceled({
            wishId,
            pledgeId: pledge.id,
            userId: pledge.data.uid ?? null,
            amount: pledge.data.amount,
            status: 'canceled',
            trigger: options.trigger,
            reason: shouldCancel ? 'deadline_expired' : 'excess_after_capture',
          });
          if (shouldCancel) {
            await notifyPledgerExpired({
              userId: pledge.data.uid ?? null,
              wishId,
              wishTitle: wish.title,
            });
          }
        } catch (error) {
          logger.error('Failed to cancel pledge', {
            wishId,
            pledgeId: pledge.id,
            error,
          });
          await pledge.ref.update({
            status: 'failed',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastError: (error as Error)?.message ?? 'cancel_failed',
          });
          pledge.data.status = 'failed';
        }
      }),
    );
  } else if (shouldCapture && totalCaptured > 0) {
    const remainingAuthorized = pledges.filter(
      (pledge) => pledge.data.status === 'authorized',
    );
    if (remainingAuthorized.length > 0) {
      await Promise.all(
        remainingAuthorized.map(async (pledge) => {
          const locked = await markStatusIfCurrent(
            pledge.ref,
            'authorized',
            'canceling',
          );
          if (!locked) return;
          try {
            await cancelPaymentIntent(pledge.data.paymentIntentId);
            await pledge.ref.update({
              status: 'canceled',
              canceledAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              lastError: null,
            });
            pledge.data.status = 'canceled';
            logPledgeCanceled({
              wishId,
              pledgeId: pledge.id,
              userId: pledge.data.uid ?? null,
              amount: pledge.data.amount,
              status: 'canceled',
              trigger: options.trigger,
              reason: 'excess_after_capture',
            });
          } catch (error) {
            logger.error('Failed to cancel excess pledge', {
              wishId,
              pledgeId: pledge.id,
              error,
            });
            await pledge.ref.update({
              status: 'failed',
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              lastError: (error as Error)?.message ?? 'cancel_failed',
            });
            pledge.data.status = 'failed';
          }
        }),
      );
    }
  }

  let nextStatus: 'fulfilled' | 'expired' | null = null;
  const wishUpdates: Record<string, unknown> = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (shouldCapture && totalCaptured > 0) {
    const updatedFunded = fundedAmount + totalCaptured;
    wishUpdates.fundedAmount = updatedFunded;
    if (capturedPledgeCount > 0) {
      wishUpdates.fundingSupporters =
        admin.firestore.FieldValue.increment(capturedPledgeCount);
    }
    if (updatedFunded >= targetAmount && targetAmount > 0) {
      nextStatus = 'fulfilled';
      wishUpdates.status = 'fulfilled';
      wishUpdates.fulfilledAt = admin.firestore.FieldValue.serverTimestamp();
    } else if (status === 'open') {
      wishUpdates.status = 'funding';
    }
  } else if (shouldCancel) {
    nextStatus = 'expired';
    wishUpdates.status = 'expired';
    wishUpdates.expiredAt = admin.firestore.FieldValue.serverTimestamp();
  }

  if (nextStatus) {
    await wishRef.update(wishUpdates);
    if (nextStatus === 'fulfilled') {
      logWishFulfilled({
        wishId,
        userId: wish.userId ?? null,
        amount: targetAmount,
        trigger: options.trigger,
        status: 'fulfilled',
      });
      await notifyOwnerWishFunded({
        ownerId: wish.userId,
        wishId,
        wishTitle: wish.title,
      });
    } else if (nextStatus === 'expired') {
      logWishExpired({
        wishId,
        userId: wish.userId ?? null,
        amount: targetAmount,
        trigger: options.trigger,
        status: 'expired',
        reason: 'deadline_expired',
      });
    }
  } else if (Object.keys(wishUpdates).length > 0) {
    await wishRef.set(wishUpdates, { merge: true });
  }

  return {
    wishId,
    status: nextStatus ?? 'skipped',
    capturedAmount: totalCaptured,
    canceledAmount: totalCanceled,
    reason: shouldCancel
      ? 'deadline_expired'
      : shouldCapture
        ? 'target_met'
        : 'not_ready',
    processedPledges: processed || pledges.length,
  };
}

export const settleWish = runWith({
  secrets: [STRIPE_SECRET_KEY],
  timeoutSeconds: 540,
  memory: '1GB',
})
  .region('us-central1')
  .https.onCall(
    async (data: { wishId?: unknown }, context: CallableContext) => {
      const uid = context.auth?.uid;
      if (!uid) {
        throw new HttpsError('unauthenticated', 'Authentication required');
      }
      const wishId =
        typeof data?.wishId === 'string' ? data.wishId.trim() : null;
      if (!wishId) {
        throw new HttpsError('invalid-argument', 'wishId is required');
      }
      const wishSnap = await db.collection('wishes').doc(wishId).get();
      if (!wishSnap.exists) {
        throw new HttpsError('not-found', 'Wish not found');
      }
      const wish = wishSnap.data() as WishRecord;
      if (wish.userId !== uid) {
        throw new HttpsError(
          'permission-denied',
          'Only the wish owner can settle pledges manually',
        );
      }
      const gateOpen = isGiftPotEnabledForUser(uid);
      if (!gateOpen && wish.splitPayEnabled !== true) {
        throw new HttpsError(
          'failed-precondition',
          'Gift pot is not enabled for this project',
        );
      }
      return await settleWishInternal(wishId, {
        trigger: 'manual',
        now: new Date(),
      });
    },
  );

export const settleSplitPayWishes = pubsub
  .schedule('every 15 minutes')
  .onRun(async () => {
    const now = new Date();
    const candidateSnap = await db
      .collection('wishes')
      .where('splitPayEnabled', '==', true)
      .where('status', 'in', ['open', 'funding'])
      .limit(50)
      .get();
    const results: SettlementResult[] = [];
    await Promise.all(
      candidateSnap.docs.map(async (doc: QueryDocumentSnapshot<WishRecord>) => {
        try {
          const wish = doc.data() as WishRecord;
          const targetAmount = Math.max(0, asNumber(wish.targetAmount));
          const fundedAmount = Math.max(0, asNumber(wish.fundedAmount));
          const deadline = wish.deadline?.toMillis?.() ?? null;
          const pastDeadline =
            typeof deadline === 'number' && deadline <= now.getTime();
          if (targetAmount <= 0) return;
          if (!pastDeadline && fundedAmount < targetAmount) {
            // Check if authorized pledges could push over the target.
            const pledgesSnap = await doc.ref
              .collection('pledges')
              .where('status', '==', 'authorized')
              .orderBy('createdAt', 'asc')
              .get();
            let authorizedTotal = 0;
            for (const pledgeDoc of pledgesSnap.docs as QueryDocumentSnapshot<
              PledgeRecord,
              DocumentData
            >[]) {
              authorizedTotal += asNumber(
                (pledgeDoc.data() as PledgeRecord).amount,
              );
            }
            if (fundedAmount + authorizedTotal < targetAmount) {
              return;
            }
          }
          const result = await settleWishInternal(doc.id, {
            trigger: 'schedule',
            now,
          });
          results.push(result);
        } catch (error) {
          logger.error('Failed to settle wish via schedule', {
            wishId: doc.id,
            error,
          });
        }
      }),
    );
    return results;
  });
