// app/wish/[id].tsx — detail view of a single wish
import { formatDistanceToNow } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { createPlayer, type AudioPlayer } from 'expo-audio';
import {
  getWish,
  setFulfillmentLink,
  updateWish,
  deleteWish,
} from '../../helpers/wishes';
import { recordEngagementEvent } from '@/helpers/engagement';
import {
  listenWishComments,
  addComment,
  updateComment,
  deleteComment,
  updateCommentReaction,
  type Comment,
} from '../../helpers/comments';

import {
  addDoc,
  collection,
  serverTimestamp,
  increment,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  collectionGroup,
  updateDoc,
  setDoc,
  Timestamp,
} from 'firebase/firestore'; // ✅ Keep only if used directly in this file

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  Switch,
  View,
  Dimensions,
  Alert,
  RefreshControl,
  ScrollView,
  Modal,
  Linking as RNLinking,
  Share,
  ToastAndroid,
  LayoutAnimation,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from '@/contexts/I18nContext';
import { BarChart } from 'react-native-chart-kit';
import ReportDialog from '../../components/ReportDialog';
import FulfillmentLinkDialog from '../../components/FulfillmentLinkDialog';
import { db } from '../../firebase';
import type { Wish } from '../../types/Wish';
import { useAuthSession } from '@/contexts/AuthSessionContext';
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext';
import { trackEvent } from '@/helpers/analytics';
import { useWishMeta } from '@/hooks/useWishMeta';
import { clearWishMetaCache } from '@/helpers/wishMeta';
import * as logger from '@/shared/logger';
import { POST_TYPE_META, normalizePostType } from '@/types/post';
import { useWishStages } from '@/hooks/useWishStages';
import type { WishStage } from '@/types/WishStage';
import { useAccountabilityCircles } from '@/hooks/useAccountabilityCircles';
import { GiftCTA } from '@/src/features/gifting/GiftCTA';
import { ChipInModal } from '@/app/components/splitpay/ChipInModal';
import { SplitPayProgressBar } from '@/app/components/splitpay/ProgressBar';
import { GiftTogetherModal } from '@/app/components/splitpay/GiftTogetherModal';
import { formatCurrency } from '@/shared/numberFormat';
import { logSplitPayShareClick, logSplitPayView } from '@/src/lib/analytics';
import { ANALYTICS_EVENTS } from '@/src/lib/analytics/events';
import { useAnonFavorite } from '@/hooks/useAnonFavorite';
import { useWishStats } from '@/hooks/useWishStats';
import { appConfig } from '@/appConfig';
import { SimilarWhispsSection } from '@/components/SimilarWhispsSection';
import {
  listenWishMatches,
  refreshWishMatches,
  type WishMatch,
  type WishMatchMeta,
} from '@/services/WishMatcher';
import { recordRecentWishlistView } from '@/src/features/wishlist/recentService';

const formatTimeLeft = (d: Date) => {
  const ms = d.getTime() - Date.now();
  if (ms <= 0) return '0h';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
};

const emojiOptions = ['❤️', '😂', '😢', '👍'];
// Approximate height of a single comment item including margins
const COMMENT_ITEM_HEIGHT = 80;
const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };
const MIN_PLEDGE_CENTS = 500;

const CAN_USE_NATIVE_DRIVER = Platform.OS !== 'web';

const withAlpha = (input: string, alpha: number): string => {
  if (!input) return `rgba(255,255,255,${alpha})`;
  if (input.startsWith('#')) {
    const hex = input.replace('#', '');
    const bigint = Number.parseInt(hex.length === 3 ? hex.repeat(2) : hex, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }
  if (input.startsWith('rgb')) {
    return input.replace(/rgba?\(([^)]+)\)/, (_match, values) => {
      const parts = values.split(',').map((v: string) => v.trim());
      const [r, g, b] = parts;
      return `rgba(${r},${g},${b},${alpha})`;
    });
  }
  return input;
};

export default function Page() {
  const params = useLocalSearchParams<{
    id: string;
    gift?: string;
    comment?: string;
    splitpay?: string;
  }>();
  const { id } = params as any;
  const router = useRouter();
  const { theme } = useTheme();
  const { t: tr } = useTranslation();
  const [wish, setWish] = useState<Wish | null>(null);
  const normalizedType = React.useMemo(
    () => normalizePostType(wish?.type),
    [wish?.type],
  );
  const typeMeta = POST_TYPE_META[normalizedType];
  const {
    stage,
    stageMeta,
    options: stageOptions,
    changeStage,
  } = useWishStages(wish);
  const [pendingStage, setPendingStage] = useState<WishStage | null>(null);
  const { recordCheckIn: recordCircleCheckIn, circlesById } =
    useAccountabilityCircles();
  const circleMeta = React.useMemo(
    () =>
      wish?.accountabilityCircleId
        ? (circlesById[wish.accountabilityCircleId] ?? null)
        : null,
    [wish?.accountabilityCircleId, circlesById],
  );
  const {
    enabled: anonFavEnabled,
    toggled: anonFavorited,
    loading: anonFavLoading,
    toggle: toggleAnonFavorite,
  } = useAnonFavorite(wish?.id ?? null);
  const { stats: anonStats } = useWishStats(
    anonFavEnabled && wish?.id ? wish.id : null,
  );
  const [favoriteModalVisible, setFavoriteModalVisible] = useState(false);
  const [favoriteNote, setFavoriteNote] = useState('');
  const [sampleNoteIndex, setSampleNoteIndex] = useState(0);
  const supportRequestAmount =
    typeof wish?.supportRequest?.amount === 'number' &&
    wish.supportRequest.amount > 0
      ? wish.supportRequest.amount
      : null;
  const supportRequestReason =
    typeof wish?.supportRequest?.reason === 'string'
      ? wish.supportRequest.reason.trim()
      : '';
  const handleStageChange = useCallback(
    async (nextStage: WishStage) => {
      if (!wish?.id || nextStage === stage) return;
      setPendingStage(nextStage);
      try {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      } catch {
        // Layout animation may fail on Android if not enabled; ignore.
      }
      try {
        await changeStage(nextStage);
        setWish((prev) =>
          prev && prev.id === wish.id
            ? {
                ...prev,
                stage: nextStage,
                stageUpdatedAt: Timestamp.now(),
              }
            : prev,
        );
      } catch (err) {
        logger.warn('Stage update failed', err);
      } finally {
        setPendingStage(null);
      }
    },
    [wish, changeStage, stage],
  );

  const handleCircleCheckIn = useCallback(async () => {
    if (!wish?.accountabilityCircleId) return;
    try {
      await recordCircleCheckIn(wish.accountabilityCircleId);
      Alert.alert(
        tr('wish.circleCheckInSuccessTitle', 'Check-in logged'),
        tr(
          'wish.circleCheckInSuccessBody',
          'We will remind you when the next cadence hits.',
        ),
      );
    } catch (err) {
      logger.warn('Circle check-in failed', err);
      Alert.alert(
        tr('wish.circleCheckInFailureTitle', 'Could not log check-in'),
        tr('wish.circleCheckInFailureBody', 'Please try again in a moment.'),
      );
    }
  }, [wish?.accountabilityCircleId, recordCircleCheckIn, tr]);
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState<Comment[]>([]);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<{
    type: 'wish' | 'comment';
    id: string;
  } | null>(null);
  const [reportVisible, setReportVisible] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const [fulfillmentVisible, setFulfillmentVisible] = useState(false);
  const [chipInVisible, setChipInVisible] = useState(false);
  const [giftTogetherVisible, setGiftTogetherVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [player, setPlayer] = useState<AudioPlayer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [postingComment, setPostingComment] = useState(false);
  const [useProfileComment, setUseProfileComment] = useState(true);
  const [nickname, setNickname] = useState('');
  const [owner, setOwner] = useState<any | null>(null);
  const [publicStatus, setPublicStatus] = useState<Record<string, boolean>>({});
  const [verifiedStatus, setVerifiedStatus] = useState<Record<string, boolean>>(
    {},
  );
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const { user, profile } = useAuthSession();
  const { giftPot: giftPotEnabled } = useFeatureFlags();
  const experimentBucket = giftPotEnabled ? 'split_pay_on' : 'split_pay_off';
  const [giftBanner, setGiftBanner] = useState<string | null>(null);
  const wishMatcherEnabled = appConfig.features.wishMatcher;
  const [similarWhisps, setSimilarWhisps] = useState<WishMatch[]>([]);
  const [wishMatchMeta, setWishMatchMeta] = useState<WishMatchMeta | null>(
    null,
  );
  const [wishMatchStatus, setWishMatchStatus] = useState<
    'idle' | 'loading' | 'ready' | 'empty' | 'error'
  >('idle');
  const [wishMatchError, setWishMatchError] = useState<string | null>(null);
  const commentInputRef = useRef<TextInput | null>(null);
  const analyticsFlags = useRef({
    viewLogged: false,
    fulfilledLogged: false,
    expiredLogged: false,
  });
  const autoScrollRef = useRef(false);
  const [shouldFocusComposer, setShouldFocusComposer] = useState(false);
  const [commentSuccess, setCommentSuccess] = useState<string | null>(null);
  const successOpacity = useRef(new Animated.Value(0)).current;
  const { giftCount: metaGiftCount, giftTotal: metaGiftTotal } =
    useWishMeta(wish);

  useEffect(() => {
    const notes = anonStats.sampleNotes;
    if (!notes.length) {
      setSampleNoteIndex(0);
      return;
    }
    setSampleNoteIndex((prev) => (prev >= notes.length ? 0 : prev));
    const interval = setInterval(() => {
      setSampleNoteIndex((prev) => (prev + 1) % notes.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [anonStats.sampleNotes]);

  const favoriteSampleNote = React.useMemo(() => {
    const notes = anonStats.sampleNotes;
    if (!notes.length) return null;
    return notes[sampleNoteIndex % notes.length] ?? null;
  }, [anonStats.sampleNotes, sampleNoteIndex]);

  const handleFavoritePress = useCallback(async () => {
    if (!anonFavEnabled || !wish?.id) return;
    if (anonFavorited) {
      const success = await toggleAnonFavorite(false);
      if (success) {
        trackEvent('favorite_toggled', { wish_id: wish.id, state: 'off' });
      }
      return;
    }
    setFavoriteNote('');
    setFavoriteModalVisible(true);
  }, [anonFavEnabled, anonFavorited, toggleAnonFavorite, wish?.id]);

  const handleFavoriteConfirm = useCallback(async () => {
    if (!wish?.id) return;
    const success = await toggleAnonFavorite(true, { note: favoriteNote });
    if (success) {
      trackEvent('favorite_toggled', { wish_id: wish.id, state: 'on' });
      setFavoriteModalVisible(false);
      setFavoriteNote('');
    }
  }, [favoriteNote, toggleAnonFavorite, wish?.id]);
  useEffect(() => {
    if (!wish?.id) return;
    const active =
      giftPotEnabled &&
      wish.splitPayEnabled === true &&
      typeof wish.targetAmount === 'number' &&
      wish.targetAmount > 0;
    if (active && !analyticsFlags.current.viewLogged) {
      logSplitPayView({
        wishId: wish.id,
        amount:
          typeof wish.fundedAmount === 'number'
            ? wish.fundedAmount / 100
            : undefined,
        experiment: experimentBucket,
      });
      analyticsFlags.current.viewLogged = true;
    }
    if (
      active &&
      wish.status === 'fulfilled' &&
      !analyticsFlags.current.fulfilledLogged
    ) {
      trackEvent(ANALYTICS_EVENTS.FUNDING_COMPLETED, { wishId: wish.id });
      analyticsFlags.current.fulfilledLogged = true;
    }
    if (
      active &&
      wish.status === 'expired' &&
      !analyticsFlags.current.expiredLogged
    ) {
      trackEvent(ANALYTICS_EVENTS.DEADLINE_PASSED, { wishId: wish.id });
      analyticsFlags.current.expiredLogged = true;
    }
  }, [
    experimentBucket,
    giftPotEnabled,
    wish?.fundedAmount,
    wish?.id,
    wish?.splitPayEnabled,
    wish?.status,
    wish?.targetAmount,
  ]);
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    if (!wishMatcherEnabled || !wish?.id) {
      setSimilarWhisps([]);
      setWishMatchMeta(null);
      setWishMatchStatus('idle');
      setWishMatchError(null);
      return () => {};
    }

    setWishMatchStatus('loading');
    setWishMatchError(null);

    unsubscribe = listenWishMatches(
      wish.id,
      (state) => {
        if (cancelled) return;
        setSimilarWhisps(state.matches);
        setWishMatchMeta(state.meta ?? null);
        const metaStatus = state.meta?.status ?? 'idle';
        if (metaStatus === 'failed') {
          setWishMatchStatus('error');
          setWishMatchError(
            state.meta?.error ??
              tr('wish.matchError', 'Unable to load similar wishes right now.'),
          );
          return;
        }
        if (state.matches.length > 0) {
          setWishMatchStatus('ready');
          setWishMatchError(null);
          return;
        }
        if (metaStatus === 'empty') {
          setWishMatchStatus('empty');
          setWishMatchError(null);
          return;
        }
        if (metaStatus === 'processing' || metaStatus === 'idle') {
          setWishMatchStatus('loading');
          return;
        }
        setWishMatchStatus('loading');
      },
      (err) => {
        if (cancelled) return;
        logger.warn('Failed to subscribe to wish matcher', err, {
          wishId: wish?.id,
        });
        setWishMatchError(
          tr('wish.matchError', 'Unable to load similar wishes right now.'),
        );
        setWishMatchStatus('error');
      },
    );

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [tr, wishMatcherEnabled, wish?.id]);
  useEffect(() => {
    const g = typeof params?.gift === 'string' ? params.gift : undefined;
    if (g === 'success')
      setGiftBanner(tr('gifts.success', '🎁 Thank you for your support!'));
    else if (g === 'cancel')
      setGiftBanner(tr('gifts.cancelled', 'Gift checkout canceled'));
    if (g) {
      const id = setTimeout(() => setGiftBanner(null), 4000);
      return () => clearTimeout(id);
    }
  }, [params?.gift, tr]);
  useEffect(() => {
    const loadNickname = async () => {
      const n = await AsyncStorage.getItem('nickname');
      if (n) setNickname(n);
    };
    loadNickname();
  }, []);

  useEffect(() => {
    const shouldFocus =
      typeof params?.comment === 'string' &&
      (params.comment === '1' || params.comment === 'true');
    if (!shouldFocus) return;
    autoScrollRef.current = true;
    setShouldFocusComposer(true);
  }, [params?.comment]);

  useEffect(() => {
    if (!shouldFocusComposer) return;
    const timer = setTimeout(() => {
      commentInputRef.current?.focus();
      setShouldFocusComposer(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [shouldFocusComposer]);

  const showCommentSuccess = useCallback(
    (message: string) => {
      if (Platform.OS === 'android') {
        ToastAndroid.show(message, ToastAndroid.SHORT);
        return;
      }
      setCommentSuccess(message);
      successOpacity.stopAnimation();
      successOpacity.setValue(0);
      Animated.sequence([
        Animated.timing(successOpacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.delay(1600),
        Animated.timing(successOpacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setCommentSuccess(null);
        }
      });
      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => {});
    },
    [successOpacity],
  );

  const handleSimilarRefresh = useCallback(() => {
    if (!wish?.id) return;
    setWishMatchStatus('loading');
    setWishMatchError(null);
    refreshWishMatches(wish.id, { force: true }).catch((err) => {
      logger.warn('Wish matcher manual refresh failed', err, {
        wishId: wish.id,
      });
      setWishMatchError(
        tr('wish.matchError', 'Unable to load similar wishes right now.'),
      );
      setWishMatchStatus('error');
    });
  }, [tr, wish?.id]);

  const handleSimilarSelect = useCallback(
    (targetId: string) => {
      if (!targetId || targetId === wish?.id) return;
      router.push(`/wish/${targetId}`);
    },
    [router, wish?.id],
  );

  const isBoosted =
    wish?.boostedUntil &&
    wish.boostedUntil.toDate &&
    wish.boostedUntil.toDate() > new Date();
  const isActiveWish =
    isBoosted || (wish?.likes || 0) > 5 || wish?.active === true;
  const isLoggedIn = !!user?.uid;
  const isOwner = !!(user?.uid && wish?.userId === user.uid);
  const isReply = !!replyTo;
  const [timeLeft, setTimeLeft] = useState(
    isBoosted && wish?.boostedUntil
      ? formatTimeLeft(wish.boostedUntil!.toDate())
      : '',
  );
  const glowAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!isBoosted || !wish?.boostedUntil) {
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
  }, [isBoosted, wish?.boostedUntil, glowAnim]);
  const canBoost =
    user &&
    wish?.userId === user.uid &&
    (!wish?.boostedUntil ||
      !wish.boostedUntil.toDate ||
      wish.boostedUntil.toDate() < new Date());

  const flatListRef = useRef<FlatList<Comment>>(null);

  const animationRefs = useRef<{ [key: string]: Animated.Value }>({});
  const animatedCommentIds = useRef<Set<string>>(new Set());
  const hasHydratedComments = useRef(false);

  const fetchWish = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getWish(id as string);
      if (data) {
        setWish(data);
        if (data.userId) {
          try {
            const snap = await getDoc(doc(db, 'users', data.userId));
            setOwner(snap.exists() ? snap.data() : null);
          } catch (err) {
            logger.warn('Failed to fetch wish owner', err);
            setOwner(null);
          }
        }
      }
    } catch (err) {
      logger.error('❌ Failed to load wish:', err);
      setError('Failed to load wish');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!wish?.id) return;
    void recordRecentWishlistView({
      userId: user?.uid ?? null,
      wishlistId: wish.id,
      title: wish.text,
      coverUri: wish.imageUrl ?? null,
    }).catch(() => {
      /* non-fatal */
    });
  }, [user?.uid, wish?.id, wish?.imageUrl, wish?.text]);

  useEffect(() => {
    const checkVote = async () => {
      if (!user?.uid) return;
      try {
        const snap = await getDoc(
          doc(db, 'votes', id as string, 'users', user.uid),
        );
        if (snap.exists()) setHasVoted(true);
      } catch (err) {
        logger.warn('Failed to check vote', err);
      }
    };
    checkVote();
  }, [id, user]);

  const subscribeToComments = useCallback(() => {
    setLoading(true);
    const unsubscribe = listenWishComments(
      id as string,
      (list) => {
        const ids = new Set<string>();
        const isInitialBatch = !hasHydratedComments.current && list.length > 0;
        list.forEach((d) => {
          const commentId = d.id;
          ids.add(commentId);
          if (!animationRefs.current[commentId]) {
            const initialValue = isInitialBatch ? 1 : 0;
            animationRefs.current[commentId] = new Animated.Value(initialValue);
            if (isInitialBatch) {
              animatedCommentIds.current.add(commentId);
            } else {
              animatedCommentIds.current.delete(commentId);
            }
          } else if (isInitialBatch) {
            animatedCommentIds.current.add(commentId);
          }
        });
        Object.keys(animationRefs.current).forEach((key) => {
          if (!ids.has(key)) {
            delete animationRefs.current[key];
          }
        });
        animatedCommentIds.current.forEach((key) => {
          if (!ids.has(key)) {
            animatedCommentIds.current.delete(key);
          }
        });
        if (isInitialBatch) {
          hasHydratedComments.current = true;
        }

        const sorted = [...list].sort((a, b) => {
          const aCount = Object.values(a.reactions || {}).reduce(
            (s, v) => s + v,
            0,
          );
          const bCount = Object.values(b.reactions || {}).reduce(
            (s, v) => s + v,
            0,
          );
          return bCount - aCount;
        });

        setComments(sorted);
        setWish((prev) =>
          prev ? { ...prev, commentCount: sorted.length } : prev,
        );
        const shouldScroll =
          autoScrollRef.current || !hasHydratedComments.current;
        if (shouldScroll) {
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 250);
          autoScrollRef.current = false;
        }
        setLoading(false);
      },
      (err) => {
        logger.error('❌ Failed to load comments:', err);
        setError('Failed to load comments');
        setLoading(false);
      },
    );

    return unsubscribe;
  }, [id]);

  useEffect(() => {
    const unsubscribe = subscribeToComments();
    return unsubscribe;
  }, [subscribeToComments]);

  useEffect(() => {
    const fetchStatus = async () => {
      const ids = new Set<string>();
      if (wish?.userId) ids.add(wish.userId);
      comments.forEach((c) => c.userId && ids.add(c.userId));
      await Promise.all(
        Array.from(ids).map(async (uid) => {
          if (publicStatus[uid] === undefined) {
            try {
              const snap = await getDoc(doc(db, 'users', uid));
              setPublicStatus((prev) => ({
                ...prev,
                [uid]: snap.exists()
                  ? snap.data().publicProfileEnabled !== false
                  : false,
              }));
            } catch (err) {
              logger.warn('Failed to fetch user status', err);
              setPublicStatus((prev) => ({ ...prev, [uid]: false }));
            }
          }
        }),
      );
    };
    fetchStatus();
  }, [comments, publicStatus, wish]);

  useEffect(() => {
    const fetchVerified = async () => {
      const ids = Array.from(
        new Set(comments.map((c) => c.userId).filter(Boolean)),
      );
      await Promise.all(
        ids.map(async (uid) => {
          if (!uid || verifiedStatus[uid] !== undefined) return;
          const q = query(
            collectionGroup(db, 'comments'),
            where('userId', '==', uid),
          );
          const snap = await getDocs(q);
          let total = 0;
          snap.forEach((d) => {
            const r = d.data().reactions || {};
            total += Object.values(r).reduce((s: number, v: any) => s + v, 0);
          });
          setVerifiedStatus((prev) => ({ ...prev, [uid]: total >= 10 }));
        }),
      );
    };
    fetchVerified();
  }, [comments, verifiedStatus]);

  const toggleAudio = useCallback(async () => {
    try {
      if (player) {
        if (isPlaying) {
          await player.pauseAsync();
          setIsPlaying(false);
        } else {
          await player.playAsync();
          setIsPlaying(true);
        }
        return;
      }
      if (!wish?.audioUrl) return;
      const p = createPlayer();
      await p.loadAsync(wish.audioUrl);
      await p.playAsync();
      setPlayer(p);
      setIsPlaying(true);
    } catch (err) {
      logger.error('❌ Failed to play audio:', err);
    }
  }, [player, isPlaying, wish]);

  useEffect(() => {
    return () => {
      if (player) {
        (player as any).remove?.();
      }
      setIsPlaying(false);
    };
  }, [player]);

  const handlePostComment = useCallback(async () => {
    if (!comment.trim()) return;
    if (!user?.uid) {
      router.push('/auth');
      return;
    }
    autoScrollRef.current = true;
    setPostingComment(true);
    try {
      await addComment(
        id as string,
        {
          text: comment.trim(),
          userId: user?.uid,
          displayName: useProfileComment ? profile?.displayName || '' : '',
          photoURL: useProfileComment ? profile?.photoURL || '' : '',
          isAnonymous: !useProfileComment,
          ...(nickname && !useProfileComment ? { nickname } : {}),
          ...(replyTo ? { parentId: replyTo } : {}),
          reactions: {},
          userReactions: {},
        },
        (err) => {
          logger.error('❌ Failed to post comment:', err);
        },
      );
      setComment('');
      setReplyTo(null);
      if (nickname) await AsyncStorage.setItem('nickname', nickname);
      showCommentSuccess(tr('wish.commentPosted', 'Comment posted'));
      setWish((prev) =>
        prev ? { ...prev, commentCount: (prev.commentCount || 0) + 1 } : prev,
      );
    } catch {
      // error handled in onError
    } finally {
      setPostingComment(false);
    }
  }, [
    comment,
    id,
    replyTo,
    user,
    profile,
    useProfileComment,
    nickname,
    showCommentSuccess,
    tr,
    router,
  ]);

  const handleReact = useCallback(
    async (commentId: string, emoji: string) => {
      const comment = comments.find((c) => c.id === commentId);
      if (!comment) return;
      const currentUser = user?.uid || 'anon';
      const prevEmoji = comment.userReactions?.[currentUser];

      try {
        await updateCommentReaction(
          id as string,
          commentId,
          emoji,
          prevEmoji,
          currentUser,
          (err) => {
            logger.error('❌ Failed to update reaction:', err);
          },
        );
      } catch {
        // error handled in onError
      }
    },
    [comments, id, user],
  );

  const handleSaveComment = useCallback(async () => {
    if (!editingCommentId) return;
    const trimmed = editingCommentText.trim();
    if (!trimmed) {
      if (Platform.OS === 'android') {
        ToastAndroid.show(
          tr('comments.emptyWarning', 'Comment cannot be empty.'),
          ToastAndroid.SHORT,
        );
      } else if (Platform.OS === 'web') {
        if (
          typeof globalThis !== 'undefined' &&
          typeof (globalThis as any).alert === 'function'
        ) {
          (globalThis as any).alert(
            tr('comments.emptyWarning', 'Comment cannot be empty.'),
          );
        }
      } else {
        Alert.alert(
          tr('common.error', 'Something went wrong'),
          tr('comments.emptyWarning', 'Comment cannot be empty.'),
        );
      }
      return;
    }
    try {
      await updateComment(id as string, editingCommentId, {
        text: trimmed,
      });
      setEditingCommentId(null);
      setEditingCommentText('');
    } catch (err) {
      logger.error('❌ Failed to update comment:', err);
    }
  }, [editingCommentId, editingCommentText, id, tr]);

  const handleDeleteComment = useCallback(
    (commentId: string) => {
      const title = tr('comments.deleteTitle', 'Delete Comment');
      const message = tr(
        'comments.deleteConfirm',
        'Are you sure you want to delete this comment?',
      );
      const performDelete = async () => {
        try {
          await deleteComment(id as string, commentId);
          setWish((prev) =>
            prev
              ? {
                  ...prev,
                  commentCount: Math.max(0, (prev.commentCount || 0) - 1),
                }
              : prev,
          );
        } catch (err) {
          logger.error('❌ Failed to delete comment:', err);
        }
      };

      if (Platform.OS === 'web') {
        const approved =
          typeof globalThis !== 'undefined' &&
          typeof (globalThis as any).confirm === 'function'
            ? (globalThis as any).confirm(message)
            : true;
        if (approved) {
          void performDelete();
        }
        return;
      }

      Alert.alert(title, message, [
        { text: tr('common.cancel', 'Cancel'), style: 'cancel' },
        {
          text: tr('common.delete', 'Delete'),
          style: 'destructive',
          onPress: () => {
            void performDelete();
          },
        },
      ]);
    },
    [id, tr],
  );

  const handleReport = useCallback(
    async (reason: string) => {
      if (!reportTarget) return;
      try {
        if (reportTarget.type === 'comment') {
          await addDoc(
            collection(db, 'wishes', id as string, 'commentReports'),
            {
              commentId: reportTarget.id,
              reason,
              timestamp: serverTimestamp(),
            },
          );
        } else {
          await addDoc(collection(db, 'reports'), {
            itemId: reportTarget.id,
            type: reportTarget.type,
            reason,
            timestamp: serverTimestamp(),
          });
        }
      } catch (err) {
        logger.error('❌ Failed to submit report:', err);
      } finally {
        setReportVisible(false);
        setReportTarget(null);
      }
    },
    [id, reportTarget],
  );

  const handleVote = useCallback(
    async (option: 'A' | 'B') => {
      if (!wish || hasVoted || !user?.uid) return;
      try {
        const voteRef = doc(db, 'votes', wish.id, 'users', user.uid);
        const existing = await getDoc(voteRef);
        if (existing.exists()) {
          setHasVoted(true);
          return;
        }
        await setDoc(voteRef, { option, timestamp: serverTimestamp() });
        const ref = doc(db, 'wishes', wish.id);
        await updateDoc(ref, {
          [option === 'A' ? 'votesA' : 'votesB']: increment(1),
        });
        setHasVoted(true);
        await fetchWish();
      } catch (err) {
        logger.error('❌ Failed to vote:', err);
      }
    },
    [fetchWish, hasVoted, wish, user],
  );

  const handleFulfillWish = useCallback(
    async (link: string) => {
      if (!link.trim()) return;
      try {
        await setFulfillmentLink(id as string, link.trim());
        if (user?.uid) {
          try {
            await recordEngagementEvent(user.uid, 'fulfillment');
          } catch (err) {
            logger.warn('Failed to record fulfillment streak', err);
          }
        }
        await fetchWish();
      } catch (err) {
        logger.error('❌ Failed to fulfill wish:', err);
      }
    },
    [fetchWish, id, user?.uid],
  );

  const handleBoostWish = useCallback(() => {
    if (!wish) return;
    router.push(`/boost/${wish.id}`);
  }, [router, wish]);

  const openGiftLink = useCallback(async (link: string) => {
    try {
      await WebBrowser.openBrowserAsync(link);
    } catch (err) {
      logger.warn('Failed to open external gift link', err);
      Alert.alert('Unable to open link', 'Please try again shortly.');
    }
  }, []);

  const legacyFundingGoal =
    typeof wish?.fundingGoal === 'number' ? wish.fundingGoal : 0;
  const legacyRaisedFromMeta =
    typeof metaGiftTotal === 'number' ? metaGiftTotal : 0;
  const legacySupportersFromMeta =
    typeof metaGiftCount === 'number' ? metaGiftCount : 0;
  const legacyRaisedFromWish =
    typeof wish?.fundingRaised === 'number' ? wish.fundingRaised : 0;
  const legacySupportersFromWish =
    typeof wish?.fundingSupporters === 'number' ? wish.fundingSupporters : 0;
  const legacyFundingRaised = Math.max(
    legacyRaisedFromWish,
    legacyRaisedFromMeta,
    0,
  );
  const legacySupporters = Math.max(
    legacySupportersFromWish,
    legacySupportersFromMeta,
    0,
  );
  const splitPayActive =
    giftPotEnabled &&
    wish?.splitPayEnabled === true &&
    typeof wish?.targetAmount === 'number' &&
    wish.targetAmount > 0;
  const targetAmountCents = splitPayActive
    ? Math.max(0, wish?.targetAmount ?? 0)
    : Math.round(legacyFundingGoal * 100);
  const fundedAmountCents = splitPayActive
    ? Math.max(
        0,
        typeof wish?.fundedAmount === 'number' ? wish.fundedAmount : 0,
      )
    : Math.round(legacyFundingRaised * 100);
  const supportersCount = splitPayActive
    ? Math.max(
        0,
        typeof wish?.fundingSupporters === 'number'
          ? wish.fundingSupporters
          : 0,
      )
    : legacySupporters;
  const currencyCode =
    typeof wish?.fundingCurrency === 'string' ? wish.fundingCurrency : 'USD';
  const remainingCents =
    targetAmountCents > 0
      ? Math.max(targetAmountCents - fundedAmountCents, 0)
      : null;
  const progressPercent =
    targetAmountCents > 0
      ? Math.min(100, (fundedAmountCents / targetAmountCents) * 100)
      : 0;
  const fundingPercentDisplay = Math.round(progressPercent);
  const hasFundingGoal = targetAmountCents > 0;
  const deadlineDate =
    splitPayActive &&
    wish?.deadline &&
    typeof (wish.deadline as any).toDate === 'function'
      ? (wish.deadline as any).toDate()
      : null;
  const deadlineLabel = deadlineDate
    ? `Ends ${formatDistanceToNow(deadlineDate, { addSuffix: true })}`
    : null;

  useEffect(() => {
    if (!splitPayActive) return;
    const shouldOpen =
      typeof params?.splitpay === 'string' &&
      (params.splitpay === '1' || params.splitpay === 'true');
    if (shouldOpen) {
      setChipInVisible(true);
    }
  }, [params?.splitpay, splitPayActive]);

  const statsSegments: string[] = [];
  if (hasFundingGoal) {
    statsSegments.push(
      `${formatCurrency(fundedAmountCents / 100, currencyCode)} of ${formatCurrency(
        targetAmountCents / 100,
        currencyCode,
      )}`,
    );
  }
  if (supportersCount > 0) {
    statsSegments.push(
      `${supportersCount} ${supportersCount === 1 ? 'friend' : 'friends'} chipped in`,
    );
  }
  if (typeof remainingCents === 'number' && remainingCents > 0) {
    statsSegments.push(
      `${formatCurrency(remainingCents / 100, currencyCode)} to go`,
    );
  }
  const splitPayStatsText = statsSegments.join(' • ');
  const giftTogetherEnabled = splitPayActive && appConfig.features.giftTogether;
  const giftTogetherLink = useMemo(() => {
    if (!wish?.id) return '';
    const params =
      giftPotEnabled && wish?.splitPayEnabled ? { splitpay: '1' } : undefined;
    return Linking.createURL(`/wish/${wish.id}`, { queryParams: params });
  }, [giftPotEnabled, wish?.id, wish?.splitPayEnabled]);

  const handleShare = useCallback(async () => {
    if (!wish?.id || !giftTogetherLink) return;
    try {
      await Share.share({ message: giftTogetherLink });
      if (giftPotEnabled && wish.splitPayEnabled) {
        logSplitPayShareClick({
          wishId: wish.id,
          experiment: experimentBucket,
        });
      }
    } catch (err) {
      logger.warn('Failed to share wish', err);
    }
  }, [
    experimentBucket,
    giftPotEnabled,
    giftTogetherLink,
    wish?.id,
    wish?.splitPayEnabled,
  ]);

  useEffect(() => {
    if (!giftTogetherEnabled && giftTogetherVisible) {
      setGiftTogetherVisible(false);
    }
  }, [giftTogetherEnabled, giftTogetherVisible]);

  const friendsNeeded =
    typeof remainingCents === 'number' && remainingCents > 0
      ? Math.max(1, Math.ceil(remainingCents / MIN_PLEDGE_CENTS))
      : null;
  const baseDisplayAmount = formatCurrency(
    MIN_PLEDGE_CENTS / 100,
    currencyCode,
  );
  const wishStatus = (wish?.status as string | undefined) ?? 'open';
  let splitPayCtaLabel: string | null = null;
  if (splitPayActive) {
    if (wishStatus === 'fulfilled') {
      splitPayCtaLabel = supportersCount
        ? `Funded by ${supportersCount} ${supportersCount === 1 ? 'friend' : 'friends'}`
        : 'Wish funded!';
    } else if (wishStatus === 'expired') {
      splitPayCtaLabel = 'Not funded — no one was charged';
    } else if (
      typeof remainingCents === 'number' &&
      remainingCents > 0 &&
      remainingCents <= 1500
    ) {
      splitPayCtaLabel = `Only ${formatCurrency(remainingCents / 100, currencyCode)} left — finish it!`;
    } else {
      splitPayCtaLabel = friendsNeeded
        ? `Chip in ${baseDisplayAmount} — ${friendsNeeded} friend${friendsNeeded === 1 ? '' : 's'} needed.`
        : `Chip in ${baseDisplayAmount} today.`;
    }
  }
  const canChipIn =
    splitPayActive && wishStatus !== 'fulfilled' && wishStatus !== 'expired';

  const handleUpdateWish = useCallback(async () => {
    if (!wish) return;
    try {
      await updateWish(wish.id, { text: editText, category: editCategory });
      await fetchWish();
      setEditing(false);
    } catch (err) {
      logger.error('❌ Failed to update wish:', err);
    }
  }, [wish, editText, editCategory, fetchWish]);

  const handleDeleteWish = useCallback(() => {
    Alert.alert('Delete Wish', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteWish(id as string);
            router.back();
          } catch (err) {
            logger.error('❌ Failed to delete wish:', err);
          }
        },
      },
    ]);
  }, [id, router]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchWish();
    setRefreshing(false);
  }, [fetchWish]);

  const renderCommentItem = useCallback(
    (item: Comment, level = 0) => {
      let animValue = animationRefs.current[item.id];
      if (!animValue) {
        animValue = new Animated.Value(1);
        animationRefs.current[item.id] = animValue;
        animatedCommentIds.current.add(item.id);
      }
      if (!animatedCommentIds.current.has(item.id)) {
        animatedCommentIds.current.add(item.id);
        animValue.setValue(0);
        Animated.timing(animValue, {
          toValue: 1,
          duration: 400,
          useNativeDriver: CAN_USE_NATIVE_DRIVER,
        }).start(({ finished }) => {
          if (!finished) {
            animatedCommentIds.current.delete(item.id);
          }
        });
      }

      const currentUser = user?.uid || 'anon';
      const userReaction = item.userReactions?.[currentUser];
      const replies = isActiveWish
        ? comments.filter((c) => c.parentId === item.id)
        : [];
      const isEditing = editingCommentId === item.id;

      return (
        <View key={item.id}>
          <Animated.View
            style={{
              ...styles.commentBox,
              marginLeft: level * 16,
              opacity: animValue,
              transform: [
                {
                  translateY: animValue.interpolate({
                    inputRange: [0, 1],
                    outputRange: [10, 0],
                  }),
                },
              ],
            }}
          >
            {!item.isAnonymous && publicStatus[item.userId || ''] ? (
              <TouchableOpacity
                onPress={() => router.push(`/profile/${item.displayName}`)}
                hitSlop={HIT_SLOP}
              >
                <Text style={[styles.nickname, { color: theme.placeholder }]}>
                  {' '}
                  {/* theme fix */}
                  {item.displayName}
                  {verifiedStatus[item.userId || ''] ? ' \u2705 Verified' : ''}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text style={[styles.nickname, { color: theme.placeholder }]}>
                {item.nickname || 'Anonymous'}
              </Text>
            )}
            {item.userId === wish?.userId && (
              <Text style={[styles.nickname, { color: theme.tint }]}>
                {' '}
                (author)
              </Text>
            )}
            {isEditing ? (
              <>
                <TextInput
                  value={editingCommentText}
                  onChangeText={setEditingCommentText}
                  style={[
                    styles.comment,
                    {
                      color: theme.text,
                      borderWidth: 1,
                      borderColor: theme.text + '33',
                      borderRadius: 6,
                      padding: 4,
                    },
                  ]}
                  multiline
                />
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginTop: 6,
                  }}
                >
                  <TouchableOpacity onPress={handleSaveComment}>
                    <Text style={{ color: theme.tint }}>Save</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setEditingCommentId(null);
                      setEditingCommentText('');
                    }}
                    style={{ marginLeft: 8 }}
                  >
                    <Text style={{ color: '#f87171' }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={[styles.comment, { color: theme.text }]}>
                  {item.text}
                </Text>
                <Text style={[styles.timestamp, { color: theme.placeholder }]}>
                  {' '}
                  {/* theme fix */}
                  {item.timestamp?.seconds
                    ? formatDistanceToNow(
                        new Date(item.timestamp.seconds * 1000),
                        { addSuffix: true },
                      )
                    : 'Just now'}
                </Text>

                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginTop: 6,
                  }}
                >
                  {emojiOptions.map((emoji) => (
                    <TouchableOpacity
                      key={emoji}
                      onPress={() => handleReact(item.id, emoji)}
                      style={{
                        marginRight: 8,
                        padding: 6,
                        borderRadius: 6,
                        opacity: userReaction === emoji ? 1 : 0.4,
                      }}
                    >
                      <Text style={{ fontSize: 20 }}>
                        {emoji} {item.reactions?.[emoji] || 0}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  {isActiveWish && (
                    <TouchableOpacity
                      onPress={() => setReplyTo(item.id)}
                      style={{ marginLeft: 8 }}
                    >
                      <Text style={{ color: '#a78bfa' }}>Reply</Text>
                    </TouchableOpacity>
                  )}
                  {item.userId === user?.uid && (
                    <>
                      <TouchableOpacity
                        onPress={() => {
                          setEditingCommentId(item.id);
                          setEditingCommentText(item.text);
                        }}
                        style={{ marginLeft: 8 }}
                      >
                        <Text style={{ color: theme.tint }}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleDeleteComment(item.id)}
                        style={{ marginLeft: 8 }}
                      >
                        <Text style={{ color: '#f87171' }}>Delete</Text>
                      </TouchableOpacity>
                    </>
                  )}
                  <TouchableOpacity
                    onLongPress={() => {
                      setReportTarget({ type: 'comment', id: item.id });
                      setReportVisible(true);
                    }}
                    style={{ marginLeft: 8 }}
                    hitSlop={HIT_SLOP}
                  >
                    <Text style={{ color: '#f87171' }}>🚩</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </Animated.View>
          {replies.map((r) => renderCommentItem(r, level + 1))}
        </View>
      );
    },
    [
      comments,
      handleReact,
      user,
      isActiveWish,
      publicStatus,
      router,
      theme.text,
      theme.tint,
      theme.placeholder,
      verifiedStatus,
      wish?.userId,
      editingCommentId,
      editingCommentText,
      handleSaveComment,
      handleDeleteComment,
    ],
  );

  const renderComment = useCallback(
    ({ item }: { item: Comment }) => renderCommentItem(item),
    [renderCommentItem],
  );

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background }]}
    >
      <StatusBar
        style={theme.name === 'dark' ? 'light' : 'dark'}
        backgroundColor={theme.background}
      />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
      >
        <ScrollView contentContainerStyle={styles.contentContainer}>
          {giftBanner && (
            <View style={[styles.banner, { backgroundColor: theme.input }]}>
              <Text style={{ color: theme.text }}>{giftBanner}</Text>
            </View>
          )}
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
            hitSlop={HIT_SLOP}
          >
            <Text style={[styles.backButtonText, { color: theme.tint }]}>
              ← Back
            </Text>
          </TouchableOpacity>

          {loading ? (
            <ActivityIndicator
              size="large"
              color={theme.tint}
              style={{ marginTop: 20 }}
            /> // theme fix
          ) : error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : (
            <>
              {wish && (
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
                    <Text
                      style={[styles.wishCategory, { color: typeMeta.color }]}
                    >
                      {typeMeta.emoji} #{wish.category}
                    </Text>
                    <View style={styles.headerActions}>
                      {anonFavEnabled ? (
                        <TouchableOpacity
                          onPress={() => {
                            void handleFavoritePress();
                          }}
                          hitSlop={HIT_SLOP}
                          accessibilityRole="button"
                          accessibilityState={
                            anonFavLoading ? { busy: true } : undefined
                          }
                          disabled={anonFavLoading}
                        >
                          <Ionicons
                            name={anonFavorited ? 'heart' : 'heart-outline'}
                            size={20}
                            color={anonFavorited ? '#ef4444' : theme.tint}
                          />
                        </TouchableOpacity>
                      ) : null}
                      <TouchableOpacity
                        onPress={handleShare}
                        hitSlop={HIT_SLOP}
                      >
                        <Ionicons
                          name="share-outline"
                          size={20}
                          color={theme.tint}
                        />
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
                                pendingStage && pendingStage === option.value
                                  ? 0.6
                                  : 1,
                            },
                          ]}
                          onPress={() => handleStageChange(option.value)}
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
                  <Text
                    style={[
                      styles.stageDescription,
                      { color: theme.placeholder },
                    ]}
                  >
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
                          void handleFavoritePress();
                        }}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 8,
                        }}
                        accessibilityRole="button"
                        accessibilityState={
                          anonFavLoading ? { busy: true } : undefined
                        }
                        disabled={anonFavLoading}
                      >
                        <Ionicons
                          name={anonFavorited ? 'heart' : 'heart-outline'}
                          size={18}
                          color={anonFavorited ? '#ef4444' : theme.tint}
                        />
                        <Text
                          style={[
                            styles.favoriteSummaryText,
                            { color: theme.text },
                          ]}
                        >
                          {anonStats.favorites > 0
                            ? tr('wish.favoritesTitle', '{{count}} favorites', {
                                count: anonStats.favorites,
                              })
                            : tr(
                                'wish.favoritesBeFirst',
                                'Be the first to favorite',
                              )}
                        </Text>
                      </TouchableOpacity>
                      {favoriteSampleNote ? (
                        <Text
                          style={[
                            styles.favoriteQuote,
                            { color: theme.placeholder },
                          ]}
                        >
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
                        <Text
                          style={[
                            styles.circleBannerTitle,
                            { color: theme.tint },
                          ]}
                        >
                          👥 {wish.accountabilityCircleName}
                        </Text>
                        {circleMeta?.lastCheckInAt ? (
                          <Text
                            style={[
                              styles.circleBannerSubtitle,
                              { color: theme.placeholder },
                            ]}
                          >
                            {tr(
                              'wish.circleLastCheckIn',
                              'Last check-in {{time}} ago',
                              {
                                time: formatDistanceToNow(
                                  new Date(circleMeta.lastCheckInAt),
                                ),
                              },
                            )}
                          </Text>
                        ) : (
                          <Text
                            style={[
                              styles.circleBannerSubtitle,
                              { color: theme.placeholder },
                            ]}
                          >
                            {tr(
                              'wish.circlePrompt',
                              'Keep the circle in the loop with short updates.',
                            )}
                          </Text>
                        )}
                      </View>
                      {wish.accountabilityCircleId ? (
                        <TouchableOpacity
                          onPress={handleCircleCheckIn}
                          style={[
                            styles.circleBannerButton,
                            { borderColor: theme.tint },
                          ]}
                          hitSlop={HIT_SLOP}
                        >
                          <Text
                            style={[
                              styles.circleBannerButtonText,
                              { color: theme.tint },
                            ]}
                          >
                            {tr('wish.circleLogCheckIn', 'Log check-in')}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ) : null}
                  <Text style={[styles.wishText, { color: theme.text }]}>
                    {wish.text}
                  </Text>
                  {wish.fulfillmentLink && (
                    <Text style={{ color: theme.tint, marginTop: 4 }}>
                      💝 Fulfilled
                    </Text>
                  )}
                  {wish.imageUrl && (
                    <Image
                      source={{ uri: wish.imageUrl }}
                      style={styles.preview}
                    />
                  )}

                  {wish.isPoll ? (
                    <View style={{ marginTop: 8 }}>
                      {(() => {
                        const totalVotes =
                          (wish.votesA || 0) + (wish.votesB || 0);
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
                              onPress={() => handleVote('A')}
                            >
                              <Text
                                style={[
                                  styles.pollOptionText,
                                  { color: theme.text },
                                ]}
                              >
                                {wish.optionA} - {wish.votesA || 0} ({percentA}
                                %)
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.pollOption}
                              disabled={hasVoted}
                              onPress={() => handleVote('B')}
                            >
                              <Text
                                style={[
                                  styles.pollOptionText,
                                  { color: theme.text },
                                ]}
                              >
                                {wish.optionB} - {wish.votesB || 0} ({percentB}
                                %)
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
                          datasets: [
                            { data: [wish.votesA || 0, wish.votesB || 0] },
                          ],
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
                    <Text style={[styles.likes, { color: theme.tint }]}>
                      ❤️ {wish.likes}
                    </Text>
                  )}
                  {isBoosted && (
                    <Text style={styles.boostedLabel}>
                      ⏳ Time left: {timeLeft}
                    </Text>
                  )}

                  {wish.audioUrl && (
                    <TouchableOpacity
                      onPress={toggleAudio}
                      style={{ marginTop: 10 }}
                    >
                      <Text style={{ color: '#a78bfa' }}>
                        {isPlaying ? '⏸ Pause Audio' : '▶ Play Audio'}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {splitPayActive ? (
                    <View
                      style={[
                        styles.splitPayCard,
                        { backgroundColor: theme.input },
                      ]}
                    >
                      <SplitPayProgressBar progress={progressPercent / 100} />
                      {splitPayStatsText ? (
                        <Text
                          style={[styles.splitPayStats, { color: theme.text }]}
                        >
                          {splitPayStatsText}
                        </Text>
                      ) : null}
                      {deadlineLabel ? (
                        <Text
                          style={[
                            styles.splitPayDeadline,
                            { color: theme.placeholder },
                          ]}
                        >
                          {deadlineLabel}
                        </Text>
                      ) : null}
                      {splitPayCtaLabel ? (
                        canChipIn ? (
                          <TouchableOpacity
                            onPress={() => setChipInVisible(true)}
                            style={[
                              styles.splitPayButton,
                              { backgroundColor: theme.tint },
                            ]}
                          >
                            <Text
                              style={[
                                styles.splitPayButtonText,
                                { color: theme.background },
                              ]}
                            >
                              {splitPayCtaLabel}
                            </Text>
                          </TouchableOpacity>
                        ) : (
                          <Text
                            style={[
                              styles.splitPayStatusText,
                              { color: theme.placeholder },
                            ]}
                          >
                            {splitPayCtaLabel}
                          </Text>
                        )
                      ) : null}
                      <View style={styles.splitPayActions}>
                        {giftTogetherEnabled ? (
                          <TouchableOpacity
                            onPress={() => setGiftTogetherVisible(true)}
                            style={[
                              styles.splitPaySecondaryButton,
                              { borderColor: theme.placeholder },
                            ]}
                            hitSlop={HIT_SLOP}
                            accessibilityRole="button"
                          >
                            <Text
                              style={[
                                styles.splitPaySecondaryText,
                                { color: theme.text },
                              ]}
                            >
                              🎁 Gift Together
                            </Text>
                          </TouchableOpacity>
                        ) : null}
                        <TouchableOpacity
                          onPress={handleShare}
                          style={[
                            styles.splitPaySecondaryButton,
                            { borderColor: theme.placeholder },
                          ]}
                          hitSlop={HIT_SLOP}
                          accessibilityRole="button"
                        >
                          <Text
                            style={[
                              styles.splitPaySecondaryText,
                              { color: theme.text },
                            ]}
                          >
                            Share link
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : hasFundingGoal ? (
                    <View
                      style={[
                        styles.fundingCard,
                        { backgroundColor: theme.input },
                      ]}
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
                              width: `${fundingPercentDisplay}%`,
                              backgroundColor: theme.tint,
                            },
                          ]}
                        />
                      </View>
                      <View style={styles.fundingInfoRow}>
                        <Text
                          style={[styles.fundingLabel, { color: theme.text }]}
                          accessibilityLabel={tr('wish.fundingProgress', {
                            raised: legacyFundingRaised.toFixed(2),
                            goal: legacyFundingGoal.toFixed(2),
                          })}
                        >
                          {tr('wish.fundingProgress', {
                            raised: legacyFundingRaised.toFixed(2),
                            goal: legacyFundingGoal.toFixed(2),
                          })}
                        </Text>
                        <Text
                          style={[
                            styles.fundingPercent,
                            { color: theme.placeholder },
                          ]}
                          accessibilityLabel={tr('wish.fundingPercent', {
                            percent: fundingPercentDisplay,
                          })}
                        >
                          {tr('wish.fundingPercent', {
                            percent: fundingPercentDisplay,
                          })}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.fundingSupporters,
                          { color: theme.placeholder },
                        ]}
                        accessibilityLabel={
                          legacySupporters > 0
                            ? tr('wish.fundingSupporters', {
                                count: legacySupporters,
                              })
                            : tr(
                                'wish.fundingBeFirst',
                                'Be the first to chip in',
                              )
                        }
                      >
                        {legacySupporters > 0
                          ? tr('wish.fundingSupporters', {
                              count: legacySupporters,
                            })
                          : tr(
                              'wish.fundingBeFirst',
                              'Be the first to chip in',
                            )}
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
                      <Text
                        style={[styles.supportCardTitle, { color: theme.text }]}
                      >
                        {tr(
                          'wish.supportRequestTitle',
                          'Support request: {{amount}}',
                          {
                            amount: formatCurrency(supportRequestAmount),
                          },
                        )}
                      </Text>
                      {supportRequestReason ? (
                        <Text
                          style={[
                            styles.supportCardText,
                            { color: theme.text },
                          ]}
                        >
                          {supportRequestReason}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}

                  {profile?.giftingEnabled && wish.giftLink && (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        marginTop: 8,
                      }}
                    >
                      <TouchableOpacity
                        onPress={() => openGiftLink(wish.giftLink!)}
                        style={{
                          backgroundColor: theme.input,
                          padding: 8,
                          borderRadius: 8,
                        }}
                      >
                        <Text style={{ color: theme.tint }}>
                          {(() => {
                            try {
                              const url = new URL(wish.giftLink!);
                              const trusted = [
                                'venmo.com',
                                'paypal.me',
                                'amazon.com',
                              ].some((d) => url.hostname.includes(d));
                              return `${trusted ? '✅' : '⚠️'} 🎁 ${wish.giftLabel || 'Send Gift'}`;
                            } catch {
                              return `⚠️ 🎁 ${wish.giftLabel || 'Send Gift'}`;
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
                  {wish?.userId && profile?.giftingEnabled ? (
                    <GiftCTA
                      wishId={wish.id}
                      wishTitle={wish.text}
                      recipientId={wish.userId}
                      goalAmount={
                        typeof wish.fundingGoal === 'number'
                          ? wish.fundingGoal
                          : null
                      }
                      currentGiftTotal={legacyFundingRaised}
                      venmoRecipient={(owner && owner.venmoHandle) || null}
                      isPrivate={
                        wish?.visibility === 'private' ||
                        wish?.shareScope === 'private' ||
                        (wish as any)?.isPrivate === true
                      }
                      onGiftConfirmed={() => {
                        clearWishMetaCache(wish.id);
                        fetchWish();
                      }}
                    />
                  ) : null}

                  {canBoost && (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        marginTop: 8,
                      }}
                    >
                      <TouchableOpacity
                        onPress={handleBoostWish}
                        hitSlop={HIT_SLOP}
                      >
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
                  )}

                  {user?.uid === wish.userId && (
                    <View
                      style={{
                        flexDirection: 'row',
                        marginTop: 8,
                      }}
                    >
                      <TouchableOpacity
                        onPress={() => {
                          setEditText(wish.text);
                          setEditCategory(wish.category);
                          setEditing(true);
                        }}
                        hitSlop={HIT_SLOP}
                      >
                        <Text style={{ color: theme.tint }}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={handleDeleteWish}
                        style={{ marginLeft: 10 }}
                        hitSlop={HIT_SLOP}
                      >
                        <Text style={{ color: '#f87171' }}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  <TouchableOpacity
                    onPress={() => {
                      setReportTarget({ type: 'wish', id: wish.id });
                      setReportVisible(true);
                    }}
                    style={{ marginTop: 8 }}
                    hitSlop={HIT_SLOP}
                  >
                    <Text style={{ color: '#f87171' }}>Report</Text>
                  </TouchableOpacity>
                </Animated.View>
              )}
            </>
          )}

          {wishMatcherEnabled ? (
            <SimilarWhispsSection
              matches={similarWhisps}
              status={wishMatchStatus}
              error={wishMatchError}
              meta={wishMatchMeta}
              onRefresh={handleSimilarRefresh}
              onSelect={handleSimilarSelect}
            />
          ) : null}

          <FlatList
            ref={flatListRef}
            data={comments.filter((c) => isActiveWish || !c.parentId)}
            keyExtractor={(item) => item.id}
            renderItem={renderComment}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            contentContainerStyle={{ paddingBottom: 80, flexGrow: 1 }}
            scrollEnabled={false}
            initialNumToRender={10}
            getItemLayout={(_, index) => ({
              length: COMMENT_ITEM_HEIGHT,
              offset: COMMENT_ITEM_HEIGHT * index,
              index,
            })}
          />

          {replyTo && (
            <View style={styles.replyInfo}>
              <Text style={{ color: '#a78bfa' }}>
                Replying to{' '}
                {(() => {
                  const r = comments.find((c) => c.id === replyTo);
                  if (r && !r.isAnonymous && publicStatus[r.userId || '']) {
                    return r.displayName;
                  }
                  return 'Anonymous';
                })()}
              </Text>
              <TouchableOpacity
                onPress={() => setReplyTo(null)}
                style={{ marginLeft: 8 }}
              >
                <Text style={{ color: theme.text }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}

          {commentSuccess && Platform.OS !== 'android' && (
            <Animated.View
              style={[
                styles.successToast,
                { backgroundColor: theme.tint, opacity: successOpacity },
              ]}
              pointerEvents="none"
            >
              <Text
                style={[styles.successToastText, { color: theme.background }]}
              >
                {commentSuccess}
              </Text>
            </Animated.View>
          )}

          <Text style={[styles.label, { color: theme.placeholder }]}>
            {isReply
              ? tr('wish.replyLabel', 'Reply')
              : tr('wish.commentLabel', 'Comment')}
          </Text>
          <TextInput
            ref={commentInputRef}
            style={[
              styles.input,
              { backgroundColor: theme.input, color: theme.text },
            ]}
            placeholder={
              isReply
                ? tr('wish.placeholderReply', 'Write your reply')
                : tr('wish.placeholderComment', 'Share your thoughts')
            }
            placeholderTextColor={theme.placeholder} // theme fix
            value={comment}
            onChangeText={setComment}
            editable={isLoggedIn}
            selectTextOnFocus={isLoggedIn}
            accessibilityState={{ disabled: !isLoggedIn }}
          />
          {!useProfileComment && (
            <TextInput
              style={[
                styles.input,
                { backgroundColor: theme.input, color: theme.text },
              ]}
              placeholder={tr('wish.nicknamePlaceholder', 'Nickname or emoji')}
              placeholderTextColor={theme.placeholder} // theme fix
              value={nickname}
              onChangeText={setNickname}
              editable={isLoggedIn}
              selectTextOnFocus={isLoggedIn}
              accessibilityState={{ disabled: !isLoggedIn }}
            />
          )}

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginBottom: 10,
            }}
          >
            <Text style={{ color: theme.text, marginRight: 8 }}>
              {tr('wish.commentWithProfile', 'Comment with profile')}
            </Text>
            <Switch
              value={useProfileComment}
              onValueChange={setUseProfileComment}
              disabled={!isLoggedIn}
            />
          </View>

          {!isLoggedIn && (
            <TouchableOpacity
              style={[styles.signInNotice, { borderColor: theme.tint }]}
              onPress={() => router.push('/auth')}
              hitSlop={HIT_SLOP}
            >
              <Ionicons
                name="log-in-outline"
                size={18}
                color={theme.tint}
                style={{ marginRight: 6 }}
              />
              <Text style={{ color: theme.tint }}>
                {tr('wish.signInToComment', 'Sign in to comment')}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.button, { backgroundColor: theme.tint }]}
            onPress={handlePostComment}
            disabled={postingComment || !isLoggedIn || !comment.trim()}
            hitSlop={HIT_SLOP}
          >
            {postingComment ? (
              <ActivityIndicator color={theme.text} />
            ) : (
              <Text style={[styles.buttonText, { color: theme.text }]}>
                {isReply
                  ? tr('wish.sendReply', 'Send reply')
                  : tr('wish.sendComment', 'Send comment')}
              </Text>
            )}
          </TouchableOpacity>
          <ReportDialog
            visible={reportVisible}
            onClose={() => {
              setReportVisible(false);
              setReportTarget(null);
            }}
            onSubmit={handleReport}
          />

          {wish?.fulfillmentLink ? (
            <TouchableOpacity
              onPress={() => {
                trackEvent('open_fulfillment_link');
                RNLinking.openURL(wish.fulfillmentLink!);
              }}
              style={{ marginTop: 8 }}
            >
              <Text style={{ color: theme.tint }}>View Fulfillment Link</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.button, { backgroundColor: theme.tint }]}
              onPress={() => setFulfillmentVisible(true)}
              hitSlop={HIT_SLOP}
            >
              <Text style={[styles.buttonText, { color: theme.text }]}>
                Fulfill this Wish
              </Text>
            </TouchableOpacity>
          )}

          <FulfillmentLinkDialog
            visible={fulfillmentVisible}
            onClose={() => setFulfillmentVisible(false)}
            onSubmit={(link) => {
              setFulfillmentVisible(false);
              handleFulfillWish(link);
            }}
          />

          {anonFavEnabled && (
            <Modal
              transparent
              animationType="fade"
              visible={favoriteModalVisible}
              onRequestClose={() => setFavoriteModalVisible(false)}
            >
              <View style={styles.modalBackdrop}>
                <View
                  style={[styles.modalCard, { backgroundColor: theme.input }]}
                >
                  <Text style={[styles.modalText, { color: theme.text }]}>
                    {tr('wish.favoriteAddTitle', 'Add a quick note (optional)')}
                  </Text>
                  <TextInput
                    style={[
                      styles.favoriteNoteInput,
                      {
                        backgroundColor: theme.background,
                        color: theme.text,
                      },
                    ]}
                    placeholder={tr(
                      'wish.favoriteAddPlaceholder',
                      'What do you love about this wish?',
                    )}
                    placeholderTextColor={theme.placeholder}
                    value={favoriteNote}
                    onChangeText={(value) =>
                      setFavoriteNote(value.slice(0, 90))
                    }
                    multiline
                    maxLength={90}
                  />
                  <View style={styles.modalActionRow}>
                    <TouchableOpacity
                      onPress={() => setFavoriteModalVisible(false)}
                      style={[
                        styles.modalActionButton,
                        { borderColor: theme.placeholder },
                      ]}
                    >
                      <Text
                        style={[
                          styles.modalActionText,
                          { color: theme.placeholder },
                        ]}
                      >
                        {tr('common.cancel', 'Cancel')}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        void handleFavoriteConfirm();
                      }}
                      style={[
                        styles.modalActionButton,
                        { backgroundColor: theme.tint },
                      ]}
                      disabled={anonFavLoading}
                      accessibilityState={
                        anonFavLoading ? { busy: true } : undefined
                      }
                    >
                      <Text
                        style={[styles.modalActionText, { color: theme.text }]}
                      >
                        {anonFavLoading
                          ? tr('common.saving', 'Saving…')
                          : tr('wish.favoriteAddConfirm', 'Save favorite')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Modal>
          )}

          {editing && wish && (
            <Modal
              transparent
              animationType="fade"
              visible
              onRequestClose={() => setEditing(false)}
            >
              <View style={styles.modalBackdrop}>
                <View
                  style={[styles.modalCard, { backgroundColor: theme.input }]}
                >
                  <Text style={[styles.modalText, { color: theme.text }]}>
                    Edit Wish
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        marginTop: 10,
                        backgroundColor: theme.input,
                        color: theme.text,
                      },
                    ]}
                    placeholder="Wish text"
                    placeholderTextColor={theme.placeholder}
                    value={editText}
                    onChangeText={setEditText}
                  />
                  <TextInput
                    style={[
                      styles.input,
                      { backgroundColor: theme.input, color: theme.text },
                    ]}
                    placeholder="Category"
                    placeholderTextColor={theme.placeholder}
                    value={editCategory}
                    onChangeText={setEditCategory}
                  />
                  <TouchableOpacity
                    onPress={handleUpdateWish}
                    style={[styles.button, { backgroundColor: theme.tint }]}
                    hitSlop={HIT_SLOP}
                  >
                    <Text style={[styles.buttonText, { color: theme.text }]}>
                      Save
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setEditing(false)}
                    style={[styles.button, { backgroundColor: theme.input }]}
                    hitSlop={HIT_SLOP}
                  >
                    <Text style={[styles.buttonText, { color: theme.text }]}>
                      Cancel
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>
          )}

          {giftTogetherEnabled && wish?.id ? (
            <GiftTogetherModal
              visible={giftTogetherVisible}
              onClose={() => setGiftTogetherVisible(false)}
              wishId={wish.id}
              wishTitle={wish.text}
              ownerId={wish.userId ?? null}
              currency={currencyCode}
              targetAmountCents={targetAmountCents}
              fundedAmountCents={fundedAmountCents}
              remainingCents={remainingCents ?? null}
              shareLink={giftTogetherLink}
              onOpenChipIn={() => {
                setGiftTogetherVisible(false);
                setChipInVisible(true);
              }}
              isEnabledInvite={isOwner}
            />
          ) : null}

          {splitPayActive && wish?.id ? (
            <ChipInModal
              visible={chipInVisible}
              onClose={() => setChipInVisible(false)}
              wishId={wish.id}
              wishTitle={wish.text}
              currency={currencyCode}
              remainingCents={remainingCents ?? undefined}
              experimentBucket={experimentBucket}
              onCompleted={() => {
                clearWishMetaCache(wish.id);
                void fetchWish();
              }}
            />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 100,
    flexGrow: 1,
  },
  backButton: {
    marginBottom: 10,
  },
  backButtonText: {
    fontSize: 16,
  },
  banner: {
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  wishBox: {
    padding: 14,
    borderRadius: 10,
    marginBottom: 20,
  },
  wishHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  wishCategory: {
    fontSize: 12,
    fontWeight: '600',
  },
  stageContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
    marginHorizontal: -4,
  },
  stageChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    marginHorizontal: 4,
    marginBottom: 6,
  },
  stageChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  stageDescription: {
    fontSize: 13,
    marginTop: 6,
  },
  stageNudge: {
    fontSize: 13,
    marginTop: 2,
    fontStyle: 'italic',
  },
  circleBanner: {
    marginTop: 10,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  circleBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  circleBannerSubtitle: {
    fontSize: 12,
    marginTop: 4,
  },
  favoriteSummary: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
  },
  favoriteSummaryText: {
    fontSize: 14,
    fontWeight: '600',
  },
  favoriteQuote: {
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: 6,
  },
  favoriteNoteInput: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 12,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
  modalActionButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  modalActionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  circleBannerButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginLeft: 12,
  },
  circleBannerButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  wishText: {
    fontSize: 16,
    fontWeight: '500',
    marginTop: 4,
  },
  preview: {
    width: '100%',
    height: 200,
    borderRadius: 10,
    marginTop: 8,
  },
  likes: {
    fontSize: 14,
    marginTop: 8,
    fontWeight: '500',
  },
  boostedLabel: {
    color: '#facc15',
    fontSize: 12,
    marginTop: 4,
  },
  pollOption: {
    backgroundColor: '#2e2e2e',
    padding: 10,
    borderRadius: 8,
    marginTop: 6,
  },
  pollOptionText: {
    textAlign: 'center',
  },
  fundingCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
  },
  splitPayCard: {
    marginTop: 12,
    padding: 16,
    borderRadius: 14,
    gap: 12,
  },
  splitPayStats: {
    fontSize: 14,
    fontWeight: '600',
  },
  splitPayDeadline: {
    fontSize: 12,
  },
  splitPayButton: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  splitPayButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  splitPayStatusText: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 4,
  },
  splitPayActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  splitPaySecondaryButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  splitPaySecondaryText: {
    fontSize: 13,
    fontWeight: '600',
  },
  supportCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    gap: 8,
  },
  supportCardTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  supportCardText: {
    fontSize: 14,
    lineHeight: 20,
  },
  fundingProgressOuter: {
    height: 10,
    borderRadius: 999,
    overflow: 'hidden',
  },
  fundingProgressInner: {
    height: 10,
    borderRadius: 999,
  },
  fundingInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  fundingLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  fundingPercent: {
    fontSize: 13,
    fontWeight: '600',
  },
  fundingSupporters: {
    fontSize: 12,
    marginTop: 6,
  },
  commentBox: {
    backgroundColor: '#1a1a1a',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  replyInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  successToast: {
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  successToastText: {
    fontSize: 13,
    fontWeight: '600',
  },
  signInNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  nickname: {
    fontSize: 12,
    marginBottom: 2,
  },
  comment: {
    fontSize: 14,
  },
  timestamp: {
    fontSize: 10,
    marginTop: 4,
  },
  label: {
    marginBottom: 4,
  },
  input: {
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
  },
  errorText: {
    color: '#f87171',
    textAlign: 'center',
    marginTop: 20,
  },
  button: {
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    padding: 20,
    borderRadius: 10,
    width: '80%',
  },
  modalText: {
    fontSize: 16,
    textAlign: 'center',
  },
});
