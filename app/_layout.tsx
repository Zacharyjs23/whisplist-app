import React from 'react';
import { Redirect, Slot } from 'expo-router';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { AppContainer } from '@/components/AppContainer';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';

function LayoutInner() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Redirect href="/auth" />;
  return <Slot />;
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
