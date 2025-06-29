// app/(tabs)/explore.tsx — Visually Enhanced Explore Screen with Pull-to-Refresh
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  View,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useRouter } from 'expo-router';
import ReportDialog from '../../components/ReportDialog';
import { listenTrendingWishes, listenWishes } from '../../helpers/firestore';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import type { Wish } from '../../types/Wish';


const allCategories = ['love', 'health', 'career', 'general', 'money', 'friendship', 'fitness'];

export default function Page() {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [filteredWishes, setFilteredWishes] = useState<Wish[]>([]);
  const [topWishes, setTopWishes] = useState<Wish[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trendingMode, setTrendingMode] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [reportVisible, setReportVisible] = useState(false);
  const [reportTarget, setReportTarget] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = listenTrendingWishes((data) => {
      setTopWishes(data.slice(0, 3));
    });
    return unsubscribe;
  }, []);

  const fetchWishes = useCallback(() => {
    setLoading(true);
    try {
      const source = trendingMode ? listenTrendingWishes : listenWishes;
      const unsubscribe = source((all: Wish[]) => {
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
      return () => {};
    }
  }, [trendingMode, selectedCategory, searchTerm]);

  useEffect(() => {
    const unsubscribe = fetchWishes();
    return () => unsubscribe();
  }, [fetchWishes]);

  const handleReload = () => {
    fetchWishes();
  };

  const toggleTrending = (mode: boolean) => {
    setTrendingMode(mode);
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
      console.error('❌ Failed to submit report:', err);
    } finally {
      setReportVisible(false);
      setReportTarget(null);
    }
  };

  const renderWish = ({ item }: { item: Wish }) => (
    <View style={styles.wishItem}>
<TouchableOpacity onPress={() => router.push(`/wish/${item.id}`)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
  <Text style={styles.wishCategory}>
    #{item.category} {item.audioUrl ? '🔊' : ''}
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
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={[styles.toggleText, !trendingMode && styles.activeToggleText]}>Latest</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => toggleTrending(true)}
            style={[styles.toggleButton, trendingMode && styles.activeToggle]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={[styles.toggleText, trendingMode && styles.activeToggleText]}>🔥 Trending</Text>
          </TouchableOpacity>
        </View>

        <Picker
          selectedValue={selectedCategory}
          onValueChange={(value) => setSelectedCategory(value)}
          style={styles.dropdown}
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
              <View key={wish.id} style={styles.topWish}>
                <Text style={styles.topWishText}>{wish.text}</Text>
                <Text style={styles.likes}>❤️ {wish.likes}</Text>
              </View>
            ))}
          </View>
        )}

        {loading ? (
          <ActivityIndicator size="large" color="#a78bfa" style={{ marginTop: 20 }} />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
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
        <ReportDialog
          visible={reportVisible}
          onClose={() => {
            setReportVisible(false);
            setReportTarget(null);
          }}
          onSubmit={handleReport}
        />
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
  dropdown: {
    backgroundColor: '#1e1e1e',
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
});
