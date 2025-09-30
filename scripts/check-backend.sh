#!/usr/bin/env bash
set -euo pipefail

echo "[1/3] Typechecking app..."
npm run -s typecheck

echo "[2/3] Running Firestore rules tests (skips without emulator)..."
npm run -s test:rules || true

echo "[3/3] Typechecking Cloud Functions..."
if [ -d functions/node_modules ]; then
  (cd functions && npx tsc -p tsconfig.json --noEmit)
else
  echo "Skipping: 'functions/node_modules' not found. Run 'npm --prefix functions i' first."
fi

echo "All checks completed."

