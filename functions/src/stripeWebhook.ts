import { logger, runWith } from 'firebase-functions/v1';
import type { Request, Response } from 'express';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';
import type {
  DocumentReference,
  Transaction,
  UpdateData,
} from 'firebase-admin/firestore';
// Use Cloud Functions logger
import { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } from './secrets';
import { incrementEngagement } from './engagement';
import { resolvePlanKeyFromStripePrice } from './planCatalog';
import {
  logPledgeCaptureFailed,
  logPledgeCaptureSuccess,
  logPledgeCanceled,
  logWishFulfilled,
} from './analytics/splitPay';
import {
  notifyPledgerCaptured,
  notifyPledgerExpired,
  notifyOwnerWishFunded,
} from './splitpay/notifications';

type StripeClient = InstanceType<typeof Stripe>;
type StripePaymentIntent = Awaited<
  ReturnType<StripeClient['paymentIntents']['retrieve']>
>;
type StripeCharge = {
  amount_captured?: number | null;
  [key: string]: unknown;
};
type PaymentIntentWithCharges = StripePaymentIntent & {
  charges?: {
    data?: StripeCharge[];
  } | null;
};

let stripe: StripeClient | null = null;

const db = admin.firestore();
const stripeEventsCollection = db.collection('stripeEvents');

type PledgeDoc = {
  uid?: string | null;
  amount?: number;
  status?: string;
  capturedAmount?: number;
  paymentIntentStatus?: string;
  currency?: string;
};

type WishDoc = {
  userId?: string;
  fundedAmount?: number;
  targetAmount?: number;
  status?: string;
  title?: string;
  fundingCurrency?: string;
};

function getMetadataValue(
  intent: StripePaymentIntent,
  key: string,
): string | null {
  const metadata = intent.metadata as Record<string, string> | null | undefined;
  if (!metadata) return null;
  const value = metadata[key];
  return typeof value === 'string' && value.length ? value : null;
}

function getCapturedAmount(intent: StripePaymentIntent): number {
  const amountReceived = Number(intent.amount_received);
  if (Number.isFinite(amountReceived) && amountReceived > 0) {
    return amountReceived;
  }
  const charges = (intent as PaymentIntentWithCharges).charges?.data ?? [];
  for (const charge of charges) {
    const captured = Number(charge.amount_captured);
    if (Number.isFinite(captured) && captured > 0) {
      return captured;
    }
  }
  const total = Number(intent.amount);
  const capturable = Number(intent.amount_capturable);
  if (
    Number.isFinite(total) &&
    Number.isFinite(capturable) &&
    total > capturable
  ) {
    const captured = total - capturable;
    if (captured > 0) {
      return captured;
    }
  }
  return 0;
}

async function markStripeEventProcessed(
  eventId: string,
  payload: Record<string, unknown>,
) {
  try {
    await stripeEventsCollection.doc(eventId).set(
      {
        ...payload,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  } catch (error) {
    logger.warn('Failed to record Stripe event', { eventId, error });
  }
}

async function hasProcessedStripeEvent(eventId: string): Promise<boolean> {
  try {
    const snap = await stripeEventsCollection.doc(eventId).get();
    return snap.exists;
  } catch (error) {
    logger.warn('Unable to check Stripe event dedupe state', {
      eventId,
      error,
    });
    return false;
  }
}

export type PaymentIntentHandlerResult = {
  processed: boolean;
};

type PaymentIntentSuccessResult = {
  processed: true;
  delta: number;
  statusChanged: boolean;
  ownerReachedGoal: boolean;
  wishStatus?: string;
  pledge?: PledgeDoc;
  wish?: WishDoc;
  capturedAmount: number;
  currency: string;
  supporterIncrement: number;
};

type PaymentIntentTransactionResult =
  | { processed: false; reason?: string }
  | PaymentIntentSuccessResult;

type PaymentIntentCancellationTransactionResult =
  | { processed: false }
  | {
      processed: true;
      statusChanged: boolean;
      pledge?: PledgeDoc;
      wish?: WishDoc;
    };

type PaymentIntentFailureTransactionResult =
  | { processed: false }
  | {
      processed: true;
      pledge?: PledgeDoc;
    };

export async function handlePaymentIntentSucceeded(
  intent: StripePaymentIntent,
): Promise<PaymentIntentHandlerResult> {
  if ((intent.metadata as any)?.splitPay !== 'true') {
    return { processed: false };
  }
  const wishId = getMetadataValue(intent, 'wishId');
  const pledgeId = getMetadataValue(intent, 'pledgeId');
  if (!wishId || !pledgeId) {
    logger.warn('payment_intent.succeeded missing metadata', {
      paymentIntentId: intent.id,
      wishId,
      pledgeId,
    });
    return { processed: false };
  }

  const pledgeRef = db
    .collection('wishes')
    .doc(wishId)
    .collection('pledges')
    .doc(pledgeId) as DocumentReference<PledgeDoc>;
  const wishRef = db
    .collection('wishes')
    .doc(wishId) as DocumentReference<WishDoc>;
  const capturedAmount = Math.max(0, getCapturedAmount(intent));
  const paymentCurrency = intent.currency ?? 'usd';

  const result = await db.runTransaction(
    async (tx: Transaction): Promise<PaymentIntentTransactionResult> => {
      const pledgeSnap = await tx.get(pledgeRef);
      if (!pledgeSnap.exists) {
        return {
          processed: false,
          reason: 'missing_pledge',
        };
      }
      const pledgeData = (pledgeSnap.data() ?? {}) as PledgeDoc;
      const wishSnap = await tx.get(wishRef);
      const wishData = wishSnap.exists
        ? ((wishSnap.data() ?? {}) as WishDoc)
        : undefined;

      const previousCaptured =
        typeof pledgeData.capturedAmount === 'number'
          ? pledgeData.capturedAmount
          : 0;
      const currentStatus =
        typeof pledgeData.status === 'string'
          ? pledgeData.status
          : 'authorized';

      const pledgeUpdates: Record<string, unknown> = {
        paymentIntentStatus: intent.status,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastError: null,
      };

      let statusChanged = false;
      let supporterIncrement = 0;
      if (capturedAmount > 0) {
        pledgeUpdates.capturedAmount = capturedAmount;
      }
      if (currentStatus !== 'captured') {
        pledgeUpdates.status = 'captured';
        pledgeUpdates.capturedAt = admin.firestore.FieldValue.serverTimestamp();
        statusChanged = true;
        supporterIncrement = 1;
      }

      const delta =
        capturedAmount > previousCaptured
          ? capturedAmount - previousCaptured
          : 0;
      if (Object.keys(pledgeUpdates).length > 0) {
        tx.update(pledgeRef, pledgeUpdates as UpdateData<PledgeDoc>);
      }

      let ownerReachedGoal = false;
      let nextWishStatus: string | undefined;
      if (delta > 0 && wishData) {
        const target =
          typeof wishData.targetAmount === 'number' ? wishData.targetAmount : 0;
        const funded =
          typeof wishData.fundedAmount === 'number' ? wishData.fundedAmount : 0;
        const currentStatus =
          typeof wishData.status === 'string' ? wishData.status : 'open';
        const wishUpdates: Record<string, unknown> = {
          fundedAmount: admin.firestore.FieldValue.increment(delta),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (supporterIncrement > 0) {
          wishUpdates.fundingSupporters =
            admin.firestore.FieldValue.increment(supporterIncrement);
        }
        const newFunded = funded + delta;
        if (
          target > 0 &&
          newFunded >= target &&
          currentStatus !== 'fulfilled'
        ) {
          wishUpdates.status = 'fulfilled';
          wishUpdates.fulfilledAt =
            admin.firestore.FieldValue.serverTimestamp();
          ownerReachedGoal = true;
          nextWishStatus = 'fulfilled';
        } else if (currentStatus === 'open') {
          wishUpdates.status = 'funding';
          nextWishStatus = 'funding';
        }
        tx.update(wishRef, wishUpdates as UpdateData<WishDoc>);
      } else if (statusChanged && wishData) {
        const currentStatus =
          typeof wishData.status === 'string' ? wishData.status : 'open';
        if (currentStatus === 'open') {
          tx.update(wishRef, {
            status: 'funding',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          } as UpdateData<WishDoc>);
          nextWishStatus = 'funding';
        }
      }

      return {
        processed: true,
        delta,
        statusChanged,
        ownerReachedGoal,
        wishStatus: nextWishStatus,
        pledge: pledgeData,
        wish: wishData,
        capturedAmount,
        currency: pledgeData.currency ?? paymentCurrency,
        supporterIncrement,
      };
    },
  );

  if (!result.processed) {
    return { processed: false };
  }

  const {
    delta,
    statusChanged,
    pledge,
    wish,
    capturedAmount: resultCapturedAmount,
    currency,
    ownerReachedGoal,
  } = result;

  if (delta > 0 || statusChanged) {
    logPledgeCaptureSuccess({
      wishId,
      pledgeId,
      userId: pledge?.uid ?? null,
      amount: resultCapturedAmount,
      status: 'captured',
      trigger: 'webhook',
    });
    await notifyPledgerCaptured({
      userId: pledge?.uid ?? null,
      wishId,
      wishTitle: wish?.title,
      amountCents: resultCapturedAmount,
      currency: currency ?? intent.currency ?? 'usd',
    });
  }

  if (ownerReachedGoal) {
    logWishFulfilled({
      wishId,
      userId: wish?.userId ?? null,
      amount: wish?.targetAmount,
      trigger: 'webhook',
      status: 'fulfilled',
    });
    await notifyOwnerWishFunded({
      ownerId: wish?.userId,
      wishId,
      wishTitle: wish?.title,
    });
  }

  return { processed: true };
}

export async function handlePaymentIntentCanceled(
  intent: StripePaymentIntent,
): Promise<PaymentIntentHandlerResult> {
  if ((intent.metadata as any)?.splitPay !== 'true') {
    return { processed: false };
  }
  const wishId = getMetadataValue(intent, 'wishId');
  const pledgeId = getMetadataValue(intent, 'pledgeId');
  if (!wishId || !pledgeId) {
    logger.warn('payment_intent.canceled missing metadata', {
      paymentIntentId: intent.id,
      wishId,
      pledgeId,
    });
    return { processed: false };
  }
  const pledgeRef = db
    .collection('wishes')
    .doc(wishId)
    .collection('pledges')
    .doc(pledgeId) as DocumentReference<PledgeDoc>;
  const wishRef = db
    .collection('wishes')
    .doc(wishId) as DocumentReference<WishDoc>;

  const result = await db.runTransaction(
    async (
      tx: Transaction,
    ): Promise<PaymentIntentCancellationTransactionResult> => {
      const pledgeSnap = await tx.get(pledgeRef);
      if (!pledgeSnap.exists) {
        return { processed: false };
      }
      const pledgeData = (pledgeSnap.data() ?? {}) as PledgeDoc;
      const wishSnap = await tx.get(wishRef);
      const wishData = wishSnap.exists
        ? ((wishSnap.data() ?? {}) as WishDoc)
        : undefined;

      const currentStatus =
        typeof pledgeData.status === 'string'
          ? pledgeData.status
          : 'authorized';
      const updates: Record<string, unknown> = {
        paymentIntentStatus: intent.status,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      let statusChanged = false;
      if (currentStatus !== 'canceled') {
        updates.status = 'canceled';
        updates.canceledAt = admin.firestore.FieldValue.serverTimestamp();
        updates.lastError = null;
        statusChanged = true;
      }
      tx.update(pledgeRef, updates as UpdateData<PledgeDoc>);
      return {
        processed: true,
        statusChanged,
        pledge: pledgeData,
        wish: wishData,
      };
    },
  );

  if (!result.processed) {
    return { processed: false };
  }

  if (result.statusChanged) {
    logPledgeCanceled({
      wishId,
      pledgeId,
      userId: result.pledge?.uid ?? null,
      status: 'canceled',
      trigger: 'webhook',
      reason: 'stripe_event',
    });
    await notifyPledgerExpired({
      userId: result.pledge?.uid ?? null,
      wishId,
      wishTitle: result.wish?.title,
    });
  }

  return { processed: true };
}

export async function handlePaymentIntentFailed(
  intent: StripePaymentIntent,
): Promise<PaymentIntentHandlerResult> {
  if ((intent.metadata as any)?.splitPay !== 'true') {
    return { processed: false };
  }
  const wishId = getMetadataValue(intent, 'wishId');
  const pledgeId = getMetadataValue(intent, 'pledgeId');
  if (!wishId || !pledgeId) {
    logger.warn('payment_intent.payment_failed missing metadata', {
      paymentIntentId: intent.id,
      wishId,
      pledgeId,
    });
    return { processed: false };
  }
  const pledgeRef = db
    .collection('wishes')
    .doc(wishId)
    .collection('pledges')
    .doc(pledgeId) as DocumentReference<PledgeDoc>;

  const lastErrorMessage = intent.last_payment_error?.message ?? null;
  const result = await db.runTransaction(
    async (tx: Transaction): Promise<PaymentIntentFailureTransactionResult> => {
      const pledgeSnap = await tx.get(pledgeRef);
      if (!pledgeSnap.exists) {
        return { processed: false };
      }
      const pledgeData = (pledgeSnap.data() ?? {}) as PledgeDoc;
      const currentStatus =
        typeof pledgeData.status === 'string'
          ? pledgeData.status
          : 'authorized';
      const updates: Record<string, unknown> = {
        paymentIntentStatus: intent.status,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastError: lastErrorMessage,
      };
      if (currentStatus !== 'failed') {
        updates.status = 'failed';
      }
      tx.update(pledgeRef, updates as UpdateData<PledgeDoc>);
      return {
        processed: true,
        pledge: pledgeData,
      };
    },
  );

  if (!result.processed) {
    return { processed: false };
  }

  logPledgeCaptureFailed({
    wishId,
    pledgeId,
    userId: result.pledge?.uid ?? null,
    amount: result.pledge?.amount,
    status: 'failed',
    trigger: 'webhook',
    reason: lastErrorMessage ?? 'payment_failed',
  });

  return { processed: true };
}

export async function handleWebhook(
  req: Request & { rawBody?: Buffer },
  res: Response,
): Promise<void> {
  const sig = req.headers['stripe-signature'] as string;
  let event: any;
  try {
    if (!stripe) {
      stripe = new Stripe(STRIPE_SECRET_KEY.value(), {
        apiVersion: '2022-11-15',
      });
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      res.status(400).send('Missing raw body');
      return;
    }

    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      STRIPE_WEBHOOK_SECRET.value(),
    );
  } catch (err) {
    logger.error('Webhook verification failed', err);
    res.status(400).send('Webhook Error');
    return;
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as any;
    const sessionId = session.id as string;
    const wishId = (session.metadata as any)?.wishId as string | undefined;
    const metadata = (session.metadata || {}) as Record<string, unknown>;
    const recipientId = metadata.recipientId as string | undefined;
    const supporterId = metadata.supporterId as string | undefined;
    const amount =
      typeof session.amount_total === 'number'
        ? session.amount_total / 100
        : undefined;
    const currency = (session.currency || 'usd') as string;

    if (session.mode === 'payment' && wishId && recipientId) {
      // Gift completed: mark top-level gift record, and mirror under wishes to trigger notifyGiftReceived
      const giftsTop = db
        .collection('gifts')
        .doc(wishId)
        .collection('gifts')
        .doc(sessionId);
      const wishGift = db
        .collection('wishes')
        .doc(wishId)
        .collection('gifts')
        .doc(sessionId);
      const wishRef = db.collection('wishes').doc(wishId);

      let alreadyCompleted = false;
      try {
        const existing = await giftsTop.get();
        alreadyCompleted =
          existing.exists && existing.get('status') === 'completed';
      } catch (err) {
        logger.warn('Unable to check gift completion status', err);
      }

      const batch = db.batch();
      batch.set(
        giftsTop,
        {
          status: 'completed',
          amount,
          currency,
          supporterId: supporterId ?? null,
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      batch.set(wishGift, {
        recipientId,
        supporterId: supporterId ?? null,
        amount: amount ?? null,
        currency,
        status: 'completed',
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      if (!alreadyCompleted && typeof amount === 'number' && amount > 0) {
        batch.set(
          wishRef,
          {
            fundingRaised: admin.firestore.FieldValue.increment(amount),
            fundingSupporters: admin.firestore.FieldValue.increment(1),
          },
          { merge: true },
        );
      }

      await batch.commit();
      if (supporterId) {
        try {
          await incrementEngagement(supporterId, 'gifting');
        } catch (err) {
          logger.warn('Failed to update gifting streak', err);
        }
      }
    } else if (session.mode === 'payment' && wishId) {
      // Handle one-time boost payments (legacy)
      const batch = db.batch();
      batch.update(db.collection('wishes').doc(wishId), {
        boostedUntil: admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + 24 * 60 * 60 * 1000),
        ),
        boosted: 'stripe',
      });
      batch.update(db.collection('boostPayments').doc(sessionId), {
        status: 'completed',
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        amount: amount ?? null,
      });
      await batch.commit();
    }
    // For subscriptions, rely on customer.subscription events below
  }

  if (
    event.type === 'payment_intent.succeeded' ||
    event.type === 'payment_intent.canceled' ||
    event.type === 'payment_intent.payment_failed'
  ) {
    try {
      const intent = event.data.object as StripePaymentIntent;
      if ((intent.metadata as any)?.splitPay === 'true') {
        const alreadyProcessed = await hasProcessedStripeEvent(event.id);
        if (alreadyProcessed) {
          logger.debug('Skipping duplicate Stripe event', {
            eventId: event.id,
            type: event.type,
          });
        } else {
          let result: PaymentIntentHandlerResult | null = null;
          if (event.type === 'payment_intent.succeeded') {
            result = await handlePaymentIntentSucceeded(intent);
          } else if (event.type === 'payment_intent.canceled') {
            result = await handlePaymentIntentCanceled(intent);
          } else if (event.type === 'payment_intent.payment_failed') {
            result = await handlePaymentIntentFailed(intent);
          }
          if (result?.processed) {
            await markStripeEventProcessed(event.id, {
              type: event.type,
              paymentIntentId: intent.id,
            });
          }
        }
      }
    } catch (error) {
      logger.error('Failed to process payment_intent webhook', {
        eventId: event.id,
        type: event.type,
        error,
      });
    }
  }

  if (
    event.type === 'customer.subscription.created' ||
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted'
  ) {
    const sub = event.data.object as any;
    const customerId =
      typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
    let userId: string | undefined;
    try {
      const mapSnap = await db
        .collection('stripeCustomers')
        .doc(customerId)
        .get();
      userId = mapSnap.exists ? (mapSnap.get('userId') as string) : undefined;
    } catch {}
    if (!userId) {
      // Fallback to metadata
      userId = (sub.metadata as any)?.userId as string | undefined;
    }
    if (userId) {
      const priceId = sub.items?.data?.[0]?.price?.id || null;
      const planKey = priceId ? resolvePlanKeyFromStripePrice(priceId) : null;
      const currentPeriodEnd = sub.current_period_end
        ? admin.firestore.Timestamp.fromMillis(sub.current_period_end * 1000)
        : null;
      const cancelAtPeriodEnd = !!sub.cancel_at_period_end;
      const isActive = sub.status === 'active' || sub.status === 'trialing';
      await db
        .collection('users')
        .doc(userId)
        .collection('billing')
        .doc('subscription')
        .set(
          {
            status: sub.status,
            priceId,
            planKey: planKey ?? null,
            currentPeriodEnd,
            cancelAtPeriodEnd,
            stripeCustomerId: customerId,
            stripeSubscriptionId: sub.id,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      // Expose a simple public flag for supporter badge
      await db
        .collection('users')
        .doc(userId)
        .set(
          {
            isSupporter: isActive,
            supporterPlan: planKey ?? null,
          },
          { merge: true },
        );
    }
  }

  res.json({ received: true });
}

export const stripeWebhook = runWith({
  secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET],
  timeoutSeconds: 60,
  memory: '256MB',
}).https.onRequest(handleWebhook);
