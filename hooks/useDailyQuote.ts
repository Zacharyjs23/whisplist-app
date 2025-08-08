import { useEffect } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DAILY_QUOTE_ENABLED } from '@/constants/featureFlags';

const QUOTES = [
  'Believe in yourself!',
  'Dream big and dare to fail.',
  'Every day is a second chance.',
];

export default function useDailyQuote() {
  useEffect(() => {
    const showQuote = async () => {
      try {
        const enabled = await AsyncStorage.getItem('dailyQuote');
        if (DAILY_QUOTE_ENABLED && enabled === 'true') {
          const q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
          Alert.alert('Motivation', q);
        }
      } catch (err) {
        console.warn('Failed to load daily quote', err);
      }
    };

    showQuote();
  }, []);
}

