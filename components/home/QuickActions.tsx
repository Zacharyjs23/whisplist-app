import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { QuickAction } from '@/types/QuickAction';

type Palette = {
  text: string;
  placeholder: string;
  background: string;
  input: string;
  tint: string;
};

type QuickActionsProps = {
  actions: QuickAction[];
  title: string;
  subtitle: string;
  palette: Palette;
  onSelect: (action: QuickAction) => void;
};

export const QuickActions: React.FC<QuickActionsProps> = ({
  actions,
  title,
  subtitle,
  palette,
  onSelect,
}) => {
  if (!actions.length) return null;

  return (
    <View>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
        <Text style={[styles.subtitle, { color: palette.placeholder }]}>
          {subtitle}
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContainer}
      >
        {actions.map((action) => (
          <TouchableOpacity
            key={action.key}
            style={[
              styles.card,
              {
                backgroundColor: palette.background,
                borderColor: palette.placeholder,
              },
            ]}
            onPress={() => onSelect(action)}
            accessibilityRole="button"
            accessibilityLabel={action.label}
          >
            <View style={[styles.iconWrap, { backgroundColor: palette.input }]}>
              <Ionicons name={action.icon} size={18} color={palette.tint} />
            </View>
            <Text style={[styles.cardTitle, { color: palette.text }]}>
              {action.label}
            </Text>
            {action.description ? (
              <Text
                style={[styles.cardDescription, { color: palette.placeholder }]}
                numberOfLines={2}
              >
                {action.description}
              </Text>
            ) : null}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  headerRow: {
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  scrollContainer: {
    paddingBottom: 6,
  },
  card: {
    width: 160,
    borderRadius: 16,
    padding: 16,
    marginRight: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  cardDescription: {
    fontSize: 12,
    lineHeight: 16,
  },
});
