export type WishlistState = Record<string, boolean>;

export type WishlistAction =
  | { type: 'SET_ALL'; payload: string[] }
  | { type: 'ADD_ITEM'; payload: string }
  | { type: 'REMOVE_ITEM'; payload: string };

export const initialWishlistState: WishlistState = {};

const sanitizeId = (input: string | null | undefined): string | null => {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export function wishlistReducer(
  state: WishlistState = initialWishlistState,
  action: WishlistAction,
): WishlistState {
  switch (action.type) {
    case 'SET_ALL': {
      const next: WishlistState = {};
      (action.payload ?? []).forEach((rawId) => {
        const id = sanitizeId(rawId);
        if (id) {
          next[id] = true;
        }
      });
      return next;
    }
    case 'ADD_ITEM': {
      const id = sanitizeId(action.payload);
      if (!id || state[id]) {
        return state;
      }
      return { ...state, [id]: true };
    }
    case 'REMOVE_ITEM': {
      const id = sanitizeId(action.payload);
      if (!id || !state[id]) {
        return state;
      }
      const { [id]: _removed, ...rest } = state;
      return rest;
    }
    default:
      return state;
  }
}
