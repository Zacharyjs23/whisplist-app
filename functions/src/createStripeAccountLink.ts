import { logger, runWith } from 'firebase-functions/v1';
import type { Request, Response } from 'express';
import * as admin from 'firebase-admin';
import type { DecodedIdToken } from 'firebase-admin/auth';
import Stripe from 'stripe';
// Use Cloud Functions logger
import { STRIPE_SECRET_KEY } from './secrets';

type StripeClient = InstanceType<typeof Stripe>;

let stripe: StripeClient | null;

const db = admin.firestore();

function applyCors(res: Response) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

function extractBearerToken(header?: string | null): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

async function authenticate(
  req: Request,
): Promise<DecodedIdToken | null> {
  const token = extractBearerToken(req.get('Authorization'));
  if (!token) return null;
  try {
    return await admin.auth().verifyIdToken(token);
  } catch (error) {
    logger.warn('createStripeAccountLink auth failed', error);
    return null;
  }
}

export const createStripeAccountLink = runWith({ secrets: [STRIPE_SECRET_KEY] })
  .https.onRequest(async (req: Request, res: Response) => {
    applyCors(res);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }

    const decoded = await authenticate(req);
    if (!decoded) {
      res.status(401).send('Authentication required');
      return;
    }

    const { uid } = req.body;
    if (!uid) {
      res.status(400).send('Missing uid');
      return;
    }
    if (uid !== decoded.uid) {
      res.status(403).send('Forbidden');
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
        'https://whisplist.app/stripe/reauth';
      const returnUrl =
        process.env.STRIPE_ACCOUNT_LINK_RETURN_URL ||
        'https://whisplist.app/stripe/return';
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
