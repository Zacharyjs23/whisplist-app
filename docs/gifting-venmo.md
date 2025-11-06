# Venmo Gifting Overview

WhispList now supports a one-tap Venmo gifting flow with an experiment-driven Stripe fallback. This document summarizes the architecture, setup, and operational notes for the feature.

## Client Experience

1. **Entry point** – `GiftCTA` in `app/wish/[id].tsx` renders for non-owners when gifting is enabled. Users can pick preset amounts ($5, $10, $20) or enter a custom value.
2. **Variant selection** – `useExperiment('gift_venmo_vs_stripe')` hashes the viewer’s `userId` for an A/B split (`venmo` vs `stripe`).
3. **Start request** – Pressing the CTA POSTs to `https://us-central1-<project>.cloudfunctions.net/gifts/start` with `{ wishId, amount, userId?, platform }`.
4. **Venmo launch** – Cloud Function replies with a signed token, Venmo note, recipient handle, and expiry timestamp. The client builds a native `venmo://` URL (or web fallback) that includes `whisplist://gift/complete?token=…` as the return scheme and logs `venmo_open`.
5. **Deep link handling** – The CTA listens for `gift/complete` URIs (including the cold-start path) and POSTs the token to `/gifts/confirm`, logging `return_success` / `gift_confirmed` on completion.
6. **Totals refresh** – On confirmation the wish document is refetched, cached meta is cleared, and a toast plus inline banner acknowledge the contribution.
7. **Stripe fallback (variant B)** – A lightweight modal opens the existing Stripe checkout session instead. All errors log `gift_cancel`.

## Cloud Functions

### `POST /gifts/start`

- Validates amount (>$0 and ≤$10k), wish existence, and visibility.
- Resolves recipient Venmo handle (user field or `functions.config().gifts.venmo_handle`, falling back to `whisplist`).
- Persists `gifts/{giftId}` with `status: "pending"`, `tokenId`, note, expiry (~5 minutes), and supporter metadata.
- Returns `{ token, giftId, amount, note, recipient, expiresAt }`.

### `POST /gifts/confirm`

- Verifies HMAC token signature and expiry.
- Executes a transaction that:
  - Marks the top-level gift document `status: "confirmed"`.
  - Mirrors data under `wishes/{wishId}/gifts/{giftId}` and `gifts/{wishId}/gifts/{giftId}` (legacy path).
  - Increments `wish.giftTotal`, `fundingRaised`, and `fundingSupporters`.
- Calls `incrementEngagement(supporterId, 'gifting')`.
- Responds with `{ status: "confirmed" | "already_confirmed", wishId, amount, giftTotal }`.

Both handlers share CORS logic and are also exported individually as `startGift`/`confirmGift`.

### Configuration

- Set `functions.config().gifts.secret` (or `GIFT_TOKEN_SECRET`) to a strong HMAC secret.
- Optional `functions.config().gifts.venmo_handle` or `GIFT_VENMO_HANDLE`.
- Deploying requires `firebase deploy --only functions`.

## Firestore Data Model & Rules

- **Top-level** `gifts/{giftId}` stores the canonical record (`wishId`, `supporterId`, `recipientId`, `status`, `amount`, timestamps).
- **Legacy mirrors** remain under `gifts/{wishId}/gifts/{giftId}` and `wishes/{wishId}/gifts/{giftId}` for notifications and historical queries.
- Security rules:
  - `validPendingGiftCreate` ensures client-written docs (if ever allowed) are pending-only with a limited field set.
  - `giftReadable` grants read access to the wish owner, recipient, or supporter.
  - Nested collections remain server-write-only.

## Analytics & Experimentation

Event names and payload `{ wishId, amount, variant, userId }` are centralized in `src/lib/analytics.ts`:

- `gift_cta_tap`
- `venmo_open`
- `return_success`
- `gift_confirmed`
- `gift_cancel`

The experiment hook lives at `src/experiments/useExperiment.ts` and seeds buckets deterministically by `key:userId` using an FNV-style hash.

## Client Modules

- `src/features/gifting/GiftCTA.tsx` – UI + deep-link plumbing, Stripe fallback modal, rate limit, and toasts.
- `src/lib/venmo.ts` – URL builder (`venmo://` + web fallback) with platform-aware launching.
- `helpers/wishMeta.ts` – Aggregates totals with de-duplication across legacy and new documents, filtering to confirmed/completed statuses.

## Manual Testing Checklist

1. Set `GIFT_TOKEN_SECRET` (and optional `gifts.venmo_handle`) locally: `firebase functions:config:set gifts.secret="..."`.
2. Run `npm --prefix functions run build` then `firebase emulators:start` or deploy.
3. Launch app, open a wish owned by another user, ensure CTA appears with presets and custom amount.
4. Start gift → confirm Venmo opens (or web fallback) and the deep link triggers confirmation.
5. Verify Firestore: `gifts/{giftId}` marked `status: confirmed`, wish totals incremented, nested doc created.
6. Switch experiment variant (override user hash) to confirm Stripe fallback path.
7. Attempt expired token (wait >5 minutes) and confirm client surfaces the failure toast and backend writes `status: expired`.

## Failure Behaviour

- Start endpoint failures set a user-facing error, emit `gift_cancel`, and leave CTA enabled for retry.
- Missing Venmo app falls back to web; on React Native web the handler rewrites `window.location`.
- Confirm failures mark gifts expired or respond `404/401`; the client logs `gift_cancel` and shows an alert.

Use `clearWishMetaCache` after backend changes to invalidate stale totals whenever writing custom scripts or tests.
