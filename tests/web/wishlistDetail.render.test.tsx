import React, { Profiler, StrictMode } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import WishlistDetail, {
  type FetchWishlistDetail,
  type WishlistDetailData,
  type WishlistDetailHandle,
  type WishlistItem,
} from '@/apps/web/src/pages/WishlistDetail';

const sampleWishlist = (overrides?: Partial<WishlistDetailData>) => ({
  id: 'wishlist-1',
  title: 'Birthday ideas',
  description: 'Things I would love for my birthday',
  updatedAt: 1_700_000_000,
  items: [
    {
      id: 'item-1',
      name: 'Reusable water bottle',
      priceCents: 3500,
      url: 'https://example.com/water-bottle',
      notes: 'Prefer stainless steel',
      updatedAt: 1_700_000_000,
    },
    {
      id: 'item-2',
      name: 'Hiking backpack',
      priceCents: 12500,
      url: 'https://example.com/backpack',
      notes: null,
      updatedAt: 1_700_000_100,
    },
  ],
  ...overrides,
});

const flush = () => act(async () => Promise.resolve());

describe('WishlistDetail web page', () => {
  it('fetches wishlist detail once per id even under StrictMode', async () => {
    const fetcher: jest.MockedFunction<FetchWishlistDetail> = jest
      .fn()
      .mockResolvedValue(sampleWishlist());
    const itemsRenders: number[] = [];
    const profilerEntries: number[] = [];

    await act(async () => {
      TestRenderer.create(
        <StrictMode>
          <Profiler
            id="WishlistDetail"
            onRender={(...args) => {
              const commitCount = args[5] as number;
              profilerEntries.push(commitCount);
            }}
          >
            <WishlistDetail
              wishlistId="wishlist-1"
              fetchWishlist={fetcher}
              instrumentation={{
                onItemsRender: () => {
                  itemsRenders.push(Date.now());
                },
              }}
            />
          </Profiler>
        </StrictMode>,
      );
      await flush();
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(itemsRenders).toHaveLength(1);
    expect(profilerEntries[profilerEntries.length - 1]).toBeGreaterThan(0);
  });

  it('supports refetching after edits while preserving memoized items', async () => {
    const first = sampleWishlist();
    const updatedItem: WishlistItem = {
      id: 'item-2',
      name: 'Hiking backpack (updated)',
      priceCents: 12999,
      url: 'https://example.com/backpack-new',
      notes: 'New color preferred',
      updatedAt: 1_700_001_000,
    };
    const second = sampleWishlist({
      items: [first.items[0]!, updatedItem],
    });

    const fetcher: jest.MockedFunction<FetchWishlistDetail> = jest
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);

    const ref = React.createRef<WishlistDetailHandle>();
    const renderLog: number[] = [];

    await act(async () => {
      TestRenderer.create(
        <WishlistDetail
          ref={ref}
          wishlistId="wishlist-1"
          fetchWishlist={fetcher}
          instrumentation={{
            onItemsRender: () => {
              renderLog.push(Date.now());
            },
          }}
        />,
      );
      await flush();
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(ref.current?.getSnapshot()?.items).toHaveLength(2);
    expect(renderLog).toHaveLength(1);

    await act(async () => {
      await ref.current?.refetch({ force: true });
      await flush();
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    const snapshot = ref.current?.getSnapshot();
    expect(snapshot?.items[1]).toMatchObject(updatedItem);
    expect(renderLog).toHaveLength(2);
  });

  it('avoids redundant network calls for identical payloads', async () => {
    const first = sampleWishlist();
    const fetcher: jest.MockedFunction<FetchWishlistDetail> = jest
      .fn()
      .mockResolvedValue(first);

    const ref = React.createRef<WishlistDetailHandle>();
    await act(async () => {
      TestRenderer.create(
        <WishlistDetail ref={ref} wishlistId="wishlist-2" fetchWishlist={fetcher} />,
      );
      await flush();
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => {
      await ref.current?.refetch();
      await flush();
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
