// app/wish/[id].tsx — detail view of a single wish
import { formatDistanceToNow } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import {
  getWish,
  listenWishComments,
  addComment,
  updateCommentReaction,
  boostWish,
  setFulfillmentLink,
} from '../../helpers/firestore';
import { createGiftCheckout } from '../../helpers/firestore';

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
  setDoc,
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
  Modal,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
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
  const [player, setPlayer] = useState<AudioPlayer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [postingComment, setPostingComment] = useState(false);
  const [useProfileComment, setUseProfileComment] = useState(true);
  const [confirmGift, setConfirmGift] = useState<{link?: string; amount?: number; wishId?: string; recipientId?: string} | null>(null);
  const [showThanks, setShowThanks] = useState(false);
  const [thanksMessage, setThanksMessage] = useState('');
  const [nickname, setNickname] = useState('');
  const [owner, setOwner] = useState<any | null>(null);
  const [publicStatus, setPublicStatus] = useState<Record<string, boolean>>({});
  const [verifiedStatus, setVerifiedStatus] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);
  const { user, profile } = useAuth();
  useEffect(() => {
    const loadNickname = async () => {
      const n = await AsyncStorage.getItem('nickname');
      if (n) setNickname(n);
    };
    loadNickname();
  }, []);

  const isBoosted =
    wish?.boostedUntil &&
    wish.boostedUntil.toDate &&
    wish.boostedUntil.toDate() > new Date();
  const isActiveWish =
    isBoosted ||
    (wish?.likes || 0) > 5 ||
    wish?.active === true;
  const [timeLeft, setTimeLeft] = useState(
    isBoosted && wish?.boostedUntil?.toDate ? formatTimeLeft(wish.boostedUntil.toDate()) : ''
  );
  const glowAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (isBoosted && wish?.boostedUntil?.toDate) {
      const update = () => setTimeLeft(formatTimeLeft(wish.boostedUntil.toDate()));
      update();
      const id = setInterval(update, 60000);
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 1000, useNativeDriver: false }),
          Animated.timing(glowAnim, { toValue: 0, duration: 1000, useNativeDriver: false }),
        ])
      );
      loop.start();
      return () => {
        clearInterval(id);
        loop.stop();
      };
    } else {
      setTimeLeft('');
    }
  }, [isBoosted, wish?.boostedUntil]);
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
        if (data.userId) {
          try {
            const snap = await getDoc(doc(db, 'users', data.userId));
            setOwner(snap.exists() ? snap.data() : null);
          } catch (err) {
            console.warn('Failed to fetch wish owner', err);
            setOwner(null);
          }
        }
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
      if (!user?.uid) return;
      try {
        const snap = await getDoc(doc(db, 'votes', id as string, 'users', user.uid));
        if (snap.exists()) setHasVoted(true);
      } catch (err) {
        console.warn('Failed to check vote', err);
      }
    };
    checkVote();
  }, [id, user]);

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
            try {
              const snap = await getDoc(doc(db, 'users', uid));
              setPublicStatus((prev) => ({
                ...prev,
                [uid]: snap.exists() ? snap.data().publicProfileEnabled !== false : false,
              }));
            } catch (err) {
              console.warn('Failed to fetch user status', err);
              setPublicStatus((prev) => ({ ...prev, [uid]: false }));
            }
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

  const toggleAudio = useCallback(() => {
    try {
      if (player) {
        if (isPlaying) {
          player.pause();
          setIsPlaying(false);
        } else {
          player.play();
          setIsPlaying(true);
        }
        return;
      }
      if (!wish?.audioUrl) return;
      const p = createAudioPlayer(wish.audioUrl);
      setPlayer(p);
      p.play();
      setIsPlaying(true);
    } catch (err) {
      console.error('❌ Failed to play audio:', err);
    }
  }, [player, isPlaying, wish]);

  useEffect(() => {
    return () => {
      if (player) {
        player.remove();
      }
      setIsPlaying(false);
    };
  }, [player]);

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
        ...(nickname && !useProfileComment ? { nickname } : {}),
        parentId: replyTo,
        reactions: {},
        userReactions: {},
      });
      setComment('');
      setReplyTo(null);
      if (nickname) await AsyncStorage.setItem('nickname', nickname);

      // Push notifications are sent from Cloud Functions
      Alert.alert('Comment posted!');
    } catch (err) {
      console.error('❌ Failed to post comment:', err);
    } finally {
      setPostingComment(false);
    }
  }, [comment, id, replyTo, wish, user, profile, useProfileComment, nickname]);


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
        if (reportTarget.type === 'comment') {
          await addDoc(collection(db, 'wishes', id as string, 'commentReports'), {
            commentId: reportTarget.id,
            reason,
            timestamp: serverTimestamp(),
          });
        } else {
          await addDoc(collection(db, 'reports'), {
            itemId: reportTarget.id,
            type: reportTarget.type,
            reason,
            timestamp: serverTimestamp(),
          });
        }
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
      if (!wish || hasVoted || !user?.uid) return;
      try {
        const voteRef = doc(db, 'votes', wish.id, 'users', user.uid);
        const existing = await getDoc(voteRef);
        if (existing.exists()) {
          setHasVoted(true);
          return;
        }
        await setDoc(voteRef, { option, timestamp: serverTimestamp() });
        const ref = doc(db, 'wishes', wish.id);
        await updateDoc(ref, {
          [option === 'A' ? 'votesA' : 'votesB']: increment(1),
        });
        setHasVoted(true);
        await fetchWish();
      } catch (err) {
        console.error('❌ Failed to vote:', err);
      }
    },
    [fetchWish, hasVoted, wish, user]
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

  const openGiftLink = useCallback((link: string) => {
    setConfirmGift({ link });
  }, []);

  const handleSendMoney = useCallback(
    (amount: number) => {
      if (!wish || !wish.userId) return;
      setConfirmGift({ amount, wishId: wish.id, recipientId: wish.userId });
    },
    [wish]
  );

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
      const replies = isActiveWish ? comments.filter((c) => c.parentId === item.id) : [];

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
            {!item.isAnonymous && publicStatus[item.userId || ''] ? (
              <TouchableOpacity
                onPress={() => router.push(`/profile/${item.displayName}`)}
                hitSlop={HIT_SLOP}
              >
                <Text style={styles.nickname}>
                  {item.displayName}
                  {verifiedStatus[item.userId || ''] ? ' \u2705 Verified' : ''}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.nickname}>{item.nickname || 'Anonymous'}</Text>
            )}
            {item.userId === wish?.userId && (
              <Text style={[styles.nickname, { color: '#a78bfa' }]}> (author)</Text>
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
                  style={{ marginRight: 8, padding: 6, borderRadius: 6, opacity: userReaction === emoji ? 1 : 0.4 }}
                >
                  <Text style={{ fontSize: 20 }}>
                    {emoji} {item.reactions?.[emoji] || 0}
                  </Text>
                </TouchableOpacity>
              ))}
              {isActiveWish && (
                <TouchableOpacity onPress={() => setReplyTo(item.id)} style={{ marginLeft: 8 }}>
                  <Text style={{ color: '#a78bfa' }}>Reply</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onLongPress={() => {
                  setReportTarget({ type: 'comment', id: item.id });
                  setReportVisible(true);
                }}
                style={{ marginLeft: 8 }}
                hitSlop={HIT_SLOP}
              >
                <Text style={{ color: '#f87171' }}>🚩</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
          {replies.map((r) => renderCommentItem(r, level + 1))}
        </View>
      );
    },
    [comments, handleReact, user, isActiveWish]
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
      <Animated.View
        style={[
          styles.wishBox,
          {
            backgroundColor: typeInfo[wish.type || 'wish'].color,
            borderColor: isBoosted
              ? glowAnim.interpolate({ inputRange: [0, 1], outputRange: ['#facc15', '#fde68a'] })
              : 'transparent',
            borderWidth: isBoosted ? 2 : 0,
          },
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
          <Text style={styles.boostedLabel}>⏳ Time left: {timeLeft}</Text>
        )}

        {wish.audioUrl && (
          <TouchableOpacity onPress={toggleAudio} style={{ marginTop: 10 }}>
            <Text style={{ color: '#a78bfa' }}>
              {isPlaying ? '⏸ Pause Audio' : '▶ Play Audio'}
            </Text>
          </TouchableOpacity>
        )}

        {profile?.giftingEnabled && wish.giftLink && (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
            <TouchableOpacity
              onPress={() => openGiftLink(wish.giftLink!)}
              style={{ backgroundColor: theme.input, padding: 8, borderRadius: 8 }}
            >
              <Text style={{ color: theme.tint }}>
                {(() => {
                  try {
                    const url = new URL(wish.giftLink!);
                    const trusted = ['venmo.com', 'paypal.me', 'amazon.com'].some(d => url.hostname.includes(d));
                    return `${trusted ? '✅' : '⚠️'} 🎁 ${wish.giftLabel || 'Send Gift'}`;
                  } catch {
                    return `⚠️ 🎁 ${wish.giftLabel || 'Send Gift'}`;
                  }
                })()}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() =>
                Alert.alert(
                  'Gift Info',
                  'Gifting is anonymous and optional. You can attach a support link like Venmo or Stripe.'
                )
              }
              style={{ marginLeft: 6 }}
              hitSlop={HIT_SLOP}
            >
              <Ionicons name="information-circle-outline" size={16} color={theme.text} />
            </TouchableOpacity>
          </View>
        )}
        {profile?.giftingEnabled && owner?.stripeAccountId && (
          <View style={{ flexDirection: 'row', marginTop: 8 }}>
            {[3,5,10].map((amt) => (
              <TouchableOpacity
                key={amt}
                onPress={() => handleSendMoney(amt)}
                style={{
                  backgroundColor: theme.input,
                  padding: 8,
                  borderRadius: 8,
                  marginRight: 6,
                }}
              >
                <Text style={{ color: theme.tint }}>${amt}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {canBoost && (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
            <TouchableOpacity onPress={handleBoostWish} hitSlop={HIT_SLOP}>
              <Text style={{ color: '#facc15' }}>Boost Wish</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => Alert.alert('Boost Info', 'Boosting highlights a wish for 24 hours.')}
              style={{ marginLeft: 6 }}
              hitSlop={HIT_SLOP}
            >
              <Ionicons name="information-circle-outline" size={16} color={theme.text} />
            </TouchableOpacity>
          </View>
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
      </Animated.View>
    )}
  </>
)}



<FlatList
  ref={flatListRef}
  data={comments.filter((c) => isActiveWish || !c.parentId)}
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
        {!useProfileComment && (
          <TextInput
            style={styles.input}
            placeholder="Nickname or emoji"
            placeholderTextColor="#aaa"
            value={nickname}
            onChangeText={setNickname}
          />
        )}

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

        {confirmGift && (
          <Modal transparent animationType="fade" visible onRequestClose={() => setConfirmGift(null)}>
            <View style={styles.modalBackdrop}>
              <View style={[styles.modalCard, { backgroundColor: theme.input }]}>
                <Text style={[styles.modalText, { color: theme.text }]}>Confirm sending gift?</Text>
                <View style={{ flexDirection: 'row', marginTop: 10 }}>
                  <TouchableOpacity
                    onPress={async () => {
                      if (confirmGift.link) {
                        await WebBrowser.openBrowserAsync(confirmGift.link);
                        setShowThanks(true);
                      } else if (confirmGift.wishId && confirmGift.recipientId && confirmGift.amount) {
                        try {
                          const res = await createGiftCheckout(confirmGift.wishId, confirmGift.amount, confirmGift.recipientId);
                          if (res.url) await WebBrowser.openBrowserAsync(res.url);
                          setShowThanks(true);
                        } catch (err) {
                          console.error('Failed to checkout', err);
                        }
                      }
                      setConfirmGift(null);
                    }}
                    style={[styles.button, { marginRight: 8 }]}
                    hitSlop={HIT_SLOP}
                  >
                    <Text style={styles.buttonText}>Send</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setConfirmGift(null)} style={[styles.button, { backgroundColor: '#ccc' }]} hitSlop={HIT_SLOP}>
                    <Text style={[styles.buttonText, { color: '#000' }]}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        )}
        {showThanks && (
          <Modal transparent animationType="fade" visible onRequestClose={() => setShowThanks(false)}>
            <View style={styles.modalBackdrop}>
              <View style={[styles.modalCard, { backgroundColor: theme.input }]}>
                <Text style={[styles.modalText, { color: theme.text }]}>💝 Thanks for supporting this wish!</Text>
                <TextInput
                  style={[styles.input, { marginTop: 10 }]}
                  placeholder="Add a message (optional)"
                  placeholderTextColor="#999"
                  value={thanksMessage}
                  onChangeText={setThanksMessage}
                />
                {confirmGift?.wishId && (
                  <TouchableOpacity
                    onPress={async () => {
                      try {
                        await addDoc(collection(db, 'wishes', confirmGift!.wishId!, 'gifts'), {
                          message: thanksMessage,
                          from: user?.displayName || 'anonymous',
                          timestamp: serverTimestamp(),
                        });
                      } catch (err) {
                        console.error('Failed to save message', err);
                      }
                      setThanksMessage('');
                      setShowThanks(false);
                    }}
                    style={[styles.button, { marginTop: 10 }]}
                    hitSlop={HIT_SLOP}
                  >
                    <Text style={styles.buttonText}>Send</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setShowThanks(false)} style={[styles.button, { marginTop: 10 }]} hitSlop={HIT_SLOP}>
                  <Text style={styles.buttonText}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        )}
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    padding: 20,
    borderRadius: 10,
    width: '80%',
  },
  modalText: {
    fontSize: 16,
    textAlign: 'center',
  },
});
