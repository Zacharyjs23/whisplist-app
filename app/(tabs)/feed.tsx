// app/(tabs)/feed.tsx — Combined Feed Screen with segmented tabs
import React, { useCallback, useEffect, useState } from 'react';
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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import ReportDialog from '../../components/ReportDialog';
import WishCard from '../../components/WishCard';
import {
  listenTrendingWishes,
  listenWishes,
  getFollowingIds,
  listenBoostedWishes,
  getTopBoostedCreators,
  getWhispOfTheDay,
} from '../../helpers/firestore';
import { addDoc, collection, serverTimestamp, getDocs, query, orderBy, where, limit, startAfter } from 'firebase/firestore';
import { db } from '../../firebase';
import type { Wish } from '../../types/Wish';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';



const allCategories = ['love', 'health', 'career', 'general', 'money', 'friendship', 'fitness'];

export default function Page() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();

  if (!db) {
    console.error('Firebase database undefined in feed page');
  }
  if (user === undefined) {
    console.error('AuthContext returned undefined user');
  }
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [filteredWishes, setFilteredWishes] = useState<Wish[]>([]);
  const [topWishes, setTopWishes] = useState<Wish[]>([]);
  const [leaderboard, setLeaderboard] = useState<{ userId: string; displayName: string; count: number }[]>([]);
  const [whispOfDay, setWhispOfDay] = useState<Wish | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'latest' | 'boosted' | 'trending' | 'forYou'>('latest');
  const [searchTerm, setSearchTerm] = useState('');
  const [reportVisible, setReportVisible] = useState(false);
  const [reportTarget, setReportTarget] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastVisible, setLastVisible] = useState<any | null>(null);
  const [lastDoc, setLastDoc] = useState<any | null>(null);

  const loadPersonalPrefs = useCallback(async () => {
    if (!user) return { categories: [], type: undefined as string | undefined };
    const snap = await getDocs(
      query(
        collection(db, 'wishes'),
        where('userId', '==', user.uid),
        orderBy('timestamp', 'desc'),
        limit(10)
      )
    );
    const cats = new Set<string>();
    const typeCounts: Record<string, number> = {};
    snap.docs.forEach((d) => {
      const data = d.data() as Wish;
      if (data.category) cats.add(data.category);
      if (data.type) typeCounts[data.type] = (typeCounts[data.type] || 0) + 1;
    });
    const favType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    const pref = { categories: Array.from(cats), type: favType };
    await AsyncStorage.setItem('forYouPref', JSON.stringify(pref));
    return pref;
  }, [user]);

  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem('feedTab');
      if (stored === 'latest' || stored === 'boosted' || stored === 'trending' || stored === 'forYou') {
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
          console.warn('Failed to load highlights', err);
        }
      })();
      return unsubscribe;
    } catch (err) {
      console.error('Failed to listen for trending wishes', err);
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
      .catch((err) => console.warn('Failed to load following ids', err));
  }, [user]);

  const fetchWishes = useCallback(() => {
    setLoading(true);
    try {
      if (activeTab === 'forYou') {
        (async () => {
          try {
            const stored = await AsyncStorage.getItem('forYouPref');
            let pref = stored ? JSON.parse(stored) : { categories: [], type: undefined };
            const fresh = await loadPersonalPrefs();
            if (fresh.categories.length) pref = fresh;
            const snap = await getDocs(
              query(collection(db, 'wishes'), orderBy('timestamp', 'desc'), limit(30))
            );
            const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Wish, 'id'>) })) as Wish[];
            // Prioritize wishes from followed users
            const followed = all.filter((w) => followingIds.includes(w.userId || ''));
            const others = all.filter((w) => !followingIds.includes(w.userId || ''));
            const ordered = [...followed, ...others];
            let list = ordered.filter(
              (w) => pref.categories.includes(w.category) || (pref.type && w.type === pref.type)
            );
            if (list.length === 0) list = ordered;
            const filtered = list.filter((wish) => {
              const inCategory = !selectedCategory || wish.category === selectedCategory;
              const inSearch = wish.text.toLowerCase().includes(searchTerm.toLowerCase());
              return inCategory && inSearch;
            });
            setFilteredWishes(filtered);
          } catch (err) {
            console.error('❌ Failed to load personalized wishes:', err);
            setError('Failed to load wishes');
          } finally {
            setLoading(false);
          }
        })();
        return () => {};
      }
      if (activeTab === 'boosted') {
        return listenBoostedWishes((all: Wish[]) => {
          const filtered = all.filter((wish) => {
            const inCategory = !selectedCategory || wish.category === selectedCategory;
            const inSearch = wish.text.toLowerCase().includes(searchTerm.toLowerCase());
            return inCategory && inSearch;
          });
          setFilteredWishes(filtered);
          setLoading(false);
        });
      }

      const unsubscribe = activeTab === 'trending'
        ? listenTrendingWishes((all: Wish[]) => {
            try {
              const filtered = all.filter((wish) => {
                const inCategory =
                  activeTab === 'trending' || !selectedCategory || wish.category === selectedCategory;
                const inSearch = wish.text.toLowerCase().includes(searchTerm.toLowerCase());
                return inCategory && inSearch;
              });
              setFilteredWishes(filtered);
            } catch (err) {
              console.error('❌ Failed to filter wishes:', err);
              setError('Failed to load wishes');
            } finally {
              setLoading(false);
            }
          })
        : (async () => {
            try {
              const snap = await getDocs(
                query(
                  collection(db, 'wishes'),
                  orderBy('timestamp', 'desc'),
                  limit(20)
                )
              );
              setLastVisible(snap.docs[snap.docs.length - 1] || null);
              const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Wish, 'id'>) })) as Wish[];
              const filtered = all.filter((wish) => {
                const inCategory =
                  activeTab === 'trending' || !selectedCategory || wish.category === selectedCategory;
                const inSearch = wish.text.toLowerCase().includes(searchTerm.toLowerCase());
                return inCategory && inSearch;
              });
              setFilteredWishes(filtered);
            } catch (err) {
              console.error('❌ Failed to load wishes:', err);
              setError('Failed to load wishes');
            } finally {
              setLoading(false);
            }
          })();
      return () => {};
    } catch (err) {
      console.error('❌ Failed to load wishes:', err);
      setError('Failed to load wishes');
      setLoading(false);
      return () => {};
    }
  }, [activeTab, selectedCategory, searchTerm, user, followingIds]);

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
          query(collection(db, 'wishes'), orderBy('timestamp', 'desc'), limit(30))
        );
        const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Wish, 'id'>) })) as Wish[];
        const followed = all.filter((w) => followingIds.includes(w.userId || ''));
        const others = all.filter((w) => !followingIds.includes(w.userId || ''));
        const ordered = [...followed, ...others];
        let list = ordered.filter(
          (w) => pref.categories.includes(w.category) || (pref.type && w.type === pref.type)
        );
        if (list.length === 0) list = ordered;
        const filtered = list.filter((wish) => {
          const inCategory = !selectedCategory || wish.category === selectedCategory;
          const inSearch = wish.text.toLowerCase().includes(searchTerm.toLowerCase());
          return inCategory && inSearch;
        });
        setFilteredWishes(filtered);
      } else if (activeTab === 'boosted') {
        const now = new Date();
        const boostedSnap = await getDocs(
          query(collection(db, 'wishes'), where('boostedUntil', '>', now), orderBy('boostedUntil', 'desc'))
        );
        const boosted = boostedSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Wish, 'id'>) })) as Wish[];
        const filtered = boosted.filter((wish) => {
          const inCategory = !selectedCategory || wish.category === selectedCategory;
          const inSearch = wish.text.toLowerCase().includes(searchTerm.toLowerCase());
          return inCategory && inSearch;
        });
        setFilteredWishes(filtered);
      } else if (activeTab === 'trending') {
        const q = query(collection(db, 'wishes'), orderBy('likes', 'desc'), limit(20));
        const snap = await getDocs(q);
        const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Wish, 'id'>) })) as Wish[];
        const filtered = all.filter((wish) => {
          const inCategory =
            activeTab === 'trending' || !selectedCategory || wish.category === selectedCategory;
          const inSearch = wish.text.toLowerCase().includes(searchTerm.toLowerCase());
          return inCategory && inSearch;
        });
        setFilteredWishes(filtered);
      } else {
        const followingIds = user ? await getFollowingIds(user.uid) : [];

        const now = new Date();
        const boostedSnap = await getDocs(
          query(
            collection(db, 'wishes'),
            where('boostedUntil', '>', now),
            orderBy('boostedUntil', 'desc')
          )
        );
        const boosted = boostedSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Wish, 'id'>) })) as Wish[];

        let normal: Wish[] = [];
        if (user && followingIds.length) {
          const normalSnap = await getDocs(
            query(
              collection(db, 'wishes'),
              where('userId', 'in', followingIds),
              orderBy('timestamp', 'desc')
            )
          );
          normal = normalSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Wish, 'id'>) })) as Wish[];
        }
        const all = [...boosted, ...normal];
        const filtered = all.filter((wish) => {
          const inCategory = !selectedCategory || wish.category === selectedCategory;
          const inSearch = wish.text.toLowerCase().includes(searchTerm.toLowerCase());
          return inCategory && inSearch;
        });
        setFilteredWishes(filtered);
      }
    } catch (err) {
      console.error('❌ Failed to refresh wishes:', err);
    } finally {
      setRefreshing(false);
    }
  }, [activeTab, selectedCategory, searchTerm, user, followingIds]);

  const loadMore = useCallback(async () => {
    if (!lastVisible) return;
    try {
      const snap = await getDocs(
        query(collection(db, 'wishes'), orderBy('timestamp', 'desc'), startAfter(lastVisible), limit(20))
      );
      setLastVisible(snap.docs[snap.docs.length - 1] || lastVisible);
      const more = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Wish, 'id'>) })) as Wish[];
      setFilteredWishes((prev) => [...prev, ...more]);
    } catch (err) {
      console.error('Failed to load more wishes', err);
    }
  }, [lastVisible, selectedCategory, searchTerm]);

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
      console.error('❌ Failed to submit report:', err);
    } finally {
      setReportVisible(false);
      setReportTarget(null);
    }
  };

  const renderWish = ({ item }: { item: Wish }) => (
    <WishCard
      wish={item}
      followed={followingIds.includes(item.userId || '')}
      onReport={() => {
        setReportTarget(item.id);
        setReportVisible(true);
      }}
    />
  );

  try {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={theme.background} />
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
          ListHeaderComponent={
            <>
              <Text style={styles.title}>Feed</Text>
              {whispOfDay && (
                <TouchableOpacity
                  onPress={() => router.push(`/wish/${whispOfDay.id}`)}
                  style={[styles.spotlight, { backgroundColor: theme.input }]}
                >
                  <Text style={styles.sectionTitle}>🌙 Whisp of the Day</Text>
                  <Text style={[styles.spotlightText, { color: theme.text }]}
                    numberOfLines={3}
                  >
                    {whispOfDay.text}
                  </Text>
                </TouchableOpacity>
              )}
              {leaderboard.length > 0 && (
                <View style={styles.leaderboard}>
                  <Text style={styles.sectionTitle}>🌟 Top Boosted Creators This Week</Text>
                  <FlatList
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    data={leaderboard}
                    keyExtractor={(i) => i.userId}
                    renderItem={({ item }) => (
                      <View style={[styles.leaderItem, { backgroundColor: theme.input }]}>
                        <Text style={{ color: theme.text }}>{item.displayName}</Text>
                        <Text style={{ color: theme.tint }}>🔥 {item.count}x</Text>
                      </View>
                    )}
                  />
                </View>
              )}

        <TextInput
          style={[
            styles.searchInput,
            { backgroundColor: theme.input, color: theme.text },
          ]}
          placeholder="Search wishes..."
          placeholderTextColor="#aaa"
          value={searchTerm}
          onChangeText={setSearchTerm}
        />

        <View style={styles.toggleBar}>
          {(['boosted', 'latest', 'trending', 'forYou'] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[
                styles.toggleButton,
                { backgroundColor: theme.input },
                activeTab === tab && { backgroundColor: theme.tint },
              ]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={[styles.toggleText, activeTab === tab && styles.activeToggleText]}>
                {tab === 'boosted'
                  ? '🔥 Boosted'
                  : tab === 'latest'
                  ? '💬 Latest'
                  : tab === 'trending'
                  ? '📈 Trending'
                  : '🧠 For You'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Picker
          selectedValue={selectedCategory}
          onValueChange={(value) => setSelectedCategory(value)}
          style={[styles.dropdown, { backgroundColor: theme.input, color: theme.text }]}
          dropdownIconColor="#fff"
        >
          <Picker.Item label="All Categories" value={null} />
          {allCategories.map((cat) => (
            <Picker.Item
              key={cat}
              label={cat.charAt(0).toUpperCase() + cat.slice(1)}
              value={cat}
            />
          ))}
        </Picker>

        {activeTab === 'trending' && topWishes.length > 0 && (
          <View style={styles.topSection}>
            <Text style={styles.sectionTitle}>🔥 <Text style={{ color: '#a78bfa' }}>Top Wishes</Text></Text>
            {topWishes.map((wish) => (
              <View
                key={wish.id}
                style={[styles.topWish, { backgroundColor: theme.input }]}
              >
                <Text style={styles.topWishText}>{wish.text}</Text>
                <Text style={styles.likes}>❤️ {wish.likes}</Text>
              </View>
            ))}
          </View>
        )}
            </>
          }
          ListEmptyComponent={
            loading ? (
              <Skeleton />
            ) : error ? (
              <Text style={styles.errorText}>{error}</Text>
            ) : (
              <Text style={styles.noResults}>
                No wishes yet in this category. Be the first to post ✨
              </Text>
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
    );
  } catch (err) {
    console.error('Error rendering feed page', err);
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
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  searchInput: {
    color: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  toggleBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 12,
  },
  toggleButton: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginHorizontal: 4,
  },
  activeToggle: {
    backgroundColor: '#8b5cf6',
  },
  toggleText: {
    color: '#aaa',
  },
  activeToggleText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  dropdown: {
    color: '#fff',
    borderRadius: 10,
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  topSection: {
    marginBottom: 24,
  },
  topWish: {
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
  },
  topWishText: {
    color: '#fff',
    fontSize: 15,
  },
  wishItem: {
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
  },
  wishCategory: {
    color: '#a78bfa',
    fontSize: 13,
    marginBottom: 6,
    fontWeight: '600',
  },
  wishText: {
    color: '#fff',
    fontSize: 16,
  },
  preview: {
    width: '100%',
    height: 200,
    borderRadius: 10,
    marginTop: 8,
  },
  likes: {
    marginTop: 8,
    color: '#f472b6',
    fontSize: 14,
    fontWeight: '500',
  },
  pollText: {
    color: '#fff',
    fontSize: 14,
  },
  boostedLabel: {
    color: '#facc15',
    fontSize: 12,
    marginTop: 4,
  },
  errorText: {
    color: '#f87171',
    textAlign: 'center',
    marginTop: 20,
  },
  noResults: {
    color: '#ccc',
    textAlign: 'center',
    marginTop: 20,
  },
  skeletonContainer: {
    paddingTop: 20,
  },
  skeletonItem: {
    height: 80,
    borderRadius: 12,
    marginBottom: 12,
  },
  spotlight: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  spotlightText: {
    marginTop: 6,
    fontSize: 15,
    textAlign: 'center',
  },
  leaderboard: {
    marginBottom: 16,
  },
  leaderItem: {
    padding: 10,
    borderRadius: 8,
    marginRight: 10,
    alignItems: 'center',
  },
});
