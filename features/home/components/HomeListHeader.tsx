import React from 'react';
import { Animated, Platform, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { TFunction } from 'i18next';
import { DailyQuoteBanner } from '@/components/DailyQuoteBanner';
import WishCardComponent from '@/components/WishCard';
import EngagementCard from '@/components/home/EngagementCard';
import CommunityPulseCard from '@/components/home/CommunityPulseCard';
import ActionPromptsCard, {
  type ActionPrompt,
} from '@/components/home/ActionPromptsCard';
import { HomeComposerSection } from '@/features/home/components/HomeComposerSection';
import type { HomeComposerSectionImpact } from '@/features/home/components/types';
import type { HomeStyles } from '@/features/home/styles';
import type { Theme } from '@/contexts/ThemeContext';
import { QuickActions } from '@/components/home/QuickActions';
import { SafetySupportCTA } from '@/components/SafetySupportCTA';
import type { SafetyConfig } from '@/helpers/safety';
import type { Wish } from '@/types/Wish';
import type { QuickAction } from '@/types/QuickAction';
import type { WishComposerProps } from '@/components/WishComposer';
import type { resolvePlanBenefits } from '@/helpers/subscriptionPerks';
import type {
  BoostPulse,
  FulfillmentPulse,
  SupporterPulse,
} from '@/hooks/useCommunityPulse';

type HomeListHeaderProps = {
  styles: HomeStyles;
  theme: Theme;
  t: TFunction;
  showQuote: boolean;
  quoteText: string | null;
  quoteStyle: string | null;
  onDismissQuote: () => void | Promise<void>;
  onOpenSettings: () => void;
  milestoneMessage: string | null;
  heroGreeting: string;
  heroName: string;
  streakCount: number;
  heroImpactSummary: string;
  hasImpact: boolean;
  impact: HomeComposerSectionImpact;
  quickActions: QuickAction[];
  onQuickAction: (action: QuickAction) => void;
  onOpenResources: () => void;
  onOpenEmergency?: () => void;
  safetyConfig: SafetyConfig;
  surpriseVisibleWish: Wish | null;
  followStatus: Record<string, boolean>;
  onReportWish: (wishId: string) => void;
  onWishDeleted: (wishId: string) => void;
  preferredFeedLabel: string | null;
  engagementLoading: boolean;
  engagementStats: any;
  pulseBoosts: BoostPulse[];
  pulseFulfillments: FulfillmentPulse[];
  pulseSupporters: SupporterPulse[];
  pulseLoading: boolean;
  actionPrompts: ActionPrompt[];
  offlineStatusBanner: React.ReactNode;
  error: string | null;
  onRefresh: () => void | Promise<void>;
  composerProps: WishComposerProps;
  paywallOpen: boolean;
  onPaywallClose: () => void;
  onPaywallSubscribe: () => void;
  supporterPerks: ReturnType<typeof resolvePlanBenefits>;
  hasNewPosts: boolean;
  newPostsCount: number;
  newBannerOpacity: Animated.Value;
  newBannerTranslate: Animated.Value;
  onRefreshNewPosts: () => void | Promise<void>;
  onDismissNewPosts: () => void;
};

export const HomeListHeader: React.FC<HomeListHeaderProps> = ({
  styles,
  theme,
  t,
  showQuote,
  quoteText,
  quoteStyle,
  onDismissQuote,
  onOpenSettings,
  milestoneMessage,
  heroGreeting,
  heroName,
  streakCount,
  heroImpactSummary,
  hasImpact,
  impact,
  quickActions,
  onQuickAction,
  onOpenResources,
  onOpenEmergency,
  safetyConfig,
  surpriseVisibleWish,
  followStatus,
  onReportWish,
  onWishDeleted,
  preferredFeedLabel,
  engagementLoading,
  engagementStats,
  pulseBoosts,
  pulseFulfillments,
  pulseSupporters,
  pulseLoading,
  actionPrompts,
  offlineStatusBanner,
  error,
  onRefresh,
  composerProps,
  paywallOpen,
  onPaywallClose,
  onPaywallSubscribe,
  supporterPerks,
  hasNewPosts,
  newPostsCount,
  newBannerOpacity,
  newBannerTranslate,
  onRefreshNewPosts,
  onDismissNewPosts,
}) => {
  return (
    <View style={styles.headerContainer}>
      {showQuote && quoteText ? (
        <DailyQuoteBanner
          visible={showQuote}
          text={quoteText}
          styleName={quoteStyle || undefined}
          onDismiss={onDismissQuote}
          onTurnOffToday={onDismissQuote}
          onOpenSettings={onOpenSettings}
        />
      ) : null}
      {milestoneMessage ? (
        <View style={[styles.milestoneToast, { borderColor: theme.tint }]}>
          <Text style={[styles.milestoneTitle, { color: theme.tint }]}>
            {t('home.milestones.title', 'Milestone unlocked!')}
          </Text>
          <Text style={[styles.milestoneText, { color: theme.text }]}>
            {milestoneMessage}
          </Text>
        </View>
      ) : null}
      <View style={styles.heroCard}>
        <Text style={styles.heroGreeting}>
          {heroGreeting}, {heroName} ✨
        </Text>
        <Text style={styles.heroSubtitle}>
          {t('home.heroSubtitle', 'Share a wish or explore the community.')}
        </Text>
        {streakCount > 0 ? (
          <View style={styles.heroChipRow}>
            <View style={styles.heroChip}>
              <Text style={styles.heroChipText}>
                🔥{' '}
                {t('home.streakChip', 'Streak: {{count}} days', {
                  count: streakCount,
                })}
              </Text>
            </View>
          </View>
        ) : null}
        <Text style={[styles.heroImpactSummary, { color: theme.placeholder }]}>
          {heroImpactSummary}
        </Text>
        {hasImpact ? (
          <View style={styles.heroStatsRow}>
            <View style={[styles.heroStat, styles.heroStatSpacing]}>
              <Text style={[styles.heroStatValue, { color: theme.text }]}>
                {impact.wishes}
              </Text>
              <Text style={[styles.heroStatLabel, { color: theme.placeholder }]}>
                {t('home.heroStats.wishes', 'Wishes')}
              </Text>
            </View>
            <View style={[styles.heroStat, styles.heroStatSpacing]}>
              <Text style={[styles.heroStatValue, { color: theme.text }]}>
                {impact.boosts}
              </Text>
              <Text style={[styles.heroStatLabel, { color: theme.placeholder }]}>
                {t('home.heroStats.boosts', 'Boosts')}
              </Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={[styles.heroStatValue, { color: theme.text }]}>
                {impact.gifts}
              </Text>
              <Text style={[styles.heroStatLabel, { color: theme.placeholder }]}>
                {t('home.heroStats.gifts', 'Gifts')}
              </Text>
            </View>
          </View>
        ) : null}
        <QuickActions
          actions={quickActions}
          title={t('home.quickActions.title', 'Quick shortcuts')}
          subtitle={t(
            'home.quickActions.subtitle',
            'Jump back into your routine',
          )}
          palette={{
            text: theme.text,
            placeholder: theme.placeholder,
            background: theme.background,
            input: theme.input,
            tint: theme.tint,
          }}
          onSelect={onQuickAction}
        />
        <View style={styles.safetyCardWrapper}>
          <SafetySupportCTA
            onPressResources={onOpenResources}
            onPressEmergency={
              safetyConfig.emergencyUri ? onOpenEmergency : undefined
            }
            emergencyNumber={safetyConfig.emergencyNumber}
            tintColor={theme.tint}
            backgroundColor={theme.input}
            textColor={theme.text}
          />
        </View>
      </View>
      {surpriseVisibleWish ? (
        <View style={styles.sectionSpacing}>
          <View style={styles.sectionHeader}>
            <Text style={styles.surpriseHeading}>
              {t('home.surpriseHeading', '✨ Surprise wish for you')}
            </Text>
            <Text style={[styles.surpriseSubheading, { color: theme.placeholder }]}>
              {preferredFeedLabel
                ? t(
                    'home.surpriseReasonPreferred',
                    'Because you gravitate toward {{type}} stories',
                    { type: preferredFeedLabel },
                  )
                : t(
                    'home.surpriseReason',
                    'A community favorite bubbling up right now.',
                  )}
            </Text>
          </View>
          <WishCardComponent
            wish={surpriseVisibleWish}
            followed={!!followStatus[surpriseVisibleWish.userId || '']}
            onReport={() => onReportWish(surpriseVisibleWish.id)}
            onDeleted={onWishDeleted}
          />
        </View>
      ) : null}
      <View style={styles.sectionSpacing}>
        <EngagementCard stats={engagementStats} loading={engagementLoading} />
      </View>
      <View style={styles.sectionSpacing}>
        <CommunityPulseCard
          boosts={pulseBoosts}
          fulfillments={pulseFulfillments}
          supporters={pulseSupporters}
          loading={pulseLoading}
        />
      </View>
      {actionPrompts.length ? (
        <View style={styles.sectionSpacing}>
          <ActionPromptsCard prompts={actionPrompts} />
        </View>
      ) : null}
      {offlineStatusBanner ? (
        <View style={styles.sectionSpacing}>{offlineStatusBanner}</View>
      ) : null}
      {error ? (
        <View style={[styles.errorCard, { backgroundColor: theme.input }]}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            onPress={onRefresh}
            accessibilityRole="button"
            accessibilityLabel={t('common.retry', 'Retry loading')}
            style={styles.errorButton}
          >
            <Text style={styles.errorButtonText}>{t('common.retry', 'Retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <HomeComposerSection
        styles={styles}
        t={t}
        composerProps={composerProps}
        paywallOpen={paywallOpen}
        onPaywallClose={onPaywallClose}
        onPaywallSubscribe={onPaywallSubscribe}
        supporterPerks={supporterPerks}
        hasImpact={hasImpact}
        impact={impact}
      />
      <View
        style={[
          styles.feedIntroCard,
          {
            backgroundColor: theme.input,
            borderColor: theme.placeholder,
          },
        ]}
      >
        <View style={[styles.feedIntroText, !hasNewPosts && { marginBottom: 0 }]}>
          <Text style={styles.sectionHeading}>
            {t('home.feedHeading', 'Community feed')}
          </Text>
          <Text style={styles.sectionDescription}>
            {t(
              'home.feedDescription',
              'See the latest wishes from people you follow.',
            )}
          </Text>
        </View>
        <Animated.View
          style={[
            styles.newPostsWrapper,
            {
              opacity: newBannerOpacity,
              transform: [{ translateY: newBannerTranslate }],
              display: hasNewPosts ? 'flex' : 'none',
            },
          ]}
        >
          <View
            style={[
              styles.newPostsCard,
              Platform.OS === 'web'
                ? ({ boxShadow: '0px 4px 12px rgba(0,0,0,0.1)' } as const)
                : styles.newPostsShadow,
            ]}
          >
            <TouchableOpacity
              onPress={onRefreshNewPosts}
              style={styles.newPostsButton}
              accessibilityRole="button"
              accessibilityLabel={t(
                'home.newPosts',
                'New posts available. Tap to refresh',
              )}
            >
              <Text style={styles.newPostsText}>
                {newPostsCount > 0
                  ? t(
                      'home.newPostsCount',
                      `${newPostsCount} new ${
                        newPostsCount === 1 ? 'post' : 'posts'
                      } — tap to refresh`,
                    )
                  : t('home.newPosts', 'New posts available — tap to refresh')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onDismissNewPosts}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t('common.dismiss', 'Dismiss')}
              style={styles.newPostsDismiss}
            >
              <Ionicons name="close" size={16} color={theme.background} />
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </View>
  );
};
