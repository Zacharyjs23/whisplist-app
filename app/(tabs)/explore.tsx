// app/(tabs)/explore.tsx — Visually Enhanced Explore Screen with Pull-to-Refresh
import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  View,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useRouter } from 'expo-router';
import ReportDialog from '../../components/ReportDialog';
import {
  listenTrendingWishes,
  listenWishes,
  getFollowingIds,
} from '../../helpers/firestore';
import { addDoc, collection, serverTimestamp, getDocs, query, orderBy, where, limit } from 'firebase/firestore';
import { db } from '../../firebase';
import type { Wish } from '../../types/Wish';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';

const typeInfo: Record<string, { emoji: string; color: string }> = {
  wish: { emoji: '💭', color: '#1a1a1a' },
  confession: { emoji: '😶\u200d🌫️', color: '#374151' },
  advice: { emoji: '🧠', color: '#064e3b' },
  dream: { emoji: '🌙', color: '#312e81' },
};


const allCategories = ['love', 'health', 'career', 'general', 'money', 'friendship', 'fitness'];

export default function Page() {
  const router = useRouter();
  const { user } = useAuth();
  const { theme } = useTheme();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [filteredWishes, setFilteredWishes] = useState<Wish[]>([]);
  const [topWishes, setTopWishes] = useState<Wish[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trendingMode, setTrendingMode] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [reportVisible, setReportVisible] = useState(false);
  const [reportTarget, setReportTarget] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const unsubscribe = listenTrendingWishes((data) => {
      setTopWishes(data.slice(0, 3));
    });
    return unsubscribe;
  }, []);

  const fetchWishes = useCallback(() => {
    setLoading(true);
    try {
      const unsubscribe = trendingMode
        ? listenTrendingWishes((all: Wish[]) => {
            try {
              const filtered = all.filter((wish) => {
                const inCategory =
                  trendingMode || !selectedCategory || wish.category === selectedCategory;
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
        : listenWishes(user?.uid ?? null, (all: Wish[]) => {
            try {
              const filtered = all.filter((wish) => {
                const inCategory =
                  trendingMode || !selectedCategory || wish.category === selectedCategory;
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
          });
      return unsubscribe;
    } catch (err) {
      console.error('❌ Failed to load wishes:', err);
      setError('Failed to load wishes');
      setLoading(false);
      return () => { };
    }
  }, [trendingMode, selectedCategory, searchTerm, user]);

  useEffect(() => {
    const unsubscribe = fetchWishes();
    return () => unsubscribe();
  }, [fetchWishes]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (trendingMode) {
        const q = query(collection(db, 'wishes'), orderBy('likes', 'desc'), limit(20));
        const snap = await getDocs(q);
        const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Wish, 'id'>) })) as Wish[];
        const filtered = all.filter((wish) => {
          const inCategory =
            trendingMode || !selectedCategory || wish.category === selectedCategory;
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
  }, [trendingMode, selectedCategory, searchTerm, user]);

  const toggleTrending = (mode: boolean) => {
    setTrendingMode(mode);
  };

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
    <View style={[styles.wishItem, { backgroundColor: typeInfo[item.type || 'wish'].color }]}>
      <TouchableOpacity onPress={() => router.push(`/wish/${item.id}`)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Text style={styles.wishCategory}>
          {typeInfo[item.type || 'wish'].emoji} #{item.category} {item.audioUrl ? '🔊' : ''}
        </Text>
        <Text style={styles.wishText}>{item.text}</Text>
        {item.imageUrl && (
          <Image source={{ uri: item.imageUrl }} style={styles.preview} />
        )}
        {item.isPoll ? (
          <View style={{ marginTop: 6 }}>
            <Text style={styles.pollText}>{item.optionA}: {item.votesA ?? 0}</Text>
            <Text style={styles.pollText}>{item.optionB}: {item.votesB ?? 0}</Text>
          </View>
        ) : (
          <Text style={styles.likes}>❤️ {item.likes}</Text>
        )}
      </TouchableOpacity>


      <TouchableOpacity
        onPress={() => {
          setReportTarget(item.id);
          setReportVisible(true);
        }}
        style={{ marginTop: 4 }}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>

        <Text style={{ color: '#f87171' }}>Report</Text>
      </TouchableOpacity>
    </View>
  );

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
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          contentContainerStyle={styles.contentContainer}
          ListHeaderComponent={
            <>
              <Text style={styles.title}>Explore Wishes 🧭</Text>

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
          <TouchableOpacity
            onPress={() => toggleTrending(false)}
            style={[
              styles.toggleButton,
              { backgroundColor: theme.input },
              !trendingMode && styles.activeToggle,
            ]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={[styles.toggleText, !trendingMode && styles.activeToggleText]}>Latest</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => toggleTrending(true)}
            style={[
              styles.toggleButton,
              { backgroundColor: theme.input },
              trendingMode && styles.activeToggle,
            ]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={[styles.toggleText, trendingMode && styles.activeToggleText]}>🔥 Trending</Text>
          </TouchableOpacity>
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

        {!trendingMode && topWishes.length > 0 && (
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
              <Text style={styles.noResults}>No matching wishes 💭</Text>
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
  },});