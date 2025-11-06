// app/(tabs)/index.tsx — Full Home Screen with SafeArea, StatusBar, and Wish Logic
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import type { Href } from 'expo-router';
import { addWish } from '../../helpers/wishes';
// import { followUser, unfollowUser } from '../../helpers/followers';
// import { formatTimeLeft } from '../../helpers/time';
import { ref, getDownloadURL } from 'firebase/storage';
import * as Haptics from 'expo-haptics';
import * as Localization from 'expo-localization';
import { DailyQuoteBanner } from '@/components/DailyQuoteBanner';
import {
  addDoc,
  collection,
  serverTimestamp,
  getDocs,
  query,
  where,
  doc,
  getDoc,
  collectionGroup,
  Timestamp,
} from 'firebase/firestore';
import * as React from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StatusBar as RNStatusBar,
  SafeAreaView,
  Text,
  TouchableOpacity,
  View,
  RefreshControl,
  Modal,
  Animated,
  LayoutAnimation,
  ToastAndroid,
  AppState,
  AppStateStatus,
  NativeScrollEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from '@/contexts/I18nContext';
// import { Picker } from '@react-native-picker/picker';
import ReportDialog from '../../components/ReportDialog';
import { db, storage } from '../../firebase';
import type { Wish } from '../../types/Wish';
import { useAuthSession } from '@/contexts/AuthSessionContext';
import {
  getDailyPromptForDate,
  getTypePromptForDate,
} from '../../constants/prompts';
import * as logger from '@/shared/logger';
import { useWishComposer } from '@/hooks/useWishComposer';
import { normalizeWishScope } from '@/types/WishScope';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { useFeedLoader } from '@/hooks/useFeedLoader';
import WishCardComponent from '@/components/WishCard';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { HomeComposerSection } from '@/features/home/components/HomeComposerSection';
import type { HomeComposerSectionImpact } from '@/features/home/components/types';
import { resolvePlanBenefits } from '@/helpers/subscriptionPerks';
import { getLocalDateKey } from '@/helpers/date';
import { trackEvent } from '@/helpers/analytics';
import { optimizeImageForUpload } from '@/helpers/image';
import { uploadResumableWithProgress } from '@/helpers/storage';
import {
  enqueuePendingWish,
  flushPendingWishes as flushPendingWishesHelper,
  getQueueStatus,
} from '@/helpers/offlineQueue';
import { primeWishMeta } from '@/helpers/wishMeta';
import { FeedSkeleton } from '@/components/FeedSkeleton';
import { OfflineQueueBanner } from '@/components/home/OfflineQueueBanner';
import EngagementCard from '@/components/home/EngagementCard';
import { useEngagementStats } from '@/hooks/useEngagementStats';
import CommunityPulseCard from '@/components/home/CommunityPulseCard';
import { useCommunityPulse } from '@/hooks/useCommunityPulse';
import ActionPromptsCard, {
  ActionPrompt,
} from '@/components/home/ActionPromptsCard';
import { useSupporterThanks } from '@/hooks/useSupporterThanks';
import { SafetySupportCTA } from '@/components/SafetySupportCTA';
import { QuickActions } from '@/components/home/QuickActions';
import type { EngagementKind, MilestoneId } from '@/types/Engagement';
import type { PostType } from '@/types/post';
import {
  DEFAULT_POST_TYPE,
  normalizePostType,
  POST_TYPE_META,
} from '@/types/post';
import {
  getPreferredPostType,
  recordPostTypeUsage,
} from '@/helpers/postPreferences';
import {
  scheduleWishFollowUpReminder,
  ensureReminderChannel,
} from '@/helpers/reminders';
import { useAccountabilityCircles } from '@/hooks/useAccountabilityCircles';
import type { AccountabilityCircle } from '@/hooks/useAccountabilityCircles';
import { getSafetyConfig } from '@/helpers/safety';
import {
  DEFAULT_WISH_STAGE,
  WISH_STAGE_ORDER,
  type WishStage,
} from '@/types/WishStage';
import { useSafetySupportActions } from '@/hooks/useSafetySupportActions';
import type { QuickAction } from '@/types/QuickAction';

import { createHomeStyles } from '@/features/home/styles';
import type { HomeStyles } from '@/features/home/styles';

import {
  MAX_WISH_LENGTH,
  MAX_LINK_LENGTH,
  sanitizeInput,
  buildWishPayload,
  type WishPayloadInput,
} from '@/features/home/wishPayload';

// typeInfo removed; shared WishCard controls its styling

const milestoneFallback = (id: MilestoneId) => {
  const [kind, rawValue] = id.split('_');
  const value = Number(rawValue) || 0;
  switch (kind) {
    case 'posting':
      return value <= 1
        ? 'First wish posted!'
        : `Posting streak — ${value} days`;
    case 'gifting':
      return value <= 1
        ? 'First gift sent!'
        : `Gifting streak — ${value} supporters reached`;
    case 'fulfillment':
      return value <= 1
        ? 'First wish fulfilled!'
        : `Fulfillment streak — ${value} wishes completed`;
    default:
      return 'Milestone unlocked';
  }
};

const CAN_USE_NATIVE_DRIVER = Platform.OS !== 'web';

export default function Page() {
  const { user, profile } = useAuthSession();
  const { t } = useTranslation();
  const supporterPerks = React.useMemo(
    () =>
      resolvePlanBenefits(
        (key, defaultText) => t(key, { defaultValue: defaultText }),
        'supporter_monthly',
      ),
    [t],
  );
  const { stats: engagementStats, loading: engagementLoading } =
    useEngagementStats(user?.uid);
  const {
    boosts: pulseBoosts,
    fulfillments: pulseFulfillments,
    supporters: pulseSupporters,
    loading: pulseLoading,
  } = useCommunityPulse();
  const { items: supporterThanks } = useSupporterThanks(user?.uid);
  const stripeEnabled = profile?.giftingEnabled && profile?.stripeAccountId;
  const defaultScope = normalizeWishScope(
    profile?.defaultWishScope ??
      (profile?.anonModeEnabled ? 'anon' : 'all'),
  );
  const {
    wish,
    setWish,
    postType,
    setPostType,
    isPoll,
    setIsPoll,
    optionA,
    setOptionA,
    optionB,
    setOptionB,
    selectedImage,
    pickImage,
    giftLink,
    setGiftLink,
    giftType,
    setGiftType,
    giftLabel,
    setGiftLabel,
    supportAmount,
    setSupportAmount,
    supportReason,
    setSupportReason,
    stage,
    setStage,
    posting,
    setPosting,
    postConfirm,
    setPostConfirm,
    autoDelete,
    setAutoDelete,
    rephrasing,
    handleRephrase,
    updateStreak,
    postScope,
    setPostScope,
    showAdvanced,
    setShowAdvanced,
    enableExternalGift,
    setEnableExternalGift,
    fundingEnabled,
    setFundingEnabled,
    fundingGoal,
    setFundingGoal,
    fundingPresets,
    setFundingPresets,
    resetComposer,
  } = useWishComposer(stripeEnabled, { defaultScope });
  const {
    recordedUri,
    isRecording,
    includeAudio,
    setIncludeAudio,
    startRecording,
    stopRecording,
    reset: resetRecorder,
  } = useAudioRecorder();
  const {
    wishList,
    loading,
    error,
    refreshing,
    onRefresh,
    loadMore,
    loadingMore,
    hasMore,
    boostedCount,
    getNewerCount,
    surpriseWish,
    preferredType,
  } = useFeedLoader(user);
  const [reportVisible, setReportVisible] = React.useState(false);
  const [reportTarget, setReportTarget] = React.useState<string | null>(null);
  const { theme } = useTheme();
  const styles = React.useMemo<HomeStyles>(
    () => createHomeStyles(theme),
    [theme],
  );
  const [publicStatus, setPublicStatus] = React.useState<
    Record<string, boolean>
  >({});
  const [stripeAccounts, setStripeAccounts] = React.useState<
    Record<string, string | null>
  >({});
  const [followStatus, setFollowStatus] = React.useState<
    Record<string, boolean>
  >({});
  const [streakCount, setStreakCount] = React.useState(0);
  const [dailyPrompt, setDailyPrompt] = React.useState('');
  const [impact, setImpact] = React.useState<HomeComposerSectionImpact>({
    wishes: 0,
    boosts: 0,
    gifts: 0,
    giftTotal: 0,
  });
  const [uploadProgress, setUploadProgress] = React.useState<number | null>(
    null,
  );
  const [uploadStage, setUploadStage] = React.useState<
    'audio' | 'image' | null
  >(null);
  const [postError, setPostError] = React.useState<string | null>(null);
  const [persistedAudioUrl, setPersistedAudioUrl] = React.useState('');
  const [persistedImageUrl, setPersistedImageUrl] = React.useState('');
  const [draftLoaded, setDraftLoaded] = React.useState(false);
  const [draftSavedAt, setDraftSavedAt] = React.useState<number | null>(null);
  const [typePrompt, setTypePrompt] = React.useState('');
  const [offlinePostedCount, setOfflinePostedCount] = React.useState(0);
  const [hasPendingQueue, setHasPendingQueue] = React.useState(false);
  const [paywallOpen, setPaywallOpen] = React.useState(false);
  const [recentMilestone, setRecentMilestone] =
    React.useState<MilestoneId | null>(null);
  const {
    circles,
    circlesById,
    createCircle,
    recordCheckIn,
    loading: circlesLoading,
  } = useAccountabilityCircles();
  const [selectedCircleId, setSelectedCircleId] = React.useState<string | null>(
    null,
  );
  const [selectedCircleNameFallback, setSelectedCircleNameFallback] =
    React.useState<string | null>(null);
  const milestoneTimeoutRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const milestoneIgnoreRef = React.useRef<Set<MilestoneId>>(new Set());
  const milestoneHistoryRef = React.useRef<
    Record<EngagementKind, Set<MilestoneId>>
  >({
    posting: new Set(),
    gifting: new Set(),
    fulfillment: new Set(),
  });
  const milestonesHydratedRef = React.useRef(false);

  const promptOpacity = React.useRef(new Animated.Value(0)).current;
  const [quoteText, setQuoteText] = React.useState<string | null>(null);
  const [showQuote, setShowQuote] = React.useState(false);
  const [quoteStyle, setQuoteStyle] = React.useState<string | null>(null);
  const [quoteSource, setQuoteSource] = React.useState<string | null>(null);
  const lastAppState = React.useRef<AppStateStatus>(AppState.currentState);
  const { isActive: isSupporter } = useSubscription();
  const listRef = React.useRef<FlatList<Wish> | null>(null);
  // Work around React 19 + RN typing mismatch for ref on FlatList in some IDEs
  const FlatListAny = FlatList as unknown as any;
  const focusComposer = React.useCallback(() => {
    listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
  }, []);
  const [showScrollTop, setShowScrollTop] = React.useState(false);
  const [hasNewPosts, setHasNewPosts] = React.useState(false);
  const [newPostsCount, setNewPostsCount] = React.useState(0);
  const newBannerOpacity = React.useRef(new Animated.Value(0)).current;
  const newBannerTranslate = React.useRef(new Animated.Value(10)).current;
  const preferredPostTypeRef = React.useRef<PostType | null>(null);
  const draftLoadedRef = React.useRef(draftLoaded);
  const composerHasContentRef = React.useRef(false);
  React.useEffect(() => {
    if (postType === 'celebration' && stage !== 'celebrating') {
      setStage('celebrating');
    } else if (postType !== 'celebration' && stage === 'celebrating') {
      setStage(DEFAULT_WISH_STAGE);
    }
  }, [postType, stage, setStage]);

  React.useEffect(() => {
    preferredPostTypeRef.current = postType;
  }, [postType]);

  React.useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;
    const hydratePreferredType = async () => {
      if (draftLoadedRef.current) return;
      if (composerHasContentRef.current) return;
      try {
        const preferred = await getPreferredPostType(user.uid);
        if (cancelled || !preferred) return;
        if (draftLoadedRef.current || composerHasContentRef.current) return;
        preferredPostTypeRef.current = preferred;
        setPostType((current) =>
          current === DEFAULT_POST_TYPE ? preferred : current,
        );
      } catch (err) {
        logger.warn('Failed to hydrate preferred post type', err);
      }
    };
    void hydratePreferredType();
    return () => {
      cancelled = true;
    };
  }, [setPostType, user?.uid]);

  React.useEffect(() => {
    draftLoadedRef.current = draftLoaded;
  }, [draftLoaded]);

  React.useEffect(() => {
    composerHasContentRef.current =
      wish.trim().length > 0 ||
      !!selectedImage ||
      includeAudio ||
      giftLink.trim().length > 0 ||
      isPoll ||
      fundingEnabled;
  }, [fundingEnabled, giftLink, includeAudio, isPoll, selectedImage, wish]);

  const offlineStatusBanner = React.useMemo(
    () => (
      <OfflineQueueBanner
        hasPending={hasPendingQueue}
        pendingText={t(
          'offline.pendingQueue',
          'Posting saved wishes in background…',
        )}
        postedCount={offlinePostedCount}
        postedText={(count) =>
          count === 1
            ? t('offline.postedOne', 'Your saved wish was posted.')
            : t('offline.postedCount', { count })
        }
        pillColor={theme.input}
        cardColor={theme.input}
        textColor={theme.text}
      />
    ),
    [hasPendingQueue, offlinePostedCount, t, theme.input, theme.text],
  );

  const heroGreeting = React.useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return t('home.greetingMorning', 'Good morning');
    if (hour < 18) return t('home.greetingAfternoon', 'Good afternoon');
    return t('home.greetingEvening', 'Good evening');
  }, [t]);

  const heroName = React.useMemo(() => {
    if (profile?.displayName) {
      const first = profile.displayName.trim().split(' ')[0];
      if (first.length > 0) return first;
    }
    return t('home.friendFallback', 'friend');
  }, [profile?.displayName, t]);

  const quickActions = React.useMemo<QuickAction[]>(
    () => [
      {
        key: 'feed',
        label: t('home.quickActions.feed', 'Explore wishes'),
        description: t(
          'home.quickActions.feedDescription',
          'See what the community is sharing',
        ),
        icon: 'compass-outline',
        href: '/feed' as Href,
      },
      {
        key: 'journal',
        label: t('home.quickActions.journal', 'Daily journal'),
        description: t(
          'home.quickActions.journalDescription',
          'Reflect privately',
        ),
        icon: 'book-outline',
        href: '/journal' as Href,
      },
      {
        key: 'messages',
        label: t('home.quickActions.messages', 'Messages'),
        description: t(
          'home.quickActions.messagesDescription',
          'Catch up with friends',
        ),
        icon: 'chatbubble-ellipses-outline',
        href: '/(tabs)/messages' as Href,
      },
      {
        key: 'profile',
        label: t('home.quickActions.profile', 'Profile'),
        description: t(
          'home.quickActions.profileDescription',
          'Update your space',
        ),
        icon: 'person-circle-outline',
        href: '/(tabs)/profile' as Href,
      },
    ],
    [t],
  );

  const handleQuickAction = React.useCallback((action: QuickAction) => {
    if (action.onPress) {
      action.onPress();
      return;
    }
    if (action.href) {
      router.push(action.href);
    }
  }, []);

  const heroImpactSummary = React.useMemo(() => {
    const total = impact.wishes + impact.boosts + impact.gifts;
    if (total === 0) {
      return t(
        'home.heroImpactSummary.empty',
        'Start your story with today’s wish.',
      );
    }
    return t('home.heroImpactSummary.stats', {
      wishes: impact.wishes,
      boosts: impact.boosts,
      gifts: impact.gifts,
    });
  }, [impact.boosts, impact.gifts, impact.wishes, t]);
  const impactTotal = impact.wishes + impact.boosts + impact.gifts;
  const hasImpact = impactTotal > 0;
  const preferredFeedLabel = React.useMemo(() => {
    if (!preferredType) return null;
    const meta = POST_TYPE_META[preferredType];
    return t(`composer.type.${preferredType}`, meta.defaultLabel);
  }, [preferredType, t]);
  const safetyConfig = React.useMemo(
    () => getSafetyConfig(Localization.getLocales()[0]?.regionCode),
    [],
  );
  const selectedCircle = React.useMemo(
    () => (selectedCircleId ? (circlesById[selectedCircleId] ?? null) : null),
    [selectedCircleId, circlesById],
  );

  const lastSelectedCircleRef = React.useRef<AccountabilityCircle | null>(null);
  React.useEffect(() => {
    if (selectedCircle) {
      lastSelectedCircleRef.current = selectedCircle;
      setSelectedCircleNameFallback(selectedCircle.name);
    } else if (!selectedCircleId) {
      lastSelectedCircleRef.current = null;
      setSelectedCircleNameFallback(null);
    }
  }, [selectedCircle, selectedCircleId]);

  const fallbackCircleFromName = React.useMemo(() => {
    if (!selectedCircleId || !selectedCircleNameFallback) return null;
    return {
      id: selectedCircleId,
      name: selectedCircleNameFallback,
      cadenceDays: 1,
      createdAt: Date.now(),
    } as AccountabilityCircle;
  }, [selectedCircleId, selectedCircleNameFallback]);

  const circleForPayload =
    selectedCircle ?? lastSelectedCircleRef.current ?? fallbackCircleFromName;

  const { openResources, openEmergency } =
    useSafetySupportActions(safetyConfig);

  const handleRephrasePress = React.useCallback(() => {
    if (!isSupporter) {
      setPaywallOpen(true);
      return;
    }
    void handleRephrase();
  }, [handleRephrase, isSupporter]);

  const handleSetShowAdvanced = React.useCallback(
    (value: boolean) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setShowAdvanced(value);
    },
    [setShowAdvanced],
  );

  const handleSaveDraft = React.useCallback(async () => {
    try {
      const draft = {
        wish,
        postType,
        isPoll,
        optionA,
        optionB,
        includeAudio,
        giftLink,
        giftType,
        giftLabel,
        fundingEnabled,
        fundingGoal,
        fundingPresets,
        postScope,
        autoDelete,
        enableExternalGift,
        supportAmount,
        supportReason,
        persistedAudioUrl,
        persistedImageUrl,
        stage,
        circleId: selectedCircleId,
        manual: true,
        savedAt: Date.now(),
      };
      await AsyncStorage.setItem('pendingPost.v1', JSON.stringify(draft));
      setDraftLoaded(true);
      setDraftSavedAt(draft.savedAt);
      try {
        trackEvent('draft_saved', {
          has_image: !!(selectedImage || persistedImageUrl),
          has_audio: !!(recordedUri || persistedAudioUrl),
          text_length: wish.length,
        });
      } catch {}
      if (Platform.OS === 'android') {
        ToastAndroid.show(
          t('composer.draftSaved', 'Draft saved'),
          ToastAndroid.SHORT,
        );
      } else {
        Alert.alert(t('composer.draftSaved', 'Draft saved'));
      }
    } catch {}
  }, [
    autoDelete,
    enableExternalGift,
    fundingEnabled,
    fundingGoal,
    fundingPresets,
    giftLabel,
    giftLink,
    giftType,
    includeAudio,
    isPoll,
    optionA,
    optionB,
    persistedAudioUrl,
    persistedImageUrl,
    postType,
    recordedUri,
    selectedCircleId,
    selectedImage,
    stage,
    supportAmount,
    supportReason,
    t,
    postScope,
    wish,
  ]);

  const handleDiscardDraft = React.useCallback(async () => {
    const proceed = await new Promise<boolean>((resolve) => {
      Alert.alert(
        t('composer.discardConfirmTitle', 'Discard draft?'),
        t(
          'composer.discardConfirmMessage',
          'This will remove your saved draft.',
        ),
        [
          {
            text: t('common.cancel', 'Cancel'),
            style: 'cancel',
            onPress: () => resolve(false),
          },
          {
            text: t('composer.discardDraft', 'Discard'),
            style: 'destructive',
            onPress: () => resolve(true),
          },
        ],
      );
    });
    if (!proceed) return;
    try {
      await AsyncStorage.removeItem('pendingPost.v1');
    } catch {}
    setPersistedAudioUrl('');
    setPersistedImageUrl('');
    setDraftLoaded(false);
    setDraftSavedAt(null);
    resetRecorder();
    resetComposer(preferredPostTypeRef.current ?? DEFAULT_POST_TYPE);
    setPostError(null);
    setSelectedCircleId(null);
    try {
      trackEvent('draft_discarded', {
        had_image: !!(selectedImage || persistedImageUrl),
        had_audio: !!(recordedUri || persistedAudioUrl),
        text_length: wish.length,
      });
    } catch {}
  }, [
    preferredPostTypeRef,
    recordedUri,
    resetComposer,
    resetRecorder,
    selectedImage,
    persistedImageUrl,
    persistedAudioUrl,
    setPersistedAudioUrl,
    setPersistedImageUrl,
    setDraftLoaded,
    setDraftSavedAt,
    setPostError,
    setSelectedCircleId,
    t,
    wish,
  ]);

  const handlePaywallSubscribe = React.useCallback(() => {
    setPaywallOpen(false);
    router.push('/(tabs)/profile/settings/subscriptions' as Href);
  }, [setPaywallOpen]);

  if (!db || !storage) {
    logger.error('Firebase modules undefined in index page', { db, storage });
  }
  if (user === undefined) {
    logger.error('AuthContext returned undefined user');
  }

  // const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };

  // Stable renderer for FlatList items (defined at top-level for hooks rule)
  const renderItem = React.useCallback(
    ({ item, index }: { item: Wish; index: number }) => {
      const isFirst = index === 0;
      const startsRecent = boostedCount > 0 && index === boostedCount;
      const showBoostedLabel = isFirst && boostedCount > 0;
      const showRecentLabel = startsRecent;
      return (
        <View>
          {showBoostedLabel ? (
            <Text style={{ color: theme.placeholder, marginBottom: 6 }}>
              🚀 Boosted
            </Text>
          ) : null}
          {showRecentLabel ? (
            <Text style={{ color: theme.placeholder, marginVertical: 8 }}>
              🕒 Recent
            </Text>
          ) : null}
          <WishCardComponent
            wish={item}
            followed={!!followStatus[item.userId || '']}
            onReport={() => {
              setReportTarget(item.id);
              setReportVisible(true);
            }}
            onDeleted={handleWishDeletedRef.current}
          />
        </View>
      );
    },
    [followStatus, boostedCount, theme.placeholder],
  );

  // Offline queue helpers moved to helpers/offlineQueue

  // Listen for app foreground to pick up a new daily quote from the hook
  React.useEffect(() => {
    const loadBanner = async () => {
      try {
        const [lastShown, text, dismissedDate, style, source] =
          await Promise.all([
            AsyncStorage.getItem('dailyQuote.lastShown'),
            AsyncStorage.getItem('dailyQuote.textForToday'),
            AsyncStorage.getItem('dailyQuote.bannerDismissedDate'),
            AsyncStorage.getItem('dailyQuote.style'),
            AsyncStorage.getItem('dailyQuote.sourceForToday'),
          ]);
        const today = getLocalDateKey();
        if (lastShown === today && text && dismissedDate !== today) {
          setQuoteText(text);
          setShowQuote(true);
          setQuoteStyle(style);
          setQuoteSource(source);
        } else {
          setShowQuote(false);
          setQuoteStyle(null);
          setQuoteSource(null);
        }
      } catch (err) {
        logger.warn('Failed to load daily quote banner', err);
      }
    };

    const onChange = (state: AppStateStatus) => {
      if (lastAppState.current !== 'active' && state === 'active') {
        void loadBanner();
        void (async () => {
          const res = await flushPendingWishesHelper();
          if (res.posted > 0) setOfflinePostedCount(res.posted);
          setHasPendingQueue(res.remaining > 0);
        })();
        void (async () => {
          try {
            const cnt = await getNewerCount();
            setHasNewPosts(cnt > 0);
            setNewPostsCount(cnt);
          } catch {}
        })();
      }
      lastAppState.current = state;
    };

    const sub = AppState.addEventListener('change', onChange);
    void loadBanner();
    return () => sub.remove();
  }, [getNewerCount]);

  // Poll occasionally for new posts
  React.useEffect(() => {
    const id = setInterval(() => {
      void (async () => {
        try {
          const cnt = await getNewerCount();
          setHasNewPosts(cnt > 0);
          setNewPostsCount(cnt);
        } catch {}
      })();
    }, 45000);
    return () => clearInterval(id);
  }, [getNewerCount]);

  // Animate the new-posts banner in/out
  React.useEffect(() => {
    if (hasNewPosts) {
      Animated.parallel([
        Animated.timing(newBannerOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: CAN_USE_NATIVE_DRIVER,
        }),
        Animated.timing(newBannerTranslate, {
          toValue: 0,
          duration: 200,
          useNativeDriver: CAN_USE_NATIVE_DRIVER,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(newBannerOpacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: CAN_USE_NATIVE_DRIVER,
        }),
        Animated.timing(newBannerTranslate, {
          toValue: 10,
          duration: 180,
          useNativeDriver: CAN_USE_NATIVE_DRIVER,
        }),
      ]).start();
    }
  }, [hasNewPosts, newBannerOpacity, newBannerTranslate]);

  // Initialize queue status on mount
  React.useEffect(() => {
    const init = async () => {
      const s = await getQueueStatus();
      setHasPendingQueue(s.size > 0);
    };
    void init();
  }, []);
  // Load pending post to resume after restart
  React.useEffect(() => {
    const loadPending = async () => {
      try {
        const raw = await AsyncStorage.getItem('pendingPost.v1');
        if (!raw) return;
        setDraftLoaded(true);
        const p = JSON.parse(raw);
        if (typeof p?.wish === 'string') setWish(p.wish);
        if (p?.postType) setPostType(normalizePostType(p.postType));
        if (typeof p?.isPoll === 'boolean') setIsPoll(p.isPoll);
        if (typeof p?.optionA === 'string') setOptionA(p.optionA);
        if (typeof p?.optionB === 'string') setOptionB(p.optionB);
        if (typeof p?.giftLink === 'string') setGiftLink(p.giftLink);
        if (typeof p?.giftType === 'string') setGiftType(p.giftType);
        if (typeof p?.giftLabel === 'string') setGiftLabel(p.giftLabel);
        if (typeof p?.fundingEnabled === 'boolean')
          setFundingEnabled(p.fundingEnabled);
        if (typeof p?.fundingGoal === 'string') setFundingGoal(p.fundingGoal);
        if (typeof p?.fundingPresets === 'string')
          setFundingPresets(p.fundingPresets);
        if (typeof p?.postScope === 'string') {
          setPostScope(normalizeWishScope(p.postScope));
        } else if (typeof p?.useProfilePost === 'boolean') {
          setPostScope(p.useProfilePost ? 'all' : 'anon');
        }
        if (typeof p?.autoDelete === 'boolean') setAutoDelete(p.autoDelete);
        if (typeof p?.enableExternalGift === 'boolean')
          setEnableExternalGift(p.enableExternalGift);
        if (typeof p?.includeAudio === 'boolean')
          setIncludeAudio(p.includeAudio);
        if (typeof p?.supportAmount === 'string')
          setSupportAmount(p.supportAmount);
        if (typeof p?.supportReason === 'string')
          setSupportReason(p.supportReason);
        if (typeof p?.persistedAudioUrl === 'string')
          setPersistedAudioUrl(p.persistedAudioUrl);
        if (typeof p?.persistedImageUrl === 'string')
          setPersistedImageUrl(p.persistedImageUrl);
        if (typeof p?.savedAt === 'number') setDraftSavedAt(p.savedAt);
        if (
          typeof p?.stage === 'string' &&
          WISH_STAGE_ORDER.includes(p.stage as WishStage)
        ) {
          setStage(p.stage as WishStage);
        }
        if (typeof p?.circleId === 'string') {
          setSelectedCircleId(p.circleId);
        }
        if (typeof p?.circleName === 'string' && p.circleName.trim()) {
          setSelectedCircleNameFallback(p.circleName.trim());
        }
      } catch {
        // ignore
      }
    };
    void loadPending();
  }, [
    setWish,
    setPostType,
    setIsPoll,
    setOptionA,
    setOptionB,
    setGiftLink,
    setGiftType,
    setGiftLabel,
    setFundingEnabled,
    setFundingGoal,
    setFundingPresets,
    setPostScope,
    setAutoDelete,
    setEnableExternalGift,
    setIncludeAudio,
    setSupportAmount,
    setSupportReason,
    setStage,
    setSelectedCircleId,
  ]);

  // Continuously persist draft (lightweight fields only)
  React.useEffect(() => {
    const draftEmpty =
      !wish.trim() &&
      !selectedImage &&
      !includeAudio &&
      !isPoll &&
      !giftLink.trim() &&
      !giftType.trim() &&
      !giftLabel.trim() &&
      !fundingEnabled &&
      !fundingGoal.trim() &&
      !supportAmount.trim() &&
      !supportReason.trim();
    const save = async () => {
      try {
        if (draftEmpty) {
          await AsyncStorage.removeItem('pendingPost.v1');
          setDraftLoaded(false);
          setDraftSavedAt(null);
          return;
        }
        const draft = {
          wish,
          postType,
          isPoll,
          optionA,
          optionB,
          includeAudio,
          giftLink,
          giftType,
          giftLabel,
          fundingEnabled,
          fundingGoal,
          fundingPresets,
          postScope,
          autoDelete,
          enableExternalGift,
          supportAmount,
          supportReason,
          persistedAudioUrl,
          persistedImageUrl,
          stage,
          circleId: selectedCircleId,
          savedAt: Date.now(),
        };
        await AsyncStorage.setItem('pendingPost.v1', JSON.stringify(draft));
        setDraftLoaded(true);
        setDraftSavedAt(draft.savedAt);
      } catch {}
    };
    void save();
  }, [
    wish,
    postType,
    isPoll,
    optionA,
    optionB,
    includeAudio,
    giftLink,
    giftType,
    giftLabel,
    fundingEnabled,
    fundingGoal,
    fundingPresets,
    postScope,
    autoDelete,
    enableExternalGift,
    supportAmount,
    supportReason,
    persistedAudioUrl,
    persistedImageUrl,
    selectedImage,
    stage,
    selectedCircleId,
  ]);

  React.useEffect(() => {
    ensureReminderChannel();
  }, []);

  // Gentle haptic when banner becomes visible (kept here to avoid duplication)
  React.useEffect(() => {
    if (showQuote) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [showQuote]);

  const dismissQuoteBanner = async () => {
    try {
      const today = getLocalDateKey();
      await AsyncStorage.setItem('dailyQuote.bannerDismissedDate', today);
      // analytics: quote_dismissed (respect opt-out)
      const optOut = await AsyncStorage.getItem('analyticsOptOut');
      if (optOut !== 'true') {
        const style =
          quoteStyle ||
          (await AsyncStorage.getItem('dailyQuote.style')) ||
          'uplifting';
        const source =
          quoteSource ||
          (await AsyncStorage.getItem('dailyQuote.sourceForToday')) ||
          'unknown';
        trackEvent('quote_dismissed', { style, source });
      }
    } catch {}
    setShowQuote(false);
  };

  React.useEffect(() => {
    const loadImpact = async () => {
      if (!user?.uid) return;
      try {
        const snap = await getDocs(
          query(collection(db, 'wishes'), where('userId', '==', user.uid)),
        );
        const list = snap.docs.map((d) => d.data());
        const wishes = list.length;
        const boosts = list.filter((l) => l.boostedUntil).length;
        let gifts = 0;
        let giftTotal = 0;
        const giftSnap = await getDocs(
          query(
            collectionGroup(db, 'gifts'),
            where('recipientId', '==', user.uid),
          ),
        );
        giftSnap.forEach((g) => {
          gifts += 1;
          giftTotal += g.data().amount || 0;
        });
        setImpact({ wishes, boosts, gifts, giftTotal });
      } catch (err) {
        logger.error('Failed to load impact', err);
      }
    };
    loadImpact();
  }, [user]);

  React.useEffect(() => {
    const fetchStatus = async () => {
      const baseIds = wishList
        .map((w: Wish) => w.userId)
        .filter(
          (id: unknown): id is string =>
            typeof id === 'string' && id.length > 0,
        );
      const ids = Array.from<string>(new Set<string>(baseIds));
      try {
        await Promise.all(
          ids.map(async (id: string) => {
            if (
              publicStatus[id] === undefined ||
              stripeAccounts[id] === undefined
            ) {
              try {
                const snap = await getDoc(doc(db, 'users', id));
                if (publicStatus[id] === undefined) {
                  setPublicStatus((prev: Record<string, boolean>) => ({
                    ...prev,
                    [id]: snap.exists()
                      ? snap.data().publicProfileEnabled !== false
                      : false,
                  }));
                }
                if (stripeAccounts[id] === undefined) {
                  setStripeAccounts((prev: Record<string, string | null>) => ({
                    ...prev,
                    [id]: snap.exists()
                      ? snap.data().stripeAccountId || null
                      : null,
                  }));
                }
              } catch (err) {
                logger.warn('Failed to fetch user', err);
                if (publicStatus[id] === undefined) {
                  setPublicStatus((prev: Record<string, boolean>) => ({
                    ...prev,
                    [id]: false,
                  }));
                }
                if (stripeAccounts[id] === undefined) {
                  setStripeAccounts((prev: Record<string, string | null>) => ({
                    ...prev,
                    [id]: null,
                  }));
                }
              }
            }
          }),
        );
      } catch (err) {
        logger.error('Failed to fetch public status', err);
      }
    };
    fetchStatus();
  }, [wishList, publicStatus, stripeAccounts]);

  React.useEffect(() => {
    const fetchFollow = async () => {
      if (!user) return;
      const baseIds = wishList
        .map((w: Wish) => w.userId)
        .filter(
          (id: unknown): id is string =>
            typeof id === 'string' && id !== user.uid,
        );
      const ids = Array.from<string>(new Set<string>(baseIds));
      try {
        await Promise.all(
          ids.map(async (id: string) => {
            if (followStatus[id] === undefined) {
              try {
                const snap = await getDoc(
                  doc(db, 'users', user.uid, 'following', id),
                );
                setFollowStatus((prev: Record<string, boolean>) => ({
                  ...prev,
                  [id]: snap.exists(),
                }));
              } catch (err) {
                logger.warn('Failed to fetch follow status for', id, err);
                setFollowStatus((prev: Record<string, boolean>) => ({
                  ...prev,
                  [id]: false,
                }));
              }
            }
          }),
        );
      } catch (err) {
        logger.error('Failed to fetch follow status', err);
      }
    };
    fetchFollow();
  }, [wishList, user, followStatus]);

  React.useEffect(() => {
    const showWelcome = async () => {
      try {
        const seen = await AsyncStorage.getItem('seenWelcome');
        if (!seen) {
          Alert.alert(
            'Welcome to WhispList',
            'Share your wishes anonymously and tap a wish to read or comment.',
          );
          await AsyncStorage.setItem('seenWelcome', 'true');
        }
      } catch (err) {
        logger.error('Failed in showWelcome', err);
      }
    };
    showWelcome();
  }, []);

  React.useEffect(() => {
    const loadPromptAndStreak = async () => {
      try {
        const today = getLocalDateKey();
        const promptForToday = getDailyPromptForDate(today);
        promptOpacity.setValue(0);
        setDailyPrompt(promptForToday);
        if (promptForToday) {
          await AsyncStorage.multiSet([
            ['dailyPromptDate', today],
            ['dailyPromptText', promptForToday],
          ]);
        }
        Animated.timing(promptOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: CAN_USE_NATIVE_DRIVER,
        }).start();
      } catch (err) {
        logger.error('Failed to load daily prompt', err);
      }
    };

    loadPromptAndStreak();
  }, [promptOpacity]);

  React.useEffect(() => {
    const today = getLocalDateKey();
    setTypePrompt(getTypePromptForDate(postType, today));
  }, [postType]);

  const postingStats = engagementStats.posting;

  React.useEffect(() => {
    setStreakCount(postingStats.current);
  }, [postingStats]);

  React.useEffect(
    () => () => {
      if (milestoneTimeoutRef.current) {
        clearTimeout(milestoneTimeoutRef.current);
      }
    },
    [],
  );

  const announceMilestone = React.useCallback(
    (milestoneId: MilestoneId, source: 'local' | 'sync' = 'local') => {
      try {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      } catch {}
      setRecentMilestone(milestoneId);
      if (milestoneTimeoutRef.current) {
        clearTimeout(milestoneTimeoutRef.current);
      }
      milestoneTimeoutRef.current = setTimeout(() => {
        setRecentMilestone(null);
      }, 5500);
      try {
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
      } catch {}
      try {
        trackEvent('milestone_unlocked', { id: milestoneId, source });
      } catch {}
    },
    [setRecentMilestone],
  );

  const milestoneMessage = React.useMemo(() => {
    if (!recentMilestone) return null;
    const key = `home.milestones.${recentMilestone}`;
    return t(key, milestoneFallback(recentMilestone));
  }, [recentMilestone, t]);

  const daysSinceLastPost = React.useMemo(() => {
    const last = engagementStats.posting.lastDate;
    if (!last) return Number.POSITIVE_INFINITY;
    const lastMs = Date.parse(`${last}T00:00:00`);
    const todayMs = Date.parse(`${getLocalDateKey()}T00:00:00`);
    if (Number.isNaN(lastMs) || Number.isNaN(todayMs)) {
      return Number.POSITIVE_INFINITY;
    }
    return Math.max(0, Math.floor((todayMs - lastMs) / 86_400_000));
  }, [engagementStats.posting.lastDate]);

  const actionPrompts = React.useMemo(() => {
    const prompts: ActionPrompt[] = [];
    if (daysSinceLastPost >= 1 && daysSinceLastPost < 5) {
      prompts.push({
        key: 'streak-reminder',
        icon: '🔥',
        message: t(
          'home.prompts.streakMessage',
          'Share today to keep your streak alive.',
        ),
        cta: t('home.prompts.streakCta', 'Compose'),
        onPress: focusComposer,
      });
    }
    supporterThanks.slice(0, 2).forEach((entry, index) => {
      if (!entry.supporterId) return;
      prompts.push({
        key: `supporter-${entry.supporterId}-${index}`,
        icon: '💌',
        message: t(
          'home.prompts.supporterMessage',
          'Thank {{name}} for their gift.',
          {
            name: entry.supporterName,
          },
        ),
        cta: t('home.prompts.supporterCta', 'Send thanks'),
        onPress: () => {
          if (entry.wishId) {
            router.push(`/wish/${entry.wishId}` as Href);
          } else {
            router.push('/(tabs)/profile' as Href);
          }
        },
      });
    });
    return prompts;
  }, [daysSinceLastPost, supporterThanks, t, focusComposer]);

  React.useEffect(() => {
    const kinds: EngagementKind[] = ['posting', 'gifting', 'fulfillment'];
    if (!milestonesHydratedRef.current) {
      kinds.forEach((kind) => {
        const entry = engagementStats[kind];
        const ids = Object.keys(entry?.milestones ?? {}) as MilestoneId[];
        milestoneHistoryRef.current[kind] = new Set(ids);
      });
      milestonesHydratedRef.current = true;
      return;
    }

    kinds.forEach((kind) => {
      const entry = engagementStats[kind];
      const currentIds = new Set(
        Object.keys(entry?.milestones ?? {}) as MilestoneId[],
      );
      const previous = milestoneHistoryRef.current[kind];
      const newIds: MilestoneId[] = [];
      currentIds.forEach((id) => {
        if (!previous.has(id)) {
          newIds.push(id);
        }
      });
      if (newIds.length > 0) {
        const newest = newIds.reduce((best, candidate) => {
          const bestValue = Number(best.split('_')[1] || '0');
          const candidateValue = Number(candidate.split('_')[1] || '0');
          return candidateValue >= bestValue ? candidate : best;
        }, newIds[0]);
        if (milestoneIgnoreRef.current.has(newest)) {
          milestoneIgnoreRef.current.delete(newest);
        } else {
          announceMilestone(newest, 'sync');
        }
      }
      milestoneHistoryRef.current[kind] = currentIds;
    });
  }, [engagementStats, announceMilestone]);
  const handlePostWish = async () => {
    const sanitizedWish = sanitizeInput(wish);
    const sanitizedLink = sanitizeInput(giftLink);
    const sanitizedGiftType = sanitizeInput(giftType);
    const sanitizedGiftLabel = sanitizeInput(giftLabel);
    const sanitizedOptionA = sanitizeInput(optionA);
    const sanitizedOptionB = sanitizeInput(optionB);
    const sanitizedSupportAmount = sanitizeInput(supportAmount);
    const sanitizedSupportReason = sanitizeInput(supportReason).slice(0, 500);
    const submittedType = postType;
    const parsedFundingGoal = fundingGoal.trim();
    const fundingGoalValue = parsedFundingGoal
      ? Number(parsedFundingGoal.replace(/[^0-9.]/g, ''))
      : NaN;
    const fundingPresetValues = fundingPresets
      .split(',')
      .map((v) => Number(v.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    const parsedSupportAmount = sanitizedSupportAmount.replace(/[^0-9.]/g, '');
    const supportAmountNumber = parsedSupportAmount
      ? Number(parsedSupportAmount)
      : NaN;
    const supportAmountValue =
      Number.isFinite(supportAmountNumber) && supportAmountNumber > 0
        ? supportAmountNumber
        : NaN;
    const hasSupportAmount = sanitizedSupportAmount.length > 0;
    const hasSupportReason = sanitizedSupportReason.length > 0;

    if (sanitizedWish === '') return;
    if (sanitizedWish.length > MAX_WISH_LENGTH) {
      Alert.alert(
        t('composer.wishTooLongTitle', 'Wish too long'),
        t('composer.wishTooLong', { max: MAX_WISH_LENGTH }),
      );
      return;
    }
    if (sanitizedLink.length > MAX_LINK_LENGTH) {
      Alert.alert(
        t('composer.linkTooLongTitle', 'Link too long'),
        t('composer.linkTooLong', { max: MAX_LINK_LENGTH }),
      );
      return;
    }
    if (fundingEnabled) {
      if (!Number.isFinite(fundingGoalValue) || fundingGoalValue <= 0) {
        Alert.alert(
          t('composer.fundingGoalErrorTitle', 'Set a goal'),
          t(
            'composer.fundingGoalErrorBody',
            'Enter a positive goal amount to enable funding.',
          ),
        );
        return;
      }
    }

    if ((hasSupportAmount || hasSupportReason) && !stripeEnabled) {
      Alert.alert(
        t('composer.supportRequiresStripeTitle', 'Connect payouts first'),
        t(
          'composer.supportRequiresStripeBody',
          'Enable Stripe payouts in Settings to accept in-app support.',
        ),
      );
      return;
    }

    if (hasSupportAmount && Number.isNaN(supportAmountValue)) {
      Alert.alert(
        t('composer.supportAmountInvalidTitle', 'Check your amount'),
        t(
          'composer.supportAmountInvalidBody',
          'Enter a valid dollar amount like 25 or 25.50.',
        ),
      );
      return;
    }

    if (
      hasSupportAmount &&
      supportAmountValue > 0 &&
      supportAmountValue > 100000
    ) {
      Alert.alert(
        t('composer.supportAmountTooLargeTitle', 'Amount looks too large'),
        t('composer.supportAmountTooLargeBody', 'Try a number under $100,000.'),
      );
      return;
    }

    if (hasSupportAmount && !hasSupportReason) {
      Alert.alert(
        t('composer.supportReasonRequiredTitle', 'Add a short reason'),
        t(
          'composer.supportReasonRequiredBody',
          'Let supporters know why you need the funds.',
        ),
      );
      return;
    }

    if (!hasSupportAmount && hasSupportReason) {
      Alert.alert(
        t('composer.supportAmountMissingTitle', 'Add an amount'),
        t(
          'composer.supportAmountMissingBody',
          'Include a dollar amount so supporters know what to contribute.',
        ),
      );
      return;
    }

    if (!user) {
      setPostError(t('errors.authRequired', 'Please sign in before posting.'));
      return;
    }

    const expiresAt = autoDelete
      ? Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000))
      : undefined;

    const supportAllowed = Boolean(stripeEnabled);
    const includeSupportRequest =
      supportAllowed &&
      hasSupportAmount &&
      hasSupportReason &&
      Number.isFinite(supportAmountValue) &&
      supportAmountValue > 0;
    const normalizedStage: WishStage = WISH_STAGE_ORDER.includes(stage)
      ? stage
      : DEFAULT_WISH_STAGE;

    const basePayloadInput: WishPayloadInput = {
      text: sanitizedWish,
    type: submittedType,
    userId: user.uid,
    displayName: profile?.displayName,
    photoURL: profile?.photoURL,
    scope: postScope,
      stage: normalizedStage,
      accountabilityCircle: circleForPayload,
      accountabilityCircleId: circleForPayload?.id ?? selectedCircleId ?? null,
      accountabilityCircleName: circleForPayload?.name ?? null,
      enableExternalGift,
      giftLink: sanitizedLink,
      giftType: sanitizedGiftType,
      giftLabel: sanitizedGiftLabel,
      fundingEnabled,
      fundingGoalValue,
      fundingPresetValues,
      isPoll,
      optionA: sanitizedOptionA,
      optionB: sanitizedOptionB,
      autoDelete,
      expiresAt,
      supportAmountValue: includeSupportRequest ? supportAmountValue : NaN,
      supportReason: includeSupportRequest ? sanitizedSupportReason : '',
    };

    setPosting(true);
    setPostError(null);
    // Predeclare so we can persist in catch
    let audioUrl = persistedAudioUrl || '';
    let imageUrl = persistedImageUrl || '';
    try {
      if (sanitizedLink && !/^https?:\/\//.test(sanitizedLink)) {
        Alert.alert(
          t('composer.invalidLinkTitle', 'Invalid link'),
          t('composer.invalidLink'),
        );
        return;
      }
      if (includeAudio && recordedUri && !audioUrl) {
        const resp = await fetch(recordedUri);
        const blob = await resp.blob();
        const storageRef = ref(storage, `audio/${Date.now()}.m4a`);
        setUploadProgress(0);
        setUploadStage('audio');
        await uploadResumableWithProgress(storageRef, blob, undefined, (pct) =>
          setUploadProgress(pct),
        );
        audioUrl = await getDownloadURL(storageRef);
        setPersistedAudioUrl(audioUrl);
        setUploadProgress(null);
        setUploadStage(null);
      }
      if (selectedImage && !imageUrl) {
        const optimizedUri = await optimizeImageForUpload(selectedImage, {
          maxWidth: isSupporter ? 2048 : 1600,
          compress: isSupporter ? 0.85 : 0.7,
          format: 'jpeg',
        });
        const resp = await fetch(optimizedUri);
        const blob = await resp.blob();
        const imageRef = ref(storage, `images/${Date.now()}`);
        setUploadProgress(0);
        setUploadStage('image');
        await uploadResumableWithProgress(imageRef, blob, undefined, (pct) =>
          setUploadProgress(pct),
        );
        imageUrl = await getDownloadURL(imageRef);
        setPersistedImageUrl(imageUrl);
        setUploadProgress(null);
        setUploadStage(null);
      }
      const payload = buildWishPayload({
        ...basePayloadInput,
        audioUrl,
        imageUrl,
      });
      const createdDoc = await addWish(payload);
      scheduleWishFollowUpReminder({
        stage: normalizedStage,
        wishId: createdDoc.id,
        wishText: sanitizedWish,
      }).catch((err) => {
        logger.warn('Failed to schedule wish follow-up reminder', err);
      });

      try {
        const raw = await AsyncStorage.getItem('reflectionHistory');
        const history = raw ? JSON.parse(raw) : [];
        history.unshift({ text: sanitizedWish, timestamp: Date.now() });
        if (history.length > 7) history.splice(7);
        await AsyncStorage.setItem(
          'reflectionHistory',
          JSON.stringify(history),
        );
      } catch (err) {
        logger.error('Failed to save reflection history', err);
      }

      resetRecorder();
      if (selectedCircle?.id) {
        try {
          await recordCheckIn(selectedCircle.id);
        } catch (err) {
          logger.warn('Failed to record accountability circle check-in', err);
        }
      }
      resetComposer(submittedType);
      setSelectedCircleId(null);
      setPostConfirm(true);
      setUploadProgress(null);
      const streakResult = await updateStreak(user?.uid);
      setStreakCount(streakResult.current);
      if (streakResult.unlocked.length > 0) {
        const milestoneId = streakResult.unlocked[0];
        milestoneIgnoreRef.current.add(milestoneId);
        announceMilestone(milestoneId, 'local');
      }
      try {
        trackEvent('post_success', {
          offline: false,
          has_image: !!imageUrl,
          has_audio: !!audioUrl,
          text_length: sanitizedWish.length,
          link_length: sanitizedLink.length,
          post_type: submittedType,
        });
      } catch {}
      preferredPostTypeRef.current = submittedType;
      if (user?.uid) {
        void recordPostTypeUsage(user.uid, submittedType);
      }
      // Clear pending draft on success
      try {
        await AsyncStorage.removeItem('pendingPost.v1');
      } catch {}
      setPersistedAudioUrl('');
      setPersistedImageUrl('');
      setDraftSavedAt(null);
    } catch (error) {
      logger.error('❌ Failed to post wish:', error);
      const errorCode = (error as any)?.code;
      let message =
        (error as any)?.message ||
        t('errors.uploadFailed', 'Upload failed. Please try again.');
      const lowerMessage =
        typeof message === 'string' ? message.toLowerCase() : '';
      if (
        errorCode === 'permission-denied' ||
        lowerMessage.includes('permission')
      ) {
        if (!profile?.acceptedTermsAt) {
          message = t(
            'errors.permissionDeniedPostTerms',
            'Please accept the latest Terms in Settings before posting.',
          );
        } else {
          message = t(
            'errors.permissionDeniedPost',
            'Posting is disabled for your account right now. Contact support if you believe this is a mistake.',
          );
        }
      }
      setPostError(message);
      // Enqueue pending wish for background retry
      try {
        const retryPayload = buildWishPayload({
          ...basePayloadInput,
          audioUrl,
          imageUrl,
        }) as any;
        await enqueuePendingWish(retryPayload);
      } catch {}
      // Analytics
      try {
        trackEvent('post_failed', {
          has_image: !!persistedImageUrl,
          has_audio: !!persistedAudioUrl,
          text_length: sanitizedWish.length,
          link_length: sanitizedLink.length,
          error: (error as any)?.message,
          post_type: submittedType,
        });
      } catch {}
      // Save draft for later resume
      try {
        const draft = {
          wish: sanitizedWish,
          postType,
          isPoll,
          optionA: sanitizedOptionA,
          optionB: sanitizedOptionB,
          includeAudio,
          giftLink: sanitizedLink,
          giftType: sanitizedGiftType,
          giftLabel: sanitizedGiftLabel,
          fundingEnabled,
          fundingGoal,
          fundingPresets,
          postScope,
          autoDelete,
          enableExternalGift,
          supportAmount: sanitizedSupportAmount,
          supportReason: sanitizedSupportReason,
          persistedAudioUrl: audioUrl,
          persistedImageUrl: imageUrl,
          stage: normalizedStage,
          circleId: circleForPayload?.id ?? selectedCircleId,
          circleName: circleForPayload?.name ?? null,
          savedAt: Date.now(),
        };
        await AsyncStorage.setItem('pendingPost.v1', JSON.stringify(draft));
        setDraftSavedAt(draft.savedAt);
      } catch {}
    } finally {
      setPosting(false);
      setUploadProgress(null);
      setUploadStage(null);
    }
  };

  const composerProps: WishComposerProps = {
    wish,
    setWish,
    dailyPrompt,
    typePrompt,
    rephrasing,
    onRephrase: handleRephrasePress,
    postType,
    setPostType,
    showAdvanced,
    setShowAdvanced: handleSetShowAdvanced,
    isPoll,
    setIsPoll,
    optionA,
    setOptionA,
    optionB,
    setOptionB,
    includeAudio,
    setIncludeAudio,
    isRecording,
    startRecording,
    stopRecording,
    resetRecorder,
    stripeEnabled: !!stripeEnabled,
    enableExternalGift,
    setEnableExternalGift,
    fundingEnabled,
    setFundingEnabled,
    fundingGoal,
    setFundingGoal,
    fundingPresets,
    setFundingPresets,
    giftLink,
    setGiftLink,
    giftType,
    setGiftType,
    giftLabel,
    setGiftLabel,
    supportAmount,
    setSupportAmount,
    supportReason,
    setSupportReason,
    stage,
    setStage,
    circles,
    circlesLoading,
    selectedCircleId,
    onSelectCircle: setSelectedCircleId,
    onCreateCircle: createCircle,
    postScope,
    setPostScope,
    autoDelete,
    setAutoDelete,
    selectedImage,
    pickImage,
    posting,
    uploadProgress,
    uploadStage,
    errorText: postError,
    onRetry: handlePostWish,
    isDraftLoaded: draftLoaded,
    draftSavedAt,
    onSaveDraft: handleSaveDraft,
    onDiscardDraft: handleDiscardDraft,
    hasPendingQueue,
    onSubmit: handlePostWish,
    maxWishLength: MAX_WISH_LENGTH,
    maxLinkLength: MAX_LINK_LENGTH,
    isAuthenticated: !!user,
  };

  const handleReport = async (reason: string) => {
    if (!reportTarget) return;
    try {
      await addDoc(collection(db, 'reports'), {
        itemId: reportTarget,
        type: 'wish',
        reason,
        timestamp: serverTimestamp(),
      });
    } catch (err) {
      logger.error('❌ Failed to submit report:', err);
    } finally {
      setReportVisible(false);
      setReportTarget(null);
    }
  };

  const [removedWishIds, setRemovedWishIds] = React.useState<Set<string>>(
    new Set(),
  );
  const handleWishDeletedRef = React.useRef<(id: string) => void>(() => {});

  const filteredWishes = React.useMemo(
    () => wishList.filter((w) => !removedWishIds.has(w.id)),
    [wishList, removedWishIds],
  );

  React.useEffect(() => {
    setRemovedWishIds((prev) => {
      if (!prev.size) return prev;
      const next = new Set<string>();
      wishList.forEach((w) => {
        if (prev.has(w.id)) next.add(w.id);
      });
      return next.size === prev.size ? prev : next;
    });
  }, [wishList]);

  handleWishDeletedRef.current = (id: string) => {
    setRemovedWishIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const surpriseVisibleWish = React.useMemo(() => {
    if (!surpriseWish) return null;
    if (removedWishIds.has(surpriseWish.id)) return null;
    return surpriseWish;
  }, [surpriseWish, removedWishIds]);

  React.useEffect(() => {
    if (!user?.uid) return;
    wishList.slice(0, 25).forEach((wishItem) => {
      if (wishItem?.id && wishItem.userId === user.uid) {
        primeWishMeta(wishItem.id, wishItem.userId, user.uid);
      }
    });
  }, [wishList, user?.uid]);

  /*
  const WishCard: React.FC<{ item: Wish }> = ({ item }) => {
    const [timeLeft, setTimeLeft] = useState('');
    const [giftCount, setGiftCount] = useState(0);
    const [hasGiftMsg, setHasGiftMsg] = useState(false);
    const glowAnim = useRef(new Animated.Value(1)).current;
    const isBoosted =
      item.boostedUntil &&
      item.boostedUntil.toDate &&
      item.boostedUntil.toDate() > new Date();

    useEffect(() => {
      if (!item.id) return;
      const load = async () => {
        try {
          const snaps = await Promise.all([
            getDocs(collection(db, 'wishes', item.id, 'gifts')),
            getDocs(collection(db, 'gifts', item.id, 'gifts')),
          ]);
          let msg = false;
          snaps[0].forEach((d) => {
            if (d.data().message) msg = true;
          });
          setGiftCount(snaps[0].size + snaps[1].size);
          setHasGiftMsg(msg);
        } catch (err) {
          logger.warn('Failed to fetch gifts', err);
        }
      };
      load();
    }, [item.id]);

    useEffect(() => {
      if (!isBoosted || !item.boostedUntil) {
        setTimeLeft('');
        glowAnim.setValue(1);
        return;
      }
      const update = () =>
        setTimeLeft(formatTimeLeft(item.boostedUntil!.toDate()));
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
    }, [glowAnim, isBoosted, item.boostedUntil]);

    const borderColor = isBoosted ? '#facc15' : 'transparent';

    const canBoost =
      user &&
      item.userId === user.uid &&
      (!item.boostedUntil || item.boostedUntil.toDate() < new Date());

    const openGiftLink = (link: string) => {
      if (Platform.OS === 'ios') {
        Alert.alert('Gifts unavailable', 'Gifting is not available on iOS.');
        return;
      }
      Alert.alert(
        'How gifting works',
        'You will be taken to an external site to send your gift.',
        [
          {
            text: 'Continue',
            onPress: async () => {
              await WebBrowser.openBrowserAsync(link);
            },
          },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
    };

    const sendMoney = async (amount: number) => {
      if (!item.id || !item.userId) return;
      if (Platform.OS === 'ios') {
        Alert.alert('Gifts unavailable', 'Gifting is not available on iOS.');
        return;
      }
      Alert.alert('How gifting works', 'Your payment is processed securely.', [
        {
          text: 'Continue',
          onPress: async () => {
            try {
              const res = await createGiftCheckout(
                item.id!,
                amount,
                item.userId!,
                process.env.EXPO_PUBLIC_GIFT_SUCCESS_URL!,
                process.env.EXPO_PUBLIC_GIFT_CANCEL_URL!,
                user?.uid ?? null,
              );
              if (res.url) await WebBrowser.openBrowserAsync(res.url);
            } catch (err) {
              logger.error('Failed to checkout', err);
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    };

    const supportRequestAmount =
      typeof item.supportRequest?.amount === 'number' && item.supportRequest.amount > 0
        ? item.supportRequest.amount
        : null;
    const supportRequestReason =
      typeof item.supportRequest?.reason === 'string'
        ? item.supportRequest.reason.trim()
        : '';
    const supportStripeReady =
      !!supportRequestAmount &&
      profile?.giftingEnabled &&
      !!stripeAccounts[item.userId || ''];

    const formatCurrency = (value: number) =>
      new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 2,
      }).format(value);

    return (
      <Animated.View
        style={[
          styles.wishItem,
          {
            backgroundColor: typeInfo[item.type || 'wish'].color,
            borderColor,
            borderWidth: isBoosted ? 2 : 0,
            transform: [{ scale: isBoosted ? glowAnim : 1 }],
          },
        ]}
      >
        {item.giftLink && <Text style={styles.giftBadge}>🎁 Gifted</Text>}
        <TouchableOpacity
          onPress={() => router.push(`/wish/${item.id}`)}
          hitSlop={HIT_SLOP}
        >
          {!item.isAnonymous &&
            item.displayName &&
            publicStatus[item.userId || ''] && (
              <TouchableOpacity
                onPress={() => router.push(`/profile/${item.displayName}`)}
                hitSlop={HIT_SLOP}
              >
                <Text style={styles.author}>by {item.displayName}</Text>
              </TouchableOpacity>
            )}
          <Text style={{ color: '#a78bfa', fontSize: 12 }}>
            {typeInfo[item.type || 'wish'].emoji} #{item.category}{' '}
            {item.audioUrl ? '🔊' : ''}
          </Text>
          <Text style={styles.wishText}>{item.text}</Text>
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
                {t('home.supportRequestTitle', 'Support request: {{amount}}', {
                  amount: formatCurrency(supportRequestAmount),
                })}
              </Text>
              {supportRequestReason ? (
                <Text style={[styles.supportCardReason, { color: theme.text }]}>
                  {supportRequestReason}
                </Text>
              ) : null}
              {supportStripeReady ? (
                <TouchableOpacity
                  onPress={() => sendMoney(supportRequestAmount)}
                  style={[styles.supportCardButton, { backgroundColor: theme.tint }]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.supportCardButtonText, { color: theme.background }]}>
                    {t('home.supportRequestButton', 'Support with {{amount}}', {
                      amount: formatCurrency(supportRequestAmount),
                    })}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
          {item.imageUrl && (
            <Image source={{ uri: item.imageUrl }} style={styles.preview} />
          )}
          {item.isPoll ? (
            <View style={{ marginTop: 6 }}>
              <Text style={styles.pollText}>
                {item.optionA}: {item.votesA || 0}
              </Text>
              <Text style={styles.pollText}>
                {item.optionB}: {item.votesB || 0}
              </Text>
            </View>
          ) : (
            <Text style={styles.likeText}>❤️ {item.likes}</Text>
          )}
          {isBoosted && (
            <Text style={styles.boostedLabel}>
              ⏳ Boost expires in {timeLeft}
            </Text>
          )}
          {(item.giftLink || giftCount > 0) && (
            <Text style={styles.boostedLabel}>
              🎁 Supported by {giftCount} people
            </Text>
          )}
          {user?.uid === item.userId && hasGiftMsg && (
            <Text style={styles.boostedLabel}>
              💬 You received a gift message
            </Text>
          )}
          {profile?.giftingEnabled && item.giftLink && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginTop: 6,
              }}
            >
              <TouchableOpacity
                onPress={() => openGiftLink(item.giftLink!)}
                style={{
                  backgroundColor: theme.input,
                  padding: 6,
                  borderRadius: 6,
                }}
              >
                <Text style={{ color: theme.tint }}>
                  {(() => {
                    try {
                      const url = new URL(item.giftLink!);
                      const trusted = [
                        'venmo.com',
                        'paypal.me',
                        'amazon.com',
                      ].some((d) => url.hostname.includes(d));
                      return `${trusted ? '✅' : '⚠️'} 🎁 ${item.giftLabel || 'Send Gift'}`;
                    } catch {
                      return `⚠️ 🎁 ${item.giftLabel || 'Send Gift'}`;
                    }
                  })()}
                </Text>
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
          )}
          {profile?.giftingEnabled && stripeAccounts[item.userId || ''] && (
            <View style={{ flexDirection: 'row', marginTop: 4 }}>
              {[3, 5, 10].map((amt) => (
                <TouchableOpacity
                  key={amt}
                  onPress={() => sendMoney(amt)}
                  style={{
                    backgroundColor: theme.input,
                    padding: 6,
                    borderRadius: 6,
                    marginRight: 4,
                  }}
                >
                  <Text style={{ color: theme.tint }}>${amt}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </TouchableOpacity>

        {canBoost && (
          <View
            style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}
          >
            <TouchableOpacity
              onPress={() => router.push(`/boost/${item.id}`)}
              hitSlop={HIT_SLOP}
            >
              <Text style={{ color: '#facc15' }}>Boost 🚀</Text>
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
        )}

        {user && item.userId && user.uid !== item.userId && (
          <TouchableOpacity
            onPress={async () => {
              if (!user?.uid) return;
              if (!item.userId) return;

              const targetId = item.userId;

              if (followStatus[targetId]) {
                await unfollowUser(user.uid, targetId);
                setFollowStatus((prev) => ({ ...prev, [targetId]: false }));
              } else {
                await followUser(user.uid, targetId);
                setFollowStatus((prev) => ({ ...prev, [targetId]: true }));
              }
            }}
            style={{ marginTop: 4 }}
            hitSlop={HIT_SLOP}
          >
            <Text style={{ color: '#a78bfa' }}>
              {followStatus[item.userId] ? 'Unfollow' : 'Follow'}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={() => {
            setReportTarget(item.id);
            setReportVisible(true);
          }}
          style={{ marginTop: 4 }}
          hitSlop={HIT_SLOP}
        >
          <Text style={{ color: '#f87171' }}>Report</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };
*/

  try {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Modal
          visible={postConfirm}
          transparent
          animationType="fade"
          onRequestClose={() => setPostConfirm(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setPostConfirm(false)}
          >
            <View
              style={[styles.modalContent, { backgroundColor: theme.input }]}
            >
              <Text
                style={{
                  color: theme.text,
                  marginBottom: 10,
                  textAlign: 'center',
                }}
              >
                {t(
                  'postConfirm.sent',
                  '💭 Your wish has been sent into the world.',
                )}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setPostConfirm(false);
                  router.push('/feed' as Href);
                }}
                style={{ marginBottom: 10 }}
                accessibilityRole="button"
                accessibilityLabel={t('postConfirm.viewFeed', 'View in Feed')}
              >
                <Text style={{ color: theme.tint, textAlign: 'center' }}>
                  {t('postConfirm.viewFeed', 'View in Feed')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setPostConfirm(false)}
                accessibilityRole="button"
                accessibilityLabel={t(
                  'postConfirm.postAnother',
                  'Post another wish',
                )}
              >
                <Text style={{ color: theme.tint, textAlign: 'center' }}>
                  {t('postConfirm.postAnother', 'Post another wish')}
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
        <RNStatusBar
          barStyle={theme.name === 'dark' ? 'light-content' : 'dark-content'}
          backgroundColor={theme.background}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.container}
        >
          <FlatListAny
            ref={listRef}
            data={filteredWishes}
            keyExtractor={(item: Wish) => item.id}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            initialNumToRender={10}
            windowSize={5}
            maxToRenderPerBatch={10}
            updateCellsBatchingPeriod={50}
            removeClippedSubviews
            keyboardShouldPersistTaps="handled"
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            scrollEventThrottle={16}
            onScroll={({ nativeEvent }: { nativeEvent: NativeScrollEvent }) => {
              const y = nativeEvent.contentOffset.y;
              if (!showScrollTop && y > 300) setShowScrollTop(true);
              else if (showScrollTop && y <= 300) setShowScrollTop(false);
            }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            contentContainerStyle={styles.contentContainer}
            ListHeaderComponentStyle={styles.headerComponent}
            ListHeaderComponent={
              <View style={styles.headerContainer}>
                {showQuote && quoteText ? (
                  <DailyQuoteBanner
                    visible={showQuote}
                    text={quoteText}
                    styleName={quoteStyle || undefined}
                    onDismiss={dismissQuoteBanner}
                    onTurnOffToday={dismissQuoteBanner}
                    onOpenSettings={() => router.push('/settings' as Href)}
                  />
                ) : null}
                {milestoneMessage ? (
                  <View
                    style={[styles.milestoneToast, { borderColor: theme.tint }]}
                  >
                    <Text
                      style={[styles.milestoneTitle, { color: theme.tint }]}
                    >
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
                    {t(
                      'home.heroSubtitle',
                      'Share a wish or explore the community.',
                    )}
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
                  <Text
                    style={[
                      styles.heroImpactSummary,
                      { color: theme.placeholder },
                    ]}
                  >
                    {heroImpactSummary}
                  </Text>
                  {hasImpact ? (
                    <View style={styles.heroStatsRow}>
                      <View style={[styles.heroStat, styles.heroStatSpacing]}>
                        <Text
                          style={[styles.heroStatValue, { color: theme.text }]}
                        >
                          {impact.wishes}
                        </Text>
                        <Text
                          style={[
                            styles.heroStatLabel,
                            { color: theme.placeholder },
                          ]}
                        >
                          {t('home.heroStats.wishes', 'Wishes')}
                        </Text>
                      </View>
                      <View style={[styles.heroStat, styles.heroStatSpacing]}>
                        <Text
                          style={[styles.heroStatValue, { color: theme.text }]}
                        >
                          {impact.boosts}
                        </Text>
                        <Text
                          style={[
                            styles.heroStatLabel,
                            { color: theme.placeholder },
                          ]}
                        >
                          {t('home.heroStats.boosts', 'Boosts')}
                        </Text>
                      </View>
                      <View style={styles.heroStat}>
                        <Text
                          style={[styles.heroStatValue, { color: theme.text }]}
                        >
                          {impact.gifts}
                        </Text>
                        <Text
                          style={[
                            styles.heroStatLabel,
                            { color: theme.placeholder },
                          ]}
                        >
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
                    onSelect={handleQuickAction}
                  />
                  <View style={styles.safetyCardWrapper}>
                    <SafetySupportCTA
                      onPressResources={openResources}
                      onPressEmergency={
                        safetyConfig.emergencyUri ? openEmergency : undefined
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
                      <Text
                        style={[
                          styles.surpriseSubheading,
                          { color: theme.placeholder },
                        ]}
                      >
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
                      followed={
                        !!followStatus[surpriseVisibleWish.userId || '']
                      }
                      onReport={() => {
                        setReportTarget(surpriseVisibleWish.id);
                        setReportVisible(true);
                      }}
                      onDeleted={handleWishDeletedRef.current}
                    />
                  </View>
                ) : null}
                <View style={styles.sectionSpacing}>
                  <EngagementCard
                    stats={engagementStats}
                    loading={engagementLoading}
                  />
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
                  <View style={styles.sectionSpacing}>
                    {offlineStatusBanner}
                  </View>
                ) : null}
                {error ? (
                  <View
                    style={[styles.errorCard, { backgroundColor: theme.input }]}
                  >
                    <Text style={styles.errorText}>{error}</Text>
                    <TouchableOpacity
                      onPress={onRefresh}
                      accessibilityRole="button"
                      accessibilityLabel={t('common.retry', 'Retry loading')}
                      style={styles.errorButton}
                    >
                      <Text style={styles.errorButtonText}>
                        {t('common.retry', 'Retry')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
                <HomeComposerSection
                  styles={styles}
                  t={t}
                  composerProps={composerProps}
                  paywallOpen={paywallOpen}
                  onPaywallClose={() => setPaywallOpen(false)}
                  onPaywallSubscribe={handlePaywallSubscribe}
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
                  <View
                    style={[
                      styles.feedIntroText,
                      !hasNewPosts && { marginBottom: 0 },
                    ]}
                  >
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
                          ? ({
                              boxShadow: '0px 4px 12px rgba(0,0,0,0.1)',
                            } as const)
                          : styles.newPostsShadow,
                      ]}
                    >
                      <TouchableOpacity
                        onPress={async () => {
                          try {
                            await onRefresh();
                          } finally {
                            setHasNewPosts(false);
                            setNewPostsCount(0);
                            try {
                              await Haptics.impactAsync(
                                Haptics.ImpactFeedbackStyle.Light,
                              );
                            } catch {}
                          }
                        }}
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
                            : t(
                                'home.newPosts',
                                'New posts available — tap to refresh',
                              )}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          setHasNewPosts(false);
                          setNewPostsCount(0);
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel={t('common.dismiss', 'Dismiss')}
                        style={styles.newPostsDismiss}
                      >
                        <Ionicons
                          name="close"
                          size={16}
                          color={theme.background}
                        />
                      </TouchableOpacity>
                    </View>
                  </Animated.View>
                </View>
              </View>
            }
            ListEmptyComponent={
              loading ? (
                <View style={{ marginTop: 12 }}>
                  <FeedSkeleton />
                </View>
              ) : (
                <View style={{ alignItems: 'center', marginTop: 24 }}>
                  <Text style={styles.noResults}>
                    {t(
                      'home.noResults',
                      'No wishes here yet. Share one to start the conversation ✨',
                    )}
                  </Text>
                  <TouchableOpacity
                    onPress={() => router.push('/feed' as Href)}
                    style={{
                      marginTop: 12,
                      backgroundColor: theme.tint,
                      paddingVertical: 10,
                      paddingHorizontal: 16,
                      borderRadius: 8,
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t('home.explore', 'Explore wishes')}
                  >
                    <Text
                      style={{ color: theme.background, fontWeight: '600' }}
                    >
                      {t('home.explore', 'Explore wishes')}
                    </Text>
                  </TouchableOpacity>
                </View>
              )
            }
            ListFooterComponent={
              loadingMore ? (
                <ActivityIndicator
                  size="small"
                  color={theme.tint}
                  style={{ marginVertical: 16 }}
                />
              ) : !hasMore && filteredWishes.length > 0 ? (
                <Text
                  style={{
                    color: theme.placeholder,
                    textAlign: 'center',
                    marginVertical: 16,
                  }}
                >
                  {t('home.caughtUp', "You're all caught up ✨")}
                </Text>
              ) : null
            }
            renderItem={({ item, index }: { item: Wish; index: number }) =>
              renderItem({ item, index })
            }
          />
          {showScrollTop && (
            <TouchableOpacity
              onPress={() =>
                listRef.current?.scrollToOffset({ offset: 0, animated: true })
              }
              style={[
                {
                  position: 'absolute',
                  right: 16,
                  bottom: 24,
                  backgroundColor: theme.tint,
                  padding: 12,
                  borderRadius: 24,
                },
                Platform.OS === 'web'
                  ? ({ boxShadow: '0px 6px 16px rgba(0,0,0,0.12)' } as const)
                  : {
                      shadowColor: '#000',
                      shadowOpacity: 0.2,
                      shadowRadius: 6,
                      shadowOffset: { width: 0, height: 2 },
                      elevation: 3,
                    },
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('home.scrollTop', 'Scroll to top')}
            >
              <Ionicons name="arrow-up" size={20} color={theme.background} />
            </TouchableOpacity>
          )}
          <ReportDialog
            visible={reportVisible}
            onClose={() => {
              setReportVisible(false);
              setReportTarget(null);
            }}
            onSubmit={handleReport}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  } catch (err) {
    logger.error('Error rendering index page', err);
    return null;
  }
}
