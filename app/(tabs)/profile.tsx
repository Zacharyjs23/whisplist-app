import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
  Animated,
  Switch,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ConfettiCannon from 'react-native-confetti-cannon';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { collection, getDocs, query, where, orderBy, collectionGroup } from 'firebase/firestore';
import { db } from '../../firebase';
import type { Wish } from '../../types/Wish';
import { useSavedWishes } from '@/contexts/SavedWishesContext';

export default function Page() {
  const { user, profile, updateProfile, pickImage, signOut } = useAuth();
  const router = useRouter();
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [saving, setSaving] = useState(false);
  const [boostCount, setBoostCount] = useState(0);
  const [latestBoost, setLatestBoost] = useState<Wish | null>(null);
  const [streakCount, setStreakCount] = useState(0);
  const [dailyPrompt, setDailyPrompt] = useState<string | null>(null);
  const [latestWish, setLatestWish] = useState<Wish | null>(null);
  const [reflectionHistory, setReflectionHistory] = useState<
    { text: string; timestamp: number }[]
  >([]);
  const [boostImpact, setBoostImpact] = useState({ likes: 0, comments: 0 });
  const [giftStats, setGiftStats] = useState({ count: 0, total: 0 });
  const [giftMessages, setGiftMessages] = useState<{ text: string; ts: any }[]>([]);
  const [savedList, setSavedList] = useState<Wish[]>([]);
  const [dailyReminder, setDailyReminder] = useState(false);
  const [showSparkle, setShowSparkle] = useState(false);
  const [referralCount, setReferralCount] = useState(0);
  const prevCredits = useRef<number | null>(profile?.boostCredits ?? null);
  const boostAnim = useRef(new Animated.Value(1)).current;
  const { theme } = useTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);

  const handleSave = async () => {
    setSaving(true);
    await updateProfile({ displayName, bio });
    setSaving(false);
  };

  const handleImage = async () => {
    await pickImage();
  };

  const handleCopyLink = async () => {
    if (!profile?.displayName) return;
    const url = Linking.createURL(`/profile/${profile.displayName}`);
    await Clipboard.setStringAsync(url);
  };

  const toggleReminder = async (val: boolean) => {
    setDailyReminder(val);
    await AsyncStorage.setItem('dailyPromptReminder', val ? 'true' : 'false');
    const id = await AsyncStorage.getItem('dailyPromptReminderId');
    if (id) await Notifications.cancelScheduledNotificationAsync(id);
    if (val) {
      const newId = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'WhispList',
          body: 'Time to post your wish for today!',
        },
        trigger: { hour: 9, minute: 0, repeats: true },
      });
      await AsyncStorage.setItem('dailyPromptReminderId', newId);
    }
  };

  useEffect(() => {
    const load = async () => {
      if (!user?.uid) return;
      const snap = await getDocs(
        query(collection(db, 'wishes'), where('userId', '==', user.uid), orderBy('timestamp', 'desc'))
      );
      const list = snap.docs
        .map(d => ({ id: d.id, ...(d.data() as Omit<Wish, 'id'>) }))
        .filter(w => !w.expiresAt || (w.expiresAt.toDate ? w.expiresAt.toDate() : w.expiresAt) > new Date()) as Wish[];
      const active = list.filter(
        w => w.boostedUntil && w.boostedUntil.toDate && w.boostedUntil.toDate() > new Date()
      );
      setBoostCount(active.length);
      if (active.length > 0) {
        active.sort((a, b) =>
          a.boostedUntil.toDate() < b.boostedUntil.toDate() ? 1 : -1
        );
        setLatestBoost(active[0]);
      } else {
        setLatestBoost(null);
      }
      if (list.length > 0) {
        setLatestWish(list[0]);
      }

      const boosted = list.filter(w => w.boosted != null);
      const totalBoosts = boosted.length;
      if ([5, 10, 20].includes(totalBoosts)) {
        setShowSparkle(true);
        setTimeout(() => setShowSparkle(false), 3000);
      }
      let likes = 0;
      let comments = 0;
      for (const w of boosted) {
        likes += w.likes || 0;
        try {
          const cSnap = await getDocs(collection(db, 'wishes', w.id, 'comments'));
          comments += cSnap.size;
        } catch (err) {
          console.error('Failed to count comments', err);
        }
      }
      setBoostImpact({ likes, comments });
    };
    load();
  }, [user]);

  useEffect(() => {
    if (boostCount <= 0) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(boostAnim, { toValue: 1.2, duration: 800, useNativeDriver: true }),
        Animated.timing(boostAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [boostCount]);

  useEffect(() => {
    const loadLocal = async () => {
      const streak = await AsyncStorage.getItem('streakCount');
      if (streak) setStreakCount(parseInt(streak, 10));
      const prompt = await AsyncStorage.getItem('dailyPromptText');
      if (prompt) setDailyPrompt(prompt);
      const historyRaw = await AsyncStorage.getItem('reflectionHistory');
      if (historyRaw) setReflectionHistory(JSON.parse(historyRaw));
      const reminder = await AsyncStorage.getItem('dailyPromptReminder');
      setDailyReminder(reminder === 'true');
    };
    loadLocal();
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    const loadReferrals = async () => {
      const snap = await getDocs(query(collection(db, 'referrals'), where('referrerId', '==', user.uid)));
      setReferralCount(snap.size);
    };
    loadReferrals();
  }, [user]);

  useEffect(() => {
    if (!user?.uid) return;
    const loadGifts = async () => {
      const snap = await getDocs(query(collectionGroup(db, 'gifts'), where('recipientId', '==', user.uid)));
      let count = 0;
      let total = 0;
      const msgs: { text: string; ts: any }[] = [];
      snap.forEach(d => {
        count += 1;
        total += d.data().amount || 0;
        if (d.data().message) {
          msgs.push({ text: d.data().message, ts: d.data().timestamp });
        }
      });
      setGiftStats({ count, total });
      msgs.sort((a, b) => (b.ts?.seconds || 0) - (a.ts?.seconds || 0));
      setGiftMessages(msgs);
    };
    loadGifts();
  }, [user]);

  const { saved } = useSavedWishes();

  useEffect(() => {
    const load = async () => {
      if (!user?.uid) return;
      const list: Wish[] = [];
      for (const id of Object.keys(saved)) {
        const docSnap = await getDocs(query(collection(db, 'wishes'), where('__name__', '==', id)));
        docSnap.forEach(d => {
          list.push({ id: d.id, ...(d.data() as Omit<Wish, 'id'>) });
        });
      }
      list.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
      setSavedList(list);
    };
    load();
  }, [saved, user]);

  useEffect(() => {
    if (profile?.boostCredits != null && prevCredits.current != null && profile.boostCredits > prevCredits.current) {
      setShowSparkle(true);
      setTimeout(() => setShowSparkle(false), 3000);
    }
    prevCredits.current = profile?.boostCredits ?? null;
  }, [profile?.boostCredits]);

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={boostCount > 0 || streakCount >= 7 ? styles.avatarGlow : undefined}>
        {profile?.photoURL ? (
          <Image source={{ uri: profile.photoURL }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: '#444' }]} />
        )}
      </View>
      {showSparkle && <ConfettiCannon count={30} origin={{ x: 0, y: 0 }} fadeOut />}
      <TouchableOpacity onPress={handleImage} style={styles.imageButton}>
        <Text style={styles.imageButtonText}>Change Photo</Text>
      </TouchableOpacity>

      <Text style={styles.label}>Display Name</Text>
      <TextInput
        style={styles.input}
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="Display Name"
        placeholderTextColor={theme.text}
      />

      <Text style={styles.label}>Bio</Text>
      <TextInput
        style={[styles.input, { height: 80 }]}
        value={bio}
        onChangeText={setBio}
        placeholder="Bio"
        placeholderTextColor={theme.text}
        multiline
      />
      <TouchableOpacity style={styles.button} onPress={handleSave} disabled={saving}>
        <Text style={styles.buttonText}>{saving ? 'Saving...' : 'Save Profile'}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.button, { marginBottom: 10 }]}
        onPress={() => router.push('/journal')}
      >
        <Text style={styles.buttonText}>Open Journal</Text>
      </TouchableOpacity>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔥 Boosts</Text>
        <Animated.Text
          style={[styles.boostCount, { transform: [{ scale: boostAnim }] }]}
        >
          You&apos;ve boosted {boostCount} wishes 🌟
        </Animated.Text>
        <Text style={styles.info}>
          Your boosts earned ❤️ {boostImpact.likes} likes, 💬 {boostImpact.comments} comments
        </Text>
        {latestBoost && (
          <View style={styles.boostPreview}>
            <Text style={styles.previewText} numberOfLines={2}>
              {latestBoost.text}
            </Text>
            <Text style={[styles.previewText, { color: theme.tint }]}>❤️ {latestBoost.likes}</Text>
          </View>
        )}
      </View>

      {streakCount > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📅 Streak</Text>
          <Text style={styles.info}>🔥 {streakCount}-day streak — you&apos;re on fire!</Text>
          {streakCount > 3 && <ConfettiCannon count={40} origin={{ x: 0, y: 0 }} fadeOut />}
        </View>
      )}

      {giftStats.count > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💝 Gifts</Text>
          <Text style={styles.info}>You&apos;ve received {giftStats.count} gifts 🎁 (${giftStats.total} total)</Text>
        </View>
      )}

      {giftMessages.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💌 Messages from Supporters</Text>
          {giftMessages.map((m, i) => (
            <Text key={i} style={styles.info}>
              {m.text}
            </Text>
          ))}
        </View>
      )}

      {referralCount > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🎁 Referrals</Text>
          <Text style={styles.info}>
            You&apos;ve invited {referralCount} people — max {Math.max(0, 4 - referralCount)} more to unlock another reward
          </Text>
        </View>
      )}

      {profile?.publicProfileEnabled && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🌐 Public Profile</Text>
          <Text style={styles.info}>@{profile.displayName}</Text>
          {profile.bio && <Text style={styles.info}>{profile.bio}</Text>}
          {latestWish && (
            <Text style={styles.previewText} numberOfLines={2}>
              {latestWish.text}
            </Text>
          )}
          <Text style={styles.info}>Your profile is public. This is what others see.</Text>
          <TouchableOpacity onPress={handleCopyLink} style={[styles.button, { marginTop: 10 }]}>
            <Text style={styles.buttonText}>Copy Link</Text>
          </TouchableOpacity>
          {profile.displayName && (
            <TouchableOpacity
              onPress={() => router.push(`/profile/${profile.displayName}`)}
              style={[styles.button, { marginTop: 10 }]}
            >
              <Text style={styles.buttonText}>Preview My Public Profile</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {reflectionHistory.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🧠 Your reflections this week</Text>
          {reflectionHistory.slice(0, 3).map((r, i) => (
            <Text key={i} style={styles.info}>
              {new Date(r.timestamp).toLocaleDateString()} — {r.text}
            </Text>
          ))}
        </View>
      )}

      {dailyPrompt && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🧠 Reflection</Text>
            <Text style={styles.info}>Yesterday, you said: &apos;{dailyPrompt}&apos;</Text>
        </View>
      )}

      {savedList.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔖 Saved</Text>
          {savedList.map((w) => (
            <TouchableOpacity
              key={w.id}
              onPress={() => router.push(`/wish/${w.id}`)}
              style={{ marginBottom: 6 }}
            >
              <Text style={styles.info}>{w.text}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>⏰ Daily Prompt Reminder</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={styles.info}>Remind me to post a wish daily</Text>
          <Switch value={dailyReminder} onValueChange={toggleReminder} />
        </View>
      </View>

      <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
      <Text style={styles.info}>Email: {user?.email || 'Anonymous'}</Text>
      {profile?.isAnonymous && <Text style={styles.info}>Logged in anonymously</Text>}
    </ScrollView>
  );
}

const createStyles = (c: (typeof Colors)['light'] & { name: string }) =>
  StyleSheet.create({
    container: {
      flex: 1,
      padding: 20,
    },
    avatar: {
      width: 100,
      height: 100,
      borderRadius: 50,
      alignSelf: 'center',
      marginBottom: 10,
    },
    avatarGlow: {
      shadowColor: c.tint,
      shadowOpacity: 0.9,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 0 },
      elevation: 10,
      borderRadius: 50,
    },
    imageButton: {
      alignSelf: 'center',
      marginBottom: 20,
    },
    imageButtonText: {
      color: c.tint,
    },
    label: {
      color: c.text,
      marginBottom: 4,
      fontWeight: '600',
    },
    input: {
      backgroundColor: c.input,
      color: c.text,
      padding: 12,
      borderRadius: 10,
      marginBottom: 10,
    },
    button: {
      backgroundColor: c.tint,
      padding: 12,
      borderRadius: 10,
      alignItems: 'center',
      marginBottom: 20,
    },
    buttonText: {
      color: c.text,
      fontWeight: '600',
    },
    signOutButton: {
      alignItems: 'center',
      marginBottom: 20,
    },
    signOutText: {
      color: '#f87171',
    },
    info: {
      color: c.text,
      textAlign: 'center',
      marginTop: 4,
    },
    section: {
      backgroundColor: c.input,
      padding: 12,
      borderRadius: 10,
      marginBottom: 20,
    },
    sectionTitle: {
      color: c.text,
      fontWeight: '600',
      marginBottom: 8,
    },
    boostCount: {
      color: c.tint,
      fontWeight: '600',
      marginBottom: 8,
      textAlign: 'center',
    },
    boostPreview: {
      borderWidth: 1,
      borderColor: c.tint,
      padding: 8,
      borderRadius: 8,
      marginTop: 8,
      alignItems: 'center',
    },
    previewText: {
      fontSize: 14,
      color: c.text,
      textAlign: 'center',
    },
  });

