import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '@/constants/Colors';

export type Theme = keyof typeof Colors;

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  setTheme: () => {},
  toggleTheme: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemTheme = useRNColorScheme() as Theme;
  const [theme, setThemeState] = useState<Theme>('light');

  useEffect(() => {
    const load = async () => {
      const stored = await AsyncStorage.getItem('appTheme');
      if (stored && (stored in Colors)) {
        setThemeState(stored as Theme);
      } else if (systemTheme) {
        setThemeState(systemTheme);
      }
    };
    load();
  }, [systemTheme]);

  const setTheme = async (val: Theme) => {
    setThemeState(val);
    await AsyncStorage.setItem('appTheme', val);
  };

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
export { ThemeContext };
