import { formatCurrency } from '@/shared/numberFormat';

export const splitPayTemplates = {
  ownerPledge(amountCents: number, remainingCents: number, currency = 'USD') {
    const amount = formatCurrency(amountCents / 100, currency);
    const remaining =
      remainingCents > 0
        ? formatCurrency(remainingCents / 100, currency)
        : null;
    return {
      title: `${amount} pledged`,
      body: remaining ? `${remaining} to go.` : 'Almost there!',
    } as const;
  },
  ownerFunded(wishTitle?: string | null) {
    return {
      title: 'Your wish is fully funded! 🎉',
      body: wishTitle
        ? `"${wishTitle}" just reached its goal.`
        : 'Your wish just reached its goal.',
    } as const;
  },
  pledgerCaptured(
    amountCents: number,
    wishTitle?: string | null,
    currency = 'USD',
  ) {
    const amount = formatCurrency(amountCents / 100, currency);
    return {
      title: `We captured ${amount}`,
      body: wishTitle
        ? `Thank you for supporting "${wishTitle}".`
        : 'Thank you for supporting this wish.',
    } as const;
  },
  pledgerExpired(wishTitle?: string | null) {
    return {
      title: 'Funding expired — no charge',
      body: wishTitle
        ? `"${wishTitle}" did not meet its goal. Your pledge was released.`
        : 'This wish did not meet its goal. Your pledge was released.',
    } as const;
  },
} as const;
