import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, SafeAreaView, StatusBar, StyleSheet, Text } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import WishCard from '../../components/WishCard';
import { listenFollowingWishes, getFollowingWishes } from '../../helpers/firestore';
import type { Wish } from '../../types/Wish';

export default function FollowingScreen() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!user) return;
    const unsub = listenFollowingWishes(user.uid, setWishes);
    return () => unsub();
  }, [user]);

  const onRefresh = useCallback(async () => {
    if (!user) return;
    setRefreshing(true);
    try {
      const list = await getFollowingWishes(user.uid);
      setWishes(list);
    } catch (err) {
      console.error('Failed to refresh following feed', err);
    } finally {
      setRefreshing(false);
    }
  }, [user]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>\
      <StatusBar barStyle="light-content" backgroundColor={theme.background} />\
      <FlatList
        data={wishes}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <WishCard wish={item} />}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <Text style={{ color: theme.text, textAlign: 'center', marginTop: 20 }}>
            No wishes from people you follow.
          </Text>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { padding: 20, paddingBottom: 100, flexGrow: 1 },
});
