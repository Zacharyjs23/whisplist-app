#!/usr/bin/env bash
set -euo pipefail

# Ensure UTF-8 so CocoaPods doesn't crash on Ruby unicode_normalize
export LANG=${LANG:-en_US.UTF-8}
export LC_ALL=${LC_ALL:-en_US.UTF-8}

# Clean iOS build artifacts and reinstall CocoaPods
# Run this script from the root of your Expo project

# 1. Remove previous Pods, Podfile.lock, and build folder
rm -rf ios/Pods ios/Podfile.lock ios/build

# 2. Remove Xcode derived data to avoid stale caches
rm -rf ~/Library/Developer/Xcode/DerivedData

# 3. Delete duplicate React-jsitooling.modulemap files that can cause build failures
if [ -d ios/Pods ]; then
  find ios/Pods -name "React-jsitooling.modulemap" -type f -delete
fi

# 4. Reinstall pods with repository update to ensure dependencies are fresh
cd ios
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install --repo-update
cd ..

echo "Finished cleaning and reinstalling iOS pods."
