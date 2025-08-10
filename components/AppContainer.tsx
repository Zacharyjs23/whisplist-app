import React, { useEffect } from 'react';
import { Alert, SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthFlows } from '@/contexts/AuthFlowsContext';
import { useTranslation } from '@/contexts/I18nContext';
import usePushNotifications from '@/hooks/usePushNotifications';
import useDailyQuote from '@/hooks/useDailyQuote';

export const AppContainer: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { theme } = useTheme();
  const { authError, setAuthError } = useAuthFlows();
  const { t } = useTranslation();
  const backgroundColor = theme.background;
  const barStyle =
    theme.name === 'dark' || theme.name === 'neon'
      ? 'light-content'
      : 'dark-content';
  usePushNotifications();
  useDailyQuote();

  useEffect(() => {
    if (authError) {
      Alert.alert(t('auth.errorTitle'), authError, [
        { text: t('common.ok'), onPress: () => setAuthError(null) },
      ]);
    }
  }, [authError, setAuthError, t]);

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
