import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  Image,
  View,
} from 'react-native';
import { listenTrendingWishes } from '../helpers/firestore';
import ReportDialog from '../components/ReportDialog';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'; // Only include if still used
import { db } from '../firebase';
import type { Wish } from '../types/Wish';


export default function TrendingScreen() {
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportVisible, setReportVisible] = useState(false);
  const [reportTarget, setReportTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();


  useEffect(() => {
    const unsubscribe = listenTrendingWishes((data) => {
      setWishes(data);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

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
    <TouchableOpacity onPress={() => router.push(`/wish/${item.id}`)}>
      <Text style={styles.wishCategory}>#{item.category}</Text>
      <Text style={styles.wishText}>{item.text}</Text>
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
        <Text style={styles.likes}>❤️ {item.likes}</Text>
      )}
    </TouchableOpacity>

    <TouchableOpacity
      onPress={() => {
        setReportTarget(item.id);
        setReportVisible(true);
      }}
      style={{ marginTop: 4 }}
    >
      <Text style={{ color: '#f87171' }}>Report</Text>
    </TouchableOpacity>
  </View>
);


  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0e0e0e" />
      <View style={styles.container}>
        <Text style={styles.title}>Trending Wishes 🔥</Text>
        {loading ? (
          <ActivityIndicator size="large" color="#a78bfa" style={{ marginTop: 20 }} />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : (
          <FlatList
            data={wishes}
            keyExtractor={(item) => item.id}
            renderItem={renderWish}
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
});
