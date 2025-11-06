import React, { useMemo } from 'react';
import { ScrollView, Text, StyleSheet, View } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from '@/contexts/I18nContext';

const termKeys = [
  'acceptance',
  'usage',
  'accounts',
  'ownership',
  'termination',
  'disclaimer',
  'changes',
] as const;

const createStyles = (color: string) =>
  StyleSheet.create({
    container: {
      padding: 20,
    },
    title: {
      fontSize: 20,
      fontWeight: 'bold',
      marginBottom: 10,
      color,
    },
    itemRow: {
      flexDirection: 'row',
      marginBottom: 10,
    },
    itemNumber: {
      marginRight: 8,
      color,
      fontWeight: 'bold',
    },
    itemBody: {
      flex: 1,
      color,
    },
    itemTitle: {
      fontWeight: 'bold',
      color,
    },
  });

export default function TermsScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(theme.text), [theme.text]);

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.container}
      accessibilityLabel={t('termsScreen.title')}
    >
      <Text style={styles.title}>{t('termsScreen.title')}</Text>
      {termKeys.map((key) => (
        <View key={key} style={styles.itemRow}>
          <Text style={styles.itemNumber}>
            {t(`termsScreen.items.${key}.number`)}
          </Text>
          <Text style={styles.itemBody}>
            <Text style={styles.itemTitle}>
              {t(`termsScreen.items.${key}.title`)}
            </Text>{' '}
            {t(`termsScreen.items.${key}.description`)}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}
