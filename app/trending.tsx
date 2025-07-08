import { useRouter, useNavigation } from 'expo-router';
import React, { useEffect, useState, useLayoutEffect, useRef, useCallback } from 'react';
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
  Animated,
  RefreshControl,
} from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { listenTrendingWishes } from '../helpers/firestore';
import ReportDialog from '../components/ReportDialog';
import { addDoc, collection, serverTimestamp, getDocs, query, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Wish } from '../types/Wish';

const typeInfo: Record<string, { emoji: string; color: string }> = {
  wish: { emoji: '💭', color: '#1a1a1a' },
  confession: { emoji: '😶\u200d🌫️', color: '#374151' },
  advice: { emoji: '🧠', color: '#064e3b' },
  dream: { emoji: '🌙', color: '#312e81' },
};

export default function Page() {
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportVisible, setReportVisible] = useState(false);
  const [reportTarget, setReportTarget] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [publicStatus, setPublicStatus] = useState<Record<string, boolean>>({});
  const router = useRouter();
  const { theme } = useTheme();
  const navigation = useNavigation();

  useLayoutEffect(() => {
    navigation.setOptions({ title: 'Trending' });
  }, [navigation]);


  useEffect(() => {
    const unsubscribe = listenTrendingWishes((data) => {
      setWishes(data);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const fetchStatus = async () => {
      const ids = Array.from(new Set(wishes.map((w) => w.userId).filter(Boolean)));
      await Promise.all(
        ids.map(async (id) => {
          if (publicStatus[id] === undefined) {
            const snap = await getDoc(doc(db, 'users', id));
            setPublicStatus((prev) => ({
              ...prev,
              [id]: snap.exists() ? snap.data().publicProfileEnabled !== false : false,
            }));
          }
        })
      );
    };
    fetchStatus();
  }, [wishes]);

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

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const q = query(collection(db, 'wishes'), orderBy('likes', 'desc'), limit(20));
      const snap = await getDocs(q);
      const data = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Wish, 'id'>) }));
      setWishes(data as Wish[]);
    } catch (err) {
      console.error('❌ Failed to refresh wishes:', err);
    } finally {
      setRefreshing(false);
    }
  }, []);

const WishCard: React.FC<{ item: Wish }> = ({ item }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  return (
    <Animated.View
      style={[
        styles.wishItem,
        {
          opacity: fadeAnim,
          backgroundColor:
            typeInfo[item.type || 'wish'].color,
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => router.push(`/wish/${item.id}`)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        {!item.isAnonymous &&
          item.displayName &&
          publicStatus[item.userId || ''] && (
            <TouchableOpacity
              onPress={() => router.push(`/profile/${item.displayName}`)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={[styles.author, { color: theme.text }]}>by {item.displayName}</Text>
            </TouchableOpacity>
          )}
        <Text
          style={[styles.wishCategory, { color: theme.tint }]}
        >
          {typeInfo[item.type || 'wish'].emoji} #{item.category}
        </Text>
        <Text style={[styles.wishText, { color: theme.text }]}>
          {item.text}
        </Text>
        {item.imageUrl && (
          <Image source={{ uri: item.imageUrl }} style={styles.preview} />
        )}
        {item.isPoll ? (
          <View style={{ marginTop: 6 }}>
            <Text style={[styles.pollText, { color: theme.text }]}>
              {item.optionA}: {item.votesA || 0}
            </Text>
            <Text style={[styles.pollText, { color: theme.text }]}>
              {item.optionB}: {item.votesB || 0}
            </Text>
          </View>
        ) : (
          <Text style={[styles.likes, { color: theme.tint }]}>
            ❤️ {item.likes}
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => {
          setReportTarget(item.id);
          setReportVisible(true);
        }}
        style={{ marginTop: 4 }}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={{ color: theme.tint }}>Report</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};


  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background }]}
    >
      <StatusBar
        barStyle={theme.name === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={theme.background}
      />
      <View style={styles.container}>
        <Text style={[styles.title, { color: theme.text }]}>Trending Wishes 🔥</Text>
        {loading ? (
          <ActivityIndicator
            size="large"
            color={theme.tint}
            style={{ marginTop: 20 }}
          />
        ) : (
          <FlatList
            data={wishes}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <WishCard item={item} />}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
            }
            contentContainerStyle={{ paddingBottom: 80, flexGrow: 1 }}
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
  },
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  wishItem: {
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
  },
  wishCategory: {
    fontSize: 13,
    marginBottom: 6,
    fontWeight: '600',
  },
  author: {
    fontSize: 12,
    marginBottom: 2,
  },
  wishText: {
    fontSize: 16,
    fontWeight: '500',
  },
  preview: {
    width: '100%',
    height: 200,
    borderRadius: 10,
    marginTop: 8,
  },
  likes: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '500',
  },
  pollText: {
    fontSize: 14,
  },
});
