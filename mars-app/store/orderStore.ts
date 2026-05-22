import { create } from 'zustand';

export type OrderStatus = 'pending' | 'confirmed' | 'delivering' | 'delivered';

export type OrderItem = {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
};

export type Order = {
  id: string;
  items: OrderItem[];
  status: OrderStatus;
  customerId: string;
  merchantId: string | null;
  riderId: string | null;
  subtotal: number;
  totalAmount: number;
  deliveryFee: number;
  createdAt: number;
  deliveredAt: number | null;
};

export type CustomerProfile = {
  id: string;
  name: string;
  phone: string;
  address: string;
};

export type MerchantProfile = {
  id: string;
  name: string;
  category: string;
  address: string;
  rating: number;
  deliveryFee: number;
  deliveryTime: string;
  isOnline: boolean;
  menu: MenuItem[];
};

export type RiderProfile = {
  id: string;
  name: string;
  phone: string;
  vehicle: string;
  rating: number;
  isOnline: boolean;
};

export type MenuItem = {
  id: string;
  name: string;
  description: string;
  price: number;
  available: boolean;
};

export type Merchant = MerchantProfile;

export type RevenueSummary = {
  merchantId: string;
  deliveredOrders: number;
  grossRevenue: number;
};

export type EarningsSummary = {
  riderId: string;
  completedDeliveries: number;
  totalEarnings: number;
};

type OrderStore = {
  orders: Order[];
  merchants: Merchant[];
  customerProfile: CustomerProfile | null;
  merchantProfile: MerchantProfile | null;
  riderProfile: RiderProfile | null;
  menu: MenuItem[];
  revenue: RevenueSummary | null;
  earnings: EarningsSummary | null;
  setOrders: (orders: Order[]) => void;
  updateOrder: (order: Order) => void;
  setMerchants: (merchants: Merchant[]) => void;
  updateMerchant: (merchant: Merchant) => void;
  setCustomerProfile: (profile: CustomerProfile) => void;
  setMerchantProfile: (profile: MerchantProfile) => void;
  setRiderProfile: (profile: RiderProfile) => void;
  setMenu: (menu: MenuItem[]) => void;
  updateMenuItem: (item: MenuItem) => void;
  setRevenue: (revenue: RevenueSummary) => void;
  setEarnings: (earnings: EarningsSummary) => void;
};

export const useOrderStore = create<OrderStore>((set) => ({
  orders: [],
  merchants: [],
  customerProfile: null,
  merchantProfile: null,
  riderProfile: null,
  menu: [],
  revenue: null,
  earnings: null,
  setOrders: (orders) => set({ orders }),
  updateOrder: (updatedOrder) =>
    set((state) => {
      const exists = state.orders.some((order) => order.id === updatedOrder.id);

      return {
        orders: exists
          ? state.orders.map((order) =>
              order.id === updatedOrder.id ? updatedOrder : order,
            )
          : [updatedOrder, ...state.orders],
      };
    }),
  setMerchants: (merchants) =>
    set({ merchants: merchants.filter((merchant) => merchant.isOnline) }),
  updateMerchant: (updatedMerchant) =>
    set((state) => {
      const existing = state.merchants.some(
        (merchant) => merchant.id === updatedMerchant.id,
      );
      const merchants = updatedMerchant.isOnline
        ? existing
          ? state.merchants.map((merchant) =>
              merchant.id === updatedMerchant.id ? updatedMerchant : merchant,
            )
          : [...state.merchants, updatedMerchant]
        : state.merchants.filter((merchant) => merchant.id !== updatedMerchant.id);

      return {
        merchants,
        merchantProfile:
          state.merchantProfile?.id === updatedMerchant.id
            ? updatedMerchant
            : state.merchantProfile,
        menu:
          state.merchantProfile?.id === updatedMerchant.id
            ? updatedMerchant.menu
            : state.menu,
      };
    }),
  setCustomerProfile: (customerProfile) => set({ customerProfile }),
  setMerchantProfile: (merchantProfile) => set({ merchantProfile }),
  setRiderProfile: (riderProfile) => set({ riderProfile }),
  setMenu: (menu) => set({ menu }),
  updateMenuItem: (updatedItem) =>
    set((state) => ({
      menu: state.menu.map((item) =>
        item.id === updatedItem.id ? updatedItem : item,
      ),
    })),
  setRevenue: (revenue) => set({ revenue }),
  setEarnings: (earnings) => set({ earnings }),
}));
