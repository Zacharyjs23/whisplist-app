import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import {
  VideoView,
  useVideoPlayer,
  type TimeUpdateEventPayload,
} from 'expo-video';
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
  onChipIn?: (post: SupportPost) => void;
  allowChipIn?: boolean;
  onSharePost?: (post: SupportPost) => void;
  onOpenGift?: (post: SupportPost) => void;
  onOpenVideo?: (post: SupportPost) => void;
  autoPlayVideo?: boolean;
  onVideoEvent?: (event: SupportPostVideoEvent) => void;
};

export type SupportPostVideoEventType =
  | 'impression'
  | 'play'
  | 'pause'
  | 'progress_3s'
  | 'progress_10s'
  | 'progress_25'
  | 'progress_50'
  | 'progress_75'
  | 'complete'
  | 'error';

export type SupportPostVideoEvent = {
  postId: string;
  videoUrl: string;
  event: SupportPostVideoEventType;
  positionSeconds?: number;
  durationSeconds?: number;
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
  onChipIn,
  allowChipIn = false,
  onSharePost,
  onOpenGift,
  onOpenVideo,
  autoPlayVideo = false,
  onVideoEvent,
}: SupportPostCardProps) {
  const progress = getProgress(post);
  const createdAtLabel = post.createdAtMs
    ? formatDistanceToNow(post.createdAtMs, { addSuffix: true })
    : 'just now';
  const initial = post.creatorName.trim().charAt(0).toUpperCase() || 'A';
  const [isMuted, setIsMuted] = React.useState(true);
  const canChipIn = !compact && allowChipIn && typeof onChipIn === 'function';

  const shouldRenderVideo = !compact && !!post.videoUrl;
  const player = useVideoPlayer(post.videoUrl ?? null, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.muted = true;
    videoPlayer.timeUpdateEventInterval = 0.5;
  });

  const emitVideoEvent = React.useCallback(
    (
      event: SupportPostVideoEventType,
      extras: Pick<SupportPostVideoEvent, 'positionSeconds' | 'durationSeconds'> = {},
    ) => {
      if (!post.videoUrl) return;
      onVideoEvent?.({
        postId: post.id,
        videoUrl: post.videoUrl,
        event,
        ...extras,
      });
    },
    [onVideoEvent, post.id, post.videoUrl],
  );

  const toFiniteSeconds = (value: unknown): number | undefined => {
    if (typeof value !== 'number') return undefined;
    if (!Number.isFinite(value) || value <= 0) return undefined;
    return value;
  };

  const progressMilestonesRef = React.useRef({
    progress3: false,
    progress10: false,
    progress25: false,
    progress50: false,
    progress75: false,
  });
  const playbackStateRef = React.useRef(false);
  const loggedImpressionRef = React.useRef(false);

  React.useEffect(() => {
    progressMilestonesRef.current = {
      progress3: false,
      progress10: false,
      progress25: false,
      progress50: false,
      progress75: false,
    };
    playbackStateRef.current = false;
    loggedImpressionRef.current = false;
  }, [post.id, post.videoUrl]);

  React.useEffect(() => {
    if (!shouldRenderVideo) return;
    if (autoPlayVideo) {
      if (!loggedImpressionRef.current) {
        loggedImpressionRef.current = true;
        emitVideoEvent('impression', {
          positionSeconds: toFiniteSeconds(player.currentTime),
          durationSeconds: toFiniteSeconds(player.duration),
        });
      }
      player.play();
    } else {
      player.pause();
    }
  }, [autoPlayVideo, emitVideoEvent, player, shouldRenderVideo]);

  React.useEffect(() => {
    if (!shouldRenderVideo) return;

    const handleMilestones = (payload: TimeUpdateEventPayload) => {
      const current = toFiniteSeconds(payload.currentTime);
      const duration = toFiniteSeconds(player.duration);
      if (current === undefined) return;

      if (!progressMilestonesRef.current.progress3 && current >= 3) {
        progressMilestonesRef.current.progress3 = true;
        emitVideoEvent('progress_3s', {
          positionSeconds: current,
          durationSeconds: duration,
        });
      }

      if (!progressMilestonesRef.current.progress10 && current >= 10) {
        progressMilestonesRef.current.progress10 = true;
        emitVideoEvent('progress_10s', {
          positionSeconds: current,
          durationSeconds: duration,
        });
      }

      if (!duration) return;
      const progressRatio = current / duration;

      if (!progressMilestonesRef.current.progress25 && progressRatio >= 0.25) {
        progressMilestonesRef.current.progress25 = true;
        emitVideoEvent('progress_25', {
          positionSeconds: current,
          durationSeconds: duration,
        });
      }
      if (!progressMilestonesRef.current.progress50 && progressRatio >= 0.5) {
        progressMilestonesRef.current.progress50 = true;
        emitVideoEvent('progress_50', {
          positionSeconds: current,
          durationSeconds: duration,
        });
      }
      if (!progressMilestonesRef.current.progress75 && progressRatio >= 0.75) {
        progressMilestonesRef.current.progress75 = true;
        emitVideoEvent('progress_75', {
          positionSeconds: current,
          durationSeconds: duration,
        });
      }
    };

    const playingSub = player.addListener('playingChange', ({ isPlaying }) => {
      if (isPlaying === playbackStateRef.current) return;
      playbackStateRef.current = isPlaying;
      emitVideoEvent(isPlaying ? 'play' : 'pause', {
        positionSeconds: toFiniteSeconds(player.currentTime),
        durationSeconds: toFiniteSeconds(player.duration),
      });
    });

    const timeSub = player.addListener('timeUpdate', handleMilestones);
    const endSub = player.addListener('playToEnd', () => {
      emitVideoEvent('complete', {
        positionSeconds: toFiniteSeconds(player.currentTime),
        durationSeconds: toFiniteSeconds(player.duration),
      });
    });
    const statusSub = player.addListener('statusChange', ({ status }) => {
      if (status === 'error') {
        emitVideoEvent('error', {
          positionSeconds: toFiniteSeconds(player.currentTime),
          durationSeconds: toFiniteSeconds(player.duration),
        });
      }
    });

    return () => {
      playingSub.remove();
      timeSub.remove();
      endSub.remove();
      statusSub.remove();
    };
  }, [emitVideoEvent, player, shouldRenderVideo]);

  const togglePlayback = React.useCallback(() => {
    if (!post.videoUrl) return;
    if (player.playing) {
      player.pause();
    } else {
      player.play();
    }
  }, [player, post.videoUrl]);

  const toggleMute = React.useCallback(() => {
    const next = !isMuted;
    setIsMuted(next);
    player.muted = next;
  }, [isMuted, player]);

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

      {shouldRenderVideo ? (
        <View style={styles.videoWrap}>
          <Pressable
            accessibilityRole="button"
            onPress={togglePlayback}
            onLongPress={() => onOpenVideo?.(post)}
            style={styles.videoPressable}
          >
            <VideoView
              player={player}
              style={styles.videoView}
              contentFit="cover"
              nativeControls={false}
              allowsFullscreen
            />
            {!player.playing ? (
              <View style={styles.videoOverlayCenter}>
                <Ionicons name="play-circle" size={52} color="#ffffff" />
              </View>
            ) : null}
            <View style={styles.videoOverlayBottom}>
              <Text style={styles.videoLabel}>Video request</Text>
              <Text style={styles.videoSubLabel}>Tap to pause/play</Text>
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={toggleMute}
            style={styles.videoMuteButton}
          >
            <Ionicons
              name={isMuted ? 'volume-mute' : 'volume-high'}
              size={18}
              color="#ffffff"
            />
          </Pressable>
        </View>
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
          onPress={() => {
            if (canChipIn) {
              onChipIn?.(post);
              return;
            }
            onOpenPost(post);
          }}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>
            {canChipIn ? 'Chip in now' : primaryAction(post.requestType)}
          </Text>
        </Pressable>
        {canChipIn ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => onOpenPost(post)}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>View story</Text>
          </Pressable>
        ) : post.giftLink ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => onOpenGift?.(post)}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>Gift wishlist</Text>
          </Pressable>
        ) : null}
      </View>
      {canChipIn && post.giftLink ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onOpenGift?.(post)}
          style={styles.tertiaryLinkButton}
        >
          <Text style={styles.tertiaryLinkText}>Open gift wishlist</Text>
        </Pressable>
      ) : null}
      {onSharePost ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onSharePost(post)}
          style={styles.tertiaryLinkButton}
        >
          <Text style={styles.tertiaryLinkText}>
            {canChipIn ? 'Share fundraiser' : 'Share post'}
          </Text>
        </Pressable>
      ) : null}
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
  videoWrap: {
    borderRadius: 14,
    marginBottom: 12,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
  },
  videoPressable: {
    position: 'relative',
  },
  videoView: {
    width: '100%',
    aspectRatio: 9 / 16,
    backgroundColor: '#0f172a',
  },
  videoOverlayCenter: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(2, 6, 23, 0.2)',
  },
  videoOverlayBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(2, 6, 23, 0.45)',
  },
  videoMuteButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(2, 6, 23, 0.45)',
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
  tertiaryLinkButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  tertiaryLinkText: {
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
});

export default SupportPostCard;
