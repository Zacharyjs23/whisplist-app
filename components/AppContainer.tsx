import React, { useEffect } from 'react';
import { Alert, SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/useColorScheme';
import usePushNotifications from '@/hooks/usePushNotifications';

export const AppContainer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const theme = useColorScheme();
  const backgroundColor = theme === 'dark' ? '#0e0e0e' : '#fff';
  const barStyle = theme === 'dark' ? 'light-content' : 'dark-content';
  usePushNotifications();

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
