# Creator Growth Loop (WhispList)

## Objective

Convert short-form sharing traffic into confirmed support actions with measurable steps.

## Funnel

1. `campaign_share_start` - creator/supporter taps share.
2. `campaign_share_complete` - platform share sheet completes.
3. `wish_view` - visitor opens campaign URL.
4. `gift_cta_tap` - visitor starts support intent.
5. `quickpay_open` or Stripe checkout open.
6. `gift_returned` - return callback reached.
7. `gift_confirmed` - provider verification confirms payment.

## Implementation Notes

- Share links use canonical web URLs via `buildPublicWishUrl`.
- Share copy is generated with `buildCampaignShareMessage`.
- Funding totals update only at verified completion to avoid false positives.
