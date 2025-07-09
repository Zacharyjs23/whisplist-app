import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Dimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import ThemedButton from '@/components/ThemedButton';

const { width } = Dimensions.get('window');

const slides = [
  { key: '1', title: 'Post anonymously', emoji: '🤫' },
  { key: '2', title: 'Hear others', emoji: '👂' },
  { key: '3', title: 'Be fulfilled', emoji: '✨' },
];

export default function Page() {
  const router = useRouter();
  const { theme } = useTheme();
  const [index, setIndex] = useState(0);
  const viewConfigRef = useRef({ viewAreaCoveragePercentThreshold: 50 });

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setIndex(viewableItems[0].index || 0);
    }
  }).current;

  const handleDone = async () => {
    await AsyncStorage.setItem('hasSeenOnboarding', 'true');
    router.replace('/');
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <FlatList
        data={slides}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewConfigRef.current}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <Text style={[styles.emoji]}>{item.emoji}</Text>
            <Text style={[styles.title, { color: theme.text }]}>{item.title}</Text>
          </View>
        )}
      />
      {index === slides.length - 1 && (
        <ThemedButton title="Get Started" onPress={handleDone} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  slide: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  emoji: {
    fontSize: 72,
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
});

