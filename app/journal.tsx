import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { formatDistanceToNow } from 'date-fns';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, addDoc, serverTimestamp, query, orderBy, getDocs } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { db } from '../firebase';

const prompts = [
  '💭 What\u2019s your biggest wish this week?',
  '🌙 Describe a dream you had recently',
  '🧠 What advice do you wish you had today?',
];

export default function JournalPage() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const [prompt, setPrompt] = useState('');
  const [entry, setEntry] = useState('');
  const [entries, setEntries] = useState<any[]>([]);
  const [streak, setStreak] = useState(0);
  const [mood, setMood] = useState('😊');
  const [showHistory, setShowHistory] = useState(false);
  const [usePrompt, setUsePrompt] = useState(true);

  useEffect(() => {
    const load = async () => {
      const today = new Date().toISOString().split('T')[0];
      const savedDate = await AsyncStorage.getItem('journalPromptDate');
      const savedPrompt = await AsyncStorage.getItem('journalPromptText');
      if (savedDate === today && savedPrompt) {
        setPrompt(savedPrompt);
      } else {
        const p = prompts[Math.floor(Math.random() * prompts.length)];
        setPrompt(p);
        await AsyncStorage.setItem('journalPromptDate', today);
        await AsyncStorage.setItem('journalPromptText', p);
      }
      const sc = await AsyncStorage.getItem('journalStreakCount');
      setStreak(sc ? parseInt(sc, 10) : 0);
      if (user) {
        const q = query(collection(db, 'users', user.uid, 'journalEntries'), orderBy('timestamp', 'desc'));
        const snap = await getDocs(q);
        setEntries(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
      }
    };
    load();
  }, [user]);

  const updateStreak = async () => {
    const today = new Date().toISOString().split('T')[0];
    const lastDate = await AsyncStorage.getItem('lastJournalDate');
    let count = parseInt((await AsyncStorage.getItem('journalStreakCount')) || '0', 10);
    if (lastDate === today) return;
    if (lastDate) {
      const diff = (new Date(today).getTime() - new Date(lastDate).getTime()) / 86400000;
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
    await addDoc(collection(db, 'users', user.uid, 'journalEntries'), {
      text: entry.trim(),
      ...(usePrompt ? { prompt } : {}),
      mood,
      date: new Date().toISOString().split('T')[0],
      timestamp: serverTimestamp(),
    });
    setEntries([
      {
        id: Math.random().toString(),
        text: entry.trim(),
        ...(usePrompt ? { prompt } : {}),
        mood,
        date: new Date().toISOString().split('T')[0],
        timestamp: new Date(),
      },
      ...entries,
    ]);
    setEntry('');
    await updateStreak();
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {usePrompt && <Text style={[styles.prompt, { color: theme.text }]}>{prompt}</Text>}
      {streak > 0 && (
        <Text style={[styles.streak, { color: theme.tint }]}>🧠 You’ve written {streak} days in a row</Text>
      )}
      <View style={styles.row}>
        {['😢','😐','😊','😄'].map((m) => (
          <TouchableOpacity key={m} onPress={() => setMood(m)} style={{ marginRight: 8, opacity: mood === m ? 1 : 0.5 }}>
            <Text style={{ fontSize: 20 }}>{m}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity onPress={() => setUsePrompt((p) => !p)} style={{ marginLeft: 'auto' }}>
          <Text style={{ color: theme.tint }}>{usePrompt ? 'Freeform' : 'Use Prompt'}</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={[styles.input, { backgroundColor: theme.input, color: theme.text }]}
        placeholder="Write your thoughts"
        placeholderTextColor="#888"
        value={entry}
        onChangeText={setEntry}
        multiline
      />
      <TouchableOpacity style={[styles.button, { backgroundColor: theme.tint }]} onPress={handlePost}>
        <Text style={styles.buttonText}>Save Entry</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setShowHistory((s) => !s)} style={{ marginTop: 10 }}>
        <Text style={{ color: theme.tint }}>{showHistory ? 'Hide' : 'Show'} Past Entries</Text>
      </TouchableOpacity>
      {showHistory && (
        <FlatList
          data={entries.slice(0, 7)}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.entryItem}>
              <Text style={[styles.entryText, { color: theme.text }]}>
                {item.mood || '😊'} {item.text}
              </Text>
              <Text style={styles.entryDate}>
                {item.timestamp?.seconds
                  ? formatDistanceToNow(new Date(item.timestamp.seconds * 1000), { addSuffix: true })
                  : 'Just now'}
              </Text>
            </View>
          )}
          style={{ marginTop: 10 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  prompt: { fontSize: 16, marginBottom: 10, fontWeight: '600' },
  streak: { marginBottom: 10 },
  input: { padding: 12, borderRadius: 10, marginBottom: 10, height: 100 },
  button: { padding: 12, borderRadius: 10, alignItems: 'center', marginBottom: 20 },
  buttonText: { fontWeight: '600' },
  entryItem: { marginBottom: 12 },
  entryText: { fontSize: 14 },
  entryDate: { fontSize: 12, color: '#888' },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
});
