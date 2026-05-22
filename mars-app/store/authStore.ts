import { create } from 'zustand';

export type UserRole = 'customer' | 'merchant' | 'rider';

export type User = {
  id: string;
  privyId: string;
  walletAddress: string;
  name: string;
  phone: string;
  role: UserRole;
};

type AuthStore = {
  user: User | null;
  selectedRole: UserRole | null;
  isLoggedIn: boolean;
  setSelectedRole: (role: UserRole) => void;
  login: (user: User) => void;
  logout: () => void;
};

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  selectedRole: null,
  isLoggedIn: false,
  setSelectedRole: (selectedRole) => set({ selectedRole }),
  login: (user) =>
    set({
      user,
      selectedRole: user.role,
      isLoggedIn: true,
    }),
  logout: () =>
    set({
      user: null,
      selectedRole: null,
      isLoggedIn: false,
    }),
}));
