import React from 'react';
import { Redirect, Stack } from 'expo-router';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { AppContainer } from '@/components/AppContainer';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';

function LayoutInner() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Redirect href="/auth" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
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
