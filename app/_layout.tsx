import { AppContainer } from '@/components/AppContainer';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { Stack, useRouter, usePathname } from 'expo-router';
import React, { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

function LayoutInner() {
  const { loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const check = async () => {
      const seen = await AsyncStorage.getItem('hasSeenOnboarding');
      if (!seen && pathname !== '/onboarding') {
        router.replace('/onboarding');
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
      <ThemeProvider>
        <AppContainer>
          <LayoutInner />
        </AppContainer>
      </ThemeProvider>
    </AuthProvider>
  );
}
