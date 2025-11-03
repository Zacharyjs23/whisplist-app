import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { RectButton, Swipeable } from 'react-native-gesture-handler';
import { usePinnedWishlists } from '@/contexts/PinnedWishlistsContext';

export type PinSummary = {
  id: string;
  title: string;
  coverUri?: string | null;
};

type PinnedRailProps = {
  pins: PinSummary[];
  onPinPress?: (pin: PinSummary) => void;
};

const CARD_WIDTH = 140;
const CARD_HEIGHT = 110;

const fallbackColors = [
  '#f97316',
  '#10b981',
  '#6366f1',
  '#ec4899',
  '#06b6d4',
];

function useFallbackColor(id: string) {
  const index = useMemo(() => {
    if (!id) return 0;
    let hash = 0;
    for (let i = 0; i < id.length; i += 1) {
      hash = (hash + id.charCodeAt(i) * 31) % fallbackColors.length;
    }
    return hash;
  }, [id]);
  return fallbackColors[index];
}

const PinCard = memo(function PinCard({
  pin,
  onPress,
}: {
  pin: PinSummary;
  onPress?: (pin: PinSummary) => void;
}) {
  const { title, coverUri } = pin;
  const color = useFallbackColor(pin.id);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress?.(pin)}
      accessibilityRole="tab"
      accessibilityLabel={title}
    >
      <View style={styles.imageWrapper}>
        {coverUri ? (
          <Image
            source={{ uri: coverUri }}
            style={styles.cover}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={[styles.cover, { backgroundColor: color }]} />
        )}
      </View>
      <Text style={styles.cardTitle} numberOfLines={2}>
        {title || 'Wishlist'}
      </Text>
    </TouchableOpacity>
  );
});

export const PinnedRail: React.FC<PinnedRailProps> = ({ pins, onPinPress }) => {
  const { unpinWishlist } = usePinnedWishlists();
  const [items, setItems] = useState<PinSummary[]>(pins);
  const pendingAction = useRef<string | null>(null);

  useEffect(() => {
    setItems(pins);
  }, [pins]);

  const notifyError = useCallback((message: string) => {
    if (Platform.OS === 'android') {
      ToastAndroid.show(message, ToastAndroid.SHORT);
    } else {
      Alert.alert('Action failed', message);
    }
  }, []);

  const handleUnpin = useCallback(
    async (pin: PinSummary) => {
      if (!pin?.id) return;
      if (pendingAction.current === pin.id) return;
      pendingAction.current = pin.id;
      const snapshot = items;
      setItems((prev) => prev.filter((item) => item.id !== pin.id));
      try {
        await unpinWishlist(pin.id);
      } catch (err) {
        notifyError(
          err instanceof Error ? err.message : 'Failed to unpin wishlist',
        );
        setItems(snapshot);
      } finally {
        pendingAction.current = null;
      }
    },
    [items, notifyError, unpinWishlist],
  );

  const renderAction = useCallback(
    (pin: PinSummary) => (
      <RectButton
        style={styles.unpinButton}
        onPress={() => handleUnpin(pin)}
        accessibilityRole="button"
        accessibilityLabel={`Unpin ${pin.title}`}
      >
        <Text style={styles.unpinText}>Unpin</Text>
      </RectButton>
    ),
    [handleUnpin],
  );

  const renderItem = useCallback(
    ({ item }: { item: PinSummary }) => (
      <Swipeable
        renderRightActions={() => renderAction(item)}
        overshootRight={false}
      >
        <PinCard pin={item} onPress={onPinPress} />
      </Swipeable>
    ),
    [onPinPress, renderAction],
  );

  if (!items.length) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Pin a list to find it fast.</Text>
      </View>
    );
  }

  return (
    <FlatList
      horizontal
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      contentContainerStyle={styles.listContent}
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
    />
  );
};

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  card: {
    width: CARD_WIDTH,
    marginRight: 12,
  },
  imageWrapper: {
    borderRadius: 16,
    overflow: 'hidden',
    height: CARD_HEIGHT,
    marginBottom: 8,
    backgroundColor: '#1f2937',
  },
  cover: {
    width: '100%',
    height: '100%',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  unpinButton: {
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    borderRadius: 16,
    marginVertical: 4,
  },
  unpinText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  emptyContainer: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
  },
});

export default PinnedRail;
