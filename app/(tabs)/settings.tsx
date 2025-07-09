import { ThemedText } from '@/components/ThemedText';
import ThemedButton from '@/components/ThemedButton';
import { useTheme, ThemeName } from '@/contexts/ThemeContext';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  View,
  Alert,
  Image,
  Share,
  StyleSheet,
  Switch,
  TextInput,
  SafeAreaView,
} from 'react-native';
import * as Linking from 'expo-linking';
import { Picker } from '@react-native-picker/picker';
import * as Audio from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import { addDoc, collection, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import React, { useEffect, useState } from 'react';
import { db, storage } from '../../firebase';
import {
  getAllWishes,
  getWishComments,
  getWishesByNickname,
} from '../../helpers/firestore';

export default function Page() {
  const { theme, setTheme } = useTheme();
  const { profile, updateProfile } = useAuth();

  const themeOptions = Object.keys(Colors) as ThemeName[];

  const ThemeSwatch = ({ name }: { name: ThemeName }) => {
    const active = theme.name === name;
    return (
      <TouchableOpacity
        key={name}
        onPress={() => setTheme(name)}
        style={[
          styles.themeItem,
          {
            backgroundColor: Colors[name].background,
            borderColor: active ? theme.tint : 'transparent',
          },
        ]}
      >
        <View style={[styles.swatch, { backgroundColor: Colors[name].tint }]} />
        <ThemedText style={active ? { color: theme.tint } : undefined}>
          {name}
          {active ? ' ✓' : ''}
        </ThemedText>
      </TouchableOpacity>
    );
  };

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
  const [publicProfileEnabled, setPublicProfileEnabled] = useState(
    profile?.publicProfileEnabled !== false
  );

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
      setPublicProfileEnabled(profile?.publicProfileEnabled !== false);
    };
    load();
  }, [profile]);

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
    const mic = await Audio.getRecordingPermissionsAsync();
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

  const togglePublicProfile = async (val: boolean) => {
    setPublicProfileEnabled(val);
    await updateProfile({ publicProfileEnabled: val });
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.container,
            { backgroundColor: theme.background },
          ]}
        >
        <ThemedText style={styles.title}>Settings</ThemedText>
      <ThemedText style={styles.section}>Theme</ThemedText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.themeList}>
        {themeOptions.map((t) => (
          <ThemeSwatch key={t} name={t} />
        ))}
      </ScrollView>
      <Picker
        selectedValue={theme.name}
        onValueChange={(value) => setTheme(value as ThemeName)}
        style={[styles.picker, { backgroundColor: theme.input, color: theme.text }]}
      >
        {themeOptions.map((t) => (
          <Picker.Item key={t} label={t} value={t} />
        ))}
      </Picker>

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

      <View style={styles.row}>
        <ThemedText style={styles.label}>Public Profile Enabled</ThemedText>
        <Switch value={publicProfileEnabled} onValueChange={togglePublicProfile} />
      </View>

      <ThemedButton title="Pick Avatar" onPress={pickAvatar} />
      {avatarUrl && <Image source={{ uri: avatarUrl }} style={styles.avatar} />}

      <ThemedText style={styles.section}>Default Category</ThemedText>
      <Picker
        selectedValue={defaultCategory}
        onValueChange={async (v) => {
          setDefaultCategory(v);
          await AsyncStorage.setItem('defaultCategory', v);
        }}
        style={[
          styles.picker,
          { backgroundColor: theme.input, color: theme.text },
        ]}
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
        style={[
          styles.picker,
          { backgroundColor: theme.input, color: theme.text },
        ]}
      >
        <Picker.Item label="English" value="en" />
        <Picker.Item label="Spanish" value="es" />
      </Picker>

      <TextInput
        style={[
          styles.input,
          { backgroundColor: theme.input, color: theme.text, height: 80, textAlignVertical: 'top' },
        ]}
        placeholder="Send feedback"
        placeholderTextColor="#888"
        value={feedback}
        onChangeText={setFeedback}
        multiline
      />
      <ThemedButton title="Submit Feedback" onPress={handleSendFeedback} />

      <ThemedButton title="Export History" onPress={handleExport} />
      <ThemedButton title="Rate this App" onPress={() => Linking.openURL('https://example.com')} />
      <ThemedButton title="Permissions" onPress={permissionsInfo} />
      <ThemedButton title="Delete My Content" onPress={handleDeleteContent} />
      <ThemedButton title="Reset App Data" onPress={handleReset} />
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
    padding: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
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
  },
  section: {
    marginTop: 20,
    marginBottom: 8,
    fontSize: 16,
  },
  picker: {
    marginBottom: 12,
  },
  themeList: {
    marginBottom: 12,
  },
  themeItem: {
    padding: 10,
    borderRadius: 8,
    marginRight: 8,
    alignItems: 'center',
    borderWidth: 2,
  },
  swatch: {
    width: 20,
    height: 20,
    borderRadius: 4,
    marginBottom: 4,
  },
  input: {
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
