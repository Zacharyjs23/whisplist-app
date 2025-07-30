import React, { useEffect, useState } from 'react';
import { FlatList, View, Text, StyleSheet } from 'react-native';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { db } from '../firebase';
import { formatDistanceToNow } from 'date-fns';

interface Item { id: string; type: string; message: string; timestamp: any; }

export default function NotificationsPage() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(collection(db, 'notifications', user.uid, 'items'), orderBy('timestamp', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setItems(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as Item[]);
    });
    return unsub;
  }, [user]);

  const renderItem = ({ item }: { item: Item }) => (
    <View style={[styles.item, { backgroundColor: theme.input }]}>
      <Text style={styles.text}>
        {item.type === 'wish_boosted' ? '🚀' : item.type === 'new_comment' ? '💬' : '🎉'} {item.message}
      </Text>
      <Text style={styles.time}>
        {item.timestamp?.seconds
          ? formatDistanceToNow(new Date(item.timestamp.seconds * 1000), { addSuffix: true })
          : 'just now'}
      </Text>
    </View>
  );

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: theme.background, padding: 20 }}
      data={items}
      keyExtractor={(i) => i.id}
      renderItem={renderItem}
      contentContainerStyle={{ paddingBottom: 40 }}
    />
  );
}

const styles = StyleSheet.create({
  item: { padding: 12, borderRadius: 10, marginBottom: 10 },
  text: { fontSize: 14, color: '#fff' },
  time: { fontSize: 12, color: '#888', marginTop: 4 },
});
