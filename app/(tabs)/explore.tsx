// app/(tabs)/explore.tsx — Visually Enhanced Explore Screen with Pull-to-Refresh
import {
    collection,
    limit,
    onSnapshot,
    orderBy,
    query,
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { db } from '../../firebase';

interface Wish {
  id: string;
  text: string;
  category: string;
  likes: number;
  isPoll?: boolean;
  optionA?: string;
  optionB?: string;
  votesA?: number;
  votesB?: number;
}

const allCategories = ['love', 'health', 'career', 'general', 'money', 'friendship'];

export default function ExploreScreen() {
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [filteredWishes, setFilteredWishes] = useState<Wish[]>([]);
  const [topWishes, setTopWishes] = useState<Wish[]>([]);
  const [loading, setLoading] = useState(true);
  const [trendingMode, setTrendingMode] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const topQuery = query(collection(db, 'wishes'), orderBy('likes', 'desc'), limit(3));
    const unsubscribe = onSnapshot(topQuery, (snapshot) => {
      const top = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Wish[];
      setTopWishes(top);
    });
    return () => unsubscribe();
  }, []);

  const fetchWishes = () => {
    setLoading(true);
    const baseQuery = query(collection(db, 'wishes'), orderBy(trendingMode ? 'likes' : 'timestamp', 'desc'));
    const unsubscribe = onSnapshot(baseQuery, (snapshot) => {
      const all = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Wish[];
      const filtered = all.filter((wish) => {
        const inCategory =
          trendingMode || selectedCategories.size === 0 || selectedCategories.has(wish.category);
        const inSearch = wish.text.toLowerCase().includes(searchTerm.toLowerCase());
        return inCategory && inSearch;
      });
      setFilteredWishes(filtered);
      setLoading(false);
    });
    return unsubscribe;
  };

  useEffect(() => {
    const unsubscribe = fetchWishes();
    return () => unsubscribe();
  }, [selectedCategories, trendingMode, searchTerm]);

  const handleReload = () => {
    fetchWishes();
  };

  const toggleTrending = (mode: boolean) => {
    setTrendingMode(mode);
    if (mode) {
      setSelectedCategories(new Set());
    }
  };

  const toggleCategory = (cat: string) => {
    const newSet = new Set(selectedCategories);
    newSet.has(cat) ? newSet.delete(cat) : newSet.add(cat);
    setSelectedCategories(newSet);
  };

  const renderWish = ({ item }: { item: Wish }) => (
    <View style={styles.wishItem}>
      <Text style={styles.wishCategory}>#{item.category}</Text>
      <Text style={styles.wishText}>{item.text}</Text>
      {item.isPoll ? (
        <View style={{ marginTop: 6 }}>
          <Text style={styles.pollText}>{item.optionA}: {item.votesA || 0}</Text>
          <Text style={styles.pollText}>{item.optionB}: {item.votesB || 0}</Text>
        </View>
      ) : (
        <Text style={styles.likes}>❤️ {item.likes}</Text>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0e0e0e" />
      <View style={styles.container}>
        <Text style={styles.title}>Explore Wishes 🧭</Text>

        <TextInput
          style={styles.searchInput}
          placeholder="Search wishes..."
          placeholderTextColor="#aaa"
          value={searchTerm}
          onChangeText={setSearchTerm}
        />

        <View style={styles.toggleBar}>
          <TouchableOpacity
            onPress={() => toggleTrending(false)}
            style={[styles.toggleButton, !trendingMode && styles.activeToggle]}
          >
            <Text style={[styles.toggleText, !trendingMode && styles.activeToggleText]}>Latest</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => toggleTrending(true)}
            style={[styles.toggleButton, trendingMode && styles.activeToggle]}
          >
            <Text style={[styles.toggleText, trendingMode && styles.activeToggleText]}>🔥 Trending</Text>
          </TouchableOpacity>
        </View>

        {!trendingMode && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryBar}>
            {allCategories.map((cat) => (
              <TouchableOpacity
                key={cat}
                onPress={() => toggleCategory(cat)}
                style={[styles.categoryButton, selectedCategories.has(cat) && styles.activeCategory]}
              >
                <Text style={[styles.categoryText, selectedCategories.has(cat) && styles.activeCategoryText]}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {!trendingMode && topWishes.length > 0 && (
          <View style={styles.topSection}>
            <Text style={styles.sectionTitle}>🔥 <Text style={{ color: '#a78bfa' }}>Top Wishes</Text></Text>
            {topWishes.map((wish) => (
              <View key={wish.id} style={styles.topWish}>
                <Text style={styles.topWishText}>{wish.text}</Text>
                <Text style={styles.likes}>❤️ {wish.likes}</Text>
              </View>
            ))}
          </View>
        )}

        {loading ? (
          <ActivityIndicator size="large" color="#a78bfa" style={{ marginTop: 20 }} />
        ) : filteredWishes.length === 0 ? (
          <Text style={styles.noResults}>No matching wishes 💭</Text>
        ) : (
          <FlatList
            data={filteredWishes}
            keyExtractor={(item) => item.id}
            renderItem={renderWish}
            refreshing={loading}
            onRefresh={handleReload}
            contentContainerStyle={{ paddingBottom: 80 }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0e0e0e',
  },
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  searchInput: {
    backgroundColor: '#1e1e1e',
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
    backgroundColor: '#1e1e1e',
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
  categoryBar: {
    flexGrow: 0,
    marginBottom: 16,
  },
  categoryButton: {
    backgroundColor: '#1e1e1e',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    marginRight: 10,
  },
  activeCategory: {
    backgroundColor: '#8b5cf6',
  },
  categoryText: {
    color: '#aaa',
    fontSize: 14,
  },
  activeCategoryText: {
    color: '#fff',
    fontWeight: 'bold',
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
    backgroundColor: '#1e1e1e',
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
    backgroundColor: '#1a1a1a',
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
  noResults: {
    color: '#ccc',
    textAlign: 'center',
    marginTop: 20,
  },
});