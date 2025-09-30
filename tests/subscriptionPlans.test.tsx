import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { SubscriptionPlans } from '@/components/SubscriptionPlans';

const palette = { text: '#000', input: '#eee', placeholder: '#999', tint: '#a78bfa' };
const t = (_k: string, d?: string) => d || _k;

describe('SubscriptionPlans', () => {
  it('shows setup CTA when priceId missing and still triggers handler with plan data', () => {
    const onStartCheckout = jest.fn();
    const plans = [
      { key: 'supporter_monthly', name: 'Supporter', price: '$1.99 / month' },
      { key: 'patron_monthly', name: 'Patron', price: '$4.99 / month' },
    ];
    const { getByTestId, getAllByText, getByText } = render(
      <SubscriptionPlans
        plans={plans}
        palette={palette}
        t={t}
        onStartCheckout={onStartCheckout}
        stripeConfigured={false}
      />,
    );
    const supporterBtn = getByTestId('subscribe-supporter_monthly');
    expect(supporterBtn.props.accessibilityState.disabled).toBe(false);
    expect(getAllByText('Finish billing setup')).toHaveLength(2);
    fireEvent.press(supporterBtn);
    expect(onStartCheckout).toHaveBeenCalledWith(plans[0]);
    expect(
      getByText(
        'Subscriptions are not configured. Add Stripe price IDs in your environment.',
      ),
    ).toBeTruthy();
  });

  it('enables button and calls handler when priceId present', () => {
    const onStartCheckout = jest.fn();
    const plans = [
      { key: 'supporter_monthly', name: 'Supporter', price: '$1.99 / month', priceId: 'price_123' },
    ];
    const { getByTestId } = render(
      <SubscriptionPlans
        plans={plans}
        palette={palette}
        t={t}
        onStartCheckout={onStartCheckout}
        stripeConfigured
      />,
    );
    const btn = getByTestId('subscribe-supporter_monthly');
    fireEvent.press(btn);
    expect(onStartCheckout).toHaveBeenCalledWith(plans[0]);
  });

  it('renders plan benefits when provided', () => {
    const onStartCheckout = jest.fn();
    const plans = [
      {
        key: 'supporter_monthly',
        name: 'Supporter',
        price: '$1.99 / month',
        priceId: 'price_123',
        benefits: ['Rephrase assistant', 'Supporter badge'],
      },
    ];
    const { getByText } = render(
      <SubscriptionPlans
        plans={plans}
        palette={palette}
        t={t}
        onStartCheckout={onStartCheckout}
        stripeConfigured
      />,
    );
    expect(getByText(/Rephrase assistant/)).toBeTruthy();
    expect(getByText(/Supporter badge/)).toBeTruthy();
  });
});
