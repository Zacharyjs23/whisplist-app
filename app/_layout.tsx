import { AppContainer } from '@/components/AppContainer';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { SavedWishesProvider } from '@/contexts/SavedWishesContext';
import { I18nProvider } from '@/contexts/I18nContext';
import * as logger from '@/helpers/logger';
import { Stack, useRouter, usePathname } from 'expo-router';
import React, { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

function LayoutInner() {
  const { loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  if (loading === undefined) {
    logger.error('AuthContext loading value undefined');
  }

  useEffect(() => {
    const check = async () => {
      const seen = await AsyncStorage.getItem('hasSeenOnboarding');
      const accepted = await AsyncStorage.getItem('acceptedTerms');
      if ((!seen || !accepted) && pathname !== '/Onboarding') {
        router.replace('/Onboarding');
      }
    };
    check();
  }, [pathname, router]);

  if (loading) return null;
  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function Layout() {
  return (
    <AuthProvider>
      <I18nProvider>
        <ThemeProvider>
          <SavedWishesProvider>
            <AppContainer>
              <LayoutInner />
            </AppContainer>
          </SavedWishesProvider>
        </ThemeProvider>
      </I18nProvider>
    </AuthProvider>
  );
}
