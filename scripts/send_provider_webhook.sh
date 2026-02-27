#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${GIFT_PROVIDER_WEBHOOK_SECRET:-}" ]]; then
  echo "GIFT_PROVIDER_WEBHOOK_SECRET is required"
  exit 1
fi

WEBHOOK_URL="${WEBHOOK_URL:-https://us-central1-whisplist-f6b0d.cloudfunctions.net/gifts/provider-webhook}"
EVENT="${EVENT:-payment.completed}"
GIFT_ID="${GIFT_ID:-demo-gift-id}"
TOKEN_ID="${TOKEN_ID:-demo-token-id}"
AMOUNT="${AMOUNT:-10}"
PAYMENT_ID="${PAYMENT_ID:-demo-payment-id}"
REASON="${REASON:-manual_test}"

if [[ "$EVENT" == "payment.completed" ]]; then
  BODY=$(cat <<JSON
{"event":"$EVENT","giftId":"$GIFT_ID","tokenId":"$TOKEN_ID","amount":$AMOUNT,"paymentId":"$PAYMENT_ID"}
JSON
)
else
  BODY=$(cat <<JSON
{"event":"$EVENT","giftId":"$GIFT_ID","tokenId":"$TOKEN_ID","amount":$AMOUNT,"reason":"$REASON"}
JSON
)
fi

SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$GIFT_PROVIDER_WEBHOOK_SECRET" -hex | awk '{print $2}')

curl -i \
  -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "x-whisppay-signature: sha256=$SIG" \
  --data "$BODY"
