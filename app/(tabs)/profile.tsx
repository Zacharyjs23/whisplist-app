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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ConfettiCannon from 'react-native-confetti-cannon';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { Colors } from '@/constants/Colors';
import { useAuthSession } from '@/contexts/AuthSessionContext';
import { useAuthFlows } from '@/contexts/AuthFlowsContext';
import { useProfile } from '@/hooks/useProfile';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from '@/contexts/I18nContext';
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
import { db } from '../../firebase';
import type { Wish } from '../../types/Wish';
import { useSavedWishes } from '@/contexts/SavedWishesContext';
import * as logger from '@/shared/logger';
import { useSubscription } from '@/contexts/SubscriptionContext';

const CAN_USE_NATIVE_DRIVER = Platform.OS !== 'web';

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
  const [showSparkle, setShowSparkle] = useState(false);
  const [referralCount, setReferralCount] = useState(0);
  const [followCounts, setFollowCounts] = useState({
    following: 0,
    followers: 0,
  });
  const [activeTab, setActiveTab] = useState<'posted' | 'saved' | 'gifts'>(
    'posted',
  );
  const prevCredits = useRef<number | null>(profile?.boostCredits ?? null);
  const boostAnim = useRef(new Animated.Value(1)).current;
  const { theme } = useTheme();
  const { t } = useTranslation();
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const { saved } = useSavedWishes();
  const { isActive: isSupporter } = useSubscription();
  const publicEnabled = profile?.publicProfileEnabled !== false;
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
    if (!profile?.displayName) return;
    const url = Linking.createURL(`/profile/${profile.displayName}`);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    await Clipboard.setStringAsync(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [profile?.displayName]);

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
    if (!user?.uid) return;
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
    } catch (err) {
      logger.warn('Failed to load more gifts', err);
    } finally {
      setLoadingMore(false);
    }
  }, [user?.uid, giftLastDoc, giftedList, mapWithConcurrency]);

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
        const totalBoosts = boosted.length;
        if ([5, 10, 20].includes(totalBoosts)) {
          setShowSparkle(true);
          setTimeout(() => setShowSparkle(false), 3000);
        }
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
      const streak = await AsyncStorage.getItem('streakCount');
      if (streak) setStreakCount(parseInt(streak, 10));
      const prompt = await AsyncStorage.getItem('dailyPromptText');
      if (prompt) setDailyPrompt(prompt);
      const historyRaw = await AsyncStorage.getItem('reflectionHistory');
      if (historyRaw) setReflectionHistory(JSON.parse(historyRaw));
      const reminder = await AsyncStorage.getItem('dailyPromptReminder');
      setDailyReminder(reminder === 'true');
    };
    loadLocal();
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    const loadReferrals = async () => {
      const snap = await getDocs(
        query(collection(db, 'referrals'), where('referrerId', '==', user.uid)),
      );
      setReferralCount(snap.size);
    };
    loadReferrals();
  }, [user, mapWithConcurrency]);

  useEffect(() => {
    if (!user?.uid) return;
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
    };
    setLoadingGifts(true);
    loadGifts().finally(() => setLoadingGifts(false));
  }, [user, mapWithConcurrency]);

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

  useEffect(() => {
    if (
      profile?.boostCredits != null &&
      prevCredits.current != null &&
      profile.boostCredits > prevCredits.current
    ) {
      setShowSparkle(true);
      setTimeout(() => setShowSparkle(false), 3000);
    }
    prevCredits.current = profile?.boostCredits ?? null;
  }, [profile?.boostCredits]);

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
    ({ item }: { item: Wish }) => (
      <TouchableOpacity
        onPress={() => router.push(`/wish/${item.id}`)}
        style={[styles.itemRow]}
        accessibilityRole="button"
        accessibilityLabel={item.text}
      >
        <Text style={styles.info}>{item.text}</Text>
      </TouchableOpacity>
    ),
    [router, styles.info, styles.itemRow],
  );

  const ListEmpty = useCallback(() => {
    // Skeleton list while loading, otherwise friendly empty state
    if (isLoadingTab) {
      return (
        <View style={styles.section}>
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
      <View style={styles.section}>
        <Text style={[styles.info, { opacity: 0.7 }]}>{emptyText}</Text>
      </View>
    );
  }, [activeTab, isLoadingTab, styles.section, styles.info, t]);

  const ListFooter = useCallback(() => {
    if (!loadingMore) return null;
    return (
      <View style={[styles.section, { marginTop: 8 }]}> 
        {Array.from({ length: 3 }).map((_, i) => (
          <ShimmerRow key={i} />
        ))}
      </View>
    );
  }, [loadingMore, styles.section]);

  const renderHeader = useCallback(() => (
    <View style={{ paddingBottom: 16 }}>
      <View style={boostCount > 0 || streakCount >= 7 ? styles.avatarGlow : undefined}>
        <View style={{ alignSelf: 'center' }}>
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
      {isSupporter && (
        <View style={{ alignSelf: 'flex-start', backgroundColor: theme.input, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginBottom: 8 }}>
          <Text style={{ color: theme.text, fontWeight: '700' }}>⭐ Supporter</Text>
        </View>
      )}
      {!isSupporter && (
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/settings/subscriptions' as Href)}
          style={[styles.button, { alignSelf: 'flex-start', marginBottom: 10, backgroundColor: theme.tint }]}
          accessibilityRole="button"
          accessibilityLabel={t('profile.becomeSupporter', 'Become a Supporter')}
        >
          <Text style={styles.buttonText}>{t('profile.becomeSupporter', 'Become a Supporter')}</Text>
        </TouchableOpacity>
      )}
      {error && (
        <Text
          style={{ color: theme.tint, textAlign: 'center', marginBottom: 8 }}
        >
          {error}
        </Text>
      )}
      {showSparkle && <ConfettiCannon count={30} origin={{ x: 0, y: 0 }} fadeOut />}

      <TouchableOpacity
        onPress={handleImage}
        style={styles.imageButton}
        accessibilityRole="button"
        accessibilityLabel={t('profile.changePhoto', 'Change Photo')}
      >
        <Text style={styles.imageButtonText}>{t('profile.changePhoto', 'Change Photo')}</Text>
      </TouchableOpacity>
      <Text style={[styles.info, { marginBottom: 10 }]}>
        {t('profile.followCounts', {
          following: followCounts.following,
          followers: followCounts.followers,
        })}
      </Text>

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{postedList.length}</Text>
          <Text style={styles.statLabel}>{t('profile.stats.posts', 'Posts')}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{savedList.length}</Text>
          <Text style={styles.statLabel}>{t('profile.stats.saved', 'Saved')}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{giftStats.count}</Text>
          <Text style={styles.statLabel}>{t('profile.stats.gifts', 'Gifts')}</Text>
        </View>
      </View>

      <View style={styles.completionBox}>
        <View style={styles.completionTrack}>
          <View style={[styles.completionFill, { width: `${profileCompletion}%` }]} />
        </View>
        <Text style={styles.completionText}>
          {t('profile.completion', 'Profile completeness: {{pct}}%', { pct: profileCompletion })}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, alignSelf: 'flex-start' }}>
        <TouchableOpacity
          onPress={handleCopyLink}
          style={[styles.button, { backgroundColor: theme.input }]}
          accessibilityRole="button"
          accessibilityLabel={t('profile.public.copyLink', 'Copy Link')}
        >
          <Text style={[styles.buttonText, { color: theme.text }]}> 
            {copied ? t('profile.linkCopied', 'Link copied') : t('profile.public.copyLink', 'Copy Link')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            setEditName(displayName || '');
            setEditBio(bio || '');
            setEditVisible(true);
          }}
          style={[styles.button, { backgroundColor: theme.input }]}
          accessibilityRole="button"
          accessibilityLabel={t('profile.editProfile', 'Edit Profile')}
        >
          <Text style={[styles.buttonText, { color: theme.text }]}>
            {t('profile.editProfile', 'Edit Profile')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={async () => {
            if (!profile?.displayName) return;
            const url = Linking.createURL(`/profile/${profile.displayName}`);
            try {
              await Share.share({ message: url });
            } catch {}
          }}
          style={[styles.button, { backgroundColor: theme.input }]}
          accessibilityRole="button"
          accessibilityLabel={t('profile.public.share', 'Share Profile')}
        >
          <Text style={[styles.buttonText, { color: theme.text }]}> 
            {t('profile.public.share', 'Share Profile')}
          </Text>
        </TouchableOpacity>
        {displayName ? (
          <TouchableOpacity
            onPress={() => router.push(`/profile/${displayName}` as Href)}
            style={[styles.button, { backgroundColor: theme.input }]}
            accessibilityRole="button"
            accessibilityLabel={t('profile.public.preview', 'Preview My Public Profile')}
          >
            <Text style={[styles.buttonText, { color: theme.text }]}> 
              {t('profile.public.preview', 'Preview My Public Profile')}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Text style={styles.label}>{t('settings.privacy.publicProfile', 'Public Profile Enabled')}</Text>
        <Switch value={publicEnabled} onValueChange={togglePublicProfile} />
      </View>


      <Text style={styles.label}>{t('profile.displayNameLabel', 'Display Name')}</Text>
      <TextInput
        style={styles.input}
        value={displayName}
        onChangeText={(v) => setDisplayName(v.slice(0, DISPLAY_NAME_MAX))}
        placeholder={t('profile.displayNamePlaceholder', 'Display Name')}
        placeholderTextColor={theme.placeholder}
        maxLength={DISPLAY_NAME_MAX}
      />
      <Text style={styles.counter}>{displayName.length} / {DISPLAY_NAME_MAX}</Text>

      <Text style={styles.label}>{t('profile.bioLabel', 'Bio')}</Text>
      <TextInput
        style={[styles.input, { height: 80 }]}
        value={bio}
        onChangeText={(v) => setBio(v.slice(0, BIO_MAX))}
        placeholder={t('profile.bioPlaceholder', 'Bio')}
        placeholderTextColor={theme.placeholder}
        multiline
        maxLength={BIO_MAX}
      />
      <Text style={styles.counter}>{bio.length} / {BIO_MAX}</Text>
      <TouchableOpacity
        style={styles.button}
        onPress={handleSave}
        disabled={saving}
        accessibilityRole="button"
        accessibilityLabel={t('profile.saveProfile', 'Save Profile')}
      >
        <Text style={styles.buttonText}>
          {saving ? t('profile.saving', 'Saving...') : t('profile.saveProfile', 'Save Profile')}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.button, { marginBottom: 10 }]}
        onPress={() => router.push('/journal')}
        accessibilityRole="button"
        accessibilityLabel={t('profile.openJournal', 'Open Journal')}
      >
        <Text style={styles.buttonText}>{t('profile.openJournal', 'Open Journal')}</Text>
      </TouchableOpacity>

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
          <Text style={styles.info}>@{profile.displayName}</Text>
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
          {profile.displayName && (
            <TouchableOpacity
              onPress={() => router.push(`/profile/${profile.displayName}`)}
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

      <TouchableOpacity
        style={styles.signOutButton}
        onPress={signOut}
        accessibilityRole="button"
        accessibilityLabel={t('profile.signOut', 'Sign Out')}
      >
        <Text style={styles.signOutText}>{t('profile.signOut', 'Sign Out')}</Text>
      </TouchableOpacity>
      <Text style={styles.info}>
        {t('profile.email', 'Email: {{email}}', { email: user?.email || t('profile.anonymous', 'Anonymous') })}
      </Text>
      {profile?.isAnonymous && (
        <Text style={styles.info}>{t('profile.loggedInAnonymously', 'Logged in anonymously')}</Text>
      )}
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
    profile?.displayName,
    profile?.photoURL,
    profile?.publicProfileEnabled,
    profile?.isAnonymous,
    referralCount,
    router,
    saving,
    showSparkle,
    signOut,
    streakCount,
    styles,
    t,
    isSupporter,
    theme.tint,
    theme.placeholder,
    theme.input,
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
  ]);

  return (
    <>
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
      style={{ backgroundColor: theme.background }}
      data={currentList}
      keyExtractor={(w) => w.id}
      renderItem={renderItem}
      ListHeaderComponent={renderHeader}
      ListEmptyComponent={ListEmpty}
      ListFooterComponent={ListFooter}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
      contentContainerStyle={{
        padding: 20,
        paddingBottom: 40,
        backgroundColor: theme.background,
      }}
      removeClippedSubviews
      initialNumToRender={10}
      windowSize={11}
    />
    </>
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
    container: {
      flex: 1,
    },
    itemRow: {
      marginBottom: 6,
    },
    avatar: {
      width: 100,
      height: 100,
      borderRadius: 50,
      alignSelf: 'center',
      marginBottom: 10,
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
      right: -4,
      bottom: -4,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: '#fff',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: '#ddd',
      alignSelf: 'center',
    },
    imageButton: {
      alignSelf: 'center',
      marginBottom: 20,
    },
    imageButtonText: {
      color: c.tint,
    },
    label: {
      color: c.text,
      marginBottom: 4,
      fontWeight: '600',
    },
    input: {
      backgroundColor: c.input,
      color: c.text,
      padding: 12,
      borderRadius: 10,
      marginBottom: 10,
    },
    counter: {
      color: c.text,
      opacity: 0.7,
      fontSize: 12,
      alignSelf: 'flex-end',
      marginTop: -6,
      marginBottom: 10,
    },
    button: {
      backgroundColor: c.tint,
      padding: 12,
      borderRadius: 10,
      alignItems: 'center',
      marginBottom: 20,
    },
    buttonText: {
      color: c.text,
      fontWeight: '600',
    },
    statsRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 12,
      gap: 8,
    },
    statItem: {
      flex: 1,
      alignItems: "center",
      backgroundColor: c.input,
      paddingVertical: 8,
      borderRadius: 8,
    },
    statValue: {
      color: c.text,
      fontWeight: "700",
      fontSize: 16,
    },
    statLabel: {
      color: c.placeholder,
      fontSize: 12,
    },
    completionBox: {
      marginBottom: 12,
    },
    completionTrack: {
      height: 8,
      borderRadius: 999,
      backgroundColor: c.input,
      overflow: "hidden",
    },
    completionFill: {
      height: 8,
      backgroundColor: c.tint,
    },
    completionText: {
      color: c.placeholder,
      marginTop: 6,
      fontSize: 12,
    },
    
    signOutButton: {
      alignItems: 'center',
      marginBottom: 20,
    },
    signOutText: {
      color: '#f87171',
    },
    info: {
      color: c.text,
      textAlign: 'center',
      marginTop: 4,
    },
    section: {
      backgroundColor: c.input,
      padding: 12,
      borderRadius: 10,
      marginBottom: 20,
    },
    sectionTitle: {
      color: c.text,
      fontWeight: '600',
      marginBottom: 8,
    },
    boostCount: {
      color: c.tint,
      fontWeight: '600',
      marginBottom: 8,
      textAlign: 'center',
    },
    boostPreview: {
      borderWidth: 1,
      borderColor: c.tint,
      padding: 8,
      borderRadius: 8,
      marginTop: 8,
      alignItems: 'center',
    },
    previewText: {
      fontSize: 14,
      color: c.text,
      textAlign: 'center',
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
      width: '90%',
    },
    tabs: {
      flexDirection: 'row',
      marginBottom: 20,
      borderBottomWidth: 1,
      borderColor: c.tint,
    },
    tabItem: {
      flex: 1,
      paddingVertical: 8,
      alignItems: 'center',
    },
    activeTabItem: {
      borderBottomWidth: 2,
      borderColor: c.tint,
    },
    tabText: {
      color: c.text,
    },
    activeTabText: {
      color: c.tint,
      fontWeight: '600',
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
      
