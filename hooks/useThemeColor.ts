/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/Colors';
import { useTheme } from '@/contexts/ThemeContext';

export function useThemeColor(
  props: Partial<Record<keyof typeof Colors, string>>,
  colorName: keyof (typeof Colors)['light']
) {
  const { theme } = useTheme();
  const themeName = theme.name as keyof typeof Colors;
  const colorFromProps = props[themeName];

  if (colorFromProps) {
    return colorFromProps;
  } else {
    return theme[colorName];
  }
}
