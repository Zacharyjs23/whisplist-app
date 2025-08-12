import React from 'react';
import { SafeAreaView } from 'react-native';
import { FeedProvider } from '@/contexts/FeedContext';
import PostComposer from '@/components/PostComposer';
import FeedList from '@/components/FeedList';
import { useTheme } from '@/contexts/ThemeContext';

export default function Page() {
  const { theme } = useTheme();
  return (
    <FeedProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <PostComposer />
        <FeedList />
      </SafeAreaView>
    </FeedProvider>
  );
}
