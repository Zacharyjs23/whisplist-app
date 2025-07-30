// app/(tabs)/index.tsx — Full Home Screen with SafeArea, StatusBar, and Wish Logic
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  RecordingPresets,
  AudioRecorder,
} from 'expo-audio';
import * as Audio from 'expo-audio';
import {
  listenWishes,
  addWish,
  getFollowingIds,
  followUser,
  unfollowUser,
} from '../../helpers/firestore';
import { formatTimeLeft } from '../../helpers/time';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import * as ImagePicker from 'expo-image-picker';
import { addDoc, collection, serverTimestamp, getDocs, query, orderBy, where, doc, getDoc } from 'firebase/firestore';
import React, { useEffect, useState, useCallback, useRef } from 'react';
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
  Animated,
} from 'react-native';
import { Colors } from '@/constants/Colors';
import { useTheme } from '@/contexts/ThemeContext';
import { Picker } from '@react-native-picker/picker';
import ReportDialog from '../../components/ReportDialog';
import { db, storage } from '../../firebase';
import type { Wish } from '../../types/Wish';
import { useAuth } from '@/contexts/AuthContext';

const typeInfo: Record<string, { emoji: string; color: string }> = {
  wish: { emoji: '💭', color: '#1e1e1e' },
  confession: { emoji: '😶\u200d🌫️', color: '#374151' },
  advice: { emoji: '🧠', color: '#064e3b' },
  dream: { emoji: '🌙', color: '#312e81' },
};

const prompts = [
  '💭 What\u2019s your biggest wish this week?',
  '🌙 Describe a dream you had recently',
  '🧠 What advice do you wish you had today?',
];

export default function Page() {
  const [wish, setWish] = useState('');
  const [postType, setPostType] = useState<'wish' | 'confession' | 'advice' | 'dream'>('wish');
  const [wishList, setWishList] = useState<Wish[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'wish' | 'confession' | 'advice' | 'dream'>('all');
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
  const [posting, setPosting] = useState(false);
  const { theme } = useTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const [useProfilePost, setUseProfilePost] = useState(true);
  const [publicStatus, setPublicStatus] = useState<Record<string, boolean>>({});
  const [followStatus, setFollowStatus] = useState<Record<string, boolean>>({});
  const [streakCount, setStreakCount] = useState(0);
  const [dailyPrompt, setDailyPrompt] = useState('');
  const promptOpacity = useRef(new Animated.Value(0)).current;
  const { user, profile } = useAuth();

  if (!db || !storage) {
    console.error('Firebase modules undefined in index page', { db, storage });
  }
  if (user === undefined) {
    console.error('AuthContext returned undefined user');
  }

  const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };


useEffect(() => {
  const unsubscribe = listenWishes(user?.uid ?? null, (w) => {
    setWishList(w);
    setLoading(false);
  });

  return () => unsubscribe();
}, [user]);

useEffect(() => {
  const fetchStatus = async () => {
    const ids = Array.from(
      new Set(
        wishList
          .map((w) => w.userId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      )
    );
    try {
      await Promise.all(
        ids.map(async (id) => {
          if (publicStatus[id] === undefined) {
            const snap = await getDoc(doc(db, 'users', id));
            setPublicStatus((prev) => ({
              ...prev,
              [id]: snap.exists() ? snap.data().publicProfileEnabled !== false : false,
            }));
          }
        })
      );
    } catch (err) {
      console.error('Failed to fetch public status', err);
    }
  };
  fetchStatus();
}, [wishList]);

useEffect(() => {
  const fetchFollow = async () => {
    if (!user) return;
    const ids = Array.from(
      new Set(
        wishList
          .map((w) => w.userId)
          .filter((id): id is string => typeof id === 'string' && id !== user.uid)
      )
    );
    try {
      await Promise.all(
        ids.map(async (id) => {
          if (followStatus[id] === undefined) {
            const snap = await getDoc(doc(db, 'users', user.uid, 'following', id));
            setFollowStatus((prev) => ({ ...prev, [id]: snap.exists() }));
          }
        })
      );
    } catch (err) {
      console.error('Failed to fetch follow status', err);
    }
  };
  fetchFollow();
}, [wishList, user]);

useEffect(() => {
  const showWelcome = async () => {
    try {
      const seen = await AsyncStorage.getItem('seenWelcome');
      if (!seen) {
        Alert.alert(
          'Welcome to WhispList',
          'Share your wishes anonymously and tap a wish to read or comment.'
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
      const savedPrompt = await AsyncStorage.getItem('dailyPromptText');

      if (savedDate === today && savedPrompt) {
        setDailyPrompt(savedPrompt);
      } else {
        const prompt = prompts[Math.floor(Math.random() * prompts.length)];
        setDailyPrompt(prompt);
        await AsyncStorage.setItem('dailyPromptDate', today);
        await AsyncStorage.setItem('dailyPromptText', prompt);
      }
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
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert('Permission required', 'Microphone access is needed to record');
        return;
      }
      await setAudioModeAsync({
        allowsRecording: true,
        interruptionMode: (Audio as any).INTERRUPTION_MODE_IOS_DO_NOT_MIX,
        playsInSilentMode: true,
        interruptionModeAndroid: (Audio as any).INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      });
      const rec = new AudioRecorder(RecordingPresets.HIGH_QUALITY);
      await rec.prepareToRecordAsync();
      rec.record();
      setRecording(rec);
      setIsRecording(true);
    } catch (err) {
      console.error('❌ Failed to start recording:', err);
    }
  };

  const stopRecording = async () => {
    try {
      if (!recording) return;
      await recording.stop();
      const uri = recording.uri;
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
      Alert.alert('Permission required', 'Media access is needed to select images');
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
    let streak = parseInt((await AsyncStorage.getItem('streakCount')) || '0', 10);
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

  const handlePostWish = async () => {
    if (wish.trim() === '') return;

    setPosting(true);
    try {
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
        ...(giftLink.trim() && { giftLink: giftLink.trim() }),
        ...(isPoll && {
          isPoll: true,
          optionA: optionA.trim(),
          optionB: optionB.trim(),
          votesA: 0,
          votesB: 0,
        }),
        ...(audioUrl && { audioUrl }),
        ...(imageUrl && { imageUrl }),
      });

      try {
        const raw = await AsyncStorage.getItem('reflectionHistory');
        const history = raw ? JSON.parse(raw) : [];
        history.unshift({ text: wish.trim(), timestamp: Date.now() });
        if (history.length > 7) history.splice(7);
        await AsyncStorage.setItem('reflectionHistory', JSON.stringify(history));
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
      setPostType('wish');
      Alert.alert('Wish posted!');
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
          orderBy('boostedUntil', 'desc')
        )
      );
      const boosted = boostedSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Wish, 'id'>) })) as Wish[];

      let normal: Wish[] = [];
      if (user && followingIds.length) {
        const normalSnap = await getDocs(
          query(
            collection(db, 'wishes'),
            where('userId', 'in', followingIds),
            orderBy('timestamp', 'desc')
          )
        );
        normal = normalSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Wish, 'id'>) })) as Wish[];
      }
      setWishList([...boosted, ...normal]);
    } catch (err) {
      console.error('❌ Failed to refresh wishes:', err);
    } finally {
      setRefreshing(false);
    }
  }, [user]);

  const filteredWishes = wishList.filter(
    (wish) =>
      wish.text.toLowerCase().includes(searchTerm.toLowerCase()) &&
      (filterType === 'all' || wish.type === filterType)
  );

  const WishCard: React.FC<{ item: Wish }> = ({ item }) => {
    const [timeLeft, setTimeLeft] = useState('');
    const glowAnim = useRef(new Animated.Value(0)).current;
    const isBoosted =
      item.boostedUntil &&
      item.boostedUntil.toDate &&
      item.boostedUntil.toDate() > new Date();

    useEffect(() => {
      if (isBoosted && item.boostedUntil?.toDate) {
        const update = () => setTimeLeft(formatTimeLeft(item.boostedUntil.toDate()));
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
    }, [isBoosted, item.boostedUntil]);

    const borderColor = isBoosted
      ? glowAnim.interpolate({ inputRange: [0, 1], outputRange: ['#facc15', '#fde68a'] })
      : 'transparent';

    const canBoost =
      user &&
      item.userId === user.uid &&
      (!item.boostedUntil ||
        !item.boostedUntil.toDate ||
        item.boostedUntil.toDate() < new Date());

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
        <TouchableOpacity onPress={() => router.push(`/wish/${item.id}`)} hitSlop={HIT_SLOP}>
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
            {typeInfo[item.type || 'wish'].emoji} #{item.category} {item.audioUrl ? '🔊' : ''}
          </Text>
          <Text style={styles.wishText}>{item.text}</Text>
          {item.imageUrl && <Image source={{ uri: item.imageUrl }} style={styles.preview} />}
          {item.isPoll ? (
            <View style={{ marginTop: 6 }}>
              <Text style={styles.pollText}>{item.optionA}: {item.votesA || 0}</Text>
              <Text style={styles.pollText}>{item.optionB}: {item.votesB || 0}</Text>
            </View>
          ) : (
            <Text style={styles.likeText}>❤️ {item.likes}</Text>
          )}
          {isBoosted && (
            <Text style={styles.boostedLabel}>⏳ Time left: {timeLeft}</Text>
          )}
        </TouchableOpacity>

        {canBoost && (
          <TouchableOpacity
            onPress={() => router.push(`/boost/${item.id}`)}
            style={{ marginTop: 4 }}
            hitSlop={HIT_SLOP}
          >
            <Text style={{ color: '#facc15' }}>Boost 🚀</Text>
          </TouchableOpacity>
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
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          contentContainerStyle={styles.contentContainer}
          ListHeaderComponent={
            <>
              <Text style={styles.title}>WhispList ✨</Text>
              <Text style={styles.subtitle}>Post a wish and see what dreams grow 🌱</Text>
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

        <Text style={styles.label}>Wish</Text>
        <TextInput
          style={styles.input}
          placeholder="What's your wish?"
          placeholderTextColor="#999"
          value={wish}
          onChangeText={setWish}
        />

        {dailyPrompt !== '' && (
          <>
            <Text style={styles.promptTitle}>Daily Prompt ✨</Text>
            <Animated.View style={[styles.promptCard, { opacity: promptOpacity }]}> 
              <Text style={styles.promptText}>{dailyPrompt}</Text>
            </Animated.View>
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

        <Text style={styles.label}>Gift Link</Text>
        <TextInput
          style={styles.input}
          placeholder="Gift link (optional)"
          placeholderTextColor="#999"
          value={giftLink}
          onChangeText={setGiftLink}
        />

        {/* Poll Mode Switch and Inputs */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Text style={{ color: '#fff', marginRight: 8 }}>Poll Mode</Text>
          <Switch value={isPoll} onValueChange={setIsPoll} />
        </View>

        {/* Audio toggle */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Text style={{ color: '#fff', marginRight: 8 }}>Include Audio</Text>
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

        {/* Post anonymously */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Text style={{ color: '#fff', marginRight: 8 }}>Post with profile</Text>
          <Switch value={useProfilePost} onValueChange={setUseProfilePost} />
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

        {/* Audio Recording Button */}
        {includeAudio && (
          <TouchableOpacity
            style={[
              styles.recButton,
              { backgroundColor: isRecording ? '#ef4444' : '#22c55e' },
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
          <Image source={{ uri: selectedImage }} style={styles.preview} />
        )}
        <TouchableOpacity style={styles.button} onPress={pickImage} hitSlop={HIT_SLOP}>
          <Text style={styles.buttonText}>
            {selectedImage ? 'Change Image' : 'Attach Image'}
          </Text>
        </TouchableOpacity>

        <Pressable
          style={[styles.button, { opacity: wish.trim() === '' || posting ? 0.5 : 1 }]}
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

        <TouchableOpacity onPress={() => router.push('/auth')} style={styles.authButton}>
          <Text style={styles.authButtonText}>Go to Auth</Text>
        </TouchableOpacity>
            </>
          }
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator size="large" color="#a78bfa" style={{ marginTop: 20 }} />
            ) : (
              <Text style={styles.noResults}>No matching wishes 💭</Text>
            )
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
    pollText: {
      color: c.text,
      fontSize: 14,
    },
    author: {
      color: c.text,
      fontSize: 12,
      marginBottom: 2,
    },
    noResults: {
      color: c.text,
      textAlign: 'center',
      marginTop: 20,
    },
  });

