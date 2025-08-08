import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';
import * as logger from '../../helpers/logger';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2022-11-15',
});

const db = admin.firestore();

export const stripeWebhook = functions.https.onRequest(async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      req.rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET as string,
    );
  } catch (err) {
    logger.error('Webhook verification failed', err);
    res.status(400).send('Webhook Error');
    return;
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const wishId = session.metadata?.wishId as string;
    const sessionId = session.id;

    const batch = db.batch();
    if (wishId) {
      batch.update(db.collection('wishes').doc(wishId), {
        boostedUntil: admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + 24 * 60 * 60 * 1000),
        ),
        boosted: 'stripe',
      });
    }
    batch.update(db.collection('boostPayments').doc(sessionId), {
      status: 'completed',
    });
    await batch.commit();
  }

  res.json({ received: true });
});
