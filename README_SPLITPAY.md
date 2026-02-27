# Split-Pay (Group Gifting)

This document summarizes the configuration required to run the split-pay (group gifting) feature end-to-end.

## Client configuration

- Ensure the app is started with `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` set. The Expo runtime reads this value from `.env` / `app.config.js` and initialises `StripeProvider` globally.
- Enable the UI through Remote Config with the key `features.giftPot`. The client also honours the local override `EXPO_PUBLIC_FEATURE_SPLIT_PAY=true` for development builds while Cloud Functions continue to enforce the flag.

## Firebase Functions

The following Cloud Functions power split-pay flows:

- `createPledge` (callable): creates manual-capture PaymentIntents and records pledges.
- `settleWish` (callable) & `settleSplitPayWishes` (scheduled): capture/void pledges when wishes reach their goal or hit the deadline.
- `stripeWebhook`: now reconciles `payment_intent.*` events to keep pledge docs and wish aggregates in sync.

Deployment notes:

- Set the secrets `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in your Firebase project (`firebase functions:secrets:set ...`).
- Schedule `settleSplitPayWishes` to run every 15 minutes (the cron expression is baked into the function).
- Add the new Firestore index (`collectionGroup: pledges`, `status ASC`, `createdAt ASC`) by deploying `firestore.indexes.json`.
- Deploy security rules to enforce server-only writes for `fundedAmount`, `status`, and the pledges subcollection.

## Stripe

- Configure the webhook endpoint to forward `payment_intent.succeeded`, `payment_intent.canceled`, and `payment_intent.payment_failed` events to `/stripeWebhook`.
- Manual-capture PaymentIntents are created with automatic payment methods enabled; the client confirms them through the Stripe PaymentSheet.

## Testing

Run `npm test` to execute the Jest suite, which now includes unit tests for settlement math and webhook idempotency. The client UI uses the existing test tooling (`jest-expo`). For server tests, set `FEATURE_GIFT_POT=true` so callable functions stay unblocked.

## Feature flag strategy

- When the feature flag is disabled, client entry points disappear and Cloud Functions reject new pledges unless the caller is allowlisted. Existing pledges may still settle via the scheduled job.
- The experiment bucket (`split_pay_on` / `split_pay_off`) is logged on pledge events to facilitate A/B analysis.
