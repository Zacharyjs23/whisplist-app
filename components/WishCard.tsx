import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  Animated,
  Share,
  View,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useSavedWishes } from '@/contexts/SavedWishesContext';
import type { Wish } from '../types/Wish';
import { updateWishReaction, deleteWish } from '../helpers/wishes';
import { db } from '../firebase';
import { collection, getDocs, doc, onSnapshot } from 'firebase/firestore';
import { formatTimeLeft } from '../helpers/time';
import { useAuthSession } from '@/contexts/AuthSessionContext';
import { ReactionBar, ReactionKey } from './ReactionBar';
import * as logger from '@/shared/logger';
import { useTranslation } from '@/contexts/I18nContext';

const typeColors: Record<string, string> = {
  dream: '#312e81',
  advice: '#064e3b',
  confession: '#374151',
};

const moodColors: Record<string, string> = {
  '😢': '#f87171',
  '😐': '#94a3b8',
  '🙂': '#facc15',
  '😄': '#86efac',
};


export const WishCard: React.FC<{
  wish: Wish;
  onReport?: () => void;
  followed?: boolean;
}> = ({ wish, onReport, followed }) => {
  const { theme } = useTheme();
  const router = useRouter();
  const { saved, toggleSave } = useSavedWishes();
  const { user } = useAuthSession();
  const [giftCount, setGiftCount] = useState(0);
  const [hasGiftMsg, setHasGiftMsg] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');
  const [userReaction, setUserReaction] = useState<ReactionKey | null>(null);
  const glowAnim = useRef(new Animated.Value(0)).current;
  const { t } = useTranslation();

  const isBoosted =
    wish.boostedUntil &&
    wish.boostedUntil.toDate &&
    wish.boostedUntil.toDate() > new Date();

  useEffect(() => {
    if (!wish.id) return;
    const load = async () => {
      try {
        const snaps = await Promise.all([
          getDocs(collection(db, 'wishes', wish.id, 'gifts')),
          getDocs(collection(db, 'gifts', wish.id, 'gifts')),
        ]);
        let msg = false;
        snaps[0].forEach((d) => {
          if (d.data().message) msg = true;
        });
        setGiftCount(snaps[0].size + snaps[1].size);
        setHasGiftMsg(msg);
      } catch (err) {
        logger.warn('Failed to fetch gifts', err);
      }
    };
    load();
  }, [wish.id]);

  useEffect(() => {
    if (!user?.uid || !wish.id) return;
    const ref = doc(db, 'reactions', wish.id, 'users', user.uid);
    const unsub = onSnapshot(ref, (snap) => {
      setUserReaction(
        snap.exists() ? (snap.data().emoji as ReactionKey) : null,
      );
    });
    return unsub;
  }, [user?.uid, wish.id]);

    useEffect(() => {
      if (!isBoosted || !wish.boostedUntil) {
        setTimeLeft('');
        glowAnim.setValue(0);
        return;
      }
      const update = () =>
        setTimeLeft(formatTimeLeft(wish.boostedUntil!.toDate()));
      update();
      const id = setInterval(update, 60000);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: false,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => {
      clearInterval(id);
      loop.stop();
    };
    }, [isBoosted, wish.boostedUntil, glowAnim]);

  const borderColor =
    moodColors[wish.mood || ''] || typeColors[wish.type || ''] || theme.tint;
  const bgTint = `${borderColor}33`;

  const handleReact = useCallback(
    async (key: ReactionKey) => {
      if (!wish.id || !user?.uid) return;
      try {
        await updateWishReaction(wish.id, key, user.uid);
      } catch (err) {
        logger.warn('Failed to react', err);
      }
    },
    [wish.id, user?.uid],
  );

  const handleShare = useCallback(async () => {
    if (!wish.id) return;
    const wishUrl = Linking.createURL(`/wish/${wish.id}`);
    try {
      await Share.share({ message: wishUrl });
    } catch (err) {
      logger.warn('Failed to share wish', err);
    }
  }, [wish.id]);

  const handleDelete = useCallback(() => {
    if (!wish.id) return;
    Alert.alert(t('common.delete'), 'Are you sure?', [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteWish(wish.id!);
          } catch (err) {
            logger.warn('Failed to delete wish', err);
          }
        },
      },
    ]);
  }, [wish.id, t]);

  return (
    <Animated.View
      style={[
        styles.card,
        { backgroundColor: bgTint, borderLeftColor: borderColor },
        isBoosted && {
          shadowColor: theme.tint,
          shadowOpacity: glowAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0.3, 0.8],
          }),
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 0 },
          elevation: glowAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [2, 8],
          }),
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => router.push(`/wish/${wish.id}`)}
      >
        {!wish.isAnonymous && wish.displayName && (
          <TouchableOpacity
            onPress={() => router.push(`/profile/${wish.displayName}`)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={[styles.author, { color: theme.text }]}>
              @{wish.displayName}
            </Text>
          </TouchableOpacity>
        )}
        {followed && (
          <Text style={[styles.followTag, { color: theme.tint }]}>👥 {t('wish.followed')}</Text>
        )}
        <Text style={[styles.category, { color: theme.tint }]}>
          #{wish.category}
        </Text>
        <Text style={[styles.text, { color: theme.text }]}>{wish.text}</Text>
        {wish.imageUrl && (
          <Image source={{ uri: wish.imageUrl }} style={styles.preview} />
        )}
      </TouchableOpacity>
      <View style={styles.actionRow}>
        <ReactionBar
          wish={wish}
          userReaction={userReaction}
          onReact={handleReact}
          onToggleSave={() => wish.id && toggleSave(wish.id)}
          isSaved={!!wish.id && !!saved[wish.id]}
        />
        <TouchableOpacity
          onPress={handleShare}
          style={styles.shareButton}
          testID="share-button"
        >
          <Ionicons name="share-outline" size={20} color={theme.tint} />
        </TouchableOpacity>
      </View>
      {isBoosted && (
        <Text style={[styles.boostLabel, { color: theme.tint }]}>
          ⏳ {t('wish.boostExpires', { timeLeft })}
        </Text>
      )}
      {(wish.giftLink || giftCount > 0) && (
        <Text style={[styles.giftInfo, { color: theme.tint }]}>
          🎁 {t('wish.supportedBy', { count: giftCount })}
        </Text>
      )}
      {user?.uid === wish.userId && hasGiftMsg && (
        <Text style={[styles.giftInfo, { color: theme.tint }]}>
          💬 {t('wish.giftMessageReceived')}
        </Text>
      )}
      {wish.expiresAt && (
        <Text style={{ color: theme.tint, marginTop: 4 }}>
          ⏳{' '}
          {(() => {
            const ts = wish.expiresAt.toDate();
            const diff = ts.getTime() - Date.now();
            const hrs = Math.max(0, Math.ceil(diff / 3600000));
            return t('wish.hoursLeft', { hours: hrs });
          })()}
        </Text>
      )}
      {user?.uid === wish.userId && (
        <TouchableOpacity onPress={handleDelete} style={styles.reportButton}>
          <Text style={[styles.reactionText, { color: '#f87171' }]}>
            {t('common.delete')}
          </Text>
        </TouchableOpacity>
      )}
      {onReport && (
        <TouchableOpacity onPress={onReport} style={styles.reportButton}>
          <Text style={[styles.reactionText, { color: '#f87171' }]}>
            {t('wish.report')}
          </Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
  },
  category: {
    fontSize: 12,
    marginBottom: 4,
    fontWeight: '600',
  },
  text: {
    fontSize: 16,
  },
  preview: {
    width: '100%',
    height: 200,
    borderRadius: 10,
    marginTop: 8,
  },
  reactionText: {
    fontSize: 18,
  },
  boostLabel: {
    marginTop: 4,
    fontSize: 12,
  },
  author: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  followTag: {
    fontSize: 12,
    marginBottom: 4,
  },
  giftInfo: {
    marginTop: 4,
    fontSize: 12,
  },
  reportButton: {
    marginTop: 4,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  shareButton: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
});

export default WishCard;
