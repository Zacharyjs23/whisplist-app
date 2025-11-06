import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useAuthSession } from '@/contexts/AuthSessionContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  logGiftCancel,
  logGiftConfirmed,
  logGiftCtaTap,
  logReturnSuccess,
  logVenmoOpen,
} from '@/src/lib/analytics';
import { buildVenmoLinks, openVenmo } from '@/src/lib/venmo';
import { useExperiment } from '@/src/experiments/useExperiment';
import { createGiftCheckout } from '@/helpers/wishes';
import * as logger from '@/shared/logger';

type GiftCTAProps = {
  wishId: string;
  wishTitle: string;
  recipientId: string;
  goalAmount?: number | null;
  currentGiftTotal?: number | null;
  venmoRecipient?: string | null;
  isPrivate?: boolean;
  onGiftConfirmed?: (amount: number) => void;
};

type StartGiftResponse = {
  token: string;
  giftId: string;
  amount: number;
  note: string;
  recipient?: string | null;
  expiresAt: string;
};

type ConfirmGiftResponse = {
  status: 'confirmed' | 'already_confirmed';
  wishId: string;
  amount: number;
  giftTotal: number;
};

const AMOUNT_PRESETS = [5, 10, 20];
const RATE_LIMIT_MS = 2000;

const functionsBaseUrl = (() => {
  const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) return null;
  return `https://us-central1-${projectId}.cloudfunctions.net/gifts`;
})();

const stripeSuccessUrl =
  process.env.EXPO_PUBLIC_GIFT_SUCCESS_URL ?? 'whisplist://gift/success';
const stripeCancelUrl =
  process.env.EXPO_PUBLIC_GIFT_CANCEL_URL ?? 'whisplist://gift/cancel';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(amount);
}

export function GiftCTA({
  wishId,
  wishTitle,
  recipientId,
  goalAmount,
  currentGiftTotal,
  venmoRecipient,
  isPrivate,
  onGiftConfirmed,
}: GiftCTAProps) {
  const { theme } = useTheme();
  const { user } = useAuthSession();
  const [selectedAmount, setSelectedAmount] = useState<number>(
    AMOUNT_PRESETS[1],
  );
  const [customAmount, setCustomAmount] = useState<string>('');
  const [pending, setPending] = useState(false);
  const [stripeVisible, setStripeVisible] = useState(false);
  const [localGiftTotal, setLocalGiftTotal] = useState(
    typeof currentGiftTotal === 'number' ? currentGiftTotal : 0,
  );
  const [lastError, setLastError] = useState<string | null>(null);
  const activeGiftRef = useRef<StartGiftResponse | null>(null);
  const lastTapRef = useRef<number>(0);

  const variant = useExperiment(
    'gift_venmo_vs_stripe',
    ['venmo', 'stripe'] as const,
    { subject: user?.uid ?? null },
  );

  useEffect(() => {
    setLocalGiftTotal(
      typeof currentGiftTotal === 'number' ? currentGiftTotal : 0,
    );
  }, [currentGiftTotal]);

  const makePayload = useCallback(
    (amount: number) => ({
      wishId,
      amount,
      variant,
      userId: user?.uid ?? null,
    }),
    [user?.uid, variant, wishId],
  );

  const isOwner = user?.uid && user.uid === recipientId;
  const disabled =
    !functionsBaseUrl ||
    pending ||
    isOwner ||
    isPrivate ||
    !recipientId ||
    selectedAmount <= 0;

  const handleStripeFlow = useCallback(async () => {
    try {
      setPending(true);
      const res = await createGiftCheckout(
        wishId,
        selectedAmount,
        recipientId,
        stripeSuccessUrl,
        stripeCancelUrl,
        user?.uid ?? null,
      );
      if (res.url) {
        await WebBrowser.openBrowserAsync(res.url, {
          enableDefaultShareMenuItem: false,
        });
      }
    } catch (err) {
      logger.error('Stripe fallback failed', err);
      Alert.alert('Unable to open checkout', 'Please try again shortly.');
    } finally {
      setPending(false);
      setStripeVisible(false);
    }
  }, [recipientId, selectedAmount, user?.uid, wishId]);

  const confirmGiftFromToken = useCallback(
    async (token: string) => {
      if (!functionsBaseUrl) return;
      try {
        const res = await fetch(`${functionsBaseUrl}/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        if (!res.ok) {
          throw new Error(`Confirm failed: ${res.status}`);
        }
        const data = (await res.json()) as ConfirmGiftResponse;
        if (
          data.status === 'confirmed' ||
          data.status === 'already_confirmed'
        ) {
          const payload = makePayload(data.amount);
          logReturnSuccess(payload);
          logGiftConfirmed(payload);
          setLocalGiftTotal(data.giftTotal);
          onGiftConfirmed?.(data.amount);
          if (Platform.OS === 'android') {
            const { ToastAndroid } = await import('react-native');
            ToastAndroid.show(
              'Gift confirmed — thank you!',
              ToastAndroid.SHORT,
            );
          } else {
            Alert.alert(
              'Gift confirmed',
              'Thank you for supporting this wish!',
            );
          }
        }
      } catch (err) {
        logger.warn('Gift confirmation failed', err);
        logGiftCancel(
          makePayload(activeGiftRef.current?.amount ?? selectedAmount),
        );
        setLastError(
          'We could not verify your gift. Please contact support if the charge went through.',
        );
      } finally {
        activeGiftRef.current = null;
      }
    },
    [makePayload, onGiftConfirmed, selectedAmount],
  );

  const handleIncomingUrl = useCallback(
    (incomingUrl: string) => {
      try {
        const parsed = Linking.parse(incomingUrl);
        if (!parsed?.hostname && !parsed?.path) return;
        const path = parsed.path ?? '';
        if (!path.startsWith('gift/complete')) return;
        const tokenParam = parsed.queryParams?.token;
        if (typeof tokenParam === 'string' && activeGiftRef.current) {
          confirmGiftFromToken(tokenParam);
        }
      } catch (err) {
        logger.warn('Failed to handle deep link', err);
      }
    },
    [confirmGiftFromToken],
  );

  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleIncomingUrl(url);
    });
    Linking.getInitialURL().then((initialUrl) => {
      if (initialUrl) {
        handleIncomingUrl(initialUrl);
      }
    });
    return () => {
      subscription.remove();
    };
  }, [handleIncomingUrl]);

  const launchVenmo = useCallback(
    async (payload: StartGiftResponse) => {
      const returnUrl = Linking.createURL(
        `gift/complete?token=${encodeURIComponent(payload.token)}`,
      );
      const links = buildVenmoLinks({
        amount: payload.amount,
        note: payload.note,
        recipient: payload.recipient ?? venmoRecipient ?? undefined,
        returnUrl,
      });

      const result = await openVenmo(links);
      if (result.opened) {
        logVenmoOpen(makePayload(payload.amount));
        activeGiftRef.current = payload;
      } else {
        logGiftCancel(makePayload(payload.amount));
        Alert.alert(
          'Unable to open Venmo',
          'We could not open Venmo on this device. Please try again or use the Stripe option.',
        );
      }
    },
    [makePayload, venmoRecipient],
  );

  const requestStartGift = useCallback(
    async (amount: number) => {
      if (!functionsBaseUrl) throw new Error('Cloud Functions not configured');
      const now = Date.now();
      if (now - lastTapRef.current < RATE_LIMIT_MS) {
        throw new Error('Please wait a moment before trying again.');
      }
      lastTapRef.current = now;
      const response = await fetch(`${functionsBaseUrl}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wishId,
          amount,
          variant: 'venmo',
          userId: user?.uid ?? null,
          platform: Platform.OS,
        }),
      });
      if (!response.ok) {
        throw new Error(`Start gift failed: ${response.status}`);
      }
      return (await response.json()) as StartGiftResponse;
    },
    [user?.uid, wishId],
  );

  const handleSubmit = useCallback(async () => {
    if (disabled) return;
    setLastError(null);
    logGiftCtaTap(makePayload(selectedAmount));
    if (variant === 'stripe') {
      setStripeVisible(true);
      return;
    }
    try {
      setPending(true);
      const payload = await requestStartGift(selectedAmount);
      await launchVenmo(payload);
    } catch (err) {
      logger.warn('Failed to start Venmo gift', err);
      logGiftCancel(makePayload(selectedAmount));
      setLastError('Unable to start gifting flow. Please try again.');
    } finally {
      setPending(false);
    }
  }, [
    disabled,
    launchVenmo,
    makePayload,
    requestStartGift,
    selectedAmount,
    variant,
  ]);

  const applyCustomAmount = useCallback(() => {
    const numeric = Number(customAmount.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(numeric) || numeric <= 0) {
      Alert.alert('Invalid amount', 'Enter an amount greater than zero.');
      return;
    }
    if (numeric > 10000) {
      Alert.alert('Amount too high', 'The maximum gift is $10,000.');
      return;
    }
    setSelectedAmount(Math.round(numeric * 100) / 100);
    setCustomAmount('');
  }, [customAmount]);

  if (isOwner || isPrivate) {
    return null;
  }

  const totalDisplay =
    goalAmount && goalAmount > 0
      ? `${formatCurrency(localGiftTotal)} of ${formatCurrency(goalAmount)}`
      : `Total gifted: ${formatCurrency(localGiftTotal)}`;

  return (
    <View style={[styles.container, { backgroundColor: theme.input }]}>
      <Text style={[styles.heading, { color: theme.text }]}>
        Support this wish
      </Text>
      <Text style={[styles.total, { color: theme.placeholder }]}>
        {totalDisplay}
      </Text>

      <View style={styles.presetsRow}>
        {AMOUNT_PRESETS.map((amount) => {
          const isSelected = amount === selectedAmount;
          return (
            <TouchableOpacity
              key={amount}
              onPress={() => setSelectedAmount(amount)}
              style={[
                styles.presetChip,
                {
                  backgroundColor: isSelected ? theme.tint : theme.background,
                  borderColor: isSelected ? theme.tint : theme.placeholder,
                },
              ]}
            >
              <Text
                style={[
                  styles.presetText,
                  { color: isSelected ? theme.background : theme.text },
                ]}
              >
                {formatCurrency(amount)}
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
            {
              backgroundColor: theme.background,
              color: theme.text,
              borderColor: theme.placeholder,
            },
          ]}
          onSubmitEditing={applyCustomAmount}
          returnKeyType="done"
        />
        <TouchableOpacity
          onPress={applyCustomAmount}
          style={[styles.customApply, { backgroundColor: theme.tint }]}
        >
          <Text style={[styles.customApplyText, { color: theme.background }]}>
            Apply
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        onPress={handleSubmit}
        style={[
          styles.ctaButton,
          {
            backgroundColor: disabled ? theme.placeholder : theme.tint,
          },
        ]}
        disabled={disabled}
      >
        {pending ? (
          <ActivityIndicator color={theme.background} />
        ) : (
          <Text style={[styles.ctaText, { color: theme.background }]}>
            {`Send ${formatCurrency(selectedAmount)} toward this wish — Venmo opens instantly.`}
          </Text>
        )}
      </TouchableOpacity>

      {lastError ? (
        <Text style={[styles.errorText, { color: theme.tint }]}>
          {lastError}
        </Text>
      ) : null}

      <Modal
        visible={stripeVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setStripeVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[styles.modalCard, { backgroundColor: theme.background }]}
          >
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              Stripe checkout
            </Text>
            <Text style={[styles.modalBody, { color: theme.text }]}>
              Venmo is unavailable for you right now. Continue with Stripe to
              send {formatCurrency(selectedAmount)} securely.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setStripeVisible(false)}
                style={[styles.modalButton, { borderColor: theme.placeholder }]}
              >
                <Text
                  style={[styles.modalButtonText, { color: theme.placeholder }]}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleStripeFlow}
                style={[
                  styles.modalButton,
                  { backgroundColor: theme.tint, borderColor: theme.tint },
                ]}
                disabled={pending}
              >
                {pending ? (
                  <ActivityIndicator color={theme.background} />
                ) : (
                  <Text
                    style={[
                      styles.modalButtonText,
                      { color: theme.background },
                    ]}
                  >
                    Continue
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
  },
  heading: {
    fontSize: 18,
    fontWeight: '600',
  },
  total: {
    marginTop: 6,
    fontSize: 14,
  },
  presetsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  presetChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 24,
    borderWidth: 1,
    flex: 1,
    marginRight: 8,
    alignItems: 'center',
  },
  presetText: {
    fontSize: 14,
    fontWeight: '500',
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  customInput: {
    flex: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    fontSize: 14,
    marginRight: 8,
  },
  customApply: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  customApplyText: {
    fontWeight: '600',
  },
  ctaButton: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 18,
    alignItems: 'center',
  },
  ctaText: {
    fontWeight: '600',
    textAlign: 'center',
  },
  errorText: {
    marginTop: 12,
    fontSize: 13,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    borderRadius: 18,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  modalBody: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 20,
  },
  modalActions: {
    marginTop: 20,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  modalButton: {
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderWidth: 1,
    marginLeft: 12,
  },
  modalButtonText: {
    fontWeight: '600',
    fontSize: 15,
  },
});

export default GiftCTA;
