// app/(tabs)/index.tsx — Full Home Screen with SafeArea, StatusBar, and Wish Logic
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StatusBar as RNStatusBar,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import ReportDialog from '../components/ReportDialog';
import { db } from '../../firebase';

interface Wish {
  id: string;
  text: string;
  category: string;
  likes: number;
  pushToken?: string;
}

export default function IndexScreen() {
  const [wish, setWish] = useState('');
  const [category, setCategory] = useState('general');
  const [wishList, setWishList] = useState<Wish[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [reportVisible, setReportVisible] = useState(false);
  const [reportTarget, setReportTarget] = useState<string | null>(null);

  useEffect(() => {
    registerForPushNotificationsAsync().then(setPushToken);

    const q = query(collection(db, 'wishes'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const wishes = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Wish[];
      setWishList(wishes);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handlePostWish = async () => {
    if (wish.trim() === '') return;

    try {
      await addDoc(collection(db, 'wishes'), {
        text: wish,
        category: category.trim().toLowerCase(),
        likes: 0,
        timestamp: serverTimestamp(),
        pushToken: pushToken || '',
      });
      setWish('');
      setCategory('general');
    } catch (error) {
      console.error('❌ Failed to post wish:', error);
    }
  };

  const handleLike = async (id: string) => {
    try {
      const liked = await AsyncStorage.getItem('likedWishes');
      const likedWishes = liked ? JSON.parse(liked) : [];

      if (likedWishes.includes(id)) {
        console.log('⛔ Already liked');
        return;
      }

      const ref = doc(db, 'wishes', id);
      await updateDoc(ref, {
        likes: increment(1),
      });

      const updatedLikes = [...likedWishes, id];
      await AsyncStorage.setItem('likedWishes', JSON.stringify(updatedLikes));

      const snap = await getDoc(ref);
      const token = snap.data()?.pushToken;

      if (token) {
        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to: token,
            title: 'Someone liked your wish! ❤️',
            body: 'Your dream is spreading good vibes.',
          }),
        });
      }
    } catch (error) {
      console.error('❌ Failed to like wish:', error);
    }
  };

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

  const filteredWishes = wishList.filter((wish) =>
    wish.text.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <RNStatusBar barStyle="light-content" backgroundColor="#0e0e0e" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <Text style={styles.title}>WhispList ✨</Text>
        <Text style={styles.subtitle}>Post a wish and see what dreams grow 🌱</Text>

        <TextInput
          style={styles.input}
          placeholder="Search wishes..."
          placeholderTextColor="#999"
          value={searchTerm}
          onChangeText={setSearchTerm}
        />

        <TextInput
          style={styles.input}
          placeholder="What's your wish?"
          placeholderTextColor="#999"
          value={wish}
          onChangeText={setWish}
        />

        <TextInput
          style={styles.input}
          placeholder="Category (e.g., love, health, career)"
          placeholderTextColor="#999"
          value={category}
          onChangeText={setCategory}
        />

        <Pressable
          style={[styles.button, { opacity: wish.trim() === '' ? 0.5 : 1 }]}
          onPress={handlePostWish}
          disabled={wish.trim() === ''}
        >
          <Text style={styles.buttonText}>Post Wish</Text>
        </Pressable>

        <TouchableOpacity onPress={() => router.push('/auth')} style={styles.authButton}>
          <Text style={styles.authButtonText}>Go to Auth</Text>
        </TouchableOpacity>

        {loading ? (
          <ActivityIndicator size="large" color="#a78bfa" style={{ marginTop: 20 }} />
        ) : filteredWishes.length === 0 ? (
          <Text style={styles.noResults}>No matching wishes 💭</Text>
        ) : (
          <FlatList
            data={filteredWishes}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.wishItem}>
                <TouchableOpacity onPress={() => router.push(`/wish/${item.id}`)}>
                  <Text style={{ color: '#a78bfa', fontSize: 12 }}>#{item.category}</Text>
                  <Text style={styles.wishText}>{item.text}</Text>
                  <Text style={styles.likeText}>❤️ {item.likes}</Text>
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
            )}
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
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#ccc',
    textAlign: 'center',
    marginBottom: 20,
  },
  input: {
    backgroundColor: '#1e1e1e',
    color: '#fff',
    padding: 14,
    borderRadius: 10,
    marginBottom: 10,
  },
  button: {
    backgroundColor: '#8b5cf6',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 20,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
  authButton: {
    marginBottom: 20,
    alignItems: 'center',
  },
  authButtonText: {
    color: '#a78bfa',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  wishItem: {
    backgroundColor: '#1e1e1e',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
  wishText: {
    color: '#fff',
    fontSize: 16,
  },
  likeText: {
    color: '#a78bfa',
    marginTop: 6,
    fontSize: 14,
  },
  noResults: {
    color: '#ccc',
    textAlign: 'center',
    marginTop: 20,
  },
});

async function registerForPushNotificationsAsync(): Promise<string | null> {
  let token;

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      Alert.alert('Permission required', 'Enable push notifications to get updates!');
      return null;
    }

    token = (await Notifications.getExpoPushTokenAsync()).data;
    console.log('Push token:', token);
  } else {
    Alert.alert('Physical device required', 'Push notifications only work on physical devices.');
    return null;
  }

  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  return token;
}
