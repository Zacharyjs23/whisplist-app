import React, { useEffect, useRef } from 'react';
import { Animated, Text, TouchableOpacity, View, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from '@/contexts/I18nContext';

const CAN_USE_NATIVE_DRIVER = Platform.OS !== 'web';

interface Props {
  visible: boolean;
  text: string;
  onDismiss: () => void;
  onTurnOffToday: () => void;
  onOpenSettings: () => void;
  styleName?: string;
}

export const DailyQuoteBanner: React.FC<Props> = ({
  visible,
  text,
  onDismiss,
  onTurnOffToday,
  onOpenSettings,
  styleName,
}) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      anim.setValue(0);
      Animated.timing(anim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: CAN_USE_NATIVE_DRIVER,
      }).start();
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      Animated.timing(anim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: CAN_USE_NATIVE_DRIVER,
      }).start();
    }
  }, [visible, anim]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.banner,
        {
          backgroundColor: theme.input,
          opacity: anim,
          transform: [
            {
              translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }),
            },
          ],
        },
      ]}
      accessibilityRole="summary"
      accessibilityLabel={t('dailyQuote.title')}
    >
      <Text style={[styles.title, { color: theme.tint }]}>{t('dailyQuote.title')}</Text>
      <Text style={[styles.text, { color: theme.text }]}>{text}</Text>
      {!!styleName && (
        <Text style={[styles.styleCaption, { color: theme.text }]}>• {t(`dailyQuote.styles.${styleName}`, styleName)}</Text>
      )}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          onPress={onTurnOffToday}
          accessibilityRole="button"
          accessibilityLabel={t('dailyQuote.turnOffToday', 'Turn off for today')}
        >
          <Text style={[styles.action, { color: theme.tint }]}>
            {t('dailyQuote.turnOffToday', 'Turn off for today')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onOpenSettings}
          accessibilityRole="button"
          accessibilityLabel={t('dailyQuote.openSettings', 'Settings')}
        >
          <Text style={[styles.action, { color: theme.tint }]}>
            {t('dailyQuote.openSettings', 'Settings')}
          </Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        onPress={onDismiss}
        style={styles.dismiss}
        accessibilityRole="button"
        accessibilityLabel={t('dailyQuote.dismiss', 'Dismiss')}
      >
        <Ionicons name="close" size={16} color={theme.text} />
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  banner: {
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    position: 'relative',
  },
  title: {
    fontWeight: '600',
    marginBottom: 4,
  },
  text: {
    fontSize: 14,
    paddingRight: 20,
  },
  actionsRow: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  action: {
    textDecorationLine: 'underline',
  },
  dismiss: {
    position: 'absolute',
    right: 8,
    top: 8,
    padding: 4,
    borderRadius: 12,
  },
  styleCaption: {
    opacity: 0.7,
    fontSize: 12,
    marginTop: 6,
  },
});

export default DailyQuoteBanner;
