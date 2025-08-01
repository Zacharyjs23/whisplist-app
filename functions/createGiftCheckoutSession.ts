import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2022-11-15',
});

const db = admin.firestore();

export const createGiftCheckoutSession = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  const { wishId, amount, recipientId } = req.body;
  if (!wishId || !amount || !recipientId) {
    res.status(400).send('Missing parameters');
    return;
  }

  try {
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
            unit_amount: Math.round(amount * 100),
            product_data: { name: 'WhispList Gift' },
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: Math.round(amount * 100 * 0.1),
        transfer_data: { destination: stripeAccountId },
      },
      metadata: { wishId, recipientId },
      success_url: 'https://example.com/gift/success',
      cancel_url: 'https://example.com/gift/cancel',
    });

    await db
      .collection('gifts')
      .doc(wishId)
      .collection('gifts')
      .doc(session.id)
      .set({ amount, recipientId, status: 'pending' });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Error creating gift checkout session', err);
    res.status(500).send('Internal error');
  }
});
