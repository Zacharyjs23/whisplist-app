import React, { useCallback, useMemo, useState } from 'react';
import useCheckout from '@/hooks/useCheckout';
import {
  startExpressCheckout,
  type ExpressCheckoutResult,
} from '@/services/payments/expressCheckout';

type ExpressCheckoutButtonProps = {
  wishId: string;
  curatorId: string;
  buyerId: string;
  tokenId: string;
  amount: number;
  currency?: string;
  label?: string;
  disabled?: boolean;
  onSuccess?: (result: ExpressCheckoutResult) => void;
  onError?: (error: Error) => void;
  resetKeyOnSuccess?: boolean;
};

export const ExpressCheckoutButton: React.FC<ExpressCheckoutButtonProps> = ({
  wishId,
  curatorId,
  buyerId,
  tokenId,
  amount,
  currency = 'usd',
  label = 'Express Checkout',
  disabled = false,
  onSuccess,
  onError,
  resetKeyOnSuccess = true,
}) => {
  const { getIdempotencyKey, resetIdempotencyKey } = useCheckout();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buttonLabel = useMemo(
    () => (pending ? 'Processing…' : label),
    [pending, label],
  );

  const handleClick = useCallback(async () => {
    if (disabled || pending) return;
    try {
      setPending(true);
      setError(null);
      const idempotencyKey = getIdempotencyKey();
      const result = await startExpressCheckout({
        wishId,
        curatorId,
        buyerId,
        tokenId,
        amount,
        currency,
        idempotencyKey,
      });
      onSuccess?.(result);
      if (resetKeyOnSuccess) {
        resetIdempotencyKey();
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to complete checkout';
      setError(message);
      onError?.(err instanceof Error ? err : new Error(message));
      resetIdempotencyKey();
    } finally {
      setPending(false);
    }
  }, [
    amount,
    buyerId,
    curatorId,
    currency,
    disabled,
    getIdempotencyKey,
    onError,
    onSuccess,
    pending,
    resetIdempotencyKey,
    resetKeyOnSuccess,
    tokenId,
    wishId,
  ]);

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || pending}
        aria-busy={pending}
        aria-live="polite"
      >
        {buttonLabel}
      </button>
      {error ? (
        <p role="alert" style={{ color: '#c00', marginTop: 8 }}>
          {error}
        </p>
      ) : null}
    </div>
  );
};

export default ExpressCheckoutButton;
