import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from '@/contexts/I18nContext';

export type SafetySupportCTAProps = {
  onPressResources: () => void;
  onPressEmergency?: () => void;
  emergencyNumber?: string | null;
  tintColor: string;
  backgroundColor: string;
  textColor: string;
};

export const SafetySupportCTA: React.FC<SafetySupportCTAProps> = ({
  onPressResources,
  onPressEmergency,
  emergencyNumber,
  tintColor,
  backgroundColor,
  textColor,
}) => {
  const { t } = useTranslation();
  const titleText = t('safety.cta.title', 'Need support?');
  const bodyText = t(
    'safety.cta.body',
    'Tap resources for moderated helplines or reach emergency help if you’re in danger.',
  );
  const resourcesText = t('safety.cta.resources', 'Resources');
  const emergencyText = emergencyNumber
    ? t('safety.cta.emergencyButton', { number: emergencyNumber })
    : t('safety.cta.emergencyFallback', 'Emergency');
  return (
    <View
      style={[styles.card, { backgroundColor }]}
      accessibilityRole="summary"
      accessibilityLabel={t(
        'safety.cta.accessibilityLabel',
        'Community safety notice',
      )}
    >
      <View style={styles.textWrap}>
        <Text style={[styles.title, { color: textColor }]}>{titleText}</Text>
        <Text style={[styles.body, { color: textColor }]}>{bodyText}</Text>
      </View>
      <View style={styles.buttonRow}>
        <TouchableOpacity
          onPress={onPressResources}
          style={[styles.button, { borderColor: tintColor }]}
          accessibilityRole="button"
          accessibilityLabel={t(
            'safety.cta.resourcesA11y',
            'Open support resources',
          )}
        >
          <Text style={[styles.buttonText, { color: tintColor }]}>
            {resourcesText}
          </Text>
        </TouchableOpacity>
        {onPressEmergency ? (
          <TouchableOpacity
            onPress={onPressEmergency}
            style={[
              styles.button,
              styles.emergencyButton,
              { backgroundColor: tintColor },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t(
              'safety.cta.emergencyA11y',
              'Call emergency services',
            )}
          >
            <Text style={[styles.buttonText, styles.emergencyText]}>
              {emergencyText}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  textWrap: {
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  body: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  button: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 12,
  },
  emergencyButton: {
    borderWidth: 0,
  },
  buttonText: {
    fontWeight: '600',
  },
  emergencyText: {
    color: '#fff',
  },
});
