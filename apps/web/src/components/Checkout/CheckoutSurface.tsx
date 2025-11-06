import React, { useCallback, useMemo, useState } from 'react';
import { ExpressCheckoutButton } from './ExpressCheckoutButton';
import type { ExpressCheckoutResult } from '@/services/payments/expressCheckout';

type CheckoutSurfaceProps = {
  wishId: string;
  curatorId: string;
  buyerId: string;
  amountCents: number;
  currency?: string;
  expressTokenId?: string | null;
  isFollower: boolean;
  onStandardCheckout: () => void;
  renderStandardCta?: (props: {
    disabled: boolean;
    onClick: () => void;
  }) => React.ReactNode;
};

export const CheckoutSurface: React.FC<CheckoutSurfaceProps> = ({
  wishId,
  curatorId,
  buyerId,
  amountCents,
  currency = 'usd',
  expressTokenId,
  isFollower,
  onStandardCheckout,
  renderStandardCta,
}) => {
  const [expressMessage, setExpressMessage] = useState<string | null>(null);

  const expressEnabled = useMemo(
    () => Boolean(expressTokenId && isFollower),
    [expressTokenId, isFollower],
  );

  const handleExpressSuccess = useCallback(
    (result: ExpressCheckoutResult) => {
      setExpressMessage(
        `Payment ${result.orderStatus === 'succeeded' ? 'completed' : 'processing'} (${result.orderId}).`,
      );
    },
    [],
  );

  const handleExpressError = useCallback((error: Error) => {
    setExpressMessage(error.message);
  }, []);

  const renderStandardButton = useCallback(() => {
    if (renderStandardCta) {
      return renderStandardCta({
        disabled: false,
        onClick: onStandardCheckout,
      });
    }
    return (
      <button type="button" onClick={onStandardCheckout}>
        Continue to checkout
      </button>
    );
  }, [onStandardCheckout, renderStandardCta]);

  return (
    <section aria-label="Checkout actions">
      {expressEnabled ? (
        <div>
          <ExpressCheckoutButton
            wishId={wishId}
            curatorId={curatorId}
            buyerId={buyerId}
            tokenId={expressTokenId!}
            amount={amountCents}
            currency={currency}
            onSuccess={handleExpressSuccess}
            onError={handleExpressError}
          />
        </div>
      ) : (
        <p>
          Express checkout available when you follow this curator and have a saved payment
          method.
        </p>
      )}

      <div style={{ marginTop: 16 }}>{renderStandardButton()}</div>

      {expressMessage ? (
        <p role="status" style={{ marginTop: 12 }}>
          {expressMessage}
        </p>
      ) : null}
    </section>
  );
};

export default CheckoutSurface;
