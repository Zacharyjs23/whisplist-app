import React, {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';

export type WishlistItem = {
  id: string;
  name: string;
  url?: string | null;
  priceCents?: number | null;
  notes?: string | null;
  updatedAt?: number | string | null;
};

export type WishlistDetailData = {
  id: string;
  title: string;
  description?: string | null;
  items: WishlistItem[];
  updatedAt?: number | string | null;
};

export type FetchWishlistDetail = (
  wishlistId: string,
) => Promise<WishlistDetailData>;

export type WishlistDetailHandle = {
  /**
   * Triggers a fetch for the active wishlist id.
   * Pass `{ force: true }` to bypass the memoized cache.
   */
  refetch: (options?: { force?: boolean }) => Promise<void>;
  /**
   * Returns the latest resolved snapshot of the wishlist detail payload.
   */
  getSnapshot: () => WishlistDetailData | null;
};

type InstrumentationHooks = {
  /**
   * Invoked whenever the items list renders. Exposed for profiling in tests.
   */
  onItemsRender?: (items: WishlistItem[]) => void;
  /**
   * Invoked when the component state transitions (loading/data/error).
   */
  onStateChange?: (state: WishlistDetailState) => void;
};

export type WishlistDetailProps = {
  wishlistId: string | null;
  fetchWishlist?: FetchWishlistDetail;
  instrumentation?: InstrumentationHooks;
  emptyState?: React.ReactNode;
  loadingState?: React.ReactNode;
  errorState?: (message: string) => React.ReactNode;
};

type WishlistDetailState = {
  wishlist: WishlistDetailData | null;
  loading: boolean;
  error: string | null;
};

const initialState: WishlistDetailState = {
  wishlist: null,
  loading: true,
  error: null,
};

const DEFAULT_TITLE = 'Wishlist';

const DEFAULT_FETCHER: FetchWishlistDetail = async (wishlistId: string) => {
  if (typeof fetch !== 'function') {
    throw new Error(
      'Global fetch is not available. Provide fetchWishlist prop instead.',
    );
  }
  const response = await fetch(`/api/wishlists/${wishlistId}`);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch wishlist ${wishlistId}: ${response.statusText}`,
    );
  }
  const payload = (await response.json()) as WishlistDetailData;
  return normalizeWishlist(payload, wishlistId);
};

export const WishlistDetail = React.forwardRef<
  WishlistDetailHandle,
  WishlistDetailProps
>(function WishlistDetailImpl(
  {
    wishlistId,
    fetchWishlist = DEFAULT_FETCHER,
    instrumentation,
    emptyState = <p>No wishlist items yet.</p>,
    loadingState = <p>Loading wishlist…</p>,
    errorState = (msg) => <p role="alert">Failed to load wishlist: {msg}</p>,
  },
  ref,
) {
  const [state, setState] = useState<WishlistDetailState>(initialState);
  const lastResolvedSignatureRef = useRef<string | null>(null);
  const lastFetchIdRef = useRef<string | null>(null);
  const fetcherRef = useLatest(fetchWishlist);

  const applyWishlist = useCallback(
    (next: WishlistDetailData | null) => {
      const normalized = next ? normalizeWishlist(next, next.id) : null;
      const signature = normalized ? createWishlistSignature(normalized) : null;
      if (lastResolvedSignatureRef.current === signature) {
        setState((prev) =>
          prev.loading
            ? {
                wishlist: prev.wishlist,
                loading: false,
                error: prev.error,
              }
            : prev,
        );
        return;
      }
      lastResolvedSignatureRef.current = signature;
      setState({
        wishlist: normalized,
        loading: false,
        error: null,
      });
    },
    [],
  );

  const refetch = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (!wishlistId) {
        lastFetchIdRef.current = null;
        lastResolvedSignatureRef.current = null;
        setState({
          wishlist: null,
          loading: false,
          error: null,
        });
        return;
      }

      if (force) {
        lastFetchIdRef.current = null;
      }

      if (lastFetchIdRef.current === wishlistId) {
        return;
      }

      lastFetchIdRef.current = wishlistId;
      setState((prev) => ({
        wishlist:
          prev.wishlist && prev.wishlist.id === wishlistId
            ? prev.wishlist
            : prev.wishlist,
        loading: true,
        error: null,
      }));

      try {
        const data = await fetcherRef.current(wishlistId);
        applyWishlist(data);
      } catch (error) {
        lastFetchIdRef.current = force ? null : wishlistId;
        setState((prev) => ({
          wishlist: prev.wishlist,
          loading: false,
          error: formatErrorMessage(error),
        }));
        throw error;
      }
    },
    [applyWishlist, fetcherRef, wishlistId],
  );

  useImperativeHandle(
    ref,
    () => ({
      refetch,
      getSnapshot: () => state.wishlist,
    }),
    [refetch, state.wishlist],
  );

  useEffect(() => {
    let cancelled = false;
    refetch().catch(() => {
      if (!cancelled) {
        // error state already set inside refetch;
        // swallow to avoid unhandled rejection warnings.
      }
    });
    return () => {
      cancelled = true;
    };
  }, [refetch]);

  useEffect(() => {
    if (instrumentation?.onStateChange) {
      instrumentation.onStateChange(state);
    }
  }, [instrumentation, state]);

  const items = useMemo(
    () => (state.wishlist ? state.wishlist.items : []),
    [state.wishlist],
  );

  const title = state.wishlist?.title || DEFAULT_TITLE;

  if (state.loading) {
    return <>{loadingState}</>;
  }

  if (state.error) {
    return <>{errorState(state.error)}</>;
  }

  if (!state.wishlist) {
    return <>{emptyState}</>;
  }

  return (
    <section aria-label={`${title} detail`}>
      <header>
        <h1>{title}</h1>
        {state.wishlist.description ? (
          <p>{state.wishlist.description}</p>
        ) : null}
      </header>
      <MemoizedWishlistItemsList
        items={items}
        instrumentation={instrumentation}
      />
    </section>
  );
});

type WishlistItemsListProps = {
  items: WishlistItem[];
  instrumentation?: InstrumentationHooks;
};

const WishlistItemsList: React.FC<WishlistItemsListProps> = ({
  items,
  instrumentation,
}) => {
  if (instrumentation?.onItemsRender) {
    instrumentation.onItemsRender(items);
  }
  if (items.length === 0) {
    return <p>No saved items yet.</p>;
  }
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id} data-testid="wishlist-item">
          <strong>{item.name}</strong>
          {item.priceCents != null ? (
            <span>{formatCurrency(item.priceCents)}</span>
          ) : null}
          {item.url ? (
            <a href={item.url} target="_blank" rel="noopener noreferrer">
              View
            </a>
          ) : null}
          {item.notes ? <p>{item.notes}</p> : null}
        </li>
      ))}
    </ul>
  );
};

const MemoizedWishlistItemsList = memo(WishlistItemsList);

function formatCurrency(priceCents: number) {
  const normalized = Number.isFinite(priceCents) ? priceCents / 100 : 0;
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(normalized);
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Something went wrong';
}

function normalizeWishlist(
  payload: WishlistDetailData,
  fallbackId: string,
): WishlistDetailData {
  const items = Array.isArray(payload.items) ? payload.items : [];
  const deduped = dedupeItems(items);
  return {
    id: payload.id || fallbackId,
    title: payload.title || DEFAULT_TITLE,
    description: payload.description ?? null,
    items: deduped,
    updatedAt: payload.updatedAt ?? null,
  };
}

function dedupeItems(items: WishlistItem[]): WishlistItem[] {
  const map = new Map<string, WishlistItem>();
  items.forEach((raw) => {
    const key = (raw.id || raw.name || '').trim();
    if (!key) return;
    const candidate = normalizeItem({ ...raw, id: key });
    const existing = map.get(key);
    if (!existing) {
      map.set(key, candidate);
      return;
    }
    const existingTs =
      coerceTimestamp(existing.updatedAt) ?? Number.NEGATIVE_INFINITY;
    const candidateTs =
      coerceTimestamp(candidate.updatedAt) ?? Number.NEGATIVE_INFINITY;
    if (candidateTs >= existingTs) {
      map.set(key, candidate);
    }
  });
  return Array.from(map.values());
}

function normalizeItem(item: WishlistItem): WishlistItem {
  return {
    id: item.id.trim(),
    name: item.name?.trim() || 'Untitled item',
    url: normalizeUrl(item.url),
    priceCents:
      typeof item.priceCents === 'number' && Number.isFinite(item.priceCents)
        ? Math.round(item.priceCents)
        : null,
    notes: item.notes?.trim() || null,
    updatedAt: coerceTimestamp(item.updatedAt),
  };
}

function normalizeUrl(input: string | null | undefined) {
  if (!input) return null;
  try {
    const trimmed = input.trim();
    if (!trimmed.length) return null;
    return new URL(trimmed).toString();
  } catch {
    return null;
  }
}

function coerceTimestamp(
  value: WishlistItem['updatedAt'],
): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function createWishlistSignature(data: WishlistDetailData): string {
  const itemSignature = data.items
    .map((item) =>
      [
        item.id,
        item.name,
        item.url ?? '',
        item.priceCents ?? '',
        item.notes ?? '',
        item.updatedAt ?? '',
      ].join('|'),
    )
    .join(';');
  return [data.id, data.title, data.description ?? '', itemSignature].join(
    '::',
  );
}

function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

export default WishlistDetail;
