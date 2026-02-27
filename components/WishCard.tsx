import React, {
  useCallback,
  useEffect,
  useState,
  useRef,
  useMemo,
} from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  Animated,
  Share,
  View,
  Alert,
  ActivityIndicator,
  Platform,
  ToastAndroid,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useSavedWishes } from '@/contexts/SavedWishesContext';
import type { Wish } from '../types/Wish';
import { updateWishReaction, deleteWish } from '../helpers/wishes';
import { db } from '../firebase';
import { doc, onSnapshot, Timestamp } from 'firebase/firestore';
import { formatTimeLeft } from '../helpers/time';
import { useAuthSession } from '@/contexts/AuthSessionContext';
import { ReactionBar, ReactionKey } from './ReactionBar';
import { useAnonFavorite } from '@/hooks/useAnonFavorite';
import { useWishStats } from '@/hooks/useWishStats';
import * as logger from '@/shared/logger';
import { useTranslation } from '@/contexts/I18nContext';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import * as Haptics from 'expo-haptics';
import { useWishMeta } from '@/hooks/useWishMeta';
import { SplitPayProgressBar } from '@/app/components/splitpay/ProgressBar';
import { formatCurrency } from '@/shared/numberFormat';
import {
  logCampaignShareComplete,
  logCampaignShareDismissed,
  logCampaignShareStart,
  logSplitPayShareClick,
} from '@/src/lib/analytics';
import { buildCampaignShareMessage } from '@/src/lib/campaignShare';
import { buildPublicWishUrl } from '@/src/lib/publicLinks';
import { trackEvent } from '@/helpers/analytics';
import {
  getPostTypeColor,
  normalizePostType,
  POST_TYPE_META,
} from '@/types/post';
import {
  WISH_STAGE_COPY,
  DEFAULT_WISH_STAGE,
  type WishStage,
} from '@/types/WishStage';
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext';

const moodColors: Record<string, string> = {
  '😢': '#f87171',
  '😐': '#94a3b8',
  '🙂': '#facc15',
  '😄': '#86efac',
};

const toReactionTotals = (
  reactions: Wish['reactions'],
): Record<ReactionKey, number> => ({
  pray: reactions?.pray ?? 0,
  lightbulb: reactions?.lightbulb ?? 0,
  hug: reactions?.hug ?? 0,
  heart: reactions?.heart ?? 0,
});

const hexToRgba = (input: string, alpha: number): string => {
  const hex = input.startsWith('#') ? input.slice(1) : input;
  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
      return `rgba(${r},${g},${b},${alpha})`;
    }
  }
  return input;
};

const MIN_PLEDGE_CENTS = 500;

export const WishCard: React.FC<{
  wish: Wish;
  onReport?: () => void;
  followed?: boolean;
  onDeleted?: (id: string) => void;
}> = ({ wish, onReport, followed, onDeleted }) => {
  const { theme } = useTheme();
  const router = useRouter();
  const { saved, toggleSave } = useSavedWishes();
  const { user } = useAuthSession();
  const { giftPot: giftPotEnabled } = useFeatureFlags();
  const { giftCount, hasGiftMessage, isSupporter, giftTotal } =
    useWishMeta(wish);
  const {
    enabled: anonFavEnabled,
    toggled: anonFavorited,
    loading: anonFavLoading,
    toggle: toggleAnonFavorite,
  } = useAnonFavorite(wish.id);
  const { stats: anonStats } = useWishStats(anonFavEnabled ? wish.id : null);

  const [timeLeft, setTimeLeft] = useState('');
  const [imgLoading, setImgLoading] = useState(true);
  const [userReaction, setUserReaction] = useState<ReactionKey | null>(null);
  const [reactionPending, setReactionPending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [optimisticSaved, setOptimisticSaved] = useState<boolean>(() =>
    wish.id ? !!saved[wish.id] : false,
  );
  const glowAnim = useRef(new Animated.Value(1)).current;
  const { t, i18n } = useTranslation();
  const commentCount = wish.commentCount ?? 0;
  const [optimisticTotals, setOptimisticTotals] = useState<
    Record<ReactionKey, number>
  >(() => toReactionTotals(wish.reactions));

  const handleAnonFavoritePress = useCallback(async () => {
    if (!wish.id || anonFavLoading) return;
    const next = !anonFavorited;
    const success = await toggleAnonFavorite(next);
    if (success) {
      trackEvent('favorite_toggled', {
        wish_id: wish.id,
        state: next ? 'on' : 'off',
      });
    }
  }, [anonFavLoading, anonFavorited, toggleAnonFavorite, wish.id]);

  const handleWishlistToggle = useCallback(async () => {
    if (!wish.id || savePending) return;
    const next = !optimisticSaved;
    setOptimisticSaved(next);
    setSavePending(true);
    try {
      await toggleSave(wish.id);
      if (Platform.OS === 'android') {
        ToastAndroid.show(
          next
            ? t('wishlist.toastAdded', 'Added to wishlist')
            : t('wishlist.toastRemoved', 'Removed from wishlist'),
          ToastAndroid.SHORT,
        );
      }
    } catch (err) {
      setOptimisticSaved(!next);
      logger.warn('Failed to toggle wishlist', err, { wishId: wish.id });
      if (Platform.OS === 'android') {
        ToastAndroid.show(
          t('wishlist.toastFailed', 'Unable to update wishlist'),
          ToastAndroid.SHORT,
        );
      }
    } finally {
      setSavePending(false);
    }
  }, [
    wish.id,
    savePending,
    optimisticSaved,
    toggleSave,
    t,
  ]);
  const legacyRaised = Math.max(
    typeof wish.fundingRaised === 'number' ? wish.fundingRaised : 0,
    typeof giftTotal === 'number' ? giftTotal : 0,
  );
  const legacySupporters = Math.max(
    typeof wish.fundingSupporters === 'number' ? wish.fundingSupporters : 0,
    giftCount ?? 0,
  );
  const splitPayActive =
    giftPotEnabled &&
    wish.splitPayEnabled === true &&
    typeof wish.targetAmount === 'number' &&
    wish.targetAmount > 0;
  const experimentBucket = giftPotEnabled ? 'split_pay_on' : 'split_pay_off';
  const currencyCode =
    typeof wish.fundingCurrency === 'string' ? wish.fundingCurrency : 'USD';
  const targetAmountCents = splitPayActive
    ? Math.max(0, wish.targetAmount ?? 0)
    : Math.round(
        (typeof wish.fundingGoal === 'number' ? wish.fundingGoal : 0) * 100,
      );
  const fundedAmountCents = splitPayActive
    ? Math.max(0, typeof wish.fundedAmount === 'number' ? wish.fundedAmount : 0)
    : Math.round(legacyRaised * 100);
  const supportersCount = splitPayActive
    ? Math.max(
        0,
        typeof wish.fundingSupporters === 'number' ? wish.fundingSupporters : 0,
      )
    : legacySupporters;
  const remainingCents =
    targetAmountCents > 0
      ? Math.max(targetAmountCents - fundedAmountCents, 0)
      : null;
  const progressPercentRaw =
    targetAmountCents > 0
      ? Math.min(100, (fundedAmountCents / targetAmountCents) * 100)
      : 0;
  const displayPercent = Math.round(progressPercentRaw);
  let splitPayStatsText = '';
  if (splitPayActive) {
    splitPayStatsText = `${formatCurrency(fundedAmountCents / 100, currencyCode)} of ${formatCurrency(
      targetAmountCents / 100,
      currencyCode,
    )}`;
    if (supportersCount > 0) {
      splitPayStatsText += ` • ${supportersCount} ${supportersCount === 1 ? 'friend' : 'friends'} chipped in`;
    }
    if (typeof remainingCents === 'number' && remainingCents > 0) {
      splitPayStatsText += ` • ${formatCurrency(remainingCents / 100, currencyCode)} to go`;
    }
  }
  const splitPayStatus = (wish.status as string | undefined) ?? 'open';
  const canChipIn =
    splitPayActive &&
    splitPayStatus !== 'fulfilled' &&
    splitPayStatus !== 'expired';
  const splitPayCtaLabel = !splitPayActive
    ? ''
    : splitPayStatus === 'fulfilled'
      ? 'Funded!'
      : splitPayStatus === 'expired'
        ? 'Funding closed'
        : typeof remainingCents === 'number' &&
            remainingCents > 0 &&
            remainingCents <= 1500
          ? `Only ${formatCurrency(remainingCents / 100, currencyCode)} left`
          : `Chip in ${formatCurrency(MIN_PLEDGE_CENTS / 100, currencyCode)}`;

  useEffect(() => {
    if (savePending) return;
    setOptimisticSaved(wish.id ? !!saved[wish.id] : false);
  }, [savePending, saved, wish.id]);
  const timeLabel = useMemo(() => {
    const ts = wish.timestamp as Timestamp | Date | undefined | null;
    let date: Date | null = null;
    if (!ts) {
      date = null;
    } else if (
      'toDate' in (ts as any) &&
      typeof (ts as any).toDate === 'function'
    ) {
      date = (ts as any).toDate();
    } else if (ts instanceof Date) {
      date = ts;
    }
    if (!date) return '';
    const localeCode = i18n.language?.split('-')[0];
    const locale = localeCode === 'es' ? es : undefined;
    return formatDistanceToNow(date, { addSuffix: true, locale });
  }, [wish.timestamp, i18n.language]);

  const isBoosted =
    wish.boostedUntil &&
    wish.boostedUntil.toDate &&
    wish.boostedUntil.toDate() > new Date();

  useEffect(() => {
    setImgLoading(true);
  }, [wish.imageUrl]);

  useEffect(() => {
    setOptimisticTotals(toReactionTotals(wish.reactions));
  }, [wish.reactions]);

  useEffect(() => {
    if (!user?.uid || !wish.id) return;
    const ref = doc(db, 'reactions', wish.id, 'users', user.uid);
    const unsub = onSnapshot(ref, (snap) => {
      setUserReaction(
        snap.exists() ? (snap.data().emoji as ReactionKey) : null,
      );
    });
    return unsub;
  }, [user?.uid, wish.id]);

  useEffect(() => {
    if (!isBoosted || !wish.boostedUntil) {
      setTimeLeft('');
      glowAnim.setValue(1);
      return;
    }
    const update = () =>
      setTimeLeft(formatTimeLeft(wish.boostedUntil!.toDate()));
    update();
    const id = setInterval(update, 60000);
    glowAnim.setValue(1);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1.04,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      clearInterval(id);
      loop.stop();
      glowAnim.setValue(1);
    };
  }, [isBoosted, wish.boostedUntil, glowAnim]);

  const normalizedType = normalizePostType(wish.type);
  const typeMeta = POST_TYPE_META[normalizedType];
  const borderColor =
    moodColors[wish.mood || ''] ||
    getPostTypeColor(normalizedType) ||
    theme.tint;
  const bgTint = `${borderColor}33`;
  const stage: WishStage =
    wish.stage && WISH_STAGE_COPY[wish.stage as WishStage]
      ? (wish.stage as WishStage)
      : DEFAULT_WISH_STAGE;
  const stageMeta = WISH_STAGE_COPY[stage];

  const handleReact = useCallback(
    async (key: ReactionKey) => {
      if (!wish.id || reactionPending) return;
      if (!user?.uid) {
        router.push('/auth');
        return;
      }
      const prevReaction = userReaction;
      const nextReaction = prevReaction === key ? null : key;
      const prevTotals = { ...optimisticTotals } as Record<ReactionKey, number>;
      const updatedTotals = { ...prevTotals } as Record<ReactionKey, number>;
      if (prevReaction) {
        updatedTotals[prevReaction] = Math.max(
          0,
          (updatedTotals[prevReaction] ?? 0) - 1,
        );
      }
      if (nextReaction) {
        updatedTotals[nextReaction] = (updatedTotals[nextReaction] ?? 0) + 1;
      }

      setUserReaction(nextReaction);
      setOptimisticTotals(updatedTotals);
      setReactionPending(true);

      try {
        await updateWishReaction(wish.id, key, user.uid);
      } catch (err) {
        logger.warn('Failed to react', err);
        setUserReaction(prevReaction);
        setOptimisticTotals(prevTotals);
      } finally {
        setReactionPending(false);
      }
    },
    [wish, user?.uid, userReaction, reactionPending, router, optimisticTotals],
  );

  const handleShare = useCallback(async () => {
    if (!wish.id) return;
    const shareUrl = buildPublicWishUrl(
      wish.id,
      splitPayActive ? { splitpay: 1 } : undefined,
    );
    try {
      logCampaignShareStart({
        wishId: wish.id,
        surface: 'wish_card',
        withSplitPay: splitPayActive,
      });
      const result = await Share.share({
        message: buildCampaignShareMessage({
          creatorName: wish.displayName,
          wishTitle: wish.text,
          url: shareUrl,
        }),
      });
      if (result.action === Share.sharedAction) {
        logCampaignShareComplete({
          wishId: wish.id,
          surface: 'wish_card',
          withSplitPay: splitPayActive,
        });
      } else if (result.action === Share.dismissedAction) {
        logCampaignShareDismissed({
          wishId: wish.id,
          surface: 'wish_card',
          withSplitPay: splitPayActive,
        });
      }
      if (splitPayActive) {
        logSplitPayShareClick({
          wishId: wish.id,
          experiment: experimentBucket,
        });
      }
    } catch (err) {
      logger.warn('Failed to share wish', err);
    }
  }, [experimentBucket, splitPayActive, wish.displayName, wish.id, wish.text]);

  const performDelete = useCallback(async () => {
    if (!wish.id || deleting) return;
    try {
      setDeleting(true);
      await deleteWish(wish.id);
      onDeleted?.(wish.id);
      if (Platform.OS === 'android') {
        ToastAndroid.show(
          t('wish.deleteSuccess', 'Wish deleted'),
          ToastAndroid.SHORT,
        );
      } else {
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => {});
      }
    } catch (err) {
      logger.warn('Failed to delete wish', err);
      if (Platform.OS === 'android') {
        ToastAndroid.show(
          t('wish.deleteFailed', 'Could not delete wish'),
          ToastAndroid.SHORT,
        );
      } else {
        Alert.alert(
          t('common.error', 'Something went wrong'),
          t('wish.deleteFailed', 'Could not delete wish'),
        );
      }
    } finally {
      setDeleting(false);
    }
  }, [wish.id, deleting, onDeleted, t]);

  const handleDelete = useCallback(() => {
    if (!wish.id) return;
    const confirmMessage = t('wish.deleteConfirm', 'Are you sure?');
    if (Platform.OS === 'web') {
      const approved =
        typeof globalThis !== 'undefined' &&
        typeof (globalThis as any).confirm === 'function'
          ? (globalThis as any).confirm(confirmMessage)
          : true;
      if (approved) {
        void performDelete();
      }
      return;
    }
    Alert.alert(t('common.delete'), confirmMessage, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          void performDelete();
        },
      },
    ]);
  }, [wish.id, performDelete, t]);

  const boostedStyle = isBoosted
    ? Platform.OS === 'web'
      ? {
          transform: [{ scale: glowAnim }],
          boxShadow: '0px 0px 18px ' + hexToRgba(theme.tint, 0.35),
        }
      : {
          transform: [{ scale: glowAnim }],
          shadowColor: theme.tint,
          shadowOpacity: 0.35,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 0 },
          elevation: 6,
        }
    : { transform: [{ scale: 1 }] };

  return (
    <Animated.View
      style={[
        styles.card,
        { backgroundColor: bgTint, borderLeftColor: borderColor },
        boostedStyle,
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => router.push(`/wish/${wish.id}`)}
      >
        {!wish.isAnonymous && wish.displayName && (
          <TouchableOpacity
            onPress={() => router.push(`/profile/${wish.displayName}`)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={[styles.author, { color: theme.text }]}>
              @{wish.displayName} {isSupporter ? '⭐' : ''}
            </Text>
          </TouchableOpacity>
        )}
        {followed && (
          <Text style={[styles.followTag, { color: theme.tint }]}>
            👥 {t('wish.followed')}
          </Text>
        )}
        <View style={styles.metaRow} accessibilityRole="text">
          <View
            style={[
              styles.typeTag,
              {
                borderColor,
                backgroundColor: hexToRgba(borderColor, 0.12),
              },
            ]}
          >
            <Text style={[styles.typeTagText, { color: borderColor }]}>
              {t(`composer.type.${normalizedType}`, typeMeta.defaultLabel)}
            </Text>
          </View>
          <View
            style={[
              styles.stageTag,
              {
                backgroundColor: hexToRgba(borderColor, 0.1),
                borderColor: borderColor,
              },
            ]}
          >
            <Text style={[styles.stageTagText, { color: borderColor }]}>
              {stageMeta.title}
            </Text>
          </View>
          <Text style={[styles.category, { color: theme.tint }]}>
            #{wish.category}
          </Text>
          {isBoosted && (
            <View style={[styles.boostTag, { backgroundColor: theme.tint }]}>
              <Text
                style={{
                  color: theme.background,
                  fontSize: 11,
                  fontWeight: '700',
                }}
              >
                🚀 Boosted
              </Text>
            </View>
          )}
          {!!timeLabel && (
            <Text
              style={[styles.timeLabel, { color: theme.placeholder }]}
              accessibilityLabel={t('wish.timeAgo', '{{time}}', {
                time: timeLabel,
              })}
            >
              • {t('wish.timeAgo', '{{time}}', { time: timeLabel })}
            </Text>
          )}
        </View>
        <Text style={[styles.text, { color: theme.text }]}>{wish.text}</Text>
        {wish.imageUrl && (
          <View style={{ position: 'relative' }}>
            {/* Skeleton overlay while image loads */}
            <ExpoImage
              source={wish.imageUrl}
              style={styles.preview}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={200}
              priority="low"
              onLoadStart={() => setImgLoading(true)}
              onLoadEnd={() => setImgLoading(false)}
            />
            {imgLoading && (
              <View
                style={[
                  styles.previewOverlay,
                  Platform.OS === 'web' && ({ pointerEvents: 'none' } as const),
                ]}
                {...(Platform.OS === 'web' ? {} : { pointerEvents: 'none' })}
              >
                <ActivityIndicator color={theme.tint} />
              </View>
            )}
          </View>
        )}
      </TouchableOpacity>
      {splitPayActive ? (
        <View
          style={[styles.fundingContainer, { backgroundColor: theme.input }]}
        >
          <SplitPayProgressBar progress={progressPercentRaw / 100} />
          <View style={styles.fundingInfoRow}>
            <Text style={[styles.fundingLabel, { color: theme.text }]}>
              {splitPayStatsText}
            </Text>
            <Text
              style={[styles.fundingPercent, { color: theme.placeholder }]}
              accessibilityLabel={t('wish.fundingPercent', {
                percent: displayPercent,
              })}
            >
              {t('wish.fundingPercent', { percent: displayPercent })}
            </Text>
          </View>
          <Text
            style={[styles.fundingSupporters, { color: theme.placeholder }]}
          >
            {supportersCount > 0
              ? t('wish.fundingSupporters', { count: supportersCount })
              : t('wish.fundingBeFirst', 'Be the first to chip in')}
          </Text>
          <TouchableOpacity
            onPress={() =>
              wish.id && router.push(`/wish/${wish.id}?splitpay=1` as Href)
            }
            style={[styles.fundingButton, { backgroundColor: theme.tint }]}
            accessibilityRole="button"
            disabled={!canChipIn}
          >
            <Text
              style={[styles.fundingButtonText, { color: theme.background }]}
            >
              {splitPayCtaLabel}
            </Text>
          </TouchableOpacity>
        </View>
      ) : typeof wish.fundingGoal === 'number' && wish.fundingGoal > 0 ? (
        <View
          style={[styles.fundingContainer, { backgroundColor: theme.input }]}
        >
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
                  width: `${progressPercentRaw}%`,
                  backgroundColor: theme.tint,
                },
              ]}
            />
          </View>
          <View style={styles.fundingInfoRow}>
            <Text
              style={[styles.fundingLabel, { color: theme.text }]}
              accessibilityLabel={t('wish.fundingProgress', {
                raised: legacyRaised.toFixed(2),
                goal: wish.fundingGoal.toFixed(2),
              })}
            >
              {t('wish.fundingProgress', {
                raised: legacyRaised.toFixed(2),
                goal: wish.fundingGoal.toFixed(2),
              })}
            </Text>
            <Text
              style={[styles.fundingPercent, { color: theme.placeholder }]}
              accessibilityLabel={t('wish.fundingPercent', {
                percent: displayPercent,
              })}
            >
              {t('wish.fundingPercent', { percent: displayPercent })}
            </Text>
          </View>
          <Text
            style={[styles.fundingSupporters, { color: theme.placeholder }]}
          >
            {supportersCount > 0
              ? t('wish.fundingSupporters', { count: supportersCount })
              : t('wish.fundingBeFirst', 'Be the first to chip in')}
          </Text>
          <TouchableOpacity
            onPress={() => wish.id && router.push(`/wish/${wish.id}` as Href)}
            style={[styles.fundingButton, { backgroundColor: theme.tint }]}
            accessibilityRole="button"
          >
            <Text
              style={[styles.fundingButtonText, { color: theme.background }]}
            >
              {t('wish.fundingCta', 'Chip in')}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <View style={styles.actionRow}>
        <ReactionBar
          counts={optimisticTotals}
          userReaction={userReaction}
          onReact={handleReact}
          onToggleSave={handleWishlistToggle}
          isSaved={optimisticSaved}
          disabled={reactionPending}
          hideSaveButton
        />
        <TouchableOpacity
          onPress={handleWishlistToggle}
          style={[
            styles.inlineWishlistButton,
            {
              borderColor: theme.input,
              backgroundColor: optimisticSaved ? theme.input : 'transparent',
              opacity: savePending ? 0.6 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityState={{
            disabled: savePending || !wish.id,
            selected: optimisticSaved,
          }}
          disabled={savePending || !wish.id}
        >
          <Ionicons
            name={optimisticSaved ? 'checkmark' : 'add'}
            size={16}
            color={theme.tint}
          />
          <Text style={[styles.inlineWishlistLabel, { color: theme.tint }]}>
            {optimisticSaved
              ? t('wishlist.inlineAdded', 'Added')
              : t('wishlist.inlineAdd', 'Add to wishlist')}
          </Text>
        </TouchableOpacity>
        {anonFavEnabled ? (
          <TouchableOpacity
            onPress={handleAnonFavoritePress}
            style={[styles.iconButton, styles.buttonSpacing]}
            accessibilityRole="button"
            accessibilityState={anonFavLoading ? { busy: true } : undefined}
            disabled={anonFavLoading}
          >
            <View style={styles.commentButtonContent}>
              <Ionicons
                name={anonFavorited ? 'heart' : 'heart-outline'}
                size={20}
                color={anonFavorited ? '#ef4444' : theme.tint}
              />
              {(anonStats.favorites > 0 || anonFavorited) && (
                <Text
                  style={[
                    styles.commentCountText,
                    { color: anonFavorited ? '#ef4444' : theme.tint },
                  ]}
                >
                  {anonStats.favorites}
                </Text>
              )}
            </View>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          onPress={() =>
            wish.id &&
            router.push({
              pathname: `/wish/${wish.id}`,
              params: { comment: '1' },
            })
          }
          style={[styles.iconButton, styles.buttonSpacing]}
          testID="comment-button"
          accessibilityRole="button"
          accessibilityLabel={t('wish.comment', 'Comment')}
        >
          <View style={styles.commentButtonContent}>
            <Ionicons name="chatbubble-outline" size={20} color={theme.tint} />
            {commentCount > 0 && (
              <Text style={[styles.commentCountText, { color: theme.tint }]}>
                {commentCount}
              </Text>
            )}
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleShare}
          style={[styles.iconButton, styles.buttonSpacing]}
          testID="share-button"
        >
          <Ionicons name="share-outline" size={20} color={theme.tint} />
        </TouchableOpacity>
      </View>
      {isBoosted && (
        <Text style={[styles.boostLabel, { color: theme.tint }]}>
          ⏳ {t('wish.boostExpires', { timeLeft })}
        </Text>
      )}
      {(wish.giftLink || giftCount > 0) && (
        <Text style={[styles.giftInfo, { color: theme.tint }]}>
          🎁 {t('wish.supportedBy', { count: giftCount })}
        </Text>
      )}
      {user?.uid === wish.userId && hasGiftMessage && (
        <Text style={[styles.giftInfo, { color: theme.tint }]}>
          💬 {t('wish.giftMessageReceived')}
        </Text>
      )}
      {wish.expiresAt && (
        <Text style={{ color: theme.tint, marginTop: 4 }}>
          ⏳{' '}
          {(() => {
            const ts = wish.expiresAt.toDate();
            const diff = ts.getTime() - Date.now();
            const hrs = Math.max(0, Math.ceil(diff / 3600000));
            return t('wish.hoursLeft', { hours: hrs });
          })()}
        </Text>
      )}
      {user?.uid === wish.userId && (
        <TouchableOpacity
          onPress={handleDelete}
          style={styles.reportButton}
          disabled={deleting}
          accessibilityState={deleting ? { disabled: true } : undefined}
        >
          {deleting ? (
            <ActivityIndicator size="small" color="#f87171" />
          ) : (
            <Text style={[styles.reactionText, { color: '#f87171' }]}>
              {t('common.delete')}
            </Text>
          )}
        </TouchableOpacity>
      )}
      {onReport && (
        <TouchableOpacity onPress={onReport} style={styles.reportButton}>
          <Text style={[styles.reactionText, { color: '#f87171' }]}>
            {t('wish.report')}
          </Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
  },
  category: {
    fontSize: 12,
    fontWeight: '600',
    marginRight: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  typeTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 6,
    marginBottom: 4,
  },
  typeTagText: {
    fontSize: 11,
    fontWeight: '600',
  },
  stageTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 6,
    marginBottom: 4,
  },
  stageTagText: {
    fontSize: 11,
    fontWeight: '600',
  },
  timeLabel: {
    fontSize: 12,
    marginLeft: 6,
  },
  text: {
    fontSize: 16,
  },
  preview: {
    width: '100%',
    height: 200,
    borderRadius: 10,
    marginTop: 8,
  },
  previewOverlay: {
    position: 'absolute',
    top: 8,
    left: 0,
    right: 0,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionText: {
    fontSize: 18,
  },
  boostLabel: {
    marginTop: 4,
    fontSize: 12,
  },
  boostTag: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 999,
    marginLeft: 6,
  },
  author: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  followTag: {
    fontSize: 12,
    marginBottom: 4,
  },
  giftInfo: {
    marginTop: 4,
    fontSize: 12,
  },
  fundingContainer: {
    padding: 12,
    borderRadius: 12,
    marginTop: 10,
    marginBottom: 6,
  },
  fundingProgressOuter: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 8,
  },
  fundingProgressInner: {
    height: 8,
    borderRadius: 999,
  },
  fundingInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  fundingLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  fundingPercent: {
    fontSize: 12,
    fontWeight: '600',
  },
  fundingSupporters: {
    fontSize: 12,
    marginTop: 2,
  },
  fundingButton: {
    marginTop: 8,
    paddingVertical: 8,
    borderRadius: 999,
    alignItems: 'center',
  },
  fundingButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  reportButton: {
    marginTop: 4,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  iconButton: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  buttonSpacing: {
    marginLeft: 4,
  },
  commentButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  commentCountText: {
    fontSize: 14,
    fontWeight: '600',
  },
  inlineWishlistButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    marginLeft: 4,
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  inlineWishlistLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
});

export default React.memo(WishCard);
