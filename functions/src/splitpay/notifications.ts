import * as functions from 'firebase-functions/v1';
import { sendPush } from '../notifications';

function formatCurrency(amountCents: number, currency = 'usd'): string {
  const amount = amountCents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    maximumFractionDigits: 2,
  }).format(amount);
}

type OwnerPledgeNotificationParams = {
  ownerId: string | undefined;
  wishId: string;
  wishTitle?: string | null;
  amountCents: number;
  remainingCents?: number;
  currency?: string;
};

export async function notifyOwnerOfPledge({
  ownerId,
  wishId,
  wishTitle,
  amountCents,
  remainingCents = 0,
  currency = 'usd',
}: OwnerPledgeNotificationParams) {
  if (!ownerId) return;
  const formattedAmount = formatCurrency(amountCents, currency);
  const remaining = Math.max(remainingCents, 0);
  const remainingText =
    remaining > 0
      ? `${formatCurrency(remaining, currency)} to go.`
      : `Almost there!`;
  const title = `${formattedAmount} pledged`;
  const body = `${remainingText}`;
  try {
    await sendPush(ownerId, title, body, 'splitpay_pledge', `/wish/${wishId}`);
  } catch (error) {
    functions.logger.warn('Failed to send owner pledge notification', {
      wishId,
      ownerId,
      error,
    });
  }
}

type WishFundedNotificationParams = {
  ownerId: string | undefined;
  wishId: string;
  wishTitle?: string | null;
};

export async function notifyOwnerWishFunded({
  ownerId,
  wishId,
  wishTitle,
}: WishFundedNotificationParams) {
  if (!ownerId) return;
  const title = 'Your wish is fully funded! 🎉';
  const body = wishTitle
    ? `"${wishTitle}" just reached its goal.`
    : 'Your wish just reached its goal.';
  try {
    await sendPush(ownerId, title, body, 'splitpay_funded', `/wish/${wishId}`);
  } catch (error) {
    functions.logger.warn('Failed to send funded notification', {
      wishId,
      ownerId,
      error,
    });
  }
}

type PledgerCaptureNotificationParams = {
  userId: string | null | undefined;
  wishId: string;
  wishTitle?: string | null;
  amountCents: number;
  currency?: string;
};

export async function notifyPledgerCaptured({
  userId,
  wishId,
  wishTitle,
  amountCents,
  currency = 'usd',
}: PledgerCaptureNotificationParams) {
  if (!userId) return;
  const formattedAmount = formatCurrency(amountCents, currency);
  const title = `We captured ${formattedAmount}`;
  const body = wishTitle
    ? `Thank you for supporting "${wishTitle}".`
    : 'Thank you for supporting this wish.';
  try {
    await sendPush(userId, title, body, 'splitpay_capture', `/wish/${wishId}`);
  } catch (error) {
    functions.logger.warn('Failed to send capture notification', {
      wishId,
      userId,
      error,
    });
  }
}

type PledgerExpiredNotificationParams = {
  userId: string | null | undefined;
  wishId: string;
  wishTitle?: string | null;
};

export async function notifyPledgerExpired({
  userId,
  wishId,
  wishTitle,
}: PledgerExpiredNotificationParams) {
  if (!userId) return;
  const title = 'Funding expired — no charge';
  const body = wishTitle
    ? `The wish "${wishTitle}" did not meet its goal. Your pledge was released.`
    : 'The wish did not meet its goal. Your pledge was released.';
  try {
    await sendPush(userId, title, body, 'splitpay_expired', `/wish/${wishId}`);
  } catch (error) {
    functions.logger.warn('Failed to send expired notification', {
      wishId,
      userId,
      error,
    });
  }
}
