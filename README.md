# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Create a `.env` file and add your Firebase and Google credentials

   ```bash
   cp .env.example .env
   # then edit .env and fill in the values
   ```

3. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Poll Mode

Wishes can optionally include a poll with two text choices. Enable **Poll Mode** on the home screen to add options A and B when posting a wish. Vote results update in real time on the wish detail screen.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

## Legal

New users must accept our [Terms of Service](TERMS.md) and [Privacy Policy](PRIVACY.md) during onboarding.

## Audio support

`expo-av` has been deprecated in favor of the new [`expo-audio`](https://docs.expo.dev/versions/latest/sdk/audio/) library.
When you upgrade, replace `expo-av` imports with `expo-audio` and adjust any API
changes (mainly how sound and recording objects are created). The rest of the
logic in this repo can remain largely the same.

## Push notifications

The app registers the device for Expo push notifications on first launch.
A Firebase Cloud Function in `functions/index.js` listens for Firestore
updates and sends a notification whenever a wish gets a new like, comment,
or a reply to a comment. Each user's Expo push token is stored in their
profile document so the appropriate user receives the message automatically.

## Troubleshooting TypeScript errors

If your editor reports missing modules such as `react-native` or `expo-router`, ensure you:

1. Run `npm install` to install all dependencies.
2. Open the project root (`whisplist-app`) in your IDE so it picks up `tsconfig.json`.
3. The alias `@/` points to the repository root. Your editor should respect this alias after reading `tsconfig.json`.

## Troubleshooting iOS build errors

If `expo run:ios` fails with errors like `Redefinition of module 'ReactCommon'` or
`Could not build module 'DarwinFoundation'`, clean the pods and reinstall them
before trying again:

```bash
./scripts/clean-ios-pods.sh
npx expo run:ios
```

The script removes the `Pods` directory, clears Xcode's derived data, and runs
`pod install --repo-update` so the iOS project builds from a clean state.

