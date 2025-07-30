import React, { useCallback } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import type { Wish } from '../types/Wish';
import { updateWishReaction } from '../helpers/firestore';

const typeColors: Record<string, string> = {
  dream: '#312e81',
  advice: '#064e3b',
  confession: '#374151',
};

const moodColors: Record<string, string> = {
  '😢': '#f87171',
  '😐': '#94a3b8',
  '🙂': '#facc15',
  '😄': '#86efac',
};

const reactionMap = {
  pray: '🙏',
  lightbulb: '💡',
  hug: '🫂',
  heart: '❤️',
} as const;

type ReactionKey = keyof typeof reactionMap;

export const WishCard: React.FC<{ wish: Wish; onReport?: () => void }> = ({ wish, onReport }) => {
  const { theme } = useTheme();
  const router = useRouter();

  const borderColor = moodColors[wish.mood || ''] || typeColors[wish.type || ''] || theme.tint;
  const bgTint = `${borderColor}33`;

  const handleReact = useCallback(
    async (key: ReactionKey) => {
      if (!wish.id) return;
      try {
        await updateWishReaction(wish.id, key);
      } catch (err) {
        console.warn('Failed to react', err);
      }
    },
    [wish.id]
  );

  return (
    <View style={[styles.card, { backgroundColor: bgTint, borderLeftColor: borderColor }]}>
      <TouchableOpacity activeOpacity={0.8} onPress={() => router.push(`/wish/${wish.id}`)}>
        <Text style={[styles.category, { color: theme.tint }]}>#{wish.category}</Text>
        <Text style={[styles.text, { color: theme.text }]}>{wish.text}</Text>
        {wish.imageUrl && <Image source={{ uri: wish.imageUrl }} style={styles.preview} />}
      </TouchableOpacity>
      <View style={styles.reactionBar}>
        {(Object.keys(reactionMap) as ReactionKey[]).map((key) => (
          <TouchableOpacity key={key} onPress={() => handleReact(key)} style={styles.reactionButton}>
            <Text style={styles.reactionText}>
              {reactionMap[key]} {wish.reactions?.[key] || 0}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {onReport && (
        <TouchableOpacity onPress={onReport} style={styles.reportButton}>
          <Text style={[styles.reactionText, { color: '#f87171' }]}>Report</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
  },
  category: {
    fontSize: 12,
    marginBottom: 4,
    fontWeight: '600',
  },
  text: {
    fontSize: 16,
  },
  preview: {
    width: '100%',
    height: 200,
    borderRadius: 10,
    marginTop: 8,
  },
  reactionBar: {
    flexDirection: 'row',
    marginTop: 8,
  },
  reactionButton: {
    marginRight: 12,
  },
  reactionText: {
    fontSize: 18,
  },
  reportButton: {
    marginTop: 4,
  },
});

export default WishCard;
