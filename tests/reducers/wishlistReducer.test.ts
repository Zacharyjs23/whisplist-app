import {
  initialWishlistState,
  wishlistReducer,
  type WishlistState,
} from '@/src/reducers/wishlistReducer';

describe('wishlistReducer', () => {
  it('sets entire collection with SET_ALL', () => {
    const state = wishlistReducer(initialWishlistState, {
      type: 'SET_ALL',
      payload: ['a', 'b', 'a'],
    });
    expect(state).toEqual({ a: true, b: true });
  });

  it('adds and removes items idempotently', () => {
    let state: WishlistState = initialWishlistState;
    state = wishlistReducer(state, { type: 'ADD_ITEM', payload: 'item-1' });
    state = wishlistReducer(state, { type: 'ADD_ITEM', payload: 'item-1' });
    expect(state).toEqual({ 'item-1': true });

    state = wishlistReducer(state, { type: 'REMOVE_ITEM', payload: 'item-1' });
    state = wishlistReducer(state, { type: 'REMOVE_ITEM', payload: 'item-1' });
    expect(state).toEqual({});
  });

  it('ignores falsy identifiers', () => {
    const state = wishlistReducer(
      initialWishlistState,
      { type: 'ADD_ITEM', payload: '' },
    );
    expect(state).toBe(initialWishlistState);
  });
});
