import { logger } from 'firebase-functions/v1';
import type { Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { createHmac, randomUUID } from 'node:crypto';
import type { DocumentSnapshot, Firestore } from 'firebase-admin/firestore';
import { incrementEngagement } from '../engagement';

const GIFT_TOKEN_TTL_MS = 5 * 60 * 1000;
const MAX_GIFT_AMOUNT = 10_000;

type GiftTokenPayload = {
  giftId: string;
  wishId: string;
  tokenId: string;
  amount: number;
  exp: number;
};

type GiftStartBody = {
  wishId?: unknown;
  amount?: unknown;
  variant?: unknown;
  userId?: unknown;
  platform?: unknown;
};

type GiftConfirmBody = {
  token?: unknown;
};

type GiftConfig = {
  secret: string;
  venmoHandle: string;
};

type GiftHttpHandlerDeps = {
  db: Firestore;
  readRuntimeConfig: () => Record<string, any>;
};

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/u, '');
}

function base64UrlDecode(input: string): Buffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4;
  const padded = pad ? `${normalized}${'='.repeat(4 - pad)}` : normalized;
  return Buffer.from(padded, 'base64');
}

function sanitizeAmount(input: unknown): number | null {
  const amount = typeof input === 'string' ? Number(input) : Number(input);
  if (!Number.isFinite(amount)) return null;
  if (amount <= 0 || amount > MAX_GIFT_AMOUNT) return null;
  return Math.round(amount * 100) / 100;
}

function truncateTitle(title: unknown): string {
  const raw =
    typeof title === 'string' && title.trim().length ? title.trim() : 'Wish';
  return raw.length > 60 ? `${raw.slice(0, 57)}...` : raw;
}

function buildVenmoNote(title: unknown, amount: number): string {
  return `Support "${truncateTitle(title)}" on WhispList – $${amount.toFixed(2)}`;
}

function applyCors(res: Response) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

export function createGiftHttpHandlers({
  db,
  readRuntimeConfig,
}: GiftHttpHandlerDeps) {
  let cachedGiftConfig: GiftConfig | null = null;

  function getGiftConfig(): GiftConfig {
    if (cachedGiftConfig) return cachedGiftConfig;
    const cfg = readRuntimeConfig();
    const secret =
      cfg?.gifts?.secret || process.env.GIFT_TOKEN_SECRET || undefined;
    if (!secret) {
      throw new Error(
        'Gift token secret not configured. Set functions.config().gifts.secret or GIFT_TOKEN_SECRET.',
      );
    }
    const venmoHandle =
      cfg?.gifts?.venmo_handle ||
      cfg?.gifts?.venmo ||
      process.env.GIFT_VENMO_HANDLE ||
      'whisplist';
    cachedGiftConfig = { secret, venmoHandle };
    return cachedGiftConfig;
  }

  function signGiftToken(payload: GiftTokenPayload): string {
    const { secret } = getGiftConfig();
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const signature = createHmac('sha256', secret)
      .update(encodedPayload)
      .digest();
    return `${encodedPayload}.${base64UrlEncode(signature)}`;
  }

  function verifyGiftToken(token: string): GiftTokenPayload {
    const [encodedPayload, signature] = token.split('.');
    if (!encodedPayload || !signature) {
      throw new Error('malformed_token');
    }
    const expectedSignature = base64UrlEncode(
      createHmac('sha256', getGiftConfig().secret)
        .update(encodedPayload)
        .digest(),
    );
    if (signature !== expectedSignature) {
      throw new Error('signature_mismatch');
    }
    const decoded = base64UrlDecode(encodedPayload).toString('utf8');
    const payload = JSON.parse(decoded) as GiftTokenPayload;
    if (
      !payload.giftId ||
      !payload.tokenId ||
      !payload.wishId ||
      typeof payload.amount !== 'number' ||
      typeof payload.exp !== 'number'
    ) {
      throw new Error('invalid_payload');
    }
    return payload;
  }

  async function giftStartHandler(req: Request, res: Response) {
    applyCors(res);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method_not_allowed' });
      return;
    }
    const body = (req.body || {}) as GiftStartBody;
    const wishId = typeof body.wishId === 'string' ? body.wishId : null;
    const amount = sanitizeAmount(body.amount);
    if (!wishId || amount === null) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }

    try {
      const wishRef = db.collection('wishes').doc(wishId);
      const wishSnap = await wishRef.get();
      if (!wishSnap.exists) {
        res.status(404).json({ error: 'wish_not_found' });
        return;
      }
      const wish = wishSnap.data() ?? {};
      const recipientId =
        typeof wish.userId === 'string' ? (wish.userId as string) : null;
      if (!recipientId) {
        res.status(400).json({ error: 'missing_recipient' });
        return;
      }
      const isPrivate =
        wish.visibility === 'private' ||
        wish.shareScope === 'private' ||
        wish.isPrivate === true;
      if (isPrivate) {
        res.status(403).json({ error: 'wish_private' });
        return;
      }
      const supporterId =
        typeof body.userId === 'string' && body.userId ? body.userId : null;
      const note = buildVenmoNote(wish.title ?? wish.text, amount);

      let venmoHandle = getGiftConfig().venmoHandle;
      try {
        const ownerSnap = await db.collection('users').doc(recipientId).get();
        const ownerHandle = ownerSnap.exists ? ownerSnap.get('venmoHandle') : null;
        if (typeof ownerHandle === 'string' && ownerHandle.trim()) {
          venmoHandle = ownerHandle.replace(/^@/, '').trim();
        }
      } catch (err) {
        logger.warn('Unable to resolve owner Venmo handle', err, {
          recipientId,
        });
      }

      const giftId = randomUUID();
      const tokenId = randomUUID();
      const expiresAt = Date.now() + GIFT_TOKEN_TTL_MS;
      const token = signGiftToken({
        giftId,
        wishId,
        tokenId,
        amount,
        exp: expiresAt,
      });

      await db
        .collection('gifts')
        .doc(giftId)
        .set({
          wishId,
          amount,
          supporterId,
          recipientId,
          variant: 'venmo',
          status: 'pending',
          tokenId,
          note,
          venmoRecipient: venmoHandle,
          platform: typeof body.platform === 'string' ? body.platform : null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          expiresAt: admin.firestore.Timestamp.fromMillis(expiresAt),
        });

      res.json({
        token,
        giftId,
        amount,
        note,
        recipient: venmoHandle,
        expiresAt: new Date(expiresAt).toISOString(),
      });
    } catch (err) {
      logger.error('startGift failed', err, { wishId });
      res.status(500).json({ error: 'internal' });
    }
  }

  async function giftConfirmHandler(req: Request, res: Response) {
    applyCors(res);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method_not_allowed' });
      return;
    }
    const body = (req.body || {}) as GiftConfirmBody;
    const token = typeof body.token === 'string' ? body.token : null;
    if (!token) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }

    let payload: GiftTokenPayload;
    try {
      payload = verifyGiftToken(token);
    } catch (err) {
      logger.warn('Token verification failed', err);
      res.status(401).json({ error: 'invalid_token' });
      return;
    }

    const now = Date.now();
    if (now > payload.exp) {
      try {
        await db.collection('gifts').doc(payload.giftId).set(
          {
            status: 'expired',
            expiredAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      } catch (err) {
        logger.warn('Failed to mark gift expired', err, {
          giftId: payload.giftId,
        });
      }
      res.status(410).json({ error: 'token_expired' });
      return;
    }

    try {
      const giftRef = db.collection('gifts').doc(payload.giftId);
      const wishRef = db.collection('wishes').doc(payload.wishId);
      const legacyRef = db
        .collection('gifts')
        .doc(payload.wishId)
        .collection('gifts')
        .doc(payload.giftId);
      const wishGiftRef = wishRef.collection('gifts').doc(payload.giftId);

      const result = await db.runTransaction(
        async (tx: FirebaseFirestore.Transaction) => {
          const giftSnap = (await tx.get(giftRef)) as unknown as DocumentSnapshot;
          const wishSnap = (await tx.get(wishRef)) as unknown as DocumentSnapshot;
          if (!giftSnap.exists) {
            throw new Error('gift_not_found');
          }
          const giftData = giftSnap.data() ?? {};
          if (giftData.tokenId !== payload.tokenId) {
            throw new Error('token_mismatch');
          }

          const supporterId =
            typeof giftData.supporterId === 'string' && giftData.supporterId
              ? giftData.supporterId
              : null;

          if (giftData.status === 'confirmed') {
            const total =
              typeof wishSnap.get('giftTotal') === 'number'
                ? (wishSnap.get('giftTotal') as number)
                : 0;
            return {
              status: 'already_confirmed' as const,
              supporterId,
              giftTotal: total,
            };
          }

          tx.update(giftRef, {
            status: 'confirmed',
            confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          const recipientId =
            typeof giftData.recipientId === 'string'
              ? (giftData.recipientId as string)
              : null;

          const sharedPayload = {
            amount: payload.amount,
            supporterId,
            recipientId,
            status: 'confirmed',
            variant: 'venmo',
            confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
          };

          tx.set(
            wishGiftRef,
            {
              ...sharedPayload,
              createdAt:
                giftData.createdAt instanceof admin.firestore.Timestamp
                  ? giftData.createdAt
                  : admin.firestore.FieldValue.serverTimestamp(),
              tokenId: payload.tokenId,
            },
            { merge: true },
          );

          tx.set(
            legacyRef,
            {
              ...sharedPayload,
              tokenId: payload.tokenId,
            },
            { merge: true },
          );

          const existingTotal =
            typeof wishSnap.get('giftTotal') === 'number'
              ? (wishSnap.get('giftTotal') as number)
              : 0;

          tx.set(
            wishRef,
            {
              giftTotal: admin.firestore.FieldValue.increment(payload.amount),
              fundingRaised: admin.firestore.FieldValue.increment(payload.amount),
              fundingSupporters: admin.firestore.FieldValue.increment(1),
            },
            { merge: true },
          );

          return {
            status: 'confirmed' as const,
            supporterId,
            giftTotal: existingTotal + payload.amount,
          };
        },
      );

      if (result.status === 'confirmed') {
        await incrementEngagement(result.supporterId ?? undefined, 'gifting');
      }

      res.json({
        status: result.status,
        wishId: payload.wishId,
        amount: payload.amount,
        giftTotal: result.giftTotal,
      });
    } catch (err) {
      logger.error('confirmGift failed', err, {
        giftId: payload.giftId,
      });
      if ((err as Error).message === 'gift_not_found') {
        res.status(404).json({ error: 'gift_not_found' });
      } else if ((err as Error).message === 'token_mismatch') {
        res.status(401).json({ error: 'invalid_token' });
      } else {
        res.status(500).json({ error: 'internal' });
      }
    }
  }

  return {
    giftStartHandler,
    giftConfirmHandler,
  };
}
