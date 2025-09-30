import React, { type ReactNode } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  View,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';

export type ThemedButtonProps = {
  title: string;
  onPress: () => void | Promise<void>;
  disabled?: boolean;
  leftIcon?: ReactNode;
  loading?: boolean;
} & React.ComponentProps<typeof import('react-native').TouchableOpacity> & {
    accessibilityLabel?: string;
    accessibilityRole?: string;
  };

export default function ThemedButton({
  title,
  onPress,
  disabled,
  leftIcon,
  loading,
  ...rest
}: ThemedButtonProps) {
  const { theme } = useTheme();
  const isDisabled = disabled || loading;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      style={[
        styles.button,
        { backgroundColor: theme.tint, opacity: isDisabled ? 0.6 : 1 },
      ]}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      {...rest}
    >
      <View style={styles.contentRow}>
        {leftIcon ? (
          <View style={styles.leftIcon}>{leftIcon}</View>
        ) : null}
        {loading ? (
          <ActivityIndicator size="small" color={theme.text} />
        ) : (
          <Text style={[styles.text, { color: theme.text }]}>{title}</Text>
        )}
      </View>
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
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  leftIcon: {
    marginRight: 10,
  },
  text: {
    fontWeight: '600',
    fontSize: 16,
  },
});
