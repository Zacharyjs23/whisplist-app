import React from 'react';
import { SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/useColorScheme';

export const AppContainer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const theme = useColorScheme();
  const backgroundColor = theme === 'dark' ? '#0e0e0e' : '#fff';
  const barStyle = theme === 'dark' ? 'light-content' : 'dark-content';

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
