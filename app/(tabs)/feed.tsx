// app/(tabs)/feed.tsx — Combined Feed Screen with segmented tabs
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  FlatList,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ReportDialog from '../../components/ReportDialog';
import WishCardComponent from '../../components/WishCard';
import {
  listenTrendingWishes,
  listenBoostedWishes,
  getTopBoostedCreators,
  getWhispOfTheDay,
} from '../../helpers/wishes';
import { getFollowingIds } from '../../helpers/followers';
import {
  addDoc,
  collection,
  serverTimestamp,
  getDocs,
  query,
  orderBy,
  where,
  limit,
  startAfter,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { dedupeSortByTimestampDesc } from '../../helpers/merge';
import type { Wish } from '../../types/Wish';
import type { FilterType, PostType } from '@/types/post';
import { POST_TYPE_META, POST_TYPE_ORDER, isPostType, normalizePostType } from '@/types/post';
import { useAuthSession } from '@/contexts/AuthSessionContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from '@/contexts/I18nContext';
import * as logger from '@/shared/logger';
import { trackEvent } from '@/helpers/analytics';

const allCategories = [
  'love',
  'health',
  'career',
  'general',
  'money',
  'friendship',
  'fitness',
];
type Pref = { categories: string[]; type?: PostType | null; manual?: boolean };

export default function Page() {
  const { user } = useAuthSession();
  const { theme } = useTheme();
  const router = useRouter();
  const { t } = useTranslation();

  if (!db) {
    logger.error('Firebase database undefined in feed page');
  }
  if (user === undefined) {
    logger.error('AuthContext returned undefined user');
  }
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [filteredWishes, setFilteredWishes] = useState<Wish[]>([]);
  const [topWishes, setTopWishes] = useState<Wish[]>([]);
  const [leaderboard, setLeaderboard] = useState<
    { userId: string; displayName: string; count: number }[]
  >([]);
  const [whispOfDay, setWhispOfDay] = useState<Wish | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<
    'latest' | 'boosted' | 'trending' | 'forYou'
  >('latest');
  const [searchTerm, setSearchTerm] = useState('');
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [reportVisible, setReportVisible] = useState(false);
  const [reportTarget, setReportTarget] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastVisible, setLastVisible] = useState<any | null>(null);
  const [prefModalVisible, setPrefModalVisible] = useState(false);
  const [prefDraft, setPrefDraft] = useState<Pref>({ categories: [], type: null, manual: true });
  const [prefVersion, setPrefVersion] = useState(0);
  const prefCache = useRef<{ version: number; value: Pref; userId: string | null } | null>(null);
  const filterStorageKey = React.useMemo(
    () => (user?.uid ? `feed.filterType.v1:${user.uid}` : 'feed.filterType.v1:anon'),
    [user?.uid],
  );
  const feedImpressionsRef = useRef<Set<string>>(new Set());

  React.useEffect(() => {
    let cancelled = false;
    const hydrateFilterPreference = async () => {
      try {
        const stored = await AsyncStorage.getItem(filterStorageKey);
        if (cancelled || !stored) return;
        if (stored === 'all' || isPostType(stored)) {
          setFilterType(stored as FilterType);
        }
      } catch (err) {
        logger.warn('Failed to load feed filter preference', err);
      }
    };
    void hydrateFilterPreference();
    return () => {
      cancelled = true;
    };
  }, [filterStorageKey]);

  React.useEffect(() => {
    const persistFilterPreference = async () => {
      try {
        await AsyncStorage.setItem(filterStorageKey, filterType);
      } catch (err) {
        logger.warn('Failed to persist feed filter preference', err);
      }
    };
    void persistFilterPreference();
  }, [filterStorageKey, filterType]);

  React.useEffect(() => {
    feedImpressionsRef.current.clear();
  }, [activeTab, filterType]);

  const matchesFilters = React.useCallback(
    (wish: Wish) => {
      const matchesCategory =
        !selectedCategory || wish.category === selectedCategory;
      const matchesSearch =
        !normalizedSearch ||
        (typeof wish.text === 'string' &&
          wish.text.toLowerCase().includes(normalizedSearch));
      const matchesType =
        filterType === 'all' || normalizePostType(wish.type) === filterType;
      return matchesCategory && matchesSearch && matchesType;
    },
    [filterType, normalizedSearch, selectedCategory],
  );

  const applyFilters = React.useCallback(
    (list: Wish[]) => list.filter(matchesFilters),
    [matchesFilters],
  );

  const typeOptions = React.useMemo(
    () =>
      POST_TYPE_ORDER.map((type) => ({
        key: type,
        label: t(`composer.type.${type}`, POST_TYPE_META[type].defaultChipLabel),
      })),
    [t],
  );

  const typeFilterChips = React.useMemo(
    () =>
      [
        { key: 'all' as FilterType, label: t('feed.filters.allTypes', 'All vibes') },
        ...POST_TYPE_ORDER.map((type) => ({
          key: type as FilterType,
          label: t(`feed.filters.${type}`, POST_TYPE_META[type].defaultChipLabel),
        })),
      ],
    [t],
  );

  const handleWishDeleted = useCallback((id: string) => {
    setFilteredWishes((prev) => prev.filter((w) => w.id !== id));
    setTopWishes((prev) => prev.filter((w) => w.id !== id));
    setWhispOfDay((prev) => (prev?.id === id ? null : prev));
  }, []);

  const readStoredPref = useCallback(async (): Promise<Pref | null> => {
    try {
      const stored = await AsyncStorage.getItem('forYouPref');
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      if (parsed && Array.isArray(parsed.categories)) {
        const normalizedType =
          typeof parsed.type === 'string'
            ? normalizePostType(parsed.type)
            : null;
        return {
          categories: parsed.categories,
          type: normalizedType,
          manual: !!parsed.manual,
        };
      }
    } catch (err) {
      logger.warn('Failed to parse stored feed preferences', err);
    }
    return null;
  }, []);

  const loadPersonalPrefs = useCallback(async (): Promise<Pref> => {
    const cached = prefCache.current;
    const currentUserId = user?.uid ?? null;
    if (
      cached &&
      cached.version === prefVersion &&
      cached.userId === currentUserId
    ) {
      return cached.value;
    }

    const stored = await readStoredPref();
    if (stored?.manual) {
      prefCache.current = {
        version: prefVersion,
        value: stored,
        userId: currentUserId,
      };
      return stored;
    }

    if (!currentUserId) {
      const fallback = stored ?? { categories: [], type: null, manual: false };
      prefCache.current = {
        version: prefVersion,
        value: fallback,
        userId: currentUserId,
      };
      return fallback;
    }
    const snap = await getDocs(
      query(
        collection(db, 'wishes'),
        where('userId', '==', currentUserId),
        orderBy('timestamp', 'desc'),
        limit(10),
      ),
    );
    const cats = new Set<string>();
    const typeCounts: Record<string, number> = {};
    snap.docs.forEach((d) => {
      const data = d.data() as Wish;
      if (data.category) cats.add(data.category);
      if (data.type) {
        const normalized = normalizePostType(data.type);
        typeCounts[normalized] = (typeCounts[normalized] || 0) + 1;
      }
    });
    const favType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    const pref: Pref = {
      categories: Array.from(cats),
      type: favType ? normalizePostType(favType) : null,
      manual: false,
    };
    prefCache.current = {
      version: prefVersion,
      value: pref,
      userId: currentUserId,
    };
    await AsyncStorage.setItem('forYouPref', JSON.stringify(pref));
    return pref;
  }, [user, readStoredPref, prefVersion]);

  const openPrefModal = useCallback(async () => {
    const stored = await readStoredPref();
    const base = stored ?? (await loadPersonalPrefs());
    setPrefDraft({
      categories: Array.isArray(base?.categories) ? base.categories : [],
      type: base?.type ?? null,
      manual: true,
    });
    setPrefModalVisible(true);
  }, [readStoredPref, loadPersonalPrefs]);

  const togglePrefCategory = useCallback((category: string) => {
    setPrefDraft((prev) => {
      const has = prev.categories.includes(category);
      const categories = has
        ? prev.categories.filter((c) => c !== category)
        : [...prev.categories, category];
      return { ...prev, categories };
    });
  }, []);

  const selectPrefType = useCallback((typeKey: PostType | null) => {
    setPrefDraft((prev) => {
      const normalized = typeKey === null ? null : normalizePostType(typeKey);
      const nextType = prev.type === normalized ? null : normalized;
      return { ...prev, type: nextType, manual: true };
    });
  }, []);

  const handleSavePreferences = useCallback(async () => {
    const payload: Pref = {
      categories: prefDraft.categories,
      type: prefDraft.type ?? null,
      manual: true,
    };
    await AsyncStorage.setItem('forYouPref', JSON.stringify(payload));
    prefCache.current = null;
    setPrefVersion((v) => v + 1);
    setPrefModalVisible(false);
  }, [prefDraft]);

  const handleResetPreferences = useCallback(async () => {
    await AsyncStorage.removeItem('forYouPref');
    prefCache.current = null;
    setPrefVersion((v) => v + 1);
    setPrefDraft({ categories: [], type: null, manual: false });
    setPrefModalVisible(false);
  }, []);

  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem('feedTab');
      if (
        stored === 'latest' ||
        stored === 'boosted' ||
        stored === 'trending' ||
        stored === 'forYou'
      ) {
        setActiveTab(stored as any);
      }
    })();
  }, []);

  useEffect(() => {
    AsyncStorage.setItem('feedTab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    try {
      const unsubscribe = listenTrendingWishes((data) => {
        setTopWishes(data.slice(0, 3));
      });
      (async () => {
        try {
          const [topCreators, spotlight] = await Promise.all([
            getTopBoostedCreators(),
            getWhispOfTheDay(),
          ]);
          setLeaderboard(topCreators);
          setWhispOfDay(spotlight);
        } catch (err) {
          logger.warn('Failed to load highlights', err);
        }
      })();
      return unsubscribe;
    } catch (err) {
      logger.error('Failed to listen for trending wishes', err);
      return () => {};
    }
  }, []);

  // Load followed user IDs for prioritizing "For You" feed
  useEffect(() => {
    if (!user) {
      setFollowingIds([]);
      return;
    }
    getFollowingIds(user.uid)
      .then(setFollowingIds)
      .catch((err) => logger.warn('Failed to load following ids', err));
  }, [user]);

  const fetchWishes = useCallback(() => {
    setLoading(true);
    try {
      if (activeTab === 'forYou') {
        (async () => {
          try {
            const pref = await loadPersonalPrefs();
            const snap = await getDocs(
              query(
                collection(db, 'wishes'),
                orderBy('timestamp', 'desc'),
                limit(30),
              ),
            );
            const all = snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Omit<Wish, 'id'>),
            })) as Wish[];
            // Prioritize wishes from followed users
            const followed = all.filter((w) =>
              followingIds.includes(w.userId || ''),
            );
            const others = all.filter(
              (w) => !followingIds.includes(w.userId || ''),
            );
            const ordered = [...followed, ...others];
            let list = ordered.filter(
              (w) =>
                (pref.categories || []).includes(w.category) ||
                (pref.type && w.type === pref.type),
            );
            if (list.length === 0) list = ordered;
            setFilteredWishes(applyFilters(list));
          } catch (err) {
            logger.error('❌ Failed to load personalized wishes:', err);
            setError('Failed to load wishes');
          } finally {
            setLoading(false);
          }
        })();
        return () => {};
      }
      if (activeTab === 'boosted') {
        return listenBoostedWishes((all: Wish[]) => {
          setFilteredWishes(applyFilters(all));
          setLoading(false);
        });
      }

      if (activeTab === 'trending') {
        return listenTrendingWishes((all: Wish[]) => {
          try {
            setFilteredWishes(applyFilters(all));
          } catch (err) {
            logger.error('❌ Failed to filter wishes:', err);
            setError('Failed to load wishes');
          } finally {
            setLoading(false);
          }
        });
      }
      (async () => {
        try {
          const snap = await getDocs(
            query(
              collection(db, 'wishes'),
              orderBy('timestamp', 'desc'),
              limit(20),
            ),
          );
          setLastVisible(snap.docs[snap.docs.length - 1] || null);
          const all = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Wish, 'id'>),
          })) as Wish[];
          setFilteredWishes(applyFilters(all));
        } catch (err) {
          logger.error('❌ Failed to load wishes:', err);
          setError('Failed to load wishes');
        } finally {
          setLoading(false);
        }
      })();
      return () => {};
    } catch (err) {
      logger.error('❌ Failed to load wishes:', err);
      setError('Failed to load wishes');
      setLoading(false);
      return () => {};
    }
  }, [activeTab, applyFilters, followingIds, loadPersonalPrefs]);

  useEffect(() => {
    const unsubscribe = fetchWishes();
    return () => unsubscribe();
  }, [fetchWishes]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (activeTab === 'forYou') {
        const pref = await loadPersonalPrefs();
        const snap = await getDocs(
          query(
            collection(db, 'wishes'),
            orderBy('timestamp', 'desc'),
            limit(30),
          ),
        );
        const all = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Wish, 'id'>),
        })) as Wish[];
        const followed = all.filter((w) =>
          followingIds.includes(w.userId || ''),
        );
        const others = all.filter(
          (w) => !followingIds.includes(w.userId || ''),
        );
        const ordered = [...followed, ...others];
        let list = ordered.filter(
          (w) =>
            (pref.categories || []).includes(w.category) ||
            (pref.type && w.type === pref.type),
        );
        if (list.length === 0) list = ordered;
        setFilteredWishes(applyFilters(list));
      } else if (activeTab === 'boosted') {
        const now = new Date();
        const boostedSnap = await getDocs(
          query(
            collection(db, 'wishes'),
            where('boostedUntil', '>', now),
            orderBy('boostedUntil', 'desc'),
          ),
        );
        const boosted = boostedSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Wish, 'id'>),
        })) as Wish[];
        setFilteredWishes(applyFilters(boosted));
      } else if (activeTab === 'trending') {
        const q = query(
          collection(db, 'wishes'),
          orderBy('likes', 'desc'),
          limit(20),
        );
        const snap = await getDocs(q);
        const all = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Wish, 'id'>),
        })) as Wish[];
        setFilteredWishes(applyFilters(all));
      } else {
        const followingIds = user ? await getFollowingIds(user.uid) : [];

        const now = new Date();
        const boostedSnap = await getDocs(
          query(
            collection(db, 'wishes'),
            where('boostedUntil', '>', now),
            orderBy('boostedUntil', 'desc'),
          ),
        );
        const boosted = boostedSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Wish, 'id'>),
        })) as Wish[];

        let normal: Wish[] = [];
        if (user && followingIds.length) {
          const { chunk } = await import('@/helpers/chunk');
          const chunks: string[][] = chunk(followingIds, 10);
          const snaps = await Promise.all(
            chunks.map((chunk) =>
              getDocs(
                query(
                  collection(db, 'wishes'),
                  where('userId', 'in', chunk),
                  orderBy('timestamp', 'desc'),
                ),
              ),
            ),
          );
          const merged = snaps.flatMap((s) =>
            s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Wish, 'id'>) } as Wish)),
          );
          normal = dedupeSortByTimestampDesc(merged);
        }
        const all = [...boosted, ...normal];
        setFilteredWishes(applyFilters(all));
      }
    } catch (err) {
      logger.error('❌ Failed to refresh wishes:', err);
    } finally {
      setRefreshing(false);
    }
  }, [
    activeTab,
    applyFilters,
    user,
    followingIds,
    loadPersonalPrefs,
  ]);

  const loadMore = useCallback(async () => {
    if (!lastVisible) return;
    try {
      const snap = await getDocs(
        query(
          collection(db, 'wishes'),
          orderBy('timestamp', 'desc'),
          startAfter(lastVisible),
          limit(20),
        ),
      );
      setLastVisible(snap.docs[snap.docs.length - 1] || lastVisible);
      const more = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Wish, 'id'>),
      })) as Wish[];
      setFilteredWishes((prev) => applyFilters([...prev, ...more]));
    } catch (err) {
      logger.error('Failed to load more wishes', err);
    }
  }, [applyFilters, lastVisible]);

  const Skeleton: React.FC = () => (
    <View style={styles.skeletonContainer}>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={[styles.skeletonItem, { backgroundColor: theme.input }]}
        />
      ))}
    </View>
  );

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

  const renderWish = ({ item }: { item: Wish }) => {
    const normalizedType = normalizePostType(item.type);
    if (item.id && !feedImpressionsRef.current.has(item.id)) {
      feedImpressionsRef.current.add(item.id);
      try {
        trackEvent('feed_impression', {
          post_id: item.id,
          post_type: normalizedType,
          tab: activeTab,
          filter_type: filterType,
        });
      } catch {}
    }
    return (
      <WishCardComponent
        wish={item}
        followed={followingIds.includes(item.userId || '')}
        onReport={() => {
          setReportTarget(item.id);
          setReportVisible(true);
        }}
        onDeleted={handleWishDeleted}
      />
    );
  };

  const tabCopy = React.useMemo(
    () => ({
      latest: {
        title: t('feed.tabs.latest', 'Latest'),
        description: t(
          'feed.tabCopy.latest',
          'Fresh posts from across the community.',
        ),
      },
      boosted: {
        title: t('feed.tabs.boosted', 'Boosted'),
        description: t(
          'feed.tabCopy.boosted',
          'Spot the posts currently getting extra love.',
        ),
      },
      trending: {
        title: t('feed.tabs.trending', 'Trending'),
        description: t(
          'feed.tabCopy.trending',
          'What everyone is reacting to most right now.',
        ),
      },
      forYou: {
        title: t('feed.tabs.forYou', 'For You'),
        description: t(
          'feed.tabCopy.forYou',
          'Hand-picked posts based on who and what you follow.',
        ),
      },
    }),
    [t],
  );

  const emptyMessage = React.useMemo(() => {
    if (normalizedSearch) {
      return t('feed.empty.search', 'No posts match your search just yet.');
    }
    if (selectedCategory) {
      return t('feed.empty.category', 'No posts in this category yet.');
    }
    if (filterType !== 'all') {
      return t('feed.empty.typeFallback', 'No posts in this vibe yet. Try another.');
    }
    switch (activeTab) {
      case 'boosted':
        return t('feed.empty.boosted', 'No boosted posts right now. Check back soon ✨');
      case 'trending':
        return t('feed.empty.trending', 'Trending is quiet at the moment. Come back later.');
      case 'forYou':
        return t('feed.empty.forYou', "We couldn't find a match yet. Try adjusting preferences.");
      default:
        return t('feed.empty.default', 'No posts here yet. Be the first to share ✨');
    }
  }, [activeTab, filterType, normalizedSearch, selectedCategory, t]);

  const headerContent = React.useMemo(() => {
    const meta = tabCopy[activeTab];
    const categoryChips = [
      { key: '', label: t('feed.categories.all', 'All') },
      ...allCategories.map((cat) => ({
        key: cat,
        label: cat.charAt(0).toUpperCase() + cat.slice(1),
      })),
    ];

    return (
      <View style={styles.headerWrapper}>
        <View
          style={[
            styles.heroCard,
            {
              backgroundColor: theme.input,
              borderColor: theme.placeholder,
            },
          ]}
        >
          <Text style={[styles.heroTitle, { color: theme.text }]}>
            {t('feed.title', 'Community feed')}
          </Text>
          <Text style={[styles.heroSubtitle, { color: theme.placeholder }]}>
            {meta?.description}
          </Text>
        </View>

        {whispOfDay && (
          <TouchableOpacity
            onPress={() => router.push(`/wish/${whispOfDay.id}`)}
            style={[
              styles.highlightCard,
              {
                backgroundColor: theme.input,
                borderColor: theme.placeholder,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('feed.whispOfDay.open', 'Open Whisp of the Day')}
          >
            <Text style={[styles.highlightTitle, { color: theme.text }]}>
              🌙 {t('feed.whispOfDay.title', 'Whisp of the Day')}
            </Text>
            <Text
              style={[styles.highlightText, { color: theme.text }]}
              numberOfLines={3}
            >
              {whispOfDay.text}
            </Text>
          </TouchableOpacity>
        )}

        {leaderboard.length > 0 && (
          <View
            style={[
              styles.highlightCard,
              {
                backgroundColor: theme.input,
                borderColor: theme.placeholder,
              },
            ]}
          >
            <Text style={[styles.highlightTitle, { color: theme.text }]}>
              🌟 {t('feed.leaderboard.title', 'Top boosted creators this week')}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.leaderboardRow}
            >
              {leaderboard.map((item) => (
                <View
                  key={item.userId}
                  style={[
                    styles.leaderItem,
                    {
                      backgroundColor: theme.background,
                      borderColor: theme.placeholder,
                    },
                  ]}
                >
                  <Text style={{ color: theme.text }}>{item.displayName}</Text>
                  <Text style={{ color: theme.tint }}>🔥 {item.count}x</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        <View
          style={[
            styles.controlsCard,
            {
              backgroundColor: theme.input,
              borderColor: theme.placeholder,
            },
          ]}
        >
          <Text style={[styles.controlsLabel, { color: theme.placeholder }]}>
            {t('feed.searchLabel', 'Search posts')}
          </Text>
          <TextInput
            style={[
              styles.searchInput,
              {
                backgroundColor: theme.background,
                borderColor: theme.placeholder,
                color: theme.text,
              },
            ]}
            placeholder={t('feed.searchPlaceholder', 'Search stories...')}
            placeholderTextColor={theme.placeholder}
            value={searchTerm}
            onChangeText={setSearchTerm}
          />

          <Text style={[styles.controlsLabel, { color: theme.placeholder }]}>
            {t('feed.viewLabel', 'View')}
          </Text>
          <View style={styles.toggleBar}>
            {(['latest', 'boosted', 'trending', 'forYou'] as const).map((tab) => {
              const isActive = activeTab === tab;
              return (
                <TouchableOpacity
                  key={tab}
                  onPress={() => setActiveTab(tab)}
                  style={[
                    styles.toggleButton,
                    {
                      backgroundColor: isActive ? theme.tint : theme.background,
                      borderColor: isActive ? theme.tint : theme.placeholder,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={tabCopy[tab]?.title ?? tab}
                >
                  <Text
                    style={[
                      styles.toggleText,
                      { color: isActive ? theme.background : theme.text },
                    ]}
                  >
                    {tabCopy[tab]?.title ?? tab}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.controlsLabel, { color: theme.placeholder }]}>
            {t('feed.typeLabel', 'Post vibes')}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipScroll}
            contentContainerStyle={styles.chipScrollContent}
          >
            {typeFilterChips.map((chip) => {
              const selected = filterType === chip.key;
              return (
                <TouchableOpacity
                  key={chip.key}
                  onPress={() => setFilterType(chip.key)}
                  style={[
                    styles.categoryChip,
                    {
                      backgroundColor: selected ? theme.tint : theme.background,
                      borderColor: selected ? theme.tint : theme.placeholder,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      { color: selected ? theme.background : theme.text },
                    ]}
                  >
                    {chip.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={[styles.controlsLabel, { color: theme.placeholder }]}>
            {t('feed.categoryLabel', 'Categories')}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipScroll}
            contentContainerStyle={styles.chipScrollContent}
          >
            {categoryChips.map((cat) => {
              const isSelected = selectedCategory === cat.key;
              return (
                <TouchableOpacity
                  key={cat.key}
                  onPress={() =>
                    setSelectedCategory((prev) =>
                      prev === cat.key ? '' : cat.key,
                    )
                  }
                  style={[
                    styles.categoryChip,
                    {
                      backgroundColor: isSelected ? theme.tint : theme.background,
                      borderColor: isSelected ? theme.tint : theme.placeholder,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      { color: isSelected ? theme.background : theme.text },
                    ]}
                  >
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {activeTab === 'forYou' && (
            <TouchableOpacity
              onPress={openPrefModal}
              style={[
                styles.prefButton,
                { backgroundColor: theme.background, borderColor: theme.placeholder },
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('feed.prefButton.accessibility', 'Customize For You preferences')}
            >
              <Text style={[styles.prefButtonText, { color: theme.tint }]}>
                ✨ {t('feed.prefButton.label', 'Customize For You')}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {activeTab === 'trending' && topWishes.length > 0 && (
          <View
            style={[
              styles.topSection,
              {
                backgroundColor: theme.input,
                borderColor: theme.placeholder,
              },
            ]}
          >
            <Text style={[styles.highlightTitle, { color: theme.text }]}>
              🔥 {t('feed.topWishes.title', 'Top posts')}
            </Text>
            {topWishes.map((wish) => (
              <View
                key={wish.id}
                style={[
                  styles.topWish,
                  {
                    backgroundColor: theme.background,
                    borderColor: theme.placeholder,
                  },
                ]}
              >
                <Text style={[styles.topWishText, { color: theme.text }]}>
                  {wish.text}
                </Text>
                <Text style={[styles.likes, { color: theme.tint }]}>❤️ {wish.likes}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  }, [
    activeTab,
    filterType,
    leaderboard,
    openPrefModal,
    router,
    searchTerm,
    selectedCategory,
    setActiveTab,
    setFilterType,
    setSearchTerm,
    setSelectedCategory,
    tabCopy,
    theme,
    t,
    topWishes,
    typeFilterChips,
    whispOfDay,
  ]);

  try {
    return (
      <>
        <Modal
          visible={prefModalVisible}
          animationType="fade"
          transparent
          onRequestClose={() => setPrefModalVisible(false)}
        >
          <View style={styles.prefModalBackdrop}>
            <View
              style={[
                styles.prefModalContainer,
                { backgroundColor: theme.background },
              ]}
            >
              <Text style={[styles.prefModalTitle, { color: theme.text }]}>
                Customize For You
              </Text>
              <ScrollView
                style={styles.prefModalScroll}
                contentContainerStyle={styles.prefModalContent}
              >
                <Text
                  style={[styles.prefModalSectionTitle, { color: theme.placeholder }]}
                >
                  Categories
                </Text>
                <View style={styles.prefChipGroup}>
                  {allCategories.map((cat) => {
                    const selected = prefDraft.categories.includes(cat);
                    return (
                      <TouchableOpacity
                        key={cat}
                        onPress={() => togglePrefCategory(cat)}
                        style={[
                          styles.prefChip,
                          {
                            backgroundColor: theme.input,
                            borderColor: theme.placeholder,
                          },
                          selected && {
                            backgroundColor: theme.tint,
                            borderColor: theme.tint,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.prefChipText,
                            { color: selected ? theme.background : theme.text },
                          ]}
                        >
                          {cat.charAt(0).toUpperCase() + cat.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text
                  style={[
                    styles.prefModalSectionTitle,
                    { color: theme.placeholder, marginTop: 16 },
                  ]}
                >
                  Focus Type
                </Text>
                <View style={styles.prefChipGroup}>
                  <TouchableOpacity
                    onPress={() => selectPrefType(null)}
                    style={[
                      styles.prefChip,
                      {
                        backgroundColor: theme.input,
                        borderColor: theme.placeholder,
                      },
                      !prefDraft.type && {
                        backgroundColor: theme.tint,
                        borderColor: theme.tint,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.prefChipText,
                        { color: !prefDraft.type ? theme.background : theme.text },
                      ]}
                    >
                      All types
                    </Text>
                  </TouchableOpacity>
                  {typeOptions.map((opt) => {
                    const selected = prefDraft.type === opt.key;
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        onPress={() => selectPrefType(opt.key)}
                        style={[
                          styles.prefChip,
                          {
                            backgroundColor: theme.input,
                            borderColor: theme.placeholder,
                          },
                          selected && {
                            backgroundColor: theme.tint,
                            borderColor: theme.tint,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.prefChipText,
                            { color: selected ? theme.background : theme.text },
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
              <View style={styles.prefModalActions}>
                <TouchableOpacity
                  onPress={handleResetPreferences}
                  style={[
                    styles.prefModalSecondary,
                    { borderColor: theme.tint },
                  ]}
                >
                  <Text style={[styles.prefModalSecondaryText, { color: theme.tint }]}>
                    Use automatic picks
                  </Text>
                </TouchableOpacity>
                <View style={styles.prefModalButtonsRow}>
                  <TouchableOpacity
                    onPress={() => setPrefModalVisible(false)}
                    style={[
                      styles.prefModalButton,
                      { backgroundColor: theme.input },
                    ]}
                  >
                    <Text style={[styles.prefModalButtonText, { color: theme.text }]}>
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleSavePreferences}
                    style={[
                      styles.prefModalButton,
                      { backgroundColor: theme.tint },
                    ]}
                  >
                    <Text
                      style={[styles.prefModalButtonText, { color: theme.background }]}
                    >
                      Save
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </Modal>
        <SafeAreaView
          style={[styles.safeArea, { backgroundColor: theme.background }]}
        >
          <StatusBar
            barStyle=
              {theme.name === 'dark' || theme.name === 'neon'
                ? 'light-content'
                : 'dark-content'}
            backgroundColor={theme.background}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={[styles.container, { backgroundColor: theme.background }]}
          >
            <FlatList
              data={filteredWishes}
              keyExtractor={(item) => item.id}
              onEndReached={loadMore}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
              }
              contentContainerStyle={styles.contentContainer}
              ListHeaderComponent={headerContent}
              ListEmptyComponent={
                loading ? (
                  <Skeleton />
                ) : error ? (
                  <Text style={[styles.errorText, { color: theme.tint }]}>
                    {error}
                  </Text>
                ) : (
                  <View style={styles.emptyState}>
                    <Text style={[styles.noResults, { color: theme.placeholder }]}>
                      {emptyMessage}
                    </Text>
                    {normalizedSearch ? (
                      <TouchableOpacity
                        onPress={() => setSearchTerm('')}
                        style={[styles.emptyAction, { borderColor: theme.placeholder }]}
                      >
                        <Text style={[styles.emptyActionText, { color: theme.text }]}>
                          {t('feed.empty.clearSearch', 'Clear search')}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                    {activeTab === 'forYou' ? (
                      <TouchableOpacity
                        onPress={openPrefModal}
                        style={[styles.emptyAction, { borderColor: theme.tint }]}
                      >
                        <Text style={[styles.emptyActionText, { color: theme.tint }]}>
                          {t('feed.empty.adjustForYou', 'Adjust For You preferences')}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                )
              }
              renderItem={renderWish}
            />
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
      </>
    );
  } catch (err) {
    logger.error('Error rendering feed page', err);
    return null;
  }
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
  headerWrapper: {
    marginBottom: 24,
    gap: 16,
  },
  heroCard: {
    padding: 20,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '700',
  },
  heroSubtitle: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
  },
  highlightCard: {
    padding: 18,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  highlightTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  highlightText: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
  },
  leaderboardRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  leaderItem: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  controlsCard: {
    padding: 18,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  controlsLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  searchInput: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  toggleBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  toggleButton: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '600',
  },
  chipScroll: {
    marginHorizontal: -4,
  },
  chipScrollContent: {
    paddingHorizontal: 4,
    gap: 8,
  },
  categoryChip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    marginRight: 4,
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  prefButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'flex-start',
  },
  prefButtonText: {
    fontWeight: '600',
    fontSize: 14,
  },
  prefModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  prefModalContainer: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    padding: 20,
  },
  prefModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  prefModalScroll: {
    maxHeight: 320,
  },
  prefModalContent: {
    paddingBottom: 12,
  },
  prefModalSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  prefChipGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  prefChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  prefChipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  prefModalActions: {
    marginTop: 20,
    gap: 12,
  },
  prefModalSecondary: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  prefModalSecondaryText: {
    fontSize: 13,
    fontWeight: '500',
  },
  prefModalButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  prefModalButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  prefModalButtonText: {
    fontWeight: '600',
    fontSize: 14,
  },
  topSection: {
    gap: 12,
    padding: 18,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  topWish: {
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  topWishText: {
    fontSize: 14,
    lineHeight: 20,
  },
  likes: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '500',
  },
  errorText: {
    textAlign: 'center',
    marginTop: 20,
  },
  noResults: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 14,
    lineHeight: 20,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 32,
    gap: 12,
  },
  emptyAction: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  emptyActionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  skeletonContainer: {
    paddingTop: 20,
  },
  skeletonItem: {
    height: 80,
    borderRadius: 12,
    marginBottom: 12,
  },
});
