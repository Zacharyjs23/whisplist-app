import React, { useEffect } from 'react';
import { FlatList, View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import useNotifications from '@/hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';
import { useTranslation } from '@/contexts/I18nContext';

export default function InboxPage() {
  const { theme } = useTheme();
  const { items, markAllRead } = useNotifications();
  const { t } = useTranslation();

  useEffect(() => {
    markAllRead();
  }, [markAllRead]);

  const renderItem = ({ item }: any) => (
    <View style={[styles.item, { backgroundColor: theme.input }]}>
      <Text style={[styles.text, { color: theme.text }]}>{item.message}</Text>
      <Text style={[styles.time, { color: theme.placeholder }]}>
        {/* theme fix */}
        {item.timestamp?.seconds
          ? formatDistanceToNow(new Date(item.timestamp.seconds * 1000), {
              addSuffix: true,
            })
          : t('inbox.justNow')}
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
