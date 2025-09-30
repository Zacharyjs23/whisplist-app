import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';
// Use Cloud Functions logger
import { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } from './secrets';
import { incrementEngagement } from './engagement';

let stripe: any;

const db = admin.firestore();

export const stripeWebhook = functions
  .runWith({ secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] })
  .https.onRequest(async (req: any, res: any) => {
    const sig = req.headers['stripe-signature'] as string;
    let event: any;
    try {
      if (!stripe) {
        stripe = new Stripe(STRIPE_SECRET_KEY.value(), {
          apiVersion: '2022-11-15',
        });
      }

      event = stripe.webhooks.constructEvent(
        req.rawBody,
        sig,
        STRIPE_WEBHOOK_SECRET.value(),
      );
  } catch (err) {
    functions.logger.error('Webhook verification failed', err);
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
      const amount = typeof session.amount_total === 'number' ? session.amount_total / 100 : undefined;
      const currency = (session.currency || 'usd') as string;

      if (session.mode === 'payment' && wishId && recipientId) {
        // Gift completed: mark top-level gift record, and mirror under wishes to trigger notifyGiftReceived
        const giftsTop = db.collection('gifts').doc(wishId).collection('gifts').doc(sessionId);
        const wishGift = db.collection('wishes').doc(wishId).collection('gifts').doc(sessionId);
        const wishRef = db.collection('wishes').doc(wishId);

        let alreadyCompleted = false;
        try {
          const existing = await giftsTop.get();
          alreadyCompleted = existing.exists && existing.get('status') === 'completed';
        } catch (err) {
          functions.logger.warn('Unable to check gift completion status', err);
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
        batch.set(
          wishGift,
          {
            recipientId,
            supporterId: supporterId ?? null,
            amount: amount ?? null,
            currency,
            status: 'completed',
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        );

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
            functions.logger.warn('Failed to update gifting streak', err);
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
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      const sub = event.data.object as any;
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
      let userId: string | undefined;
      try {
        const mapSnap = await db.collection('stripeCustomers').doc(customerId).get();
        userId = mapSnap.exists ? (mapSnap.get('userId') as string) : undefined;
      } catch {}
      if (!userId) {
        // Fallback to metadata
        userId = (sub.metadata as any)?.userId as string | undefined;
      }
      if (userId) {
        const priceId = sub.items?.data?.[0]?.price?.id || null;
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
              currentPeriodEnd,
              cancelAtPeriodEnd,
              stripeCustomerId: customerId,
              stripeSubscriptionId: sub.id,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        // Expose a simple public flag for supporter badge
        await db.collection('users').doc(userId).set({ isSupporter: isActive }, { merge: true });
      }
    }

    res.json({ received: true });
  });
