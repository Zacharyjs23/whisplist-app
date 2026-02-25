import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import {
  logger,
  region,
} from 'firebase-functions/v1';
import type { DecodedIdToken } from 'firebase-admin/auth';
import * as admin from 'firebase-admin';
import { canViewerSeeWish, normalizeWishScope, type WishScope } from './feedVisibility';
import type {
  DocumentReference,
  DocumentSnapshot,
  QueryDocumentSnapshot,
  Transaction,
} from 'firebase-admin/firestore';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

type FirestoreTimestamp = ReturnType<
  typeof admin.firestore.Timestamp.now
>;

const DEFAULT_STAGE = 'seed';
const FEED_RESULT_LIMIT = 60;
const PUBLIC_FETCH_LIMIT = 60;
const FRIEND_FETCH_LIMIT = 40;
const CLOSE_FETCH_LIMIT = 40;
const OWN_FETCH_LIMIT = 30;
const PUBLIC_SCOPES: ReadonlySet<WishScope> = new Set(['all', 'anon']);
const TIMESTAMP_FIELDS = new Set([
  'timestamp',
  'stageUpdatedAt',
  'boostedUntil',
  'deadline',
  'expiresAt',
  'fulfilledAt',
]);

const WISHLIST_TITLE_MAX = 120;
const WISHLIST_DESCRIPTION_MAX = 400;
const WISHLIST_ITEM_NAME_MAX = 140;
const WISHLIST_ITEM_NOTES_MAX = 240;
const WISHLIST_MAX_ITEMS = 50;
const IDEMPOTENCY_TTL_MS = 30_000;

const FEED_FIELD_ALLOWLIST = [
  'text',
  'category',
  'type',
  'displayName',
  'photoURL',
  'audioUrl',
  'imageUrl',
  'videoUrl',
  'giftLink',
  'giftType',
  'giftLabel',
  'fulfillmentLink',
  'fundingGoal',
  'fundingCurrency',
  'fundingPresets',
  'fundingRaised',
  'fundingSupporters',
  'splitPayEnabled',
  'targetAmount',
  'fundedAmount',
  'deadline',
  'status',
  'isPoll',
  'optionA',
  'optionB',
  'votesA',
  'votesB',
  'mood',
  'commentCount',
  'reactions',
  'expiresAt',
  'timestamp',
  'stage',
  'stageUpdatedAt',
  'accountabilityCircleId',
  'accountabilityCircleName',
  'supportRequest',
  'boostedUntil',
  'boosted',
  'detectedMood',
  'voiceTranscription',
  'aiRefinedText',
  'giftTogetherStatus',
];

const EMPTY_REACTIONS = {
  heart: 0,
  lightbulb: 0,
  hug: 0,
  pray: 0,
};

type SerializedWish = Record<string, unknown> & {
  id: string;
  scope: WishScope;
  timestamp: number | null;
  viewerContext: {
    isOwner: boolean;
    canSeeIdentity: boolean;
    scope: WishScope;
  };
};

type SanitizedWishlistItem = {
  name: string;
  url?: string;
  priceCents?: number;
  notes?: string;
};

type SanitizedWishlistPayload = {
  title: string;
  description?: string;
  items: SanitizedWishlistItem[];
};

function applyCors(res: Response) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With',
  );
  res.set(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  );
}

function extractBearerToken(header: string | null | undefined): string | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed.toLowerCase().startsWith('bearer ')) return null;
  const token = trimmed.slice(7).trim();
  return token.length ? token : null;
}

async function authenticate(
  req: Request,
): Promise<DecodedIdToken | null> {
  const token = extractBearerToken(req.get('Authorization'));
  if (!token) return null;
  try {
    return await admin.auth().verifyIdToken(token);
  } catch (err) {
    logger.warn('Invalid token for API request', err instanceof Error ? err : { err });
    return null;
  }
}

function sanitizeString(
  value: unknown,
  maxLength: number,
  { allowEmpty = false }: { allowEmpty?: boolean } = {},
): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.length) {
    return allowEmpty ? '' : null;
  }
  return trimmed.slice(0, maxLength);
}

function sanitizeOptionalString(
  value: unknown,
  maxLength: number,
): string | undefined {
  const sanitized = sanitizeString(value, maxLength, { allowEmpty: false });
  return sanitized ?? undefined;
}

function sanitizeUrl(value: unknown, maxLength = 2000): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed.length) return undefined;
  return trimmed.slice(0, maxLength);
}

function sanitizeNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function sanitizePositiveNumber(value: unknown): number | undefined {
  const parsed = sanitizeNumber(value);
  if (parsed === undefined) return undefined;
  return parsed >= 0 ? parsed : undefined;
}

function sanitizeTimestampInput(value: unknown): FirestoreTimestamp | null {
  if (!value) return null;
  if (value instanceof admin.firestore.Timestamp) return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return admin.firestore.Timestamp.fromDate(value);
  }
  const numeric = sanitizeNumber(value);
  if (numeric === undefined) return null;
  if (!Number.isFinite(numeric)) return null;
  const millis = Math.max(0, Math.floor(numeric));
  return admin.firestore.Timestamp.fromMillis(millis);
}

function timestampToMillis(value: unknown): number | null {
  if (!value) return null;
  if (value instanceof admin.firestore.Timestamp) {
    return (value as FirebaseFirestore.Timestamp).toMillis();
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

function sanitizeWishlistItem(value: unknown): SanitizedWishlistItem | null {
  if (!value || typeof value !== 'object') return null;
  const name = sanitizeString(
    (value as { name?: unknown }).name,
    WISHLIST_ITEM_NAME_MAX,
  );
  if (!name) return null;
  const sanitized: SanitizedWishlistItem = { name };
  const url = sanitizeUrl((value as { url?: unknown }).url);
  if (url) sanitized.url = url;
  const price = sanitizePositiveNumber(
    (value as { priceCents?: unknown }).priceCents,
  );
  if (price !== undefined) {
    sanitized.priceCents = Math.round(price);
  }
  const notes = sanitizeOptionalString(
    (value as { notes?: unknown }).notes,
    WISHLIST_ITEM_NOTES_MAX,
  );
  if (notes) sanitized.notes = notes;
  return sanitized;
}

function sanitizeWishlistPayload(
  input: Record<string, unknown>,
): SanitizedWishlistPayload {
  const title = sanitizeString(input.title, WISHLIST_TITLE_MAX);
  if (!title) {
    throw new Error('wishlist_title_required');
  }
  const description = sanitizeOptionalString(
    input.description,
    WISHLIST_DESCRIPTION_MAX,
  );
  const itemsInput = Array.isArray(input.items) ? input.items : [];
  const items: SanitizedWishlistItem[] = [];
  for (let i = 0; i < itemsInput.length && items.length < WISHLIST_MAX_ITEMS; i += 1) {
    const sanitized = sanitizeWishlistItem(itemsInput[i]);
    if (sanitized) items.push(sanitized);
  }
  return {
    title,
    description: description ?? undefined,
    items,
  };
}

function hashWishlistPayload(payload: SanitizedWishlistPayload): string {
  const normalized = {
    title: payload.title,
    description: payload.description ?? null,
    items: payload.items.map((item) => ({
      name: item.name,
      url: item.url ?? null,
      priceCents:
        typeof item.priceCents === 'number' ? Number(item.priceCents) : null,
      notes: item.notes ?? null,
    })),
  };
  return createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('hex');
}

function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function getMutualFriendIds(userId: string): Promise<string[]> {
  try {
    const [followingSnap, followersSnap] = await Promise.all([
      db.collection('users').doc(userId).collection('following').get(),
      db.collection('users').doc(userId).collection('followers').get(),
    ]);
    const followerIds = new Set(
      followersSnap.docs.map((doc: QueryDocumentSnapshot) => doc.id),
    );
    return followingSnap.docs
      .map((doc: QueryDocumentSnapshot) => doc.id)
      .filter((id: string) => followerIds.has(id));
  } catch (err) {
    logger.warn('Failed to load mutual friend ids', err instanceof Error ? err : { err }, { userId });
    return [];
  }
}

async function fetchPublicWishes(limit: number) {
  return db
    .collection('wishes')
    .where('scope', 'in', ['all', 'anon'])
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();
}

async function fetchFriendWishes(friendIds: string[], perChunkLimit: number) {
  const docs: QueryDocumentSnapshot[] = [];
  const chunks = chunk(friendIds, 10);
  for (const chunkIds of chunks) {
    if (!chunkIds.length) continue;
    const snap = await db
      .collection('wishes')
      .where('scope', '==', 'friends')
      .where('userId', 'in', chunkIds)
      .orderBy('timestamp', 'desc')
      .limit(perChunkLimit)
      .get();
    docs.push(...snap.docs);
  }
  return docs;
}

async function fetchCloseWishes(limit: number) {
  const snap = await db
    .collection('wishes')
    .where('scope', '==', 'close')
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();
  return snap.docs;
}

async function fetchOwnWishes(userId: string, limit: number) {
  const snap = await db
    .collection('wishes')
    .where('userId', '==', userId)
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();
  return snap.docs;
}

async function hasCloseAccess(
  ownerId: string | null,
  viewerId: string | null,
  cache: Map<string, Promise<boolean>>,
): Promise<boolean> {
  if (!ownerId || !viewerId) return false;
  if (ownerId === viewerId) return true;
  if (!cache.has(ownerId)) {
    cache.set(
      ownerId,
      db
        .collection('users')
        .doc(ownerId)
        .collection('closeFriends')
        .doc(viewerId)
        .get()
        .then((snap: DocumentSnapshot) => snap.exists)
        .catch((err: unknown) => {
          logger.warn('Failed to check close friend access', err instanceof Error ? err : { err }, {
            ownerId,
            viewerId,
          });
          return false;
        }),
    );
  }
  return cache.get(ownerId) ?? Promise.resolve(false);
}

function serializeWish(
  doc: QueryDocumentSnapshot,
  scope: WishScope,
  {
    ownerId,
    viewerId,
    maskIdentity,
  }: {
    ownerId: string | null;
    viewerId: string | null;
    maskIdentity: boolean;
  },
): SerializedWish {
  const data = doc.data() ?? {};
  const result: Record<string, unknown> = {
    id: doc.id,
    scope,
  };

  for (const key of FEED_FIELD_ALLOWLIST) {
    if (!(key in data)) continue;
    const value = (data as Record<string, unknown>)[key];
    if (value === undefined) continue;
    if (TIMESTAMP_FIELDS.has(key)) {
      result[key] = timestampToMillis(value);
    } else if (key === 'reactions' && value && typeof value === 'object') {
      result[key] = { ...EMPTY_REACTIONS, ...(value as Record<string, number>) };
    } else if (Array.isArray(value)) {
      result[key] = value.slice();
    } else if (
      key === 'supportRequest' &&
      value &&
      typeof value === 'object'
    ) {
      const support = value as { amount?: unknown; reason?: unknown };
      const sanitized: Record<string, unknown> = {};
      const amount = sanitizePositiveNumber(support.amount);
      if (amount !== undefined) sanitized.amount = amount;
      const reason = sanitizeOptionalString(support.reason, 200);
      if (reason) sanitized.reason = reason;
      if (Object.keys(sanitized).length) {
        result.supportRequest = sanitized;
      }
    } else {
      result[key] = value;
    }
  }

  const isOwner = ownerId && viewerId ? ownerId === viewerId : false;
  const typed = result as SerializedWish;

  if (!('commentCount' in typed)) {
    typed.commentCount = 0;
  }
  if (!('reactions' in typed)) {
    typed.reactions = { ...EMPTY_REACTIONS };
  }

  if (maskIdentity && !isOwner) {
    typed.displayName = '';
    typed.photoURL = '';
    typed.userId = null;
    typed.isAnonymous = true;
  } else {
    typed.displayName =
      typeof data.displayName === 'string' ? data.displayName : '';
    typed.photoURL =
      typeof data.photoURL === 'string' ? data.photoURL : '';
    typed.userId = ownerId;
    typed.isAnonymous =
      data.isAnonymous === true || scope === 'anon';
  }

  const timestamp = timestampToMillis(typed.timestamp);
  typed.timestamp = timestamp;
  typed.viewerContext = {
    isOwner,
    canSeeIdentity: !maskIdentity || isOwner,
    scope,
  };
  return typed;
}

function compareByTimestampDesc(a: SerializedWish, b: SerializedWish): number {
  const left = a.timestamp ?? 0;
  const right = b.timestamp ?? 0;
  if (right !== left) return right - left;
  return a.id.localeCompare(b.id);
}

async function handleCreateWishlist(req: Request, res: Response) {
  if (req.method !== 'POST') {
    res
      .status(405)
      .json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  const decoded = await authenticate(req);
  if (!decoded) {
    res
      .status(401)
      .json({ ok: false, error: 'authentication_required' });
    return;
  }

  const payload =
    typeof req.body === 'object' && req.body
      ? (req.body as Record<string, unknown>)
      : null;
  if (!payload) {
    res.status(400).json({ ok: false, error: 'invalid_payload' });
    return;
  }

  const idempotencyKey = sanitizeString(
    payload.idempotencyKey,
    120,
    { allowEmpty: false },
  );
  if (!idempotencyKey) {
    res.status(400).json({ ok: false, error: 'idempotency_key_required' });
    return;
  }

  const userId = sanitizeString(payload.userId, 120, { allowEmpty: false });
  if (!userId || userId !== decoded.uid) {
    res.status(403).json({ ok: false, error: 'user_mismatch' });
    return;
  }

  const wishlistInput =
    payload.wishlist && typeof payload.wishlist === 'object'
      ? (payload.wishlist as Record<string, unknown>)
      : null;
  if (!wishlistInput) {
    res.status(400).json({ ok: false, error: 'wishlist_required' });
    return;
  }

  let sanitized: SanitizedWishlistPayload;
  try {
    sanitized = sanitizeWishlistPayload(wishlistInput);
  } catch (err) {
    const message =
      err instanceof Error && err.message === 'wishlist_title_required'
        ? 'title_required'
        : 'invalid_wishlist';
    res.status(400).json({ ok: false, error: message });
    return;
  }

  const payloadHash = hashWishlistPayload(sanitized);
  const nowTs = admin.firestore.Timestamp.now();
  const expiresAt = admin.firestore.Timestamp.fromMillis(
    nowTs.toMillis() + IDEMPOTENCY_TTL_MS,
  );
  const keyRef: DocumentReference = db
    .collection('idempotencyKeys')
    .doc(`${decoded.uid}_${idempotencyKey}`);
  const wishlistCollection = db.collection('wishlists');
  const serverTimestamp = admin.firestore.FieldValue.serverTimestamp();

  try {
    const outcome = await db.runTransaction(async (tx: Transaction) => {
      const keySnap = await tx.get(keyRef);
      if (keySnap.exists) {
        const data = keySnap.data() ?? {};
        const existingExpiry =
          data.expiresAt instanceof admin.firestore.Timestamp
            ? (data.expiresAt as FirebaseFirestore.Timestamp)
            : null;
        const expired =
          existingExpiry && existingExpiry.toMillis() < nowTs.toMillis();
        const existingWishlistId =
          typeof data.wishlistId === 'string' ? data.wishlistId : null;
        const existingHash =
          typeof data.payloadHash === 'string' ? data.payloadHash : null;
        if (!expired) {
          if (existingWishlistId && existingHash === payloadHash) {
            return {
              status: 'replay' as const,
              wishlistId: existingWishlistId,
            };
          }
          return {
            status: 'conflict' as const,
            wishlistId: existingWishlistId,
          };
        }
      }

      const wishlistRef = wishlistCollection.doc();
      const doc: Record<string, unknown> = {
        title: sanitized.title,
        items: sanitized.items,
        itemCount: sanitized.items.length,
        ownerId: decoded.uid,
        userId: decoded.uid,
        createdAt: serverTimestamp,
        updatedAt: serverTimestamp,
      };
      if (sanitized.description) {
        doc.description = sanitized.description;
      }

      tx.set(wishlistRef, doc);
      tx.set(keyRef, {
        userId: decoded.uid,
        key: idempotencyKey,
        wishlistId: wishlistRef.id,
        payloadHash,
        createdAt: serverTimestamp,
        expiresAt,
      });

      return {
        status: 'created' as const,
        wishlistId: wishlistRef.id,
      };
    });

    if (outcome.status === 'created') {
      res.status(201).json({
        ok: true,
        data: { id: outcome.wishlistId },
      });
      return;
    }

    if (outcome.status === 'replay' && outcome.wishlistId) {
      res.status(200).json({
        ok: true,
        data: { id: outcome.wishlistId },
      });
      return;
    }

    logger.warn('Wishlist idempotency conflict detected', {
      userId: decoded.uid,
      key: idempotencyKey,
    });
    res.status(409).json({
      ok: false,
      error: 'IDEMPOTENCY_CONFLICT',
    });
  } catch (err) {
    logger.error(
      'Failed to create wishlist',
      err instanceof Error ? err : { err },
      {
        severity: 'medium',
        userId: decoded.uid,
      },
    );
    res.status(500).json({ ok: false, error: 'internal_error' });
  }
}

async function handleCreateWish(req: Request, res: Response) {
  if (req.method !== 'POST') {
    res
      .status(405)
      .json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  const decoded = await authenticate(req);
  if (!decoded) {
    res
      .status(401)
      .json({ ok: false, error: 'authentication_required' });
    return;
  }

  const payload =
    typeof req.body === 'object' && req.body
      ? (req.body as Record<string, unknown>)
      : null;
  const wishInput =
    payload && typeof payload.wish === 'object' && payload.wish
      ? (payload.wish as Record<string, unknown>)
      : null;

  if (!wishInput) {
    res.status(400).json({ ok: false, error: 'invalid_payload' });
    return;
  }

  const text = sanitizeString(wishInput.text, 280);
  if (!text) {
    res.status(400).json({ ok: false, error: 'text_required' });
    return;
  }

  const category =
    sanitizeOptionalString(wishInput.category, 40) ??
    sanitizeOptionalString(wishInput.type, 30) ??
    'wish';
  const type =
    sanitizeOptionalString(wishInput.type, 30) ?? category ?? 'wish';
  const scope = normalizeWishScope(wishInput.scope);

  const displayName = sanitizeOptionalString(wishInput.displayName, 50);
  const photoURL = sanitizeUrl(wishInput.photoURL);
  const includeIdentity =
    scope !== 'anon' && Boolean(displayName || photoURL);

  const stage =
    sanitizeOptionalString(wishInput.stage, 30) ?? DEFAULT_STAGE;

  const now = admin.firestore.FieldValue.serverTimestamp();

  const newWish: Record<string, unknown> = {
    userId: decoded.uid,
    text,
    category,
    type,
    likes: 0,
    commentCount: 0,
    fundingRaised: 0,
    fundingSupporters: 0,
    reactions: { ...EMPTY_REACTIONS },
    timestamp: now,
    stage,
    stageUpdatedAt: now,
    scope,
    shareScope: PUBLIC_SCOPES.has(scope) ? 'public' : 'private',
    visibility: PUBLIC_SCOPES.has(scope) ? 'public' : 'restricted',
    isAnonymous: scope === 'anon' || !includeIdentity,
    displayName: includeIdentity ? displayName ?? '' : '',
    photoURL: includeIdentity ? photoURL ?? '' : '',
    status: 'open',
    fundedAmount: 0,
    splitPayEnabled: false,
  };

  const optionalStringFields: Record<string, number> = {
    audioUrl: 2000,
    imageUrl: 2000,
    videoUrl: 2000,
    giftLink: 2000,
    giftType: 20,
    giftLabel: 50,
    fulfillmentLink: 2000,
    mood: 10,
    optionA: 100,
    optionB: 100,
    voiceTranscription: 4000,
    detectedMood: 30,
    aiRefinedText: 2000,
  };
  for (const [key, limit] of Object.entries(optionalStringFields)) {
    const value = sanitizeOptionalString(wishInput[key], limit);
    if (value) {
      newWish[key] = value;
    }
  }

  const targetAmount = sanitizePositiveNumber(wishInput.targetAmount);
  if (targetAmount !== undefined) {
    newWish.targetAmount = targetAmount;
  }
  if (wishInput.splitPayEnabled === true) {
    newWish.splitPayEnabled = true;
  }

  const fundingGoal = sanitizePositiveNumber(wishInput.fundingGoal);
  if (fundingGoal !== undefined && fundingGoal > 0) {
    newWish.fundingGoal = fundingGoal;
    newWish.fundingCurrency =
      sanitizeOptionalString(wishInput.fundingCurrency, 10) ?? 'usd';
    if (Array.isArray(wishInput.fundingPresets)) {
      const presets = (wishInput.fundingPresets as unknown[])
        .map((entry) => sanitizePositiveNumber(entry))
        .filter((entry): entry is number => entry !== undefined)
        .slice(0, 6);
      if (presets.length) {
        newWish.fundingPresets = presets;
      }
    }
  }

  const supportAmount = sanitizePositiveNumber(
    (wishInput.supportRequest as Record<string, unknown> | undefined)?.amount,
  );
  const supportReason = sanitizeOptionalString(
    (wishInput.supportRequest as Record<string, unknown> | undefined)
      ?.reason,
    200,
  );
  if (supportAmount || supportReason) {
    const support: Record<string, unknown> = {};
    if (supportAmount) support.amount = supportAmount;
    if (supportReason) support.reason = supportReason;
    newWish.supportRequest = support;
  }

  const expiresAt = sanitizeTimestampInput(wishInput.expiresAt);
  if (expiresAt) {
    newWish.expiresAt = expiresAt;
  }
  const deadline = sanitizeTimestampInput(wishInput.deadline);
  if (deadline) {
    newWish.deadline = deadline;
  }
  const boostedUntil = sanitizeTimestampInput(wishInput.boostedUntil);
  if (boostedUntil) {
    newWish.boostedUntil = boostedUntil;
  }
  const fulfilledAt = sanitizeTimestampInput(wishInput.fulfilledAt);
  if (fulfilledAt) {
    newWish.fulfilledAt = fulfilledAt;
  }

  if (wishInput.isPoll === true) {
    newWish.isPoll = true;
    newWish.optionA = sanitizeOptionalString(wishInput.optionA, 100) ?? '';
    newWish.optionB = sanitizeOptionalString(wishInput.optionB, 100) ?? '';
    newWish.votesA = 0;
    newWish.votesB = 0;
  }

  const circleId = sanitizeOptionalString(
    wishInput.accountabilityCircleId,
    120,
  );
  if (circleId) {
    newWish.accountabilityCircleId = circleId;
    const circleName = sanitizeOptionalString(
      wishInput.accountabilityCircleName,
      100,
    );
    if (circleName) newWish.accountabilityCircleName = circleName;
  }

  try {
    const docRef = await db.collection('wishes').add(newWish);
    res.status(200).json({
      ok: true,
      data: { id: docRef.id },
    });
  } catch (err) {
    logger.error('Failed to create wish via API', err instanceof Error ? err : { err }, {
      userId: decoded.uid,
    });
    res.status(500).json({ ok: false, error: 'internal_error' });
  }
}

async function handleFeed(req: Request, res: Response) {
  if (req.method !== 'GET') {
    res
      .status(405)
      .json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  const decoded = await authenticate(req);
  const viewerId = decoded?.uid ?? null;

  try {
    const [publicSnap, mutualFriendIds] = await Promise.all([
      fetchPublicWishes(PUBLIC_FETCH_LIMIT),
      viewerId ? getMutualFriendIds(viewerId) : Promise.resolve([]),
    ]);

    const friendDocs = viewerId
      ? await fetchFriendWishes(mutualFriendIds, FRIEND_FETCH_LIMIT)
      : [];
    const closeDocs = viewerId
      ? await fetchCloseWishes(CLOSE_FETCH_LIMIT)
      : [];
    const ownDocs = viewerId
      ? await fetchOwnWishes(viewerId, OWN_FETCH_LIMIT)
      : [];

    const friendSet = new Set(mutualFriendIds);
    const closeAccessCache = new Map<string, Promise<boolean>>();
    const seen = new Set<string>();

    const allDocs: QueryDocumentSnapshot[] = [
      ...publicSnap.docs,
      ...friendDocs,
      ...closeDocs,
      ...ownDocs,
    ];

    const serializedPromises = allDocs.map(async (doc: QueryDocumentSnapshot) => {
      if (seen.has(doc.id)) return null;
      const data = doc.data() ?? {};
      const ownerId =
        typeof data.userId === 'string' ? data.userId : null;
      const scope = normalizeWishScope(data.scope);
      const isFriend = viewerId && ownerId ? friendSet.has(ownerId) : false;
      const isClose =
        scope === 'close'
          ? await hasCloseAccess(ownerId, viewerId, closeAccessCache)
          : ownerId === viewerId;
      const visible = canViewerSeeWish({
        scope,
        ownerId,
        viewerId,
        isFriend,
        isClose,
      });
      if (!visible) return null;
      seen.add(doc.id);
      const maskIdentity =
        scope === 'anon' && (!viewerId || viewerId !== ownerId);
      return serializeWish(doc, scope, {
        ownerId,
        viewerId,
        maskIdentity,
      });
    });

    const resolved = (await Promise.all(serializedPromises)).filter(
      (item): item is SerializedWish => Boolean(item),
    );

    resolved.sort(compareByTimestampDesc);
    const limited = resolved.slice(0, FEED_RESULT_LIMIT);

    res.status(200).json({
      ok: true,
      data: {
        items: limited,
        viewer: viewerId
          ? {
              id: viewerId,
              mutualFriendCount: mutualFriendIds.length,
            }
          : null,
      },
    });
  } catch (err) {
    logger.error('Failed to load feed', err instanceof Error ? err : { err }, {
      viewerId,
    });
    res.status(500).json({ ok: false, error: 'internal_error' });
  }
}

export const api = region('us-central1').https.onRequest(
  async (req: Request, res: Response) => {
    applyCors(res);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    const path = (req.path || '').replace(/\/+$/, '') || '/';
    if (path === '/' && req.method === 'GET') {
      res.status(200).json({ ok: true });
      return;
    }
    if (path === '/wishlists' && req.method === 'POST') {
      await handleCreateWishlist(req, res);
      return;
    }
    if (path === '/wishes' && req.method === 'POST') {
      await handleCreateWish(req, res);
      return;
    }
    if (path === '/feed' && req.method === 'GET') {
      await handleFeed(req, res);
      return;
    }
      res.status(404).json({ ok: false, error: 'not_found' });
  },
);

export const __httpApiTest = {
  handleCreateWishlist,
};
