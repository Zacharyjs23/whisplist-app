import { AppContainer } from '@/components/AppContainer';
import { AuthSessionProvider, useAuthSession } from '@/contexts/AuthSessionContext';
import { AuthFlowsProvider } from '@/contexts/AuthFlowsContext';
import { ReferralProvider } from '@/contexts/ReferralContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { SavedWishesProvider } from '@/contexts/SavedWishesContext';
import { I18nProvider } from '@/contexts/I18nContext';
import * as logger from '@/shared/logger';
import { Stack, useRouter, usePathname } from 'expo-router';
import React, { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

function LayoutInner() {
  const { loading } = useAuthSession();
  const router = useRouter();
  const pathname = usePathname();

  if (loading === undefined) {
    logger.error('AuthContext loading value undefined');
  }

  useEffect(() => {
    const check = async () => {
      try {
        const seen = await AsyncStorage.getItem('hasSeenOnboarding');
        const accepted = await AsyncStorage.getItem('acceptedTerms');
        if ((!seen || !accepted) && pathname !== '/Onboarding') {
          router.replace('/Onboarding');
        }
      } catch (err) {
        logger.warn('Failed to load onboarding flags', err);
      }
    };
    check();
  }, [pathname, router]);

  if (loading) return null;
  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function Layout() {
  return (
    <AuthSessionProvider>
      <AuthFlowsProvider>
        <ReferralProvider>
          <I18nProvider>
            <ThemeProvider>
              <SavedWishesProvider>
                <AppContainer>
                  <LayoutInner />
                </AppContainer>
              </SavedWishesProvider>
            </ThemeProvider>
          </I18nProvider>
        </ReferralProvider>
      </AuthFlowsProvider>
    </AuthSessionProvider>
  );
}
