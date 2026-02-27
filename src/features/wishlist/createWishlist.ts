import { useCallback, useState } from 'react';
import { nanoid } from 'nanoid/non-secure';
import { apiPost } from '@/services/apiClient';
import { useAuthSession } from '@/contexts/AuthSessionContext';
import * as logger from '@/shared/logger';

type WishlistItemInput = {
  name: unknown;
  url?: unknown;
  priceCents?: unknown;
  notes?: unknown;
};

type WishlistDraft = {
  title: unknown;
  description?: unknown;
  items?: unknown;
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

type CreateWishlistApiResponse = {
  ok: boolean;
  data?: {
    id: string;
  };
  error?: string;
};

type SubmitArgs = {
  userId: string;
  draft: WishlistDraft;
  signal?: AbortSignal;
};

type SubmitResult = {
  id: string;
  idempotencyKey: string;
  reusedIdempotencyKey: boolean;
};

const TITLE_MAX = 120;
const DESCRIPTION_MAX = 400;
const ITEM_NAME_MAX = 140;
const ITEM_NOTES_MAX = 240;
const MAX_ITEMS = 50;

function toTrimmedString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.length) return null;
  return trimmed.slice(0, max);
}

function toOptionalTrimmedString(value: unknown, max: number): string | undefined {
  const trimmed = toTrimmedString(value, max);
  return trimmed ?? undefined;
}

function toUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed.length) return undefined;
  return trimmed.slice(0, 2000);
}

function toPriceCents(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : NaN;
  if (!Number.isFinite(numeric)) return undefined;
  const cents = Math.round(Number(numeric));
  if (cents < 0) return undefined;
  if (cents > 10_000_000) return 10_000_000;
  return cents;
}

function sanitizeItem(input: unknown): SanitizedWishlistItem | null {
  if (!input || typeof input !== 'object') return null;
  const item = input as WishlistItemInput;
  const name = toTrimmedString(item.name, ITEM_NAME_MAX);
  if (!name) return null;
  const sanitized: SanitizedWishlistItem = { name };
  const url = toUrl(item.url);
  if (url) sanitized.url = url;
  const price = toPriceCents(item.priceCents);
  if (price !== undefined) sanitized.priceCents = price;
  const notes = toOptionalTrimmedString(item.notes, ITEM_NOTES_MAX);
  if (notes) sanitized.notes = notes;
  return sanitized;
}

function sanitizeDraft(draft: WishlistDraft): SanitizedWishlistPayload {
  const title = toTrimmedString(draft.title, TITLE_MAX);
  if (!title) {
    throw new Error('wishlist_title_required');
  }
  const description = toOptionalTrimmedString(draft.description, DESCRIPTION_MAX);
  const itemsInput = Array.isArray(draft.items) ? draft.items : [];
  const items: SanitizedWishlistItem[] = [];
  for (let i = 0; i < itemsInput.length && items.length < MAX_ITEMS; i += 1) {
    const sanitized = sanitizeItem(itemsInput[i]);
    if (sanitized) {
      items.push(sanitized);
    }
  }
  return {
    title,
    description,
    items,
  };
}

async function sendCreateWishlistRequest(
  userId: string,
  idempotencyKey: string,
  payload: SanitizedWishlistPayload,
  signal?: AbortSignal,
): Promise<string> {
  const response = await apiPost<CreateWishlistApiResponse>(
    '/wishlists',
    {
      wishlist: payload,
      userId,
      idempotencyKey,
    },
    {
      headers: {
        'X-Idempotency-Key': idempotencyKey,
      },
      signal,
    },
  );
  if (!response.ok || !response.data?.id) {
    throw new Error(
      response.error || 'Failed to create wishlist. Please try again later.',
    );
  }
  return response.data.id;
}

class WishlistCreationManager {
  private inFlight: Promise<SubmitResult> | null = null;

  private activeKey: string | null = null;

  async submit({ userId, draft, signal }: SubmitArgs): Promise<SubmitResult> {
    if (!userId) {
      throw new Error('user_id_required');
    }
    if (this.inFlight) {
      return this.inFlight;
    }
    const sanitized = sanitizeDraft(draft);
    const reused = Boolean(this.activeKey);
    const idempotencyKey = this.activeKey ?? nanoid();
    this.activeKey = idempotencyKey;

    const promise = (async () => {
      try {
        const id = await sendCreateWishlistRequest(
          userId,
          idempotencyKey,
          sanitized,
          signal,
        );
        this.reset();
        return {
          id,
          idempotencyKey,
          reusedIdempotencyKey: reused,
        };
      } finally {
        this.inFlight = null;
      }
    })();

    this.inFlight = promise;
    return promise;
  }

  reset() {
    this.inFlight = null;
    this.activeKey = null;
  }

  getActiveKey(): string | null {
    return this.activeKey;
  }

  getInFlight(): Promise<SubmitResult> | null {
    return this.inFlight;
  }
}

export const wishlistCreationManager = new WishlistCreationManager();

export type CreateWishlistInput = {
  title: string;
  description?: string | null;
  items?: {
    name: string;
    url?: string | null;
    priceCents?: number | null;
    notes?: string | null;
  }[];
};

export function useCreateWishlist() {
  const { user } = useAuthSession();
  const [isCreating, setIsCreating] = useState(false);

  const createWishlist = useCallback(
    async (
      input: CreateWishlistInput,
      options: { signal?: AbortSignal } = {},
    ): Promise<SubmitResult> => {
      if (!user?.uid) {
        throw new Error('Authentication required to create wishlist');
      }
      setIsCreating(true);
      try {
        return await wishlistCreationManager.submit({
          userId: user.uid,
          draft: input,
          signal: options.signal,
        });
      } catch (err) {
        logger.warn('Wishlist creation failed', err, {
          severity: 'low',
          userId: user.uid,
        });
        throw err;
      } finally {
        setIsCreating(false);
      }
    },
    [user?.uid],
  );

  const idempotencyKey = wishlistCreationManager.getActiveKey();

  return {
    createWishlist,
    isCreating,
    idempotencyKey,
  };
}

export const __wishlistCreateTestUtils = {
  reset: () => wishlistCreationManager.reset(),
  getActiveKey: () => wishlistCreationManager.getActiveKey(),
};
