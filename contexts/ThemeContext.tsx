import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '@/constants/Colors';
import * as logger from '@/shared/logger';

export type ThemeName = keyof typeof Colors;
export type Theme = { name: ThemeName } & (typeof Colors)['light'];

interface ThemeContextValue {
  theme: Theme;
  setTheme: (themeName: ThemeName) => Promise<void>;
  toggleTheme: () => Promise<void>;
}

const defaultTheme: Theme = { name: 'light', ...Colors.light };
const ThemeContext = createContext<ThemeContextValue>({
  theme: defaultTheme,
  setTheme: async () => {},
  toggleTheme: async () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const systemTheme = useRNColorScheme() as ThemeName;
  const [themeName, setThemeName] = useState<ThemeName>('light');

  useEffect(() => {
    const load = async () => {
      try {
        const stored = await AsyncStorage.getItem('appTheme');
        if (stored && stored in Colors) {
          setThemeName(stored as ThemeName);
          return;
        }
      } catch (err) {
        logger.warn('Failed to load appTheme from storage', err);
      }
      setThemeName(systemTheme || 'light');
    };
    load();
  }, [systemTheme]);

  const setTheme = async (val: ThemeName): Promise<void> => {
    setThemeName(val);
    try {
      await AsyncStorage.setItem('appTheme', val);
    } catch (err) {
      logger.warn('Failed to save appTheme to storage', err);
    }
  };

  const toggleTheme = async (): Promise<void> => {
    await setTheme(themeName === 'light' ? 'dark' : 'light');
  };

  const theme: Theme = { name: themeName, ...Colors[themeName] };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
export { ThemeContext };
