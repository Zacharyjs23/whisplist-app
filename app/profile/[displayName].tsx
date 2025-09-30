import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  doc,
  getDoc,
  limit,
  startAfter,
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Share,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { formatDistanceToNow } from 'date-fns';
import { formatTimeLeft } from '../../helpers/time';
import { db } from '../../firebase';
import { followUser, unfollowUser } from '../../helpers/followers';
import { useAuthSession } from '@/contexts/AuthSessionContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Colors } from '@/constants/Colors';
import type { Wish } from '../../types/Wish';
import * as logger from '@/shared/logger';
import { POST_TYPE_META, normalizePostType } from '@/types/post';

export default function Page() {
  const { displayName } = useLocalSearchParams<{ displayName: string }>();
  const { theme } = useTheme();
  const styles = createStyles(theme);

  const [profile, setProfile] = useState<any | null>(null);
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [privateProfile, setPrivateProfile] = useState(false);
  const [lastDoc, setLastDoc] = useState<any | null>(null);
  const { user } = useAuthSession();
  const router = useRouter();

  useEffect(() => {
    const load = async () => {
      if (!displayName) return;
      try {
        const userSnap = await getDocs(
          query(collection(db, 'users'), where('displayName', '==', displayName)),
        );
        if (userSnap.empty) {
          setPrivateProfile(true);
          return;
        }
        const userDoc = userSnap.docs[0];
        const userData = userDoc.data();
        setProfileId(userDoc.id);
        if (userData.publicProfileEnabled === false) {
          setPrivateProfile(true);
          return;
        }
        setProfile(userData);
        if (user && user.uid !== userDoc.id) {
          try {
            const followSnap = await getDoc(
              doc(db, 'users', user.uid, 'following', userDoc.id),
            );
            setIsFollowing(followSnap.exists());
          } catch (err) {
            logger.warn('Failed to fetch follow status', err);
          }
        }
        const wishSnap = await getDocs(
          query(
            collection(db, 'wishes'),
            where('displayName', '==', displayName),
            where('isAnonymous', '==', false),
            orderBy('timestamp', 'desc'),
            limit(20),
          ),
        );
        setLastDoc(wishSnap.docs[wishSnap.docs.length - 1] || null);
        const list = wishSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Wish, 'id'>),
        })) as Wish[];
        setWishes(list);
      } catch (err) {
        logger.warn('Failed to load profile', err);
        setPrivateProfile(true);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [displayName, user]);

  const loadMore = async () => {
    if (!lastDoc) return;
    const snap = await getDocs(
      query(
        collection(db, 'wishes'),
        where('displayName', '==', displayName),
        where('isAnonymous', '==', false),
        orderBy('timestamp', 'desc'),
        startAfter(lastDoc),
        limit(20),
      ),
    );
    setLastDoc(snap.docs[snap.docs.length - 1] || lastDoc);
    const more = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<Wish, 'id'>),
    })) as Wish[];
    setWishes((prev) => [...prev, ...more]);
  };

  const handleCopy = async () => {
    if (!displayName) return;
    const url = Linking.createURL(`/profile/${displayName}`);
    await Clipboard.setStringAsync(url);
  };

  const handleShare = async () => {
    if (!displayName) return;
    const url = Linking.createURL(`/profile/${displayName}`);
    await Share.share({ message: url });
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
        <Text style={[styles.notFound, { color: theme.text }]}>This user has a private profile.</Text>
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
      <Text style={[styles.displayName, { color: theme.text }]}>
        @{profile.displayName}
      </Text>
      {profile.bio ? (
        <Text style={[styles.bio, { color: theme.text }]}>{profile.bio}</Text>
      ) : null}
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
      <TouchableOpacity
        onPress={handleCopy}
        style={[styles.copyButton, { backgroundColor: theme.input }]}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={{ color: theme.tint }}>Copy Link</Text>
      </TouchableOpacity>
      <View
        style={[
          styles.qrBlock,
          { backgroundColor: theme.input, borderColor: theme.tint },
        ]}
      >
        <QRCode
          value={Linking.createURL(`/profile/${displayName}`)}
          color={theme.text}
          backgroundColor={theme.input}
          size={150}
        />
        <TouchableOpacity
          onPress={handleShare}
          style={[styles.shareButton, { backgroundColor: theme.background }]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={{ color: theme.tint }}>Share Profile</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={wishes}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <Text style={[styles.noResults, { color: theme.text }]}>No public posts yet</Text>
        }
        renderItem={({ item }) => {
          const isBoosted =
            item.boostedUntil &&
            item.boostedUntil.toDate &&
            item.boostedUntil.toDate() > new Date();
          const timeLeft = isBoosted
            ? formatTimeLeft(item.boostedUntil!.toDate())
            : '';
          const typeMeta = POST_TYPE_META[normalizePostType(item.type)];
          return (
            <TouchableOpacity
              onPress={() => router.push(`/wish/${item.id}`)}
              style={[styles.wishItem, { backgroundColor: theme.input }]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={[styles.categoryText, { color: typeMeta.color }]}>
                {typeMeta.emoji} #{item.category}{' '}
                {item.audioUrl ? '🔊' : ''}
              </Text>
              <Text style={[styles.wishText, { color: theme.text }]}>{item.text}</Text>
              {item.imageUrl && (
                <Image source={{ uri: item.imageUrl }} style={styles.preview} />
              )}
              {isBoosted && (
                <Text style={[styles.boostedLabel, { color: theme.tint }]}>⏳ Time left: {timeLeft}</Text>
              )}
              <Text style={[styles.timestamp, { color: theme.text }]}>
                {item.timestamp?.seconds
                  ? formatDistanceToNow(
                      new Date(item.timestamp.seconds * 1000),
                      { addSuffix: true },
                    )
                  : ''}
              </Text>
            </TouchableOpacity>
          );
        }}
        onEndReached={loadMore}
        contentContainerStyle={{ paddingBottom: 80 }}
      />
    </View>
  );
}

const createStyles = (c: (typeof Colors)['light'] & { name: string }) =>
  StyleSheet.create({
    container: { flex: 1, padding: 20 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    notFound: { fontSize: 16 },
    avatar: {
      width: 100,
      height: 100,
      borderRadius: 50,
      alignSelf: 'center',
      marginBottom: 10,
    },
    displayName: { fontSize: 20, textAlign: 'center', marginBottom: 4 },
    bio: { fontSize: 14, textAlign: 'center', marginBottom: 10 },
    copyButton: {
      padding: 8,
      borderRadius: 8,
      alignSelf: 'center',
      marginBottom: 20,
    },
    wishItem: { padding: 12, borderRadius: 8, marginBottom: 10 },
    categoryText: { color: '#a78bfa', fontSize: 12, marginBottom: 2 },
    wishText: { fontSize: 16 },
    boostedLabel: { fontSize: 12, marginTop: 4 },
    timestamp: { fontSize: 12, marginTop: 4 },
    noResults: { textAlign: 'center', marginTop: 20 },
    preview: { width: '100%', height: 200, borderRadius: 10, marginTop: 8 },
    qrBlock: {
      padding: 12,
      borderRadius: 10,
      alignItems: 'center',
      borderWidth: 1,
      marginBottom: 20,
    },
    shareButton: { marginTop: 10, padding: 8, borderRadius: 8 },
  });
