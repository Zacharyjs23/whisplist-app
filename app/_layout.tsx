import React from 'react';
import { Slot } from 'expo-router';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { AppContainer } from '@/components/AppContainer';

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AppContainer>
        <Slot />
      </AppContainer>
    </ThemeProvider>
  );
}
