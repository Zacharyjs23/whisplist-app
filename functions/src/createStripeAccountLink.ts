import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2022-11-15',
});

const db = admin.firestore();

export const createStripeAccountLink = functions.https.onRequest(
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }

    const { uid } = req.body;
    if (!uid) {
      res.status(400).send('Missing uid');
      return;
    }

    try {
      const ref = db.collection('users').doc(uid);
      const snap = await ref.get();
      let accountId = snap.get('stripeAccountId');
      if (!accountId) {
        const account = await stripe.accounts.create({ type: 'express' });
        accountId = account.id;
        await ref.update({ stripeAccountId: accountId });
      }
      const link = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: 'https://example.com/reauth',
        return_url: 'https://example.com/return',
        type: 'account_onboarding',
      });
      res.json({ url: link.url, accountId });
    } catch (err) {
      console.error('Error creating account link', err);
      res.status(500).send('Internal error');
    }
  },
);
