import * as React from 'react';
import {
  View,
  Text,
  TextInput as RNTextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  Animated,
  Platform,
  ToastAndroid,
  SafeAreaView,
  KeyboardAvoidingView,
} from 'react-native';
import type { TextInputProps, TextInput as TextInputInstance } from 'react-native';
import { formatDistanceToNow } from 'date-fns';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, addDoc, serverTimestamp, query, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { addWish } from '../helpers/wishes';
import { useAuthSession } from '@/contexts/AuthSessionContext';
import { useTheme } from '@/contexts/ThemeContext';
import { db } from '../firebase';
import { useTranslation } from '@/contexts/I18nContext';
import * as logger from '@/shared/logger';
import { JOURNAL_PROMPTS } from '@/constants/prompts';
import { Ionicons } from '@expo/vector-icons';

const CAN_USE_NATIVE_DRIVER = Platform.OS !== 'web';

const MOODS = ['😢', '😐', '😊', '😄'] as const;

type JournalEntry = {
  id: string;
  text: string;
  mood?: string;
  prompt?: string;
  timestamp?: Timestamp | Date | { seconds: number } | number;
};

// Proper forwardRef wrapper for RN TextInput
type InputRef = TextInputInstance;
const ForwardedTextInput = React.forwardRef<InputRef, TextInputProps>((props, ref) => (
  <RNTextInput {...props} ref={ref} />
));
ForwardedTextInput.displayName = 'ForwardedTextInput';

export default function JournalPage() {
  const { user } = useAuthSession();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [prompt, setPrompt] = React.useState('');
  const [entry, setEntry] = React.useState('');
  const [entries, setEntries] = React.useState<JournalEntry[]>([]);
  const [streak, setStreak] = React.useState(0);
  const [mood, setMood] = React.useState('😊');
  const [usePrompt, setUsePrompt] = React.useState(true);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [moodSummary, setMoodSummary] = React.useState<Record<string, number>>({});
  const [weeklyInsights, setWeeklyInsights] = React.useState<{
    entries: number;
    topMood: string | null;
    avgLength: number;
  }>({ entries: 0, topMood: null, avgLength: 0 });
  const [searchQuery, setSearchQuery] = React.useState('');
  const promptOpacity = React.useRef(new Animated.Value(1)).current;
  const inputRef = React.useRef<InputRef | null>(null);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredEntries = React.useMemo(() => {
    if (!normalizedQuery) return entries;
    return entries.filter((item) => {
      const textMatch = item.text?.toLowerCase?.().includes(normalizedQuery);
      const promptMatch = item.prompt?.toLowerCase?.().includes(normalizedQuery);
      const moodMatch = item.mood?.toLowerCase?.().includes(normalizedQuery);
      return Boolean(textMatch || promptMatch || moodMatch);
    });
  }, [entries, normalizedQuery]);
  const hasSearch = normalizedQuery.length > 0;

  React.useEffect(() => {
    const load = async () => {
      const today = new Date().toISOString().split('T')[0];
      const savedDate = await AsyncStorage.getItem('journalPromptDate');
      let savedPrompt = await AsyncStorage.getItem('journalPromptText');
      const recentRaw = await AsyncStorage.getItem('journalRecentPrompts');
      let recent = recentRaw ? (JSON.parse(recentRaw) as string[]) : [];
      if (savedDate !== today || !savedPrompt) {
        let newPrompt = savedPrompt || '';
        for (let i = 0; i < 10; i++) {
          const p = JOURNAL_PROMPTS[Math.floor(Math.random() * JOURNAL_PROMPTS.length)];
          if (p !== savedPrompt && !recent.includes(p)) {
            newPrompt = p;
            break;
          }
        }
        savedPrompt = newPrompt;
        await AsyncStorage.setItem('journalPromptDate', today);
        await AsyncStorage.setItem('journalPromptText', newPrompt);
        recent = [newPrompt, ...recent.filter((r) => r !== newPrompt)].slice(
          0,
          3,
        );
        await AsyncStorage.setItem('journalRecentPrompts', JSON.stringify(recent));
      }
      promptOpacity.setValue(0);
      setPrompt(savedPrompt || '');
      Animated.timing(promptOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: CAN_USE_NATIVE_DRIVER,
      }).start();
      const sc = await AsyncStorage.getItem('journalStreakCount');
      setStreak(sc ? parseInt(sc, 10) : 0);
      if (user) {
        const q = query(
          collection(db, 'users', user.uid, 'journalEntries'),
          orderBy('timestamp', 'desc'),
        );
        const snap = await getDocs(q);
        const loaded: JournalEntry[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<JournalEntry, 'id'>),
        }));
        const offlineRaw = await AsyncStorage.getItem('offlineJournalEntries');
        if (offlineRaw) {
          try {
            const offline = JSON.parse(offlineRaw) as (
              Omit<JournalEntry, 'id' | 'timestamp'> & { timestamp: number }
            )[];
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
        const sevenDaysAgo = Date.now() - 6 * 24 * 60 * 60 * 1000;
        const recent = loaded.filter((entry) => {
          const date = toDate(entry.timestamp);
          return date ? date.getTime() >= sevenDaysAgo : false;
        });
        const totalChars = recent.reduce((sum, entry) => sum + (entry.text?.length || 0), 0);
        const avgLength = recent.length ? Math.round(totalChars / recent.length) : 0;
        const topMoodEntry = Object.entries(summary).sort((a, b) => b[1] - a[1])[0];
        setWeeklyInsights({
          entries: recent.length,
          topMood: topMoodEntry ? topMoodEntry[0] : null,
          avgLength,
        });
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
      Alert.alert(
        t('journal.savedOfflineTitle', 'Saved offline'),
        t('journal.savedOfflineMessage', 'Your entry will sync when online.'),
      );
    }
    setEntries([
      {
        id: Math.random().toString(),
        ...data,
        timestamp: new Date(),
      },
      ...entries,
    ]);
    setMoodSummary((prev: Record<string, number>) => ({
      ...prev,
      [mood]: (prev[mood] || 0) + 1,
    }));
    setEntry('');
    await updateStreak();
  };

  const shareAsWish = React.useCallback(
    async (text: string) => {
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
        Alert.alert(t('journal.wishShared', 'Wish posted!'));
      } catch (err) {
        logger.error('Failed to share as wish', err);
      }
    },
    [t, user],
  );

  const requestNewPrompt = async () => {
      const recentRaw = await AsyncStorage.getItem('journalRecentPrompts');
      let recent = recentRaw ? (JSON.parse(recentRaw) as string[]) : [];

      let newPrompt = prompt;
      const available = JOURNAL_PROMPTS.filter(
        (p) => p !== prompt && !recent.includes(p),
      );
      if (available.length > 0) {
        newPrompt = available[Math.floor(Math.random() * available.length)];
      } else {
        // fallback to any prompt different from current
        for (let i = 0; i < 10; i++) {
          const p = JOURNAL_PROMPTS[Math.floor(Math.random() * JOURNAL_PROMPTS.length)];
          if (p !== prompt) {
            newPrompt = p;
            break;
          }
        }
      }

    await AsyncStorage.setItem('journalPromptText', newPrompt);
    recent = [newPrompt, ...recent.filter((r) => r !== newPrompt)].slice(0, 3);
    await AsyncStorage.setItem('journalRecentPrompts', JSON.stringify(recent));

    promptOpacity.setValue(0);
    setPrompt(newPrompt);
    Animated.timing(promptOpacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: CAN_USE_NATIVE_DRIVER,
    }).start();
    const msg = t('journal.promptRefreshed', "✨ That's a deep one.");
    if (Platform.OS === 'android') {
      ToastAndroid.show(msg, ToastAndroid.SHORT);
    } else {
      Alert.alert(msg);
    }
  };

  const toDate = (ts?: JournalEntry['timestamp']): Date | null => {
    if (!ts) return null;
    if (ts instanceof Date) return ts;
    if (typeof ts === 'number') return new Date(ts);
    const anyTs = ts as any;
    if (typeof anyTs?.toDate === 'function') return anyTs.toDate();
    if (typeof anyTs?.seconds === 'number') return new Date(anyTs.seconds * 1000);
    return null;
  };

  const renderEntry = React.useCallback(
    ({ item }: { item: JournalEntry }) => {
      const expanded = expandedId === item.id;
      const date = toDate(item.timestamp);
      const timeLabel = date
        ? formatDistanceToNow(date, { addSuffix: true })
        : t('journal.justNow', 'Just now');
      return (
        <View
          style={[
            styles.entryCard,
            { backgroundColor: theme.input, borderColor: theme.placeholder },
          ]}
        >
          <View style={styles.entryHeader}>
            <Text style={[styles.entryMood, { color: theme.text }]}>
              {item.mood || '😊'}
            </Text>
            <Text style={[styles.entryDate, { color: theme.placeholder }]}>
              {timeLabel}
            </Text>
          </View>
          {item.prompt ? (
            <Text style={[styles.entryPrompt, { color: theme.placeholder }]}>
              {item.prompt}
            </Text>
          ) : null}
          <Text
            style={[styles.entryText, { color: theme.text }]}
            numberOfLines={expanded ? undefined : 4}
          >
            {item.text}
          </Text>
          <View style={styles.entryActions}>
            <TouchableOpacity
              onPress={() => setExpandedId(expanded ? null : item.id)}
            >
              <Text style={[styles.entryActionText, { color: theme.tint }]}>
                {expanded
                  ? t('journal.collapseEntry', 'Show less')
                  : t('journal.expandEntry', 'Read more')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => shareAsWish(item.text)}>
              <Text style={[styles.entryActionText, { color: theme.tint }]}>
                {t('journal.shareAsWish', 'Share as wish')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    },
    [expandedId, shareAsWish, theme.input, theme.placeholder, theme.text, theme.tint, t],
  );

  const renderHeader = () => (
    <View style={styles.headerSpacing}>
      <View
        style={[
          styles.heroCard,
          { backgroundColor: theme.input, borderColor: theme.placeholder },
        ]}
      >
        <Text style={[styles.heroGreeting, { color: theme.text }]}>
          {t('journal.header', 'Your Private Journal ✨')}
        </Text>
        <Text style={[styles.heroSubtitle, { color: theme.placeholder }]}>
          {t('journal.heroSubtitle', 'Capture a thought, track your mood.')}
        </Text>
        {streak > 0 ? (
          <View style={[styles.streakPill, { borderColor: theme.placeholder }]}
            accessibilityLabel={t('journal.streak', '{{count}}-day streak', { count: streak })}
          >
            <Text style={[styles.streakText, { color: theme.tint }]}>
              {t('journal.streak', '{{count}}-day streak', { count: streak })}
            </Text>
          </View>
        ) : null}
        <View style={styles.heroStatsRow}>
          <View
            style={[styles.heroStat, { borderColor: theme.placeholder }]}
          >
            <Text style={[styles.heroStatValue, { color: theme.text }]}>
              {entries.length}
            </Text>
            <Text style={styles.heroStatLabel}>
              {t('journal.stats.entries', 'Entries')}
            </Text>
          </View>
          <View
            style={[styles.heroStat, { borderColor: theme.placeholder }]}
          >
            <Text style={[styles.heroStatValue, { color: theme.text }]}>
              {streak}
            </Text>
            <Text style={styles.heroStatLabel}>
              {t('journal.stats.streak', 'Streak')}
            </Text>
          </View>
          <View
            style={[styles.heroStat, { borderColor: theme.placeholder }]}
          >
            <Text style={[styles.heroStatValue, { color: theme.text }]}>
              {weeklyInsights.entries}
            </Text>
            <Text style={styles.heroStatLabel}>
              {t('journal.stats.week', 'This week')}
            </Text>
          </View>
        </View>
        {Object.keys(moodSummary).length > 0 ? (
          <View style={styles.moodSummaryWrap}>
            {Object.entries(moodSummary)
              .sort((a, b) => b[1] - a[1])
              .map(([emoji, count]) => (
                <View
                  key={`${emoji}-${count}`}
                  style={[
                    styles.moodSummaryChip,
                    {
                      backgroundColor: theme.background,
                      borderColor: theme.placeholder,
                    },
                  ]}
                >
                  <Text style={[styles.moodSummaryEmoji, { color: theme.text }]}>
                    {emoji}
                  </Text>
                  <Text style={[styles.moodSummaryCount, { color: theme.placeholder }]}>
                    {count}
                  </Text>
                </View>
              ))}
          </View>
        ) : null}
      </View>

      <View
        style={[
          styles.searchCard,
          { backgroundColor: theme.input, borderColor: theme.placeholder },
        ]}
      >
        <Ionicons
          name="search"
          size={18}
          color={theme.placeholder}
          style={styles.searchIcon}
        />
        <RNTextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t('journal.searchPlaceholder', 'Search your entries')}
          placeholderTextColor={theme.placeholder}
          style={[styles.searchInput, { color: theme.text }]}
          returnKeyType="search"
          accessibilityLabel={t('journal.searchPlaceholder', 'Search your entries')}
          autoCorrect={false}
        />
        {searchQuery.length ? (
          <TouchableOpacity
            onPress={() => setSearchQuery('')}
            accessibilityRole="button"
            accessibilityLabel={t('journal.clearSearch', 'Clear search')}
            style={styles.searchClear}
          >
            <Ionicons name="close-circle" size={18} color={theme.placeholder} />
          </TouchableOpacity>
        ) : null}
      </View>

      {hasSearch ? (
        <Text style={[styles.searchMeta, { color: theme.placeholder }]}>
          {filteredEntries.length
            ? t('journal.searchResults', {
                count: filteredEntries.length,
                total: entries.length,
              })
            : t('journal.searchEmpty', { query: searchQuery })}
        </Text>
      ) : null}

      <View
        style={[
          styles.composerCard,
          { backgroundColor: theme.input, borderColor: theme.placeholder },
        ]}
      >
        {usePrompt ? (
          <View style={styles.promptCard}>
            <View style={styles.promptHeader}>
              <Text style={[styles.promptTitle, { color: theme.text }]}>
                {t('journal.promptTitle', 'Daily prompt')}
              </Text>
              <TouchableOpacity onPress={requestNewPrompt}>
                <Text style={[styles.promptRefresh, { color: theme.tint }]}>
                  {t('journal.promptRefresh', 'Give me a different prompt')}
                </Text>
              </TouchableOpacity>
            </View>
            <Animated.View style={{ opacity: promptOpacity }}>
              <Text style={[styles.promptText, { color: theme.text }]}>
                {prompt}
              </Text>
            </Animated.View>
          </View>
        ) : null}

        <View style={styles.moodHeaderRow}>
          <Text style={[styles.moodLabel, { color: theme.placeholder }]}>
            {t('journal.moodLabel', 'Mood')}
          </Text>
          <TouchableOpacity onPress={() => setUsePrompt((p: boolean) => !p)}>
            <Text style={[styles.togglePromptLink, { color: theme.tint }]}>
              {usePrompt
                ? t('journal.toggleFreeform', 'Switch to freeform')
                : t('journal.togglePrompt', 'Use prompt')}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.moodRow}>
          {MOODS.map((m) => {
            const selected = mood === m;
            return (
              <TouchableOpacity
                key={m}
                onPress={() => setMood(m)}
                style={[
                  styles.moodChip,
                  {
                    backgroundColor: selected ? theme.tint : theme.background,
                    borderColor: selected ? theme.tint : theme.placeholder,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={t('journal.selectMood', 'Select mood')}
              >
                <Text
                  style={[styles.moodChipText, { color: selected ? theme.background : theme.text }]}
                >
                  {m}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <ForwardedTextInput
          ref={inputRef}
          style={[
            styles.input,
            {
              backgroundColor: theme.background,
              borderColor: theme.placeholder,
              color: theme.text,
            },
          ]}
          placeholder={t('journal.placeholder', 'Write your thoughts')}
          placeholderTextColor={theme.placeholder}
          value={entry}
          onChangeText={setEntry}
          multiline
        />

        <TouchableOpacity
          style={[styles.button, { backgroundColor: theme.tint }]}
          onPress={handlePost}
        >
          <Text style={[styles.buttonText, { color: theme.background }]}>
            {t('journal.saveEntry', 'Save entry')}
          </Text>
        </TouchableOpacity>
      </View>

      <View
        style={[
          styles.insightsCard,
          { backgroundColor: theme.input, borderColor: theme.placeholder },
        ]}
        accessible
        accessibilityLabel={t('journal.weeklyInsightsAccessibility', 'Weekly journaling insights')}
      >
        <Text style={[styles.insightsTitle, { color: theme.text }]}>
          {t('journal.weeklyInsightsTitle', 'Weekly insights')}
        </Text>
        <Text style={[styles.insightsInfo, { color: theme.text }]}>
          {weeklyInsights.entries > 0
            ? t('journal.weeklyEntries', {
                count: weeklyInsights.entries,
              })
            : t('journal.weeklyEmpty', 'No entries yet this week — start a new reflection!')}
        </Text>
        {weeklyInsights.topMood ? (
          <Text style={[styles.insightsHighlight, { color: theme.tint }]}>
            {t('journal.topMood', { mood: weeklyInsights.topMood })}
          </Text>
        ) : null}
        {weeklyInsights.avgLength > 0 ? (
          <Text style={[styles.insightsMeta, { color: theme.placeholder }]}>
            {t('journal.avgLength', { chars: weeklyInsights.avgLength })}
          </Text>
        ) : null}
      </View>
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background }]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <FlatList
          data={filteredEntries}
          keyExtractor={(item) => item.id}
          renderItem={renderEntry}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={
            filteredEntries.length === 0 ? (
              hasSearch ? (
                <View style={styles.emptyState}>
                  <Text style={[styles.emptyStateText, { color: theme.placeholder }]}>
                    {t('journal.searchEmpty', { query: searchQuery })}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setSearchQuery('')}
                    style={[styles.emptyAction, { borderColor: theme.placeholder }]}
                  >
                    <Text style={[styles.emptyActionText, { color: theme.text }]}>
                      {t('journal.clearSearch', 'Clear search')}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.emptyState}>
                  <Text style={[styles.emptyStateText, { color: theme.placeholder }]}>
                    {t(
                      'journal.emptyState',
                      'Your journal is waiting for its first entry.',
                    )}
                  </Text>
                  <TouchableOpacity
                    onPress={() => inputRef.current?.focus()}
                    style={[styles.emptyAction, { borderColor: theme.placeholder }]}
                  >
                    <Text style={[styles.emptyActionText, { color: theme.text }]}>
                      {t('journal.emptyStateCta', 'Write something now')}
                    </Text>
                  </TouchableOpacity>
                </View>
              )
            ) : null
          }
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
        />
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
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 140,
  },
  headerSpacing: {
    gap: 20,
    marginBottom: 24,
  },
  heroCard: {
    padding: 20,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 14,
  },
  heroGreeting: {
    fontSize: 22,
    fontWeight: '700',
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  streakPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  streakText: {
    fontSize: 13,
    fontWeight: '600',
  },
  heroStatsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  searchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  searchIcon: {
    marginRight: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },
  searchClear: {
    padding: 4,
  },
  searchMeta: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  heroStat: {
    flex: 1,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  heroStatValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  heroStatLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  moodSummaryWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  moodSummaryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  moodSummaryEmoji: {
    fontSize: 16,
  },
  moodSummaryCount: {
    fontSize: 12,
    fontWeight: '600',
  },
  composerCard: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    gap: 16,
  },
  promptCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 8,
  },
  promptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  promptTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  promptRefresh: {
    fontSize: 13,
    fontWeight: '600',
  },
  promptText: {
    fontSize: 14,
    lineHeight: 20,
  },
  moodHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  moodLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  togglePromptLink: {
    fontSize: 13,
    fontWeight: '600',
  },
  moodRow: {
    flexDirection: 'row',
    gap: 12,
  },
  moodChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  moodChipText: {
    fontSize: 16,
  },
  input: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
    paddingHorizontal: 14,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  button: {
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  insightsCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    gap: 8,
  },
  insightsTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  insightsInfo: {
    fontSize: 14,
    lineHeight: 20,
  },
  insightsHighlight: {
    fontSize: 14,
    fontWeight: '600',
  },
  insightsMeta: {
    fontSize: 12,
  },
  entryCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    marginBottom: 16,
    gap: 10,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  entryMood: {
    fontSize: 18,
  },
  entryDate: {
    fontSize: 12,
  },
  entryPrompt: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  entryText: {
    fontSize: 14,
    lineHeight: 20,
  },
  entryActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
  },
  entryActionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 40,
    gap: 12,
  },
  emptyStateText: {
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 12,
  },
  emptyAction: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  emptyActionText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
