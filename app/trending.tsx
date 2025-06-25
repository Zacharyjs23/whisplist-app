import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { listenTrendingWishes, Wish } from '../helpers/firestore';


export default function TrendingScreen() {
  const router = useRouter();
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = listenTrendingWishes((data) => {
      setWishes(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const renderWish = ({ item }: { item: Wish }) => (
    <TouchableOpacity onPress={() => router.push(`/wish/${item.id}`)}>
      <View style={styles.wishItem}>
        <Text style={styles.wishCategory}>#{item.category}</Text>
        <Text style={styles.wishText}>{item.text}</Text>
        <Text style={styles.likes}>❤️ {item.likes}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0e0e0e" />
      <View style={styles.container}>
        <Text style={styles.title}>Trending Wishes 🔥</Text>
        {loading ? (
          <ActivityIndicator size="large" color="#a78bfa" style={{ marginTop: 20 }} />
        ) : (
          <FlatList
            data={wishes}
            keyExtractor={(item) => item.id}
            renderItem={renderWish}
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
  wishItem: {
    backgroundColor: '#1a1a1a',
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
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
});
