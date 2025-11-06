export type PlanKey = 'supporter_monthly' | 'patron_monthly' | 'patron_annual';

type IdToPlanMap = Record<string, PlanKey>;

const normalizeId = (value: string | undefined | null) => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const buildMap = (
  entries: [string | undefined | null, PlanKey][],
): IdToPlanMap => {
  const map: IdToPlanMap = {};
  entries.forEach(([raw, plan]) => {
    const id = normalizeId(raw);
    if (id) {
      map[id] = plan;
    }
  });
  return map;
};

const getStripePlanMap = (): IdToPlanMap =>
  buildMap([
    [process.env.EXPO_PUBLIC_STRIPE_PRICE_BASIC, 'supporter_monthly'],
    [process.env.EXPO_PUBLIC_STRIPE_PRICE_PATRON, 'patron_monthly'],
    [process.env.EXPO_PUBLIC_STRIPE_PRICE_PATRON_ANNUAL, 'patron_annual'],
  ]);

const getRevenueCatPlanMap = (): IdToPlanMap =>
  buildMap([
    [process.env.EXPO_PUBLIC_IOS_PRODUCT_SUPPORTER, 'supporter_monthly'],
    [process.env.EXPO_PUBLIC_IOS_PRODUCT_PATRON, 'patron_monthly'],
    [process.env.EXPO_PUBLIC_IOS_PRODUCT_PATRON_ANNUAL, 'patron_annual'],
    [process.env.EXPO_PUBLIC_STRIPE_PRICE_BASIC, 'supporter_monthly'],
    [process.env.EXPO_PUBLIC_STRIPE_PRICE_PATRON, 'patron_monthly'],
    [process.env.EXPO_PUBLIC_STRIPE_PRICE_PATRON_ANNUAL, 'patron_annual'],
  ]);

export const resolvePlanKeyFromStripePrice = (
  priceId: string | null | undefined,
): PlanKey | null => {
  if (!priceId) return null;
  const map = getStripePlanMap();
  return map[priceId] ?? null;
};

export const resolvePlanKeyFromProductId = (
  productId: string | null | undefined,
): PlanKey | null => {
  if (!productId) return null;
  const map = getRevenueCatPlanMap();
  return map[productId] ?? null;
};

export const getAllowedStripePriceIds = (): string[] =>
  Object.keys(getStripePlanMap());
