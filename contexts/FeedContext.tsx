import React, { createContext, useContext, useState } from 'react';
import type { Wish } from '@/types/Wish';

interface FeedContextValue {
  wishList: Wish[];
  addWishToList: (wish: Wish) => void;
  setWishList: React.Dispatch<React.SetStateAction<Wish[]>>;
}

const FeedContext = createContext<FeedContextValue | undefined>(undefined);

export const FeedProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [wishList, setWishList] = useState<Wish[]>([]);

  const addWishToList = (wish: Wish) => {
    setWishList((prev) => [wish, ...prev]);
  };

  return (
    <FeedContext.Provider value={{ wishList, addWishToList, setWishList }}>
      {children}
    </FeedContext.Provider>
  );
};

export const useFeed = (): FeedContextValue => {
  const ctx = useContext(FeedContext);
  if (!ctx) {
    throw new Error('useFeed must be used within FeedProvider');
  }
  return ctx;
};

export default FeedContext;
