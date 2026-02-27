import React, { useMemo } from 'react';
import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from '@/contexts/I18nContext';

const itemKeys = [
  'account',
  'wishes',
  'analytics',
  'payments',
  'choices',
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
    intro: {
      marginBottom: 10,
      color,
    },
    bulletRow: {
      flexDirection: 'row',
      marginBottom: 10,
    },
    bulletSymbol: {
      fontSize: 18,
      marginRight: 8,
      color,
    },
    bulletTitle: {
      fontWeight: 'bold',
      color,
    },
    bulletBody: {
      color,
    },
  });

export default function PrivacyScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(theme.text), [theme.text]);

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.container}
      accessibilityLabel={t('privacyScreen.title')}
    >
      <Text style={styles.title}>{t('privacyScreen.title')}</Text>
      <Text style={styles.intro}>{t('privacyScreen.intro')}</Text>
      {itemKeys.map((key) => (
        <View key={key} style={styles.bulletRow}>
          <Text style={styles.bulletSymbol} accessibilityRole="text">
            •
          </Text>
          <Text style={styles.bulletBody}>
            <Text style={styles.bulletTitle}>
              {t(`privacyScreen.items.${key}.title`)}
            </Text>{' '}
            {t(`privacyScreen.items.${key}.description`)}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}
