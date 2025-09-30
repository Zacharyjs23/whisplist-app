import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from '@/contexts/I18nContext';

export interface ActionPrompt {
  key: string;
  icon: string;
  message: string;
  cta: string;
  onPress: () => void;
}

interface Props {
  prompts: ActionPrompt[];
}

const ActionPromptsCard: React.FC<Props> = ({ prompts }) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  if (!prompts.length) return null;
  return (
    <View style={[styles.container, { backgroundColor: theme.input, borderColor: theme.placeholder }]}>
      <Text style={[styles.title, { color: theme.text }]}>{t('home.prompts.title', 'Keep the love going')}</Text>
      {prompts.map((prompt) => (
        <View key={prompt.key} style={styles.row}>
          <Text style={[styles.icon, { color: theme.tint }]} accessibilityLabel={prompt.icon}>
            {prompt.icon}
          </Text>
          <Text style={[styles.message, { color: theme.text }]}>{prompt.message}</Text>
          <TouchableOpacity
            onPress={prompt.onPress}
            style={[styles.button, { backgroundColor: theme.tint }]}
            accessibilityRole="button"
          >
            <Text style={[styles.buttonText, { color: theme.background }]}>{prompt.cta}</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  icon: {
    fontSize: 18,
    marginRight: 8,
  },
  message: {
    flex: 1,
    fontSize: 13,
  },
  button: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  buttonText: {
    fontSize: 12,
    fontWeight: '600',
  },
});

export default ActionPromptsCard;

