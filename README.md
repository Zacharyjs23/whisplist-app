# WhispList

WhispList is a social journaling app where people can share wishes, updates, and support requests with optional anonymity.

The app is built with Expo + React Native, Firebase, and Cloud Functions, and supports iOS, Android, and web surfaces.

## Core Product Areas

- Post and explore wishes with categories, stages, and optional anonymity
- Personalized feed ranking and discovery
- Reactions, comments, boosts, and lightweight social support
- Direct messages and notification inbox
- Gifting and split-pay support flows (WhispPay + Stripe rails)
- Subscription and feature-flag-driven premium capabilities

## Tech Stack

- Frontend: Expo Router, React Native, TypeScript
- Data/Auth: Firebase Auth + Firestore + Storage
- Backend: Firebase Cloud Functions (TypeScript)
- Payments: Stripe (client + server), RevenueCat webhook support
- Testing: Jest + React Native Testing Library + Firestore/Storage rules tests

## Project Structure

- `app/`: Expo Router screens and routes
- `components/`, `hooks/`, `contexts/`, `helpers/`: shared app logic
- `functions/src/`: Cloud Functions handlers and backend services
- `tests/`: app, backend, and rules test coverage
- `docs/`: feature docs and integration notes

## Quick Start

1. Install dependencies

```bash
npm install
```

2. Create env file

```bash
cp .env.example .env
```

3. Fill required Firebase variables

- `EXPO_PUBLIC_FIREBASE_API_KEY`
- `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
- `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `EXPO_PUBLIC_FIREBASE_APP_ID`
- `EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID`

Runtime env validation is implemented in `env.ts` (Zod). Use the exported `env` object instead of reading `process.env` directly.

Optional (recommended for production store builds):

- `EXPO_PUBLIC_IOS_APP_STORE_URL` (direct App Store listing URL)
- `EXPO_PUBLIC_IOS_APP_STORE_ID` (numeric app ID for iOS review deep-link)
- `EXPO_PUBLIC_ANDROID_PLAY_STORE_URL` (Play Store listing URL override)

4. Run locally

```bash
npm run start
```

Useful variants:

```bash
npm run ios
npm run android
npm run web
npm run dev
```

## Quality Checks

```bash
npm run typecheck
npm run lint
npm test
```

Rules tests against local emulators:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199 \
npm run test:rules
```

## Backend Notes

Primary Cloud Function entrypoints are in `functions/src/index.ts`, with domain handlers split into dedicated modules (for example gifts HTTP handling in `functions/src/gifts/http.ts`).

If you change function behavior, run both app tests and function-focused tests before deploying.

## Mission and Legal

- Mission: `MISSION.md`
- Terms: `TERMS.md`
- Privacy: `PRIVACY.md`

New users must accept terms and privacy policy during onboarding.

## Troubleshooting

### iOS Pods / ReactCommon errors

```bash
./scripts/clean-ios-pods.sh
npm run ios
```

### Android cleanup

```bash
./scripts/clean-android-build.sh
npm run android
```

### TypeScript path alias (`@/`) not resolving

- Ensure dependencies are installed (`npm install`)
- Open the repo root in your editor
- Confirm editor uses this repo's `tsconfig.json`

## License

MIT (`LICENSE`).
