#!/usr/bin/env bash
set -euo pipefail

# Clean and rebuild the iOS project using JSC instead of Hermes

# 1. Remove previous pods, build products and Xcode derived data
rm -rf ios/Pods ios/Podfile.lock ios/build ~/Library/Developer/Xcode/DerivedData

# 2. Delete stray modulemap files that can cause React-jsc/Fabric conflicts
find ios -name "React-jsitooling.modulemap" -type f -delete

# 3. Reinstall pods with repository update
(cd ios && pod install --repo-update)

# 4. Rebuild the app
npx expo run:ios

