import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';
import * as logger from '../../shared/logger.ts';
import { STRIPE_SECRET_KEY } from './secrets';

let stripe: Stripe;

const db = admin.firestore();
const MAX_AMOUNT = 10_000; // $10k limit to prevent unreasonable charges

export const createGiftCheckoutSession = functions
  .runWith({ secrets: [STRIPE_SECRET_KEY] })
  .https.onRequest(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }

    const { wishId, amount, recipientId, successUrl, cancelUrl } = req.body;
    if (
      !wishId ||
      amount === undefined ||
      amount === null ||
      !recipientId ||
      !successUrl ||
      !cancelUrl
    ) {
      res.status(400).send('Missing parameters');
      return;
    }

    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0 || numAmount > MAX_AMOUNT) {
      res.status(400).send('Invalid amount');
      return;
    }

    try {
      if (!stripe) {
        stripe = new Stripe(STRIPE_SECRET_KEY.value(), {
          apiVersion: '2022-11-15',
        });
      }

      const userSnap = await db.collection('users').doc(recipientId).get();
      const stripeAccountId = userSnap.get('stripeAccountId');
      if (!stripeAccountId) {
        res.status(400).send('Recipient not enabled for Stripe');
        return;
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              unit_amount: Math.round(numAmount * 100),
              product_data: { name: 'WhispList Gift' },
            },
            quantity: 1,
          },
        ],
        payment_intent_data: {
          application_fee_amount: Math.round(numAmount * 100 * 0.1),
          transfer_data: { destination: stripeAccountId },
        },
        metadata: { wishId, recipientId },
        success_url: successUrl,
        cancel_url: cancelUrl,
      });

      await db
        .collection('gifts')
        .doc(wishId)
        .collection('gifts')
        .doc(session.id)
        .set({ amount: numAmount, recipientId, status: 'pending' });

      res.json({ url: session.url });
    } catch (err) {
      logger.error('Error creating gift checkout session', err);
      res.status(500).send('Internal error');
    }
  });
