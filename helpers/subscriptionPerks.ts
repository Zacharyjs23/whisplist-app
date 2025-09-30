export const PLAN_KEYS = ['supporter_monthly', 'patron_monthly', 'patron_annual'] as const;
export type PlanKey = typeof PLAN_KEYS[number];

type CopyEntry = {
  key: string;
  fallback: string;
};

const PLAN_BENEFITS: Record<PlanKey, CopyEntry[]> = {
  supporter_monthly: [
    { key: 'subscriptions.benefits.rephrase', fallback: 'Rephrase assistant' },
    { key: 'subscriptions.benefits.badge', fallback: 'Supporter badge' },
    { key: 'subscriptions.benefits.early', fallback: 'Early access to features' },
    { key: 'subscriptions.benefits.supporterImpact', fallback: 'Keep WhispList independent and ad-free' },
  ],
  patron_monthly: [
    { key: 'subscriptions.benefits.patron.allSupporter', fallback: 'Everything in Supporter' },
    { key: 'subscriptions.benefits.image', fallback: 'Higher image quality' },
    {
      key: 'subscriptions.benefits.patron.communityImpact',
      fallback: 'Helps fund new community spotlights and wish boosts',
    },
    {
      key: 'subscriptions.benefits.patron.priorityAccess',
      fallback: 'Priority access to our next experimental tools',
    },
  ],
  patron_annual: [
    { key: 'subscriptions.benefits.annual.allPatron', fallback: 'Everything in Patron' },
    {
      key: 'subscriptions.benefits.annual.savings',
      fallback: 'Two months free compared to paying monthly',
    },
    {
      key: 'subscriptions.benefits.annual.badge',
      fallback: 'Limited edition annual Patron badge',
    },
    {
      key: 'subscriptions.benefits.annual.checkIns',
      fallback: 'Seasonal behind-the-scenes update from the team',
    },
  ],
};

const PLAN_BADGES: Partial<Record<PlanKey, CopyEntry>> = {
  patron_monthly: { key: 'subscriptions.badges.mostPopular', fallback: 'Most popular' },
  patron_annual: { key: 'subscriptions.badges.bestValue', fallback: 'Best value' },
};

export const resolvePlanBenefits = (
  translate: (key: string, defaultText?: string) => string,
  planKey: PlanKey,
): string[] => {
  const benefits = PLAN_BENEFITS[planKey];
  if (!benefits) return [];
  return benefits.map(({ key, fallback }) => translate(key, fallback));
};

export const resolvePlanBadge = (
  translate: (key: string, defaultText?: string) => string,
  planKey: PlanKey,
): string | undefined => {
  const entry = PLAN_BADGES[planKey];
  return entry ? translate(entry.key, entry.fallback) : undefined;
};

export const PRODUCT_TO_PLAN_KEY = (env: {
  supporter?: string | null;
  patron?: string | null;
  patronAnnual?: string | null;
}): Partial<Record<string, PlanKey>> => {
  const map: Partial<Record<string, PlanKey>> = {};
  if (env.supporter) map[env.supporter] = 'supporter_monthly';
  if (env.patron) map[env.patron] = 'patron_monthly';
  if (env.patronAnnual) map[env.patronAnnual] = 'patron_annual';
  return map;
};
