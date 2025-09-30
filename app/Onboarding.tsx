import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
  TouchableOpacity,
  ViewToken,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import ThemedButton from '@/components/ThemedButton';
import { trackEvent } from '@/helpers/analytics';
import { useTranslation } from '@/contexts/I18nContext';
import { Ionicons } from '@expo/vector-icons';
import { useAuthFlows } from '@/contexts/AuthFlowsContext';
import * as logger from '@/shared/logger';

const { width } = Dimensions.get('window');

type Slide = {
  key: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  points: string[];
};

export default function Page() {
  const router = useRouter();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const {
    signInWithGoogle,
    signInAnonymously,
    authError,
    setAuthError,
  } = useAuthFlows();
  const [index, setIndex] = useState(0);
  const [accepted, setAccepted] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const scrollX = useRef(new Animated.Value(0)).current;
  const flatListRef = useRef<FlatList<Slide> | null>(null);
  const viewConfigRef = useRef({ viewAreaCoveragePercentThreshold: 50 });

  const slides = useMemo<Slide[]>(
    () => [
      {
        key: 'share',
        title: t('onboarding.slide1Title', 'Share without judgement'),
        subtitle: t(
          'onboarding.slide1Subtitle',
          'Share celebrations, goals, and honest updates anonymously.',
        ),
        icon: 'person-circle-outline',
        points: [
          t('onboarding.slide1Point1', 'Daily prompts keep you inspired.'),
          t(
            'onboarding.slide1Point2',
            'Audio notes let your voice be heard privately.',
          ),
        ],
      },
      {
        key: 'connect',
        title: t('onboarding.slide2Title', 'Connect with support'),
        subtitle: t(
          'onboarding.slide2Subtitle',
          'A caring community is ready to listen and lift you up.',
        ),
        icon: 'people-outline',
        points: [
          t(
            'onboarding.slide2Point1',
            'Earn hugs, hearts, and boosts from supporters.',
          ),
          t('onboarding.slide2Point2', 'Send thanks and keep DMs going.'),
        ],
      },
      {
        key: 'grow',
        title: t('onboarding.slide3Title', 'Grow every day'),
        subtitle: t(
          'onboarding.slide3Subtitle',
          'Track your streaks, journal reflections, and celebrate wins.',
        ),
        icon: 'trending-up-outline',
        points: [
          t(
            'onboarding.slide3Point1',
            'See milestone streaks and personal impact stats.',
          ),
          t(
            'onboarding.slide3Point2',
            'Save drafts to finish whenever you feel ready.',
          ),
        ],
      },
    ],
    [t],
  );

  const resetAuthError = useCallback(() => {
    if (authError) setAuthError(null);
  }, [authError, setAuthError]);

  const completeOnboarding = useCallback(
    async (nextRoute?: string) => {
      if (completing) return false;
      setCompleting(true);
      try {
        await AsyncStorage.multiSet([
          ['hasSeenOnboarding', 'true'],
          ['acceptedTerms', 'true'],
        ]);
        trackEvent('complete_onboarding', { destination: nextRoute ?? 'home' });
        if (nextRoute) {
          router.replace(nextRoute);
        } else {
          router.replace('/');
        }
        return true;
      } catch (err) {
        logger.error('Failed to finish onboarding', err);
        setCompleting(false);
        return false;
      }
    },
    [completing, router],
  );

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0) {
        const idx = viewableItems[0].index ?? 0;
        setIndex(idx);
        trackEvent('view_onboarding_slide', { index: idx });
      }
    },
  ).current;

  useEffect(() => {
    trackEvent('view_onboarding');
  }, []);

  const handleSkip = useCallback(() => {
    if (index === slides.length - 1) return;
    trackEvent('skip_onboarding');
    flatListRef.current?.scrollToIndex({ index: slides.length - 1, animated: true });
  }, [index, slides.length]);

  const handleNext = useCallback(() => {
    if (index >= slides.length - 1) return;
    trackEvent('onboarding_next', { from: index });
    flatListRef.current?.scrollToIndex({ index: index + 1, animated: true });
  }, [index, slides.length]);

  const handleStart = useCallback(async () => {
    if (!accepted || completing) return;
    resetAuthError();
    const success = await completeOnboarding('/');
    if (!success) {
      setCompleting(false);
    }
  }, [accepted, completing, resetAuthError, completeOnboarding]);

  const handleGuest = useCallback(async () => {
    if (!accepted || completing) return;
    resetAuthError();
    try {
      await signInAnonymously();
      trackEvent('onboarding_continue_guest');
    } catch (err) {
      logger.error('Guest sign-in failed', err);
      return;
    }
    const success = await completeOnboarding('/');
    if (!success) {
      setCompleting(false);
    }
  }, [accepted, completing, resetAuthError, signInAnonymously, completeOnboarding]);

  const handleGoogle = useCallback(async () => {
    if (!accepted || completing || googleLoading) return;
    resetAuthError();
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      trackEvent('onboarding_continue_google');
    } catch (err) {
      logger.error('Google sign-in failed', err);
      setGoogleLoading(false);
      return;
    }
    const success = await completeOnboarding('/');
    if (!success) {
      setGoogleLoading(false);
      setCompleting(false);
    }
  }, [accepted, completing, googleLoading, resetAuthError, signInWithGoogle, completeOnboarding]);

  const handleSignIn = useCallback(async () => {
    if (!accepted || completing) return;
    resetAuthError();
    trackEvent('onboarding_go_to_auth', { destination: 'login' });
    const success = await completeOnboarding('/auth?mode=login');
    if (!success) {
      setCompleting(false);
    }
  }, [accepted, completing, resetAuthError, completeOnboarding]);

  const progress = (index + 1) / slides.length;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {index < slides.length - 1 ? (
        <TouchableOpacity
          onPress={handleSkip}
          style={styles.skipButton}
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.skipOnboarding')}
        >
          <Text style={[styles.skipText, { color: theme.tint }]}>
            {t('onboarding.skip')}
          </Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.header}>
        <Text style={[styles.welcome, { color: theme.text }]}>
          {t('onboarding.title', 'Welcome to WhispList')}
        </Text>
        <Text style={[styles.tagline, { color: theme.placeholder }]}>
          {t(
            'onboarding.tagline',
            'A caring space to share dreams, reflections, and support.',
          )}
        </Text>
        <View style={styles.progressHeader}>
          <Text style={[styles.progressText, { color: theme.placeholder }]}>
            {t('onboarding.stepCounter', 'Step {{current}} of {{total}}', {
              current: index + 1,
              total: slides.length,
            })}
          </Text>
          <View
            style={[
              styles.progressTrack,
              { backgroundColor: withAlpha(theme.text, 0.12) },
            ]}
          >
            <View
              style={[
                styles.progressThumb,
                {
                  width: `${Math.max(10, progress * 100)}%`,
                  backgroundColor: theme.tint,
                },
              ]}
            />
          </View>
        </View>
      </View>

      <View style={styles.carouselWrapper}>
        <Animated.FlatList
          data={slides}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          ref={(node) => {
            flatListRef.current = node as unknown as FlatList<Slide> | null;
          }}
          style={styles.carousel}
          contentContainerStyle={styles.carouselContent}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewConfigRef.current}
          keyExtractor={(item) => item.key}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
            { useNativeDriver: false },
          )}
          renderItem={({ item, index: slideIndex }) => {
            const inputRange = [
              (slideIndex - 1) * width,
              slideIndex * width,
              (slideIndex + 1) * width,
            ];
            const cardOpacity = scrollX.interpolate({
              inputRange,
              outputRange: [0.5, 1, 0.5],
              extrapolate: 'clamp',
            });
            const scale = scrollX.interpolate({
              inputRange,
              outputRange: [0.92, 1, 0.92],
              extrapolate: 'clamp',
            });
            const translateY = scrollX.interpolate({
              inputRange,
              outputRange: [24, 0, 24],
              extrapolate: 'clamp',
            });
            const cardBackground = withAlpha(theme.tint, 0.12);
            const cardBorder = withAlpha(theme.tint, 0.24);
            const pointBackground = withAlpha(theme.tint, 0.18);

            return (
              <View style={[styles.slide, { width }]}> 
                <Animated.View
                  style={[
                    styles.slideCard,
                    {
                      backgroundColor: cardBackground,
                      borderColor: cardBorder,
                      opacity: cardOpacity,
                      transform: [{ translateY }, { scale }],
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.heroIcon,
                      { backgroundColor: withAlpha(theme.tint, 0.22) },
                    ]}
                    accessibilityRole="image"
                    accessibilityLabel={item.title}
                  >
                    <Ionicons name={item.icon} size={36} color={theme.tint} />
                  </View>
                  <Text
                    style={[styles.slideTitle, { color: theme.text }]}
                    accessibilityRole="header"
                  >
                    {item.title}
                  </Text>
                  <Text
                    style={[styles.slideSubtitle, { color: theme.placeholder }]}
                  >
                    {item.subtitle}
                  </Text>
                  <View style={styles.pointsWrapper}>
                    {item.points.map((point, pointIndex) => (
                      <View
                        key={point}
                        style={[
                          styles.pointRow,
                          {
                            backgroundColor: pointBackground,
                            marginTop: pointIndex === 0 ? 0 : 12,
                          },
                        ]}
                      >
                        <Ionicons
                          name="checkmark-circle"
                          size={20}
                          color={theme.tint}
                          style={styles.pointIcon}
                        />
                        <Text style={[styles.pointText, { color: theme.text }]}
                          accessibilityRole="text"
                        >
                          {point}
                        </Text>
                      </View>
                    ))}
                  </View>
                </Animated.View>
              </View>
            );
          }}
        />
      </View>

      {index < slides.length - 1 ? (
        <View style={styles.preFooter}>
          <View style={styles.swipeHint}>
            <Ionicons
              name="arrow-forward-circle"
              size={18}
              color={theme.placeholder}
              style={styles.swipeHintIcon}
            />
            <Text style={[styles.swipeHintText, { color: theme.placeholder }]}>
              {t(
                'onboarding.swipeHint',
                'Swipe or tap next to explore the journey.',
              )}
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleNext}
            style={[styles.nextButton, { backgroundColor: theme.tint }]}
            accessibilityRole="button"
            accessibilityLabel={t('onboarding.next', 'Next')}
          >
            <Text style={[styles.nextButtonText, { color: theme.text }]}>
              {t('onboarding.next', 'Next')}
            </Text>
            <Ionicons name="arrow-forward" size={18} color={theme.text} />
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <TouchableOpacity
            onPress={() => setAccepted((prev) => !prev)}
            style={styles.acceptRow}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: accepted }}
          >
            <View
              style={[
                styles.checkbox,
                {
                  backgroundColor: accepted ? theme.tint : 'transparent',
                  borderColor: accepted ? theme.tint : theme.placeholder,
                },
              ]}
            >
              {accepted ? (
                <Ionicons name="checkmark" size={16} color={theme.text} />
              ) : null}
            </View>
            <Text style={[styles.acceptText, { color: theme.text }]}>
              {t('onboarding.agree1')}
              <Text
                onPress={() => router.push('/terms')}
                style={[styles.legalLink, { color: theme.tint }]}
              >
                {t('onboarding.terms')}
              </Text>
              {` ${t('onboarding.and')} `}
              <Text
                onPress={() => router.push('/privacy')}
                style={[styles.legalLink, { color: theme.tint }]}
              >
                {t('onboarding.privacy')}
              </Text>
            </Text>
          </TouchableOpacity>
          <ThemedButton
            title={t('onboarding.primaryCta', 'Start sharing')}
            onPress={handleStart}
            disabled={!accepted || completing}
            loading={completing && !googleLoading}
            leftIcon={<Ionicons name="sparkles" size={18} color={theme.text} />}
            accessibilityLabel={t('onboarding.primaryCta', 'Start sharing')}
            accessibilityRole="button"
          />
          <TouchableOpacity
            onPress={handleGoogle}
            style={[
              styles.altButton,
              {
                backgroundColor: theme.input,
                opacity:
                  !accepted || completing || googleLoading ? 0.6 : 1,
              },
            ]}
            disabled={!accepted || completing || googleLoading}
            accessibilityRole="button"
            accessibilityLabel={t('onboarding.googleCta', 'Continue with Google')}
          >
            <View style={styles.altButtonContent}>
              <Ionicons
                name="logo-google"
                size={20}
                color={theme.text}
                style={styles.altButtonIcon}
              />
              <Text style={[styles.altButtonText, { color: theme.text }]}>
                {t('onboarding.googleCta', 'Continue with Google')}
              </Text>
              {googleLoading ? (
                <ActivityIndicator
                  size="small"
                  color={theme.text}
                  style={styles.altSpinner}
                />
              ) : null}
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleGuest}
            style={styles.linkButton}
            disabled={!accepted || completing}
            accessibilityRole="button"
            accessibilityLabel={t('onboarding.guestCta', 'Keep it anonymous')}
          >
            <View style={styles.linkButtonRow}>
              <Ionicons
                name="eye-off-outline"
                size={18}
                color={theme.tint}
                style={styles.linkIcon}
              />
              <Text style={[styles.linkButtonText, { color: theme.tint }]}>
                {t('onboarding.guestCta', 'Keep it anonymous')}
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSignIn}
            style={styles.linkButton}
            disabled={!accepted || completing}
            accessibilityRole="button"
            accessibilityLabel={t('onboarding.signinCta', 'I already have an account')}
          >
            <View style={styles.linkButtonRow}>
              <Ionicons
                name="log-in-outline"
                size={18}
                color={theme.placeholder}
                style={styles.linkIcon}
              />
              <Text style={[styles.linkButtonText, { color: theme.placeholder }]}>
                {t('onboarding.signinCta', 'I already have an account')}
              </Text>
            </View>
          </TouchableOpacity>
          {authError ? (
            <Text style={styles.errorText}>{authError}</Text>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'stretch',
    paddingHorizontal: 24,
    paddingTop: 84,
    paddingBottom: 32,
  },
  skipButton: {
    position: 'absolute',
    top: 36,
    right: 24,
    zIndex: 10,
  },
  skipText: {
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    marginBottom: 28,
  },
  welcome: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 6,
  },
  tagline: {
    fontSize: 16,
    lineHeight: 22,
  },
  progressHeader: {
    marginTop: 18,
  },
  progressText: {
    fontSize: 13,
    marginBottom: 8,
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressThumb: {
    height: 6,
    borderRadius: 999,
  },
  carouselWrapper: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
  },
  carousel: {
    flexGrow: 0,
  },
  carouselContent: {
    paddingVertical: 12,
  },
  slide: {
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  slideCard: {
    borderRadius: 24,
    padding: 28,
    borderWidth: 1,
  },
  heroIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  slideTitle: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  slideSubtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 22,
  },
  pointsWrapper: {
    marginTop: 24,
  },
  pointRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  pointIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  pointText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
  },
  preFooter: {
    marginTop: 24,
  },
  swipeHint: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  swipeHintIcon: {
    marginRight: 8,
  },
  swipeHintText: {
    fontSize: 14,
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    paddingVertical: 12,
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: '600',
    marginRight: 6,
  },
  acceptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderRadius: 6,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  acceptText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  legalLink: {
    textDecorationLine: 'underline',
  },
  altButton: {
    width: '100%',
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 12,
    paddingVertical: 12,
  },
  altButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  altButtonIcon: {
    marginTop: 1,
    marginRight: 10,
  },
  altButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  altSpinner: {
    marginLeft: 10,
  },
  linkButton: {
    marginBottom: 10,
  },
  linkButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkIcon: {
    marginRight: 6,
  },
  linkButtonText: {
    fontSize: 15,
    fontWeight: '600',
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
  errorText: {
    marginTop: 6,
    color: '#f87171',
    textAlign: 'center',
  },
});

function withAlpha(color: string, alpha: number): string {
  if (!color) return color;
  const normalized = color.trim();
  if (normalized.startsWith('#')) {
    const hex = normalized.slice(1);
    const expanded =
      hex.length === 3
        ? hex
            .split('')
            .map((char) => `${char}${char}`)
            .join('')
        : hex;
    if (expanded.length === 6) {
      const r = parseInt(expanded.slice(0, 2), 16);
      const g = parseInt(expanded.slice(2, 4), 16);
      const b = parseInt(expanded.slice(4, 6), 16);
      const clampedAlpha = Math.max(0, Math.min(alpha, 1));
      return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`;
    }
  }
  return color;
}
