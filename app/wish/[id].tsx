// app/wish/[id].tsx — detail view of a single wish
import { formatDistanceToNow } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { Audio } from 'expo-av';
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  increment,
  updateDoc,
} from 'firebase/firestore';
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
  View,
} from 'react-native';
import { db } from '../../firebase';

interface Wish {
  id: string;
  text: string;
  category: string;
  likes: number;
  isPoll?: boolean;
  optionA?: string;
  optionB?: string;
  votesA?: number;
  votesB?: number;
  pushToken?: string;
  audioUrl?: string;

}


interface Comment {
  id: string;
  text: string;
  nickname?: string;
  timestamp?: any;
  parentId?: string;
  reactions?: Record<string, number>;
  userReactions?: Record<string, string>;
}

const emojiOptions = ['❤️', '😂', '😢', '👍'];
// Approximate height of a single comment item including margins
const COMMENT_ITEM_HEIGHT = 80;

export default function WishDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [wish, setWish] = useState<Wish | null>(null);
  const [comment, setComment] = useState('');
  const [nickname, setNickname] = useState('');
  const [comments, setComments] = useState<Comment[]>([]);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [fulfillment, setFulfillment] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);

  const flatListRef = useRef<FlatList<Comment>>(null);

  const animationRefs = useRef<{ [key: string]: Animated.Value }>({});

  const fetchWish = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ref = doc(db, 'wishes', id as string);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        setWish({ id: snap.id, ...(snap.data() as Omit<Wish, 'id'>) });
      }
    } catch (err) {
      console.error('❌ Failed to load wish:', err);
      setError('Failed to load wish');
    } finally {
      setLoading(false);
    }
  }, [id]);

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
    const commentsRef = collection(db, 'wishes', id as string, 'comments');
    const q = query(commentsRef, orderBy('timestamp', 'asc'));

    setLoading(true);
    return onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((d) => {
          const commentId = d.id;
          if (!animationRefs.current[commentId]) {
            animationRefs.current[commentId] = new Animated.Value(0);
          }
          const data = d.data() as Omit<Comment, 'id'> & { parentId?: string };
          return { id: d.id, ...data };
        }) as Comment[];

        const sorted = [...list].sort((a, b) => {
          const aCount = Object.values(a.reactions || {}).reduce((s, v) => s + v, 0);
          const bCount = Object.values(b.reactions || {}).reduce((s, v) => s + v, 0);
          return bCount - aCount;
        });
        setComments(sorted);
        setLoading(false);
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 300);
      },
      (err) => {
        console.error('❌ Failed to load comments:', err);
        setError('Failed to load comments');
        setLoading(false);
      }
    );
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
    try {
      const commentsRef = collection(db, 'wishes', id as string, 'comments');
      await addDoc(commentsRef, {
        text: comment.trim(),
        nickname: nickname.trim() || 'Anonymous',
        timestamp: serverTimestamp(),
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
    } catch (err) {
      console.error('❌ Failed to post comment:', err);
    }
  }, [comment, id, nickname, replyTo, wish]);


  const handleReact = useCallback(async (commentId: string, emoji: string) => {
    const comment = comments.find((c) => c.id === commentId);
    if (!comment) return;
    const currentUser = nickname.trim() || 'Anonymous';
    const prevEmoji = comment.userReactions?.[currentUser];
    const newReactions = { ...(comment.reactions || {}) };
    const newUserReactions = { ...(comment.userReactions || {}) };

    if (prevEmoji && newReactions[prevEmoji]) {
      newReactions[prevEmoji] -= 1;
      if (newReactions[prevEmoji] === 0) delete newReactions[prevEmoji];
    }

    if (prevEmoji === emoji) {
      delete newUserReactions[currentUser];
    } else {
      newUserReactions[currentUser] = emoji;
      newReactions[emoji] = (newReactions[emoji] || 0) + 1;
    }

    try {
      const commentRef = doc(db, 'wishes', id as string, 'comments', commentId);
      await updateDoc(commentRef, {
        reactions: newReactions,
        userReactions: newUserReactions,
      });
    } catch (err) {
      console.error('❌ Failed to update reaction:', err);
    }
  }, [comments, id, nickname]);

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
      } catch (err) {
        console.error('❌ Failed to vote:', err);
      }
    },
    [hasVoted, wish]
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



  const renderCommentItem = useCallback(
    (item: Comment, level = 0) => {
      const animValue = animationRefs.current[item.id] || new Animated.Value(0);
      Animated.timing(animValue, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();

      const currentUser = nickname.trim() || 'Anonymous';
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
            <Text style={styles.nickname}>{item.nickname}</Text>
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
            </View>
          </Animated.View>
          {replies.map((r) => renderCommentItem(r, level + 1))}
        </View>
      );
    },
    [comments, handleReact, nickname]
  );

  const renderComment = useCallback(({ item }: { item: Comment }) => renderCommentItem(item), [renderCommentItem]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" backgroundColor="#0e0e0e" />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>

{loading ? (
  <ActivityIndicator size="large" color="#a78bfa" style={{ marginTop: 20 }} />
) : error ? (
  <Text style={styles.errorText}>{error}</Text>
) : (
  <>
    {wish && (
      <View style={styles.wishBox}>
        <Text style={styles.wishCategory}>#{wish.category}</Text>
        <Text style={styles.wishText}>{wish.text}</Text>

        {wish.isPoll ? (
          <View style={{ marginTop: 8 }}>
            <TouchableOpacity
              style={styles.pollOption}
              disabled={hasVoted}
              onPress={() => handleVote('A')}
            >
              <Text style={styles.pollOptionText}>
                {wish.optionA} - {wish.votesA || 0}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.pollOption}
              disabled={hasVoted}
              onPress={() => handleVote('B')}
            >
              <Text style={styles.pollOptionText}>
                {wish.optionB} - {wish.votesB || 0}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.likes}>❤️ {wish.likes}</Text>
        )}

        {wish.audioUrl && (
          <TouchableOpacity onPress={playAudio} style={{ marginTop: 10 }}>
            <Text style={{ color: '#a78bfa' }}>▶ Play Audio</Text>
          </TouchableOpacity>
        )}
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
              Replying to {comments.find((c) => c.id === replyTo)?.nickname}
            </Text>
            <TouchableOpacity onPress={() => setReplyTo(null)} style={{ marginLeft: 8 }}>
              <Text style={{ color: '#fff' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        <TextInput
          style={styles.input}
          placeholder="Your comment"
          placeholderTextColor="#aaa"
          value={comment}
          onChangeText={setComment}
        />

        <TextInput
          style={styles.input}
          placeholder="Nickname (optional)"
          placeholderTextColor="#aaa"
          value={nickname}
          onChangeText={setNickname}
        />

        <TouchableOpacity style={styles.button} onPress={handlePostComment}>
          <Text style={styles.buttonText}>Post Comment</Text>
        </TouchableOpacity>

        <TextInput
          style={styles.input}
          placeholder="Fulfillment text or link"
          placeholderTextColor="#aaa"
          value={fulfillment}
          onChangeText={setFulfillment}
        />

        <TouchableOpacity style={styles.button} onPress={handleFulfillWish}>
          <Text style={styles.buttonText}>Fulfill Wish</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
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
  backButton: {
    marginBottom: 10,
  },
  backButtonText: {
    color: '#a78bfa',
    fontSize: 16,
  },
  wishBox: {
    backgroundColor: '#1e1e1e',
    padding: 14,
    borderRadius: 10,
    marginBottom: 20,
  },
  wishCategory: {
    color: '#a78bfa',
    fontSize: 12,
  },
  wishText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 4,
  },
  likes: {
    color: '#a78bfa',
    fontSize: 14,
    marginTop: 8,
  },
  pollOption: {
    backgroundColor: '#2e2e2e',
    padding: 10,
    borderRadius: 8,
    marginTop: 6,
  },
  pollOptionText: {
    color: '#fff',
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
