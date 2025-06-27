import { AppContainer } from '@/components/AppContainer';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { Stack } from 'expo-router';
import React from 'react';

function LayoutInner() {
  const { loading } = useAuth();
  if (loading) return null;
  // Auth requirement temporarily disabled for development
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
