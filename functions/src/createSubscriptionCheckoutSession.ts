import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';
// Use Cloud Functions logger
import { STRIPE_SECRET_KEY } from './secrets';

let stripe: any = null;
const db = admin.firestore();

async function ensureCustomer(userId: string): Promise<string> {
  const userRef = db.collection('users').doc(userId);
  const snap = await userRef.get();
  const existing = snap.get('stripeCustomerId');
  if (existing) return existing as string;

  if (!stripe) stripe = new Stripe(STRIPE_SECRET_KEY.value(), { apiVersion: '2022-11-15' });

  const email = snap.get('email') || undefined;
  const displayName = snap.get('displayName') || undefined;
  const customer = await stripe.customers.create({
    email,
    name: displayName,
    metadata: { userId },
  });

  await Promise.all([
    userRef.update({ stripeCustomerId: customer.id }).catch(() => userRef.set({ stripeCustomerId: customer.id }, { merge: true })),
    db.collection('stripeCustomers').doc(customer.id).set({ userId }),
  ]);
  return customer.id;
}

export const createSubscriptionCheckoutSession = functions
  .runWith({ secrets: [STRIPE_SECRET_KEY] })
  .https.onRequest(async (req: any, res: any) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }
    const { userId, priceId, successUrl, cancelUrl } = req.body || {};
    if (!userId || !priceId || !successUrl || !cancelUrl) {
      res.status(400).send('Missing parameters');
      return;
    }

    try {
      if (!stripe) stripe = new Stripe(STRIPE_SECRET_KEY.value(), { apiVersion: '2022-11-15' });
      const customerId = await ensureCustomer(userId);

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        allow_promotion_codes: true,
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: userId,
        subscription_data: {
          metadata: { userId },
        },
      });

      // Track intent (optional)
      await db
        .collection('users')
        .doc(userId)
        .collection('billing')
        .doc('lastCheckout')
        .set({
          sessionId: session.id,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          priceId,
        });

      res.json({ url: session.url });
    } catch (err) {
      functions.logger.error('Error creating subscription checkout session', err);
      res.status(500).send('Internal error');
    }
  });
