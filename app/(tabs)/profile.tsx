import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import type { Wish } from '../../types/Wish';

export default function Page() {
  const { user, profile, updateProfile, pickImage, signOut } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [saving, setSaving] = useState(false);
  const [boostCount, setBoostCount] = useState(0);
  const [latestBoost, setLatestBoost] = useState<Wish | null>(null);
  const { theme } = useTheme();

  const handleSave = async () => {
    setSaving(true);
    await updateProfile({ displayName, bio });
    setSaving(false);
  };

  const handleImage = async () => {
    await pickImage();
  };

  useEffect(() => {
    const load = async () => {
      if (!user?.uid) return;
      const snap = await getDocs(query(collection(db, 'wishes'), where('userId', '==', user.uid)));
      const list = snap.docs
        .map(d => ({ id: d.id, ...(d.data() as Omit<Wish, 'id'>) })) as Wish[];
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
    };
    load();
  }, [user]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {profile?.photoURL ? (
        <Image source={{ uri: profile.photoURL }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, { backgroundColor: '#444' }]} />
      )}
      <TouchableOpacity onPress={handleImage} style={styles.imageButton}>
        <Text style={styles.imageButtonText}>Change Photo</Text>
      </TouchableOpacity>
      <Text style={styles.label}>Display Name</Text>
      <TextInput
        style={styles.input}
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="Display Name"
        placeholderTextColor="#888"
      />
      <Text style={styles.label}>Bio</Text>
      <TextInput
        style={[styles.input, { height: 80 }]}
        value={bio}
        onChangeText={setBio}
        placeholder="Bio"
        placeholderTextColor="#888"
        multiline
      />
      <TouchableOpacity style={styles.button} onPress={handleSave} disabled={saving}>
        <Text style={styles.buttonText}>{saving ? 'Saving...' : 'Save Profile'}</Text>
      </TouchableOpacity>
      {boostCount > 0 && (
        <View style={{ alignItems: 'center', marginBottom: 20 }}>
          <Text style={[styles.info, { color: theme.tint }]}>You've boosted {boostCount} wishes 🔥</Text>
          {latestBoost && (
            <View style={[styles.boostPreview, { borderColor: theme.tint }]}>
              <Text style={[styles.previewText, { color: theme.text }]} numberOfLines={2}>
                {latestBoost.text}
              </Text>
            </View>
          )}
        </View>
      )}
      <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
      <Text style={styles.info}>Email: {user?.email || 'Anonymous'}</Text>
      {profile?.isAnonymous && <Text style={styles.info}>Logged in anonymously</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0e0e0e',
    padding: 20,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignSelf: 'center',
    marginBottom: 10,
  },
  imageButton: {
    alignSelf: 'center',
    marginBottom: 20,
  },
  imageButtonText: {
    color: '#a78bfa',
  },
  label: {
    color: '#ccc',
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#1e1e1e',
    color: '#fff',
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
  },
  button: {
    backgroundColor: '#8b5cf6',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 20,
  },
  buttonText: {
    color: '#fff',
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
    color: '#888',
    textAlign: 'center',
    marginTop: 4,
  },
  boostPreview: {
    borderWidth: 1,
    padding: 8,
    borderRadius: 8,
    marginTop: 8,
  },
  previewText: {
    fontSize: 14,
    textAlign: 'center',
  },
});
