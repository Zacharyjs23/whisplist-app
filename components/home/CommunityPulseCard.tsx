import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from '@/contexts/I18nContext';
import type { BoostPulse, FulfillmentPulse, SupporterPulse } from '@/hooks/useCommunityPulse';

interface Props {
  boosts: BoostPulse[];
  fulfillments: FulfillmentPulse[];
  supporters: SupporterPulse[];
  loading?: boolean;
}

const CommunityPulseCard: React.FC<Props> = ({ boosts, fulfillments, supporters, loading = false }) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const hasContent = boosts.length > 0 || fulfillments.length > 0 || supporters.length > 0;

  const sectionTitleStyle = [styles.sectionTitle, { color: theme.text }];
  const metaStyle = [styles.metaText, { color: theme.placeholder }];

  return (
    <View style={[styles.container, { backgroundColor: theme.input, borderColor: theme.placeholder }]}
      accessibilityLabel={t('home.communityPulse.label', 'Community highlights')}
    >
      <Text style={[styles.title, { color: theme.text }]}>{t('home.communityPulse.title', 'Community pulse')}</Text>
      <Text style={[styles.subtitle, { color: theme.placeholder }]}>
        {loading
          ? t('home.communityPulse.loading', 'Gathering the latest wins…')
          : t('home.communityPulse.subtitle', 'Here’s what friends are celebrating right now.')}
      </Text>

      {hasContent ? (
        <View>
          {boosts.length > 0 && (
            <View style={styles.section}>
              <Text style={sectionTitleStyle}>{t('home.communityPulse.boosts', '🚀 Fresh boosts')}</Text>
              {boosts.map((boost) => (
                <Text key={boost.id} style={[styles.itemText, { color: theme.text }]}>
                  <Text style={styles.highlight}>{boost.boosterName}</Text>
                  {t('home.communityPulse.boostItem', ' boosted ')}
                  <Text style={styles.highlight}>{boost.wishOwnerName}</Text>
                  {boost.wishText ? t('home.communityPulse.boostWish', "'{{wish}}'", { wish: boost.wishText }) : ''}
                </Text>
              ))}
            </View>
          )}

          {fulfillments.length > 0 && (
            <View style={styles.section}>
              <Text style={sectionTitleStyle}>{t('home.communityPulse.fulfilled', '✨ Wishes fulfilled')}</Text>
              {fulfillments.map((item) => (
                <Text key={item.wishId} style={[styles.itemText, { color: theme.text }]}>
                  <Text style={styles.highlight}>{item.wishOwnerName}</Text>
                  {t('home.communityPulse.fulfillmentItem', ' completed ')}
                  <Text style={styles.highlight}>{item.wishText || t('home.communityPulse.aWish', 'a wish')}</Text>
                </Text>
              ))}
            </View>
          )}

          {supporters.length > 0 && (
            <View style={styles.section}>
              <Text style={sectionTitleStyle}>{t('home.communityPulse.supporters', '🏅 Top supporters')}</Text>
              {supporters.map((supporter) => (
                <View key={supporter.userId} style={styles.supporterBlock}>
                  <View style={styles.supporterRow}>
                    <Text
                      style={[styles.itemText, { color: theme.text, flex: 1 }]}
                      numberOfLines={1}
                    >
                      <Text style={styles.highlight}>
                        {supporter.badge} {supporter.displayName}
                      </Text>
                      <Text style={[styles.tierInline, { color: theme.placeholder }]}>
                        {t('home.communityPulse.supporterTier', ' · {{tier}}', {
                          tier: supporter.tierLabel,
                        })}
                      </Text>
                    </Text>
                    <Text style={metaStyle}>
                      {t('home.communityPulse.supporterMeta', '{{gifts}} gifts · ${{amount}}', {
                        gifts: supporter.totalGifts,
                        amount: supporter.totalAmount.toFixed(2),
                      })}
                    </Text>
                  </View>
                  <Text style={[styles.shoutOut, { color: theme.placeholder }]}
                    numberOfLines={1}
                  >
                    {t(
                      'home.communityPulse.supporterShoutOut',
                      '{{badge}} {{tier}} keeping wishes thriving',
                      {
                        badge: supporter.badge,
                        tier: supporter.tierLabel,
                      },
                    )}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      ) : (
        <Text style={[styles.emptyState, { color: theme.placeholder }]}>
          {loading
            ? t('home.communityPulse.loading', 'Gathering the latest wins…')
            : t('home.communityPulse.empty', 'Activity updates will appear here soon.')}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 4,
    marginBottom: 12,
  },
  section: {
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  itemText: {
    fontSize: 13,
    marginBottom: 4,
  },
  highlight: {
    fontWeight: '600',
  },
  supporterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  supporterBlock: {
    marginBottom: 6,
  },
  metaText: {
    fontSize: 12,
  },
  tierInline: {
    fontSize: 12,
    fontWeight: '500',
  },
  shoutOut: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  emptyState: {
    fontSize: 13,
    fontStyle: 'italic',
  },
});

export default CommunityPulseCard;
