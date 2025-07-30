import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
  Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ConfettiCannon from 'react-native-confetti-cannon';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { Colors } from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import type { Wish } from '../../types/Wish';

export default function Page() {
  const { user, profile, updateProfile, pickImage, signOut } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [saving, setSaving] = useState(false);
  const [boostCount, setBoostCount] = useState(0);
  const [latestBoost, setLatestBoost] = useState<Wish | null>(null);
  const [streakCount, setStreakCount] = useState(0);
  const [dailyPrompt, setDailyPrompt] = useState<string | null>(null);
  const [latestWish, setLatestWish] = useState<Wish | null>(null);
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

  useEffect(() => {
    const load = async () => {
      if (!user?.uid) return;
      const snap = await getDocs(
        query(collection(db, 'wishes'), where('userId', '==', user.uid), orderBy('timestamp', 'desc'))
      );
      const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Wish, 'id'>) })) as Wish[];
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
    };
    loadLocal();
  }, []);

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={boostCount > 0 ? styles.avatarGlow : undefined}>
        {profile?.photoURL ? (
          <Image source={{ uri: profile.photoURL }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: '#444' }]} />
        )}
      </View>
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

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔥 Boosts</Text>
        <Animated.Text
          style={[styles.boostCount, { transform: [{ scale: boostAnim }] }]}
        >
          You've boosted {boostCount} wishes 🌟
        </Animated.Text>
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
          <Text style={styles.info}>🔥 {streakCount}-day streak — you're on fire!</Text>
          {streakCount > 3 && <ConfettiCannon count={40} origin={{ x: 0, y: 0 }} fadeOut />}
        </View>
      )}

      {profile?.publicProfileEnabled && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🌐 Public Profile</Text>
          <Text style={styles.info}>@{profile.displayName}</Text>
          {latestWish && (
            <Text style={styles.previewText} numberOfLines={2}>
              {latestWish.text}
            </Text>
          )}
          <Text style={styles.info}>Your profile is public. This is what others see.</Text>
          <TouchableOpacity onPress={handleCopyLink} style={[styles.button, { marginTop: 10 }]}>
            <Text style={styles.buttonText}>Copy Link</Text>
          </TouchableOpacity>
        </View>
      )}

      {dailyPrompt && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🧠 Reflection</Text>
          <Text style={styles.info}>Yesterday, you said: '{dailyPrompt}'</Text>
        </View>
      )}

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

