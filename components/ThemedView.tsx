import { View, type ViewProps } from 'react-native';
import type { ReactNode } from 'react';

import { useThemeColor } from '@/hooks/useThemeColor';

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
  children?: ReactNode;
};

export function ThemedView({
  style,
  lightColor,
  darkColor,
  children,
  ...otherProps
}: ThemedViewProps) {
  const backgroundColor = useThemeColor(
    { light: lightColor, dark: darkColor },
    'background',
  );

  return (
    <View style={[{ backgroundColor }, style]} {...otherProps}>
      {children}
    </View>
  );
}
