import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useRouter, type Href } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from '@/contexts/I18nContext';
import { useAuthSession } from '@/contexts/AuthSessionContext';
import { useRecentWishlists } from '@/src/features/wishlist/useRecentWishlists';

const FALLBACK_ICON = 'list-outline';

const createStyles = (colors: ReturnType<typeof useTheme>['theme']) =>
  StyleSheet.create({
    card: {
      borderRadius: 20,
      borderWidth: StyleSheet.hairlineWidth,
      padding: 18,
      marginBottom: 18,
      gap: 14,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerTitle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    titleWrapper: {
      flexDirection: 'column',
    },
    title: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
    },
    subtitle: {
      fontSize: 13,
      color: colors.placeholder,
      marginTop: 2,
    },
    list: {
      gap: 12,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 14,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderWidth: StyleSheet.hairlineWidth,
    },
    rowHighlight: {
      flex: 1,
      flexDirection: 'column',
      marginLeft: 12,
      marginRight: 8,
    },
    itemTitle: {
      fontWeight: '600',
      fontSize: 14,
      marginBottom: 4,
    },
    itemSubtitle: {
      fontSize: 12,
    },
    thumbnail: {
      width: 48,
      height: 48,
      borderRadius: 14,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
    },
    thumbnailImage: {
      width: '100%',
      height: '100%',
    },
    thumbnailFallbackIcon: {
      opacity: 0.72,
    },
    emptyState: {
      paddingVertical: 12,
      alignItems: 'center',
      gap: 6,
    },
    emptyText: {
      textAlign: 'center',
      fontSize: 13,
    },
    chevron: {
      marginLeft: 'auto',
    },
    skeletonRow: {
      height: 52,
      borderRadius: 14,
      opacity: 0.18,
      marginBottom: 12,
    },
    headerIcon: {
      padding: 10,
      borderRadius: 14,
    },
    footerButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 999,
      paddingVertical: 10,
      gap: 6,
    },
    footerLabel: {
      fontSize: 13,
      fontWeight: '600',
    },
  });

export const RecentWishlistsSection: React.FC = () => {
  const { user } = useAuthSession();
  const { theme } = useTheme();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { items, loading } = useRecentWishlists(user?.uid ?? null);
  const styles = useMemo(() => createStyles(theme), [theme]);
  const locale = useMemo(
    () => (i18n.language?.startsWith('es') ? es : undefined),
    [i18n.language],
  );

  const cardBackground = theme.input;
  const borderColor = theme.placeholder;
  const accent = theme.tint;

  const renderHeader = () => (
    <View style={styles.headerRow}>
      <View style={styles.headerTitle}>
        <View
          style={[styles.headerIcon, { backgroundColor: accent, opacity: 0.14 }]}
        >
          <Ionicons name="time-outline" size={18} color={accent} />
        </View>
        <View style={styles.titleWrapper}>
          <Text style={styles.title}>
            {t('profile.recent.title', 'Recent wishlists')}
          </Text>
          <Text style={styles.subtitle}>
            {t(
              'profile.recent.subtitle',
              'Quick access to the lists you just viewed.',
            )}
          </Text>
        </View>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.card, { backgroundColor: cardBackground, borderColor }]}>
        {renderHeader()}
        {[0, 1, 2].map((key) => (
          <View
            key={key}
            style={[styles.skeletonRow, { backgroundColor: theme.placeholder }]}
          />
        ))}
      </View>
    );
  }

  if (!items.length) {
    return (
      <View style={[styles.card, { backgroundColor: cardBackground, borderColor }]}>
        {renderHeader()}
        <View style={styles.emptyState}>
          <Ionicons
            name="search-outline"
            size={20}
            color={theme.placeholder}
          />
          <Text style={[styles.emptyText, { color: theme.placeholder }]}>
            {t('profile.recent.empty', 'Open a wishlist to see it appear here.')}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: cardBackground, borderColor }]}>
      {renderHeader()}
      <View style={styles.list}>
        {items.map((entry) => (
          <TouchableOpacity
            key={entry.id}
            style={[styles.row, { borderColor: theme.placeholder }]}
            onPress={() => router.push(`/wish/${entry.id}` as Href)}
            accessibilityRole="button"
          >
            <View style={[styles.thumbnail, { backgroundColor: theme.background, borderColor: theme.placeholder }]}>
              {entry.coverUri ? (
                <ExpoImage
                  source={{ uri: entry.coverUri }}
                  style={styles.thumbnailImage}
                  contentFit="cover"
                />
              ) : (
                <Ionicons
                  name={FALLBACK_ICON}
                  size={22}
                  color={theme.placeholder}
                  style={styles.thumbnailFallbackIcon}
                />
              )}
            </View>
            <View style={styles.rowHighlight}>
              <Text
                style={[styles.itemTitle, { color: theme.text }]}
                numberOfLines={2}
              >
                {entry.title ??
                  t('profile.recent.untitled', 'Untitled wishlist')}
              </Text>
              <Text style={[styles.itemSubtitle, { color: theme.placeholder }]}
              >
                {formatDistanceToNow(entry.updatedAt, {
                  addSuffix: true,
                  locale,
                })}
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={theme.placeholder}
              style={styles.chevron}
            />
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity
        style={[styles.footerButton, { backgroundColor: accent, opacity: 0.12 }]}
        disabled
      >
        <Ionicons name="sparkles-outline" size={16} color={accent} />
        <Text style={[styles.footerLabel, { color: accent }]}
        >
          {t('profile.recent.viewAll', 'More coming soon')}
        </Text>
      </TouchableOpacity>
    </View>
  );
};
