// app/(tabs)/index.tsx — Full Home Screen with SafeArea, StatusBar, and Wish Logic
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import {
  Audio,
  InterruptionModeAndroid,
  InterruptionModeIOS,
} from 'expo-av';
import {
  listenWishes,
  addWish,
} from '../../helpers/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import * as ImagePicker from 'expo-image-picker';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
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
  Switch,
  TouchableOpacity,
  Image,
  View,
} from 'react-native';
import ReportDialog from '../../components/ReportDialog';
import { db, storage } from '../../firebase';
import type { Wish } from '../../types/Wish';
import { useAuth } from '@/contexts/AuthContext';


export default function Page() {
  const [wish, setWish] = useState('');
  const [category, setCategory] = useState('general');
  const [wishList, setWishList] = useState<Wish[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [reportVisible, setReportVisible] = useState(false);
  const [reportTarget, setReportTarget] = useState<string | null>(null);
  const [isPoll, setIsPoll] = useState(false);
  const [optionA, setOptionA] = useState('');
  const [optionB, setOptionB] = useState('');
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [includeAudio, setIncludeAudio] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [giftLink, setGiftLink] = useState('');
  const [posting, setPosting] = useState(false);
  const [useProfilePost, setUseProfilePost] = useState(true);
  const { user, profile } = useAuth();

  const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };


useEffect(() => {
  registerForPushNotificationsAsync().then(setPushToken);

  const unsubscribe = listenWishes((w) => {
    const now = new Date();
    const boosted = w.filter(
      (wish) => wish.boostedUntil && wish.boostedUntil.toDate && wish.boostedUntil.toDate() > now
    );
    boosted.sort((a, b) =>
      b.boostedUntil.toDate().getTime() - a.boostedUntil.toDate().getTime()
    );
    const normal = w.filter(
      (wish) => !wish.boostedUntil || !wish.boostedUntil.toDate || wish.boostedUntil.toDate() <= now
    );
    setWishList([...boosted, ...normal]);
    setLoading(false);
  });

  return () => unsubscribe();
}, []);

useEffect(() => {
  const showWelcome = async () => {
    const seen = await AsyncStorage.getItem('seenWelcome');
    if (!seen) {
      Alert.alert(
        'Welcome to WhispList',
        'Share your wishes anonymously and tap a wish to read or comment.'
      );
      await AsyncStorage.setItem('seenWelcome', 'true');
    }
  };
  showWelcome();
}, []);

  const startRecording = async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert('Permission required', 'Microphone access is needed to record');
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        playsInSilentModeIOS: true,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      await rec.startAsync();
      setRecording(rec);
      setIsRecording(true);
    } catch (err) {
      console.error('❌ Failed to start recording:', err);
    }
  };

  const stopRecording = async () => {
    try {
      if (!recording) return;
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
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
        category: category.trim().toLowerCase(),
        pushToken: pushToken || '',
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

      setWish('');
      setCategory('general');
      setOptionA('');
      setOptionB('');
      setIsPoll(false);
      setRecordedUri(null);
      setIncludeAudio(false);
      setSelectedImage(null);
      setGiftLink('');
      Alert.alert('Wish posted!');
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

        <Text style={styles.label}>Search</Text>
        <TextInput
          style={styles.input}
          placeholder="Search wishes..."
          placeholderTextColor="#999"
          value={searchTerm}
          onChangeText={setSearchTerm}
        />

        <Text style={styles.label}>Wish</Text>
        <TextInput
          style={styles.input}
          placeholder="What's your wish?"
          placeholderTextColor="#999"
          value={wish}
          onChangeText={setWish}
        />

        <Text style={styles.label}>Category</Text>
        <TextInput
          style={styles.input}
          placeholder="Category (e.g., love, health, career)"
          placeholderTextColor="#999"
          value={category}
          onChangeText={setCategory}
        />

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
  <TouchableOpacity onPress={() => router.push(`/wish/${item.id}`)} hitSlop={HIT_SLOP}>
    {!item.isAnonymous && item.displayName ? (
      <Text style={styles.author}>by {item.displayName}</Text>
    ) : null}
    <Text style={{ color: '#a78bfa', fontSize: 12 }}>
      #{item.category} {item.audioUrl ? '🔊' : ''}
    </Text>
    <Text style={styles.wishText}>{item.text}</Text>
    {item.imageUrl && (
      <Image source={{ uri: item.imageUrl }} style={styles.preview} />
    )}
    {item.isPoll ? (
      <View style={{ marginTop: 6 }}>
        <Text style={styles.pollText}>{item.optionA}: {item.votesA || 0}</Text>
        <Text style={styles.pollText}>{item.optionB}: {item.votesB || 0}</Text>
      </View>
    ) : (
      <Text style={styles.likeText}>❤️ {item.likes}</Text>
    )}
    {item.boostedUntil && item.boostedUntil.toDate &&
      item.boostedUntil.toDate() > new Date() && (
        <Text style={styles.boostedLabel}>🚀 Boosted</Text>
      )}
  </TouchableOpacity>

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
  label: {
    color: '#ccc',
    marginBottom: 4,
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
  recButton: {
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
  preview: {
    width: '100%',
    height: 200,
    borderRadius: 10,
    marginBottom: 10,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
  recordingStatus: {
    color: '#22c55e',
    textAlign: 'center',
    marginBottom: 10,
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
  boostedLabel: {
    color: '#facc15',
    fontSize: 12,
    marginTop: 4,
  },
  pollText: {
    color: '#fff',
    fontSize: 14,
  },
  author: {
    color: '#ccc',
    fontSize: 12,
    marginBottom: 2,
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
