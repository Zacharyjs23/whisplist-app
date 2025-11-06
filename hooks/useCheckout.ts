import { useCallback, useRef } from 'react';

function generateIdempotencyKey(): string {
  const timePart = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `chk_${timePart}_${randomPart}`;
}

export default function useCheckout() {
  const keyRef = useRef<string | null>(null);

  const getIdempotencyKey = useCallback(() => {
    if (!keyRef.current) {
      keyRef.current = generateIdempotencyKey();
    }
    return keyRef.current;
  }, []);

  const resetIdempotencyKey = useCallback(() => {
    keyRef.current = null;
  }, []);

  const peekIdempotencyKey = useCallback(() => keyRef.current, []);

  return {
    getIdempotencyKey,
    resetIdempotencyKey,
    peekIdempotencyKey,
  };
}
