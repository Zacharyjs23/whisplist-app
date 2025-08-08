// app/(tabs)/index.tsx — Full Home Screen with SafeArea, StatusBar, and Wish Logic
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { createRecorder, type AudioRecorder } from 'expo-audio';
import * as ExpoAudio from 'expo-audio';
import {
  addWish,
  getFollowingIds,
  followUser,
  unfollowUser,
  createGiftCheckout,
  cleanupExpiredWishes,
} from '../../helpers/firestore';
import { formatTimeLeft } from '../../helpers/time';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import {
  addDoc,
  collection,
  serverTimestamp,
  getDocs,
  query,
  orderBy,
  where,
  doc,
  getDoc,
  collectionGroup,
  limit,
  startAfter,
} from 'firebase/firestore';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
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
  Switch,
  TouchableOpacity,
  Image,
  View,
  RefreshControl,
  Modal,
  Animated,
  LayoutAnimation,
  ToastAndroid,
} from 'react-native';
import { Colors } from '@/constants/Colors';
import { useTheme } from '@/contexts/ThemeContext';
import { Picker } from '@react-native-picker/picker';
import ReportDialog from '../../components/ReportDialog';
import { db, storage } from '../../firebase';
import type { Wish } from '../../types/Wish';
import { useAuth } from '@/contexts/AuthContext';
import { DAILY_PROMPTS } from '../../constants/prompts';

const typeInfo: Record<string, { emoji: string; color: string }> = {
  wish: { emoji: '💭', color: '#1e1e1e' },
  confession: { emoji: '😶\u200d🌫️', color: '#374151' },
  advice: { emoji: '🧠', color: '#064e3b' },
  dream: { emoji: '🌙', color: '#312e81' },
};

/**
 * Pick a random prompt index that is not in the recent list. If all prompts
 * have been used recently, the recent list is cleared to start fresh.
 */
const pickPromptIndex = (recent: number[]): number => {
  let available = DAILY_PROMPTS.map((_, i) => i).filter(
    (i) => !recent.includes(i),
  );
  if (available.length === 0) {
    recent = [];
    available = DAILY_PROMPTS.map((_, i) => i);
  }
  return available[Math.floor(Math.random() * available.length)];
};

export default function Page() {
  const [wish, setWish] = useState('');
  const [postType, setPostType] = useState<
    'wish' | 'confession' | 'advice' | 'dream'
  >('wish');
  const [wishList, setWishList] = useState<Wish[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<
    'all' | 'wish' | 'confession' | 'advice' | 'dream'
  >('all');
  const [reportVisible, setReportVisible] = useState(false);
  const [reportTarget, setReportTarget] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [isPoll, setIsPoll] = useState(false);
  const [optionA, setOptionA] = useState('');
  const [optionB, setOptionB] = useState('');
  const [recording, setRecording] = useState<AudioRecorder | null>(null);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [includeAudio, setIncludeAudio] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [giftLink, setGiftLink] = useState('');
  const [giftType, setGiftType] = useState('');
  const [giftLabel, setGiftLabel] = useState('');
  const [posting, setPosting] = useState(false);
  const [postConfirm, setPostConfirm] = useState(false);
  const [autoDelete, setAutoDelete] = useState(false);
  const [rephrasing, setRephrasing] = useState(false);
  const { theme } = useTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const [useProfilePost, setUseProfilePost] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [publicStatus, setPublicStatus] = useState<Record<string, boolean>>({});
  const [stripeAccounts, setStripeAccounts] = useState<
    Record<string, string | null>
  >({});
  const [followStatus, setFollowStatus] = useState<Record<string, boolean>>({});
  const [streakCount, setStreakCount] = useState(0);
  const [dailyPrompt, setDailyPrompt] = useState('');
  const [impact, setImpact] = useState({
    wishes: 0,
    boosts: 0,
    gifts: 0,
    giftTotal: 0,
  });
  const promptOpacity = useRef(new Animated.Value(0)).current;
  const { user, profile } = useAuth();
  const stripeEnabled = profile?.giftingEnabled && profile?.stripeAccountId;
  const [enableExternalGift, setEnableExternalGift] = useState(!stripeEnabled);
  const [lastDoc, setLastDoc] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!db || !storage) {
    console.error('Firebase modules undefined in index page', { db, storage });
  }
  if (user === undefined) {
    console.error('AuthContext returned undefined user');
  }

  const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };

  useEffect(() => {
    cleanupExpiredWishes();
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const following = user ? await getFollowingIds(user.uid) : [];
        const now = new Date();
        const boostedSnap = await getDocs(
          query(
            collection(db, 'wishes'),
            where('boostedUntil', '>', now),
            orderBy('boostedUntil', 'desc'),
          ),
        );
        const boosted = boostedSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Wish, 'id'>),
        })) as Wish[];
        let normal: Wish[] = [];
        if (following.length) {
          const q = query(
            collection(db, 'wishes'),
            where('userId', 'in', following),
            orderBy('timestamp', 'desc'),
            limit(20),
          );
          const snap = await getDocs(q);
          setLastDoc(snap.docs[snap.docs.length - 1] || null);
          normal = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Wish, 'id'>),
          })) as Wish[];
        }
        setWishList([...boosted, ...normal]);
        setError(null);
      } catch (err) {
        console.warn('Failed to load wishes', err);
        setError("Couldn't load data. Check your connection and try again.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  useEffect(() => {
    const loadImpact = async () => {
      if (!user?.uid) return;
      try {
        const snap = await getDocs(
          query(collection(db, 'wishes'), where('userId', '==', user.uid)),
        );
        const list = snap.docs.map((d) => d.data());
        const wishes = list.length;
        const boosts = list.filter((l) => l.boostedUntil).length;
        let gifts = 0;
        let giftTotal = 0;
        const giftSnap = await getDocs(
          query(
            collectionGroup(db, 'gifts'),
            where('recipientId', '==', user.uid),
          ),
        );
        giftSnap.forEach((g) => {
          gifts += 1;
          giftTotal += g.data().amount || 0;
        });
        setImpact({ wishes, boosts, gifts, giftTotal });
      } catch (err) {
        console.error('Failed to load impact', err);
      }
    };
    loadImpact();
  }, [user]);

  useEffect(() => {
    const fetchStatus = async () => {
      const ids = Array.from(
        new Set(
          wishList
            .map((w) => w.userId)
            .filter(
              (id): id is string => typeof id === 'string' && id.length > 0,
            ),
        ),
      );
      try {
        await Promise.all(
          ids.map(async (id) => {
            if (
              publicStatus[id] === undefined ||
              stripeAccounts[id] === undefined
            ) {
              try {
                const snap = await getDoc(doc(db, 'users', id));
                if (publicStatus[id] === undefined) {
                  setPublicStatus((prev) => ({
                    ...prev,
                    [id]: snap.exists()
                      ? snap.data().publicProfileEnabled !== false
                      : false,
                  }));
                }
                if (stripeAccounts[id] === undefined) {
                  setStripeAccounts((prev) => ({
                    ...prev,
                    [id]: snap.exists()
                      ? snap.data().stripeAccountId || null
                      : null,
                  }));
                }
              } catch (err) {
                console.warn('Failed to fetch user', err);
                if (publicStatus[id] === undefined) {
                  setPublicStatus((prev) => ({ ...prev, [id]: false }));
                }
                if (stripeAccounts[id] === undefined) {
                  setStripeAccounts((prev) => ({ ...prev, [id]: null }));
                }
              }
            }
          }),
        );
      } catch (err) {
        console.error('Failed to fetch public status', err);
      }
    };
    fetchStatus();
  }, [wishList, publicStatus, stripeAccounts]);

  useEffect(() => {
    const fetchFollow = async () => {
      if (!user) return;
      const ids = Array.from(
        new Set(
          wishList
            .map((w) => w.userId)
            .filter(
              (id): id is string => typeof id === 'string' && id !== user.uid,
            ),
        ),
      );
      try {
        await Promise.all(
          ids.map(async (id) => {
            if (followStatus[id] === undefined) {
              try {
                const snap = await getDoc(
                  doc(db, 'users', user.uid, 'following', id),
                );
                setFollowStatus((prev) => ({ ...prev, [id]: snap.exists() }));
              } catch (err) {
                console.warn('Failed to fetch follow status for', id, err);
                setFollowStatus((prev) => ({ ...prev, [id]: false }));
              }
            }
          }),
        );
      } catch (err) {
        console.error('Failed to fetch follow status', err);
      }
    };
    fetchFollow();
  }, [wishList, user, followStatus]);

  useEffect(() => {
    const showWelcome = async () => {
      try {
        const seen = await AsyncStorage.getItem('seenWelcome');
        if (!seen) {
          Alert.alert(
            'Welcome to WhispList',
            'Share your wishes anonymously and tap a wish to read or comment.',
          );
          await AsyncStorage.setItem('seenWelcome', 'true');
        }
      } catch (err) {
        console.error('Failed in showWelcome', err);
      }
    };
    showWelcome();
  }, []);

  useEffect(() => {
    const loadPromptAndStreak = async () => {
      try {
        const today = new Date().toISOString().split('T')[0];
        const savedDate = await AsyncStorage.getItem('dailyPromptDate');
        let savedPrompt = await AsyncStorage.getItem('dailyPromptText');
        const recentRaw = await AsyncStorage.getItem('recentPromptIndices');
        let recent: number[] = recentRaw ? JSON.parse(recentRaw) : [];

        if (savedDate !== today || !savedPrompt) {
          const index = pickPromptIndex(recent);
          savedPrompt = DAILY_PROMPTS[index];
          await AsyncStorage.setItem('dailyPromptDate', today);
          await AsyncStorage.setItem('dailyPromptText', savedPrompt);
          recent = [index, ...recent].slice(0, 20);
          await AsyncStorage.setItem(
            'recentPromptIndices',
            JSON.stringify(recent),
          );
        }

        setDailyPrompt(savedPrompt || '');
        Animated.timing(promptOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }).start();

        const streak = await AsyncStorage.getItem('streakCount');
        if (streak) setStreakCount(parseInt(streak, 10));
      } catch (err) {
        console.error('Failed to load prompt or streak', err);
      }
    };

    loadPromptAndStreak();
  }, [promptOpacity]);

  const startRecording = async () => {
    try {
      const { granted } = await (
        ExpoAudio as any
      ).requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert(
          'Permission required',
          'Microphone access is needed to record',
        );
        return;
      }
      await (ExpoAudio as any).setAudioModeAsync({
        allowsRecording: true,
        interruptionMode: (ExpoAudio as any).INTERRUPTION_MODE_IOS_DO_NOT_MIX,
        playsInSilentMode: true,
        interruptionModeAndroid: (ExpoAudio as any)
          .INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      });
      const rec = createRecorder();
      await rec.start();
      setRecording(rec);
      setIsRecording(true);
    } catch (err) {
      console.error('❌ Failed to start recording:', err);
    }
  };

  const stopRecording = async () => {
    try {
      if (!recording) return;
      const { uri } = await recording.stop();
      setRecordedUri(uri);
    } catch (err) {
      console.error('❌ Failed to stop recording:', err);
    } finally {
      setIsRecording(false);
      setRecording(null);
    }
  };

  const pickImage = async () => {
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) {
      Alert.alert(
        'Permission required',
        'Media access is needed to select images',
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!result.canceled && result.assets.length > 0) {
      setSelectedImage(result.assets[0].uri);
    }
  };

  const updateStreak = async () => {
    const today = new Date().toISOString().split('T')[0];
    const lastDate = await AsyncStorage.getItem('lastPostedDate');
    let streak = parseInt(
      (await AsyncStorage.getItem('streakCount')) || '0',
      10,
    );
    if (lastDate === today) return;
    if (lastDate) {
      const diff =
        (new Date(today).getTime() - new Date(lastDate).getTime()) / 86400000;
      streak = diff === 1 ? streak + 1 : 1;
    } else {
      streak = 1;
    }
    await AsyncStorage.setItem('lastPostedDate', today);
    await AsyncStorage.setItem('streakCount', streak.toString());
    setStreakCount(streak);
  };

  /**
   * Allow the user to fetch a new prompt for the current day.
   * The date remains the same but the prompt text and recent list update.
   */
  const requestNewPrompt = async () => {
    const recentRaw = await AsyncStorage.getItem('recentPromptIndices');
    let recent: number[] = recentRaw ? JSON.parse(recentRaw) : [];
    const index = pickPromptIndex(recent);
    const newPrompt = DAILY_PROMPTS[index];
    await AsyncStorage.setItem('dailyPromptText', newPrompt);
    recent = [index, ...recent].slice(0, 20);
    await AsyncStorage.setItem('recentPromptIndices', JSON.stringify(recent));
    promptOpacity.setValue(0);
    setDailyPrompt(newPrompt);
    Animated.timing(promptOpacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
    const msg = "✨ That's a deep one.";
    if (Platform.OS === 'android') {
      ToastAndroid.show(msg, ToastAndroid.SHORT);
    } else {
      Alert.alert(msg);
    }
  };

  const handleRephrase = async () => {
    if (wish.trim() === '') return;
    const originalWishText = wish;
    setRephrasing(true);
    try {
      const response = await fetch(
        `https://us-central1-${process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID}.cloudfunctions.net/rephraseWish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: originalWishText }),
        },
      );
      const data = await response.json();
      const suggestion = data.suggestion?.trim();
      if (suggestion) {
        setWish(suggestion);
        const msg = '✨ Wish rephrased';
        if (Platform.OS === 'android') {
          ToastAndroid.show(msg, ToastAndroid.SHORT);
        } else {
          Alert.alert(msg);
        }
      }
    } catch (err) {
      console.error('AI rephrase failed', err);
      Alert.alert('Failed to rephrase wish', 'Please try again later.');
    } finally {
      setRephrasing(false);
    }
  };

  const handlePostWish = async () => {
    if (wish.trim() === '') return;

    setPosting(true);
    try {
      if (giftLink.trim() && !/^https?:\/\//.test(giftLink.trim())) {
        Alert.alert(
          'Invalid link',
          'Gift link must start with http:// or https://',
        );
        setPosting(false);
        return;
      }
      let audioUrl = '';
      let imageUrl = '';
      if (includeAudio && recordedUri) {
        const resp = await fetch(recordedUri);
        const blob = await resp.blob();
        const storageRef = ref(storage, `audio/${Date.now()}.m4a`);
        await uploadBytes(storageRef, blob);
        audioUrl = await getDownloadURL(storageRef);
      }
      if (selectedImage) {
        const resp = await fetch(selectedImage);
        const blob = await resp.blob();
        const imageRef = ref(storage, `images/${Date.now()}`);
        await uploadBytes(imageRef, blob);
        imageUrl = await getDownloadURL(imageRef);
      }
      await addWish({
        text: wish,
        category: postType,
        type: postType,
        userId: user?.uid,
        displayName: useProfilePost ? profile?.displayName || '' : '',
        photoURL: useProfilePost ? profile?.photoURL || '' : '',
        isAnonymous: !useProfilePost,
        ...(enableExternalGift &&
          giftLink.trim() && {
            giftLink: giftLink.trim(),
            ...(giftType.trim() && { giftType: giftType.trim() }),
            ...(giftLabel.trim() && { giftLabel: giftLabel.trim() }),
          }),
        ...(isPoll && {
          isPoll: true,
          optionA: optionA.trim(),
          optionB: optionB.trim(),
          votesA: 0,
          votesB: 0,
        }),
        ...(audioUrl && { audioUrl }),
        ...(imageUrl && { imageUrl }),
        ...(autoDelete && {
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        }),
      });

      try {
        const raw = await AsyncStorage.getItem('reflectionHistory');
        const history = raw ? JSON.parse(raw) : [];
        history.unshift({ text: wish.trim(), timestamp: Date.now() });
        if (history.length > 7) history.splice(7);
        await AsyncStorage.setItem(
          'reflectionHistory',
          JSON.stringify(history),
        );
      } catch (err) {
        console.error('Failed to save reflection history', err);
      }

      setWish('');
      setOptionA('');
      setOptionB('');
      setIsPoll(false);
      setRecordedUri(null);
      setIncludeAudio(false);
      setSelectedImage(null);
      setGiftLink('');
      setGiftType('');
      setGiftLabel('');
      setEnableExternalGift(!stripeEnabled);
      setPostType('wish');
      setPostConfirm(true);
      await updateStreak();
    } catch (error) {
      console.error('❌ Failed to post wish:', error);
    } finally {
      setPosting(false);
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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const followingIds = user ? await getFollowingIds(user.uid) : [];

      const now = new Date();
      const boostedSnap = await getDocs(
        query(
          collection(db, 'wishes'),
          where('boostedUntil', '>', now),
          orderBy('boostedUntil', 'desc'),
        ),
      );
      const boosted = boostedSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Wish, 'id'>),
      })) as Wish[];

      let normal: Wish[] = [];
      if (user && followingIds.length) {
        const normalSnap = await getDocs(
          query(
            collection(db, 'wishes'),
            where('userId', 'in', followingIds),
            orderBy('timestamp', 'desc'),
            limit(20),
          ),
        );
        setLastDoc(normalSnap.docs[normalSnap.docs.length - 1] || null);
        normal = normalSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Wish, 'id'>),
        })) as Wish[];
      }
      setWishList([...boosted, ...normal]);
      setError(null);
    } catch (err) {
      console.error('❌ Failed to refresh wishes:', err);
      setError("Couldn't load data. Check your connection and try again.");
    } finally {
      setRefreshing(false);
    }
  }, [user]);

  const loadMore = useCallback(async () => {
    if (!lastDoc) return;
    try {
      const followingIds = user ? await getFollowingIds(user.uid) : [];
      if (!followingIds.length) return;
      const snap = await getDocs(
        query(
          collection(db, 'wishes'),
          where('userId', 'in', followingIds),
          orderBy('timestamp', 'desc'),
          startAfter(lastDoc),
          limit(20),
        ),
      );
      setLastDoc(snap.docs[snap.docs.length - 1] || lastDoc);
      const more = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Wish, 'id'>),
      })) as Wish[];
      setWishList((prev) => [...prev, ...more]);
    } catch (err) {
      console.warn('Failed to load more wishes', err);
      setError("Couldn't load data. Check your connection and try again.");
    }
  }, [lastDoc, user]);

  const filteredWishes = wishList.filter(
    (wish) =>
      wish.text.toLowerCase().includes(searchTerm.toLowerCase()) &&
      (filterType === 'all' || wish.type === filterType) &&
      (!wish.expiresAt ||
        (wish.expiresAt.toDate ? wish.expiresAt.toDate() : wish.expiresAt) >
          new Date()),
  );

  const WishCard: React.FC<{ item: Wish }> = ({ item }) => {
    const [timeLeft, setTimeLeft] = useState('');
    const [giftCount, setGiftCount] = useState(0);
    const [hasGiftMsg, setHasGiftMsg] = useState(false);
    const glowAnim = useRef(new Animated.Value(0)).current;
    const isBoosted =
      item.boostedUntil &&
      item.boostedUntil.toDate &&
      item.boostedUntil.toDate() > new Date();

    useEffect(() => {
      if (!item.id) return;
      const load = async () => {
        try {
          const snaps = await Promise.all([
            getDocs(collection(db, 'wishes', item.id, 'gifts')),
            getDocs(collection(db, 'gifts', item.id, 'gifts')),
          ]);
          let msg = false;
          snaps[0].forEach((d) => {
            if (d.data().message) msg = true;
          });
          setGiftCount(snaps[0].size + snaps[1].size);
          setHasGiftMsg(msg);
        } catch (err) {
          console.warn('Failed to fetch gifts', err);
        }
      };
      load();
    }, [item.id]);

    useEffect(() => {
      if (isBoosted && item.boostedUntil?.toDate) {
        const update = () =>
          setTimeLeft(formatTimeLeft(item.boostedUntil.toDate()));
        update();
        const id = setInterval(update, 60000);
        const loop = Animated.loop(
          Animated.sequence([
            Animated.timing(glowAnim, {
              toValue: 1,
              duration: 1000,
              useNativeDriver: false,
            }),
            Animated.timing(glowAnim, {
              toValue: 0,
              duration: 1000,
              useNativeDriver: false,
            }),
          ]),
        );
        loop.start();
        return () => {
          clearInterval(id);
          loop.stop();
        };
      } else {
        setTimeLeft('');
      }
    }, [glowAnim, isBoosted, item.boostedUntil]);

    const borderColor = isBoosted
      ? glowAnim.interpolate({
          inputRange: [0, 1],
          outputRange: ['#facc15', '#fde68a'],
        })
      : 'transparent';

    const canBoost =
      user &&
      item.userId === user.uid &&
      (!item.boostedUntil ||
        !item.boostedUntil.toDate ||
        item.boostedUntil.toDate() < new Date());

    const openGiftLink = (link: string) => {
      Alert.alert(
        'How gifting works',
        'You will be taken to an external site to send your gift.',
        [
          {
            text: 'Continue',
            onPress: async () => {
              await WebBrowser.openBrowserAsync(link);
            },
          },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
    };

    const sendMoney = async (amount: number) => {
      if (!item.id || !item.userId) return;
      Alert.alert('How gifting works', 'Your payment is processed securely.', [
        {
          text: 'Continue',
          onPress: async () => {
            try {
              const res = await createGiftCheckout(
                item.id!,
                amount,
                item.userId!,
              );
              if (res.url) await WebBrowser.openBrowserAsync(res.url);
            } catch (err) {
              console.error('Failed to checkout', err);
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    };

    return (
      <Animated.View
        style={[
          styles.wishItem,
          {
            backgroundColor: typeInfo[item.type || 'wish'].color,
            borderColor,
            borderWidth: isBoosted ? 2 : 0,
          },
        ]}
      >
        {item.giftLink && <Text style={styles.giftBadge}>🎁 Gifted</Text>}
        <TouchableOpacity
          onPress={() => router.push(`/wish/${item.id}`)}
          hitSlop={HIT_SLOP}
        >
          {!item.isAnonymous &&
            item.displayName &&
            publicStatus[item.userId || ''] && (
              <TouchableOpacity
                onPress={() => router.push(`/profile/${item.displayName}`)}
                hitSlop={HIT_SLOP}
              >
                <Text style={styles.author}>by {item.displayName}</Text>
              </TouchableOpacity>
            )}
          <Text style={{ color: '#a78bfa', fontSize: 12 }}>
            {typeInfo[item.type || 'wish'].emoji} #{item.category}{' '}
            {item.audioUrl ? '🔊' : ''}
          </Text>
          <Text style={styles.wishText}>{item.text}</Text>
          {item.imageUrl && (
            <Image source={{ uri: item.imageUrl }} style={styles.preview} />
          )}
          {item.isPoll ? (
            <View style={{ marginTop: 6 }}>
              <Text style={styles.pollText}>
                {item.optionA}: {item.votesA || 0}
              </Text>
              <Text style={styles.pollText}>
                {item.optionB}: {item.votesB || 0}
              </Text>
            </View>
          ) : (
            <Text style={styles.likeText}>❤️ {item.likes}</Text>
          )}
          {isBoosted && (
            <Text style={styles.boostedLabel}>
              ⏳ Boost expires in {timeLeft}
            </Text>
          )}
          {(item.giftLink || giftCount > 0) && (
            <Text style={styles.boostedLabel}>
              🎁 Supported by {giftCount} people
            </Text>
          )}
          {user?.uid === item.userId && hasGiftMsg && (
            <Text style={styles.boostedLabel}>
              💬 You received a gift message
            </Text>
          )}
          {profile?.giftingEnabled && item.giftLink && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginTop: 6,
              }}
            >
              <TouchableOpacity
                onPress={() => openGiftLink(item.giftLink!)}
                style={{
                  backgroundColor: theme.input,
                  padding: 6,
                  borderRadius: 6,
                }}
              >
                <Text style={{ color: theme.tint }}>
                  {(() => {
                    try {
                      const url = new URL(item.giftLink!);
                      const trusted = [
                        'venmo.com',
                        'paypal.me',
                        'amazon.com',
                      ].some((d) => url.hostname.includes(d));
                      return `${trusted ? '✅' : '⚠️'} 🎁 ${item.giftLabel || 'Send Gift'}`;
                    } catch {
                      return `⚠️ 🎁 ${item.giftLabel || 'Send Gift'}`;
                    }
                  })()}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() =>
                  Alert.alert(
                    'Gift Info',
                    'Gifting is anonymous and optional. You can attach a support link like Venmo or Stripe.',
                  )
                }
                style={{ marginLeft: 6 }}
                hitSlop={HIT_SLOP}
              >
                <Ionicons
                  name="information-circle-outline"
                  size={16}
                  color={theme.text}
                />
              </TouchableOpacity>
            </View>
          )}
          {profile?.giftingEnabled && stripeAccounts[item.userId || ''] && (
            <View style={{ flexDirection: 'row', marginTop: 4 }}>
              {[3, 5, 10].map((amt) => (
                <TouchableOpacity
                  key={amt}
                  onPress={() => sendMoney(amt)}
                  style={{
                    backgroundColor: theme.input,
                    padding: 6,
                    borderRadius: 6,
                    marginRight: 4,
                  }}
                >
                  <Text style={{ color: theme.tint }}>${amt}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </TouchableOpacity>

        {canBoost && (
          <View
            style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}
          >
            <TouchableOpacity
              onPress={() => router.push(`/boost/${item.id}`)}
              hitSlop={HIT_SLOP}
            >
              <Text style={{ color: '#facc15' }}>Boost 🚀</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() =>
                Alert.alert(
                  'Boost Info',
                  'Boosting highlights a wish for 24 hours.',
                )
              }
              style={{ marginLeft: 6 }}
              hitSlop={HIT_SLOP}
            >
              <Ionicons
                name="information-circle-outline"
                size={16}
                color={theme.text}
              />
            </TouchableOpacity>
          </View>
        )}

        {user && item.userId && user.uid !== item.userId && (
          <TouchableOpacity
            onPress={async () => {
              if (!user?.uid) return;
              if (!item.userId) return;

              const targetId = item.userId;

              if (followStatus[targetId]) {
                await unfollowUser(user.uid, targetId);
                setFollowStatus((prev) => ({ ...prev, [targetId]: false }));
              } else {
                await followUser(user.uid, targetId);
                setFollowStatus((prev) => ({ ...prev, [targetId]: true }));
              }
            }}
            style={{ marginTop: 4 }}
            hitSlop={HIT_SLOP}
          >
            <Text style={{ color: '#a78bfa' }}>
              {followStatus[item.userId] ? 'Unfollow' : 'Follow'}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={() => {
            setReportTarget(item.id);
            setReportVisible(true);
          }}
          style={{ marginTop: 4 }}
          hitSlop={HIT_SLOP}
        >
          <Text style={{ color: '#f87171' }}>Report</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  try {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Modal
          visible={postConfirm}
          transparent
          animationType="fade"
          onRequestClose={() => setPostConfirm(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setPostConfirm(false)}
          >
            <View
              style={[styles.modalContent, { backgroundColor: theme.input }]}
            >
              <Text
                style={{
                  color: theme.text,
                  marginBottom: 10,
                  textAlign: 'center',
                }}
              >
                💭 Your wish has been sent into the world.
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setPostConfirm(false);
                  router.push('/feed');
                }}
                style={{ marginBottom: 10 }}
              >
                <Text style={{ color: theme.tint, textAlign: 'center' }}>
                  View in Feed
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setPostConfirm(false)}>
                <Text style={{ color: theme.tint, textAlign: 'center' }}>
                  Post another wish
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
        <RNStatusBar
          barStyle={theme.name === 'dark' ? 'light-content' : 'dark-content'}
          backgroundColor={theme.background}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.container}
        >
          <FlatList
            data={filteredWishes}
            keyExtractor={(item) => item.id}
            onEndReached={loadMore}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            contentContainerStyle={styles.contentContainer}
            ListHeaderComponent={
              <>
                <Text style={styles.title}>WhispList ✨</Text>
                {error && (
                  <Text
                    style={{
                      color: theme.tint,
                      textAlign: 'center',
                      marginBottom: 8,
                    }}
                  >
                    {error}
                  </Text>
                )}
                <Text style={styles.subtitle}>
                  Post a wish and see what dreams grow 🌱
                </Text>
                {streakCount > 0 && (
                  <Text style={styles.streak}>
                    🔥 You’ve posted {streakCount} days in a row!
                  </Text>
                )}

                <Text style={styles.label}>Search</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Search wishes..."
                  placeholderTextColor="#999"
                  value={searchTerm}
                  onChangeText={setSearchTerm}
                />

                <Text style={styles.label}>Filter by Type</Text>
                <Picker
                  selectedValue={filterType}
                  onValueChange={(val) => setFilterType(val)}
                  style={styles.input}
                  dropdownIconColor="#fff"
                >
                  <Picker.Item label="All" value="all" />
                  <Picker.Item label="Wish 💭" value="wish" />
                  <Picker.Item label="Confession 😶‍🌫️" value="confession" />
                  <Picker.Item label="Advice Request 🧠" value="advice" />
                  <Picker.Item label="Dream 🌙" value="dream" />
                </Picker>

                <View style={styles.formCard}>
                  <Text style={styles.sectionTitle}>
                    💭 What’s your wish today?
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder="What's your wish?"
                    placeholderTextColor="#999"
                    value={wish}
                    onChangeText={setWish}
                  />
                  <TouchableOpacity
                    onPress={handleRephrase}
                    style={[styles.button, { marginBottom: 10 }]}
                    disabled={rephrasing || wish.trim() === ''}
                  >
                    <Text style={styles.buttonText}>
                      {rephrasing ? 'Thinking...' : '✨ Help me rephrase this'}
                    </Text>
                  </TouchableOpacity>

                  {dailyPrompt !== '' && (
                    <>
                      <Text style={styles.promptTitle}>Daily Prompt ✨</Text>
                      <Animated.View
                        style={[styles.promptCard, { opacity: promptOpacity }]}
                      >
                        <Text style={styles.promptText}>{dailyPrompt}</Text>
                      </Animated.View>
                      <TouchableOpacity onPress={requestNewPrompt}>
                        <Text style={{ color: theme.tint }}>
                          🔁 Give me a different prompt
                        </Text>
                      </TouchableOpacity>
                    </>
                  )}

                  <Text style={styles.label}>Post Type</Text>
                  <Picker
                    selectedValue={postType}
                    onValueChange={(val) => setPostType(val)}
                    style={styles.input}
                    dropdownIconColor="#fff"
                  >
                    <Picker.Item label="Wish 💭" value="wish" />
                    <Picker.Item label="Confession 😶‍🌫️" value="confession" />
                    <Picker.Item label="Advice Request 🧠" value="advice" />
                    <Picker.Item label="Dream 🌙" value="dream" />
                  </Picker>

                  <TouchableOpacity
                    onPress={() => {
                      LayoutAnimation.configureNext(
                        LayoutAnimation.Presets.easeInEaseOut,
                      );
                      setShowAdvanced(!showAdvanced);
                    }}
                  >
                    <Text style={styles.sectionTitle}>
                      Advanced Options {showAdvanced ? '▲' : '▼'}
                    </Text>
                  </TouchableOpacity>
                  {showAdvanced && (
                    <>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          marginBottom: 10,
                        }}
                      >
                        <Text style={{ color: theme.text, marginRight: 8 }}>
                          Poll Mode
                        </Text>
                        <Switch value={isPoll} onValueChange={setIsPoll} />
                      </View>
                      {isPoll && (
                        <>
                          <Text style={styles.label}>Option A</Text>
                          <TextInput
                            style={styles.input}
                            placeholder="Option A"
                            placeholderTextColor="#999"
                            value={optionA}
                            onChangeText={setOptionA}
                          />
                          <Text style={styles.label}>Option B</Text>
                          <TextInput
                            style={styles.input}
                            placeholder="Option B"
                            placeholderTextColor="#999"
                            value={optionB}
                            onChangeText={setOptionB}
                          />
                        </>
                      )}
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          marginBottom: 10,
                        }}
                      >
                        <Text style={{ color: theme.text, marginRight: 8 }}>
                          Include Audio
                        </Text>
                        <Switch
                          value={includeAudio}
                          onValueChange={(v) => {
                            setIncludeAudio(v);
                            if (!v) {
                              if (isRecording) stopRecording();
                              setRecordedUri(null);
                            }
                          }}
                        />
                      </View>
                      {stripeEnabled && (
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            marginBottom: 10,
                          }}
                        >
                          <Text style={{ color: theme.text, marginRight: 8 }}>
                            Add External Gift Option
                          </Text>
                          <Switch
                            value={enableExternalGift}
                            onValueChange={setEnableExternalGift}
                          />
                        </View>
                      )}
                      {(!stripeEnabled || enableExternalGift) && (
                        <>
                          <Text style={styles.label}>
                            Add a gift link (e.g., Venmo, wishlist)
                          </Text>
                          <TextInput
                            style={styles.input}
                            placeholder="Gift link (optional)"
                            placeholderTextColor="#999"
                            value={giftLink}
                            onChangeText={setGiftLink}
                          />
                          <Text style={styles.label}>Gift Type</Text>
                          <TextInput
                            style={styles.input}
                            placeholder="kofi, paypal, etc"
                            placeholderTextColor="#999"
                            value={giftType}
                            onChangeText={setGiftType}
                          />
                          <Text style={styles.label}>Gift Label</Text>
                          <TextInput
                            style={styles.input}
                            placeholder="Support on Ko-fi"
                            placeholderTextColor="#999"
                            value={giftLabel}
                            onChangeText={setGiftLabel}
                          />
                        </>
                      )}
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          marginBottom: 10,
                        }}
                      >
                        <Text style={{ color: theme.text, marginRight: 8 }}>
                          Post with profile
                        </Text>
                        <Switch
                          value={useProfilePost}
                          onValueChange={setUseProfilePost}
                        />
                      </View>
                    </>
                  )}

                  {/* Poll Mode Switch and Inputs removed, handled above */}

                  {/* Auto-delete after 24h */}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      marginBottom: 10,
                    }}
                  >
                    <Text style={{ color: '#fff', marginRight: 8 }}>
                      Auto-delete after 24h
                    </Text>
                    <Switch value={autoDelete} onValueChange={setAutoDelete} />
                  </View>

                  {/* Audio Recording Button */}
                  {includeAudio && (
                    <TouchableOpacity
                      style={[
                        styles.recButton,
                        {
                          backgroundColor: isRecording ? '#ef4444' : '#22c55e',
                        },
                      ]}
                      onPress={isRecording ? stopRecording : startRecording}
                      hitSlop={HIT_SLOP}
                    >
                      <Text style={styles.buttonText}>
                        {isRecording ? 'Stop Recording' : 'Record Audio'}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {selectedImage && (
                    <Image
                      source={{ uri: selectedImage }}
                      style={styles.preview}
                    />
                  )}
                  <TouchableOpacity
                    style={styles.button}
                    onPress={pickImage}
                    hitSlop={HIT_SLOP}
                  >
                    <Text style={styles.buttonText}>
                      {selectedImage ? 'Change Image' : 'Attach Image'}
                    </Text>
                  </TouchableOpacity>

                  <Pressable
                    style={[
                      styles.button,
                      { opacity: wish.trim() === '' || posting ? 0.5 : 1 },
                    ]}
                    onPress={handlePostWish}
                    disabled={wish.trim() === '' || posting}
                    hitSlop={HIT_SLOP}
                  >
                    {posting ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.buttonText}>Post Wish</Text>
                    )}
                  </Pressable>

                  <TouchableOpacity
                    onPress={() => router.push('/auth')}
                    style={styles.authButton}
                  >
                    <Text style={styles.authButtonText}>Go to Auth</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.formCard}>
                  <Text style={styles.sectionTitle}>Your Impact</Text>
                  <Text style={styles.info}>
                    🔥 You’ve posted {impact.wishes} wishes
                  </Text>
                  <Text style={styles.info}>
                    🌟 Boosted {impact.boosts} — earned{' '}
                    {impact.wishes > 0 ? impact.boosts * 9 : 0} likes
                  </Text>
                  <Text style={styles.info}>
                    🎁 Received {impact.gifts} gifts — ${impact.giftTotal}
                  </Text>
                </View>
              </>
            }
            ListEmptyComponent={
              loading ? (
                <ActivityIndicator
                  size="large"
                  color="#a78bfa"
                  style={{ marginTop: 20 }}
                />
              ) : (
                <Text style={styles.noResults}>
                  No wishes yet in this category. Be the first to post ✨
                </Text>
              )
            }
            ListFooterComponent={
              lastDoc ? (
                <TouchableOpacity
                  onPress={loadMore}
                  style={{ marginVertical: 20 }}
                >
                  <Text style={{ color: theme.tint, textAlign: 'center' }}>
                    Load More
                  </Text>
                </TouchableOpacity>
              ) : null
            }
            renderItem={({ item }) => <WishCard item={item} />}
          />
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
  } catch (err) {
    console.error('Error rendering index page', err);
    return null;
  }
}

const createStyles = (c: (typeof Colors)['light'] & { name: string }) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: c.background,
    },
    container: {
      flex: 1,
    },
    contentContainer: {
      padding: 20,
      paddingBottom: 100,
      flexGrow: 1,
    },
    title: {
      fontSize: 28,
      fontWeight: 'bold',
      color: c.text,
      textAlign: 'center',
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 14,
      color: c.text,
      textAlign: 'center',
      marginBottom: 20,
    },
    streak: {
      color: c.tint,
      textAlign: 'center',
      marginBottom: 10,
    },
    label: {
      color: c.text,
      marginBottom: 4,
    },
    input: {
      backgroundColor: c.input,
      color: c.text,
      padding: 14,
      borderRadius: 10,
      marginBottom: 10,
    },
    button: {
      backgroundColor: c.tint,
      padding: 14,
      borderRadius: 10,
      alignItems: 'center',
      marginBottom: 20,
    },
    recButton: {
      padding: 14,
      borderRadius: 10,
      alignItems: 'center',
      marginBottom: 10,
    },
    promptCard: {
      backgroundColor: c.input,
      padding: 12,
      borderRadius: 8,
      marginBottom: 10,
    },
    promptTitle: {
      color: c.text,
      fontSize: 18,
      fontWeight: '600',
      marginTop: 10,
      marginBottom: 4,
    },
    promptText: {
      color: c.text,
      fontSize: 16,
    },
    preview: {
      width: '100%',
      height: 200,
      borderRadius: 10,
      marginBottom: 10,
    },
    buttonText: {
      color: c.text,
      fontWeight: '600',
    },
    recordingStatus: {
      color: c.tint,
      textAlign: 'center',
      marginBottom: 10,
    },
    authButton: {
      marginBottom: 20,
      alignItems: 'center',
    },
    authButtonText: {
      color: c.tint,
      fontSize: 14,
      textDecorationLine: 'underline',
    },
    wishItem: {
      backgroundColor: c.input,
      padding: 12,
      borderRadius: 8,
      marginBottom: 10,
      position: 'relative',
    },
    wishText: {
      color: c.text,
      fontSize: 16,
    },
    likeText: {
      color: c.tint,
      marginTop: 6,
      fontSize: 14,
    },
    boostedLabel: {
      color: c.tint,
      fontSize: 12,
      marginTop: 4,
    },
    formCard: {
      backgroundColor: c.input,
      padding: 12,
      borderRadius: 10,
      marginBottom: 20,
    },
    sectionTitle: {
      color: c.text,
      fontWeight: '600',
      marginBottom: 8,
      fontSize: 16,
    },
    pollText: {
      color: c.text,
      fontSize: 14,
    },
    info: {
      color: c.text,
      fontSize: 14,
      marginBottom: 6,
    },
    author: {
      color: c.text,
      fontSize: 12,
      marginBottom: 2,
    },
    giftBadge: {
      position: 'absolute',
      top: 6,
      right: 6,
      color: c.tint,
      backgroundColor: c.input,
      paddingHorizontal: 4,
      paddingVertical: 2,
      borderRadius: 4,
      fontSize: 12,
    },
    noResults: {
      color: c.text,
      textAlign: 'center',
      marginTop: 20,
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
    modalOverlay: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.6)',
      padding: 20,
    },
    modalContent: {
      padding: 20,
      borderRadius: 10,
    },
  });
