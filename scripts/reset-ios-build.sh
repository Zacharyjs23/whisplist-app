#!/usr/bin/env bash
# Clean all node and CocoaPods artifacts and reinstall them from scratch.

set -euo pipefail

# 1. Remove npm modules, CocoaPods and build artifacts
rm -rf node_modules ios/Pods ios/Podfile.lock ios/build
rm -rf ~/Library/Developer/Xcode/DerivedData

# 2. Clear npm cache and reinstall packages
npm cache clean --force
npm install

# 3. Reinstall CocoaPods with repository update
(cd ios && pod install --repo-update)

# Final instructions to run the app
echo "\nProject reset complete. Now run:\n"
echo "  npx expo start -c"
echo "  npx expo run:ios"
