/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

export function useThemeColor(
  props: Partial<Record<keyof typeof Colors, string>>,
  colorName: keyof (typeof Colors)['light']
) {
  const theme = (useColorScheme() ?? 'light') as keyof typeof Colors;
  const colorFromProps = props[theme];

  if (colorFromProps) {
    return colorFromProps;
  } else {
    return Colors[theme][colorName];
  }
}
