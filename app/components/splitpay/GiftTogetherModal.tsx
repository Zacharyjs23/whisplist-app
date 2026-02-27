import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthSession } from '@/contexts/AuthSessionContext';
import { SplitPayProgressBar } from './ProgressBar';
import { formatCurrency } from '@/shared/numberFormat';
import {
  useGiftTogetherContributors,
  useGiftTogetherInvites,
} from '@/hooks/useGiftTogether';
import { createGiftTogetherInvite } from '@/helpers/wishes';
import * as logger from '@/shared/logger';

type GiftTogetherModalProps = {
  visible: boolean;
  onClose: () => void;
  wishId: string;
  wishTitle?: string | null;
  ownerId?: string | null;
  currency: string;
  targetAmountCents: number;
  fundedAmountCents: number;
  remainingCents: number | null;
  shareLink: string;
  onOpenChipIn: () => void;
  isEnabledInvite: boolean;
};

const mapInviteError = (error: any): string => {
  const code = typeof error?.code === 'string' ? error.code : '';
  if (code.endsWith('already-exists')) {
    return 'Invite already pending for this friend.';
  }
  if (code.endsWith('not-found')) {
    return 'We could not find that username.';
  }
  if (code.endsWith('permission-denied')) {
    return 'Only the wish owner can send invites.';
  }
  if (code.endsWith('failed-precondition')) {
    return error?.message || 'Invites are currently unavailable.';
  }
  return error?.message || 'Unable to send invite. Please try again.';
};

export const GiftTogetherModal: React.FC<GiftTogetherModalProps> = ({
  visible,
  onClose,
  wishId,
  wishTitle,
  ownerId,
  currency,
  targetAmountCents,
  fundedAmountCents,
  remainingCents,
  shareLink,
  onOpenChipIn,
  isEnabledInvite,
}) => {
  const { theme } = useTheme();
  const { user } = useAuthSession();
  const [inviteName, setInviteName] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [invitePending, setInvitePending] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');

  const {
    contributors,
    contributorsLoading,
    contributorsError,
    isOwner,
    myPledge,
  } = useGiftTogetherContributors(wishId, ownerId, user?.uid);
  const {
    invites,
    loading: invitesLoading,
    error: invitesLoadError,
  } = useGiftTogetherInvites(wishId, isEnabledInvite && isOwner);

  const progress = useMemo(() => {
    if (targetAmountCents <= 0) return 0;
    return Math.max(0, Math.min(1, fundedAmountCents / targetAmountCents));
  }, [fundedAmountCents, targetAmountCents]);

  const shareLabel = useMemo(
    () =>
      `${formatCurrency(fundedAmountCents / 100, currency)} raised of ${formatCurrency(
        targetAmountCents / 100,
        currency,
      )}`,
    [currency, fundedAmountCents, targetAmountCents],
  );

  const remainingLabel = useMemo(() => {
    if (!remainingCents || remainingCents <= 0) {
      return 'Goal reached!';
    }
    return `${formatCurrency(remainingCents / 100, currency)} to go`;
  }, [currency, remainingCents]);

  const handleCopyLink = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(shareLink);
      if (Platform.OS !== 'android') {
        await Haptics.selectionAsync().catch(() => {});
      }
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 2000);
    } catch (err) {
      logger.warn('Failed to copy gift together link', err, { wishId });
    }
  }, [shareLink, wishId]);

  const handleShareLink = useCallback(async () => {
    try {
      await Share.share({ message: shareLink });
    } catch (err) {
      logger.warn('Failed to share gift together link', err, { wishId });
    }
  }, [shareLink, wishId]);

  const handleInvite = useCallback(async () => {
    const trimmed = inviteName.trim().replace(/^@+/, '');
    if (!trimmed) {
      setInviteError('Enter a username to invite');
      return;
    }
    setInvitePending(true);
    setInviteError(null);
    try {
      await createGiftTogetherInvite(
        wishId,
        trimmed,
        inviteMessage.trim() ? inviteMessage.trim() : null,
      );
      setInviteName('');
      setInviteMessage('');
      if (Platform.OS !== 'android') {
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => {});
      }
    } catch (err: any) {
      setInviteError(mapInviteError(err));
    } finally {
      setInvitePending(false);
    }
  }, [inviteMessage, inviteName, wishId]);

  const renderContributors = () => {
    if (contributorsLoading) {
      return (
        <View style={styles.sectionLoading}>
          <ActivityIndicator color={theme.tint} />
        </View>
      );
    }
    if (contributorsError) {
      return (
        <Text style={[styles.sectionError, { color: '#f87171' }]}>
          {contributorsError}
        </Text>
      );
    }
    if (isOwner) {
      if (!contributors.length) {
        return (
          <Text style={[styles.emptyLabel, { color: theme.placeholder }]}>
            No contributions yet. Invite friends to get started.
          </Text>
        );
      }
      return contributors.slice(0, 5).map((pledge) => {
        const amountLabel = formatCurrency(
          (pledge.capturedAmount ?? pledge.amount) / 100,
          pledge.currency || currency,
        );
        return (
          <View
            key={pledge.id}
            style={[
              styles.chip,
              {
                backgroundColor: theme.background,
                borderColor: `${theme.placeholder}55`,
              },
            ]}
          >
            <Text style={[styles.chipPrimary, { color: theme.text }]}>
              {amountLabel}
            </Text>
            <Text style={[styles.chipSecondary, { color: theme.placeholder }]}>
              {pledge.status === 'captured' ? 'Captured' : 'Pledged'}
            </Text>
          </View>
        );
      });
    }
    if (myPledge) {
      const amountLabel = formatCurrency(
        (myPledge.capturedAmount ?? myPledge.amount) / 100,
        myPledge.currency || currency,
      );
      return (
        <Text style={[styles.infoText, { color: theme.text }]}>
          You pledged {amountLabel}. Thank you for supporting this wish!
        </Text>
      );
    }
    return (
      <Text style={[styles.infoText, { color: theme.placeholder }]}>
        No pledges yet. Chip in to be the first supporter.
      </Text>
    );
  };

  const renderInvites = () => {
    if (!isOwner || !isEnabledInvite) return null;
    if (invitesLoading) {
      return (
        <View style={styles.sectionLoading}>
          <ActivityIndicator color={theme.tint} />
        </View>
      );
    }
    if (invitesLoadError) {
      return (
        <Text style={[styles.sectionError, { color: '#f87171' }]}>
          {invitesLoadError}
        </Text>
      );
    }
    if (!invites.length) {
      return (
        <Text style={[styles.emptyLabel, { color: theme.placeholder }]}>
          No invites sent yet.
        </Text>
      );
    }
    return invites.slice(0, 5).map((invite) => (
      <View
        key={invite.id}
        style={[
          styles.inviteRow,
          {
            borderColor: `${theme.placeholder}44`,
            backgroundColor: theme.background,
          },
        ]}
      >
        <Text style={[styles.invitePrimary, { color: theme.text }]}>
          @{invite.inviteeDisplayName}
        </Text>
        <Text style={[styles.inviteStatus, { color: theme.placeholder }]}>
          {invite.status === 'pending' ? 'Pending' : invite.status}
        </Text>
      </View>
    ));
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: theme.background }]}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: theme.text }]}>
              🎁 Gift Together
            </Text>
            <TouchableOpacity onPress={onClose} accessibilityRole="button">
              <Text style={[styles.closeText, { color: theme.tint }]}>
                Close
              </Text>
            </TouchableOpacity>
          </View>
          {wishTitle ? (
            <Text
              style={[styles.subtitle, { color: theme.placeholder }]}
              numberOfLines={2}
            >
              {wishTitle}
            </Text>
          ) : null}
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View
              style={[
                styles.progressCard,
                {
                  backgroundColor: theme.input,
                  borderColor: `${theme.placeholder}55`,
                },
              ]}
            >
              <SplitPayProgressBar progress={progress} />
              <View style={styles.progressLabels}>
                <Text style={[styles.progressPrimary, { color: theme.text }]}>
                  {shareLabel}
                </Text>
                <Text
                  style={[
                    styles.progressSecondary,
                    { color: theme.placeholder },
                  ]}
                >
                  {remainingLabel}
                </Text>
              </View>
              <View style={styles.progressActions}>
                <TouchableOpacity
                  onPress={onOpenChipIn}
                  style={[
                    styles.primaryButton,
                    { backgroundColor: theme.tint },
                  ]}
                  accessibilityRole="button"
                >
                  <Text
                    style={[
                      styles.primaryButtonText,
                      { color: theme.background },
                    ]}
                  >
                    Chip in now
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleShareLink}
                  style={[
                    styles.secondaryButton,
                    { borderColor: theme.placeholder },
                  ]}
                  accessibilityRole="button"
                >
                  <Text
                    style={[styles.secondaryButtonText, { color: theme.text }]}
                  >
                    Share link
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleCopyLink}
                  style={[
                    styles.secondaryButton,
                    { borderColor: theme.placeholder },
                  ]}
                  accessibilityRole="button"
                >
                  <Text
                    style={[styles.secondaryButtonText, { color: theme.text }]}
                  >
                    {copyStatus === 'copied' ? 'Copied!' : 'Copy link'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                Contributors
              </Text>
              {renderContributors()}
            </View>

            {isOwner && isEnabledInvite ? (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  Invite friends
                </Text>
                <Text
                  style={[styles.sectionHint, { color: theme.placeholder }]}
                >
                  Send a Gift Together invite by username or grab the link to
                  share anywhere.
                </Text>
                <View style={styles.inviteInputs}>
                  <TextInput
                    value={inviteName}
                    onChangeText={setInviteName}
                    style={[
                      styles.input,
                      {
                        backgroundColor: theme.input,
                        color: theme.text,
                        borderColor: `${theme.placeholder}66`,
                      },
                    ]}
                    placeholder="@friend"
                    placeholderTextColor={theme.placeholder}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TextInput
                    value={inviteMessage}
                    onChangeText={setInviteMessage}
                    style={[
                      styles.input,
                      styles.messageInput,
                      {
                        backgroundColor: theme.input,
                        color: theme.text,
                        borderColor: `${theme.placeholder}66`,
                      },
                    ]}
                    placeholder="Add a note (optional)"
                    placeholderTextColor={theme.placeholder}
                    multiline
                    numberOfLines={2}
                    maxLength={140}
                  />
                  {inviteError ? (
                    <Text style={[styles.sectionError, { color: '#f87171' }]}>
                      {inviteError}
                    </Text>
                  ) : null}
                  <TouchableOpacity
                    onPress={handleInvite}
                    disabled={invitePending}
                    style={[
                      styles.primaryButton,
                      {
                        backgroundColor: invitePending
                          ? theme.placeholder
                          : theme.tint,
                      },
                    ]}
                    accessibilityRole="button"
                  >
                    {invitePending ? (
                      <ActivityIndicator color={theme.background} />
                    ) : (
                      <Text
                        style={[
                          styles.primaryButtonText,
                          { color: theme.background },
                        ]}
                      >
                        Send invite
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>

                <View style={styles.sectionList}>{renderInvites()}</View>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '90%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  closeText: {
    fontSize: 16,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 12,
  },
  scrollContent: {
    paddingBottom: 20,
    gap: 20,
  },
  progressCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  progressLabels: {
    gap: 4,
  },
  progressPrimary: {
    fontSize: 16,
    fontWeight: '600',
  },
  progressSecondary: {
    fontSize: 13,
  },
  progressActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  primaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '500',
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  sectionHint: {
    fontSize: 13,
  },
  sectionLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  sectionError: {
    fontSize: 13,
  },
  emptyLabel: {
    fontSize: 13,
  },
  infoText: {
    fontSize: 14,
  },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 6,
  },
  chipPrimary: {
    fontSize: 15,
    fontWeight: '600',
  },
  chipSecondary: {
    fontSize: 12,
  },
  inviteInputs: {
    gap: 8,
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  messageInput: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  sectionList: {
    gap: 8,
  },
  inviteRow: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  invitePrimary: {
    fontSize: 15,
    fontWeight: '600',
  },
  inviteStatus: {
    fontSize: 12,
    textTransform: 'capitalize',
  },
});

export default GiftTogetherModal;
