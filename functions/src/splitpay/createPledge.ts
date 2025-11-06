import { createHash } from 'node:crypto';
import { https, logger, runWith } from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import type { CallableContext } from 'firebase-functions/v1/https';
import type { DocumentReference, Timestamp } from 'firebase-admin/firestore';
import { createManualPaymentIntent } from '../payments/stripe';
import { STRIPE_SECRET_KEY } from '../secrets';
import { logPledgeCreated } from '../analytics/splitPay';
import { notifyOwnerOfPledge } from './notifications';
import { assertGiftPotEnabled } from '../featureFlags';

const db = admin.firestore();
const { HttpsError } = https;

const MIN_PLEDGE_AMOUNT_CENTS = 500;
const SUPPORTED_STATUSES = new Set(['open', 'funding']);
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9:_\-.]{8,128}$/;

type CreatePledgeInput = {
  wishId?: unknown;
  amount?: unknown;
  currency?: unknown;
  experiment?: unknown;
  idempotencyKey?: unknown;
};

type WishSplitPayState = {
  splitPayEnabled?: boolean;
  targetAmount?: number;
  fundedAmount?: number;
  deadline?: Timestamp | null;
  status?: string;
  title?: string;
  fundingCurrency?: string;
  userId?: string;
};

function parseIdempotencyKey(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (!IDEMPOTENCY_KEY_PATTERN.test(trimmed)) {
    throw new HttpsError('invalid-argument', 'Invalid idempotency key');
  }
  return trimmed;
}

function makeRequestId(wishId: string, userId: string, key: string): string {
  return createHash('sha256')
    .update(`${wishId}:${userId}:${key}`)
    .digest('hex');
}

function isFirestoreAlreadyExists(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: number | string }).code;
  return (
    code === 6 ||
    code === 'already-exists' ||
    code === 'ALREADY_EXISTS' ||
    code === 'resource-exhausted'
  );
}

type CompletedRequest = {
  pledgeId: string;
  clientSecret: string;
  paymentIntentId: string;
  status: 'authorized';
};

async function waitForCompletedRequest(
  ref: DocumentReference,
  attempts = 6,
): Promise<CompletedRequest | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const snap = await ref.get();
    if (!snap.exists) return null;
    const data = snap.data() ?? {};
    if (
      data.status === 'complete' &&
      typeof data.pledgeId === 'string' &&
      typeof data.clientSecret === 'string' &&
      typeof data.paymentIntentId === 'string'
    ) {
      return {
        pledgeId: data.pledgeId,
        clientSecret: data.clientSecret,
        paymentIntentId: data.paymentIntentId,
        status: 'authorized',
      };
    }
    if (data.status === 'failed') {
      const reason =
        typeof data.errorMessage === 'string'
          ? data.errorMessage
          : 'Previous attempt failed';
      throw new HttpsError('aborted', reason);
    }
    const delayMs = Math.min(200, 50 * (attempt + 1));
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return null;
}

function parseAmount(input: unknown): number {
  const amount = Number(input);
  if (!Number.isFinite(amount)) {
    throw new HttpsError('invalid-argument', 'Amount must be a number');
  }
  if (!Number.isInteger(amount)) {
    throw new HttpsError(
      'invalid-argument',
      'Amount must be an integer in the smallest currency unit',
    );
  }
  if (amount < MIN_PLEDGE_AMOUNT_CENTS) {
    throw new HttpsError(
      'failed-precondition',
      `Minimum pledge amount is ${MIN_PLEDGE_AMOUNT_CENTS} cents`,
    );
  }
  return amount;
}

async function loadWish(
  wishId: string,
): Promise<WishSplitPayState & { exists: boolean }> {
  const snap = await db.collection('wishes').doc(wishId).get();
  if (!snap.exists) {
    return { exists: false };
  }
  const data = snap.data() as WishSplitPayState;
  return { exists: true, ...data };
}

async function resolveStripeCustomerId(userId: string): Promise<string | null> {
  try {
    const userSnap = await db.collection('users').doc(userId).get();
    if (!userSnap.exists) return null;
    const customerId = userSnap.get('stripeCustomerId');
    return typeof customerId === 'string' && customerId ? customerId : null;
  } catch (error) {
    logger.warn('Unable to load Stripe customer id', {
      userId,
      error,
    });
    return null;
  }
}

function normalizeExperiment(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  return trimmed ? trimmed : null;
}

async function ensureOwnerCanSplitPay(
  wishId: string,
  wish: WishSplitPayState,
  amount: number,
): Promise<void> {
  if (!wish.splitPayEnabled) {
    throw new HttpsError(
      'failed-precondition',
      'Split-pay is not enabled for this wish',
    );
  }
  if (!SUPPORTED_STATUSES.has(wish.status ?? 'open')) {
    throw new HttpsError(
      'failed-precondition',
      'Wish is not accepting pledges at this time',
    );
  }
  const target = typeof wish.targetAmount === 'number' ? wish.targetAmount : 0;
  if (target <= 0) {
    throw new HttpsError(
      'failed-precondition',
      'Target amount must be configured before pledging',
    );
  }
  const funded = typeof wish.fundedAmount === 'number' ? wish.fundedAmount : 0;
  if (funded >= target) {
    throw new HttpsError('failed-precondition', 'Wish is already fully funded');
  }
  if (wish.deadline && wish.deadline.toMillis() <= Date.now()) {
    throw new HttpsError(
      'failed-precondition',
      'Funding deadline has passed for this wish',
    );
  }
  if (amount > target * 5) {
    throw new HttpsError(
      'invalid-argument',
      'Pledge amount is unreasonably large',
    );
  }
}

export const createPledge = runWith({
    secrets: [STRIPE_SECRET_KEY],
    timeoutSeconds: 60,
    memory: '256MB',
  })
  .region('us-central1')
  .https.onCall(async (data: CreatePledgeInput, context: CallableContext) => {
    const userId = context.auth?.uid;
    if (!userId) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }
    assertGiftPotEnabled(userId);
    const wishId = typeof data?.wishId === 'string' ? data.wishId.trim() : null;
    if (!wishId) {
      throw new HttpsError('invalid-argument', 'wishId must be provided');
    }
    const amount = parseAmount(data?.amount);
    const experiment = normalizeExperiment(data?.experiment);
    const idempotencyKey = parseIdempotencyKey(data?.idempotencyKey);
    const wish = await loadWish(wishId);
    if (!wish.exists) {
      throw new HttpsError('not-found', 'Wish not found');
    }
    await ensureOwnerCanSplitPay(wishId, wish, amount);

    const currency =
      typeof wish.fundingCurrency === 'string' && wish.fundingCurrency
        ? wish.fundingCurrency.toLowerCase()
        : 'usd';

    const customerId = await resolveStripeCustomerId(userId);
    const pledgesCollection = db
      .collection('wishes')
      .doc(wishId)
      .collection('pledges');

    let pledgeRef = pledgesCollection.doc();
    let requestRef: DocumentReference | null = null;

    if (idempotencyKey) {
      const requestId = makeRequestId(wishId, userId, idempotencyKey);
      pledgeRef = pledgesCollection.doc(requestId);
      const ref = db.collection('splitpayPledgeRequests').doc(requestId);
      requestRef = ref;
      try {
        await ref.create({
          wishId,
          userId,
          amount,
          currency,
          idempotencyKey,
          status: 'pending',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (error) {
        if (isFirestoreAlreadyExists(error)) {
          const existing = await waitForCompletedRequest(ref);
          if (existing) {
            logger.info('Split-pay pledge request reused existing intent', {
              wishId,
              pledgeId: existing.pledgeId,
              userId,
            });
            return existing;
          }
          throw new HttpsError(
            'aborted',
            'An identical pledge request is still processing. Please retry shortly.',
          );
        }
        throw error;
      }
    }

    const pledgeId = pledgeRef.id;
    let intent;
    try {
      intent = await createManualPaymentIntent({
        amount,
        currency,
        customer: customerId ?? undefined,
        metadata: {
          wishId,
          pledgeId,
          userId,
          splitPay: 'true',
        },
        description: wish.title
          ? `Split pay pledge for "${wish.title}"`
          : `Split pay pledge for wish ${wishId}`,
        idempotencyKey: idempotencyKey ? `splitpay-${pledgeId}` : undefined,
      });
    } catch (error) {
      if (requestRef) {
        await requestRef.set(
          {
            status: 'failed',
            errorMessage:
              error instanceof Error ? error.message : 'Failed to create pledge',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }
      throw error;
    }

    const clientSecret = intent?.client_secret;
    if (typeof clientSecret !== 'string' || !clientSecret) {
      if (requestRef) {
        await requestRef.set(
          {
            status: 'failed',
            errorMessage: 'Missing client secret from Stripe',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }
      throw new HttpsError(
        'internal',
        'Unable to create checkout session. Please try again later.',
      );
    }

    const createdAt = admin.firestore.FieldValue.serverTimestamp();
    const pledgeDoc = {
      uid: userId,
      amount,
      currency,
      status: 'authorized' as const,
      experimentBucket: experiment,
      paymentIntentId: intent.id,
      createdAt,
      updatedAt: createdAt,
      lastError: null as string | null,
      idempotencyKey: idempotencyKey ?? null,
    };

    await pledgeRef.set(pledgeDoc);
    const wishUpdate: Record<string, unknown> = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if ((wish.status ?? 'open') === 'open') {
      wishUpdate.status = 'funding';
    }
    await db.collection('wishes').doc(wishId).set(wishUpdate, { merge: true });

    if (requestRef) {
      await requestRef.set(
        {
          status: 'complete',
          pledgeId,
          paymentIntentId: intent.id,
          clientSecret,
          intentStatus:
            typeof intent.status === 'string' ? intent.status : 'authorized',
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }

    logger.info('Split-pay pledge created', {
      wishId,
      pledgeId,
      userId,
      amount,
      currency,
      customerId: customerId ?? null,
      intentStatus: intent.status ?? null,
      idempotencyKey: idempotencyKey ?? null,
    });

    logPledgeCreated({
      wishId,
      pledgeId,
      userId,
      amount,
      status: 'authorized',
    });

    const ownerId = wish.userId;
    if (ownerId && ownerId !== userId) {
      const target =
        typeof wish.targetAmount === 'number' ? wish.targetAmount : 0;
      const funded =
        typeof wish.fundedAmount === 'number' ? wish.fundedAmount : 0;
      const remaining =
        target > 0 ? Math.max(target - (funded + amount), 0) : 0;
      await notifyOwnerOfPledge({
        ownerId,
        wishId,
        wishTitle: wish.title,
        amountCents: amount,
        remainingCents: remaining,
        currency,
      });
    }

    return {
      pledgeId,
      clientSecret,
      paymentIntentId: intent.id,
      status: 'authorized',
    };
  });
