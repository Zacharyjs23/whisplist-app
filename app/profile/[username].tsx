import { useLocalSearchParams, useRouter } from 'expo-router';
import { collection, getDocs, query, where, orderBy, doc, getDoc, limit, startAfter } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { db } from '../../firebase';
import { followUser, unfollowUser } from '../../helpers/firestore';
import { useAuth } from '@/contexts/AuthContext';
import type { Wish } from '../../types/Wish';

export default function Page() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [loading, setLoading] = useState(true);
  const [privateProfile, setPrivateProfile] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [lastDoc, setLastDoc] = useState<any | null>(null);
  const { theme } = useTheme();
  const { user } = useAuth();

  useEffect(() => {
    const load = async () => {
      if (!username) return;
      try {
        const userSnap = await getDocs(
          query(collection(db, 'users'), where('displayName', '==', username))
        );
        if (userSnap.empty) {
          setPrivateProfile(true);
          setLoading(false);
          return;
        }
        const userDoc = userSnap.docs[0];
        const userData = userDoc.data();
        setProfileId(userDoc.id);
        if (userData.publicProfileEnabled === false) {
          setPrivateProfile(true);
          setLoading(false);
          return;
        }
        setProfile(userData);
        if (user && user.uid !== userDoc.id) {
          try {
            const followSnap = await getDoc(
              doc(db, 'users', user.uid, 'following', userDoc.id)
            );
            setIsFollowing(followSnap.exists());
          } catch (err) {
            console.warn('Failed to fetch follow status', err);
          }
        }
        const q = query(
          collection(db, 'wishes'),
          where('displayName', '==', username),
          where('isAnonymous', '==', false),
          orderBy('timestamp', 'desc'),
          limit(20)
        );
        const snap = await getDocs(q);
        setLastDoc(snap.docs[snap.docs.length - 1] || null);
        const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Wish,'id'>) })) as Wish[];
        setWishes(list);
      } catch (err) {
        console.warn('Failed to load profile', err);
        setPrivateProfile(true);
      } finally {
        setLoading(false);
      }
    };
    load();
    }, [username, user]);

  const loadMore = async () => {
    if (!lastDoc) return;
    const q = query(
      collection(db, 'wishes'),
      where('displayName', '==', username),
      where('isAnonymous', '==', false),
      orderBy('timestamp', 'desc'),
      startAfter(lastDoc),
      limit(20)
    );
    const snap = await getDocs(q);
    setLastDoc(snap.docs[snap.docs.length - 1] || lastDoc);
    const more = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Wish,'id'>) })) as Wish[];
    setWishes(prev => [...prev, ...more]);
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.tint} />
      </View>
    );
  }

  if (privateProfile || !profile) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={[styles.privateText, { color: theme.text }]}>This user has a private profile.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {profile.photoURL ? (
        <Image source={{ uri: profile.photoURL }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, { backgroundColor: '#444' }]} />
      )}
      <Text style={[styles.displayName, { color: theme.text }]}>{profile.displayName}</Text>
      {user && profileId && user.uid !== profileId && (
        <TouchableOpacity
          onPress={async () => {
            if (isFollowing) {
              await unfollowUser(user.uid, profileId);
              setIsFollowing(false);
            } else {
              await followUser(user.uid, profileId);
              setIsFollowing(true);
            }
          }}
          style={{ marginBottom: 10 }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={{ color: '#a78bfa', textAlign: 'center' }}>
            {isFollowing ? 'Unfollow' : 'Follow'}
          </Text>
        </TouchableOpacity>
      )}
      <FlatList
        data={wishes}
        keyExtractor={(item) => item.id}
        onEndReached={loadMore}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => router.push(`/wish/${item.id}`)}
            style={[styles.wishItem, { backgroundColor: theme.input }]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={[styles.wishText, { color: theme.text }]}>{item.text}</Text>
            {item.imageUrl && <Image source={{ uri: item.imageUrl }} style={styles.preview} />}
            {item.isPoll ? (
              <View style={{ marginTop: 6 }}>
                <Text style={[styles.wishText, { color: theme.text }]}>{item.optionA}: {item.votesA || 0}</Text>
                <Text style={[styles.wishText, { color: theme.text }]}>{item.optionB}: {item.votesB || 0}</Text>
              </View>
            ) : (
              <Text style={[styles.likeText, { color: theme.tint }]}>❤️ {item.likes}</Text>
            )}
          </TouchableOpacity>
        )}
        contentContainerStyle={{ paddingBottom: 80 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  privateText: {},
  avatar: { width: 100, height: 100, borderRadius: 50, alignSelf: 'center', marginBottom: 10 },
  displayName: { fontSize: 20, textAlign: 'center', marginBottom: 20 },
  wishItem: { padding: 12, borderRadius: 8, marginBottom: 10 },
  wishText: { fontSize: 16 },
  likeText: { marginTop: 6, fontSize: 14 },
  preview: { width: '100%', height: 200, borderRadius: 10, marginTop: 8 }
});
