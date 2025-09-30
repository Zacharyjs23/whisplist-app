# Privacy Policy

We respect your privacy and collect only the information needed to operate WhispList. This policy describes what we collect, how we use it, and your choices.

## Data We Collect

- **Account & Profile**
  - Firebase Authentication user ID (UID), email (if provided), display name, photo URL, and profile preferences (e.g., public profile enabled).
  - Anonymous sign‑in is supported; you can post without linking an email or name.

- **Content**
  - Wishes, comments, reactions, poll votes, timestamps, and related metadata.
  - Media you upload (images/audio) are stored in Firebase Storage.
  - Direct messages (DM threads and messages) when you use messaging features.

- **Payments & Subscriptions**
  - Gifts and subscription purchases are processed by third‑party providers:
    - Stripe (for web/Android gifts and subscriptions) — we store Stripe customer/subscription IDs and non‑sensitive billing status (e.g., active, trialing, canceled). We never store card numbers.
    - Apple App Store via RevenueCat (for iOS subscriptions) — we store entitlement status (e.g., active, trialing) and map it to your account. We do not receive full receipts or card details.

- **Notifications**
  - Expo push token and/or FCM token (if you opt in) to send push notifications (e.g., comments, boosts, DMs). Notification preferences are stored per user.

- **Analytics & Diagnostics**
  - Anonymous or pseudonymous analytics events (e.g., feature usage, errors) to improve the app. Where possible we avoid storing personally identifiable information (PII) in analytics.

## How We Use Data

- Operate and improve core features (posting content, reactions, messaging, search, daily prompts).
- Show your content to others according to your settings (e.g., public profile on/off).
- Process purchases (gifts and subscriptions) and determine entitlement to supporter features.
- Send notifications you opt into (e.g., new comments, DMs, boosts).
- Detect and prevent abuse, troubleshoot issues, and maintain service reliability.

## Data Sharing (Processors)

We use trusted processors strictly to provide the service:

- **Google Firebase** (Auth, Firestore, Storage, Cloud Functions)
- **Stripe** (payments for web/Android gifts and subscriptions)
- **Apple/RevenueCat** (iOS in‑app subscriptions/entitlements)
- **Expo** (push notifications, WebBrowser)

These providers process data on our behalf under their own privacy and security terms.

## Data Retention & Deletion

- Content you create (wishes, comments, media) remains until you delete it or your account is removed.
- You can export or delete your content from the Settings screen. Deleting your account removes profile data and content associated with your UID, subject to legal/operational retention requirements (e.g., payment records retained by payment processors).

### How to export or delete your data (in‑app)

1) Open the app and go to Settings → System & Account
2) Tap “Export History” to export your wishes and comments
3) Tap “Delete My Content” to remove content you’ve posted
4) To delete your account entirely, contact support@whisplist.app (account deletion will remove your profile and content stored under your UID)

## Security

We use industry‑standard security for data at rest and in transit. No method is 100% secure, but we take reasonable measures to protect your information.

## Children

WhispList is not directed to children under 13 (or minimum age in your jurisdiction). Do not use the service if you are under the applicable age.

## Changes

We may update this policy as we add features (e.g., subscriptions, messaging). We will post changes here and update the “Last updated” date below.

## Contact

Questions or requests? Email us at support@whisplist.app.

Last updated: 2025‑09‑03

## Related Documents

- Terms of Service: [TERMS.md](TERMS.md)
- Privacy Policy: [PRIVACY.md](PRIVACY.md)

## Data Map (Where Things Live)

- Firestore (Google Firebase)
  - `users/{uid}`: profile (displayName, photoURL, preferences), supporter flag, notification prefs
  - `users/{uid}/billing/subscription`: subscription status (active/trialing/canceled), provider metadata
  - `wishes/{wishId}`: wish content and metadata (timestamps, counts)
  - `wishes/{wishId}/comments/{commentId}`: comments and replies
  - `wishes/{wishId}/gifts/{giftId}`: basic gift records for in‑app notifications
  - `reactions/{wishId}/users/{uid}`: a user’s reaction to a wish
  - `dmThreads/{threadId}` and `dmThreads/{threadId}/messages/{messageId}`: direct messages
  - `users/{uid}/notifications/{notificationId}`: in‑app notifications

- Firebase Storage
  - `avatars/*` and content uploads (images/audio) associated with wishes

- Payments
  - Stripe (web/Android): customer/subscription IDs and session IDs (in our DB), payment details remain with Stripe
  - RevenueCat/Apple (iOS): entitlement status keyed to your app user ID; receipts/payment details remain with Apple/RevenueCat

- Push Notifications
  - Expo push token and/or FCM token (if opted in); used only to deliver notifications

We keep this map high‑level so it’s easy to scan. If you need export or deletion for any of the above, contact us or use the in‑app tools.
