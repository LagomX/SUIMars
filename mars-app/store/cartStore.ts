import { create } from 'zustand';

import { MenuItem } from './orderStore';

export type CartItem = {
  menuItemId: string;
  name: string;
  description: string;
  price: number;
  quantity: number;
};

type CartStore = {
  items: CartItem[];
  merchantId: string | null;
  addItem: (merchantId: string, item: MenuItem) => void;
  removeItem: (menuItemId: string) => void;
  updateQuantity: (menuItemId: string, quantity: number) => void;
  clearCart: () => void;
  total: () => number;
};

export const useCartStore = create<CartStore>((set, get) => ({
  items: [],
  merchantId: null,
  addItem: (merchantId, item) =>
    set((state) => {
      const isDifferentMerchant =
        state.merchantId !== null && state.merchantId !== merchantId;
      const items = isDifferentMerchant ? [] : state.items;
      const existing = items.find((cartItem) => cartItem.menuItemId === item.id);

      return {
        merchantId,
        items: existing
          ? items.map((cartItem) =>
              cartItem.menuItemId === item.id
                ? { ...cartItem, quantity: cartItem.quantity + 1 }
                : cartItem,
            )
          : [
              ...items,
              {
                menuItemId: item.id,
                name: item.name,
                description: item.description,
                price: item.price,
                quantity: 1,
              },
            ],
      };
    }),
  removeItem: (menuItemId) =>
    set((state) => {
      const items = state.items.filter((item) => item.menuItemId !== menuItemId);

      return {
        items,
        merchantId: items.length === 0 ? null : state.merchantId,
      };
    }),
  updateQuantity: (menuItemId, quantity) =>
    set((state) => {
      const items =
        quantity <= 0
          ? state.items.filter((item) => item.menuItemId !== menuItemId)
          : state.items.map((item) =>
              item.menuItemId === menuItemId ? { ...item, quantity } : item,
            );

      return {
        items,
        merchantId: items.length === 0 ? null : state.merchantId,
      };
    }),
  clearCart: () => set({ items: [], merchantId: null }),
  total: () =>
    get().items.reduce((sum, item) => sum + item.price * item.quantity, 0),
}));
