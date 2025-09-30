import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Platform } from 'react-native';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/firebase';
import { useAuthSession } from './AuthSessionContext';
import {
  PRODUCT_TO_PLAN_KEY,
  type PlanKey,
} from '@/helpers/subscriptionPerks';

type SubscriptionDoc = {
  status?: string;
  priceId?: string | null;
  currentPeriodEnd?: any;
  cancelAtPeriodEnd?: boolean;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  productId?: string | null;
  planKey?: PlanKey | null;
};

type SubscriptionContextValue = {
  sub: SubscriptionDoc | null;
  loading: boolean;
  isActive: boolean;
  planKey: PlanKey | null;
  expiresAt: Date | null;
};

const SubscriptionContext = createContext<SubscriptionContextValue>({
  sub: null,
  loading: true,
  isActive: false,
  planKey: null,
  expiresAt: null,
});

export const SubscriptionProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { user } = useAuthSession();
  const [sub, setSub] = useState<SubscriptionDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [rcState, setRcState] = useState<{
    active: boolean | null;
    planKey: PlanKey | null;
    expiresAt: Date | null;
  }>({ active: null, planKey: null, expiresAt: null });

  const productPlanMap = useMemo(
    () =>
      PRODUCT_TO_PLAN_KEY({
        supporter: process.env.EXPO_PUBLIC_IOS_PRODUCT_SUPPORTER,
        patron: process.env.EXPO_PUBLIC_IOS_PRODUCT_PATRON,
        patronAnnual: process.env.EXPO_PUBLIC_IOS_PRODUCT_PATRON_ANNUAL,
      }),
    [],
  );

  const coerceDate = useCallback((value: unknown): Date | null => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof (value as { toDate?: () => Date })?.toDate === 'function') {
      try {
        return (value as { toDate: () => Date }).toDate();
      } catch {
        return null;
      }
    }
    if (typeof value === 'number') {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    if (typeof value === 'string') {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
  }, []);

  const entitlementKey = useMemo(
    () => process.env.EXPO_PUBLIC_RC_ENTITLEMENT || 'supporter',
    [],
  );

  useEffect(() => {
    if (!user?.uid) {
      setSub(null);
      setLoading(false);
      setRcState({ active: null, planKey: null, expiresAt: null });
      return;
    }
    setLoading(true);
    const ref = doc(db, 'users', user.uid, 'billing', 'subscription');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setSub(snap.exists() ? (snap.data() as SubscriptionDoc) : null);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [user?.uid]);

  const extractRcState = useCallback(
    (info: any) => {
      if (!info) return { active: false, planKey: null, expiresAt: null } as {
        active: boolean;
        planKey: PlanKey | null;
        expiresAt: Date | null;
      };
      const entitlement = info?.entitlements?.active?.[entitlementKey];
      if (!entitlement) {
        return { active: false, planKey: null, expiresAt: null };
      }
      const productId: string | undefined = entitlement.productIdentifier || entitlement.productId;
      const planKey = productId ? productPlanMap[productId] ?? null : null;
      const expirationSource = entitlement.expirationDate || entitlement.expiration_at;
      const expiresAt = coerceDate(expirationSource) ?? null;
      return { active: true, planKey, expiresAt };
    },
    [coerceDate, entitlementKey, productPlanMap],
  );

  // RevenueCat entitlements on iOS
  useEffect(() => {
    let cancelled = false;
    let removeListener: (() => void) | undefined;
    async function loadRc() {
      try {
        if (!user?.uid || Platform.OS !== 'ios') {
          setRcState({ active: null, planKey: null, expiresAt: null });
          return;
        }
        const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS;
        if (!apiKey) {
          setRcState({ active: null, planKey: null, expiresAt: null });
          return;
        }
        const PurchasesModule: any = await import('react-native-purchases');
        const Purchases = PurchasesModule.default || PurchasesModule;
        if (Purchases?.isStub) {
          setRcState({ active: null, planKey: null, expiresAt: null });
          return;
        }
        await Purchases.configure({ apiKey, appUserID: user.uid });
        const info = await Purchases.getCustomerInfo();
        if (!cancelled) {
          setRcState((prev) => {
            const next = extractRcState(info);
            return { ...prev, ...next };
          });
        }

        // Listen for entitlement changes
        try {
          removeListener = Purchases.addCustomerInfoUpdateListener((updatedInfo: any) => {
            if (cancelled) return;
            setRcState((prev) => ({ ...prev, ...extractRcState(updatedInfo) }));
          });
        } catch {}
      } catch {
        if (!cancelled) setRcState({ active: null, planKey: null, expiresAt: null });
      }
    }
    loadRc();
    return () => {
      cancelled = true;
      try {
        removeListener?.();
      } catch {}
    };
  }, [extractRcState, user?.uid]);

  const isActive = useMemo(() => {
    if (rcState.active !== null) return rcState.active;
    const s = sub?.status as string | undefined;
    return s === 'active' || s === 'trialing';
  }, [sub?.status, rcState.active]);

  const planKey = useMemo<PlanKey | null>(() => {
    if (rcState.planKey) return rcState.planKey;
    const docPlan = (sub?.planKey as PlanKey | undefined) ?? null;
    if (docPlan) return docPlan;
    const docProduct = sub?.productId || sub?.priceId || null;
    if (docProduct && productPlanMap[docProduct]) {
      return productPlanMap[docProduct] ?? null;
    }
    return null;
  }, [rcState.planKey, sub?.planKey, sub?.priceId, sub?.productId, productPlanMap]);

  const expiresAt = useMemo<Date | null>(() => {
    if (rcState.expiresAt) return rcState.expiresAt;
    return coerceDate(sub?.currentPeriodEnd);
  }, [coerceDate, rcState.expiresAt, sub?.currentPeriodEnd]);

  return (
    <SubscriptionContext.Provider
      value={{ sub, loading, isActive, planKey, expiresAt }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = () => useContext(SubscriptionContext);
