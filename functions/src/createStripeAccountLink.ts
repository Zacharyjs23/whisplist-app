import { logger, runWith } from 'firebase-functions/v1';
import type { Request, Response } from 'express';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';
// Use Cloud Functions logger
import { STRIPE_SECRET_KEY } from './secrets';

type StripeClient = InstanceType<typeof Stripe>;

let stripe: StripeClient | null;

const db = admin.firestore();

export const createStripeAccountLink = runWith({ secrets: [STRIPE_SECRET_KEY] })
  .https.onRequest(async (req: Request, res: Response) => {
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
      if (!stripe) {
        stripe = new Stripe(STRIPE_SECRET_KEY.value(), {
          apiVersion: '2022-11-15',
        });
      }

      const ref = db.collection('users').doc(uid);
      const snap = await ref.get();
      let accountId = snap.get('stripeAccountId');
      if (!accountId) {
        const account = await stripe.accounts.create({ type: 'express' });
        accountId = account.id;
        await ref.update({ stripeAccountId: accountId });
      }
      const refreshUrl =
        process.env.STRIPE_ACCOUNT_LINK_REFRESH_URL ||
        'https://example.com/reauth';
      const returnUrl =
        process.env.STRIPE_ACCOUNT_LINK_RETURN_URL ||
        'https://example.com/return';
      const link = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: 'account_onboarding',
      });
      res.json({ url: link.url, accountId });
    } catch (err) {
      logger.error('Error creating account link', err);
      res.status(500).send('Internal error');
    }
  });
