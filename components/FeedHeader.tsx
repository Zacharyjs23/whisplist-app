import React, { useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from '@/contexts/I18nContext';
import type { FilterType } from '@/types/post';
import { POST_TYPE_ORDER, POST_TYPE_META } from '@/types/post';

export const FeedHeader: React.FC<{
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  filterType: FilterType;
  setFilterType: (v: FilterType) => void;
}> = ({ searchTerm, setSearchTerm, filterType, setFilterType }) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const chips: { key: FilterType; label: string }[] = useMemo(
    () => [
      { key: 'all', label: t('feed.filters.all', 'All') },
      ...POST_TYPE_ORDER.map((type) => ({
        key: type,
        label: t(`composer.type.${type}`, POST_TYPE_META[type].defaultLabel),
      })),
    ],
    [t],
  );
  return (
    <View>
      <Text style={styles.label}>{t('feed.searchLabel', 'Search posts')}</Text>
      <TextInput
        style={styles.input}
        placeholder={t('feed.searchPlaceholder', 'Search stories...')}
        placeholderTextColor={theme.placeholder}
        value={searchTerm}
        onChangeText={setSearchTerm}
      />
      <Text style={styles.label}>Quick Filters</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow}>
        {chips.map((c) => {
          const selected = filterType === c.key;
          return (
            <TouchableOpacity
              key={c.key}
              onPress={() => setFilterType(c.key)}
              style={[
                styles.chip,
                {
                  backgroundColor: selected ? theme.tint : theme.input,
                  borderColor: selected ? theme.tint : theme.placeholder,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Filter ${c.label}`}
            >
              <Text style={[styles.chipText, { color: selected ? theme.background : theme.text }]}>
                {c.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const createStyles = (c: { input: string; text: string; placeholder?: string; tint?: string; background?: string }) =>
  StyleSheet.create({
    label: { color: c.text, marginBottom: 4 },
    input: {
      backgroundColor: c.input,
      color: c.text,
      padding: 14,
      borderRadius: 10,
      marginBottom: 10,
    },
    chipsRow: {
      marginBottom: 10,
    },
    chip: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 999,
      borderWidth: 1,
      marginRight: 8,
    },
    chipText: {
      fontSize: 13,
      fontWeight: '600',
    },
  });

export default FeedHeader;
