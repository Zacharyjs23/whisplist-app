import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useTheme } from '@/contexts/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import { addDoc, collection, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Image,
  Linking,
  Share,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { db, storage } from '../../firebase';
import {
  getAllWishes,
  getWishComments,
  getWishesByNickname,
} from '../../helpers/firestore';

export default function Page() {
  const { theme, toggleTheme } = useTheme();

  interface User {
    id: string;
    nickname: string;
  }

  const [user, setUser] = useState<User | null>(null);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [defaultCategory, setDefaultCategory] = useState('general');
  const [language, setLanguage] = useState('en');
  const [feedback, setFeedback] = useState('');
  const [anonymize, setAnonymize] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const [dailyQuote, setDailyQuote] = useState(false);

  useEffect(() => {
    const load = async () => {
      const a = await AsyncStorage.getItem('avatarUrl');
      const cat = await AsyncStorage.getItem('defaultCategory');
      const lang = await AsyncStorage.getItem('language');
      const anon = await AsyncStorage.getItem('anonymize');
      const dev = await AsyncStorage.getItem('devMode');
      const quote = await AsyncStorage.getItem('dailyQuote');
      const storedNickname = await AsyncStorage.getItem('nickname');
      if (a) setAvatarUrl(a);
      if (cat) setDefaultCategory(cat);
      if (lang) setLanguage(lang);
      setAnonymize(anon === 'true');
      setDevMode(dev === 'true');
      setDailyQuote(quote === 'true');
      if (storedNickname) setUser({ id: 'local', nickname: storedNickname });
    };
    load();
  }, []);

  const pickAvatar = async () => {
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) return Alert.alert('Permission required', 'Media access needed');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!result.canceled && result.assets.length > 0) {
      const uri = result.assets[0].uri;
      const resp = await fetch(uri);
      const blob = await resp.blob();
      const r = ref(storage, `avatars/${Date.now()}`);
      await uploadBytes(r, blob);
      const url = await getDownloadURL(r);
      await AsyncStorage.setItem('avatarUrl', url);
      setAvatarUrl(url);
    }
  };

  const handleReset = async () => {
    await AsyncStorage.clear();
    Alert.alert('Data cleared');
  };

  const handleExport = async () => {
    if (!user?.nickname) return Alert.alert('No nickname set');
    const wishes = await getWishesByNickname(user.nickname);
    const comments: any[] = [];
    for (const w of wishes) {
      const list = await getWishComments(w.id);
      list.forEach((c) => {
        if (c.nickname === user.nickname) comments.push(c);
      });
    }
    const data = JSON.stringify({ wishes, comments }, null, 2);
    Share.share({ message: data });
  };

  const handleSendFeedback = async () => {
    if (!feedback.trim()) return;
    await addDoc(collection(db, 'feedback'), {
      text: feedback.trim(),
      timestamp: serverTimestamp(),
    });
    Alert.alert('Feedback sent!');
    setFeedback('');
  };

  const handleDeleteContent = async () => {
    if (!user?.nickname) return Alert.alert('No nickname set');
    const confirm = await new Promise<boolean>((resolve) => {
      Alert.alert('Delete All', 'Are you sure?', [
        { text: 'Cancel', onPress: () => resolve(false) },
        { text: 'Delete', onPress: () => resolve(true) },
      ]);
    });
    if (!confirm) return;
    const wishes = await getWishesByNickname(user.nickname);
    for (const w of wishes) {
      await deleteDoc(doc(db, 'wishes', w.id));
    }
    const all = await getAllWishes();
    for (const wish of all) {
      const list = await getWishComments(wish.id);
      for (const c of list) {
        if (c.nickname === user.nickname) {
          await deleteDoc(doc(db, 'wishes', wish.id, 'comments', c.id));
        }
      }
    }
    Alert.alert('Content deleted');
  };

  const permissionsInfo = async () => {
    const mic = await Audio.getPermissionsAsync();
    const notif = await Notifications.getPermissionsAsync();
    Alert.alert('Permissions', `Microphone: ${mic.status}\nNotifications: ${notif.status}`);
  };

  const toggleAnonymize = async (val: boolean) => {
    setAnonymize(val);
    await AsyncStorage.setItem('anonymize', val ? 'true' : 'false');
  };

  const toggleDevMode = async (val: boolean) => {
    setDevMode(val);
    await AsyncStorage.setItem('devMode', val ? 'true' : 'false');
  };

  const toggleDailyQuote = async (val: boolean) => {
    setDailyQuote(val);
    await AsyncStorage.setItem('dailyQuote', val ? 'true' : 'false');
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.title}>Settings</ThemedText>
      <View style={styles.row}>
        <ThemedText style={styles.label}>Dark Mode</ThemedText>
        <Switch value={theme === 'dark'} onValueChange={toggleTheme} />
      </View>

      <View style={styles.row}>
        <ThemedText style={styles.label}>Anonymize Username</ThemedText>
        <Switch value={anonymize} onValueChange={toggleAnonymize} />
      </View>

      <View style={styles.row}>
        <ThemedText style={styles.label}>Developer Mode</ThemedText>
        <Switch value={devMode} onValueChange={toggleDevMode} />
      </View>

      <View style={styles.row}>
        <ThemedText style={styles.label}>Daily Quote</ThemedText>
        <Switch value={dailyQuote} onValueChange={toggleDailyQuote} />
      </View>

      <Button title="Pick Avatar" onPress={pickAvatar} />
      {avatarUrl && <Image source={{ uri: avatarUrl }} style={styles.avatar} />}

      <ThemedText style={styles.section}>Default Category</ThemedText>
      <Picker
        selectedValue={defaultCategory}
        onValueChange={async (v) => {
          setDefaultCategory(v);
          await AsyncStorage.setItem('defaultCategory', v);
        }}
        style={styles.picker}
      >
        <Picker.Item label="General" value="general" />
        <Picker.Item label="Love" value="love" />
        <Picker.Item label="Career" value="career" />
        <Picker.Item label="Health" value="health" />
      </Picker>

      <ThemedText style={styles.section}>Language</ThemedText>
      <Picker
        selectedValue={language}
        onValueChange={async (v) => {
          setLanguage(v);
          await AsyncStorage.setItem('language', v);
        }}
        style={styles.picker}
      >
        <Picker.Item label="English" value="en" />
        <Picker.Item label="Spanish" value="es" />
      </Picker>

      <TextInput
        style={styles.input}
        placeholder="Send feedback"
        placeholderTextColor="#888"
        value={feedback}
        onChangeText={setFeedback}
      />
      <Button title="Submit Feedback" onPress={handleSendFeedback} />

      <Button title="Export History" onPress={handleExport} />
      <Button title="Rate this App" onPress={() => Linking.openURL('https://example.com')} />
      <Button title="Permissions" onPress={permissionsInfo} />
      <Button title="Delete My Content" onPress={handleDeleteContent} />
      <Button title="Reset App Data" onPress={handleReset} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#a78bfa',
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  label: {
    fontSize: 16,
    color: '#fff',
  },
  section: {
    marginTop: 20,
    marginBottom: 8,
    color: '#a78bfa',
    fontSize: 16,
  },
  picker: {
    backgroundColor: '#1e1e1e',
    color: '#fff',
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#1e1e1e',
    color: '#fff',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignSelf: 'center',
    marginVertical: 10,
  },
});
