import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import type { ComposerSharedProps } from './sharedTypes';

type DraftBannerProps = ComposerSharedProps & {
  isDraftLoaded?: boolean;
  draftSavedAt?: number | null;
  onDiscardDraft?: () => void;
  formatSavedAt: (ms: number) => string;
};

export const DraftBanner: React.FC<DraftBannerProps> = ({
  isDraftLoaded,
  draftSavedAt,
  onDiscardDraft,
  formatSavedAt,
  styles,
  theme,
  t,
  hitSlop,
}) => {
  if (!isDraftLoaded) {
    return null;
  }

  return (
    <View style={styles.chipRow}>
      <View style={styles.chip}>
        <Text style={styles.chipText}>
          {t('composer.draftLoaded', 'Draft loaded')}
          {draftSavedAt ? ` · ${formatSavedAt(draftSavedAt)}` : ''}
        </Text>
      </View>
      {onDiscardDraft ? (
        <TouchableOpacity onPress={onDiscardDraft} hitSlop={hitSlop}>
          <Text style={[styles.link, { color: theme.tint }]}>
            {t('composer.discardDraft', 'Discard')}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};
