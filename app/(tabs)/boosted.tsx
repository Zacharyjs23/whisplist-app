import { useRouter } from 'expo-router';
import React, { useEffect, useState, useCallback, useRef } from 'react';
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
import { listenBoostedWishes } from '../../helpers/firestore';
import { formatTimeLeft } from '../../helpers/time';
import ReportDialog from '../../components/ReportDialog';
import { addDoc, collection, serverTimestamp, getDocs, query, orderBy, where, doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import type { Wish } from '../../types/Wish';

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

  useEffect(() => {
    const unsubscribe = listenBoostedWishes((data) => {
      setWishes(data);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const fetchStatus = async () => {
      const ids = Array.from(
        new Set(
          wishes
            .map((w) => w.userId)
            .filter((id): id is string => typeof id === 'string')
        )
      );
      await Promise.all(
        ids.map(async (id) => {
          if (publicStatus[id] === undefined) {
            const snap = await getDoc(doc(db, 'users', id));
            setPublicStatus((prev) => ({
              ...prev,
              [id]: snap.exists()
                ? snap.data().publicProfileEnabled !== false
                : false,
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
      const now = new Date();
      const q = query(
        collection(db, 'wishes'),
        where('boostedUntil', '>', now),
        orderBy('boostedUntil', 'desc')
      );
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
    const glowAnim = useRef(new Animated.Value(0)).current;
    const [timeLeft, setTimeLeft] = useState('');

    useEffect(() => {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }, [fadeAnim]);

    useEffect(() => {
      if (item.boostedUntil) {
        const loop = Animated.loop(
          Animated.sequence([
            Animated.timing(glowAnim, { toValue: 1, duration: 1000, useNativeDriver: false }),
            Animated.timing(glowAnim, { toValue: 0, duration: 1000, useNativeDriver: false }),
          ])
        );
        loop.start();
        return () => loop.stop();
      }
    }, [item.boostedUntil]);

    useEffect(() => {
      if (item.boostedUntil && item.boostedUntil.toDate) {
        const update = () => {
          setTimeLeft(formatTimeLeft(item.boostedUntil.toDate()));
        };
        update();
        const id = setInterval(update, 60000);
        return () => clearInterval(id);
      } else {
        setTimeLeft('');
      }
    }, [item.boostedUntil]);

    return (
      <Animated.View
        style={[
          styles.wishItem,
          {
            opacity: fadeAnim,
            backgroundColor: typeInfo[item.type || 'wish'].color,
            borderColor: item.boostedUntil
              ? glowAnim.interpolate({ inputRange: [0, 1], outputRange: ['#facc15', '#fde68a'] })
              : 'transparent',
            borderWidth: item.boostedUntil ? 2 : 0,
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
                <Text style={styles.author}>by {item.displayName}</Text>
              </TouchableOpacity>
            )}
          <Text style={[styles.wishCategory, { color: theme.tint }]}>
            {typeInfo[item.type || 'wish'].emoji} #{item.category}
          </Text>
          <Text style={[styles.wishText, { color: theme.text }]}>{item.text}</Text>
          {item.imageUrl && <Image source={{ uri: item.imageUrl }} style={styles.preview} />}
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
            <Text style={[styles.likes, { color: theme.tint }]}>❤️ {item.likes}</Text>
          )}
          {item.boostedUntil && item.boostedUntil.toDate && (
            <Text style={styles.boostedLabel}>⏳ Time left: {timeLeft}</Text>
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
          <Text style={{ color: '#f87171' }}>Report</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <StatusBar
        barStyle={theme.name === 'dark' || theme.name === 'neon' ? 'light-content' : 'dark-content'}
        backgroundColor={theme.background}
      />
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Text style={[styles.title, { color: theme.text }]}>Boosted Wishes 🚀</Text>
        {loading ? (
          <ActivityIndicator size="large" color="#a78bfa" style={{ marginTop: 20 }} />
        ) : (
          <FlatList
            data={wishes}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <WishCard item={item} />}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
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
    color: '#ccc',
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
    color: '#f472b6',
    fontSize: 14,
    fontWeight: '500',
  },
  pollText: {
    fontSize: 14,
  },
  boostedLabel: {
    color: '#facc15',
    fontSize: 12,
    marginTop: 4,
  },
});
