// app/(tabs)/_layout.tsx — Enhanced Tab Navigation Layout with Daily Wish Streak
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import useNotifications from '@/hooks/useNotifications';

export default function Layout() {
  const { theme } = useTheme();
  const { unread } = useNotifications();

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
          title: 'Home',
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <Ionicons name="home-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Feed',
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <Ionicons name="layers-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="journal"
        options={{
          title: 'Journal',
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <Ionicons name="book-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <Ionicons name="person-circle-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Inbox',
          tabBarBadge: unread > 0 ? unread : undefined,
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <Ionicons name="notifications-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <Ionicons name="settings-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
