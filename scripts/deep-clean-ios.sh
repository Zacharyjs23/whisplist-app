#!/usr/bin/env bash
set -euo pipefail

# Fully reset iOS build environment and reinstall dependencies
# Run from the root of the project

# 1. Remove node modules and iOS build artifacts
rm -rf node_modules ios/Pods ios/Podfile.lock ios/build
rm -rf ~/Library/Developer/Xcode/DerivedData

# 2. Clear npm cache
npm cache clean --force

# 3. Reinstall npm packages and CocoaPods
npm install
(cd ios && pod install --repo-update)

# 4. Run the app on iOS simulator
npx expo run:ios
