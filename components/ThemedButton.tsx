import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';

export type ThemedButtonProps = {
  title: string;
  onPress: () => void | Promise<void>;
  disabled?: boolean;
} & React.ComponentProps<typeof TouchableOpacity> & {
  accessibilityLabel?: string;
  accessibilityRole?: string;
};

export default function ThemedButton({ title, onPress, disabled, style, ...rest }: ThemedButtonProps) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      {...rest}
      style={[
        styles.button,
        { backgroundColor: theme.tint, opacity: disabled ? 0.6 : 1 },
        style,
      ]}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <Text style={[styles.text, { color: theme.text }]}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  text: {
    fontWeight: '600',
    fontSize: 16,
  },
});
