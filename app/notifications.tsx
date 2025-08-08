import React from 'react';
import { FlatList, View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { formatDistanceToNow } from 'date-fns';
import useNotifications, { NotificationItem } from '@/hooks/useNotifications';

export default function NotificationsPage() {
  const { theme } = useTheme();
  const { items } = useNotifications();

  const renderItem = ({ item }: { item: NotificationItem }) => (
    <View style={[styles.item, { backgroundColor: theme.input }]}>
        <Text style={[styles.text, { color: theme.text }]}> 
          {/* theme fix */}
          {item.type === 'wish_boosted' ? '🚀' : item.type === 'new_comment' ? '💬' : '🎉'} {item.message}
        </Text>
        <Text style={[styles.time, { color: theme.text + '99' }]}> 
          {/* theme fix */}
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
  text: { fontSize: 14 },
  time: { fontSize: 12, marginTop: 4 },
});
