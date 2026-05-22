import { MenuItem, Merchant, Order, useOrderStore } from '@/store/orderStore';
import { useRiderStore } from '@/store/riderStore';
import { SERVER_IP } from './api';

type OrderUpdatedEvent = {
  type: 'ORDER_UPDATED';
  data: Order;
};

type MenuUpdatedEvent = {
  type: 'MENU_UPDATED';
  data: {
    merchantId: string;
    menu: MenuItem[];
  };
};

type MerchantUpdatedEvent = {
  type: 'MERCHANT_UPDATED';
  data: Merchant;
};

type RiderStatusUpdatedEvent = {
  type: 'RIDER_STATUS_UPDATED';
  data: {
    riderId: string;
    isOnline: boolean;
    onlineCount: number;
  };
};

type ServerEvent =
  | OrderUpdatedEvent
  | MenuUpdatedEvent
  | MerchantUpdatedEvent
  | RiderStatusUpdatedEvent;

export function connectOrderSocket() {
  let socket: WebSocket;
  let stopped = false;
  let retryTimeout: ReturnType<typeof setTimeout> | null = null;

  function connect() {
    if (stopped) return;

    socket = new WebSocket(`ws://${SERVER_IP}:8080/ws`);

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as ServerEvent;

        if (message.type === 'ORDER_UPDATED') {
          useOrderStore.getState().updateOrder(message.data);
        }

        if (message.type === 'MENU_UPDATED') {
          useOrderStore.getState().setMenu(message.data.menu);
        }

        if (message.type === 'MERCHANT_UPDATED') {
          useOrderStore.getState().updateMerchant(message.data);
        }

        if (message.type === 'RIDER_STATUS_UPDATED') {
          useRiderStore.getState().setOnlineCount(message.data.onlineCount);
        }
      } catch (error) {
        console.warn('Invalid websocket message', error);
      }
    };

    socket.onerror = (error) => {
      console.warn('WebSocket error', error);
    };

    socket.onclose = () => {
      if (!stopped) {
        retryTimeout = setTimeout(connect, 2000);
      }
    };
  }

  connect();

  return () => {
    stopped = true;
    if (retryTimeout) clearTimeout(retryTimeout);
    socket?.close();
  };
}
