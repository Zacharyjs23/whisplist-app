import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';

const CAN_USE_NATIVE_DRIVER = Platform.OS !== 'web';

export const reactionMap = {
  pray: '🙏',
  lightbulb: '💡',
  hug: '🫂',
  heart: '❤️',
} as const;

export type ReactionKey = keyof typeof reactionMap;

interface ReactionBarProps {
  counts: Record<ReactionKey, number>;
  userReaction: ReactionKey | null;
  onReact: (key: ReactionKey) => void;
  onToggleSave: () => void;
  isSaved: boolean;
  disabled?: boolean;
}

export const ReactionBar: React.FC<ReactionBarProps> = ({
  counts,
  userReaction,
  onReact,
  onToggleSave,
  isSaved,
  disabled = false,
}) => {
  const { theme } = useTheme();
  const reactionScales = useRef(
    (Object.keys(reactionMap) as ReactionKey[]).reduce((acc, k) => {
      acc[k] = new Animated.Value(1);
      return acc;
    }, {} as Record<ReactionKey, Animated.Value>),
  ).current;

  return (
    <View style={styles.reactionBar}>
      {(Object.keys(reactionMap) as ReactionKey[]).map((key) => (
        <Animated.View key={key} style={{ transform: [{ scale: reactionScales[key] }] }}>
          <TouchableOpacity
            testID={`reaction-${key}`}
            disabled={disabled}
            accessibilityState={disabled ? { disabled: true } : undefined}
            onPressIn={() => {
              if (disabled) return;
              Animated.spring(reactionScales[key], {
                toValue: 1.2,
                useNativeDriver: CAN_USE_NATIVE_DRIVER,
              }).start();
            }}
            onPressOut={() => {
              if (disabled) return;
              Animated.spring(reactionScales[key], {
                toValue: 1,
                useNativeDriver: CAN_USE_NATIVE_DRIVER,
              }).start();
            }}
            onPress={() => {
              if (disabled) return;
              onReact(key);
            }}
            style={[
              styles.reactionButton,
              userReaction === key && { backgroundColor: theme.input },
            ]}
          >
            <Text style={styles.reactionText}>
              {reactionMap[key]} {counts[key] ?? 0}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      ))}
      <TouchableOpacity
        testID="save-button"
        onPress={onToggleSave}
        style={styles.reactionButton}
      >
        <Ionicons
          name={isSaved ? 'bookmark' : 'bookmark-outline'}
          size={20}
          color={theme.tint}
        />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  reactionBar: {
    flexDirection: 'row',
    marginTop: 8,
  },
  reactionButton: {
    marginRight: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  reactionText: {
    fontSize: 18,
  },
});

export default ReactionBar;
