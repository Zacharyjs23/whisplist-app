import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';

const SkeletonCard: React.FC = () => {
  const { theme } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.input + '' }]}>
      <View style={[styles.pill, { backgroundColor: theme.placeholder + '33' }]} />
      <View style={[styles.line, { backgroundColor: theme.placeholder + '44' }]} />
      <View style={[styles.lineShort, { backgroundColor: theme.placeholder + '44' }]} />
      <View style={[styles.image, { backgroundColor: theme.placeholder + '22' }]} />
      <View style={[styles.row]}>
        <View style={[styles.reaction, { backgroundColor: theme.placeholder + '33' }]} />
        <View style={[styles.reaction, { backgroundColor: theme.placeholder + '33' }]} />
        <View style={[styles.reaction, { backgroundColor: theme.placeholder + '33' }]} />
      </View>
    </View>
  );
};

export const FeedSkeleton: React.FC<{ count?: number } > = ({ count = 3 }) => {
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  pill: {
    width: 90,
    height: 12,
    borderRadius: 6,
    marginBottom: 8,
  },
  line: {
    height: 14,
    borderRadius: 7,
    marginBottom: 6,
  },
  lineShort: {
    width: '60%',
    height: 14,
    borderRadius: 7,
    marginBottom: 10,
  },
  image: {
    width: '100%',
    height: 140,
    borderRadius: 10,
  },
  row: {
    flexDirection: 'row',
    marginTop: 12,
  },
  reaction: {
    height: 28,
    borderRadius: 14,
    marginRight: 8,
    flexBasis: 64,
    flexGrow: 0,
  },
});

export default FeedSkeleton;

