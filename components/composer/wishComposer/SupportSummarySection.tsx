import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { withAlpha } from '@/components/composer/composerStyles';
import type { ComposerSharedProps } from './sharedTypes';

type SupportSummarySectionProps = ComposerSharedProps & {
  hasSupportPreview: boolean;
  formattedSupportAmount: string;
  supportAmountRaw: string;
  supportReason: string;
  onEdit: () => void;
  onClear: () => void;
};

export const SupportSummarySection: React.FC<SupportSummarySectionProps> = ({
  hasSupportPreview,
  formattedSupportAmount,
  supportAmountRaw,
  supportReason,
  onEdit,
  onClear,
  styles,
  theme,
  typeColor,
  t,
  hitSlop,
}) => {
  if (!hasSupportPreview) {
    return null;
  }

  return (
    <View
      style={[
        styles.supportSummaryCard,
        { borderColor: withAlpha(typeColor, 0.35) },
      ]}
    >
      <View style={styles.supportSummaryHeader}>
        <Text style={[styles.supportSummaryTitle, { color: theme.text }]}>
          {t('composer.supportSummaryTitle', 'Support request preview')}
        </Text>
        <TouchableOpacity onPress={onEdit} hitSlop={hitSlop}>
          <Text style={[styles.supportSummaryLink, { color: theme.tint }]}>
            {t('composer.supportSummaryEdit', 'Edit')}
          </Text>
        </TouchableOpacity>
      </View>
      {supportAmountRaw.trim().length > 0 ? (
        <Text style={[styles.supportSummaryAmount, { color: theme.tint }]}>
          {formattedSupportAmount}
        </Text>
      ) : null}
      {supportReason.trim().length > 0 ? (
        <Text style={[styles.supportSummaryText, { color: theme.text }]}>
          {supportReason.trim()}
        </Text>
      ) : null}
      <TouchableOpacity onPress={onClear} hitSlop={hitSlop}>
        <Text style={[styles.supportSummaryLink, { color: theme.placeholder }]}>
          {t('composer.supportSummaryClear', 'Clear support request')}
        </Text>
      </TouchableOpacity>
    </View>
  );
};
