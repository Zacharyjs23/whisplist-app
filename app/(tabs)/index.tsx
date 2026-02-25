import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '@/firebase';
import type { Wish } from '@/types/Wish';
import { useAuthSession } from '@/contexts/AuthSessionContext';
import { SupportPostCard } from '@/components/support/SupportPostCard';
import {
  isSupportPost,
  toSupportPost,
  type SupportPost,
} from '@/features/mvp/supportPosts';
import * as logger from '@/shared/logger';

const FEED_LIMIT = 80;

function toWish(docSnap: QueryDocumentSnapshot<DocumentData>): Wish {
  return {
    id: docSnap.id,
    ...(docSnap.data() as Omit<Wish, 'id'>),
  } as Wish;
}

function buildQuery() {
  return query(collection(db, 'wishes'), orderBy('timestamp', 'desc'), limit(FEED_LIMIT));
}

export default function FeedPage() {
  const router = useRouter();
  const { user } = useAuthSession();
  const [posts, setPosts] = React.useState<SupportPost[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const feedQuery = buildQuery();
    const unsub = onSnapshot(
      feedQuery,
      (snap) => {
        const mapped = snap.docs
          .map(toWish)
          .filter(isSupportPost)
          .map(toSupportPost);
        setPosts(mapped);
        setError(null);
        setLoading(false);
      },
      (err) => {
        logger.warn('Support feed subscription failed', err);
        setError('Could not load the feed right now. Pull to retry.');
        setLoading(false);
      },
    );

    return () => {
      unsub();
    };
  }, []);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const snap = await getDocs(buildQuery());
      const mapped = snap.docs.map(toWish).filter(isSupportPost).map(toSupportPost);
      setPosts(mapped);
      setError(null);
    } catch (err) {
      logger.warn('Support feed refresh failed', err);
      setError('Could not refresh feed right now.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  const openExternalUrl = React.useCallback(async (url: string) => {
    try {
      if (!/^https?:\/\//i.test(url)) {
        Alert.alert('Invalid link', 'This link is missing https://');
        return;
      }
      await Linking.openURL(url);
    } catch (err) {
      logger.warn('Failed to open external URL', err);
      Alert.alert('Unable to open link', 'Please try again.');
    }
  }, []);

  const handleOpenPost = React.useCallback(
    (post: SupportPost) => {
      router.push(`/wish/${post.id}`);
    },
    [router],
  );

  const handleOpenGift = React.useCallback(
    (post: SupportPost) => {
      if (!post.giftLink) return;
      void openExternalUrl(post.giftLink);
    },
    [openExternalUrl],
  );

  const handleOpenVideo = React.useCallback(
    (post: SupportPost) => {
      if (!post.videoUrl) return;
      void openExternalUrl(post.videoUrl);
    },
    [openExternalUrl],
  );

  const firstName =
    user?.displayName?.trim().split(/\s+/)[0] ||
    (user?.isAnonymous ? 'there' : 'friend');

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>WhispList</Text>
          <Text style={styles.subtitle}>Support stories from people near you</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/journal')}
          style={styles.createButton}
        >
          <Ionicons name="add" size={22} color="#ffffff" />
          <Text style={styles.createButtonText}>Create</Text>
        </Pressable>
      </View>

      <Text style={styles.greeting}>Hi {firstName}, discover who needs help today.</Text>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#0f172a" />
          <Text style={styles.loadingText}>Loading support feed...</Text>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <SupportPostCard
              post={item}
              onOpenPost={handleOpenPost}
              onOpenGift={handleOpenGift}
              onOpenVideo={handleOpenVideo}
            />
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          contentContainerStyle={
            posts.length ? styles.listContent : styles.emptyListContent
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="videocam-outline" size={38} color="#64748b" />
              <Text style={styles.emptyTitle}>No support posts yet</Text>
              <Text style={styles.emptyBody}>
                Create the first request with a photo or video and tell people why
                you need support.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/journal')}
                style={styles.emptyAction}
              >
                <Text style={styles.emptyActionText}>Create a request</Text>
              </Pressable>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f4f7fb',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  brand: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0f172a',
  },
  subtitle: {
    color: '#64748b',
    fontSize: 13,
    marginTop: 2,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0f172a',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  createButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  greeting: {
    paddingHorizontal: 16,
    color: '#334155',
    marginBottom: 10,
  },
  errorText: {
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    fontWeight: '600',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    color: '#64748b',
  },
  listContent: {
    paddingBottom: 24,
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: 32,
  },
  emptyWrap: {
    marginHorizontal: 16,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 20,
    alignItems: 'center',
  },
  emptyTitle: {
    marginTop: 10,
    fontWeight: '800',
    color: '#0f172a',
    fontSize: 18,
  },
  emptyBody: {
    marginTop: 6,
    textAlign: 'center',
    color: '#64748b',
    lineHeight: 20,
  },
  emptyAction: {
    marginTop: 14,
    backgroundColor: '#0f172a',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  emptyActionText: {
    color: '#ffffff',
    fontWeight: '700',
  },
});
