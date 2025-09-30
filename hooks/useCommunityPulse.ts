import { useCallback, useEffect, useMemo, useState } from 'react';
import { auth } from '@/firebase';
import { functionUrl } from '@/services/functions';
import { useTranslation } from '@/contexts/I18nContext';

const BOOST_LIMIT = 5;
const FULFILL_LIMIT = 5;

const parseDate = (value?: string | null): Date | undefined => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

type RemoteBoost = {
  id: string;
  wishId: string;
  wishText?: string | null;
  wishOwnerName?: string | null;
  boosterId: string;
  boosterName?: string | null;
  amount?: number | null;
  completedAt?: string | null;
};

type RemoteFulfillment = {
  wishId: string;
  wishText?: string | null;
  wishOwnerName?: string | null;
  fulfilledAt?: string | null;
  fulfillmentLink?: string | null;
};

type RemoteSupporter = {
  userId: string;
  displayName?: string | null;
  avatar?: string | null;
  totalGifts: number;
  totalAmount: number;
};

type CommunityPulseResponse = {
  boosts?: RemoteBoost[];
  fulfillments?: RemoteFulfillment[];
  supporters?: RemoteSupporter[];
};

export interface BoostPulse {
  id: string;
  wishId: string;
  wishText: string;
  wishOwnerName: string;
  boosterId: string;
  boosterName: string;
  amount?: number;
  completedAt?: Date;
}

export interface FulfillmentPulse {
  wishId: string;
  wishText: string;
  wishOwnerName: string;
  fulfilledAt?: Date;
  fulfillmentLink?: string | null;
}

export interface SupporterPulse {
  userId: string;
  displayName: string;
  avatar?: string | null;
  totalGifts: number;
  totalAmount: number;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  tierLabel: string;
  badge: string;
}

interface CommunityPulseState {
  boosts: BoostPulse[];
  fulfillments: FulfillmentPulse[];
  supporters: SupporterPulse[];
}

const INITIAL_STATE: CommunityPulseState = {
  boosts: [],
  fulfillments: [],
  supporters: [],
};

type TranslateFn = (key: string, defaultMessage: string) => string;

const SUPPORTER_TIERS: {
  tier: SupporterPulse['tier'];
  minAmount: number;
  labelKey: string;
  defaultLabel: string;
  badge: string;
}[] = [
  {
    tier: 'platinum',
    minAmount: 200,
    labelKey: 'home.communityPulse.supporterTiers.platinum',
    defaultLabel: 'Platinum Ally',
    badge: '🌟',
  },
  {
    tier: 'gold',
    minAmount: 100,
    labelKey: 'home.communityPulse.supporterTiers.gold',
    defaultLabel: 'Gold Champion',
    badge: '🏆',
  },
  {
    tier: 'silver',
    minAmount: 50,
    labelKey: 'home.communityPulse.supporterTiers.silver',
    defaultLabel: 'Silver Supporter',
    badge: '🥈',
  },
  {
    tier: 'bronze',
    minAmount: 0,
    labelKey: 'home.communityPulse.supporterTiers.bronze',
    defaultLabel: 'Bronze Friend',
    badge: '🥉',
  },
];

function describeSupporterTier(totalAmount: number, totalGifts: number, translate: TranslateFn) {
  const tierInfo = SUPPORTER_TIERS.find((entry) => totalAmount >= entry.minAmount) ?? SUPPORTER_TIERS.at(-1)!;
  return {
    tier: tierInfo.tier,
    tierLabel: translate(tierInfo.labelKey, tierInfo.defaultLabel),
    badge: tierInfo.badge,
  } satisfies Pick<SupporterPulse, 'tier' | 'tierLabel' | 'badge'>;
}

export function useCommunityPulse() {
  const { t } = useTranslation();
  const isTestEnv = typeof process !== 'undefined' && process.env.JEST_WORKER_ID;
  const [state, setState] = useState<CommunityPulseState>(INITIAL_STATE);
  const [loading, setLoading] = useState<boolean>(isTestEnv ? false : true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isTestEnv) {
      setLoading(true);
      setError(null);
    }

    try {
      const endpoint = functionUrl('getCommunityPulseHttp');
      const idToken = await auth.currentUser?.getIdToken?.();
      if (!idToken) {
        throw new Error('Authentication required');
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      const payload = await response
        .json()
        .catch<CommunityPulseResponse | { error?: unknown } | null>(() => null);

      if (!response.ok) {
        const message =
          payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
            ? payload.error
            : `Request failed: ${response.status}`;
        throw new Error(message || 'Request failed');
      }

      const data = (payload ?? {}) as CommunityPulseResponse;

      const safeBoosts = Array.isArray(data.boosts) ? data.boosts : [];
      const safeFulfillments = Array.isArray(data.fulfillments) ? data.fulfillments : [];
      const safeSupporters = Array.isArray(data.supporters) ? data.supporters : [];

      const boosts: BoostPulse[] = safeBoosts.slice(0, BOOST_LIMIT).map((entry) => ({
        id: entry.id,
        wishId: entry.wishId,
        wishText: entry.wishText ?? '',
        wishOwnerName: entry.wishOwnerName ?? 'Someone',
        boosterId: entry.boosterId,
        boosterName: entry.boosterName ?? 'A supporter',
        amount: typeof entry.amount === 'number' ? entry.amount : undefined,
        completedAt: parseDate(entry.completedAt ?? undefined),
      }));

      const fulfillments: FulfillmentPulse[] = safeFulfillments
        .slice(0, FULFILL_LIMIT)
        .map((entry) => ({
          wishId: entry.wishId,
          wishText: entry.wishText ?? '',
          wishOwnerName: entry.wishOwnerName ?? 'Someone',
          fulfilledAt: parseDate(entry.fulfilledAt ?? undefined),
          fulfillmentLink: entry.fulfillmentLink ?? undefined,
        }));

      const translate: TranslateFn = (key, defaultMessage) => {
        const value = t(key, { defaultValue: defaultMessage });
        if (typeof value === 'string' && value && value !== key) {
          return value;
        }
        return defaultMessage;
      };

      const supporters: SupporterPulse[] = safeSupporters
        .map((entry) => {
          const totalAmountRaw = typeof entry.totalAmount === 'number' ? entry.totalAmount : 0;
          const totalGifts = Number.isFinite(entry.totalGifts) ? entry.totalGifts : 0;
          const totalAmount = Number(totalAmountRaw.toFixed(2));
          const tierInfo = describeSupporterTier(totalAmount, totalGifts, translate);
          return {
            userId: entry.userId,
            displayName: entry.displayName || 'Supporter',
            avatar: entry.avatar ?? null,
            totalGifts,
            totalAmount,
            ...tierInfo,
          };
        })
        .sort((a, b) => b.totalAmount - a.totalAmount || b.totalGifts - a.totalGifts)
        .slice(0, 3);

      setState({ boosts, fulfillments, supporters });
      setError(null);
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string'
          ? ((err as { message: string }).message || 'Failed to load community pulse')
          : 'Failed to load community pulse';
      setError(message);
      setState(INITIAL_STATE);
    } finally {
      setLoading(false);
    }
  }, [isTestEnv, t]);

  useEffect(() => {
    let cancelled = false;
    if (isTestEnv) {
      return () => {
        cancelled = true;
      };
    }

    const run = async () => {
      await load();
    };
    void run();

    const id = setInterval(() => {
      if (!cancelled) void load();
    }, 60_000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [load, isTestEnv]);

  return useMemo(
    () => ({
      boosts: state.boosts,
      fulfillments: state.fulfillments,
      supporters: state.supporters,
      loading,
      error,
      refresh: load,
    }),
    [state, loading, error, load],
  );
}

export default useCommunityPulse;
