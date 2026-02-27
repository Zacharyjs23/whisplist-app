# WhispPay Gifting Overview

WhispList supports a one-tap WhispPay gifting flow with a Stripe fallback. This document summarizes architecture, setup, and operations.

## Client Experience

1. **Entry point** - `GiftCTA` in `app/wish/[id].tsx` renders for non-owners when gifting is enabled.
2. **Variant selection** - `useExperiment('gift_quickpay_vs_stripe')` splits traffic into `whisppay` and `stripe`.
3. **Start request** - CTA calls `POST /gifts/start` with `{ wishId, amount, userId?, platform }`.
4. **WhispPay launch** - backend returns signed token + payment metadata; client opens a native payment app URL (or web fallback) and includes `whisplist://gift/complete?token=...`.
5. **Return callback** - client posts token to `POST /gifts/confirm`. This records `return_received` and `verification_pending` but does **not** increment totals yet.
6. **Provider verification** - signed webhook `POST /gifts/provider-webhook` with `event=payment.completed` confirms and increments wish totals.
7. **Stripe fallback** - users can continue via Stripe checkout if WhispPay is unavailable.

## Cloud Functions

### `POST /gifts/start`

- Validates amount and wish visibility.
- Resolves `paymentTarget` from recipient `users/{uid}.payoutHandle` or `gifts.default_handle`.
- Persists canonical `gifts/{giftId}` doc with `status: initiated` and `verificationStatus: pending`.
- Returns `{ token, giftId, amount, note, paymentTarget, expiresAt }`.

### `POST /gifts/confirm`

- Verifies HMAC token and expiry.
- Marks gift as `return_received` + `verification_pending`.
- Mirrors pending state in `wishes/{wishId}/gifts/{giftId}` and legacy path.
- Returns `status: verification_pending` unless gift is already fully confirmed.

### `POST /gifts/provider-webhook`

- Verifies `x-whisppay-signature` (or `x-whisplist-signature`) with `GIFT_PROVIDER_WEBHOOK_SECRET`.
- On `payment.completed`, validates `giftId` + `amount` and confirms transactionally:
  - `gifts/{giftId}` -> `status: confirmed`, `verificationStatus: verified`.
  - Nested mirrors updated to confirmed.
  - Wish aggregates incremented (`giftTotal`, `fundingRaised`, `fundingSupporters`).
- On `payment.failed`/`payment.canceled`, marks `verification_failed`.

## Configuration

- Required: `GIFT_TOKEN_SECRET`
- Optional: `GIFT_DEFAULT_HANDLE`
- Required for verification: `GIFT_PROVIDER_WEBHOOK_SECRET`

## Analytics Events

- `gift_cta_tap`
- `quickpay_open`
- `gift_returned`
- `gift_verification_pending`
- `gift_confirmed`
- `gift_cancel`

## Operational Notes

- Never treat return URL hits as successful payment.
- Reconciliation depends on signed provider webhook events.
- Use idempotent webhook delivery so repeated events are safe.
