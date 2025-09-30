import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { db, storage } from '@/firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthSession } from '@/contexts/AuthSessionContext';
import { useTranslation } from '@/contexts/I18nContext';
import { listenMessages, sendMessage, markThreadRead, DMMessageWithId, listenTyping, setTyping } from '@/services/dm';
import * as Clipboard from 'expo-clipboard';
// (combined with storage above)
import { doc, onSnapshot } from 'firebase/firestore';

const STARTER_SUGGESTIONS = [
  'What sparked this wish for you?',
  'Want to brainstorm support together?',
  'How are you feeling about this today?',
  'Any wins you want to celebrate?',
];

export default function MessageThread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const { user } = useAuthSession();
  const { t } = useTranslation();
  const router = useRouter();
  const [messages, setMessages] = useState<DMMessageWithId[]>([]);
  const [text, setText] = useState('');
  const listRef = useRef<FlatList<DMMessageWithId>>(null);
  const [typing, setTypingState] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [otherUid, setOtherUid] = useState<string | null>(null);
  const [otherProfile, setOtherProfile] = useState<{ displayName?: string; photoURL?: string } | null>(null);
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [lastSeenMs, setLastSeenMs] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingImageUri, setPendingImageUri] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<DMMessageWithId | null>(null);
  const starterSuggestions = React.useMemo(() => {
    const personalized = otherProfile?.displayName
      ? [`Hey ${otherProfile.displayName}, want to collaborate on this?`, ...STARTER_SUGGESTIONS]
      : STARTER_SUGGESTIONS;
    const seen = new Set<string>();
    const unique = personalized.filter((line) => {
      if (seen.has(line)) return false;
      seen.add(line);
      return true;
    });
    return unique.slice(0, 3);
  }, [otherProfile?.displayName]);

  useEffect(() => {
    if (!id) return;
    const unsub = listenMessages(String(id), setMessages);
    return unsub;
  }, [id]);

  useEffect(() => {
    if (!id || !user?.uid) return;
    void markThreadRead(String(id), user.uid);
  }, [id, user?.uid, messages.length]);

  useEffect(() => {
    if (!id || !user?.uid) return;
    const unsub = listenTyping(String(id), (map) => {
      const others = Object.entries(map).filter(([k, v]) => k !== user.uid && v.typing);
      setTypingState(others.length > 0);
    });
    return unsub;
  }, [id, user?.uid]);
  useEffect(() => {
    if (!id || !user?.uid) return;
    const ref = doc(db, 'dmThreads', String(id));
    const unsub = onSnapshot(ref, (snap) => {
      const data: any = snap.data() || {};
      const parts: string[] = data.participants || [];
      const other = parts.find((p) => p && p !== user.uid) || null;
      setOtherUid(other);
      try {
        const rr = data.readReceipts?.[other || ''];
        const ms = rr?.toMillis ? rr.toMillis() : rr?.seconds ? rr.seconds * 1000 : null;
        if (ms) {
          const time = new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          setLastSeen(time);
          setLastSeenMs(ms);
        } else {
          setLastSeen(null);
          setLastSeenMs(null);
        }
      } catch { setLastSeen(null); }
    });
    return unsub;
  }, [id, user?.uid]);
  useEffect(() => {
    if (!otherUid) return;
    const ref = doc(db, 'users', otherUid);
    const unsub = onSnapshot(ref, (snap) => setOtherProfile((snap.data() as any) || {}));
    return unsub;
  }, [otherUid]);

  useEffect(() => {
    // Auto-scroll to bottom on new messages
    listRef.current?.scrollToEnd({ animated: true });
  }, [messages.length]);

  const onSend = useCallback(async () => {
    if (!id || !user?.uid) return;
    const value = text.trim();
    if (!value && !pendingImageUri) return;
    setText('');
    try {
      let imageUrl: string | undefined;
      if (pendingImageUri) {
        setUploading(true);
        const resp = await fetch(pendingImageUri);
        const blob = await resp.blob();
        const r = storageRef(storage, `dm/${id}/${Date.now()}`);
        await uploadBytes(r, blob);
        imageUrl = await getDownloadURL(r);
      }
      await sendMessage(
        String(id),
        user.uid,
        value,
        imageUrl,
        replyTo
          ? {
              id: replyTo.id,
              senderId: replyTo.senderId,
              text: replyTo.text,
              imageUrl: (replyTo as any).imageUrl,
            }
          : undefined,
      );
      setPendingImageUri(null);
      setReplyTo(null);
      try { await setTyping(String(id), user.uid, false); } catch {}
    } finally {
      setUploading(false);
    }
  }, [text, id, user?.uid, pendingImageUri, replyTo]);

  const onPickImage = useCallback(async () => {
    if (!id || !user?.uid) return;
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsMultipleSelection: false, quality: 0.8 });
    if (res.canceled || !res.assets?.length) return;
    const uri = res.assets[0].uri;
    setUploading(true);
    try {
      const resp = await fetch(uri);
      const blob = await resp.blob();
      const r = storageRef(storage, `dm/${id}/${Date.now()}`);
      await uploadBytes(r, blob);
      const url = await getDownloadURL(r);
      await sendMessage(String(id), user.uid, '', url);
    } finally {
      setUploading(false);
    }
  }, [id, user?.uid]);

  const onTakePhoto = useCallback(async () => {
    if (!id || !user?.uid) return;
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (!granted) return;
    const res = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (res.canceled || !res.assets?.length) return;
    const uri = res.assets[0].uri;
    setUploading(true);
    try {
      const resp = await fetch(uri);
      const blob = await resp.blob();
      const r = storageRef(storage, `dm/${id}/${Date.now()}`);
      await uploadBytes(r, blob);
      const url = await getDownloadURL(r);
      await sendMessage(String(id), user.uid, '', url);
    } finally {
      setUploading(false);
    }
  }, [id, user?.uid]);

  const renderItem = useCallback(
    ({ item }: { item: DMMessageWithId }) => {
      const mine = item.senderId === user?.uid;
      const ts: any = item.timestamp as any;
      const ms = ts?.toMillis ? ts.toMillis() : ts?.seconds ? ts.seconds * 1000 : undefined;
      const time = ms ? new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      const read = mine && lastSeenMs ? (ms ? ms <= lastSeenMs : false) : false;
      return (
        <View style={[styles.row, mine ? { justifyContent: 'flex-end' } : { justifyContent: 'flex-start' }]}> 
          <TouchableOpacity
            style={[
              styles.bubble,
              { backgroundColor: mine ? theme.tint : theme.input, alignSelf: mine ? 'flex-end' : 'flex-start' },
            ]}
            onLongPress={async () => { try { await Clipboard.setStringAsync(item.text || ''); } catch {} }}
            onPress={() => setReplyTo(item)}
          >
            {item.replyToId && (
              <View style={{ borderLeftWidth: 2, borderLeftColor: theme.placeholder, paddingLeft: 6, marginBottom: 6 }}>
                <Text style={{ color: theme.placeholder, fontSize: 12 }}>↩︎ {item.replyToText || (item.replyToImageUrl ? '[photo]' : '')}</Text>
              </View>
            )}
            {item.imageUrl ? (
              <Image source={{ uri: item.imageUrl }} style={{ width: 180, height: 180, borderRadius: 8, marginBottom: item.text ? 6 : 0 }} />
            ) : null}
            {item.text ? <Text style={{ color: theme.text }}>{item.text}</Text> : null}
            {!!time && (
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 6, marginTop: 4 }}>
                <Text style={{ color: theme.placeholder, fontSize: 11 }}>{time}</Text>
                {mine && (
                  <Text style={{ color: theme.placeholder, fontSize: 11 }}>{read ? '✓✓' : '✓'}</Text>
                )}
              </View>
            )}
          </TouchableOpacity>
        </View>
      );
    },
    [theme.tint, theme.input, theme.text, theme.placeholder, user?.uid, lastSeenMs],
  );

  const keyExtractor = useCallback((m: DMMessageWithId) => m.id, []);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}
    >
      <View style={[styles.header, { borderBottomColor: theme.input }]}> 
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: theme.tint }}>{t('common.cancel', 'Cancel')}</Text>
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {otherProfile?.photoURL ? (
              <Image source={{ uri: otherProfile.photoURL }} style={{ width: 24, height: 24, borderRadius: 12 }} />
            ) : null}
            <Text style={{ color: theme.text, fontWeight: '700' }}>
              {otherProfile?.displayName || otherUid || ''}
            </Text>
          </View>
          {lastSeen && (
            <Text style={{ color: theme.placeholder, fontSize: 11 }}>
              {t('messages.lastSeen', 'Last seen {{time}}', { time: lastSeen })}
            </Text>
          )}
        </View>
        <View style={{ width: 60 }} />
      </View>
      
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 12, paddingBottom: 8 }}
      />
      {messages.length < 6 && starterSuggestions.length > 0 && (
        <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
          <Text style={{ color: theme.placeholder, fontSize: 12, marginBottom: 6 }}>
            Ice breakers
          </Text>
          <View style={styles.starterRow}>
            {starterSuggestions.map((line) => (
              <TouchableOpacity
                key={line}
                onPress={() => setText((prev) => (prev ? `${prev} ${line}` : line))}
                style={[styles.starterChip, { backgroundColor: theme.input }]}
              >
                <Text style={{ color: theme.tint }}>{line}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
      <View style={[styles.inputBar, { backgroundColor: theme.input }]}> 
        <TextInput
          style={[styles.textInput, { color: theme.text }]}
          placeholder={t('messages.type', 'Type a message')}
          placeholderTextColor={theme.placeholder}
          value={text}
          onChangeText={(v) => {
            setText(v);
            if (id && user?.uid) {
              try { void setTyping(String(id), user.uid, true); } catch {}
              if (typingTimer.current) clearTimeout(typingTimer.current);
              typingTimer.current = setTimeout(() => {
                try { void setTyping(String(id!), user!.uid, false); } catch {}
              }, 1500);
            }
          }}
          onSubmitEditing={onSend}
          returnKeyType="send"
        />
        <TouchableOpacity onPress={onTakePhoto} style={{ paddingHorizontal: 8 }}>
          <Text style={{ color: theme.tint }}>📷</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onPickImage} style={{ paddingHorizontal: 8 }}>
          <Text style={{ color: theme.tint }}>📎</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onSend} disabled={(!text.trim() && !pendingImageUri) || uploading}>
          <Text style={{ color: text.trim() ? theme.tint : theme.placeholder }}>{t('messages.start', 'Start')}</Text>
        </TouchableOpacity>
      </View>
      {(replyTo || pendingImageUri) && (
        <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
          {replyTo && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Text style={{ color: theme.placeholder, fontSize: 12 }}>↩︎ {replyTo.text || ((replyTo as any).imageUrl ? '[photo]' : '')}</Text>
              <TouchableOpacity onPress={() => setReplyTo(null)}>
                <Text style={{ color: theme.tint }}>{t('common.cancel', 'Cancel')}</Text>
              </TouchableOpacity>
            </View>
          )}
          {pendingImageUri && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Image source={{ uri: pendingImageUri }} style={{ width: 48, height: 48, borderRadius: 6 }} />
              <TouchableOpacity onPress={() => setPendingImageUri(null)}>
                <Text style={{ color: theme.tint }}>{t('common.cancel', 'Cancel')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
      {uploading && (
        <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
          <Text style={{ color: theme.placeholder }}>{t('messages.uploading', 'Uploading...')}</Text>
        </View>
      )}
      {typing && (
        <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
          <Text style={{ color: theme.placeholder }}>{t('messages.typing', 'Typing...')}</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: { flexDirection: 'row', marginBottom: 8 },
  bubble: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, maxWidth: '80%' },
  inputBar: { paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  textInput: { flex: 1, padding: 10 },
  starterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  starterChip: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 12 },
});
