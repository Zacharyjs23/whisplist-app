import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from '@/contexts/I18nContext';

export interface ImpactStats {
  wishes: number;
  boosts: number;
  gifts: number;
  giftTotal: number;
}

export const UserImpact: React.FC<{ impact: ImpactStats }> = ({ impact }) => {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { t } = useTranslation();
  const estimatedLikes = impact.wishes > 0 ? impact.boosts * 9 : 0;
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('userImpact.title', 'Your Impact')}</Text>
      <Text style={styles.text}>
        🔥 {t('userImpact.wishes', { count: impact.wishes })}
      </Text>
      <Text style={styles.text}>
        🌟 {t('userImpact.boosts', { count: impact.boosts, likes: estimatedLikes })}
      </Text>
      <Text style={styles.text}>
        🎁 {t('userImpact.gifts', { count: impact.gifts, total: impact.giftTotal })}
      </Text>
    </View>
  );
};

const createStyles = (c: { input: string; text: string }) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.input,
      padding: 12,
      borderRadius: 10,
      marginBottom: 20,
    },
    title: {
      color: c.text,
      fontWeight: '600',
      marginBottom: 8,
      fontSize: 16,
    },
    text: {
      color: c.text,
      fontSize: 14,
      marginBottom: 6,
    },
  });

export default UserImpact;
