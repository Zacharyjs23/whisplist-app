import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';

type ProgressBarProps = {
  progress: number;
  height?: number;
  trackColor?: string;
  fillColor?: string;
};

export const SplitPayProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  height = 8,
  trackColor,
  fillColor,
}) => {
  const { theme } = useTheme();
  const safeProgress = Number.isFinite(progress)
    ? Math.max(0, Math.min(progress, 1))
    : 0;
  return (
    <View
      style={[
        styles.track,
        { height, backgroundColor: trackColor ?? `${theme.placeholder}33` },
      ]}
    >
      <View
        style={[
          styles.fill,
          {
            width: `${safeProgress * 100}%`,
            backgroundColor: fillColor ?? theme.tint,
            borderRadius: height / 2,
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  track: {
    width: '100%',
    borderRadius: 999,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
});
