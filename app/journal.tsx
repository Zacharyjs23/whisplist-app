import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
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
      prompt,
      date: new Date().toISOString().split('T')[0],
      timestamp: serverTimestamp(),
    });
    setEntries([{ id: Math.random().toString(), text: entry.trim(), prompt, date: new Date().toISOString().split('T')[0] }, ...entries]);
    setEntry('');
    await updateStreak();
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.prompt, { color: theme.text }]}>{prompt}</Text>
      {streak > 0 && (
        <Text style={[styles.streak, { color: theme.tint }]}>🧠 You’ve written {streak} days in a row</Text>
      )}
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
      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.entryItem}>
            <Text style={[styles.entryText, { color: theme.text }]}>{item.text}</Text>
            <Text style={styles.entryDate}>{item.date}</Text>
          </View>
        )}
        style={{ marginTop: 20 }}
      />
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
});
