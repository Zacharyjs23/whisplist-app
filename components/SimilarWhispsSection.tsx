import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatDistanceToNow } from 'date-fns';
import { useTheme } from '@/contexts/ThemeContext';
import type { WishMatch, WishMatchMeta } from '@/services/WishMatcher';

type SimilarWhispsSectionProps = {
  matches: WishMatch[];
  status: 'idle' | 'loading' | 'ready' | 'empty' | 'error';
  error?: string | null;
  meta?: WishMatchMeta | null;
  onRefresh: () => void;
  onSelect: (wishId: string) => void;
};

const clampScore = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
};

export const SimilarWhispsSection: React.FC<SimilarWhispsSectionProps> = ({
  matches,
  status,
  error,
  meta,
  onRefresh,
  onSelect,
}) => {
  const { theme } = useTheme();
  const hasMeta = Boolean(meta);
  const showSection = (() => {
    switch (status) {
      case 'idle':
        return matches.length > 0;
      case 'empty':
        return matches.length > 0 || hasMeta;
      default:
        return true;
    }
  })();

  if (!showSection) return null;

  const updatedLabel =
    meta?.updatedAt && Number.isFinite(meta.updatedAt.getTime())
      ? formatDistanceToNow(meta.updatedAt, { addSuffix: true })
      : null;

  return (
    <View
      style={[
        styles.container,
        { borderColor: `${theme.placeholder}33`, backgroundColor: theme.input },
      ]}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: theme.text }]}>
          ✨ Similar Whisps
        </Text>
        <View style={styles.headerActions}>
          {status === 'loading' ? (
            <ActivityIndicator size="small" color={theme.tint} />
          ) : (
            <TouchableOpacity
              onPress={onRefresh}
              accessibilityRole="button"
              style={styles.refreshButton}
            >
              <Ionicons name="refresh" size={18} color={theme.tint} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {updatedLabel ? (
        <Text style={[styles.subtitle, { color: theme.placeholder }]}>
          Refreshed {updatedLabel}
        </Text>
      ) : null}

      {error && status === 'error' ? (
        <Text style={[styles.errorText, { color: '#f87171' }]}>{error}</Text>
      ) : null}

      {status === 'empty' && matches.length === 0 ? (
        <Text style={[styles.emptyText, { color: theme.placeholder }]}>
          We&apos;re keeping an eye out for wishes that feel like this one.
        </Text>
      ) : null}

      {matches.map((match) => {
        const scorePercent = Math.round(clampScore(match.score) * 100);
        return (
          <TouchableOpacity
            key={match.id}
            style={[
              styles.matchCard,
              {
                borderColor: `${theme.placeholder}44`,
                backgroundColor: theme.background,
              },
            ]}
            onPress={() => onSelect(match.id)}
            accessibilityRole="button"
          >
            <Text style={[styles.matchText, { color: theme.text }]}>
              {match.textPreview || '—'}
            </Text>
            <View style={styles.matchMetaRow}>
              {match.displayName ? (
                <Text style={[styles.metaText, { color: theme.placeholder }]}>
                  @{match.displayName}
                </Text>
              ) : null}
              {match.category ? (
                <Text style={[styles.metaText, { color: theme.placeholder }]}>
                  #{match.category}
                </Text>
              ) : null}
              {typeof match.mood === 'string' && match.mood ? (
                <Text style={[styles.metaText, { color: theme.placeholder }]}>
                  {match.mood}
                </Text>
              ) : null}
              <Text style={[styles.scoreBadge, { color: theme.tint }]}>
                {scorePercent}%
              </Text>
            </View>
            {Array.isArray(match.tags) && match.tags.length > 0 ? (
              <Text style={[styles.tagsText, { color: theme.placeholder }]}>
                {match.tags.map((tag) => `#${tag}`).join(' ')}
              </Text>
            ) : null}
            {match.reason ? (
              <Text style={[styles.reasonText, { color: theme.placeholder }]}>
                {match.reason}
              </Text>
            ) : null}
            {match.summary ? (
              <Text style={[styles.summaryText, { color: theme.placeholder }]}>
                {match.summary}
              </Text>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginTop: 18,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  refreshButton: {
    padding: 6,
    borderRadius: 6,
  },
  subtitle: {
    fontSize: 12,
  },
  errorText: {
    fontSize: 13,
  },
  emptyText: {
    fontSize: 13,
  },
  matchCard: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
  },
  matchText: {
    fontSize: 14,
    fontWeight: '600',
  },
  matchMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  metaText: {
    fontSize: 12,
  },
  scoreBadge: {
    marginLeft: 'auto',
    fontSize: 12,
    fontWeight: '700',
  },
  tagsText: {
    fontSize: 12,
  },
  reasonText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  summaryText: {
    fontSize: 12,
  },
});

export default SimilarWhispsSection;
