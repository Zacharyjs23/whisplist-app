import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
  TouchableOpacity,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import ThemedButton from '@/components/ThemedButton';
import { trackEvent } from '@/helpers/analytics';

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
  const [completed, setCompleted] = useState(false);
  const viewConfigRef = useRef({ viewAreaCoveragePercentThreshold: 50 });
  const scrollX = useRef(new Animated.Value(0)).current;

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      const idx = viewableItems[0].index || 0;
      setIndex(idx);
      trackEvent('view_onboarding_slide', { slideIndex: idx });
    }
  }).current;

  useEffect(() => {
    trackEvent('view_onboarding');
  }, []);

  const handleDone = async () => {
    if (completed) return;
    setCompleted(true);
    await AsyncStorage.setItem('hasSeenOnboarding', 'true');
    trackEvent('complete_onboarding');
    router.replace('/');
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <TouchableOpacity
        onPress={handleDone}
        style={styles.skipButton}
        accessibilityRole="button"
        accessibilityLabel="Skip Onboarding"
      >
        <Text style={[styles.skipText, { color: theme.tint }]}>Skip</Text>
      </TouchableOpacity>
      <Animated.FlatList
        data={slides}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewConfigRef.current}
        keyExtractor={(item) => item.key}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <Text
              style={styles.emoji}
              accessibilityRole="text"
              accessibilityLabel={item.emoji}
            >
              {item.emoji}
            </Text>
            <Text
              style={[styles.title, { color: theme.text }]}
              accessibilityRole="header"
              accessibilityLabel={item.title}
            >
              {item.title}
            </Text>
          </View>
        )}
      />
      <View style={styles.dotsContainer} pointerEvents="none">
        {slides.map((_, i) => {
          const opacity = scrollX.interpolate({
            inputRange: [
              (i - 1) * width,
              i * width,
              (i + 1) * width,
            ],
            outputRange: [0.3, 1, 0.3],
            extrapolate: 'clamp',
          });
          return (
            <Animated.View
              key={i}
              style={[styles.dot, { backgroundColor: theme.tint, opacity }]}
            />
          );
        })}
      </View>
      {index === slides.length - 1 && (
        <ThemedButton
          title="Get Started"
          onPress={handleDone}
          accessibilityLabel="Get Started"
          accessibilityRole="button"
        />
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
  skipButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
  },
  skipText: {
    fontSize: 16,
    fontWeight: '600',
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
  dotsContainer: {
    flexDirection: 'row',
    marginVertical: 20,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginHorizontal: 4,
  },
});

