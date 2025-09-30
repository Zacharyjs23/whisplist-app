// app/(tabs)/_layout.tsx — Enhanced Tab Navigation Layout with Daily Wish Streak
import * as React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import useNotifications from '@/hooks/useNotifications';
import useDM from '@/hooks/useDM';
import { useTranslation } from '@/contexts/I18nContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
 
import { useFocusEffect } from '@react-navigation/native';
import { getQueueStatus } from '@/helpers/offlineQueue';

export default function Layout() {
  const { theme } = useTheme();
  const { unread } = useNotifications();
  const { unread: dmUnread } = useDM();
  const combinedMessageBadge = React.useMemo(() => {
    const notif = Number.isFinite(unread) ? unread : 0;
    const dm = Number.isFinite(dmUnread) ? dmUnread : 0;
    const total = notif + dm;
    if (!total) return undefined;
    return total > 99 ? '99+' : String(total);
  }, [dmUnread, unread]);
  const { t } = useTranslation();
  const [homeBadge, setHomeBadge] = React.useState<string | undefined>(undefined);

  const refreshHomeBadge = async () => {
    try {
      const qs = await getQueueStatus();
      const draft = await AsyncStorage.getItem('pendingPost.v1');
      const has = (qs.size || 0) > 0 || !!draft;
      setHomeBadge(has ? '•' : undefined);
    } catch {
      setHomeBadge(undefined);
    }
  };

  React.useEffect(() => {
    void refreshHomeBadge();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      void refreshHomeBadge();
      return () => {};
    }, []),
  );

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#a78bfa',
        tabBarInactiveTintColor: '#999',
        tabBarStyle: {
          backgroundColor: theme.name === 'dark' ? '#0e0e0e' : '#fff',
          borderTopWidth: 0,
          paddingBottom: 6,
          paddingTop: 6,
          height: 60,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.home'),
          tabBarBadge: homeBadge,
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <Ionicons name="home-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="feed"
        options={{
          title: t('tabs.feed'),
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <Ionicons name="layers-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="journal"
        options={{
          title: t('tabs.journal'),
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <Ionicons name="book-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: t('tabs.messages', 'Messages'),
          tabBarBadge: combinedMessageBadge,
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <Ionicons name="chatbox-ellipses-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <Ionicons name="person-circle-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
