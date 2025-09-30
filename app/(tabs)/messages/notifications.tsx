import React, { useEffect } from 'react';
import { FlatList, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import ThemedButton from '@/components/ThemedButton';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import useNotifications from '@/hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';
import { useTranslation } from '@/contexts/I18nContext';

export default function NotificationsPage() {
  const { theme } = useTheme();
  const { items, markAllRead } = useNotifications();
  const { t } = useTranslation();
  const router = useRouter();

  useEffect(() => {
    markAllRead();
  }, [markAllRead]);

  const renderItem = ({ item }: any) => {
    const onPress = () => {
      if (item.path) router.push(item.path);
    };
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        <View style={[styles.item, { backgroundColor: theme.input }]}> 
          <Text style={[styles.text, { color: theme.text }]}>{item.title || item.message}</Text>
          <Text style={[styles.time, { color: theme.placeholder }]}>
            {item.timestamp?.seconds
              ? formatDistanceToNow(new Date(item.timestamp.seconds * 1000), {
                  addSuffix: true,
                })
              : t('inbox.justNow')}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, padding: 20 }}>
      <ThemedButton
        title={t('inbox.openMessages', 'Open Direct Messages')}
        onPress={() => router.push('/(tabs)/messages')}
      />
      <FlatList
        style={{ marginTop: 12 }}
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 40 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  item: { padding: 12, borderRadius: 10, marginBottom: 10 },
  text: { fontSize: 14 },
  time: { fontSize: 12, marginTop: 4 },
});
