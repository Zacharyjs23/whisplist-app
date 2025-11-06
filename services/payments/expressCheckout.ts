import { postJson } from '@/services/functions';

export type ExpressCheckoutPayload = {
  wishId: string;
  curatorId: string;
  buyerId: string;
  tokenId: string;
  amount: number;
  currency?: string;
  idempotencyKey: string;
};

export type ExpressCheckoutResult = {
  orderId: string;
  orderStatus: string;
};

const isPositiveInteger = (value: number): boolean =>
  Number.isInteger(value) && value > 0;

export async function startExpressCheckout(
  payload: ExpressCheckoutPayload,
): Promise<ExpressCheckoutResult> {
  const {
    wishId,
    curatorId,
    buyerId,
    tokenId,
    amount,
    currency,
    idempotencyKey,
  } = payload;

  if (!wishId || !curatorId || !buyerId || !tokenId) {
    throw new Error('Missing required express checkout identifiers');
  }
  if (!isPositiveInteger(amount)) {
    throw new Error('Express checkout amount must be a positive integer');
  }
  if (!idempotencyKey || idempotencyKey.length < 8) {
    throw new Error('Invalid idempotency key for express checkout');
  }

  const response = await postJson<ExpressCheckoutResult>('expressCheckout', {
    wishId,
    curatorId,
    buyerId,
    tokenId,
    amount,
    currency: currency ?? 'usd',
    idempotencyKey,
  });

  if (!response?.orderId || !response?.orderStatus) {
    throw new Error('Express checkout did not return an order confirmation');
  }

  return response;
}
