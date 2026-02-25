import { formatDistanceToNow } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import type { TFunction } from 'i18next';
import React from 'react';
import { BarChart } from 'react-native-chart-kit';
import {
  Alert,
  Animated,
  Dimensions,
  Image,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { Theme } from '@/contexts/ThemeContext';
import { HIT_SLOP, withAlpha } from '@/features/wishDetail/constants';
import { styles } from '@/features/wishDetail/styles';
import type { WishStageOption } from '@/hooks/useWishStages';
import { SplitPayProgressBar } from '@/app/components/splitpay/ProgressBar';
import { GiftCTA } from '@/src/features/gifting/GiftCTA';
import { formatCurrency } from '@/shared/numberFormat';
import type { PostTypeMeta } from '@/types/post';
import type { WishStage } from '@/types/WishStage';
import type { Wish } from '@/types/Wish';

type WishDetailCardProps = {
  wish: Wish;
  theme: Theme;
  t: TFunction;
  typeMeta: PostTypeMeta;
  isBoosted: boolean;
  glowAnim: Animated.Value;
  stage: WishStage;
  stageMeta: {
    description: string;
    nudge: string;
  };
  stageOptions: WishStageOption[];
  pendingStage: WishStage | null;
  onChangeStage: (nextStage: WishStage) => void;
  anonFavEnabled: boolean;
  anonFavorited: boolean;
  anonFavLoading: boolean;
  favoriteCount: number;
  favoriteSampleNote: string | null;
  onFavoritePress: () => void | Promise<void>;
  circleLastCheckInAt?: number | null;
  onCircleCheckIn: () => void;
  hasVoted: boolean;
  onVote: (option: 'A' | 'B') => void;
  isPlaying: boolean;
  onToggleAudio: () => void;
  splitPayActive: boolean;
  progressPercent: number;
  splitPayStatsText: string;
  deadlineLabel: string | null;
  splitPayCtaLabel: string | null;
  canChipIn: boolean;
  giftTogetherEnabled: boolean;
  onOpenChipIn: () => void;
  onOpenGiftTogether: () => void;
  onShare: () => void;
  hasFundingGoal: boolean;
  fundingPercentDisplay: number;
  legacyFundingRaised: number;
  legacyFundingGoal: number;
  legacySupporters: number;
  supportRequestAmount: number | null;
  supportRequestReason: string;
  giftingEnabled: boolean;
  onOpenGiftLink: (link: string) => void;
  ownerVenmoHandle: string | null;
  onGiftConfirmed: () => void;
  canBoost: boolean;
  onBoostWish: () => void;
  isOwner: boolean;
  onStartEdit: () => void;
  onDeleteWish: () => void;
  onReportWish: () => void;
  timeLeft: string;
};

export const WishDetailCard: React.FC<WishDetailCardProps> = ({
  wish,
  theme,
  t,
  typeMeta,
  isBoosted,
  glowAnim,
  stage,
  stageMeta,
  stageOptions,
  pendingStage,
  onChangeStage,
  anonFavEnabled,
  anonFavorited,
  anonFavLoading,
  favoriteCount,
  favoriteSampleNote,
  onFavoritePress,
  circleLastCheckInAt,
  onCircleCheckIn,
  hasVoted,
  onVote,
  isPlaying,
  onToggleAudio,
  splitPayActive,
  progressPercent,
  splitPayStatsText,
  deadlineLabel,
  splitPayCtaLabel,
  canChipIn,
  giftTogetherEnabled,
  onOpenChipIn,
  onOpenGiftTogether,
  onShare,
  hasFundingGoal,
  fundingPercentDisplay,
  legacyFundingRaised,
  legacyFundingGoal,
  legacySupporters,
  supportRequestAmount,
  supportRequestReason,
  giftingEnabled,
  onOpenGiftLink,
  ownerVenmoHandle,
  onGiftConfirmed,
  canBoost,
  onBoostWish,
  isOwner,
  onStartEdit,
  onDeleteWish,
  onReportWish,
  timeLeft,
}) => {
  const legacyVisibilityWish = wish as Wish & {
    visibility?: string;
    shareScope?: string;
    isPrivate?: boolean;
  };

  const giftLinkLabel = React.useMemo(() => {
    if (!wish.giftLink) return null;
    try {
      const url = new URL(wish.giftLink);
      const trusted = ['venmo.com', 'paypal.me', 'amazon.com'].some((domain) =>
        url.hostname.includes(domain),
      );
      return `${trusted ? '✅' : '⚠️'} 🎁 ${wish.giftLabel || 'Send Gift'}`;
    } catch {
      return `⚠️ 🎁 ${wish.giftLabel || 'Send Gift'}`;
    }
  }, [wish.giftLabel, wish.giftLink]);

  return (
    <Animated.View
      style={[
        styles.wishBox,
        {
          backgroundColor: theme.input,
          borderColor: isBoosted ? '#facc15' : typeMeta.color,
          borderWidth: isBoosted ? 2 : 1,
          transform: [
            {
              scale: isBoosted ? glowAnim : 1,
            },
          ],
        },
      ]}
    >
      <View style={styles.wishHeaderRow}>
        <Text style={[styles.wishCategory, { color: typeMeta.color }]}>
          {typeMeta.emoji} #{wish.category}
        </Text>
        <View style={styles.headerActions}>
          {anonFavEnabled ? (
            <TouchableOpacity
              onPress={() => {
                void onFavoritePress();
              }}
              hitSlop={HIT_SLOP}
              accessibilityRole="button"
              accessibilityState={anonFavLoading ? { busy: true } : undefined}
              disabled={anonFavLoading}
            >
              <Ionicons
                name={anonFavorited ? 'heart' : 'heart-outline'}
                size={20}
                color={anonFavorited ? '#ef4444' : theme.tint}
              />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity onPress={onShare} hitSlop={HIT_SLOP}>
            <Ionicons name="share-outline" size={20} color={theme.tint} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.stageContainer}>
        {stageOptions.map((option) => {
          const isActive = option.value === stage;
          return (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.stageChip,
                {
                  backgroundColor: isActive
                    ? withAlpha(typeMeta.color, 0.22)
                    : withAlpha(theme.text, 0.06),
                  borderColor: isActive
                    ? typeMeta.color
                    : withAlpha(theme.text, 0.15),
                  opacity:
                    pendingStage && pendingStage === option.value ? 0.6 : 1,
                },
              ]}
              onPress={() => onChangeStage(option.value)}
              disabled={pendingStage !== null}
            >
              <Text
                style={[
                  styles.stageChipText,
                  { color: isActive ? typeMeta.color : theme.text },
                ]}
              >
                {option.title}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={[styles.stageDescription, { color: theme.placeholder }]}>
        {stageMeta.description}
      </Text>
      <Text style={[styles.stageNudge, { color: theme.tint }]}>
        {stageMeta.nudge}
      </Text>

      {anonFavEnabled ? (
        <View
          style={[
            styles.favoriteSummary,
            {
              borderColor: theme.placeholder,
              backgroundColor: theme.background,
            },
          ]}
        >
          <TouchableOpacity
            onPress={() => {
              void onFavoritePress();
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}
            accessibilityRole="button"
            accessibilityState={anonFavLoading ? { busy: true } : undefined}
            disabled={anonFavLoading}
          >
            <Ionicons
              name={anonFavorited ? 'heart' : 'heart-outline'}
              size={18}
              color={anonFavorited ? '#ef4444' : theme.tint}
            />
            <Text style={[styles.favoriteSummaryText, { color: theme.text }]}> 
              {favoriteCount > 0
                ? t('wish.favoritesTitle', '{{count}} favorites', {
                    count: favoriteCount,
                  })
                : t('wish.favoritesBeFirst', 'Be the first to favorite')}
            </Text>
          </TouchableOpacity>
          {favoriteSampleNote ? (
            <Text style={[styles.favoriteQuote, { color: theme.placeholder }]}> 
              “{favoriteSampleNote}”
            </Text>
          ) : null}
        </View>
      ) : null}

      {wish.accountabilityCircleName ? (
        <View
          style={[
            styles.circleBanner,
            {
              borderColor: withAlpha(theme.tint, 0.4),
              backgroundColor: withAlpha(theme.tint, 0.08),
            },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.circleBannerTitle, { color: theme.tint }]}>
              👥 {wish.accountabilityCircleName}
            </Text>
            {circleLastCheckInAt ? (
              <Text
                style={[styles.circleBannerSubtitle, { color: theme.placeholder }]}
              >
                {t('wish.circleLastCheckIn', 'Last check-in {{time}} ago', {
                  time: formatDistanceToNow(new Date(circleLastCheckInAt)),
                })}
              </Text>
            ) : (
              <Text
                style={[styles.circleBannerSubtitle, { color: theme.placeholder }]}
              >
                {t(
                  'wish.circlePrompt',
                  'Keep the circle in the loop with short updates.',
                )}
              </Text>
            )}
          </View>
          {wish.accountabilityCircleId ? (
            <TouchableOpacity
              onPress={onCircleCheckIn}
              style={[styles.circleBannerButton, { borderColor: theme.tint }]}
              hitSlop={HIT_SLOP}
            >
              <Text
                style={[styles.circleBannerButtonText, { color: theme.tint }]}
              >
                {t('wish.circleLogCheckIn', 'Log check-in')}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <Text style={[styles.wishText, { color: theme.text }]}>{wish.text}</Text>
      {wish.fulfillmentLink && (
        <Text style={{ color: theme.tint, marginTop: 4 }}>💝 Fulfilled</Text>
      )}
      {wish.imageUrl && <Image source={{ uri: wish.imageUrl }} style={styles.preview} />}

      {wish.isPoll ? (
        <View style={{ marginTop: 8 }}>
          {(() => {
            const totalVotes = (wish.votesA || 0) + (wish.votesB || 0);
            const percentA = totalVotes
              ? Math.round(((wish.votesA || 0) / totalVotes) * 100)
              : 0;
            const percentB = totalVotes
              ? Math.round(((wish.votesB || 0) / totalVotes) * 100)
              : 0;
            return (
              <>
                <TouchableOpacity
                  style={styles.pollOption}
                  disabled={hasVoted}
                  onPress={() => onVote('A')}
                >
                  <Text style={[styles.pollOptionText, { color: theme.text }]}>
                    {wish.optionA} - {wish.votesA || 0} ({percentA}%)
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.pollOption}
                  disabled={hasVoted}
                  onPress={() => onVote('B')}
                >
                  <Text style={[styles.pollOptionText, { color: theme.text }]}>
                    {wish.optionB} - {wish.votesB || 0} ({percentB}%)
                  </Text>
                </TouchableOpacity>
                <Text style={{ color: theme.text, marginTop: 4 }}>
                  Total votes: {totalVotes}
                </Text>
              </>
            );
          })()}
          <BarChart
            data={{
              labels: [wish.optionA || 'A', wish.optionB || 'B'],
              datasets: [{ data: [wish.votesA || 0, wish.votesB || 0] }],
            }}
            width={Dimensions.get('window').width - 80}
            height={220}
            yAxisLabel=""
            yAxisSuffix=""
            fromZero
            chartConfig={{
              backgroundColor: theme.input,
              backgroundGradientFrom: theme.input,
              backgroundGradientTo: theme.input,
              color: () => theme.tint,
              labelColor: () => theme.placeholder,
            }}
            style={{ marginTop: 10 }}
          />
        </View>
      ) : (
        <Text style={[styles.likes, { color: theme.tint }]}>❤️ {wish.likes}</Text>
      )}

      {isBoosted && <Text style={styles.boostedLabel}>⏳ Time left: {timeLeft}</Text>}

      {wish.audioUrl && (
        <TouchableOpacity onPress={onToggleAudio} style={{ marginTop: 10 }}>
          <Text style={{ color: '#a78bfa' }}>
            {isPlaying ? '⏸ Pause Audio' : '▶ Play Audio'}
          </Text>
        </TouchableOpacity>
      )}

      {splitPayActive ? (
        <View style={[styles.splitPayCard, { backgroundColor: theme.input }]}> 
          <SplitPayProgressBar progress={progressPercent / 100} />
          {splitPayStatsText ? (
            <Text style={[styles.splitPayStats, { color: theme.text }]}>
              {splitPayStatsText}
            </Text>
          ) : null}
          {deadlineLabel ? (
            <Text style={[styles.splitPayDeadline, { color: theme.placeholder }]}> 
              {deadlineLabel}
            </Text>
          ) : null}
          {splitPayCtaLabel ? (
            canChipIn ? (
              <TouchableOpacity
                onPress={onOpenChipIn}
                style={[styles.splitPayButton, { backgroundColor: theme.tint }]}
              >
                <Text
                  style={[styles.splitPayButtonText, { color: theme.background }]}
                >
                  {splitPayCtaLabel}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text style={[styles.splitPayStatusText, { color: theme.placeholder }]}> 
                {splitPayCtaLabel}
              </Text>
            )
          ) : null}
          <View style={styles.splitPayActions}>
            {giftTogetherEnabled ? (
              <TouchableOpacity
                onPress={onOpenGiftTogether}
                style={[
                  styles.splitPaySecondaryButton,
                  { borderColor: theme.placeholder },
                ]}
                hitSlop={HIT_SLOP}
                accessibilityRole="button"
              >
                <Text style={[styles.splitPaySecondaryText, { color: theme.text }]}> 
                  🎁 Gift Together
                </Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={onShare}
              style={[
                styles.splitPaySecondaryButton,
                { borderColor: theme.placeholder },
              ]}
              hitSlop={HIT_SLOP}
              accessibilityRole="button"
            >
              <Text style={[styles.splitPaySecondaryText, { color: theme.text }]}> 
                Share link
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : hasFundingGoal ? (
        <View style={[styles.fundingCard, { backgroundColor: theme.input }]}> 
          <View
            style={[
              styles.fundingProgressOuter,
              { backgroundColor: theme.background },
            ]}
          >
            <View
              style={[
                styles.fundingProgressInner,
                {
                  width: `${fundingPercentDisplay}%`,
                  backgroundColor: theme.tint,
                },
              ]}
            />
          </View>
          <View style={styles.fundingInfoRow}>
            <Text
              style={[styles.fundingLabel, { color: theme.text }]}
              accessibilityLabel={t('wish.fundingProgress', {
                raised: legacyFundingRaised.toFixed(2),
                goal: legacyFundingGoal.toFixed(2),
              })}
            >
              {t('wish.fundingProgress', {
                raised: legacyFundingRaised.toFixed(2),
                goal: legacyFundingGoal.toFixed(2),
              })}
            </Text>
            <Text
              style={[styles.fundingPercent, { color: theme.placeholder }]}
              accessibilityLabel={t('wish.fundingPercent', {
                percent: fundingPercentDisplay,
              })}
            >
              {t('wish.fundingPercent', {
                percent: fundingPercentDisplay,
              })}
            </Text>
          </View>
          <Text
            style={[styles.fundingSupporters, { color: theme.placeholder }]}
            accessibilityLabel={
              legacySupporters > 0
                ? t('wish.fundingSupporters', { count: legacySupporters })
                : t('wish.fundingBeFirst', 'Be the first to chip in')
            }
          >
            {legacySupporters > 0
              ? t('wish.fundingSupporters', { count: legacySupporters })
              : t('wish.fundingBeFirst', 'Be the first to chip in')}
          </Text>
        </View>
      ) : null}

      {supportRequestAmount ? (
        <View
          style={[
            styles.supportCard,
            {
              backgroundColor: theme.input,
              borderColor: theme.tint,
            },
          ]}
        >
          <Text style={[styles.supportCardTitle, { color: theme.text }]}>
            {t('wish.supportRequestTitle', 'Support request: {{amount}}', {
              amount: formatCurrency(supportRequestAmount),
            })}
          </Text>
          {supportRequestReason ? (
            <Text style={[styles.supportCardText, { color: theme.text }]}> 
              {supportRequestReason}
            </Text>
          ) : null}
        </View>
      ) : null}

      {giftingEnabled && wish.giftLink ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: 8,
          }}
        >
          <TouchableOpacity
            onPress={() => onOpenGiftLink(wish.giftLink!)}
            style={{
              backgroundColor: theme.input,
              padding: 8,
              borderRadius: 8,
            }}
          >
            <Text style={{ color: theme.tint }}>{giftLinkLabel}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() =>
              Alert.alert(
                'Gift Info',
                'Gifting is anonymous and optional. You can attach a support link like Venmo or Stripe.',
              )
            }
            style={{ marginLeft: 6 }}
            hitSlop={HIT_SLOP}
          >
            <Ionicons
              name="information-circle-outline"
              size={16}
              color={theme.text}
            />
          </TouchableOpacity>
        </View>
      ) : null}

      {wish.userId && giftingEnabled ? (
        <GiftCTA
          wishId={wish.id}
          wishTitle={wish.text}
          recipientId={wish.userId}
          goalAmount={typeof wish.fundingGoal === 'number' ? wish.fundingGoal : null}
          currentGiftTotal={legacyFundingRaised}
          venmoRecipient={ownerVenmoHandle}
          isPrivate={
            legacyVisibilityWish.visibility === 'private' ||
            legacyVisibilityWish.shareScope === 'private' ||
            legacyVisibilityWish.isPrivate === true
          }
          onGiftConfirmed={onGiftConfirmed}
        />
      ) : null}

      {canBoost ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: 8,
          }}
        >
          <TouchableOpacity onPress={onBoostWish} hitSlop={HIT_SLOP}>
            <Text style={{ color: '#facc15' }}>Boost Wish</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() =>
              Alert.alert(
                'Boost Info',
                'Boosting highlights a wish for 24 hours.',
              )
            }
            style={{ marginLeft: 6 }}
            hitSlop={HIT_SLOP}
          >
            <Ionicons
              name="information-circle-outline"
              size={16}
              color={theme.text}
            />
          </TouchableOpacity>
        </View>
      ) : null}

      {isOwner ? (
        <View
          style={{
            flexDirection: 'row',
            marginTop: 8,
          }}
        >
          <TouchableOpacity onPress={onStartEdit} hitSlop={HIT_SLOP}>
            <Text style={{ color: theme.tint }}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onDeleteWish}
            style={{ marginLeft: 10 }}
            hitSlop={HIT_SLOP}
          >
            <Text style={{ color: '#f87171' }}>Delete</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <TouchableOpacity
        onPress={onReportWish}
        style={{ marginTop: 8 }}
        hitSlop={HIT_SLOP}
      >
        <Text style={{ color: '#f87171' }}>Report</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};
