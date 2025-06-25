// app/wish/[id].tsx — Updated to restore Back button and include getUserData()
import { formatDistanceToNow } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
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

interface Comment {
  id: string;
  text: string;
  nickname?: string;
  timestamp?: any;
  reactions?: Record<string, number>;
  userReactions?: Record<string, string>;
}

const emojiOptions = ['❤️', '😂', '😢', '👍'];

export default function WishDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [wish, setWish] = useState<any>(null);
  const [comment, setComment] = useState('');
  const [nickname, setNickname] = useState('');
  const [comments, setComments] = useState<Comment[]>([]);
  const flatListRef = useRef<FlatList>(null);
  const animationRefs = useRef<{ [key: string]: Animated.Value }>({});

  useEffect(() => {
    const fetchWish = async () => {
      const ref = doc(db, 'wishes', id as string);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        setWish({ id: snap.id, ...snap.data() });
      }
    };
    fetchWish();
  }, [id]);

  useEffect(() => {
    const commentsRef = collection(db, 'wishes', id as string, 'comments');
    const q = query(commentsRef, orderBy('timestamp', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((doc) => {
        const commentId = doc.id;
        if (!animationRefs.current[commentId]) {
          animationRefs.current[commentId] = new Animated.Value(0);
        }
        return {
          id: doc.id,
          ...doc.data(),
        };
      }) as Comment[];

      const sorted = list.sort((a, b) => {
        const aCount = Object.values(a.reactions || {}).reduce((sum, val) => sum + val, 0);
        const bCount = Object.values(b.reactions || {}).reduce((sum, val) => sum + val, 0);
        return bCount - aCount;
      });

      setComments(sorted);

      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 300);
    });

    return () => unsubscribe();
  }, [id]);

  const handlePostComment = async () => {
    if (comment.trim() === '') return;
    try {
      const commentsRef = collection(db, 'wishes', id as string, 'comments');
      await addDoc(commentsRef, {
        text: comment.trim(),
        nickname: nickname.trim() || 'Anonymous',
        timestamp: serverTimestamp(),
        reactions: {},
        userReactions: {},
      });
      setComment('');
    } catch (err) {
      console.error('❌ Failed to post comment:', err);
    }
  };

  const handleReact = async (commentId: string, emoji: string) => {
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
  };

  // Fetch user data from Firestore
  const getUserData = async (userId: string) => {
    try {
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const userData = userSnap.data();
        console.log('User data:', userData);
        return userData;
      } else {
        console.warn('No such user found');
        return null;
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      return null;
    }
  };

  const renderComment = ({ item }: { item: Comment }) => {
    const animValue = animationRefs.current[item.id] || new Animated.Value(0);
    Animated.timing(animValue, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();

    const currentUser = nickname.trim() || 'Anonymous';
    const userReaction = item.userReactions?.[currentUser];

    return (
      <Animated.View
        style={{
          ...styles.commentBox,
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
        </View>
      </Animated.View>
    );
  };

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

        {wish && (
          <View style={styles.wishBox}>
            <Text style={styles.wishCategory}>#{wish.category}</Text>
            <Text style={styles.wishText}>{wish.text}</Text>
            <Text style={styles.likes}>❤️ {wish.likes}</Text>
          </View>
        )}

        <FlatList
          ref={flatListRef}
          data={comments}
          keyExtractor={(item) => item.id}
          renderItem={renderComment}
          contentContainerStyle={{ paddingBottom: 80 }}
        />

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
  commentBox: {
    backgroundColor: '#1a1a1a',
    padding: 10,
    borderRadius: 8,
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
