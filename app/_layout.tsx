import { AppContainer } from '@/components/AppContainer';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { Stack } from 'expo-router';
import React from 'react';

function LayoutInner() {
  const { user, loading } = useAuth();
  if (loading) return null;
  // if (!user) return <Redirect href="/auth" />;
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
