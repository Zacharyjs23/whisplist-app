# Provider Webhook Setup

Use this when configuring your payment provider to confirm support payments in WhispList.

## Endpoint

- Production URL:
  `https://us-central1-whisplist-f6b0d.cloudfunctions.net/gifts/provider-webhook`
- Method: `POST`
- Content-Type: `application/json`

## Signature Header

Send one of these headers with an HMAC SHA-256 signature of the raw request body:

- `x-whisppay-signature: sha256=<hex_digest>`
- or `x-whisplist-signature: sha256=<hex_digest>`

The HMAC key must match `GIFT_PROVIDER_WEBHOOK_SECRET`.

## Event Payload

### Payment completed

```json
{
  "event": "payment.completed",
  "giftId": "8f7c4f2a-1f0f-4d13-9f56-8c2e0d8a0f23",
  "tokenId": "d58e2cd2-bfcb-4a7e-8f86-60a3dc8e2280",
  "amount": 10.0,
  "paymentId": "pay_12345"
}
```

### Payment failed/canceled

```json
{
  "event": "payment.failed",
  "giftId": "8f7c4f2a-1f0f-4d13-9f56-8c2e0d8a0f23",
  "tokenId": "d58e2cd2-bfcb-4a7e-8f86-60a3dc8e2280",
  "amount": 10.0,
  "reason": "insufficient_funds"
}
```

## Local Verification Test

Use:

```bash
./scripts/send_provider_webhook.sh
```

Environment variables:

- `GIFT_PROVIDER_WEBHOOK_SECRET` (required)
- `WEBHOOK_URL` (optional, defaults to production URL)
- `EVENT`, `GIFT_ID`, `TOKEN_ID`, `AMOUNT`, `PAYMENT_ID`, `REASON` (optional overrides)
