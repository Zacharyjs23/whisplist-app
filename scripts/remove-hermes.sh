#!/usr/bin/env bash
set -euo pipefail

# This script removes Hermes artifacts and rebuilds the project using JSC.

# 1. Clean up caches and previous native projects
watchman watch-del-all || true
rm -rf ios android node_modules

# 2. Reinstall npm dependencies
npm install

# 3. Regenerate native iOS project without Hermes
# Ensure app.json already has "jsEngine": "jsc"
# This step recreates ios/ and android/ folders
npx expo prebuild --clean --platform ios

# 4. Install CocoaPods dependencies
cd ios
pod install
cd ..

# 5. Build and run the iOS app
npx expo run:ios

