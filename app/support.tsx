import React from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Linking,
} from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from '@/contexts/I18nContext';
import { trackEvent } from '@/helpers/analytics';

const SUPPORT_RESOURCES: readonly {
  label: string;
  description: string;
  url: string;
}[] = [
  {
    label: '988 Suicide & Crisis Lifeline',
    description: '24/7 confidential support (US).',
    url: 'tel:988',
  },
  {
    label: 'Crisis Text Line',
    description:
      'Text HOME to 741741 (US/Canada), 85258 (UK), 50808 (Ireland).',
    url: 'https://www.crisistextline.org/',
  },
  {
    label: 'Trans Lifeline',
    description: 'Peer support hotline run by and for trans people.',
    url: 'tel:8775658860',
  },
  {
    label: 'Find local resources',
    description: 'Search Befrienders Worldwide for hotlines in your area.',
    url: 'https://www.befrienders.org/',
  },
];

export default function SupportScreen() {
  const { theme } = useTheme();
  const { t } = useTranslation();

  React.useEffect(() => {
    try {
      trackEvent('support_screen_view', {});
    } catch {}
  }, []);

  const openLink = (resource: (typeof SUPPORT_RESOURCES)[number]) => {
    try {
      trackEvent('support_resource_opened', {
        label: resource.label,
        url: resource.url,
      });
    } catch {}
    Linking.openURL(resource.url).catch(() => {});
  };

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background }]}
      accessibilityRole="summary"
      accessibilityLabel={t('support.screenTitle', 'Support resources')}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: theme.text }]}>
          {t('support.title', 'You are not alone')}
        </Text>
        <Text style={[styles.subtitle, { color: theme.placeholder }]}>
          {t(
            'support.subtitle',
            'Reach out to trained listeners or emergency services. If you are in immediate danger, call your local emergency number.',
          )}
        </Text>
        {SUPPORT_RESOURCES.map((resource) => (
          <TouchableOpacity
            key={resource.label}
            style={[
              styles.card,
              { backgroundColor: theme.input, borderColor: theme.placeholder },
            ]}
            onPress={() => openLink(resource)}
            accessibilityRole="button"
            accessibilityLabel={resource.label}
          >
            <Text style={[styles.cardTitle, { color: theme.text }]}>
              {resource.label}
            </Text>
            <Text
              style={[styles.cardDescription, { color: theme.placeholder }]}
            >
              {resource.description}
            </Text>
          </TouchableOpacity>
        ))}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.placeholder }]}>
            {t(
              'support.footer',
              'WhispList is not a crisis service. Call your local emergency number if you or someone else is in danger.',
            )}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 18,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
  },
  cardDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  footer: {
    marginTop: 24,
  },
  footerText: {
    fontSize: 12,
    lineHeight: 18,
  },
});
