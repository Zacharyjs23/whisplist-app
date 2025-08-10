import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Share,
  Alert,
  Animated,
  Modal,
} from 'react-native';
import { useAuthSession } from '@/contexts/AuthSessionContext';
import { useProfile } from '@/hooks/useProfile';
import { useTheme } from '@/contexts/ThemeContext';
import ConfettiCannon from 'react-native-confetti-cannon';
import * as Linking from 'expo-linking';
import { getWish, boostWish } from '../../helpers/wishes';
import { formatTimeLeft } from '../../helpers/time';
import * as logger from '@/shared/logger';

export default function BoostPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, profile } = useAuthSession();
  const { updateProfile } = useProfile();
  const router = useRouter();
  const { theme } = useTheme();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [alreadyBoosted, setAlreadyBoosted] = useState(false);
  const [boostedUntil, setBoostedUntil] = useState<Date | null>(null);
  const [timeLeft, setTimeLeft] = useState('');
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [showConfirm, setShowConfirm] = useState(false);

  const handleFreeBoost = async () => {
    if (alreadyBoosted) {
      Alert.alert('This wish is already boosted — try again later.');
      return;
    }
    if (!id || !profile) return;
    try {
      await boostWish(id, 24);
      await updateProfile({ boostCredits: (profile.boostCredits || 1) - 1 });
      setBoostedUntil(new Date(Date.now() + 24 * 60 * 60 * 1000));
      setDone(true);
      setShowConfirm(true);
      setTimeout(() => setShowConfirm(false), 3000);
    } catch (err) {
      logger.error('Failed to apply free boost', err);
    }
  };

  useEffect(() => {
    const checkBoost = async () => {
      if (!id) return;
      const wish = await getWish(id);
      if (
        wish?.boostedUntil &&
        wish.boostedUntil.toDate &&
        wish.boostedUntil.toDate() > new Date()
      ) {
        setAlreadyBoosted(true);
        setBoostedUntil(wish.boostedUntil.toDate());
        Alert.alert('This wish is already boosted — try again later.');
      }
    };
    checkBoost();
  }, [id]);

  useEffect(() => {
    if (!boostedUntil) return;
    const update = () => setTimeLeft(formatTimeLeft(boostedUntil));
    update();
    const id = setInterval(update, 60000);
    return () => clearInterval(id);
  }, [boostedUntil]);

  const handleBoost = async () => {
    if (alreadyBoosted) {
      Alert.alert('This wish is already boosted — try again later.');
      return;
    }
    if (!id || !user) return;
    setLoading(true);
    try {
      const resp = await fetch(
        `https://us-central1-${process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID}.cloudfunctions.net/createCheckoutSession`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wishId: id, userId: user.uid }),
        },
      );
      const data = await resp.json();
      if (data.url) {
        await WebBrowser.openBrowserAsync(data.url);
        setBoostedUntil(new Date(Date.now() + 24 * 60 * 60 * 1000));
        setDone(true);
        setShowConfirm(true);
        setTimeout(() => setShowConfirm(false), 3000);
      }
    } catch (err) {
      logger.error('Failed to create checkout session', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!done) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [done, pulseAnim]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Modal
        visible={showConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirm(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowConfirm(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.input }]}>
            <Text style={{ color: theme.text, textAlign: 'center' }}>
              🚀 Your wish has been boosted for 24 hours.
            </Text>
          </View>
        </TouchableOpacity>
      </Modal>
      {done ? (
        <>
          <ConfettiCannon count={120} origin={{ x: 0, y: 0 }} fadeOut />
          <Animated.Text
            style={{
              color: theme.text,
              marginBottom: 20,
              fontSize: 18,
              transform: [{ scale: pulseAnim }],
            }}
          >
            ✨ Wish Boosted!
          </Animated.Text>
          {timeLeft && (
            <Text style={{ color: theme.tint, marginBottom: 20 }}>
              ⏳ {timeLeft}
            </Text>
          )}
          <TouchableOpacity
            onPress={async () => {
              const url = Linking.createURL(`/wish/${id}`);
              await Share.share({ message: `Check out my wish: ${url}` });
            }}
            style={[styles.button, { marginBottom: 10 }]}
          >
            <Text style={styles.buttonText}>Let others support your wish</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()} style={styles.button}>
            <Text style={styles.buttonText}>Go Back</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={{ color: theme.text, marginBottom: 20 }}>
            Boost this wish for $0.50
          </Text>
          {profile?.boostCredits && profile.boostCredits > 0 && (
            <TouchableOpacity
              onPress={handleFreeBoost}
              style={[styles.button, { marginBottom: 10 }]}
            >
              <Text style={styles.buttonText}>
                Use Free Boost ({profile.boostCredits})
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={handleBoost}
            style={styles.button}
            disabled={loading || alreadyBoosted}
          >
            {loading ? (
              <ActivityIndicator color={theme.text} />
            ) : (
              <Text style={[styles.buttonText, { color: theme.text }]}>
                Boost 🚀
              </Text>
            )}
          </TouchableOpacity>
          {alreadyBoosted && (
            <Text
              style={{ color: theme.text, marginTop: 10, textAlign: 'center' }}
            >
              This wish is already boosted—try again later.
            </Text>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  button: {
    backgroundColor: '#facc15',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 20,
  },
  modalContent: {
    padding: 20,
    borderRadius: 10,
  },
});
