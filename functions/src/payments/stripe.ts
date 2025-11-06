import Stripe from 'stripe';
import * as functions from 'firebase-functions/v1';
import { STRIPE_SECRET_KEY } from '../secrets';

const STRIPE_API_VERSION = '2022-11-15';

function createStripeClient(apiKey: string) {
  return new Stripe(apiKey, {
    apiVersion: STRIPE_API_VERSION,
  });
}

type StripeClient = ReturnType<typeof createStripeClient>;

type PaymentIntent = {
  id: string;
  status?: string;
  amount?: number | null;
  amount_capturable?: number | null;
  amount_received?: number | null;
  currency?: string | null;
  metadata?: Record<string, string>;
  charges?: {
    data?: {
      amount_captured?: number | null;
      [key: string]: unknown;
    }[];
  } | null;
  last_payment_error?: {
    message?: string | null;
  } | null;
  [key: string]: unknown;
};

type PaymentIntentCreateParams = {
  amount: number;
  currency: string;
  capture_method: 'manual';
  automatic_payment_methods: { enabled: boolean };
  customer?: string;
  metadata?: Record<string, string>;
  description?: string | null;
};

type PaymentIntentCaptureParams = {
  amount_to_capture?: number;
};

type PaymentIntentCancelParams = Record<string, unknown>;

type PaymentIntentRetrieveParams = Record<string, unknown>;

type GetStripeOptions = {
  /**
   * Override for test environments so we can inject a mocked client.
   */
  client?: StripeClient;
};

let cachedStripe: StripeClient | null = null;

function getStripe(options: GetStripeOptions = {}): StripeClient {
  if (options.client) {
    cachedStripe = options.client;
    return options.client;
  }
  if (!cachedStripe) {
    const apiKey = STRIPE_SECRET_KEY.value();
    if (!apiKey) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }
    cachedStripe = createStripeClient(apiKey);
  }
  return cachedStripe;
}

export type CreateManualPaymentIntentParams = {
  amount: number;
  currency?: string;
  customer?: string | null;
  metadata?: Record<string, string>;
  description?: string | null;
  idempotencyKey?: string | null;
};

export async function createManualPaymentIntent(
  params: CreateManualPaymentIntentParams,
): Promise<PaymentIntent> {
  const stripe = getStripe();
  const amount = Math.trunc(params.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(
      'amount must be a positive integer representing the smallest currency unit',
    );
  }

  const payload: PaymentIntentCreateParams = {
    amount,
    currency: params.currency?.toLowerCase() || 'usd',
    capture_method: 'manual',
    automatic_payment_methods: { enabled: true },
  };

  if (params.customer) {
    payload.customer = params.customer;
  }
  if (params.metadata && Object.keys(params.metadata).length > 0) {
    payload.metadata = params.metadata;
  }
  if (params.description) {
    payload.description = params.description;
  }

  const requestOptions =
    params.idempotencyKey && typeof params.idempotencyKey === 'string'
      ? { idempotencyKey: params.idempotencyKey }
      : undefined;

  try {
    return (await stripe.paymentIntents.create(
      payload as any,
      requestOptions,
    )) as PaymentIntent;
  } catch (error) {
    functions.logger.error('Failed to create manual PaymentIntent', {
      amount,
      currency: payload.currency,
      customer: payload.customer ?? null,
      metadata: payload.metadata ?? null,
      idempotencyKey: requestOptions?.idempotencyKey ?? null,
      error,
    });
    throw error;
  }
}

export async function capturePaymentIntent(
  paymentIntentId: string,
  options: { amount?: number } = {},
): Promise<PaymentIntent> {
  const stripe = getStripe();
  const captureParams: PaymentIntentCaptureParams = {};
  if (Number.isFinite(options.amount) && options.amount) {
    const amount = Math.trunc(options.amount!);
    if (amount <= 0) {
      throw new Error('capture amount must be positive');
    }
    captureParams.amount_to_capture = amount;
  }
  try {
    return (await stripe.paymentIntents.capture(
      paymentIntentId,
      captureParams as any,
    )) as PaymentIntent;
  } catch (error) {
    functions.logger.error('Failed to capture PaymentIntent', {
      paymentIntentId,
      amount_to_capture: captureParams.amount_to_capture ?? null,
      error,
    });
    throw error;
  }
}

export async function cancelPaymentIntent(
  paymentIntentId: string,
  options: PaymentIntentCancelParams = {},
): Promise<PaymentIntent> {
  const stripe = getStripe();
  try {
    return (await stripe.paymentIntents.cancel(
      paymentIntentId,
      options as any,
    )) as PaymentIntent;
  } catch (error) {
    functions.logger.error('Failed to cancel PaymentIntent', {
      paymentIntentId,
      error,
    });
    throw error;
  }
}

export async function retrievePaymentIntent(
  paymentIntentId: string,
  options: PaymentIntentRetrieveParams = {},
): Promise<PaymentIntent> {
  const stripe = getStripe();
  try {
    return (await stripe.paymentIntents.retrieve(
      paymentIntentId,
      options as any,
    )) as PaymentIntent;
  } catch (error) {
    functions.logger.error('Failed to retrieve PaymentIntent', {
      paymentIntentId,
      error,
    });
    throw error;
  }
}

export function __resetStripeTestClient() {
  cachedStripe = null;
}
