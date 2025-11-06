import React from 'react';
import { Text, View } from 'react-native';
import {
  WishComposer,
  type WishComposerProps,
} from '@/components/WishComposer';
import { SupporterPaywallModal } from '@/components/SupporterPaywallModal';
import { UserImpact } from '@/components/UserImpact';
import type { HomeStyles } from '@/features/home/styles';
import type { TFunction } from 'i18next';
import type { resolvePlanBenefits } from '@/helpers/subscriptionPerks';
import type { HomeComposerSectionImpact } from './types';

export type HomeComposerSectionProps = {
  styles: HomeStyles;
  t: TFunction;
  composerProps: WishComposerProps;
  paywallOpen: boolean;
  onPaywallClose: () => void;
  onPaywallSubscribe: () => void;
  supporterPerks: ReturnType<typeof resolvePlanBenefits>;
  hasImpact: boolean;
  impact: HomeComposerSectionImpact;
};

export const HomeComposerSection: React.FC<HomeComposerSectionProps> = ({
  styles,
  t,
  composerProps,
  paywallOpen,
  onPaywallClose,
  onPaywallSubscribe,
  supporterPerks,
  hasImpact,
  impact,
}) => {
  return (
    <>
      <View style={styles.sectionSpacing}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeading}>
            {t('home.composeTitle', 'Share something new')}
          </Text>
          <Text style={styles.sectionDescription}>
            {t(
              'home.composeSubtitle',
              'Let a fresh wish float into the world.',
            )}
          </Text>
        </View>
        <WishComposer {...composerProps} />
      </View>

      <SupporterPaywallModal
        visible={paywallOpen}
        onClose={onPaywallClose}
        onSubscribe={onPaywallSubscribe}
        perks={supporterPerks}
      />

      {hasImpact ? (
        <View style={styles.sectionSpacing}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeading}>
              {t('home.impactTitle', 'Your impact')}
            </Text>
            <Text style={styles.sectionDescription}>
              {t(
                'home.impactSubtitle',
                'A quick snapshot of how your wishes are doing.',
              )}
            </Text>
          </View>
          <UserImpact impact={impact} />
        </View>
      ) : null}
    </>
  );
};
