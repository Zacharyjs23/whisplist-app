import React, { memo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  AccessibilityRole,
} from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from '@/contexts/I18nContext';
import { createUserCardStyles } from '@/app/public/styles';
import type { PublicUser } from '@/app/public/types';

interface UserCardProps {
  user: PublicUser;
  onPress: () => void;
}

const accessibilityRole: AccessibilityRole = 'button';

export const UserCard: React.FC<UserCardProps> = memo(({ user, onPress }) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const styles = createUserCardStyles(theme);
  const accessibilityLabel = t('publicUsers.accessibility.openProfile', {
    displayName: user.displayName,
  });

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.card, { backgroundColor: theme.card }]}
      accessible
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={t('publicUsers.accessibility.openProfileHint')}
    >
      {user.photoURL ? (
        <Image
          source={{ uri: user.photoURL }}
          style={styles.avatar}
          accessibilityLabel={t('publicUsers.accessibility.profilePhoto', {
            displayName: user.displayName,
          })}
        />
      ) : (
        <View
          style={[styles.avatar, styles.placeholderAvatar]}
          accessible
          accessibilityRole="image"
          accessibilityLabel={t('publicUsers.accessibility.noPhoto')}
        />
      )}
      <View style={styles.content}>
        <Text style={[styles.name, { color: theme.text }]}>
          @{user.displayName}
        </Text>
        {user.bio ? (
          <Text style={[styles.bio, { color: theme.text }]} numberOfLines={2}>
            {user.bio}
          </Text>
        ) : null}
        {user.lastWish ? (
          <Text style={[styles.wishInfo, { color: theme.text }]}>
            {t('publicUsers.lastWish', { wish: user.lastWish })}
          </Text>
        ) : null}
        <Text style={[styles.wishCount, { color: theme.text }]}>
          {t('publicUsers.wishCount', { count: user.wishCount })}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

UserCard.displayName = 'UserCard';
