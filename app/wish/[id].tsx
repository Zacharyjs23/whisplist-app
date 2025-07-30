// app/wish/[id].tsx — detail view of a single wish
import { formatDistanceToNow } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { createAudioPlayer, AudioPlayer } from 'expo-audio';
import {
  getWish,
  listenWishComments,
  addComment,
  updateCommentReaction,
  boostWish,
  setFulfillmentLink,
} from '../../helpers/firestore';

import {
  addDoc,
  collection,
  serverTimestamp,
  increment,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  collectionGroup,
  updateDoc,
} from 'firebase/firestore'; // ✅ Keep only if used directly in this file

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  Switch,
  View,
  Dimensions,
  Alert,
  RefreshControl,
  ScrollView,
} from 'react-native';
import * as Linking from 'expo-linking';
import { useTheme } from '@/contexts/ThemeContext';
import { BarChart } from 'react-native-chart-kit';
import ReportDialog from '../../components/ReportDialog';
import FulfillmentLinkDialog from '../../components/FulfillmentLinkDialog';
import { db } from '../../firebase';
import type { Wish } from '../../types/Wish';
import { useAuth } from '@/contexts/AuthContext';
import { trackEvent } from '@/helpers/analytics';

const typeInfo: Record<string, { emoji: string; color: string }> = {
  wish: { emoji: '💭', color: '#1e1e1e' },
  confession: { emoji: '😶\u200d🌫️', color: '#374151' },
  advice: { emoji: '🧠', color: '#064e3b' },
  dream: { emoji: '🌙', color: '#312e81' },
};

interface Comment {
  id: string;
  text: string;
  userId?: string;
  displayName?: string;
  photoURL?: string;
  isAnonymous?: boolean;
  timestamp?: any;
  parentId?: string;
  reactions?: Record<string, number>;
  userReactions?: Record<string, string>;
}


const emojiOptions = ['❤️', '😂', '😢', '👍'];
// Approximate height of a single comment item including margins
const COMMENT_ITEM_HEIGHT = 80;
const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };

export default function Page() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { theme } = useTheme();
  const [wish, setWish] = useState<Wish | null>(null);
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState<Comment[]>([]);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<{ type: 'wish' | 'comment'; id: string } | null>(null);
  const [reportVisible, setReportVisible] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const [fulfillmentVisible, setFulfillmentVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sound, setSound] = useState<AudioPlayer | null>(null);
  const [postingComment, setPostingComment] = useState(false);
  const [useProfileComment, setUseProfileComment] = useState(true);
  const [publicStatus, setPublicStatus] = useState<Record<string, boolean>>({});
  const [verifiedStatus, setVerifiedStatus] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);
  const { user, profile } = useAuth();

  const isBoosted =
    wish?.boostedUntil &&
    wish.boostedUntil.toDate &&
    wish.boostedUntil.toDate() > new Date();
  const timeLeft =
    isBoosted && wish?.boostedUntil?.toDate
      ? formatTimeLeft(wish.boostedUntil.toDate())
      : '';
  const canBoost =
    user &&
    wish?.userId === user.uid &&
    (!wish?.boostedUntil ||
      !wish.boostedUntil.toDate ||
      wish.boostedUntil.toDate() < new Date());

  const flatListRef = useRef<FlatList<Comment>>(null);

  const animationRefs = useRef<{ [key: string]: Animated.Value }>({});

  const fetchWish = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getWish(id as string);
      if (data) {
        setWish(data);
      }
    } catch (err) {
      console.error('❌ Failed to load wish:', err);
      setError('Failed to load wish');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const checkVote = async () => {
      const voted = await AsyncStorage.getItem('votedPolls');
      const list = voted ? JSON.parse(voted) : [];
      if (list.includes(id)) setHasVoted(true);
    };
    checkVote();
  }, [id]);

  const subscribeToComments = useCallback(() => {
setLoading(true);
try {
  const unsubscribe = listenWishComments(id as string, (list) => {
    list.forEach((d) => {
      const commentId = d.id;
      if (!animationRefs.current[commentId]) {
        animationRefs.current[commentId] = new Animated.Value(0);
      }
    });

    const sorted = [...list].sort((a, b) => {
      const aCount = Object.values(a.reactions || {}).reduce((s, v) => s + v, 0);
      const bCount = Object.values(b.reactions || {}).reduce((s, v) => s + v, 0);
      return bCount - aCount;
    });

    setComments(sorted);
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 300);
    setLoading(false);
  });

  return unsubscribe;
} catch (err) {
  console.error('❌ Failed to load comments:', err);
  setError('Failed to load comments');
  setLoading(false);
  return () => {};
}

  }, [id]);

  useEffect(() => {
    const unsubscribe = subscribeToComments();
    return unsubscribe;
  }, [subscribeToComments]);

  useEffect(() => {
    const fetchStatus = async () => {
      const ids = new Set<string>();
      if (wish?.userId) ids.add(wish.userId);
      comments.forEach((c) => c.userId && ids.add(c.userId));
      await Promise.all(
        Array.from(ids).map(async (uid) => {
          if (publicStatus[uid] === undefined) {
            const snap = await getDoc(doc(db, 'users', uid));
            setPublicStatus((prev) => ({
              ...prev,
              [uid]: snap.exists() ? snap.data().publicProfileEnabled !== false : false,
            }));
          }
        })
      );
    };
    fetchStatus();
  }, [comments, wish]);

  useEffect(() => {
    const fetchVerified = async () => {
      const ids = Array.from(new Set(comments.map((c) => c.userId).filter(Boolean)));
      await Promise.all(
        ids.map(async (uid) => {
          if (!uid || verifiedStatus[uid] !== undefined) return;
          const q = query(collectionGroup(db, 'comments'), where('userId', '==', uid));
          const snap = await getDocs(q);
          let total = 0;
          snap.forEach((d) => {
            const r = d.data().reactions || {};
            total += Object.values(r).reduce((s: number, v: any) => s + v, 0);
          });
          setVerifiedStatus((prev) => ({ ...prev, [uid]: total >= 10 }));
        })
      );
    };
    fetchVerified();
  }, [comments]);

  const playAudio = useCallback(async () => {
    if (!wish?.audioUrl) return;
    try {
      const player = createAudioPlayer({ uri: wish.audioUrl });
      setSound(player);
      player.play();
    } catch (err) {
      console.error('❌ Failed to play audio:', err);
    }
  }, [wish]);

  useEffect(() => {
    return () => {
      sound?.remove();
    };
  }, [sound]);

  const handlePostComment = useCallback(async () => {
    if (!comment.trim()) return;
    setPostingComment(true);
    try {
      await addComment(id as string, {
        text: comment.trim(),
        userId: user?.uid,
        displayName: useProfileComment ? profile?.displayName || '' : '',
        photoURL: useProfileComment ? profile?.photoURL || '' : '',
        isAnonymous: !useProfileComment,
        parentId: replyTo,
        reactions: {},
        userReactions: {},
      });
      setComment('');
      setReplyTo(null);

      // Push notifications are sent from Cloud Functions
      Alert.alert('Comment posted!');
    } catch (err) {
      console.error('❌ Failed to post comment:', err);
    } finally {
      setPostingComment(false);
    }
  }, [comment, id, replyTo, wish, user, profile, useProfileComment]);


  const handleReact = useCallback(async (commentId: string, emoji: string) => {
    const comment = comments.find((c) => c.id === commentId);
    if (!comment) return;
    const currentUser = user?.uid || 'anon';
    const prevEmoji = comment.userReactions?.[currentUser];

    try {
      await updateCommentReaction(id as string, commentId, emoji, prevEmoji, currentUser);
    } catch (err) {
      console.error('❌ Failed to update reaction:', err);
    }
  }, [comments, id, user]);

  const handleReport = useCallback(
    async (reason: string) => {
      if (!reportTarget) return;
      try {
        await addDoc(collection(db, 'reports'), {
          itemId: reportTarget.id,
          type: reportTarget.type,
          reason,
          timestamp: serverTimestamp(),
        });
      } catch (err) {
        console.error('❌ Failed to submit report:', err);
      } finally {
        setReportVisible(false);
        setReportTarget(null);
      }
    },
    [reportTarget]
  );

  const handleVote = useCallback(
    async (option: 'A' | 'B') => {
      if (!wish || hasVoted) return;
      try {
        const ref = doc(db, 'wishes', wish.id);
        await updateDoc(ref, {
          [option === 'A' ? 'votesA' : 'votesB']: increment(1),
        });
        const voted = await AsyncStorage.getItem('votedPolls');
        const list = voted ? JSON.parse(voted) : [];
        list.push(wish.id);
        await AsyncStorage.setItem('votedPolls', JSON.stringify(list));
        setHasVoted(true);
        await fetchWish();
      } catch (err) {
        console.error('❌ Failed to vote:', err);
      }
    },
    [fetchWish, hasVoted, wish]
  );

  const handleFulfillWish = useCallback(
    async (link: string) => {
      if (!link.trim()) return;
      try {
        await setFulfillmentLink(id as string, link.trim());
        await fetchWish();
      } catch (err) {
        console.error('❌ Failed to fulfill wish:', err);
      }
    },
    [fetchWish, id]
  );

  const handleBoostWish = useCallback(() => {
    if (!wish) return;
    router.push(`/boost/${wish.id}`);
  }, [router, wish]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchWish();
    setRefreshing(false);
  }, [fetchWish]);


  const renderCommentItem = useCallback(
    (item: Comment, level = 0) => {
      const animValue = animationRefs.current[item.id] || new Animated.Value(0);
      Animated.timing(animValue, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();

      const currentUser = user?.uid || 'anon';
      const userReaction = item.userReactions?.[currentUser];
      const replies = comments.filter((c) => c.parentId === item.id);

      return (
        <View key={item.id}>
          <Animated.View
            style={{
              ...styles.commentBox,
              marginLeft: level * 16,
              opacity: animValue,
              transform: [
                {
                  translateY: animValue.interpolate({
                    inputRange: [0, 1],
                    outputRange: [10, 0],
                  }),
                },
              ],
            }}
          >
            {!item.isAnonymous &&
              publicStatus[item.userId || ''] && (
                <TouchableOpacity
                  onPress={() => router.push(`/profile/${item.displayName}`)}
                  hitSlop={HIT_SLOP}
                >
                  <Text style={styles.nickname}>
                    {item.displayName}
                    {verifiedStatus[item.userId || ''] ? ' \u2705 Verified' : ''}
                  </Text>
                </TouchableOpacity>
              )}
            <Text style={styles.comment}>{item.text}</Text>
            <Text style={styles.timestamp}>
              {item.timestamp?.seconds
                ? formatDistanceToNow(new Date(item.timestamp.seconds * 1000), { addSuffix: true })
                : 'Just now'}
            </Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
              {emojiOptions.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  onPress={() => handleReact(item.id, emoji)}
                  style={{ marginRight: 8, opacity: userReaction === emoji ? 1 : 0.4 }}
                >
                  <Text style={{ fontSize: 20 }}>
                    {emoji} {item.reactions?.[emoji] || 0}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={() => setReplyTo(item.id)} style={{ marginLeft: 8 }}>
                <Text style={{ color: '#a78bfa' }}>Reply</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setReportTarget({ type: 'comment', id: item.id });
                  setReportVisible(true);
                }}
                style={{ marginLeft: 8 }}
                hitSlop={HIT_SLOP}
              >
                <Text style={{ color: '#f87171' }}>Report</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
          {replies.map((r) => renderCommentItem(r, level + 1))}
        </View>
      );
    },
    [comments, handleReact, user]
  );

  const renderComment = useCallback(({ item }: { item: Comment }) => renderCommentItem(item), [renderCommentItem]);

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background }]}
    >
      <StatusBar
        style={theme.name === 'dark' ? 'light' : 'dark'}
        backgroundColor={theme.background}
      />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
      >
        <ScrollView contentContainerStyle={styles.contentContainer}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} hitSlop={HIT_SLOP}>
          <Text style={[styles.backButtonText, { color: theme.tint }]}>← Back</Text>
        </TouchableOpacity>

{loading ? (
  <ActivityIndicator size="large" color="#a78bfa" style={{ marginTop: 20 }} />
) : error ? (
  <Text style={styles.errorText}>{error}</Text>
) : (
  <>
    {wish && (
      <View
        style={[
          styles.wishBox,
          { backgroundColor: typeInfo[wish.type || 'wish'].color },
        ]}
      >
        <Text style={[styles.wishCategory, { color: theme.tint }]}>
          {typeInfo[wish.type || 'wish'].emoji} #{wish.category}
        </Text>
        <Text style={[styles.wishText, { color: theme.text }]}>{wish.text}</Text>
        {wish.fulfillmentLink && (
          <Text style={{ color: '#34d399', marginTop: 4 }}>
            💝 Fulfilled
          </Text>
        )}
        {wish.imageUrl && (
          <Image source={{ uri: wish.imageUrl }} style={styles.preview} />
        )}

        {wish.isPoll ? (
          <View style={{ marginTop: 8 }}>
            {(() => {
              const totalVotes = (wish.votesA || 0) + (wish.votesB || 0);
              const percentA = totalVotes
                ? Math.round(((wish.votesA || 0) / totalVotes) * 100)
                : 0;
              const percentB = totalVotes
                ? Math.round(((wish.votesB || 0) / totalVotes) * 100)
                : 0;
              return (
                <>
                  <TouchableOpacity
                    style={styles.pollOption}
                    disabled={hasVoted}
                    onPress={() => handleVote('A')}
                  >
                    <Text style={[styles.pollOptionText, { color: theme.text }]}>
                      {wish.optionA} - {wish.votesA || 0} ({percentA}%)
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.pollOption}
                    disabled={hasVoted}
                    onPress={() => handleVote('B')}
                  >
                    <Text style={[styles.pollOptionText, { color: theme.text }]}>
                      {wish.optionB} - {wish.votesB || 0} ({percentB}%)
                    </Text>
                  </TouchableOpacity>
                  <Text style={{ color: theme.text, marginTop: 4 }}>
                    Total votes: {totalVotes}
                  </Text>
                </>
              );
            })()}
            <BarChart
              data={{
                labels: [wish.optionA || 'A', wish.optionB || 'B'],
                datasets: [{ data: [wish.votesA || 0, wish.votesB || 0] }],
              }}
              width={Dimensions.get('window').width - 80}
              height={220}
              yAxisLabel=""
              yAxisSuffix=""
              fromZero
              chartConfig={{
                backgroundColor: '#1e1e1e',
                backgroundGradientFrom: '#1e1e1e',
                backgroundGradientTo: '#1e1e1e',
                color: () => '#a78bfa',
                labelColor: () => '#ccc',
              }}
              style={{ marginTop: 10 }}
            />
          </View>
        ) : (
          <Text style={[styles.likes, { color: theme.tint }]}>❤️ {wish.likes}</Text>
        )}
        {isBoosted && (
          <Text style={styles.boostedLabel}>
            🚀 {wish.boosted === 'stripe' ? 'Boosted via Stripe' : 'Boosted'}
            {timeLeft ? ` (${timeLeft})` : ''}
          </Text>
        )}

        {wish.audioUrl && (
          <TouchableOpacity onPress={playAudio} style={{ marginTop: 10 }}>
            <Text style={{ color: '#a78bfa' }}>▶ Play Audio</Text>
          </TouchableOpacity>
        )}

        {wish.giftLink && (
          <TouchableOpacity
            onPress={() => Linking.openURL(wish.giftLink!)}
            style={{ marginTop: 8 }}
          >
            <Text style={{ color: '#34d399' }}>Fulfill this wish</Text>
          </TouchableOpacity>
        )}

        {canBoost && (
          <TouchableOpacity onPress={handleBoostWish} style={{ marginTop: 8 }}>
            <Text style={{ color: '#facc15' }}>Boost Wish</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={() => {
            setReportTarget({ type: 'wish', id: wish.id });
            setReportVisible(true);
          }}
          style={{ marginTop: 8 }}
          hitSlop={HIT_SLOP}
        >
          <Text style={{ color: '#f87171' }}>Report</Text>
        </TouchableOpacity>
      </View>
    )}
  </>
)}



<FlatList
  ref={flatListRef}
  data={comments.filter((c) => !c.parentId)}
  keyExtractor={(item) => item.id}
  renderItem={renderComment}
  refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
  contentContainerStyle={{ paddingBottom: 80, flexGrow: 1 }}
  scrollEnabled={false}
  initialNumToRender={10}
  getItemLayout={(_, index) => ({
    length: COMMENT_ITEM_HEIGHT,
    offset: COMMENT_ITEM_HEIGHT * index,
    index,
  })}
/>


        {replyTo && (
          <View style={styles.replyInfo}>
            <Text style={{ color: '#a78bfa' }}>
              Replying to{' '}
              {(() => {
                const r = comments.find((c) => c.id === replyTo);
                if (r && !r.isAnonymous && publicStatus[r.userId || '']) {
                  return r.displayName;
                }
                return 'Anonymous';
              })()}
            </Text>
            <TouchableOpacity onPress={() => setReplyTo(null)} style={{ marginLeft: 8 }}>
              <Text style={{ color: '#fff' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.label}>Comment</Text>
        <TextInput
          style={styles.input}
          placeholder="Your comment"
          placeholderTextColor="#aaa"
          value={comment}
          onChangeText={setComment}
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Text style={{ color: '#fff', marginRight: 8 }}>Comment with profile</Text>
          <Switch value={useProfileComment} onValueChange={setUseProfileComment} />
        </View>

        <TouchableOpacity
          style={styles.button}
          onPress={handlePostComment}
          disabled={postingComment}
          hitSlop={HIT_SLOP}
        >
          {postingComment ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Send Comment</Text>
          )}
        </TouchableOpacity>
        <ReportDialog
          visible={reportVisible}
          onClose={() => {
            setReportVisible(false);
            setReportTarget(null);
          }}
          onSubmit={handleReport}
        />

        {wish?.fulfillmentLink ? (
          <TouchableOpacity
            onPress={() => {
              trackEvent('open_fulfillment_link');
              Linking.openURL(wish.fulfillmentLink!);
            }}
            style={{ marginTop: 8 }}
          >
            <Text style={{ color: '#34d399' }}>View Fulfillment Link</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.button}
            onPress={() => setFulfillmentVisible(true)}
            hitSlop={HIT_SLOP}
          >
            <Text style={styles.buttonText}>Fulfill this Wish</Text>
          </TouchableOpacity>
        )}

        <FulfillmentLinkDialog
          visible={fulfillmentVisible}
          onClose={() => setFulfillmentVisible(false)}
          onSubmit={(link) => {
            setFulfillmentVisible(false);
            handleFulfillWish(link);
          }}
        />
        </ScrollView>

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
  backButton: {
    marginBottom: 10,
  },
  backButtonText: {
    fontSize: 16,
  },
  wishBox: {
    padding: 14,
    borderRadius: 10,
    marginBottom: 20,
  },
  wishCategory: {
    fontSize: 12,
    fontWeight: '600',
  },
  wishText: {
    fontSize: 16,
    fontWeight: '500',
    marginTop: 4,
  },
  preview: {
    width: '100%',
    height: 200,
    borderRadius: 10,
    marginTop: 8,
  },
  likes: {
    fontSize: 14,
    marginTop: 8,
    fontWeight: '500',
  },
  boostedLabel: {
    color: '#facc15',
    fontSize: 12,
    marginTop: 4,
  },
  pollOption: {
    backgroundColor: '#2e2e2e',
    padding: 10,
    borderRadius: 8,
    marginTop: 6,
  },
  pollOptionText: {
    textAlign: 'center',
  },
  commentBox: {
    backgroundColor: '#1a1a1a',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  replyInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  nickname: {
    color: '#ccc',
    fontSize: 12,
    marginBottom: 2,
  },
  comment: {
    color: '#fff',
    fontSize: 14,
  },
  timestamp: {
    color: '#666',
    fontSize: 10,
    marginTop: 4,
  },
  label: {
    color: '#ccc',
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#1e1e1e',
    color: '#fff',
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
  },
  errorText: {
    color: '#f87171',
    textAlign: 'center',
    marginTop: 20,
  },
  button: {
    backgroundColor: '#8b5cf6',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
