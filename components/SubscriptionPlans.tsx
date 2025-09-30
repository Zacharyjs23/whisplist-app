import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export type PlanItem = {
  key: string;
  name: string;
  price: string;
  priceId?: string;
  iosProductId?: string;
  badge?: string;
  benefits?: string[];
};

export type Palette = {
  text: string;
  input: string;
  placeholder: string;
  tint: string;
};

type Props = {
  plans: PlanItem[];
  palette: Palette;
  t: (key: string, defaultText?: string) => string;
  onStartCheckout: (plan: PlanItem) => void;
  stripeConfigured: boolean;
};

export const SubscriptionPlans: React.FC<Props> = ({
  plans,
  palette,
  t,
  onStartCheckout,
  stripeConfigured,
}) => {
  return (
    <View style={{ gap: 12 }}>
      {plans.map((p) => (
        <View key={p.key} style={[styles.card, { backgroundColor: palette.input }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[styles.planName, { color: palette.text }]}>{p.name}</Text>
            {p.badge ? (
              <View
                style={[
                  styles.badge,
                  {
                    backgroundColor: `${palette.tint}22`,
                    borderColor: palette.tint,
                  },
                ]}
              > 
                <Text style={{ color: palette.tint, fontSize: 12 }}>{p.badge}</Text>
              </View>
            ) : null}
          </View>
          <Text style={{ color: palette.placeholder }}>{p.price}</Text>
          {p.benefits && p.benefits.length > 0 && (
            <View style={{ marginTop: 8, gap: 2 }}>
              {p.benefits.map((b, i) => (
                <Text key={i} style={{ color: palette.text }}>• {b}</Text>
              ))}
            </View>
          )}
          <TouchableOpacity
            testID={`subscribe-${p.key}`}
            style={[
              styles.primaryBtn,
              (p.priceId || p.iosProductId)
                ? { backgroundColor: palette.tint }
                : {
                    backgroundColor: palette.input,
                    borderWidth: 1,
                    borderColor: `${palette.placeholder}55`,
                  },
            ]}
            accessibilityRole="button"
            accessibilityState={{ disabled: false }}
            onPress={() => onStartCheckout(p)}
          >
            <Text style={[styles.primaryText, { color: palette.text }]}>
              {(p.priceId || p.iosProductId)
                ? t('subscriptions.subscribe', 'Subscribe')
                : t('subscriptions.unconfiguredCta', 'Finish billing setup')}
            </Text>
          </TouchableOpacity>
        </View>
      ))}
      {!stripeConfigured && (
        <Text style={{ color: palette.placeholder, marginTop: 4 }}>
          {t(
            'subscriptions.missingConfig',
            'Subscriptions are not configured. Add Stripe price IDs in your environment.',
          )}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 16,
  },
  planName: { fontSize: 18, fontWeight: '700' },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  primaryBtn: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryText: { fontWeight: '700' },
});

export default SubscriptionPlans;
