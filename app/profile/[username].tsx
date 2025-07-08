import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { db } from '../../firebase';
import type { Wish } from '../../types/Wish';

export default function Page() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [loading, setLoading] = useState(true);
  const [privateProfile, setPrivateProfile] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!username) return;
      const userSnap = await getDocs(query(collection(db, 'users'), where('displayName', '==', username)));
      if (userSnap.empty) {
        setPrivateProfile(true);
        setLoading(false);
        return;
      }
      const userData = userSnap.docs[0].data();
      if (userData.publicProfileEnabled === false) {
        setPrivateProfile(true);
        setLoading(false);
        return;
      }
      setProfile(userData);
      const q = query(
        collection(db, 'wishes'),
        where('displayName', '==', username),
        where('isAnonymous', '==', false),
        orderBy('timestamp', 'desc')
      );
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Wish,'id'>) })) as Wish[];
      setWishes(list);
      setLoading(false);
    };
    load();
  }, [username]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#a78bfa" />
      </View>
    );
  }

  if (privateProfile || !profile) {
    return (
      <View style={styles.center}>
        <Text style={styles.privateText}>This user has a private profile.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {profile.photoURL ? (
        <Image source={{ uri: profile.photoURL }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, { backgroundColor: '#444' }]} />
      )}
      <Text style={styles.displayName}>{profile.displayName}</Text>
      <FlatList
        data={wishes}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => router.push(`/wish/${item.id}`)}
            style={[styles.wishItem, { backgroundColor: '#1e1e1e' }]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.wishText}>{item.text}</Text>
            {item.imageUrl && <Image source={{ uri: item.imageUrl }} style={styles.preview} />}
            {item.isPoll ? (
              <View style={{ marginTop: 6 }}>
                <Text style={styles.wishText}>{item.optionA}: {item.votesA || 0}</Text>
                <Text style={styles.wishText}>{item.optionB}: {item.votesB || 0}</Text>
              </View>
            ) : (
              <Text style={styles.likeText}>❤️ {item.likes}</Text>
            )}
          </TouchableOpacity>
        )}
        contentContainerStyle={{ paddingBottom: 80 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0e0e0e', padding: 20 },
  center: { flex: 1, backgroundColor: '#0e0e0e', alignItems: 'center', justifyContent: 'center' },
  privateText: { color: '#fff' },
  avatar: { width: 100, height: 100, borderRadius: 50, alignSelf: 'center', marginBottom: 10 },
  displayName: { color: '#fff', fontSize: 20, textAlign: 'center', marginBottom: 20 },
  wishItem: { padding: 12, borderRadius: 8, marginBottom: 10 },
  wishText: { color: '#fff', fontSize: 16 },
  likeText: { color: '#a78bfa', marginTop: 6, fontSize: 14 },
  preview: { width: '100%', height: 200, borderRadius: 10, marginTop: 8 }
});
