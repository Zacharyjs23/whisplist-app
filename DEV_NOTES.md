## Entry Points
- Payments (server): `functions/src/services/payments/index.ts` exposes `startPayment` and `handleWebhook`, wrapping the Cloud Function handlers in `createCheckoutSession.ts` and `stripeWebhook.ts`.
- Payments (client): `hooks/useCheckout.ts` issues stable idempotency keys used by `app/components/splitpay/ChipInModal.tsx`.
- Wishlist state: `contexts/SavedWishesContext.tsx` manages saved wishes via `src/reducers/wishlistReducer.ts`.
- Wishlist UI: `components/WishCard.tsx` now surfaces an inline “Add to wishlist” control with optimistic feedback.

## Tests & Commands
- `npm run test -- createPledge.test.ts` — verifies payment idempotency and auth guard.
- `npm run test -- reducers/wishlistReducer.test.ts` — covers wishlist reducer add/remove flows.
- `npm run test -- ReactionBar.test.tsx` — ensures reaction bar save visibility toggles.
- `npm run test -- createCheckoutSession.test.ts` and `npm run test -- splitpay.webhook.test.ts` — regression coverage for payment handlers.
