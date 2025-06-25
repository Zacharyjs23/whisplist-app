import React from 'react';
import { StyleSheet, Switch } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/contexts/ThemeContext';

export default function SettingsScreen() {
  const { theme, toggleTheme } = useTheme();

  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.label}>Dark Mode</ThemedText>
      <Switch value={theme === 'dark'} onValueChange={toggleTheme} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  label: {
    marginBottom: 12,
    fontSize: 18,
  },
});
