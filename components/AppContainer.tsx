import React, { useEffect } from 'react';
import { Alert, SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import usePushNotifications from '@/hooks/usePushNotifications';
import { useAuth } from '@/contexts/AuthContext';

export const AppContainer: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { theme } = useTheme();
  const { authError, setAuthError } = useAuth();
  const backgroundColor = theme.background;
  const barStyle =
    theme.name === 'dark' || theme.name === 'neon'
      ? 'light-content'
      : 'dark-content';
  usePushNotifications();

  useEffect(() => {
    if (authError) {
      Alert.alert('Authentication Error', authError, [
        { text: 'OK', onPress: () => setAuthError(null) },
      ]);
    }
  }, [authError, setAuthError]);

  useEffect(() => {
    const showQuote = async () => {
      const enabled = await AsyncStorage.getItem('dailyQuote');
      if (enabled === 'true') {
        const quotes = [
          'Believe in yourself!',
          'Dream big and dare to fail.',
          'Every day is a second chance.',
        ];
        const q = quotes[Math.floor(Math.random() * quotes.length)];
        Alert.alert('Motivation', q);
      }
    };
    showQuote();
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.container, { backgroundColor }]}>
        <StatusBar barStyle={barStyle} />
        {children}
      </SafeAreaView>
    </SafeAreaProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
