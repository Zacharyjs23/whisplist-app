import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';
import * as logger from '../../shared/logger.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2022-11-15',
});

const db = admin.firestore();

export const createCheckoutSession = functions.https.onRequest(
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }

    const { wishId, userId } = req.body;
    if (!wishId || !userId) {
      res.status(400).send('Missing parameters');
      return;
    }

    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              unit_amount: 50,
              product_data: { name: 'WhispList Boost' },
            },
            quantity: 1,
          },
        ],
        metadata: { wishId, userId },
        success_url: 'https://example.com/success',
        cancel_url: 'https://example.com/cancel',
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
  },
);
