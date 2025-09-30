import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TextInput,
  Image,
  TouchableOpacity,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthSession } from '@/contexts/AuthSessionContext';
import { useTranslation } from '@/contexts/I18nContext';
import { listenThreads, getOrCreateThread, findUserIdByDisplayName, DMThreadWithId } from '@/services/dm';
import { useRouter } from 'expo-router';
import { db } from '@/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { formatDistanceToNow } from 'date-fns';

export default function MessagesIndex() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const router = useRouter();
  const [threads, setThreads] = useState<DMThreadWithId[]>([]);
  const [queryName, setQueryName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const profileSubs = useRef<Record<string, () => void>>({});

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = listenThreads(user.uid, setThreads);
    return unsub;
  }, [user?.uid]);

  // Subscribe to profile docs for other participants
  useEffect(() => {
    const others = Array.from(
      new Set(
        threads
          .map((t: any) => (t.participants || []).find((p: string) => p !== user?.uid))
          .filter(Boolean) as string[],
      ),
    );
    others.forEach((uid) => {
      if (!uid || profileSubs.current[uid]) return;
      profileSubs.current[uid] = onSnapshot(doc(db, 'users', uid), (snap) => {
        setProfiles((prev) => ({ ...prev, [uid]: snap.data() || {} }));
      });
    });
    Object.keys(profileSubs.current).forEach((uid) => {
      if (!others.includes(uid)) {
        profileSubs.current[uid]?.();
        delete profileSubs.current[uid];
      }
    });
  }, [threads, user?.uid]);

  useEffect(() => () => {
    Object.values(profileSubs.current).forEach((unsub) => unsub?.());
    profileSubs.current = {};
  }, []);

  const filteredThreads = useMemo(() => {
    const q = queryName.trim().replace(/^@/, '').toLowerCase();
    if (!q) return threads;
    return threads.filter((thread) => {
      const other = (thread.participants || []).find((p: string) => p !== user?.uid);
      const prof = other ? profiles[other] : undefined;
      const displayName = (prof?.displayName || other || '').toLowerCase();
      return displayName.includes(q);
    });
  }, [threads, queryName, profiles, user?.uid]);

  const quickRecipients = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    threads.forEach((thread) => {
      const other = (thread.participants || []).find((p: string) => p !== user?.uid);
      if (!other || seen.has(other)) return;
      const prof = profiles[other];
      const label = prof?.displayName || other;
      if (label) {
        seen.add(other);
        list.push(label);
      }
    });
    return list.slice(0, 5);
  }, [threads, profiles, user?.uid]);

  const startDisabled = queryName.trim().length === 0;

  const isThreadUnread = useCallback(
    (thread: DMThreadWithId) => {
      try {
        const last = thread.updatedAt as any;
        const receipts = (thread.readReceipts || {})[user?.uid || ''] as any;
        const lastMs = last?.toMillis ? last.toMillis() : last?.seconds ? last.seconds * 1000 : 0;
        const receiptsMs = receipts?.toMillis
          ? receipts.toMillis()
          : receipts?.seconds
            ? receipts.seconds * 1000
            : 0;
        return lastMs > receiptsMs;
      } catch {
        return false;
      }
    },
    [user?.uid],
  );

  const unreadCount = useMemo(
    () => threads.filter((thread) => isThreadUnread(thread)).length,
    [isThreadUnread, threads],
  );

  const startDm = useCallback(async () => {
    setError(null);
    try {
      if (!user?.uid) return;
      const target = queryName.trim().replace(/^@/, '');
      if (!target) return;
      const otherUid = await findUserIdByDisplayName(target);
      if (!otherUid) {
        setError(t('messages.userNotFound', 'User not found'));
        return;
      }
      const id = await getOrCreateThread(user.uid, otherUid);
      router.push(`/messages/${id}`);
    } catch (e: any) {
      setError(e?.message || 'Failed to start DM');
    }
  }, [queryName, router, t, user?.uid]);

  const handleOpenThread = useCallback(
    (id: string) => {
      router.push(`/messages/${id}`);
    },
    [router],
  );

  const openNotifications = useCallback(() => {
    router.push('/(tabs)/messages/notifications');
  }, [router]);

  const renderHeader = useCallback(() => (
    <View style={styles.headerSpacing}>
      <View
        style={[
          styles.heroCard,
          { backgroundColor: theme.input, borderColor: theme.placeholder },
        ]}
      >
        <View style={styles.heroHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.heroTitle, { color: theme.text }]}>
              {t('messages.title', 'Direct Messages')}
            </Text>
            <Text style={[styles.heroSubtitle, { color: theme.placeholder }]}>
              {t('messages.heroSubtitle', 'Stay in touch with people you follow.')}
            </Text>
          </View>
          <TouchableOpacity
            onPress={openNotifications}
            style={[
              styles.heroAction,
              {
                backgroundColor: theme.background,
                borderColor: theme.placeholder,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('messages.openNotifications', 'Open notifications')}
          >
            <Ionicons name="notifications-outline" size={18} color={theme.tint} />
          </TouchableOpacity>
        </View>
        <View style={styles.heroStatsRow}>
          <View
            style={[
              styles.heroStatCard,
              { borderColor: theme.placeholder },
            ]}
          >
            <Text style={[styles.heroStatValue, { color: theme.text }]}>
              {threads.length}
            </Text>
            <Text style={[styles.heroStatLabel, { color: theme.placeholder }]}>
              {t('messages.statThreads', 'Threads')}
            </Text>
          </View>
          <View
            style={[
              styles.heroStatCard,
              { borderColor: theme.placeholder },
            ]}
          >
            <Text style={[styles.heroStatValue, { color: theme.text }]}>
              {unreadCount}
            </Text>
            <Text style={[styles.heroStatLabel, { color: theme.placeholder }]}>
              {t('messages.statUnread', 'Unread')}
            </Text>
          </View>
        </View>
      </View>

      <View
        style={[
          styles.searchCard,
          { backgroundColor: theme.input, borderColor: theme.placeholder },
        ]}
      >
        <Text style={[styles.searchLabel, { color: theme.placeholder }]}>
          {t('messages.searchLabel', 'Start a conversation')}
        </Text>
        <View style={styles.searchRow}>
          <TextInput
            placeholder={t('messages.startWith', 'Start DM with @displayName')}
            placeholderTextColor={theme.placeholder}
            style={[
              styles.searchInput,
              {
                backgroundColor: theme.background,
                borderColor: theme.placeholder,
                color: theme.text,
              },
            ]}
            value={queryName}
            onChangeText={setQueryName}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          <TouchableOpacity
            onPress={startDm}
            disabled={startDisabled}
            style={[
              styles.startButton,
              {
                backgroundColor: startDisabled ? theme.placeholder : theme.tint,
              },
              startDisabled && styles.startButtonDisabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('messages.start', 'Start')}
          >
            <Text
              style={[
                styles.startButtonText,
                { color: startDisabled ? theme.background : theme.background },
              ]}
            >
              {t('messages.start', 'Start')}
            </Text>
          </TouchableOpacity>
        </View>
        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : (
          <Text style={[styles.searchHint, { color: theme.placeholder }]}>
            {t('messages.startHint', 'Type a @username to begin')}
          </Text>
        )}
        {quickRecipients.length > 0 ? (
          <View style={styles.quickSection}>
            <Text style={[styles.quickLabel, { color: theme.placeholder }]}>
              {t('messages.quickHeader', 'Quick start')}
            </Text>
            <View style={styles.quickWrap}>
              {quickRecipients.map((label) => (
                <TouchableOpacity
                  key={label}
                  style={[
                    styles.quickChip,
                    {
                      borderColor: theme.placeholder,
                      backgroundColor: theme.background,
                    },
                  ]}
                  onPress={() => setQueryName(`@${label}`)}
                >
                  <Text style={[styles.quickChipText, { color: theme.tint }]}>@{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </View>
  ), [
    error,
    openNotifications,
    quickRecipients,
    queryName,
    startDisabled,
    startDm,
    t,
    theme.background,
    theme.input,
    theme.placeholder,
    theme.text,
    theme.tint,
    threads.length,
    unreadCount,
  ]);

  const renderItem = useCallback(({ item }: { item: DMThreadWithId }) => {
    const other = (item.participants || []).find((p: string) => p !== user?.uid);
    const prof = other ? profiles[other] : undefined;
    const name = prof?.displayName || other;
    const avatar = prof?.photoURL as string | undefined;
    const unread = isThreadUnread(item);
    const updated: any = item.updatedAt;
    const updatedMs = updated?.toMillis ? updated.toMillis() : updated?.seconds ? updated.seconds * 1000 : null;
    const relativeTime = updatedMs
      ? formatDistanceToNow(new Date(updatedMs), { addSuffix: true })
      : t('messages.noMessages', 'No messages yet');

    return (
      <TouchableOpacity
        onPress={() => handleOpenThread(item.id)}
        style={[
          styles.item,
          {
            backgroundColor: theme.input,
            borderColor: unread ? theme.tint : theme.placeholder,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={t('messages.openChatWith', 'Open chat with {{name}}', { name })}
      >
        <View style={styles.profileRow}>
          {avatar ? (
            <Image source={{ uri: avatar }} style={styles.avatar} />
          ) : (
            <View style={[styles.placeholder, { backgroundColor: theme.background }]} />
          )}
          <View style={{ flex: 1, gap: 2 }}>
            <View style={styles.nameRow}>
              <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
                {name}
              </Text>
              {unread ? <View style={[styles.unreadDot, { backgroundColor: theme.tint }]} /> : null}
            </View>
            <Text style={[styles.timestamp, { color: theme.placeholder }]}>{relativeTime}</Text>
          </View>
        </View>
        <Text style={[styles.preview, { color: theme.placeholder }]} numberOfLines={1}>
          {item.lastMessage || t('messages.noMessages', 'No messages yet')}
        </Text>
      </TouchableOpacity>
    );
  }, [handleOpenThread, isThreadUnread, profiles, theme.input, theme.background, theme.text, theme.placeholder, theme.tint, t, user?.uid]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <FlatList
          data={filteredThreads}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>
                {t('messages.emptyTitle', 'No conversations yet')}
              </Text>
              <Text style={[styles.emptySubtitle, { color: theme.placeholder }]}>
                {t(
                  'messages.emptySubtitle',
                  'Send your first direct message to stay in touch with your favorite wishers.',
                )}
              </Text>
            </View>
          }
          ListFooterComponent={<View style={{ height: 32 }} />}
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
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 120,
  },
  headerSpacing: {
    marginBottom: 16,
  },
  heroCard: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    marginBottom: 16,
  },
  heroHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  heroAction: {
    padding: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  heroStatsRow: {
    flexDirection: 'row',
    marginTop: 4,
    marginHorizontal: -6,
  },
  heroStatCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginHorizontal: 6,
  },
  heroStatValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  heroStatLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 4,
  },
  searchCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    marginBottom: 8,
  },
  searchLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  searchInput: {
    flex: 1,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  startButton: {
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginLeft: 8,
  },
  startButtonDisabled: {
    opacity: 0.6,
  },
  startButtonText: {
    fontWeight: '700',
    fontSize: 14,
  },
  searchHint: {
    fontSize: 12,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ef4444',
  },
  quickSection: {
    marginTop: 12,
  },
  quickLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  quickWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  quickChip: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginRight: 8,
    marginBottom: 8,
  },
  quickChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  item: {
    padding: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 16,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    marginRight: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontWeight: '600',
    fontSize: 15,
    flexShrink: 1,
    marginRight: 8,
  },
  timestamp: {
    fontSize: 12,
  },
  preview: {
    fontSize: 13,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  placeholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
