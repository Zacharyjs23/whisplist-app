import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  formatCurrency,
  getProgress,
  type SupportPost,
  type SupportRequestType,
} from '@/features/mvp/supportPosts';

type SupportPostCardProps = {
  post: SupportPost;
  compact?: boolean;
  onOpenPost: (post: SupportPost) => void;
  onOpenGift?: (post: SupportPost) => void;
  onOpenVideo?: (post: SupportPost) => void;
};

function requestLabel(type: SupportRequestType): string {
  if (type === 'gift') return 'Gift request';
  if (type === 'both') return 'Money + gift';
  return 'Money request';
}

function primaryAction(type: SupportRequestType): string {
  if (type === 'gift') return 'Send gift';
  if (type === 'both') return 'Support now';
  return 'Contribute';
}

function requestChipStyle(type: SupportRequestType) {
  if (type === 'gift') return styles.chipGift;
  if (type === 'both') return styles.chipBoth;
  return styles.chipMoney;
}

export function SupportPostCard({
  post,
  compact = false,
  onOpenPost,
  onOpenGift,
  onOpenVideo,
}: SupportPostCardProps) {
  const progress = getProgress(post);
  const createdAtLabel = post.createdAtMs
    ? formatDistanceToNow(post.createdAtMs, { addSuffix: true })
    : 'just now';
  const initial = post.creatorName.trim().charAt(0).toUpperCase() || 'A';

  return (
    <View style={[styles.card, compact ? styles.cardCompact : null]}>
      <View style={styles.headerRow}>
        <View style={styles.creatorRow}>
          {post.creatorAvatar ? (
            <Image source={{ uri: post.creatorAvatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarFallbackText}>{initial}</Text>
            </View>
          )}
          <View>
            <Text style={styles.creatorName}>{post.creatorName}</Text>
            <Text style={styles.createdAt}>{createdAtLabel}</Text>
          </View>
        </View>
        <View style={[styles.requestChip, requestChipStyle(post.requestType)]}>
          <Text style={styles.requestChipText}>{requestLabel(post.requestType)}</Text>
        </View>
      </View>

      {!compact && post.imageUrl ? (
        <Image source={{ uri: post.imageUrl }} style={styles.mediaImage} />
      ) : null}

      {!compact && post.videoUrl ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onOpenVideo?.(post)}
          style={styles.videoPlaceholder}
        >
          <Ionicons name="play-circle" size={26} color="#ffffff" />
          <Text style={styles.videoLabel}>Video attached</Text>
          <Text style={styles.videoSubLabel}>Tap to open video</Text>
        </Pressable>
      ) : null}

      <Text style={styles.needLabel}>What they need</Text>
      <Text style={styles.needValue}>{post.needReason}</Text>

      <Text style={styles.storyLabel}>Why they need it</Text>
      <Text numberOfLines={compact ? 2 : 5} style={styles.storyValue}>
        {post.story || 'No additional details provided.'}
      </Text>

      {post.goalAmount ? (
        <View style={styles.progressWrap}>
          <View style={styles.progressMetaRow}>
            <Text style={styles.progressRaised}>
              {formatCurrency(post.raisedAmount)} raised
            </Text>
            <Text style={styles.progressGoal}>
              of {formatCurrency(post.goalAmount)}
            </Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
          <Text style={styles.supportersText}>
            {post.supporterCount} supporters
          </Text>
        </View>
      ) : null}

      <View style={styles.actionsRow}>
        <Pressable
          accessibilityRole="button"
          onPress={() => onOpenPost(post)}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>{primaryAction(post.requestType)}</Text>
        </Pressable>
        {post.giftLink ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => onOpenGift?.(post)}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>Gift wishlist</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 20,
    elevation: 3,
  },
  cardCompact: {
    borderRadius: 16,
    marginHorizontal: 0,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
  creatorName: {
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 14,
  },
  createdAt: {
    color: '#64748b',
    fontSize: 12,
  },
  requestChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  chipMoney: {
    backgroundColor: '#d1fae5',
  },
  chipGift: {
    backgroundColor: '#ffedd5',
  },
  chipBoth: {
    backgroundColor: '#dbeafe',
  },
  requestChipText: {
    fontWeight: '700',
    fontSize: 11,
    color: '#0f172a',
  },
  mediaImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 14,
    marginBottom: 12,
    backgroundColor: '#f1f5f9',
  },
  videoPlaceholder: {
    borderRadius: 14,
    marginBottom: 12,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
    gap: 4,
  },
  videoLabel: {
    color: '#ffffff',
    fontWeight: '700',
  },
  videoSubLabel: {
    color: '#cbd5e1',
    fontSize: 12,
  },
  needLabel: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
    marginBottom: 4,
  },
  needValue: {
    color: '#0f172a',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 8,
  },
  storyLabel: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
    marginBottom: 4,
  },
  storyValue: {
    color: '#334155',
    lineHeight: 20,
  },
  progressWrap: {
    marginTop: 12,
    marginBottom: 8,
  },
  progressMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  progressRaised: {
    color: '#0f172a',
    fontWeight: '700',
  },
  progressGoal: {
    color: '#475569',
  },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#e2e8f0',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#0ea5e9',
  },
  supportersText: {
    marginTop: 6,
    color: '#64748b',
    fontSize: 12,
  },
  actionsRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
  },
  primaryButton: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: '#0f172a',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  secondaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#334155',
    fontWeight: '600',
    fontSize: 13,
  },
});

export default SupportPostCard;
