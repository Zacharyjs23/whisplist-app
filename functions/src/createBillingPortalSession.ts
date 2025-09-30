import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';
// Use Cloud Functions logger
import { STRIPE_SECRET_KEY } from './secrets';

let stripe: any = null;
const db = admin.firestore();

async function getOrCreateCustomer(userId: string): Promise<string> {
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

export const createBillingPortalSession = functions
  .runWith({ secrets: [STRIPE_SECRET_KEY] })
  .https.onRequest(async (req: any, res: any) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }
    const { userId, returnUrl } = req.body || {};
    if (!userId || !returnUrl) {
      res.status(400).send('Missing parameters');
      return;
    }
    try {
      if (!stripe) stripe = new Stripe(STRIPE_SECRET_KEY.value(), { apiVersion: '2022-11-15' });
      const customerId = await getOrCreateCustomer(userId);
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });
      res.json({ url: session.url });
    } catch (err) {
      functions.logger.error('Error creating billing portal session', err);
      res.status(500).send('Internal error');
    }
  });
