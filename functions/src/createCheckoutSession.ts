import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';
import * as logger from '../../shared/logger.ts';
import { STRIPE_SECRET_KEY } from './secrets';

let stripe: Stripe;

const db = admin.firestore();

export const createCheckoutSession = functions
  .runWith({ secrets: [STRIPE_SECRET_KEY] })
  .https.onRequest(async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }

    const { wishId, userId, amount, successUrl, cancelUrl } = req.body;
    if (!wishId || !userId || !amount || !successUrl || !cancelUrl) {
      res.status(400).send('Missing parameters');
      return;
    }

    try {
      if (!stripe) {
        stripe = new Stripe(STRIPE_SECRET_KEY.value(), {
          apiVersion: '2022-11-15',
        });
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              unit_amount: Math.round(amount * 100),
              product_data: { name: 'WhispList Boost' },
            },
            quantity: 1,
          },
        ],
        metadata: { wishId, userId },
        success_url: successUrl,
        cancel_url: cancelUrl,
      });

      await db.collection('boostPayments').doc(session.id).set({
        wishId,
        userId,
        status: 'pending',
      });

      res.json({ url: session.url, sessionId: session.id });
    } catch (err) {
      logger.error('Error creating checkout session', err);
      res.status(500).send('Internal error');
    }
  });
