import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useStripe } from '@stripe/stripe-react-native';
import { createSplitPayPledge } from '@/helpers/wishes';
import useCheckout from '@/hooks/useCheckout';
import { formatCurrency } from '@/shared/numberFormat';
import {
  logChipInAmountSelect,
  logChipInOpen,
  logPledgeConfirmedEvent,
  logPledgeCreatedEvent,
  logPledgeFailedEvent,
} from '@/src/lib/analytics';

const MIN_PLEDGE_CENTS = 500;
const PRESET_AMOUNTS_CENTS = [500, 1000, 2500] as const;

type ChipInModalProps = {
  visible: boolean;
  onClose: () => void;
  wishId: string;
  wishTitle?: string;
  currency?: string;
  remainingCents?: number | null;
  experimentBucket?: string | null;
  onCompleted?: (payload: { pledgeId: string; amountCents: number }) => void;
};

type CreatePledgeResponse = {
  pledgeId: string;
  clientSecret?: string | null;
  paymentIntentId: string;
  status: string;
};

export const ChipInModal: React.FC<ChipInModalProps> = ({
  visible,
  onClose,
  wishId,
  wishTitle,
  currency = 'USD',
  remainingCents,
  experimentBucket,
  onCompleted,
}) => {
  const { theme } = useTheme();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { getIdempotencyKey, resetIdempotencyKey } = useCheckout();
  const [selectedAmountCents, setSelectedAmountCents] = useState<number>(
    PRESET_AMOUNTS_CENTS[0],
  );
  const [customAmount, setCustomAmount] = useState<string>('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      logChipInOpen({
        wishId,
        amount: selectedAmountCents / 100,
        experiment: experimentBucket,
      });
    } else {
      setCustomAmount('');
      setError(null);
      resetIdempotencyKey();
    }
  }, [
    visible,
    wishId,
    experimentBucket,
    selectedAmountCents,
    resetIdempotencyKey,
  ]);

  useEffect(() => {
    if (
      typeof remainingCents === 'number' &&
      remainingCents > 0 &&
      remainingCents < selectedAmountCents
    ) {
      setSelectedAmountCents(Math.max(remainingCents, MIN_PLEDGE_CENTS));
    }
  }, [remainingCents, selectedAmountCents]);

  const presetAmounts = useMemo(() => {
    const list = new Set<number>(PRESET_AMOUNTS_CENTS);
    if (
      typeof remainingCents === 'number' &&
      remainingCents > 0 &&
      remainingCents <= 4000
    ) {
      const rounded = Math.max(
        MIN_PLEDGE_CENTS,
        Math.round(remainingCents / 100) * 100,
      );
      list.add(rounded);
    }
    return Array.from(list).sort((a, b) => a - b);
  }, [remainingCents]);

  const selectAmount = useCallback(
    (amount: number, preset = false) => {
      setSelectedAmountCents(amount);
      setCustomAmount('');
      logChipInAmountSelect({
        wishId,
        amount: amount / 100,
        experiment: experimentBucket,
        preset,
      });
    },
    [experimentBucket, wishId],
  );

  const applyCustomAmount = useCallback(() => {
    const sanitized = customAmount.replace(/[^0-9.]/g, '');
    const next = Number.parseFloat(sanitized);
    if (!Number.isFinite(next) || next <= 0) {
      setError('Enter an amount greater than $0.00');
      return;
    }
    const cents = Math.round(next * 100);
    if (cents < MIN_PLEDGE_CENTS) {
      setError(
        `Minimum pledge is ${formatCurrency(MIN_PLEDGE_CENTS / 100, currency)}`,
      );
      return;
    }
    if (cents > 500000) {
      setError('For large pledges, please contact support.');
      return;
    }
    setError(null);
    selectAmount(cents, false);
  }, [currency, customAmount, selectAmount]);

  useEffect(() => {
    return () => {
      resetIdempotencyKey();
    };
  }, [resetIdempotencyKey]);

  const shouldResetKeyOnError = useCallback((input: unknown) => {
    if (!(input instanceof Error)) return false;
    const message = input.message ?? '';
    if (!message) return false;
    return (
      message.toLowerCase().includes('previous attempt failed') ||
      message.toLowerCase().includes('invalid idempotency key') ||
      message.toLowerCase().includes('unable to create checkout session') ||
      message.toLowerCase().includes('missing payment secret')
    );
  }, []);

  const handleConfirm = useCallback(async () => {
    if (pending) return;
    try {
      setPending(true);
      setError(null);
      const idempotencyKey = getIdempotencyKey();
      const payload = await createSplitPayPledge(
        wishId,
        selectedAmountCents,
        experimentBucket,
        idempotencyKey,
      );
      const data = (payload ?? {}) as CreatePledgeResponse;
      if (!data?.clientSecret) {
        throw new Error('Missing payment secret from server');
      }

      logPledgeCreatedEvent({
        wishId,
        amount: selectedAmountCents / 100,
        pledgeId: data.pledgeId,
        experiment: experimentBucket,
        status: data.status,
      });

      const initResult = await initPaymentSheet({
        paymentIntentClientSecret: data.clientSecret,
        merchantDisplayName: 'WhispList',
      });
      if (initResult.error) {
        throw new Error(initResult.error.message);
      }

      const presentResult = await presentPaymentSheet();
      if (presentResult.error) {
        throw new Error(presentResult.error.message);
      }

      logPledgeConfirmedEvent({
        wishId,
        amount: selectedAmountCents / 100,
        pledgeId: data.pledgeId,
        experiment: experimentBucket,
        status: 'captured_pending',
      });

      if (Platform.OS === 'android') {
        Alert.alert(
          'Pledge authorized',
          'We will capture it once the wish is funded.',
        );
      }
      onCompleted?.({
        pledgeId: data.pledgeId,
        amountCents: selectedAmountCents,
      });
      resetIdempotencyKey();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected error';
      setError(message);
      logPledgeFailedEvent({
        wishId,
        amount: selectedAmountCents / 100,
        experiment: experimentBucket,
        reason: message,
      });
      if (!__DEV__) {
        Alert.alert('Unable to complete pledge', message);
      }
      if (shouldResetKeyOnError(err)) {
        resetIdempotencyKey();
      }
    } finally {
      setPending(false);
    }
  }, [
    experimentBucket,
    getIdempotencyKey,
    initPaymentSheet,
    onClose,
    onCompleted,
    pending,
    presentPaymentSheet,
    resetIdempotencyKey,
    shouldResetKeyOnError,
    selectedAmountCents,
    wishId,
  ]);

  const remainingLabel = useMemo(() => {
    if (typeof remainingCents !== 'number' || remainingCents <= 0) return null;
    return `${formatCurrency(remainingCents / 100, currency)} to go`;
  }, [currency, remainingCents]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity
          style={styles.backdropTouchable}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={[styles.card, { backgroundColor: theme.background }]}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: theme.text }]}>Chip in</Text>
            <TouchableOpacity onPress={onClose} hitSlop={HIT_SLOP}>
              <Text style={[styles.closeText, { color: theme.placeholder }]}>
                Close
              </Text>
            </TouchableOpacity>
          </View>
          {wishTitle ? (
            <Text style={[styles.subtitle, { color: theme.placeholder }]}>
              {`Support "${wishTitle}"`}
            </Text>
          ) : null}
          {remainingLabel ? (
            <Text style={[styles.remainingText, { color: theme.tint }]}>
              {remainingLabel}
            </Text>
          ) : null}

          <View style={styles.presetsRow}>
            {presetAmounts.map((amount) => {
              const selected = amount === selectedAmountCents;
              return (
                <TouchableOpacity
                  key={amount}
                  onPress={() => selectAmount(amount, true)}
                  style={[
                    styles.presetChip,
                    {
                      backgroundColor: selected ? theme.tint : theme.background,
                      borderColor: selected ? theme.tint : theme.placeholder,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.presetLabel,
                      { color: selected ? theme.background : theme.text },
                    ]}
                  >
                    {formatCurrency(amount / 100, currency)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.customRow}>
            <TextInput
              value={customAmount}
              onChangeText={setCustomAmount}
              placeholder="Custom amount"
              placeholderTextColor={theme.placeholder}
              keyboardType="decimal-pad"
              style={[
                styles.customInput,
                { color: theme.text, borderColor: theme.placeholder },
              ]}
              onSubmitEditing={applyCustomAmount}
              returnKeyType="done"
            />
            <TouchableOpacity
              onPress={applyCustomAmount}
              style={[styles.applyButton, { backgroundColor: theme.tint }]}
            >
              <Text style={[styles.applyText, { color: theme.background }]}>
                Apply
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={handleConfirm}
            style={[
              styles.confirmButton,
              { backgroundColor: pending ? theme.placeholder : theme.tint },
            ]}
            disabled={pending}
          >
            {pending ? (
              <ActivityIndicator color={theme.background} />
            ) : (
              <Text style={[styles.confirmText, { color: theme.background }]}>
                {`Authorize ${formatCurrency(selectedAmountCents / 100, currency)}`}
              </Text>
            )}
          </TouchableOpacity>

          <Text style={[styles.footnote, { color: theme.placeholder }]}>
            We only capture your pledge once the wish is funded or the deadline
            arrives.
          </Text>

          {error ? (
            <Text style={[styles.errorText, { color: theme.tint }]}>
              {error}
            </Text>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const HIT_SLOP = { top: 12, left: 12, right: 12, bottom: 12 } as const;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  backdropTouchable: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    width: '100%',
    borderRadius: 16,
    padding: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
  closeText: {
    fontSize: 14,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 4,
  },
  remainingText: {
    fontSize: 14,
    marginBottom: 16,
    fontWeight: '500',
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  presetChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 24,
    borderWidth: 1,
  },
  presetLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  customInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginRight: 10,
  },
  applyButton: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  applyText: {
    fontWeight: '600',
  },
  confirmButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  confirmText: {
    fontSize: 16,
    fontWeight: '600',
  },
  footnote: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 12,
  },
});
