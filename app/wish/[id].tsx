// app/wish/[id].tsx — detail view of a single wish
import { formatDistanceToNow } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { Audio } from 'expo-av';
import {
  getWish,
  listenWishComments,
  addComment,
  updateCommentReaction,
  boostWish,
} from '../../helpers/firestore';

import {
  addDoc,
  collection,
  serverTimestamp,
  increment,
  doc,
  updateDoc,
} from 'firebase/firestore'; // ✅ Keep only if used directly in this file

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Colors } from '../../constants/Colors';
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
  Linking,
} from 'react-native';
import { useColorScheme } from '@/hooks/useColorScheme';
import { BarChart } from 'react-native-chart-kit';
import ReportDialog from '../../components/ReportDialog';
import { db } from '../../firebase';
import type { Wish } from '../../types/Wish';
import { useAuth } from '@/contexts/AuthContext';

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
  const colorScheme = useColorScheme();
  const [wish, setWish] = useState<Wish | null>(null);
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState<Comment[]>([]);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<{ type: 'wish' | 'comment'; id: string } | null>(null);
  const [reportVisible, setReportVisible] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const [fulfillment, setFulfillment] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [postingComment, setPostingComment] = useState(false);
  const [useProfileComment, setUseProfileComment] = useState(true);
  const { user, profile } = useAuth();

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

  const playAudio = useCallback(async () => {
    if (!wish?.audioUrl) return;
    try {
      const { sound: newSound } = await Audio.Sound.createAsync({ uri: wish.audioUrl });
      setSound(newSound);
      await newSound.playAsync();
    } catch (err) {
      console.error('❌ Failed to play audio:', err);
    }
  }, [wish]);

  useEffect(() => {
    return () => {
      sound?.unloadAsync();
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

      if (wish?.pushToken) {
        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to: wish.pushToken,
            title: 'New comment on your wish 💬',
            body: 'Someone left a comment on your wish.',
          }),
        });
      }
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

  const handleFulfillWish = useCallback(async () => {
    if (!fulfillment.trim()) return;
    try {
      const fulfillRef = collection(db, 'wishes', id as string, 'fulfillments');
      await addDoc(fulfillRef, {
        text: fulfillment.trim(),
        timestamp: serverTimestamp(),
      });
      setFulfillment('');
    } catch (err) {
      console.error('❌ Failed to fulfill wish:', err);
    }
  }, [fulfillment, id]);

  const handleBoostWish = useCallback(async () => {
    if (!wish) return;
    try {
      // Payment flow would occur here
      await boostWish(wish.id, 24);
      await fetchWish();
    } catch (err) {
      console.error('❌ Failed to boost wish:', err);
    }
  }, [fetchWish, wish]);


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
            {!item.isAnonymous && (
              <Text style={styles.nickname}>{item.displayName}</Text>
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
      style={[styles.safeArea, { backgroundColor: Colors[colorScheme].background }]}
    >
      <StatusBar
        style={colorScheme === 'dark' ? 'light' : 'dark'}
        backgroundColor={Colors[colorScheme].background}
      />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} hitSlop={HIT_SLOP}>
          <Text style={[styles.backButtonText, { color: Colors[colorScheme].tint }]}>← Back</Text>
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
          { backgroundColor: colorScheme === 'dark' ? '#1e1e1e' : '#ffffff' },
        ]}
      >
        <Text style={[styles.wishCategory, { color: Colors[colorScheme].tint }]}>#{wish.category}</Text>
        <Text style={[styles.wishText, { color: Colors[colorScheme].text }]}>{wish.text}</Text>
        {wish.imageUrl && (
          <Image source={{ uri: wish.imageUrl }} style={styles.preview} />
        )}

        {wish.isPoll ? (
          <View style={{ marginTop: 8 }}>
            <TouchableOpacity
              style={styles.pollOption}
              disabled={hasVoted}
              onPress={() => handleVote('A')}
            >
              <Text style={[styles.pollOptionText, { color: Colors[colorScheme].text }]}>
                {wish.optionA} - {wish.votesA || 0}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.pollOption}
              disabled={hasVoted}
              onPress={() => handleVote('B')}
            >
              <Text style={[styles.pollOptionText, { color: Colors[colorScheme].text }]}>
                {wish.optionB} - {wish.votesB || 0}
              </Text>
            </TouchableOpacity>
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
          <Text style={[styles.likes, { color: Colors[colorScheme].tint }]}>❤️ {wish.likes}</Text>
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

        <TouchableOpacity onPress={handleBoostWish} style={{ marginTop: 8 }}>
          <Text style={{ color: '#facc15' }}>Boost Wish</Text>
        </TouchableOpacity>

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
  contentContainerStyle={{ paddingBottom: 80 }}
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
              Replying to {comments.find((c) => c.id === replyTo)?.displayName || 'Anonymous'}
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

        <Text style={styles.label}>Fulfillment</Text>
        <TextInput
          style={styles.input}
          placeholder="Fulfillment text or link"
          placeholderTextColor="#aaa"
          value={fulfillment}
          onChangeText={setFulfillment}
        />

        <TouchableOpacity style={styles.button} onPress={handleFulfillWish} hitSlop={HIT_SLOP}>
          <Text style={styles.buttonText}>Fulfill Wish</Text>
        </TouchableOpacity>

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
    padding: 20,
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
