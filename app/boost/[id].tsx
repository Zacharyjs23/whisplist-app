import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';

export default function BoostPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const { theme } = useTheme();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleBoost = async () => {
    if (!id || !user) return;
    setLoading(true);
    try {
      const resp = await fetch(
        `https://us-central1-${process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID}.cloudfunctions.net/createCheckoutSession`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wishId: id, userId: user.uid }),
        }
      );
      const data = await resp.json();
      if (data.url) {
        await WebBrowser.openBrowserAsync(data.url);
        setDone(true);
      }
    } catch (err) {
      console.error('Failed to create checkout session', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {done ? (
        <>
          <Text style={{ color: theme.text, marginBottom: 20 }}>
            Thanks for boosting! Your wish will be highlighted shortly.
          </Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.button}>
            <Text style={styles.buttonText}>Go Back</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={{ color: theme.text, marginBottom: 20 }}>
            Boost this wish for $0.50
          </Text>
          <TouchableOpacity onPress={handleBoost} style={styles.button} disabled={loading}>
            {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.buttonText}>Boost 🚀</Text>}
          </TouchableOpacity>
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
    color: '#000',
    fontWeight: '600',
  },
});
