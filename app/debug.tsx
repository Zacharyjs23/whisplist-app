import React, { useMemo } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '@/contexts/ThemeContext';
import ThemedButton from '@/components/ThemedButton';
import { useTranslation } from '@/contexts/I18nContext';
import usePushNotifications from '@/hooks/usePushNotifications';

export default function DebugScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const pushToken = usePushNotifications();

  const diag = useMemo(
    () => ({
      name: Constants.expoConfig?.name,
      version: Constants.expoConfig?.version,
      runtimeVersion: Constants.expoConfig?.runtimeVersion,
      projectId: (Constants.expoConfig?.extra as any)?.eas?.projectId,
      env: process.env.EXPO_PUBLIC_ENV || 'development',
      appOwnership: Constants.appOwnership,
      deviceName: Constants.deviceName,
      pushToken,
    }),
    [pushToken],
  );

  const copy = async () => {
    await Clipboard.setStringAsync(JSON.stringify(diag, null, 2));
  };

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: theme.background }]}> 
      <Text style={[styles.title, { color: theme.text }]}>
        {t('debug.title', 'Debug Information')}
      </Text>
      {Object.entries(diag).map(([k, v]) => (
        <View key={k} style={styles.row}>
          <Text style={[styles.key, { color: theme.text }]}>{k}</Text>
          <Text style={[styles.value, { color: theme.text }]} numberOfLines={2}>
            {String(v ?? '')}
          </Text>
        </View>
      ))}
      <ThemedButton title={t('debug.copy', 'Copy to Clipboard')} onPress={copy} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  key: {
    width: 120,
    fontWeight: '600',
  },
  value: {
    flex: 1,
  },
});

