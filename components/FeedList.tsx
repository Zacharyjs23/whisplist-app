import React, { useEffect, useState, useCallback } from 'react';
import {
  FlatList,
  View,
  Text,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { collection, getDocs, orderBy, query, limit } from 'firebase/firestore';
import { db } from '@/firebase';
import type { Wish } from '@/types/Wish';
import { useFeed } from '@/contexts/FeedContext';
import { useTheme } from '@/contexts/ThemeContext';
import BoostButton from './BoostButton';

const FeedList: React.FC = () => {
  const { wishList, setWishList } = useFeed();
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'wishes'), orderBy('timestamp', 'desc'), limit(20)),
      );
      const items = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Wish, 'id'>),
      })) as Wish[];
      setWishList(items);
    } finally {
      setLoading(false);
    }
  }, [setWishList]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const renderItem = ({ item }: { item: Wish }) => (
    <View style={styles.item}>
      <Text style={styles.text}>{item.text}</Text>
      <BoostButton wishId={item.id} />
    </View>
  );

  return (
    <FlatList
      style={{ flex: 1 }}
      data={wishList}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListEmptyComponent={
        loading ? (
          <ActivityIndicator size="large" color={theme.tint} style={{ marginTop: 20 }} />
        ) : (
          <Text style={styles.empty}>No wishes yet</Text>
        )
      }
      contentContainerStyle={styles.container}
    />
  );
};

const createStyles = (c: any) =>
  StyleSheet.create({
    container: { padding: 16 },
    item: {
      backgroundColor: c.input,
      padding: 12,
      borderRadius: 8,
      marginBottom: 10,
    },
    text: { color: c.text, fontSize: 16 },
    empty: { textAlign: 'center', color: c.text },
  });

export default FeedList;
