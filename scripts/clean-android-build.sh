#!/usr/bin/env bash
set -euo pipefail

echo "Stopping any running Gradle daemons..."
./gradlew --stop >/dev/null 2>&1 || true

echo "Cleaning Android build outputs..."
rm -rf android/app/build android/build || true

echo "Cleaning project-local Gradle cache..."
rm -rf android/.gradle || true

echo "Done. If Android Studio still complains about a missing init script, try:"
echo "  - File > Invalidate Caches / Restart"
echo "  - Close the project, then Open 'android' again"
echo "  - Ensure 'Gradle JDK' is set to JDK 17 (Project Settings > Gradle)"
echo "  - Use Gradle wrapper (not a fixed distribution) in Gradle settings"

echo "Optional (can be slow): clear global Gradle caches with 'rm -rf ~/.gradle/caches'"

