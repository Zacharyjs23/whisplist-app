import { useContext } from 'react';
import { ThemeContext } from '@/contexts/ThemeContext';

export function useColorScheme() {
  const { theme } = useContext(ThemeContext);
  return theme.name;
}
