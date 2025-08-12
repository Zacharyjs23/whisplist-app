import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  Animated,
  Platform,
  ToastAndroid,
} from 'react-native';
import { formatDistanceToNow } from 'date-fns';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  getDocs,
} from 'firebase/firestore';
import { addWish } from '../helpers/wishes';
import { useAuthSession } from '@/contexts/AuthSessionContext';
import { useTheme } from '@/contexts/ThemeContext';
import { db } from '../firebase';
import * as logger from '@/shared/logger';

const prompts = [
  '💭 What\u2019s your biggest wish this week?',
  '🌙 Describe a dream you had recently',
  '🧠 What advice do you wish you had today?',
];

export default function JournalPage() {
  const { user } = useAuthSession();
  const { theme } = useTheme();
  const [prompt, setPrompt] = useState('');
  const [entry, setEntry] = useState('');
  const [entries, setEntries] = useState<any[]>([]);
  const [streak, setStreak] = useState(0);
  const [mood, setMood] = useState('😊');
  const [usePrompt, setUsePrompt] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [moodSummary, setMoodSummary] = useState<Record<string, number>>({});
  const promptOpacity = useRef(new Animated.Value(1)).current;
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const load = async () => {
      const today = new Date().toISOString().split('T')[0];
      const savedDate = await AsyncStorage.getItem('dailyPromptDate');
      let savedPrompt = await AsyncStorage.getItem('dailyPromptText');
      const recentRaw = await AsyncStorage.getItem('recentPrompts');
      let recent = recentRaw ? (JSON.parse(recentRaw) as string[]) : [];
      if (savedDate !== today || !savedPrompt) {
        let newPrompt = savedPrompt || '';
        for (let i = 0; i < 10; i++) {
          const p = prompts[Math.floor(Math.random() * prompts.length)];
          if (p !== savedPrompt && !recent.includes(p)) {
            newPrompt = p;
            break;
          }
        }
        savedPrompt = newPrompt;
        await AsyncStorage.setItem('dailyPromptDate', today);
        await AsyncStorage.setItem('dailyPromptText', newPrompt);
        recent = [newPrompt, ...recent.filter((r) => r !== newPrompt)].slice(
          0,
          3,
        );
        await AsyncStorage.setItem('recentPrompts', JSON.stringify(recent));
      }
      promptOpacity.setValue(0);
      setPrompt(savedPrompt || '');
      Animated.timing(promptOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
      const sc = await AsyncStorage.getItem('journalStreakCount');
      setStreak(sc ? parseInt(sc, 10) : 0);
      if (user) {
        const q = query(
          collection(db, 'users', user.uid, 'journalEntries'),
          orderBy('timestamp', 'desc'),
        );
        const snap = await getDocs(q);
        let loaded = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        const offlineRaw = await AsyncStorage.getItem('offlineJournalEntries');
        if (offlineRaw) {
          try {
            const offline = JSON.parse(offlineRaw) as any[];
            for (const o of offline) {
              await addDoc(
                collection(db, 'users', user.uid, 'journalEntries'),
                {
                  text: o.text,
                  mood: o.mood,
                  prompt: o.prompt,
                  timestamp: serverTimestamp(),
                },
              );
              loaded.unshift({ id: Math.random().toString(), ...o });
            }
            await AsyncStorage.removeItem('offlineJournalEntries');
          } catch (err) {
            logger.warn('Failed to sync offline journal entries', err);
          }
        }
        setEntries(loaded);
        const summary: Record<string, number> = {};
        loaded.slice(0, 7).forEach((e) => {
          if (e.mood) summary[e.mood] = (summary[e.mood] || 0) + 1;
        });
        setMoodSummary(summary);
      }
    };
    load();
  }, [user, promptOpacity]);

  const updateStreak = async () => {
    const today = new Date().toISOString().split('T')[0];
    const lastDate = await AsyncStorage.getItem('lastJournalDate');
    let count = parseInt(
      (await AsyncStorage.getItem('journalStreakCount')) || '0',
      10,
    );
    if (lastDate === today) return;
    if (lastDate) {
      const diff =
        (new Date(today).getTime() - new Date(lastDate).getTime()) / 86400000;
      count = diff === 1 ? count + 1 : 1;
    } else {
      count = 1;
    }
    await AsyncStorage.setItem('lastJournalDate', today);
    await AsyncStorage.setItem('journalStreakCount', count.toString());
    setStreak(count);
  };

  const handlePost = async () => {
    if (!entry.trim() || !user) return;
    const data = {
      text: entry.trim(),
      ...(usePrompt ? { prompt } : {}),
      mood,
    };
    try {
      await addDoc(collection(db, 'users', user.uid, 'journalEntries'), {
        ...data,
        timestamp: serverTimestamp(),
      });
    } catch (err) {
      logger.warn('Failed to save entry online', err);
      const offlineRaw = await AsyncStorage.getItem('offlineJournalEntries');
      const offline = offlineRaw ? JSON.parse(offlineRaw) : [];
      offline.push({ ...data, timestamp: Date.now() });
      await AsyncStorage.setItem(
        'offlineJournalEntries',
        JSON.stringify(offline),
      );
      Alert.alert('Saved offline', 'Your entry will sync when online.');
    }
    setEntries([
      {
        id: Math.random().toString(),
        ...data,
        timestamp: new Date(),
      },
      ...entries,
    ]);
    setMoodSummary((prev) => ({
      ...prev,
      [mood]: (prev[mood] || 0) + 1,
    }));
    setEntry('');
    await updateStreak();
  };

  const shareAsWish = async (text: string) => {
    if (!user) return;
    try {
      await addWish({
        text,
        category: 'wish',
        type: 'wish',
        userId: user.uid,
        displayName: '',
        photoURL: '',
        isAnonymous: true,
      });
      Alert.alert('Wish posted!');
    } catch (err) {
      logger.error('Failed to share as wish', err);
    }
  };

  const requestNewPrompt = async () => {
    const recentRaw = await AsyncStorage.getItem('recentPrompts');
    let recent = recentRaw ? (JSON.parse(recentRaw) as string[]) : [];

    let newPrompt = prompt;
    const available = prompts.filter(
      (p) => p !== prompt && !recent.includes(p),
    );
    if (available.length > 0) {
      newPrompt = available[Math.floor(Math.random() * available.length)];
    } else {
      // fallback to any prompt different from current
      for (let i = 0; i < 10; i++) {
        const p = prompts[Math.floor(Math.random() * prompts.length)];
        if (p !== prompt) {
          newPrompt = p;
          break;
        }
      }
    }

    await AsyncStorage.setItem('dailyPromptText', newPrompt);
    recent = [newPrompt, ...recent.filter((r) => r !== newPrompt)].slice(0, 3);
    await AsyncStorage.setItem('recentPrompts', JSON.stringify(recent));

    promptOpacity.setValue(0);
    setPrompt(newPrompt);
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

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.header, { color: theme.text }]}>
        Your Private Journal ✨
      </Text>
      {usePrompt && (
        <>
          <Animated.View style={{ opacity: promptOpacity }}>
            <Text style={[styles.prompt, { color: theme.text }]}>{prompt}</Text>
          </Animated.View>
          <TouchableOpacity onPress={requestNewPrompt}>
            <Text style={{ color: theme.tint }}>
              🔄 Give me a different prompt
            </Text>
          </TouchableOpacity>
        </>
      )}
      {streak > 0 && (
        <Text style={[styles.streak, { color: theme.tint }]}>
          🔥 {streak}-day streak
        </Text>
      )}
      {Object.keys(moodSummary).length > 0 && (
        <Text style={[styles.summary, { color: theme.text }]}>
          {Object.entries(moodSummary)
            .map(([m, c]) => `${m} ${c}`)
            .join('  ')}
        </Text>
      )}
      <View style={styles.row}>
        {['😢', '😐', '😊', '😄'].map((m) => (
          <TouchableOpacity
            key={m}
            onPress={() => setMood(m)}
            style={{ marginRight: 8, opacity: mood === m ? 1 : 0.5 }}
          >
            <Text style={{ fontSize: 20 }}>{m}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          onPress={() => setUsePrompt((p) => !p)}
          style={{ marginLeft: 'auto' }}
        >
          <Text style={{ color: theme.tint }}>
            {usePrompt ? 'Freeform' : 'Use Prompt'}
          </Text>
        </TouchableOpacity>
      </View>
      <TextInput
        ref={inputRef}
        style={[
          styles.input,
          { backgroundColor: theme.input, color: theme.text },
        ]}
        placeholder="Write your thoughts"
        placeholderTextColor={theme.placeholder}
        value={entry}
        onChangeText={setEntry}
        multiline
      />
      <TouchableOpacity
        style={[styles.button, { backgroundColor: theme.tint }]}
        onPress={handlePost}
      >
        <Text style={styles.buttonText}>Save Entry</Text>
      </TouchableOpacity>
      <FlatList
        data={entries.slice(0, 7)}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() =>
              setExpandedId(expandedId === item.id ? null : item.id)
            }
            style={styles.entryItem}
          >
            <Text style={[styles.entryText, { color: theme.text }]}>
              {item.mood || '😊'}{' '}
              {expandedId === item.id
                ? item.text
                : item.text.length > 80
                  ? item.text.slice(0, 80) + '...'
                  : item.text}
            </Text>
            <Text style={[styles.entryDate, { color: theme.placeholder }]}> 
              {/* theme fix */}
              {item.timestamp?.seconds
                ? formatDistanceToNow(new Date(item.timestamp.seconds * 1000), {
                    addSuffix: true,
                  })
                : 'Just now'}
            </Text>
            {expandedId === item.id && (
              <TouchableOpacity onPress={() => shareAsWish(item.text)}>
                <Text style={{ color: theme.tint }}>
                  📤 Turn this into a wish
                </Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        )}
        ListEmptyComponent={() => (
          <View style={{ alignItems: 'center' }}>
            <Text
              style={[styles.entryText, { color: theme.text, marginBottom: 8 }]}
            >
              Start your week with a single thought. You’ve got this. 🌱
            </Text>
            <TouchableOpacity onPress={() => inputRef.current?.focus()}>
              <Text style={{ color: theme.tint }}>Use this prompt</Text>
            </TouchableOpacity>
          </View>
        )}
        style={{ marginTop: 10 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  header: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 10,
    textAlign: 'center',
  },
  prompt: { fontSize: 16, marginBottom: 10, fontWeight: '600' },
  streak: { marginBottom: 10 },
  input: { padding: 12, borderRadius: 10, marginBottom: 10, height: 100 },
  button: {
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 20,
  },
  buttonText: { fontWeight: '600' },
  entryItem: { marginBottom: 12 },
  entryText: { fontSize: 14 },
  entryDate: { fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  summary: { textAlign: 'center', marginBottom: 10 },
});
