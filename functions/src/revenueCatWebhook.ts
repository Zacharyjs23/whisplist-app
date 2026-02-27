import { logger, runWith } from 'firebase-functions/v1';
import type { Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { REVENUECAT_WEBHOOK_TOKEN } from './secrets';
import { resolvePlanKeyFromProductId } from './planCatalog';

const db = admin.firestore();

type FirestoreTransaction = FirebaseFirestore.Transaction;

type RevenueCatEvent = {
  id?: string;
  type?: string;
  app_user_id?: string;
  period_type?: string;
  environment?: string;
  product_id?: string;
  product_identifier?: string;
  expiration_at_ms?: number | string | null;
  event_timestamp_ms?: number | string | null;
  original_transaction_id?: string | null;
  transaction_id?: string | null;
};

type RevenueCatPayload = {
  event?: RevenueCatEvent & Record<string, unknown>;
  app_user_id?: string;
  type?: string;
  period_type?: string;
  environment?: string;
  product_id?: string;
  product_identifier?: string;
  expiration_at_ms?: number | string | null;
  event_timestamp_ms?: number | string | null;
  event_id?: string;
  id?: string;
  [key: string]: unknown;
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' && value.trim().length) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const compareSignatures = (signature: string, expected: Buffer) => {
  try {
    const provided = Buffer.from(signature.trim(), 'base64');
    if (provided.length !== expected.length) return false;
    return timingSafeEqual(provided, expected);
  } catch (err) {
    logger.warn('Failed to decode RevenueCat signature', err);
    return false;
  }
};

const verifySignature = (req: Request, secret: string): boolean => {
  const header = req.header('x-revenuecat-signature');
  if (!header) {
    logger.warn('Missing RevenueCat signature header');
    return false;
  }
  if (!secret) return false;
  const rawBody: Buffer = (req as Request & { rawBody?: Buffer }).rawBody
    ? (req as Request & { rawBody: Buffer }).rawBody
    : Buffer.from(JSON.stringify(req.body ?? {}));
  const expected = createHmac('sha1', secret).update(rawBody).digest();
  return compareSignatures(header, expected);
};

const resolveStatus = (
  eventType: string,
  periodType?: string | null,
): 'active' | 'trialing' | 'canceled' | undefined => {
  const normalized = eventType.toUpperCase();
  const isTrial = (periodType || '').toUpperCase() === 'TRIAL';
  const activeTypes = new Set([
    'INITIAL_PURCHASE',
    'RENEWAL',
    'PRODUCT_CHANGE',
    'UNCANCELLATION',
    'GRACE_PERIOD_ENTRY',
    'GRACE_PERIOD_ENTERED',
    'NON_RENEWING_PURCHASE',
  ]);
  const cancelTypes = new Set([
    'CANCELLATION',
    'EXPIRATION',
    'BILLING_ISSUE',
    'GRACE_PERIOD_EXIT',
    'GRACE_PERIOD_EXITED',
    'PRODUCT_CHANGE_FAILURE',
    'REFUND',
    'SUBSCRIBER_DELETED',
  ]);
  if (activeTypes.has(normalized)) {
    return isTrial ? 'trialing' : 'active';
  }
  if (cancelTypes.has(normalized)) {
    return 'canceled';
  }
  return undefined;
};

export const revenueCatWebhook = runWith({ secrets: [REVENUECAT_WEBHOOK_TOKEN] })
  .https.onRequest(async (req: Request, res: Response) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }

    try {
      const secret = REVENUECAT_WEBHOOK_TOKEN.value();
      if (!secret) {
        logger.error('RevenueCat webhook secret not configured');
        res.status(500).send('Webhook secret missing');
        return;
      }

      if (!verifySignature(req, secret)) {
        res.status(401).send('Invalid RevenueCat signature');
        return;
      }

      const payload = (req.body ?? {}) as RevenueCatPayload;
      const event = (payload.event ?? payload) as RevenueCatEvent;

      const appUserId = (
        payload.app_user_id ??
        event.app_user_id ??
        ''
      ).toString();
      const typeRaw = (payload.type ?? event.type ?? '').toString();
      if (!appUserId || !typeRaw) {
        res.status(400).send('Missing required fields');
        return;
      }

      const eventType = typeRaw.toUpperCase();
      const periodType = (payload.period_type ?? event.period_type ?? null) as
        | string
        | null;
      const status = resolveStatus(eventType, periodType);
      if (!status) {
        logger.info('Ignoring RevenueCat event type', {
          appUserId,
          eventType,
        });
        res.json({ ok: true, ignored: true });
        return;
      }

      const eventId = (
        payload.event_id ??
        event.id ??
        payload.id ??
        ''
      ).toString();
      if (!eventId) {
        res.status(400).send('Missing event identifier');
        return;
      }

      const environment = (
        payload.environment ??
        event.environment ??
        'UNKNOWN'
      )
        .toString()
        .toUpperCase();
      const productId = (payload.product_id ??
        payload.product_identifier ??
        event.product_id ??
        event.product_identifier ??
        null) as string | null;
      const planKey = resolvePlanKeyFromProductId(productId);

      const expirationMs =
        toNumber(payload.expiration_at_ms ?? event.expiration_at_ms) ??
        undefined;
      const eventTimestampMs =
        toNumber(payload.event_timestamp_ms ?? event.event_timestamp_ms) ??
        undefined;
      const effectiveEventMs = eventTimestampMs ?? expirationMs ?? Date.now();
      const expirationTimestamp = expirationMs
        ? admin.firestore.Timestamp.fromMillis(expirationMs)
        : null;

      const transactionId = (event.original_transaction_id ??
        event.transaction_id ??
        null) as string | null;

      const subRef = db
        .collection('users')
        .doc(appUserId)
        .collection('billing')
        .doc(
          'subscription',
        ) as FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>;
      const userRef = db.collection('users').doc(appUserId);
      const processedRef = db
        .collection('_revenuecat_events')
        .doc(
          eventId,
        ) as FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>;

      let deduped = false;
      let stale = false;

      await db.runTransaction(async (tx: FirestoreTransaction) => {
        const processedSnap = (await tx.get(
          processedRef,
        )) as FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>;
        if (processedSnap.exists) {
          deduped = true;
          return;
        }

        const existingSub = (await tx.get(
          subRef,
        )) as FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>;
        const lastEventMs = existingSub.exists
          ? (existingSub.get('lastEventMs') as number | undefined)
          : undefined;
        if (lastEventMs && effectiveEventMs <= lastEventMs) {
          stale = true;
          tx.set(
            processedRef,
            {
              appUserId,
              eventType,
              status,
              productId: productId ?? null,
              planKey: planKey ?? null,
              environment,
              stale: true,
              recordedAt: admin.firestore.FieldValue.serverTimestamp(),
              eventTimestampMs: effectiveEventMs,
            },
            { merge: false },
          );
          return;
        }

        const subscriptionUpdate: Record<string, unknown> = {
          status,
          provider: 'revenuecat',
          productId: productId ?? null,
          planKey: planKey ?? null,
          environment,
          isSandbox: environment === 'SANDBOX',
          lastEventId: eventId,
          lastEventMs: effectiveEventMs,
          originalTransactionId: transactionId ?? null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          currentPeriodEnd: expirationTimestamp ?? null,
          expirationAt: expirationTimestamp ?? null,
        };

        const shouldEnableSupporter =
          environment !== 'SANDBOX' &&
          (status === 'active' || status === 'trialing');

        tx.set(subRef, subscriptionUpdate, { merge: true });
        tx.set(
          userRef,
          {
            isSupporter: shouldEnableSupporter,
            supporterPlan: planKey ?? null,
          },
          { merge: true },
        );

        tx.set(processedRef, {
          appUserId,
          eventType,
          status,
          productId: productId ?? null,
          planKey: planKey ?? null,
          environment,
          recordedAt: admin.firestore.FieldValue.serverTimestamp(),
          eventTimestampMs: effectiveEventMs,
        });
      });

      res.json({ ok: true, deduped, stale });
    } catch (err) {
      logger.error('revenueCatWebhook failed', err);
      res.status(500).send('Internal error');
    }
  });
