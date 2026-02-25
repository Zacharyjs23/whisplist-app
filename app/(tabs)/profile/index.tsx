import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
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
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '@/firebase';
import { useAuthSession } from '@/contexts/AuthSessionContext';
import { useAuthFlows } from '@/contexts/AuthFlowsContext';
import { SupportPostCard } from '@/components/support/SupportPostCard';
import {
  formatCurrency,
  isSupportPost,
  toSupportPost,
  type SupportPost,
} from '@/features/mvp/supportPosts';
import type { Wish } from '@/types/Wish';
import * as logger from '@/shared/logger';

const PAGE_SIZE = 50;

function toWish(docSnap: QueryDocumentSnapshot<DocumentData>): Wish {
  return {
    id: docSnap.id,
    ...(docSnap.data() as Omit<Wish, 'id'>),
  } as Wish;
}

export default function ProfilePage() {
  const router = useRouter();
  const { user, profile } = useAuthSession();
  const { signOut } = useAuthFlows();

  const [posts, setPosts] = React.useState<SupportPost[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const buildProfileQuery = React.useCallback(() => {
    if (!user?.uid) return null;
    return query(
      collection(db, 'wishes'),
      where('userId', '==', user.uid),
      orderBy('timestamp', 'desc'),
      limit(PAGE_SIZE),
    );
  }, [user?.uid]);

  React.useEffect(() => {
    const profileQuery = buildProfileQuery();
    if (!profileQuery) {
      setPosts([]);
      setLoading(false);
      return;
    }

    const unsub = onSnapshot(
      profileQuery,
      (snap) => {
        const mapped = snap.docs
          .map(toWish)
          .filter(isSupportPost)
          .map(toSupportPost);
        setPosts(mapped);
        setLoading(false);
        setError(null);
      },
      (err) => {
        logger.warn('Failed to load profile support posts', err);
        setError('Unable to load your requests right now.');
        setLoading(false);
      },
    );

    return () => {
      unsub();
    };
  }, [buildProfileQuery]);

  const onRefresh = React.useCallback(async () => {
    const profileQuery = buildProfileQuery();
    if (!profileQuery) return;

    setRefreshing(true);
    try {
      const snap = await getDocs(profileQuery);
      setPosts(snap.docs.map(toWish).filter(isSupportPost).map(toSupportPost));
      setError(null);
    } catch (err) {
      logger.warn('Failed to refresh profile requests', err);
      setError('Could not refresh your requests.');
    } finally {
      setRefreshing(false);
    }
  }, [buildProfileQuery]);

  const openExternalUrl = React.useCallback(async (url: string) => {
    try {
      if (!/^https?:\/\//i.test(url)) {
        Alert.alert('Invalid link', 'This link is missing https://');
        return;
      }
      await Linking.openURL(url);
    } catch (err) {
      logger.warn('Failed to open profile external URL', err);
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

  const totalGoal = posts.reduce((sum, post) => sum + (post.goalAmount ?? 0), 0);
  const totalRaised = posts.reduce((sum, post) => sum + post.raisedAmount, 0);
  const displayName = profile?.displayName?.trim() || user?.displayName || 'Your profile';
  const bio = profile?.bio?.trim() || 'Share your story and let people support your goals.';

  return (
    <SafeAreaView style={styles.root}>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <SupportPostCard
            post={item}
            compact
            onOpenPost={handleOpenPost}
            onOpenGift={handleOpenGift}
            onOpenVideo={handleOpenVideo}
          />
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={posts.length ? styles.listContent : styles.emptyListContent}
        ListHeaderComponent={
          <View style={styles.headerCard}>
            <View style={styles.profileRow}>
              {profile?.photoURL ? (
                <Image source={{ uri: profile.photoURL }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarFallbackText}>
                    {displayName.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={styles.profileTextWrap}>
                <Text style={styles.displayName}>{displayName}</Text>
                <Text style={styles.bio}>{bio}</Text>
              </View>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{posts.length}</Text>
                <Text style={styles.statLabel}>Requests</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{formatCurrency(totalGoal)}</Text>
                <Text style={styles.statLabel}>Goal total</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{formatCurrency(totalRaised)}</Text>
                <Text style={styles.statLabel}>Raised</Text>
              </View>
            </View>

            <View style={styles.headerActionsRow}>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/journal')}
                style={styles.primaryAction}
              >
                <Ionicons name="add-circle-outline" size={16} color="#ffffff" />
                <Text style={styles.primaryActionText}>New request</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/profile/settings')}
                style={styles.secondaryAction}
              >
                <Text style={styles.secondaryActionText}>Settings</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  void signOut();
                }}
                style={styles.ghostAction}
              >
                <Text style={styles.ghostActionText}>Sign out</Text>
              </Pressable>
            </View>

            <Text style={styles.sectionTitle}>Your live requests</Text>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color="#0f172a" size="large" />
              <Text style={styles.loadingText}>Loading your profile...</Text>
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <Ionicons name="megaphone-outline" size={34} color="#64748b" />
              <Text style={styles.emptyTitle}>No active requests yet</Text>
              <Text style={styles.emptyBody}>
                Post your first support request to start collecting gifts or funds.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/journal')}
                style={styles.emptyAction}
              >
                <Text style={styles.emptyActionText}>Create request</Text>
              </Pressable>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  emptyListContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  headerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    marginTop: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
  },
  avatarFallback: {
    width: 54,
    height: 54,
    borderRadius: 999,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 22,
  },
  profileTextWrap: {
    flex: 1,
  },
  displayName: {
    color: '#0f172a',
    fontSize: 22,
    fontWeight: '800',
  },
  bio: {
    marginTop: 3,
    color: '#475569',
    lineHeight: 19,
  },
  statsRow: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 8,
  },
  statCard: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  statValue: {
    color: '#0f172a',
    fontWeight: '800',
    fontSize: 14,
  },
  statLabel: {
    marginTop: 2,
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
  },
  headerActionsRow: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  primaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    backgroundColor: '#0f172a',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  primaryActionText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  secondaryAction: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
  },
  secondaryActionText: {
    color: '#334155',
    fontWeight: '600',
    fontSize: 13,
  },
  ghostAction: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  ghostActionText: {
    color: '#64748b',
    fontWeight: '600',
    fontSize: 13,
  },
  sectionTitle: {
    marginTop: 16,
    marginBottom: 4,
    color: '#0f172a',
    fontWeight: '800',
    fontSize: 16,
  },
  errorText: {
    marginTop: 6,
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontWeight: '600',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    color: '#64748b',
  },
  emptyWrap: {
    marginTop: 30,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 18,
    alignItems: 'center',
  },
  emptyTitle: {
    marginTop: 8,
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
    borderRadius: 10,
    backgroundColor: '#0f172a',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  emptyActionText: {
    color: '#ffffff',
    fontWeight: '700',
  },
});
