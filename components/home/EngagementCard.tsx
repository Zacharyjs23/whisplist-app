import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from '@/contexts/I18nContext';
import {
  getMilestonesFor,
  getNextMilestone,
} from '@/helpers/engagement';
import type { EngagementKind, EngagementStats } from '@/types/Engagement';

const ROWS: { kind: EngagementKind; emoji: string }[] = [
  { kind: 'posting', emoji: '🔥' },
  { kind: 'gifting', emoji: '🎁' },
  { kind: 'fulfillment', emoji: '✨' },
];

const NEXT_KEYS: Record<EngagementKind, string> = {
  posting: 'home.engagement.next.posting',
  gifting: 'home.engagement.next.gifting',
  fulfillment: 'home.engagement.next.fulfillment',
};

const UNIT_KEYS: Record<EngagementKind, string> = {
  posting: 'home.engagement.units.days',
  gifting: 'home.engagement.units.gifts',
  fulfillment: 'home.engagement.units.wishes',
};

type Props = {
  stats: EngagementStats;
  loading?: boolean;
};

const EngagementCard: React.FC<Props> = ({ stats, loading = false }) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const borderColor = useMemo(() => {
    return ['dark', 'neon', 'cyberpunk'].includes(theme.name)
      ? 'rgba(255,255,255,0.18)'
      : 'rgba(17,24,28,0.08)';
  }, [theme.name]);

  const rows = useMemo(() =>
    ROWS.map(({ kind, emoji }) => {
      const entry = stats[kind];
      const next = getNextMilestone(kind, entry);
      const milestones = getMilestonesFor(kind);
      const unlocked = Object.keys(entry.milestones ?? {}).length;
      const total = milestones.length;
      const progress = next ? Math.min(1, entry.current / next.target) : 1;
      const titleKey = `home.engagement.${kind}` as const;
      const subtitle = next
        ? t(NEXT_KEYS[kind], {
            target: next.target,
          })
        : t('home.engagement.complete', 'All badges unlocked');
      const unitLabel = t(UNIT_KEYS[kind], { count: entry.current });
      return {
        kind,
        emoji,
        label: t(titleKey, `${kind} streak`),
        current: entry.current,
        longest: entry.longest,
        subtitle,
        progress,
        unlocked,
        total,
        unitLabel,
      };
    }),
  [stats, t]);

  return (
    <View
      style={[styles.container, { backgroundColor: theme.input, borderColor }]}
      accessibilityRole="summary"
      accessibilityLabel={t('home.engagement.label', 'Your engagement streaks')}
    >
      <Text style={[styles.title, { color: theme.text }]}>{t('home.engagement.title', 'Keep your streak alive')}</Text>
      <Text style={[styles.caption, { color: theme.placeholder }]}> 
        {loading
          ? t('home.engagement.loading', 'Checking your momentum…')
          : t('home.engagement.caption', 'Badges unlock as you show up for the community.')} 
      </Text>
      {rows.map((row) => (
        <View
          key={row.kind}
          style={[styles.row, { borderColor }]}
          accessibilityLabel={t('home.engagement.rowLabel', '{{label}} — {{unit}}', {
            label: row.label,
            unit: row.unitLabel,
          })}
        >
          <View style={styles.rowHeader}>
            <Text style={styles.emoji}>{row.emoji}</Text>
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: theme.text }]}>{row.label}</Text>
              <Text style={[styles.rowSubtitle, { color: theme.placeholder }]}>{row.subtitle}</Text>
            </View>
           <View style={styles.counter}>
             <Text style={[styles.counterValue, { color: theme.text }]}>{row.current}</Text>
              <Text style={[styles.counterLabel, { color: theme.placeholder }]}>
                {row.unitLabel}
              </Text>
            </View>
          </View>
          <View
            style={[
              styles.progressTrack,
              {
                backgroundColor: ['dark', 'neon', 'cyberpunk'].includes(theme.name)
                  ? 'rgba(255,255,255,0.15)'
                  : 'rgba(17,24,28,0.08)',
              },
            ]}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: row.total, now: row.unlocked }}
          >
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: theme.tint,
                  width: `${Math.max(10, row.progress * 100)}%`,
                },
              ]}
            />
          </View>
          <Text style={[styles.progressLabel, { color: theme.placeholder }]}>
            {t('home.engagement.badgeProgress', {
              unlocked: row.unlocked,
              total: row.total,
            })}
          </Text>
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
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  caption: {
    fontSize: 13,
    marginBottom: 12,
  },
  row: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emoji: {
    fontSize: 24,
    marginRight: 12,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  rowSubtitle: {
    fontSize: 13,
  },
  counter: {
    alignItems: 'flex-end',
  },
  counterValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  counterLabel: {
    fontSize: 12,
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 12,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  progressLabel: {
    fontSize: 12,
    marginTop: 6,
  },
});

export default EngagementCard;
