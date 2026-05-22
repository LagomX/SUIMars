import { create } from 'zustand';

type RiderStore = {
  onlineCount: number;
  setOnlineCount: (onlineCount: number) => void;
};

export const useRiderStore = create<RiderStore>((set) => ({
  onlineCount: 0,
  setOnlineCount: (onlineCount) => set({ onlineCount }),
}));
