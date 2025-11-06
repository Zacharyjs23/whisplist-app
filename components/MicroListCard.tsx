import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import type { Wish } from '@/types/Wish';

export type ResolvedMicroListItem = {
  wish: Wish;
  note?: string;
  affiliateUrl?: string;
};

type MicroListCardProps = {
  title: string;
  coverUrl?: string;
  items: ResolvedMicroListItem[];
  onPressItem: (wish: Wish, index: number) => void;
};

export function MicroListCard({
  title,
  coverUrl,
  items,
  onPressItem,
}: MicroListCardProps) {
  const { theme } = useTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);

  if (!items.length) return null;

  return (
    <View style={styles.card}>
      {coverUrl ? (
        <Image
          source={{ uri: coverUrl }}
          style={styles.cover}
          resizeMode="cover"
        />
      ) : null}
      <Text style={styles.title}>{title}</Text>
      <View style={styles.list}>
        {items.map(({ wish, note }, index) => (
          <TouchableOpacity
            key={wish.id}
            style={styles.item}
            onPress={() => onPressItem(wish, index)}
            accessibilityRole="button"
            accessibilityLabel={wish.text}
          >
            <View style={styles.itemMeta}>
              <Text style={styles.itemTitle} numberOfLines={2}>
                {wish.text}
              </Text>
              {note ? (
                <Text style={styles.itemNote} numberOfLines={2}>
                  {note}
                </Text>
              ) : null}
            </View>
            {wish.imageUrl ? (
              <Image
                source={{ uri: wish.imageUrl }}
                style={styles.thumb}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.thumb, styles.thumbPlaceholder]} />
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

type Theme = ReturnType<typeof useTheme>['theme'];

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.input,
      borderRadius: 20,
      padding: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.placeholder,
      marginBottom: 16,
      overflow: 'hidden',
    },
    cover: {
      width: '100%',
      height: 140,
      borderRadius: 16,
      marginBottom: 12,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.text,
      marginBottom: 12,
    },
    list: {
      gap: 12,
    },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.background,
      borderRadius: 14,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.placeholder,
    },
    itemMeta: {
      flex: 1,
      marginRight: 12,
    },
    itemTitle: {
      color: theme.text,
      fontWeight: '600',
      fontSize: 15,
      marginBottom: 4,
    },
    itemNote: {
      color: theme.placeholder,
      fontSize: 13,
    },
    thumb: {
      width: 56,
      height: 56,
      borderRadius: 12,
      backgroundColor: theme.placeholder,
    },
    thumbPlaceholder: {
      opacity: 0.5,
    },
  });
