import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter, type Href } from 'expo-router';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  Animated,
  Switch,
  Platform,
  ToastAndroid,
  FlatList,
  Share,
  Modal,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ConfettiCannon from 'react-native-confetti-cannon';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { Colors } from '@/constants/Colors';
import { getDailyPromptForDate } from '@/constants/prompts';
import { useAuthSession } from '@/contexts/AuthSessionContext';
import { useAuthFlows } from '@/contexts/AuthFlowsContext';
import { useProfile } from '@/hooks/useProfile';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from '@/contexts/I18nContext';
import { useEngagementStats } from '@/hooks/useEngagementStats';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  collectionGroup,
  limit,
  startAfter,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/firebase';
import type { Wish } from '@/types/Wish';
import { useSavedWishes } from '@/contexts/SavedWishesContext';
import * as logger from '@/shared/logger';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { getLocalDateKey } from '@/helpers/date';

const CAN_USE_NATIVE_DRIVER = Platform.OS !== 'web';

type QuickAction = {
  key: string;
  label: string;
  description?: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  disabled?: boolean;
};

export default function Page() {
  const { user, profile } = useAuthSession();
  const { signOut } = useAuthFlows();
  const { updateProfile, pickImage } = useProfile();
  const router = useRouter();
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [saving, setSaving] = useState(false);
  const [boostCount, setBoostCount] = useState(0);
  const [latestBoost, setLatestBoost] = useState<Wish | null>(null);
  const [streakCount, setStreakCount] = useState(0);
  const [dailyPrompt, setDailyPrompt] = useState<string | null>(null);
  const [latestWish, setLatestWish] = useState<Wish | null>(null);
  const [reflectionHistory, setReflectionHistory] = useState<
    { text: string; timestamp: number }[]
  >([]);
  const [boostImpact, setBoostImpact] = useState({ likes: 0, comments: 0 });
  const [giftStats, setGiftStats] = useState({ count: 0, total: 0 });
  const [giftMessages, setGiftMessages] = useState<{ text: string; ts: Timestamp }[]>(
    [],
  );
  const [savedList, setSavedList] = useState<Wish[]>([]);
  const [postedList, setPostedList] = useState<Wish[]>([]);
  const [giftedList, setGiftedList] = useState<Wish[]>([]);
  const [postLastDoc, setPostLastDoc] = useState<any | null>(null);
  const [giftLastDoc, setGiftLastDoc] = useState<any | null>(null);
  const [savedNextIndex, setSavedNextIndex] = useState(0);
  const [loadingPosted, setLoadingPosted] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [loadingGifts, setLoadingGifts] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const DISPLAY_NAME_MAX = 30;
  const BIO_MAX = 160;
  const [dailyReminder, setDailyReminder] = useState(false);
  const [referralCount, setReferralCount] = useState(0);
  const [followCounts, setFollowCounts] = useState({
    following: 0,
    followers: 0,
  });
  const [activeTab, setActiveTab] = useState<'posted' | 'saved' | 'gifts'>(
    'posted',
  );
  const boostAnim = useRef(new Animated.Value(1)).current;
  const giftQuerySuppressed = useRef(false);
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { stats: engagementStats } = useEngagementStats(user?.uid);
  const postingStats = engagementStats.posting;
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const { saved } = useSavedWishes();
  const { isActive: isSupporter } = useSubscription();
  const publicEnabled = profile?.publicProfileEnabled !== false;
  const profileDisplayName = profile?.displayName ?? '';
  const [editVisible, setEditVisible] = useState(false);
  const [editName, setEditName] = useState(displayName || '');
  const [editBio, setEditBio] = useState(bio || '');
  const togglePublicProfile = useCallback(
    async (val: boolean) => {
      try {
        await updateProfile({ publicProfileEnabled: val });
      } catch (err) {
        logger.warn('Failed to toggle public profile', err);
      }
    },
    [updateProfile],
  );

  const profileCompletion = useMemo(() => {
    let total = 4;
    let done = 0;
    if ((displayName || '').trim().length > 0) done += 1;
    if ((bio || '').trim().length > 0) done += 1;
    if (profile?.photoURL) done += 1;
    if (profile?.publicProfileEnabled !== false) done += 1;
    return Math.round((done / total) * 100);
  }, [displayName, bio, profile?.photoURL, profile?.publicProfileEnabled]);

  // Simple concurrency limiter for parallel fetches
  const mapWithConcurrency = useCallback(
    async <T, R>(
      items: readonly T[],
      limit: number,
      mapper: (item: T, index: number) => Promise<R>,
    ): Promise<R[]> => {
      const results: R[] = new Array(items.length) as R[];
      let i = 0;
      const worker = async () => {
        while (i < items.length) {
          const idx = i++;
          try {
            results[idx] = await mapper(items[idx], idx);
          } catch {
            // @ts-expect-error allow sparse undefined results
            results[idx] = undefined;
          }
        }
      };
      const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
      await Promise.all(workers);
      return results;
    },
    [],
  );

  // Keep form fields in sync when profile updates
  useEffect(() => {
    setDisplayName(profile?.displayName || '');
    setBio(profile?.bio || '');
  }, [profile?.displayName, profile?.bio]);

  const handleSave = useCallback(async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    setSaving(true);
    try {
      await updateProfile({ displayName, bio });
      if (Platform.OS === 'android') {
        ToastAndroid.show(t('profile.saved', 'Profile saved'), ToastAndroid.SHORT);
      } else {
        alert(t('profile.saved', 'Profile saved'));
      }
    } catch (err) {
      const msg = t('profile.saveFailed', 'Failed to save profile');
      if (Platform.OS === 'android') {
        ToastAndroid.show(msg, ToastAndroid.SHORT);
      } else {
        alert(msg);
      }
      logger.warn('Failed to save profile', err);
    } finally {
      setSaving(false);
    }
  }, [updateProfile, displayName, bio, t]);

  const handleImage = useCallback(async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    await pickImage();
  }, [pickImage]);

  const handleCopyLink = useCallback(async () => {
    if (!profileDisplayName) return;
    const encoded = encodeURIComponent(profileDisplayName);
    const url = Linking.createURL(`/profile/${encoded}`);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    await Clipboard.setStringAsync(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [profileDisplayName]);

  const handleShareProfile = useCallback(async () => {
    if (!profileDisplayName) return;
    const encoded = encodeURIComponent(profileDisplayName);
    const url = Linking.createURL(`/profile/${encoded}`);
    try {
      await Share.share({ message: url });
    } catch (err) {
      logger.warn('Failed to share profile', err);
    }
  }, [profileDisplayName]);

  const handlePreviewProfile = useCallback(() => {
    if (!displayName) return;
    const encoded = encodeURIComponent(displayName);
    router.push(`/profile/${encoded}` as Href);
  }, [displayName, router]);

  const quickActions = useMemo<QuickAction[]>(() => {
    const actions: QuickAction[] = [
      {
        key: 'edit',
        label: t('profile.quick.editLabel', 'Edit profile'),
        description: t('profile.quick.editDescription', 'Update your name and bio'),
        icon: 'create-outline',
        onPress: () => {
          setEditName(displayName || '');
          setEditBio(bio || '');
          setEditVisible(true);
        },
      },
      {
        key: 'photo',
        label: t('profile.quick.photoLabel', 'Change photo'),
        description: t('profile.quick.photoDescription', 'Refresh your avatar'),
        icon: 'camera-outline',
        onPress: handleImage,
      },
      {
        key: 'copy',
        label: t('profile.quick.copyLink', 'Copy link'),
        description: t('profile.quick.copyDescription', 'Copy your public profile URL'),
        icon: 'link-outline',
        onPress: handleCopyLink,
        disabled: !profileDisplayName,
      },
      {
        key: 'share',
        label: t('profile.quick.share', 'Share profile'),
        description: t('profile.quick.shareDescription', 'Send your profile to a friend'),
        icon: 'share-outline',
        onPress: handleShareProfile,
        disabled: !profileDisplayName,
      },
      {
        key: 'preview',
        label: t('profile.quick.preview', 'Preview public view'),
        description: t('profile.quick.previewDescription', 'See what others can view'),
        icon: 'eye-outline',
        onPress: handlePreviewProfile,
        disabled: !profileDisplayName,
      },
      {
        key: 'journal',
        label: t('profile.quick.journal', 'Open journal'),
        description: t('profile.quick.journalDescription', 'Jump into your personal entries'),
        icon: 'book-outline',
        onPress: () => router.push('/journal'),
      },
    ];
    if (!isSupporter) {
      actions.unshift({
        key: 'supporter',
        label: t('profile.quick.supporter', 'Become a supporter'),
        description: t('profile.quick.supporterDescription', 'Unlock higher-quality images, badges, and more'),
        icon: 'star-outline',
        onPress: () => router.push('/(tabs)/profile/settings/subscriptions' as Href),
      });
    }
    return actions;
  }, [
    bio,
    displayName,
    handleCopyLink,
    handlePreviewProfile,
    handleShareProfile,
    handleImage,
    isSupporter,
    profileDisplayName,
    router,
    t,
  ]);

  const toggleReminder = useCallback(async (val: boolean) => {
    if (val) {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        return;
      }
    }
    setDailyReminder(val);
    await AsyncStorage.setItem('dailyPromptReminder', val ? 'true' : 'false');
    const id = await AsyncStorage.getItem('dailyPromptReminderId');
    if (id) await Notifications.cancelScheduledNotificationAsync(id);
    if (val) {
      const newId = await Notifications.scheduleNotificationAsync({
        content: {
          title: t('notifications.dailyPromptTitle'),
          body: t('notifications.dailyPromptBody'),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
          hour: 9,
          minute: 0,
          repeats: true,
        },
      });
      await AsyncStorage.setItem('dailyPromptReminderId', newId);
    }
  }, [t]);

  const loadMorePosted = useCallback(async () => {
    if (!postLastDoc || !user?.uid) return;
    try {
      setLoadingMore(true);
      const snap = await getDocs(
        query(
          collection(db, 'wishes'),
          where('userId', '==', user.uid),
          orderBy('timestamp', 'desc'),
          startAfter(postLastDoc),
          limit(20),
        ),
      );
      setPostLastDoc(snap.docs[snap.docs.length - 1] || postLastDoc);
      const mapped = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Wish, 'id'>),
      })) as Wish[];
      const more = mapped.filter(
        (w) => !w.expiresAt || w.expiresAt.toDate() > new Date(),
      );
      setPostedList((prev) => [...prev, ...more]);
      setError(null);
    } catch (err) {
      logger.warn('Failed to load more posts', err);
      setError("Couldn't load data. Check your connection and try again.");
    } finally {
      setLoadingMore(false);
    }
  }, [postLastDoc, user?.uid]);

  const loadMoreGifts = useCallback(async () => {
    if (!user?.uid || giftQuerySuppressed.current) return;
    try {
      setLoadingMore(true);
      const snap = await getDocs(
        query(
          collectionGroup(db, 'gifts'),
          where('recipientId', '==', user.uid),
          orderBy('timestamp', 'desc'),
          startAfter(giftLastDoc),
          limit(20),
        ),
      );
      setGiftLastDoc(snap.docs[snap.docs.length - 1] || giftLastDoc);
      const ids = new Set<string>();
      snap.forEach((d) => {
        const parts = d.ref.path.split('/');
        if (parts.length >= 2) ids.add(parts[1]);
      });
      const fetched = await mapWithConcurrency(Array.from(ids), 4, async (id) => {
        try {
          const w = await getDoc(doc(db, 'wishes', id));
          if (w.exists()) {
            return { id: w.id, ...(w.data() as Omit<Wish, 'id'>) } as Wish;
          }
        } catch (err) {
          logger.warn('Failed to load more gifted wish by id', { id, err });
        }
        return undefined;
      });
      const toAdd = (fetched.filter(Boolean) as Wish[]).filter(
        (wish) => !giftedList.find((g) => g.id === wish.id),
      );
      toAdd.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
      setGiftedList((prev) => [...prev, ...toAdd]);
    } catch (err: any) {
      logger.warn('Failed to load more gifts', err);
      if (err?.code === 'failed-precondition') {
        setError(
          t(
            'profile.errors.giftIndexMissing',
            'Gifts are still syncing. Firestore is creating the required index; try again shortly.',
          ),
        );
      } else if (err?.code === 'permission-denied') {
        giftQuerySuppressed.current = true;
        setError(
          t(
            'profile.errors.giftPermission',
            "We couldn't load your gifts because of a permissions check. Contact support if this keeps happening.",
          ),
        );
      } else {
        setError(
          t('profile.errors.giftLoad', 'We could not load your gifts. Please try again soon.'),
        );
      }
    } finally {
      setLoadingMore(false);
    }
  }, [user?.uid, giftLastDoc, giftedList, mapWithConcurrency, t]);

  const loadMoreSaved = useCallback(async () => {
    if (!user?.uid) return;
    try {
      setLoadingMore(true);
      const ids = Object.keys(saved);
      const PAGE = 20;
      const slice = ids.slice(savedNextIndex, savedNextIndex + PAGE);
      const fetched = await mapWithConcurrency(slice, 4, async (id) => {
        try {
          const d = await getDoc(doc(db, 'wishes', id));
          if (d.exists()) {
            return { id: d.id, ...(d.data() as Omit<Wish, 'id'>) } as Wish;
          }
        } catch (err) {
          logger.warn('Failed to load saved wish by id', { id, err });
        }
        return undefined;
      });
      const list = fetched.filter(Boolean) as Wish[];
      list.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
      setSavedList((prev) => [...prev, ...list]);
      setSavedNextIndex((idx) => idx + slice.length);
    } catch (err) {
      logger.warn('Failed to load more saved wishes', err);
    } finally {
      setLoadingMore(false);
    }
  }, [user?.uid, saved, savedNextIndex, mapWithConcurrency]);

  useEffect(() => {
    const load = async () => {
      if (!user?.uid) return;
      try {
        setLoadingPosted(true);
        const snap = await getDocs(
          query(
            collection(db, 'wishes'),
            where('userId', '==', user.uid),
            orderBy('timestamp', 'desc'),
            limit(20),
          ),
        );
        setPostLastDoc(snap.docs[snap.docs.length - 1] || null);
        const mapped = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Wish, 'id'>),
        })) as Wish[];
        const list = mapped.filter(
          (w) => !w.expiresAt || w.expiresAt.toDate() > new Date(),
        );
        setPostedList(list);
        setError(null);
        const active = list.filter(
          (w) =>
            w.boostedUntil &&
            w.boostedUntil.toDate &&
            w.boostedUntil.toDate() > new Date(),
        );
        setBoostCount(active.length);
        if (active.length > 0) {
          active.sort((a, b) =>
            a.boostedUntil!.toDate() < b.boostedUntil!.toDate() ? 1 : -1,
          );
          setLatestBoost(active[0]);
        } else {
          setLatestBoost(null);
        }
        if (list.length > 0) {
          setLatestWish(list[0]);
        }
        const boosted = list.filter((w) => w.boosted != null);
        let likes = 0;
        let comments = 0;
        for (const w of boosted) {
          likes += w.likes || 0;
          try {
            const cSnap = await getDocs(
              collection(db, 'wishes', w.id, 'comments'),
            );
            comments += cSnap.size;
          } catch (err) {
            logger.error('Failed to count comments', err);
          }
        }
        setBoostImpact({ likes, comments });
      } catch (err) {
        logger.warn('Failed to load profile wishes', err);
        setError("Couldn't load data. Check your connection and try again.");
      } finally {
        setLoadingPosted(false);
      }
    };
    load();
  }, [user]);

  useEffect(() => {
    if (boostCount <= 0) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(boostAnim, {
          toValue: 1.2,
          duration: 800,
          useNativeDriver: CAN_USE_NATIVE_DRIVER,
        }),
        Animated.timing(boostAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: CAN_USE_NATIVE_DRIVER,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [boostAnim, boostCount]);

  useEffect(() => {
    const loadLocal = async () => {
      const today = getLocalDateKey();
      const promptFromStorage = await AsyncStorage.getItem('dailyPromptText');
      const prompt = promptFromStorage || getDailyPromptForDate(today);
      if (prompt) setDailyPrompt(prompt);
      const historyRaw = await AsyncStorage.getItem('reflectionHistory');
      if (historyRaw) setReflectionHistory(JSON.parse(historyRaw));
      const reminder = await AsyncStorage.getItem('dailyPromptReminder');
      setDailyReminder(reminder === 'true');
    };
    loadLocal();
  }, []);

  useEffect(() => {
    setStreakCount(postingStats.current);
  }, [postingStats]);

  useEffect(() => {
    if (!user?.uid || giftQuerySuppressed.current) return;
    const loadReferrals = async () => {
      const snap = await getDocs(
        query(collection(db, 'referrals'), where('referrerId', '==', user.uid)),
      );
      setReferralCount(snap.size);
    };
    loadReferrals();
  }, [user, mapWithConcurrency]);

  useEffect(() => {
    if (!user?.uid || giftQuerySuppressed.current) return;
    const loadFollows = async () => {
      const [folSnap, ingSnap] = await Promise.all([
        getDocs(collection(db, 'users', user.uid, 'followers')),
        getDocs(collection(db, 'users', user.uid, 'following')),
      ]);
      setFollowCounts({ followers: folSnap.size, following: ingSnap.size });
    };
    loadFollows();
  }, [user, mapWithConcurrency]);

  useEffect(() => {
    if (!user?.uid) return;
    const loadGifts = async () => {
      try {
        setError(null);
        const snap = await getDocs(
          query(
            collectionGroup(db, 'gifts'),
            where('recipientId', '==', user.uid),
            orderBy('timestamp', 'desc'),
            limit(20),
          ),
        );
        setGiftLastDoc(snap.docs[snap.docs.length - 1] || null);
        let count = 0;
        let total = 0;
        const msgs: { text: string; ts: Timestamp }[] = [];
        const ids = new Set<string>();
        snap.forEach((d) => {
          count += 1;
          total += d.data().amount || 0;
          if (d.data().message) {
            msgs.push({ text: d.data().message, ts: d.data().timestamp });
          }
          const parts = d.ref.path.split('/');
          if (parts.length >= 2) ids.add(parts[1]);
        });
        setGiftStats({ count, total });
        msgs.sort((a, b) => (b.ts?.seconds || 0) - (a.ts?.seconds || 0));
        setGiftMessages(msgs);
        if (ids.size > 0) {
          const fetched = await mapWithConcurrency(Array.from(ids), 4, async (id) => {
            try {
              const d = await getDoc(doc(db, 'wishes', id));
              if (d.exists()) {
                return { id: d.id, ...(d.data() as Omit<Wish, 'id'>) } as Wish;
              }
            } catch (err) {
              logger.warn('Failed to load gifted wish by id', { id, err });
            }
            return undefined;
          });
          const wishes = fetched.filter(Boolean) as Wish[];
          wishes.sort(
            (a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0),
          );
          setGiftedList(wishes);
        }
      } catch (err: any) {
        logger.warn('Failed to load gifts', err);
        setGiftLastDoc(null);
        setGiftStats({ count: 0, total: 0 });
        setGiftMessages([]);
        setGiftedList([]);
        if (err?.code === 'failed-precondition') {
          setError(
            t(
              'profile.errors.giftIndexMissing',
              'Gifts are still syncing. Firestore is creating the required index; try again shortly.',
            ),
          );
        } else if (err?.code === 'permission-denied') {
          giftQuerySuppressed.current = true;
          setError(
            t(
              'profile.errors.giftPermission',
              "We couldn't load your gifts because of a permissions check. Contact support if this keeps happening.",
            ),
          );
        } else {
          setError(
            t('profile.errors.giftLoad', 'We could not load your gifts. Please try again soon.'),
          );
        }
      }
    };
    setLoadingGifts(true);
    loadGifts().finally(() => setLoadingGifts(false));
  }, [user, mapWithConcurrency, t]);

  useEffect(() => {
    const load = async () => {
      if (!user?.uid) return;
      try {
        setLoadingSaved(true);
        setSavedList([]);
        const ids = Object.keys(saved);
        const PAGE = 20;
        const slice = ids.slice(0, PAGE);
        const fetched = await mapWithConcurrency(slice, 4, async (id) => {
          try {
            const d = await getDoc(doc(db, 'wishes', id));
            if (d.exists()) return { id: d.id, ...(d.data() as Omit<Wish, 'id'>) } as Wish;
          } catch (err) {
            logger.warn('Failed to load saved wish by id', { id, err });
          }
          return undefined;
        });
        const list = fetched.filter(Boolean) as Wish[];
        list.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
        setSavedList(list);
        setSavedNextIndex(slice.length);
      } catch (err) {
        logger.warn('Failed to load initial saved wishes', err);
      } finally {
        setLoadingSaved(false);
      }
    };
    load();
  }, [saved, user?.uid, mapWithConcurrency]);

  // Derived list and loading flags by tab
  const currentList = useMemo(() => {
    if (activeTab === 'posted') return postedList;
    if (activeTab === 'saved') return savedList;
    return giftedList;
  }, [activeTab, postedList, savedList, giftedList]);

  const isLoadingTab = activeTab === 'posted' ? loadingPosted : activeTab === 'saved' ? loadingSaved : loadingGifts;

  const onEndReached = useCallback(() => {
    if (loadingMore || isLoadingTab) return;
    if (activeTab === 'posted' && postLastDoc) return void loadMorePosted();
    if (activeTab === 'saved' && savedNextIndex < Object.keys(saved).length)
      return void loadMoreSaved();
    if (activeTab === 'gifts' && giftLastDoc) return void loadMoreGifts();
  }, [activeTab, giftLastDoc, postLastDoc, savedNextIndex, saved, loadMoreGifts, loadMorePosted, loadMoreSaved, loadingMore, isLoadingTab]);

  const renderItem = useCallback(
    ({ item }: { item: Wish }) => {
      const createdAt = item.timestamp?.seconds
        ? new Date(item.timestamp.seconds * 1000)
        : item.timestamp instanceof Date
          ? item.timestamp
          : null;
      return (
        <TouchableOpacity
          onPress={() => router.push(`/wish/${item.id}`)}
          style={styles.itemRow}
          accessibilityRole="button"
          accessibilityLabel={item.text}
        >
          <View style={styles.itemHeaderRow}>
            <Text style={styles.itemTitle} numberOfLines={3}>
              {item.text}
            </Text>
            <Ionicons name="chevron-forward" size={16} style={styles.itemChevron} />
          </View>
          {createdAt ? (
            <Text style={styles.itemMeta}>
              {createdAt.toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </Text>
          ) : null}
        </TouchableOpacity>
      );
    },
    [router, styles.itemRow, styles.itemTitle, styles.itemChevron, styles.itemMeta, styles.itemHeaderRow],
  );

  const ListEmpty = useCallback(() => {
    // Skeleton list while loading, otherwise friendly empty state
    if (isLoadingTab) {
      return (
        <View style={styles.skeletonCard}>
          {Array.from({ length: 6 }).map((_, i) => (
            <ShimmerRow key={i} />
          ))}
        </View>
      );
    }
    const emptyText =
      activeTab === 'posted'
        ? t('profile.empty.posted', 'No posts yet')
        : activeTab === 'saved'
          ? t('profile.empty.saved', 'No saved wishes yet')
          : t('profile.empty.gifts', 'No gifts yet');
    return (
      <View style={styles.emptyCard}>
        <Ionicons name="sparkles-outline" size={20} style={styles.emptyIcon} />
        <Text style={styles.emptyText}>{emptyText}</Text>
      </View>
    );
  }, [activeTab, isLoadingTab, styles.emptyCard, styles.emptyText, styles.emptyIcon, styles.skeletonCard, t]);

  const ListFooter = useCallback(() => {
    if (!loadingMore) return null;
    return (
      <View style={styles.skeletonCard}>
        {Array.from({ length: 3 }).map((_, i) => (
          <ShimmerRow key={i} />
        ))}
      </View>
    );
  }, [loadingMore, styles.skeletonCard]);

  const renderHeader = useCallback(() => (
    <View style={styles.headerSpacing}>
      {error ? (
        <View
          style={[
            styles.alertCard,
            {
              backgroundColor: toRgba(theme.tint, 0.12),
              borderColor: toRgba(theme.tint, 0.35),
            },
          ]}
        >
          <Ionicons name="warning-outline" size={18} style={styles.alertIcon} />
          <Text style={[styles.alertText, { color: theme.text }]}>{error}</Text>
        </View>
      ) : null}
      <View
        style={[
          styles.heroCard,
          { backgroundColor: theme.input, borderColor: theme.placeholder },
        ]}
      >
        <View style={styles.heroHeaderRow}>
          <View style={styles.heroAvatarColumn}>
            <View style={boostCount > 0 || streakCount >= 7 ? styles.avatarGlow : undefined}>
              {profile?.photoURL ? (
                <Image source={{ uri: profile.photoURL }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, { backgroundColor: '#444' }]} />
              )}
              <TouchableOpacity
                onPress={handleImage}
                style={styles.avatarCamera}
                accessibilityRole="button"
                accessibilityLabel={t('profile.changePhoto', 'Change Photo')}
              >
                <Ionicons name="camera" size={16} color="#000" />
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.heroInfoColumn}>
            <View style={styles.heroInfoTop}>
              <Text style={[styles.heroName, { color: theme.text }]}>
                {displayName || t('profile.namePlaceholder', 'Set your name')}
              </Text>
              <TouchableOpacity
                onPress={() => router.push('/(tabs)/profile/settings' as Href)}
                accessibilityRole="button"
                accessibilityLabel={t('profile.openSettings', 'Open settings')}
                style={[styles.heroAction, { backgroundColor: theme.background, borderColor: theme.placeholder }]}
              >
                <Ionicons name="settings-outline" size={18} color={theme.tint} />
              </TouchableOpacity>
            </View>
            {profileDisplayName ? (
              <Text style={[styles.heroHandle, { color: theme.placeholder }]}>@{profileDisplayName}</Text>
            ) : null}
            {bio ? (
              <Text style={[styles.heroBio, { color: theme.text }]}>{bio}</Text>
            ) : (
              <TouchableOpacity onPress={() => { setEditName(displayName || ''); setEditBio(bio || ''); setEditVisible(true); }}>
                <Text style={[styles.heroBioLink, { color: theme.tint }]}>
                  {t('profile.addBio', 'Add a bio')}
                </Text>
              </TouchableOpacity>
            )}
            <View style={styles.heroBadgeRow}>
              {isSupporter ? (
                <View style={[styles.supporterBadge, { backgroundColor: theme.background, borderColor: theme.placeholder }]}>
                  <Text style={[styles.supporterText, { color: theme.tint }]}>
                    {t('profile.supporterBadge', '⭐ Supporter')}
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => router.push('/(tabs)/profile/settings/subscriptions' as Href)}
                  style={[styles.supporterButton, { borderColor: theme.tint }]}
                >
                  <Text style={[styles.supporterButtonText, { color: theme.tint }]}>
                    {t('profile.becomeSupporter', 'Become a Supporter')}
                  </Text>
                </TouchableOpacity>
              )}
              <View style={[styles.followChip, { borderColor: theme.placeholder, backgroundColor: theme.background }]}>
                <Text style={[styles.followChipText, { color: theme.text }]}>
                  {t('profile.followingCount', '{{count}} following', { count: followCounts.following })}
                </Text>
              </View>
              <View style={[styles.followChip, { borderColor: theme.placeholder, backgroundColor: theme.background }]}>
                <Text style={[styles.followChipText, { color: theme.text }]}>
                  {t('profile.followerCount', '{{count}} followers', { count: followCounts.followers })}
                </Text>
              </View>
            </View>
          </View>
        </View>
        <View style={styles.heroStatsRow}>
          <View
            style={[
              styles.heroStatCard,
              { borderColor: theme.placeholder, backgroundColor: theme.background },
            ]}
          >
            <Text style={[styles.heroStatValue, { color: theme.text }]}>{postedList.length}</Text>
            <Text style={[styles.heroStatLabel, { color: theme.placeholder }]}>
              {t('profile.stats.posts', 'Posts')}
            </Text>
          </View>
          <View
            style={[
              styles.heroStatCard,
              { borderColor: theme.placeholder, backgroundColor: theme.background },
            ]}
          >
            <Text style={[styles.heroStatValue, { color: theme.text }]}>{savedList.length}</Text>
            <Text style={[styles.heroStatLabel, { color: theme.placeholder }]}>
              {t('profile.stats.saved', 'Saved')}
            </Text>
          </View>
          <View
            style={[
              styles.heroStatCard,
              { borderColor: theme.placeholder, backgroundColor: theme.background },
            ]}
          >
            <Text style={[styles.heroStatValue, { color: theme.text }]}>{giftStats.count}</Text>
            <Text style={[styles.heroStatLabel, { color: theme.placeholder }]}>
              {t('profile.stats.gifts', 'Gifts')}
            </Text>
          </View>
        </View>
        <View style={styles.completionBox}>
          <View style={[styles.completionTrack, { backgroundColor: theme.background }]}
          >
            <View
              style={[styles.completionFill, { width: `${profileCompletion}%`, backgroundColor: theme.tint }]}
            />
          </View>
          <Text style={[styles.completionText, { color: theme.placeholder }]}>
            {t('profile.completion', 'Profile completeness: {{pct}}%', { pct: profileCompletion })}
          </Text>
        </View>
      </View>

      {quickActions.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickScrollContent}
        >
          {quickActions.map((action) => (
            <TouchableOpacity
              key={action.key}
              style={[
                styles.quickActionCard,
                {
                  backgroundColor: theme.input,
                  borderColor: theme.placeholder,
                  opacity: action.disabled ? 0.5 : 1,
                },
              ]}
              onPress={action.onPress}
              disabled={action.disabled}
            >
              <View
                style={[styles.quickIconWrap, { backgroundColor: theme.background }]}
              >
                <Ionicons name={action.icon} size={18} color={theme.tint} />
              </View>
              <Text style={[styles.quickLabelText, { color: theme.text }]}>
                {action.key === 'copy' && copied
                  ? t('profile.quick.copySuccess', 'Link copied')
                  : action.label}
              </Text>
              {action.description ? (
                <Text style={[styles.quickDescription, { color: theme.placeholder }]}>
                  {action.description}
                </Text>
              ) : null}
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}

      <View
        style={[
          styles.preferenceCard,
          { backgroundColor: theme.input, borderColor: theme.placeholder },
        ]}
      >
        <View style={styles.preferenceRow}>
          <View style={styles.preferenceCopy}>
            <Text style={[styles.preferenceTitle, { color: theme.text }]}>
              {t('settings.privacy.publicProfile', 'Public Profile Enabled')}
            </Text>
            <Text style={[styles.preferenceSubtitle, { color: theme.placeholder }]}>
              {t('profile.publicDescription', 'Allow others to view your wishes and gifts.')}
            </Text>
          </View>
          <Switch value={publicEnabled} onValueChange={togglePublicProfile} />
        </View>
        <View style={styles.preferenceRow}>
          <View style={styles.preferenceCopy}>
            <Text style={[styles.preferenceTitle, { color: theme.text }]}>
              {t('profile.reminderTitle', 'Daily reminder')}
            </Text>
            <Text style={[styles.preferenceSubtitle, { color: theme.placeholder }]}>
              {t('profile.reminderSubtitle', 'Nudge me to check my wishes each morning.')}
            </Text>
          </View>
          <Switch value={dailyReminder} onValueChange={toggleReminder} />
        </View>
      </View>

      <View
        style={[
          styles.detailsCard,
          { backgroundColor: theme.input, borderColor: theme.placeholder },
        ]}
      >
        <Text style={[styles.cardTitle, { color: theme.text }]}>
          {t('profile.detailsTitle', 'Profile details')}
        </Text>
        <Text style={[styles.cardSubtitle, { color: theme.placeholder }]}>
          {t('profile.detailsSubtitle', 'Update how you appear to others.')}
        </Text>
        <Text style={[styles.label, { marginTop: 12 }]}>
          {t('profile.displayNameLabel', 'Display Name')}
        </Text>
        <TextInput
          style={[styles.input, { borderColor: theme.placeholder, backgroundColor: theme.background, color: theme.text }]}
          value={displayName}
          onChangeText={(v) => setDisplayName(v.slice(0, DISPLAY_NAME_MAX))}
          placeholder={t('profile.displayNamePlaceholder', 'Display Name')}
          placeholderTextColor={theme.placeholder}
          maxLength={DISPLAY_NAME_MAX}
        />
        <Text style={[styles.counter, { color: theme.placeholder }]}>
          {displayName.length} / {DISPLAY_NAME_MAX}
        </Text>
        <Text style={styles.label}>{t('profile.bioLabel', 'Bio')}</Text>
        <TextInput
          style={[styles.input, { borderColor: theme.placeholder, backgroundColor: theme.background, color: theme.text, minHeight: 80 }]}
          value={bio}
          onChangeText={(v) => setBio(v.slice(0, BIO_MAX))}
          placeholder={t('profile.bioPlaceholder', 'Bio')}
          placeholderTextColor={theme.placeholder}
          multiline
          maxLength={BIO_MAX}
        />
        <Text style={[styles.counter, { color: theme.placeholder }]}>
          {bio.length} / {BIO_MAX}
        </Text>
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: theme.tint }]}
          onPress={handleSave}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel={t('profile.saveProfile', 'Save Profile')}
        >
          <Text style={[styles.primaryButtonText, { color: theme.background }]}>
            {saving ? t('profile.saving', 'Saving...') : t('profile.saveProfile', 'Save Profile')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.secondaryButton, { borderColor: theme.placeholder }]}
          onPress={() => router.push('/journal')}
          accessibilityRole="button"
          accessibilityLabel={t('profile.openJournal', 'Open Journal')}
        >
          <Text style={[styles.secondaryButtonText, { color: theme.tint }]}>
            {t('profile.openJournal', 'Open Journal')}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabsCard}>
        <View style={styles.tabsHeaderRow}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>
            {t('profile.tabsTitle', 'Your wishes')}
          </Text>
        </View>
        <View style={styles.tabs}>
          {(['posted', 'saved', 'gifts'] as const).map((tabKey) => (
            <TouchableOpacity
              key={tabKey}
              onPress={() => setActiveTab(tabKey)}
              style={[styles.tabItem, activeTab === tabKey && styles.activeTabItem]}
              accessibilityRole="button"
              accessibilityLabel={
                tabKey === 'posted'
                  ? t('profile.tabs.posted', '📝 Posted')
                  : tabKey === 'saved'
                    ? t('profile.tabs.saved', '💾 Saved')
                    : t('profile.tabs.gifts', '💝 Gifts Received')
              }
            >
              <Text style={[styles.tabText, activeTab === tabKey && styles.activeTabText]}>
                {tabKey === 'posted'
                  ? t('profile.tabs.posted', '📝 Posted')
                  : tabKey === 'saved'
                    ? t('profile.tabs.saved', '💾 Saved')
                    : t('profile.tabs.gifts', '💝 Gifts Received')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('profile.boosts.title', '🔥 Boosts')}</Text>
        <Animated.Text style={[styles.boostCount, { transform: [{ scale: boostAnim }] }]}
        >
          {t('profile.boosts.count', 'You\'ve boosted {{count}} wishes 🌟', { count: boostCount })}
        </Animated.Text>
        <Text style={styles.info}>
          {t('profile.boosts.impact', 'Your boosts earned ❤️ {{likes}} likes, 💬 {{comments}} comments', {
            likes: boostImpact.likes,
            comments: boostImpact.comments,
          })}
        </Text>
        {latestBoost && (
          <View style={styles.boostPreview}>
            <Text style={styles.previewText} numberOfLines={2}>
              {latestBoost.text}
            </Text>
            <Text style={[styles.previewText, { color: theme.tint }]}>❤️ {latestBoost.likes}</Text>
          </View>
        )}
      </View>

      {streakCount > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('profile.streak.title', '📅 Streak')}</Text>
          <Text style={styles.info}>
            {t('profile.streak.text', '🔥 {{count}}-day streak — you\'re on fire!', { count: streakCount })}
          </Text>
          {streakCount > 3 && <ConfettiCannon count={40} origin={{ x: 0, y: 0 }} fadeOut />}
        </View>
      )}

      {giftStats.count > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('profile.gifts.title', '💝 Gifts')}</Text>
          <Text style={styles.info}>
            {t('profile.gifts.text', "You've received {{count}} gifts 🎁 (${{total}} total)", {
              count: giftStats.count,
              total: giftStats.total,
            })}
          </Text>
        </View>
      )}

      {giftMessages.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('profile.giftMessages.title', '💌 Messages from Supporters')}</Text>
          {giftMessages.map((m, i) => (
            <Text key={i} style={styles.info}>{m.text}</Text>
          ))}
        </View>
      )}

      {referralCount > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('profile.referrals.title', '🎁 Referrals')}</Text>
          <Text style={styles.info}>
            {t('profile.referrals.text', "You've invited {{count}} people — {{remaining}} more to unlock another reward", {
              count: referralCount,
              remaining: Math.max(0, 4 - referralCount),
            })}
          </Text>
        </View>
      )}

      {profile?.publicProfileEnabled && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('profile.public.title', '🌐 Public Profile')}</Text>
          {profileDisplayName ? (
            <Text style={styles.info}>@{profileDisplayName}</Text>
          ) : null}
          {profile.bio && <Text style={styles.info}>{profile.bio}</Text>}
          {latestWish && (
            <Text style={styles.previewText} numberOfLines={2}>{latestWish.text}</Text>
          )}
          <Text style={styles.info}>{t('profile.public.desc', 'Your profile is public. This is what others see.')}</Text>
          <TouchableOpacity
            onPress={handleCopyLink}
            style={[styles.button, { marginTop: 10 }]}
            accessibilityRole="button"
            accessibilityLabel={t('profile.public.copyLink', 'Copy Link')}
          >
            <Text style={styles.buttonText}>{t('profile.public.copyLink', 'Copy Link')}</Text>
          </TouchableOpacity>
          {copied && (
            <Text style={[styles.info, { color: theme.tint, marginTop: 6 }]}>
              {t('profile.linkCopied', 'Link copied')}
            </Text>
          )}
          {profileDisplayName && (
            <TouchableOpacity
              onPress={() =>
                router.push(
                  `/profile/${encodeURIComponent(profileDisplayName)}` as Href,
                )
              }
              style={[styles.button, { marginTop: 10 }]}
              accessibilityRole="button"
              accessibilityLabel={t('profile.public.preview', 'Preview My Public Profile')}
            >
              <Text style={styles.buttonText}>{t('profile.public.preview', 'Preview My Public Profile')}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {reflectionHistory.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('profile.reflections.title', '🧠 Your reflections this week')}</Text>
          {reflectionHistory.slice(0, 3).map((r, i) => (
            <Text key={i} style={styles.info}>
              {new Date(r.timestamp).toLocaleDateString()} — {r.text}
            </Text>
          ))}
        </View>
      )}

      {dailyPrompt && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('profile.reflection.title', '🧠 Reflection')}</Text>
          <Text style={styles.info}>
            {t('profile.reflection.yesterday', "Yesterday, you said: '{{text}}'", { text: dailyPrompt })}
          </Text>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('profile.reminder.title', '⏰ Daily Prompt Reminder')}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={styles.info}>{t('profile.reminder.text', 'Remind me to post a wish daily')}</Text>
          <Switch
            value={dailyReminder}
            onValueChange={toggleReminder}
            accessibilityRole="switch"
            accessibilityLabel={t('profile.reminder.text', 'Remind me to post a wish daily')}
          />
        </View>
      </View>

      <View style={styles.section}>
        <TouchableOpacity
          style={styles.signOutButton}
          onPress={signOut}
          accessibilityRole="button"
          accessibilityLabel={t('profile.signOut', 'Sign Out')}
        >
          <Text style={styles.signOutText}>{t('profile.signOut', 'Sign Out')}</Text>
        </TouchableOpacity>
        <Text style={[styles.info, styles.sectionNote]}>
          {t('profile.email', 'Email: {{email}}', { email: user?.email || t('profile.anonymous', 'Anonymous') })}
        </Text>
        {profile?.isAnonymous && (
          <Text style={[styles.info, styles.sectionNote]}>
            {t('profile.loggedInAnonymously', 'Logged in anonymously')}
          </Text>
        )}
      </View>
    </View>
  ), [
    activeTab,
    bio,
    copied,
    dailyPrompt,
    displayName,
    error,
    followCounts.followers,
    followCounts.following,
    handleCopyLink,
    handleImage,
    latestBoost,
    latestWish,
    dailyReminder,
    handleSave,
    profile?.bio,
    profile?.photoURL,
    profile?.publicProfileEnabled,
    profile?.isAnonymous,
    profileDisplayName,
    referralCount,
    router,
    saving,
    signOut,
    streakCount,
    styles,
    t,
    isSupporter,
    theme.tint,
    theme.placeholder,
    theme.input,
    theme.background,
    theme.text,
    user?.email,
    boostCount,
    boostAnim,
    boostImpact.likes,
    boostImpact.comments,
    giftMessages,
    giftStats.count,
    giftStats.total,
    reflectionHistory,
    toggleReminder,
    postedList.length,
    savedList.length,
    profileCompletion,
    publicEnabled,
    togglePublicProfile,
    quickActions,
  ]);

  return (
    <SafeAreaView style={styles.safeArea}>
      {editVisible && (
        <Modal transparent animationType="fade" visible onRequestClose={() => setEditVisible(false)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, { backgroundColor: theme.input }]}> 
              <Text style={[styles.sectionTitle, { textAlign: 'center' }]}>{t('profile.editProfile', 'Edit Profile')}</Text>
              <Text style={styles.label}>{t('profile.displayNameLabel', 'Display Name')}</Text>
              <TextInput
                style={styles.input}
                value={editName}
                onChangeText={(v) => setEditName(v.slice(0, DISPLAY_NAME_MAX))}
                placeholder={t('profile.displayNamePlaceholder', 'Display Name')}
                placeholderTextColor={theme.placeholder}
                maxLength={DISPLAY_NAME_MAX}
              />
              <Text style={styles.label}>{t('profile.bioLabel', 'Bio')}</Text>
              <TextInput
                style={[styles.input, { height: 80 }]}
                value={editBio}
                onChangeText={(v) => setEditBio(v.slice(0, BIO_MAX))}
                placeholder={t('profile.bioPlaceholder', 'Bio')}
                placeholderTextColor={theme.placeholder}
                multiline
                maxLength={BIO_MAX}
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={[styles.button, { flex: 1, backgroundColor: theme.input }]}
                  onPress={() => setEditVisible(false)}
                >
                  <Text style={[styles.buttonText, { color: theme.text }]}>{t('common.cancel', 'Cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.button, { flex: 1 }]}
                  onPress={async () => {
                    try {
                      await updateProfile({ displayName: editName, bio: editBio });
                      setDisplayName(editName);
                      setBio(editBio);
                      setEditVisible(false);
                      if (Platform.OS === 'android') { ToastAndroid.show(t('profile.saved', 'Profile saved'), ToastAndroid.SHORT); } else { alert(t('profile.saved', 'Profile saved')); }
                    } catch (err) {
                      logger.warn('Failed to save profile (modal)', err);
                    }
                  }}
                >
                  <Text style={styles.buttonText}>{t('profile.saveProfile', 'Save Profile')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
      <FlatList
        style={[styles.list, { backgroundColor: theme.background }]}
        data={currentList}
        keyExtractor={(w) => w.id}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        ListHeaderComponentStyle={styles.listHeaderSpacing}
        ListEmptyComponent={ListEmpty}
        ListFooterComponent={ListFooter}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
        contentContainerStyle={styles.listContent}
        removeClippedSubviews
        initialNumToRender={10}
        windowSize={11}
      />
    </SafeAreaView>
  );
}

const toRgba = (input: string, alpha: number): string => {
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

const createStyles = (c: (typeof Colors)['light'] & { name: string }) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: c.background,
    },
    list: {
      flex: 1,
    },
    listContent: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 56,
    },
    listHeaderSpacing: {
      paddingBottom: 16,
    },
    headerSpacing: {
      paddingBottom: 16,
    },
    alertCard: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      paddingVertical: 12,
      paddingHorizontal: 16,
      marginBottom: 16,
    },
    alertIcon: {
      color: c.tint,
      marginRight: 10,
    },
    alertText: {
      flex: 1,
      fontSize: 13,
      lineHeight: 18,
    },
    heroCard: {
      borderRadius: 20,
      borderWidth: StyleSheet.hairlineWidth,
      padding: 18,
      marginBottom: 16,
    },
    heroHeaderRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
    },
    heroAvatarColumn: {
      marginRight: 16,
      alignItems: 'center',
    },
    avatar: {
      width: 96,
      height: 96,
      borderRadius: 48,
    },
    avatarGlow: {
      borderRadius: 50,
      ...Platform.select({
        web: { boxShadow: `0px 0px 20px ${toRgba(c.tint, 0.45)}` },
        default: {
          shadowColor: c.tint,
          shadowOpacity: 0.9,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 0 },
          elevation: 10,
        },
      }),
    },
    avatarCamera: {
      position: 'absolute',
      right: -6,
      bottom: -6,
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: '#fff',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: '#ddd',
    },
    heroInfoColumn: {
      flex: 1,
    },
    heroInfoTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 8,
    },
    heroName: {
      fontSize: 22,
      fontWeight: '700',
    },
    heroHandle: {
      fontSize: 13,
      marginTop: 2,
    },
    heroBio: {
      marginTop: 8,
      fontSize: 14,
      lineHeight: 20,
    },
    heroBioLink: {
      marginTop: 8,
      fontSize: 14,
      fontWeight: '600',
    },
    heroBadgeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: 12,
    },
    supporterBadge: {
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      paddingVertical: 4,
      paddingHorizontal: 10,
      marginRight: 8,
      marginBottom: 8,
    },
    supporterText: {
      fontSize: 12,
      fontWeight: '600',
    },
    supporterButton: {
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      paddingVertical: 6,
      paddingHorizontal: 12,
      marginRight: 8,
      marginBottom: 8,
    },
    supporterButtonText: {
      fontSize: 12,
      fontWeight: '600',
    },
    followChip: {
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      paddingVertical: 6,
      paddingHorizontal: 12,
      marginRight: 8,
      marginBottom: 8,
    },
    followChipText: {
      fontSize: 12,
      fontWeight: '600',
    },
    heroAction: {
      padding: 10,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
    },
    heroStatsRow: {
      flexDirection: 'row',
      marginTop: 12,
    },
    heroStatCard: {
      flex: 1,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      paddingVertical: 12,
      paddingHorizontal: 12,
      marginHorizontal: 4,
      alignItems: 'center',
    },
    heroStatValue: {
      fontSize: 18,
      fontWeight: '700',
    },
    heroStatLabel: {
      fontSize: 12,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginTop: 4,
      color: c.placeholder,
    },
    completionBox: {
      marginTop: 16,
    },
    completionTrack: {
      height: 8,
      borderRadius: 999,
      backgroundColor: c.input,
      overflow: 'hidden',
    },
    completionFill: {
      height: 8,
      backgroundColor: c.tint,
    },
    completionText: {
      marginTop: 6,
      fontSize: 12,
      color: c.placeholder,
      textAlign: 'right',
    },
    quickScrollContent: {
      paddingHorizontal: 20,
      paddingBottom: 12,
    },
    quickActionCard: {
      width: 200,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      padding: 16,
      marginRight: 12,
    },
    quickIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },
    quickLabelText: {
      fontSize: 14,
      fontWeight: '600',
    },
    quickDescription: {
      fontSize: 12,
      lineHeight: 18,
      marginTop: 4,
    },
    preferenceCard: {
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      padding: 16,
      marginBottom: 16,
    },
    preferenceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    preferenceCopy: {
      flex: 1,
      marginRight: 12,
    },
    preferenceTitle: {
      fontSize: 14,
      fontWeight: '600',
    },
    preferenceSubtitle: {
      fontSize: 12,
      lineHeight: 18,
      marginTop: 2,
    },
    detailsCard: {
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      padding: 16,
      marginBottom: 16,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: '700',
    },
    cardSubtitle: {
      fontSize: 13,
      lineHeight: 18,
      marginTop: 4,
    },
    label: {
      color: c.text,
      fontWeight: '600',
      marginBottom: 6,
    },
    input: {
      backgroundColor: c.input,
      color: c.text,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.placeholder,
      marginBottom: 10,
    },
    counter: {
      color: c.placeholder,
      fontSize: 12,
      textAlign: 'right',
      marginBottom: 10,
    },
    primaryButton: {
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: 8,
    },
    primaryButtonText: {
      fontWeight: '700',
      fontSize: 14,
    },
    secondaryButton: {
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      paddingVertical: 10,
      alignItems: 'center',
      marginTop: 12,
    },
    secondaryButtonText: {
      fontWeight: '600',
      fontSize: 14,
    },
    tabsCard: {
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      padding: 16,
      marginBottom: 16,
    },
    tabsHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    tabs: {
      flexDirection: 'row',
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.placeholder,
      overflow: 'hidden',
    },
    tabItem: {
      flex: 1,
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    activeTabItem: {
      backgroundColor: c.tint,
    },
    tabText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.text,
    },
    activeTabText: {
      color: c.background,
    },
    section: {
      backgroundColor: c.input,
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      padding: 16,
      marginBottom: 16,
    },
    skeletonCard: {
      backgroundColor: c.input,
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.placeholder,
      padding: 16,
      marginBottom: 16,
    },
    emptyCard: {
      backgroundColor: c.input,
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.placeholder,
      paddingVertical: 24,
      paddingHorizontal: 16,
      alignItems: 'center',
      marginBottom: 16,
    },
    emptyIcon: {
      color: c.placeholder,
      marginBottom: 8,
    },
    emptyText: {
      fontSize: 14,
      color: c.placeholder,
      textAlign: 'center',
    },
    sectionTitle: {
      color: c.text,
      fontWeight: '700',
      fontSize: 15,
      marginBottom: 8,
    },
    boostCount: {
      color: c.tint,
      fontWeight: '600',
      marginBottom: 8,
      textAlign: 'center',
    },
    boostPreview: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.tint,
      padding: 10,
      borderRadius: 12,
      marginTop: 8,
      alignItems: 'center',
    },
    previewText: {
      fontSize: 14,
      color: c.text,
      textAlign: 'center',
    },
    info: {
      color: c.text,
      textAlign: 'left',
      marginTop: 4,
    },
    sectionNote: {
      textAlign: 'center',
      color: c.placeholder,
    },
    itemRow: {
      backgroundColor: c.input,
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.placeholder,
      paddingVertical: 14,
      paddingHorizontal: 16,
      marginBottom: 12,
    },
    itemHeaderRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    itemTitle: {
      flex: 1,
      color: c.text,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '500',
    },
    itemChevron: {
      color: c.placeholder,
      marginLeft: 12,
      marginTop: 2,
    },
    itemMeta: {
      marginTop: 8,
      fontSize: 12,
      color: c.placeholder,
    },
    button: {
      backgroundColor: c.tint,
      paddingVertical: 12,
      borderRadius: 12,
      alignItems: 'center',
      marginTop: 8,
    },
    buttonText: {
      color: c.background,
      fontWeight: '700',
    },
    signOutButton: {
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      paddingVertical: 12,
      backgroundColor: toRgba('#ef4444', 0.12),
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: toRgba('#ef4444', 0.35),
      marginBottom: 12,
    },
    signOutText: {
      color: '#ef4444',
      fontWeight: '600',
    },
    quickWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    quickLabel: {
      fontSize: 13,
      fontWeight: '600',
    },
    quickChip: {
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      paddingVertical: 6,
      paddingHorizontal: 12,
      marginRight: 8,
      marginBottom: 8,
    },
    quickChipText: {
      fontSize: 13,
      fontWeight: '600',
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalCard: {
      width: '100%',
      maxWidth: 360,
      borderRadius: 20,
      padding: 18,
    },
  });

// Lightweight shimmer placeholder without extra deps
const ShimmerRow: React.FC = () => {
  const anim = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 700,
          useNativeDriver: CAN_USE_NATIVE_DRIVER,
        }),
        Animated.timing(anim, {
          toValue: 0.3,
          duration: 700,
          useNativeDriver: CAN_USE_NATIVE_DRIVER,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  return (
    <Animated.View
      style={{
        height: 44,
        borderRadius: 8,
        marginBottom: 8,
        backgroundColor: '#555',
        opacity: anim,
      }}
    />
  );
};
      
