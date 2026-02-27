import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from '@/contexts/I18nContext';
import * as logger from '@/shared/logger';
import { UserCard } from '@/app/components/UserCard';
import { db } from '../../firebase';
import type { Wish } from '../../types/Wish';
import { createPublicStyles } from './styles';
import type { PublicUser } from './types';

export default function Page() {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createPublicStyles(theme), [theme]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        const snapshot = await getDocs(
          query(
            collection(db, 'users'),
            where('publicProfileEnabled', '==', true),
          ),
        );

        const results = await Promise.all(
          snapshot.docs.map(
            async (docSnap): Promise<PublicUser | null> => {
              const data = docSnap.data();
              const userId = docSnap.id;
              const displayName =
                typeof data.displayName === 'string'
                  ? data.displayName
                  : undefined;

              if (!displayName) {
                logger.warn('Skipping public user without display name', {
                  userId: docSnap.id,
                  severity: 'low',
                });
                return null;
              }

              try {
                // Prefer stable ownership (`userId`) and only fall back to
                // displayName for legacy wishes missing userId.
                let wishSnapshot = await getDocs(
                  query(
                    collection(db, 'wishes'),
                    where('userId', '==', userId),
                    where('isAnonymous', '==', false),
                    orderBy('timestamp', 'desc'),
                  ),
                );

                if (wishSnapshot.empty) {
                  wishSnapshot = await getDocs(
                    query(
                      collection(db, 'wishes'),
                      where('displayName', '==', displayName),
                      where('isAnonymous', '==', false),
                      orderBy('timestamp', 'desc'),
                    ),
                  );
                }

                if (wishSnapshot.empty) {
                  return null;
                }

                const lastWishDoc = wishSnapshot.docs[0];
                const lastWishData = lastWishDoc.data() as Partial<Wish>;
                if (typeof lastWishData.text !== 'string') {
                  logger.warn('Skipping wish without text for public user', {
                    userId: docSnap.id,
                    severity: 'low',
                  });
                  return null;
                }

                return {
                  id: docSnap.id,
                  displayName,
                  bio: typeof data.bio === 'string' ? data.bio : undefined,
                  photoURL:
                    typeof data.photoURL === 'string'
                      ? data.photoURL
                      : undefined,
                  lastWish: lastWishData.text,
                  wishCount: wishSnapshot.size,
                };
              } catch (wishError) {
                logger.error('Failed to load wishes for user', wishError, {
                  userId: docSnap.id,
                  severity: 'medium',
                });
                return null;
              }
            },
          ),
        );

        if (!active) return;

        const filtered = results.filter((user): user is PublicUser =>
          Boolean(user),
        );
        setUsers(filtered);
      } catch (loadError) {
        logger.error('Failed to load public users', loadError, {
          severity: 'high',
        });
        if (active) {
          setError(t('publicUsers.error'));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    load();

    return () => {
      active = false;
    };
  }, [t]);

  const renderItem = ({ item }: { item: PublicUser }) => (
    <UserCard
      user={item}
      onPress={() => router.push(`/profile/${item.displayName}`)}
    />
  );

  const keyExtractor = (item: PublicUser) => item.id;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.intro, { color: theme.text }]}>
        {t('publicUsers.heading')}
      </Text>
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator
            color={theme.tint}
            accessibilityLiveRegion="assertive"
            accessibilityLabel={t('publicUsers.loading')}
          />
          <Text style={[styles.loadingText, { color: theme.text }]}>
            {t('publicUsers.loading')}
          </Text>
        </View>
      ) : error ? (
        <Text style={[styles.errorText, { color: theme.text }]}>{error}</Text>
      ) : (
        <FlatList
          data={users}
          keyExtractor={keyExtractor}
          refreshing={loading}
          renderItem={renderItem}
          ListEmptyComponent={
            <Text style={[styles.errorText, { color: theme.text }]}>
              {t('publicUsers.empty')}
            </Text>
          }
          contentContainerStyle={styles.listContent}
          accessibilityLabel={t('publicUsers.accessibility.listLabel')}
        />
      )}
    </View>
  );
}

export type { PublicUser } from './types';
