import type { Request, Response } from 'express';
import { startPayment as startPaymentHandler } from '../../createCheckoutSession';
import { handleExpressCheckout as expressCheckoutHandler } from '../../expressCheckout';
import { handleWebhook as handleWebhookHandler } from '../../stripeWebhook';

export function startPayment(req: Request, res: Response) {
  return startPaymentHandler(req, res);
}

export function handleWebhook(req: Request, res: Response) {
  return handleWebhookHandler(req, res);
}

export function expressCheckout(req: Request, res: Response) {
  return expressCheckoutHandler(req, res);
}
