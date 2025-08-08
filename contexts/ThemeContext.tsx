import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '@/constants/Colors';

export type ThemeName = keyof typeof Colors;
export type Theme = { name: ThemeName } & (typeof Colors)['light'];

interface ThemeContextValue {
  theme: Theme;
  setTheme: (themeName: ThemeName) => void;
  toggleTheme: () => void;
}

const defaultTheme: Theme = { name: 'light', ...Colors.light };
const ThemeContext = createContext<ThemeContextValue>({
  theme: defaultTheme,
  setTheme: () => {},
  toggleTheme: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const systemTheme = useRNColorScheme() as ThemeName;
  const [themeName, setThemeName] = useState<ThemeName>('light');

  useEffect(() => {
    const load = async () => {
      const stored = await AsyncStorage.getItem('appTheme');
      if (stored && stored in Colors) {
        setThemeName(stored as ThemeName);
      } else if (systemTheme) {
        setThemeName(systemTheme);
      }
    };
    load();
  }, [systemTheme]);

  const setTheme = async (val: ThemeName) => {
    setThemeName(val);
    await AsyncStorage.setItem('appTheme', val);
  };

  const toggleTheme = () => {
    setTheme(themeName === 'light' ? 'dark' : 'light');
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
