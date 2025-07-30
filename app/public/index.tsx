import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { useTheme } from '@/contexts/ThemeContext';
import { Colors } from '@/constants/Colors';
import { db } from '../../firebase';
import type { Wish } from '../../types/Wish';

interface PublicUser {
  id: string;
  displayName: string;
  bio?: string;
  photoURL?: string;
  lastWish?: string;
  wishCount: number;
}

export default function Page() {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { theme } = useTheme();
  const styles = createStyles(theme);

  useEffect(() => {
    const load = async () => {
      const snap = await getDocs(
        query(collection(db, 'users'), where('publicProfileEnabled', '==', true))
      );
      const list: PublicUser[] = [];
      for (const docSnap of snap.docs) {
        const data = docSnap.data();
        const wishSnap = await getDocs(
          query(
            collection(db, 'wishes'),
            where('displayName', '==', data.displayName),
            where('isAnonymous', '==', false),
            orderBy('timestamp', 'desc')
          )
        );
        if (wishSnap.empty) continue;
        const lastWish = (wishSnap.docs[0].data() as Wish).text;
        list.push({
          id: docSnap.id,
          displayName: data.displayName,
          bio: data.bio,
          photoURL: data.photoURL,
          lastWish,
          wishCount: wishSnap.size,
        });
      }
      setUsers(list);
      setLoading(false);
    };
    load();
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.intro, { color: theme.text }]}>Meet the voices behind WhispList…</Text>
      <FlatList
        data={users}
        keyExtractor={(item) => item.id}
        refreshing={loading}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => router.push(`/profile/${item.displayName}`)}
            style={[styles.card, { backgroundColor: theme.input }]}
          >
            {item.photoURL ? (
              <Image source={{ uri: item.photoURL }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: '#444' }]} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: theme.text }]}>@{item.displayName}</Text>
              {item.bio ? (
                <Text style={[styles.bio, { color: theme.text }]} numberOfLines={2}>
                  {item.bio}
                </Text>
              ) : null}
              <Text style={[styles.wishInfo, { color: theme.text }]}>Last wish: {item.lastWish}</Text>
            </View>
          </TouchableOpacity>
        )}
        contentContainerStyle={{ paddingBottom: 80 }}
      />
    </View>
  );
}

const createStyles = (c: (typeof Colors)['light'] & { name: string }) =>
  StyleSheet.create({
    container: { flex: 1, padding: 20 },
    intro: { marginBottom: 20, fontSize: 16, textAlign: 'center' },
    card: { flexDirection: 'row', padding: 12, borderRadius: 10, marginBottom: 10 },
    avatar: { width: 50, height: 50, borderRadius: 25, marginRight: 10 },
    name: { fontWeight: '600', marginBottom: 4 },
    bio: { fontSize: 12, marginBottom: 4 },
    wishInfo: { fontSize: 12 },
  });
