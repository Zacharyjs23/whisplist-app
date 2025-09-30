import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

type Props = {
  hasPending: boolean;
  pendingText: string;
  postedCount: number;
  postedText: (count: number) => string;
  pillColor: string;
  cardColor: string;
  textColor: string;
};

export const OfflineQueueBanner = React.memo(function OfflineQueueBanner({
  hasPending,
  pendingText,
  postedCount,
  postedText,
  pillColor,
  cardColor,
  textColor,
}: Props) {
  if (!hasPending && postedCount <= 0) {
    return null;
  }
  return (
    <>
      {hasPending ? (
        <View style={[styles.pill, { backgroundColor: pillColor }]}>
          <Text style={[styles.pillText, { color: textColor }]}>{pendingText}</Text>
        </View>
      ) : null}
      {postedCount > 0 ? (
        <View style={[styles.card, { backgroundColor: cardColor }]}>
          <Text style={[styles.cardText, { color: textColor }]}>{postedText(postedCount)}</Text>
        </View>
      ) : null}
    </>
  );
});

const styles = StyleSheet.create({
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignSelf: 'center',
    marginBottom: 10,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '600',
  },
  card: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
  cardText: {
    textAlign: 'center',
    fontSize: 14,
  },
});

export default OfflineQueueBanner;
