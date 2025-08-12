import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
  TouchableOpacity,
  ViewToken,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import ThemedButton from '@/components/ThemedButton';
import { trackEvent } from '@/helpers/analytics';
import { useTranslation } from '@/contexts/I18nContext';

const { width } = Dimensions.get('window');


export default function Page() {
  const router = useRouter();
  const { theme } = useTheme();
  const [index, setIndex] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const { t } = useTranslation();
  const slides = [
    { key: '1', title: t('onboarding.slide1Title'), emoji: '🤫' },
    { key: '2', title: t('onboarding.slide2Title'), emoji: '👂' },
    { key: '3', title: t('onboarding.slide3Title'), emoji: '✨' },
    {
      key: '4',
      title: t('onboarding.slide4Title'),
      emoji: '❤️',
      subtitle: t('onboarding.slide4Subtitle'),
    },
  ];
  const viewConfigRef = useRef({ viewAreaCoveragePercentThreshold: 50 });
  const scrollX = useRef(new Animated.Value(0)).current;

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0) {
        const idx = viewableItems[0].index || 0;
        setIndex(idx);
        trackEvent('view_onboarding_slide', { slideIndex: idx });
      }
    },
  ).current;

  useEffect(() => {
    trackEvent('view_onboarding');
  }, []);

  const handleDone = async (): Promise<void> => {
    if (completed) return;
    setCompleted(true);
    await AsyncStorage.setItem('hasSeenOnboarding', 'true');
    await AsyncStorage.setItem('acceptedTerms', 'true');
    trackEvent('complete_onboarding');
    router.replace('/');
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <TouchableOpacity
        onPress={handleDone}
        style={styles.skipButton}
        accessibilityRole="button"
        accessibilityLabel={t('onboarding.skipOnboarding')}
      >
        <Text style={[styles.skipText, { color: theme.tint }]}>{t('onboarding.skip')}</Text>
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
          { useNativeDriver: false },
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
            {item.subtitle && (
              <Text style={[styles.subtitle, { color: theme.text }]}>
                {' '}
                {item.subtitle}
              </Text>
            )}
          </View>
        )}
      />
      <View style={styles.dotsContainer} pointerEvents="none">
        {slides.map((_, i) => {
          const opacity = scrollX.interpolate({
            inputRange: [(i - 1) * width, i * width, (i + 1) * width],
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
        <>
          <View style={styles.acceptRow}>
            <TouchableOpacity
              onPress={() => setAccepted(!accepted)}
              style={[
                styles.checkbox,
                {
                  backgroundColor: accepted ? theme.tint : 'transparent',
                  borderColor: theme.text,
                },
              ]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: accepted }}
            />
            <Text
              onPress={() => setAccepted(!accepted)}
              style={[styles.acceptText, { color: theme.text }]}
            >
              {t('onboarding.agree1')}
              <Text
                onPress={() => router.push('/terms')}
                style={{ textDecorationLine: 'underline' }}
              >
                {t('onboarding.terms')}
              </Text>
              {t('onboarding.and')}
              <Text
                onPress={() => router.push('/privacy')}
                style={{ textDecorationLine: 'underline' }}
              >
                {t('onboarding.privacy')}
              </Text>
            </Text>
          </View>
          <ThemedButton
            title={t('onboarding.getStarted')}
            onPress={handleDone}
            disabled={!accepted}
            accessibilityLabel={t('onboarding.getStarted')}
            accessibilityRole="button"
          />
        </>
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
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 10,
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
  acceptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderRadius: 4,
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  acceptText: {
    flex: 1,
    fontSize: 14,
  },
});
