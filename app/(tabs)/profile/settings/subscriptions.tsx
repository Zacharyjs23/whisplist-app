import * as React from 'react';
import { ActivityIndicator, Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuthSession } from '@/contexts/AuthSessionContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from '@/contexts/I18nContext';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/firebase';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { postJson } from '@/services/functions';
import * as logger from '@/shared/logger';
import { SubscriptionPlans, PlanItem } from '@/components/SubscriptionPlans';
import {
  resolvePlanBenefits,
  resolvePlanBadge,
  PRODUCT_TO_PLAN_KEY,
  type PlanKey,
} from '@/helpers/subscriptionPerks';
import ConfettiCannon from 'react-native-confetti-cannon';
import { useLocalSearchParams } from 'expo-router';
import { trackEvent } from '@/helpers/analytics';

type SubStatus = {
  status?: string;
  priceId?: string | null;
  currentPeriodEnd?: any;
  cancelAtPeriodEnd?: boolean;
};

const PLANS: PlanItem[] = [
  {
    key: 'supporter_monthly',
    name: 'Supporter',
    price: '$1.99 / month',
    priceId: process.env.EXPO_PUBLIC_STRIPE_PRICE_BASIC,
    iosProductId: process.env.EXPO_PUBLIC_IOS_PRODUCT_SUPPORTER,
  },
  {
    key: 'patron_monthly',
    name: 'Patron',
    price: '$4.99 / month',
    priceId: process.env.EXPO_PUBLIC_STRIPE_PRICE_PATRON,
    iosProductId: process.env.EXPO_PUBLIC_IOS_PRODUCT_PATRON,
  },
  {
    key: 'patron_annual',
    name: 'Patron Annual',
    price: '$49.99 / year',
    priceId: process.env.EXPO_PUBLIC_STRIPE_PRICE_PATRON_ANNUAL,
    iosProductId: process.env.EXPO_PUBLIC_IOS_PRODUCT_PATRON_ANNUAL,
  },
];

export default function SubscriptionsPage() {
  const { user } = useAuthSession();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const tForPlans = React.useCallback(
    (key: string, defaultText?: string) => t(key, { defaultValue: defaultText }),
    [t],
  );

  const [loading, setLoading] = React.useState(true);
  const [sub, setSub] = React.useState<SubStatus | null>(null);
  const params = useLocalSearchParams<{ status?: string }>();
  const [banner, setBanner] = React.useState<string | null>(null);
  const [showConfetti, setShowConfetti] = React.useState(false);
  const [iosPrices, setIosPrices] = React.useState<Record<string, string>>({});
  const [iosPlans, setIosPlans] = React.useState<PlanItem[] | null>(null);
  const [iosLoading, setIosLoading] = React.useState(false);

  const productPlanMap = React.useMemo(
    () =>
      PRODUCT_TO_PLAN_KEY({
        supporter: process.env.EXPO_PUBLIC_IOS_PRODUCT_SUPPORTER,
        patron: process.env.EXPO_PUBLIC_IOS_PRODUCT_PATRON,
        patronAnnual: process.env.EXPO_PUBLIC_IOS_PRODUCT_PATRON_ANNUAL,
      }),
    [],
  );

  React.useEffect(() => {
    if (!user?.uid) {
      setSub(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = doc(db, 'users', user.uid, 'billing', 'subscription');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setSub(snap.exists() ? (snap.data() as SubStatus) : null);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [user?.uid]);

  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const anyPlanConfigured = React.useMemo(
    () => PLANS.some((p) => !!p.priceId || !!p.iosProductId),
    [],
  );
  const hasStripePrice = React.useMemo(() => PLANS.some((p) => !!p.priceId), []);
  const planBenefits = React.useMemo<Record<PlanKey, string[]>>(
    () => ({
      supporter_monthly: resolvePlanBenefits(tForPlans, 'supporter_monthly'),
      patron_monthly: resolvePlanBenefits(tForPlans, 'patron_monthly'),
      patron_annual: resolvePlanBenefits(tForPlans, 'patron_annual'),
    }),
    [tForPlans],
  );
  const plansWithBenefits: PlanItem[] = React.useMemo(() => {
    return PLANS.map((p) => {
      const planKey = p.key as PlanKey;
      const overridePrice =
        Platform.OS === 'ios' && p.iosProductId && iosPrices[p.iosProductId]
          ? `${iosPrices[p.iosProductId]}${p.name.includes('Annual') ? ' / year' : ' / month'}`
          : p.price;
      return {
        ...p,
        benefits: planBenefits[planKey] ?? planBenefits.supporter_monthly,
        badge: resolvePlanBadge(tForPlans, planKey) ?? p.badge,
        price: overridePrice,
        // Do not use Stripe priceId on iOS (use iosProductId instead)
        priceId:
          Platform.OS === 'ios'
            ? p.iosProductId
              ? undefined
              : p.priceId
            : p.priceId,
      };
    });
  }, [planBenefits, iosPrices, tForPlans]);

  const iosPlansWithBenefits = React.useMemo(() => {
    if (!iosPlans || Platform.OS !== 'ios') return null;
    return iosPlans.map((p: PlanItem) => {
      const planKey = (p.iosProductId && productPlanMap[p.iosProductId]) as PlanKey | undefined;
      const benefits = planKey ? planBenefits[planKey] : undefined;
      return {
        ...p,
        benefits: benefits ?? planBenefits.supporter_monthly,
        badge: planKey ? resolvePlanBadge(tForPlans, planKey) ?? p.badge : p.badge,
      };
    });
  }, [iosPlans, planBenefits, productPlanMap, tForPlans]);

  React.useEffect(() => {
    const s = typeof params?.status === 'string' ? params.status : undefined;
    if (s === 'success') {
      setBanner(t('subscriptions.success', 'Thank you for supporting WhispList!'));
      setShowConfetti(true);
    } else if (s === 'cancel') {
      setBanner(t('subscriptions.cancelled', 'Checkout canceled'));
    }
    if (s) {
      const id = setTimeout(() => setBanner(null), 4000);
      setTimeout(() => setShowConfetti(false), 2500);
      return () => clearTimeout(id);
    }
  }, [params?.status, t]);

  const uid = user?.uid;
  // Load iOS price strings from RevenueCat offerings
  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (Platform.OS !== 'ios') return;
      try {
        setIosLoading(true);
        const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS;
        if (!apiKey) return;
        const PurchasesModule: any = await import('react-native-purchases');
        const Purchases = PurchasesModule.default || PurchasesModule;
        if (Purchases?.isStub) {
          if (!cancelled) {
            setIosLoading(false);
            setIosPlans([]);
            setIosPrices({});
          }
          return;
        }
        await Purchases.configure({ apiKey, appUserID: uid });
        const offerings = await Purchases.getOfferings();
        const packs: any[] = offerings?.current?.availablePackages || [];
        const map: Record<string, string> = {};
        packs.forEach((pkg: any) => {
          const prod = pkg?.product;
          if (prod?.identifier && prod?.priceString) map[prod.identifier] = prod.priceString;
        });
        if (!cancelled) {
          setIosPrices(map);
          const plans: PlanItem[] = packs
            .map((pkg: any) => pkg?.product)
            .filter((prod: any) => prod && prod.identifier && prod.priceString)
            .map((prod: any, idx: number) => {
              // Derive a simple badge from package type if available
              const p = packs[idx];
              const pt = (p && p.packageType) ? String(p.packageType).toUpperCase() : '';
              let badge: string | undefined;
              if (pt.includes('THREE') && pt.includes('MONTH')) badge = t('subscriptions.badges.3mo', '3-Month');
              else if (pt.includes('SIX') && pt.includes('MONTH')) badge = t('subscriptions.badges.6mo', '6-Month');
              else if (pt.includes('MONTH')) badge = t('subscriptions.badges.monthly', 'Monthly');
              else if (pt.includes('YEAR') || pt.includes('ANNUAL')) badge = t('subscriptions.badges.annual', 'Annual');
              else if (pt.includes('WEEK')) badge = t('subscriptions.badges.weekly', 'Weekly');
              else if (pt.includes('LIFE')) badge = t('subscriptions.badges.lifetime', 'Lifetime');

              // Localize plan names by mapping known product IDs to labels
              const id = String(prod.identifier);
              const idMap: Record<string, string> = {
                [process.env.EXPO_PUBLIC_IOS_PRODUCT_SUPPORTER || '']: t(
                  'subscriptions.planNames.supporter',
                  'Supporter',
                ),
                [process.env.EXPO_PUBLIC_IOS_PRODUCT_PATRON || '']: t(
                  'subscriptions.planNames.patron',
                  'Patron',
                ),
                [process.env.EXPO_PUBLIC_IOS_PRODUCT_PATRON_ANNUAL || '']: t(
                  'subscriptions.planNames.patronAnnual',
                  'Patron Annual',
                ),
              };
              const localizedName = idMap[id] || prod.title || id;
              return ({
                key: prod.identifier,
                name: localizedName,
                price: prod.priceString,
                iosProductId: prod.identifier,
                badge,
              } as PlanItem);
            });
          setIosPlans(plans);
        }
      } catch {}
      finally {
        if (!cancelled) setIosLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [uid, t]);

  if (!user) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={[styles.emptyText, { color: theme.text }]}>
          {t('subscriptions.signIn', 'Sign in to manage your subscription')}
        </Text>
      </View>
    );
  }

  const successUrl =
    process.env.EXPO_PUBLIC_SUBSCRIBE_SUCCESS_URL || Linking.createURL('/(tabs)/profile/settings/subscriptions?status=success');
  const cancelUrl =
    process.env.EXPO_PUBLIC_SUBSCRIBE_CANCEL_URL || Linking.createURL('/(tabs)/profile/settings/subscriptions?status=cancel');

  async function startCheckout(plan: PlanItem) {
    const planKey = plan.key as PlanKey;
    if (Platform.OS === 'ios') {
      // Purchase via RevenueCat on iOS
      const productId = plan.iosProductId;
      if (!productId) {
        Alert.alert(
          t('subscriptions.missingPrice', 'Missing price configuration'),
          t('subscriptions.setupHelp', 'Add the RevenueCat product IDs for {{plan}}.', {
            plan: plan.name,
          }),
        );
        return;
      }
      try {
        const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS;
        if (!apiKey) throw new Error('Missing RevenueCat API key');
        const PurchasesModule: any = await import('react-native-purchases');
        const Purchases = PurchasesModule.default || PurchasesModule;
        if (Purchases?.isStub) {
          Alert.alert(
            t('subscriptions.unavailableTitle', 'In-app purchases unavailable'),
            t(
              'subscriptions.unavailableMessage',
              'Install RevenueCat before enabling iOS subscriptions.',
            ),
          );
          return;
        }
        await Purchases.configure({ apiKey, appUserID: uid });
        try {
          trackEvent('rc_purchase_start', { productId });
        } catch {}
        const res = await Purchases.purchaseProduct(productId);
        if (res && res.customerInfo) {
          const entitlement = process.env.EXPO_PUBLIC_RC_ENTITLEMENT || 'supporter';
          const active = res.customerInfo.entitlements?.active?.[entitlement];
          if (active) {
            setBanner(t('subscriptions.success', 'Thank you for supporting WhispList!'));
            setShowConfetti(true);
            setTimeout(() => setShowConfetti(false), 2500);
            try {
              trackEvent('rc_purchase_success', { productId });
            } catch {}
          }
        }
      } catch (err) {
        logger.warn('iOS purchase failed', err);
        try {
          trackEvent('rc_purchase_failed', {
            productId,
            error: (err as any)?.message,
          });
        } catch {}
        Alert.alert('Error', t('subscriptions.errorStart', 'Could not start checkout.'));
      }
      return;
    }
    const priceId = plan.priceId;
    if (!priceId) {
      Alert.alert(
        t('subscriptions.missingPrice', 'Missing price configuration'),
        t('subscriptions.setupHelp', 'Add the Stripe price IDs for {{plan}}.', {
          plan: plan.name,
        }),
      );
      return;
    }
    try {
      if (!uid) return;
      try {
        trackEvent('subscription_checkout_start', { priceId, plan: planKey });
      } catch {}
      const { url } = await postJson<{ url: string }>('createSubscriptionCheckoutSession', {
        userId: uid,
        priceId,
        successUrl,
        cancelUrl,
      });
      if (url) await WebBrowser.openBrowserAsync(url);
    } catch (err) {
      logger.error('Failed to start subscription checkout', err);
      Alert.alert('Error', t('subscriptions.errorStart', 'Could not start checkout.'));
    }
  }

  async function openPortal() {
    try {
      if (!uid) return;
      if (Platform.OS === 'ios') {
        // Open native App Store subscriptions page
        await Linking.openURL('https://apps.apple.com/account/subscriptions');
        return;
      }
      try { trackEvent('billing_portal_open'); } catch {}
      const { url } = await postJson<{ url: string }>('createBillingPortalSession', {
        userId: uid,
        returnUrl: Linking.createURL('/(tabs)/profile/settings/subscriptions'),
      });
      if (url) await WebBrowser.openBrowserAsync(url);
    } catch (err) {
      logger.error('Failed to open billing portal', err);
      Alert.alert('Error', t('subscriptions.errorPortal', 'Could not open billing portal.'));
    }
  }

  return (
    <View style={styles.container}>
      {showConfetti && <ConfettiCannon count={40} origin={{ x: 0, y: 0 }} fadeOut />}
      {banner && (
        <View style={[styles.card, { backgroundColor: theme.input, marginBottom: 10 }]}>
          <Text style={{ color: theme.text }}>{banner}</Text>
        </View>
      )}
      <Text style={[styles.title, { color: theme.text }]}>
        {t('subscriptions.title', 'Support WhispList')}
      </Text>
      <Text style={[styles.subtitle, { color: theme.placeholder }]}>
        {t(
          'subscriptions.subtitle',
          'Keep the lights on and unlock warm fuzzies. Cancel anytime.',
        )}
      </Text>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.tint} />
        </View>
      ) : sub?.status && sub.status !== 'canceled' ? (
        <View style={styles.card}>
          <Text style={[styles.status, { color: theme.text }]}>
            {t('subscriptions.status', 'Status')}: {sub.status}
          </Text>
          {sub.priceId && (
            <Text style={{ color: theme.placeholder }}>
              {t('subscriptions.plan', 'Plan')}: {PLANS.find((p) => p.priceId === sub.priceId)?.name || '—'}
            </Text>
          )}
          {sub.currentPeriodEnd && (
            <Text style={{ color: theme.placeholder }}>
              {(
                sub.status === 'trialing'
                  ? t('subscriptions.trialEndsOn', 'Trial ends on {{date}}', {
                      date: new Date(
                        (sub.currentPeriodEnd.toDate?.() || sub.currentPeriodEnd.seconds * 1000) as number,
                      ).toLocaleDateString(),
                    })
                  : t('subscriptions.renewsOn', 'Renews on {{date}}', {
                      date: new Date(
                        (sub.currentPeriodEnd.toDate?.() || sub.currentPeriodEnd.seconds * 1000) as number,
                      ).toLocaleDateString(),
                    })
              )}
            </Text>
          )}
          {sub.cancelAtPeriodEnd && sub.currentPeriodEnd && (
            <Text style={{ color: theme.placeholder }}>
              {t('subscriptions.cancelsOn', 'Cancels on {{date}}', {
                date: new Date(
                  (sub.currentPeriodEnd.toDate?.() || sub.currentPeriodEnd.seconds * 1000) as number,
                ).toLocaleDateString(),
              })}
            </Text>
          )}
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: theme.tint }]} onPress={openPortal}>
            <Text style={[styles.primaryText, { color: theme.text }]}>
              {Platform.OS === 'ios' ? t('subscriptions.manageAppStore', 'Manage in App Store') : t('subscriptions.manage', 'Manage Subscription')}
            </Text>
          </TouchableOpacity>
          {Platform.OS === 'ios' && (
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: theme.input }]}
              onPress={async () => {
                try {
                  const PurchasesModule: any = await import('react-native-purchases');
                  const Purchases = PurchasesModule.default || PurchasesModule;
                  if (Purchases?.isStub) {
                    Alert.alert(
                      t('subscriptions.unavailableTitle', 'In-app purchases unavailable'),
                      t(
                        'subscriptions.unavailableMessage',
                        'Install RevenueCat before enabling iOS subscriptions.',
                      ),
                    );
                    return;
                  }
                  try { trackEvent('rc_restore_attempt'); } catch {}
                  await Purchases.restorePurchases();
                  setBanner(t('subscriptions.success', 'Thank you for supporting WhispList!'));
                  try { trackEvent('rc_restore_success'); } catch {}
                } catch (e) {
                  try { trackEvent('rc_restore_failed', { error: (e as any)?.message }); } catch {}
                  Alert.alert('Error', t('subscriptions.restoreFailed', 'Restore failed'));
                }
              }}
            >
              <Text style={[styles.primaryText, { color: theme.text }]}>{t('subscriptions.restore', 'Restore Purchases')}</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        Platform.OS === 'ios' && iosLoading ? (
          <View style={{ padding: 16, alignItems: 'center' }}>
            <ActivityIndicator color={theme.tint} />
            <Text style={{ marginTop: 8, color: theme.placeholder }}>{t('subscriptions.loadingPlans', 'Loading plans…')}</Text>
          </View>
        ) : (
          <SubscriptionPlans
            plans={
              Platform.OS === 'ios' && iosPlansWithBenefits && iosPlansWithBenefits.length > 0
                ? iosPlansWithBenefits
                : plansWithBenefits
            }
            palette={{ text: theme.text, input: theme.input, placeholder: theme.placeholder, tint: theme.tint }}
            t={tForPlans}
            onStartCheckout={startCheckout}
            stripeConfigured={
              Platform.OS === 'ios'
                ? !!(iosPlansWithBenefits && iosPlansWithBenefits.length > 0) || anyPlanConfigured
                : hasStripePrice
            }
          />
        )
      )}
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useTheme>['theme']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background, padding: 16 },
    title: { fontSize: 22, fontWeight: '700', marginBottom: 6 },
    subtitle: { marginBottom: 16 },
    card: {
      backgroundColor: theme.input,
      borderRadius: 12,
      padding: 16,
    },
    planName: { fontSize: 18, fontWeight: '700' },
    status: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
    primaryBtn: {
      marginTop: 12,
      paddingVertical: 10,
      borderRadius: 10,
      alignItems: 'center',
    },
    primaryText: { fontWeight: '700' },
    emptyText: { fontSize: 14 },
  });
}
