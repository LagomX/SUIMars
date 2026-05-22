import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  Card,
  EmptyState,
  PrimaryButton,
  SectionTitle,
  StatCard,
  StatGrid,
  StatusBadge,
  appStyles,
} from '@/components/AppUI';
import { DataDashboard } from '@/components/DataDashboard';
import { api } from '@/services/api';
import { connectOrderSocket } from '@/services/socket';
import { useAuthStore } from '@/store/authStore';
import { useRiderStore } from '@/store/riderStore';
import {
  EarningsSummary,
  Order,
  RiderProfile,
  useOrderStore,
} from '@/store/orderStore';

const RIDER_ID = 'rider-1';
const DATA_RIDER_ID = 'rider_01';
type RiderTab = 'home' | 'earnings' | 'profile' | 'data';
type RiderStatusUpdate = {
  riderId: string;
  isOnline: boolean;
  onlineCount: number;
};

export default function RiderScreen() {
  const [activeTab, setActiveTab] = useState<RiderTab>('home');
  const [isOnline, setIsOnline] = useState(false);
  const user = useAuthStore((state) => state.user);
  const riderId = user?.id ?? RIDER_ID;
  const setOnlineCount = useRiderStore((state) => state.setOnlineCount);
  const {
    orders,
    riderProfile,
    earnings,
    setOrders,
    setRiderProfile,
    setEarnings,
    updateOrder,
  } = useOrderStore();

  const availableOrders = orders.filter((order) => order.status === 'confirmed');
  const currentOrder = orders.find(
    (order) => order.status === 'delivering' && order.riderId === riderId,
  );
  const deliveryHistory = orders.filter(
    (order) => order.status === 'delivered' && order.riderId === riderId,
  );
  const liveEarnings = useMemo(
    () => deliveryHistory.reduce((sum, order) => sum + order.deliveryFee, 0),
    [deliveryHistory],
  );
  const averageEarnings =
    deliveryHistory.length === 0 ? 0 : liveEarnings / deliveryHistory.length;

  useEffect(() => {
    let cleanupSocket: undefined | (() => void);

    Promise.all([
      api.get<Order[]>('/orders'),
      api.get<RiderProfile>(`/riders/${riderId}/profile`),
      api.get<Order | null>(`/riders/${riderId}/current-order`),
      api.get<EarningsSummary>(`/riders/${riderId}/earnings`),
      api.get<Order[]>(`/riders/${riderId}/deliveries`),
      api.get<{ count: number }>('/riders/online-count'),
    ])
      .then(
        ([
          ordersResponse,
          profileResponse,
          currentOrderResponse,
          earningsResponse,
          deliveriesResponse,
          ridersResponse,
        ]) => {
          const mergedOrders = mergeOrders([
            ...ordersResponse.data,
            ...(currentOrderResponse.data ? [currentOrderResponse.data] : []),
            ...deliveriesResponse.data,
          ]);
          setOrders(mergedOrders);
          setRiderProfile(profileResponse.data);
          setEarnings(earningsResponse.data);
          setIsOnline(profileResponse.data.isOnline);
          setOnlineCount(ridersResponse.data.count);
        },
      )
      .catch(() => Alert.alert('错误', '无法获取 Rider 数据，请检查 server 地址和 Wi-Fi'));

    cleanupSocket = connectOrderSocket();

    return () => {
      cleanupSocket?.();
    };
  }, [riderId, setEarnings, setOnlineCount, setOrders, setRiderProfile]);

  const syncRiderOnline = async (nextOnline: boolean) => {
    setIsOnline(nextOnline);

    try {
      const response = await api.patch<RiderStatusUpdate>(
        `/riders/${riderId}/status`,
        {
          isOnline: nextOnline,
        },
      );
      setIsOnline(response.data.isOnline);
      setOnlineCount(response.data.onlineCount);
    } catch {
      setIsOnline(!nextOnline);
      Alert.alert('错误', '更新骑手在线状态失败');
    }
  };

  const claimOrder = async (orderId: string) => {
    try {
      const response = await api.patch<Order>(`/orders/${orderId}/claim`, {
        riderId,
      });
      updateOrder(response.data);
    } catch {
      Alert.alert('错误', '抢单失败');
    }
  };

  const completeOrder = async (orderId: string) => {
    try {
      const response = await api.patch<Order>(`/orders/${orderId}/complete`);
      updateOrder(response.data);
    } catch {
      Alert.alert('错误', '完成配送失败');
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={appStyles.screen}>
        <View style={styles.header}>
          <View style={appStyles.row}>
            <View style={styles.flex}>
              <Text style={styles.brand}>Mars Dasher</Text>
              <Text style={styles.name}>{riderProfile?.name ?? '-'}</Text>
              <Text style={styles.meta}>
                {riderProfile?.vehicle ?? '-'} · ★ {riderProfile?.rating ?? '-'}
              </Text>
            </View>
            <View style={isOnline ? styles.statusPillOnline : styles.statusPillOffline}>
              <Text style={isOnline ? styles.statusPillTextOnline : styles.statusPillTextOffline}>
                {isOnline ? 'Online' : 'Offline'}
              </Text>
            </View>
          </View>
        </View>

        {activeTab === 'home' ? (
          <HomeTab
            isOnline={isOnline}
            setIsOnline={syncRiderOnline}
            currentOrder={currentOrder}
            availableOrders={availableOrders}
            claimOrder={claimOrder}
            completeOrder={completeOrder}
          />
        ) : null}

        {activeTab === 'earnings' ? (
          <EarningsTab
            liveEarnings={liveEarnings}
            earnings={earnings}
            deliveryHistory={deliveryHistory}
            averageEarnings={averageEarnings}
          />
        ) : null}

        {activeTab === 'profile' ? (
          <ProfileTab
            riderProfile={riderProfile}
            isOnline={isOnline}
            setIsOnline={syncRiderOnline}
          />
        ) : null}

        {activeTab === 'data' ? (
          <DataDashboard role="rider" userId={DATA_RIDER_ID} />
        ) : null}
      </ScrollView>

      <RiderTabBar activeTab={activeTab} onChange={setActiveTab} />
    </View>
  );
}

function HomeTab({
  isOnline,
  setIsOnline,
  currentOrder,
  availableOrders,
  claimOrder,
  completeOrder,
}: {
  isOnline: boolean;
  setIsOnline: (nextOnline: boolean) => void;
  currentOrder: Order | undefined;
  availableOrders: Order[];
  claimOrder: (orderId: string) => void;
  completeOrder: (orderId: string) => void;
}) {
  return (
    <View style={appStyles.content}>
      <Card>
        <Text style={styles.cardKicker}>接单状态</Text>
        <Text style={styles.statusTitle}>
          {isOnline ? 'Ready to dash' : 'You are offline'}
        </Text>
        <PrimaryButton
          label={isOnline ? '切换离线' : '切换在线'}
          onPress={() => setIsOnline(!isOnline)}
          danger={isOnline}
        />
      </Card>

      <SectionTitle>Current Delivery</SectionTitle>
      {currentOrder ? (
        <CurrentDeliveryCard
          order={currentOrder}
          onComplete={() => completeOrder(currentOrder.id)}
        />
      ) : (
        <EmptyState text="当前没有配送中的订单" />
      )}

      {!currentOrder ? (
        <>
          <SectionTitle>Available Orders</SectionTitle>
          {availableOrders.length === 0 ? (
            <EmptyState text="暂无可抢订单" />
          ) : (
            availableOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                actionLabel="抢单"
                onAction={() => claimOrder(order.id)}
              />
            ))
          )}
        </>
      ) : null}

      <View style={styles.bottomSpacer} />
    </View>
  );
}

function EarningsTab({
  liveEarnings,
  earnings,
  deliveryHistory,
  averageEarnings,
}: {
  liveEarnings: number;
  earnings: EarningsSummary | null;
  deliveryHistory: Order[];
  averageEarnings: number;
}) {
  return (
    <View style={appStyles.content}>
      <StatGrid>
        <StatCard label="今日收入" value={`$${liveEarnings.toFixed(2)}`} />
        <StatCard
          label="总收入"
          value={`$${(earnings?.totalEarnings ?? liveEarnings).toFixed(2)}`}
        />
      </StatGrid>
      <StatGrid>
        <StatCard label="已完成" value={`${deliveryHistory.length}`} />
        <StatCard label="平均每单" value={`$${averageEarnings.toFixed(2)}`} />
      </StatGrid>

      <SectionTitle>已完成配送</SectionTitle>
      {deliveryHistory.length === 0 ? (
        <EmptyState text="暂无配送历史" />
      ) : (
        deliveryHistory.map((order) => <OrderCard key={order.id} order={order} />)
      )}

      <View style={styles.bottomSpacer} />
    </View>
  );
}

function ProfileTab({
  riderProfile,
  isOnline,
  setIsOnline,
}: {
  riderProfile: RiderProfile | null;
  isOnline: boolean;
  setIsOnline: (nextOnline: boolean) => void;
}) {
  return (
    <View style={appStyles.content}>
      <Card>
        <Text style={styles.profileName}>{riderProfile?.name ?? '-'}</Text>
        <Text style={appStyles.text}>电话：{riderProfile?.phone ?? '-'}</Text>
        <Text style={appStyles.text}>评分：{riderProfile?.rating ?? '-'}</Text>
        <Text style={appStyles.text}>车辆类型：{riderProfile?.vehicle ?? '-'}</Text>
      </Card>

      <Card>
        <Text style={styles.cardKicker}>在线状态</Text>
        <Text style={isOnline ? styles.online : styles.offline}>
          {isOnline ? 'Online' : 'Offline'}
        </Text>
        <PrimaryButton
          label={isOnline ? '切换离线' : '切换在线'}
          onPress={() => setIsOnline(!isOnline)}
          danger={isOnline}
        />
      </Card>

      <View style={styles.bottomSpacer} />
    </View>
  );
}

function CurrentDeliveryCard({
  order,
  onComplete,
}: {
  order: Order;
  onComplete: () => void;
}) {
  const itemNames = order.items
    .map((item) => `${item.name} x ${item.quantity}`)
    .join(', ');

  return (
    <Card>
      <View style={appStyles.row}>
        <Text style={[styles.deliveryTitle, styles.flex]}>Next step</Text>
        <StatusBadge status={order.status} />
      </View>
      <Text style={styles.bigOrderId}>#{order.id.slice(0, 8)}</Text>
      <Text style={appStyles.text}>{itemNames}</Text>
      <View style={styles.routeBox}>
        <Text style={styles.routeLabel}>取餐</Text>
        <Text style={styles.routeText}>商家：{order.merchantId ?? '-'}</Text>
      </View>
      <View style={styles.routeBox}>
        <Text style={styles.routeLabel}>送达</Text>
        <Text style={styles.routeText}>Customer：{order.customerId}</Text>
      </View>
      <Text style={styles.earningsText}>预计收入：${order.deliveryFee.toFixed(2)}</Text>
      <PrimaryButton label="完成配送" onPress={onComplete} danger />
    </Card>
  );
}

function OrderCard({
  order,
  actionLabel,
  onAction,
}: {
  order: Order;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const itemNames = order.items
    .map((item) => `${item.name} x ${item.quantity}`)
    .join(', ');

  return (
    <Card>
      <View style={appStyles.row}>
        <Text style={[appStyles.title, styles.flex]}>{itemNames}</Text>
        <StatusBadge status={order.status} />
      </View>
      <Text style={appStyles.muted}>订单：{order.id}</Text>
      <Text style={appStyles.text}>预计收入：${order.deliveryFee.toFixed(2)}</Text>
      <Text style={appStyles.text}>商家：{order.merchantId ?? '-'}</Text>
      {actionLabel && onAction ? (
        <PrimaryButton label={actionLabel} onPress={onAction} />
      ) : null}
    </Card>
  );
}

function RiderTabBar({
  activeTab,
  onChange,
}: {
  activeTab: RiderTab;
  onChange: (tab: RiderTab) => void;
}) {
  return (
    <View style={styles.tabBar}>
      <TabButton
        label="Home"
        active={activeTab === 'home'}
        onPress={() => onChange('home')}
      />
      <TabButton
        label="Earnings"
        active={activeTab === 'earnings'}
        onPress={() => onChange('earnings')}
      />
      <TabButton
        label="Profile"
        active={activeTab === 'profile'}
        onPress={() => onChange('profile')}
      />
      <TabButton
        label="Data"
        active={activeTab === 'data'}
        onPress={() => onChange('data')}
      />
    </View>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.tabButton} onPress={onPress}>
      <View style={[styles.tabDot, active ? styles.tabDotActive : null]} />
      <Text style={[styles.tabText, active ? styles.tabTextActive : null]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function mergeOrders(orders: Order[]) {
  const map = new Map<string, Order>();

  for (const order of orders) {
    map.set(order.id, order);
  }

  return Array.from(map.values());
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f7f7f7',
  },
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#eeeeee',
  },
  flex: {
    flex: 1,
  },
  brand: {
    color: '#e11d2e',
    fontWeight: '900',
  },
  name: {
    color: '#191919',
    fontSize: 28,
    fontWeight: '900',
    marginTop: 6,
  },
  meta: {
    color: '#71717a',
    marginTop: 4,
  },
  statusPillOnline: {
    backgroundColor: '#ecfdf5',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  statusPillOffline: {
    backgroundColor: '#fef2f2',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  statusPillTextOnline: {
    color: '#047857',
    fontWeight: '900',
  },
  statusPillTextOffline: {
    color: '#e11d2e',
    fontWeight: '900',
  },
  cardKicker: {
    color: '#71717a',
    fontWeight: '800',
  },
  statusTitle: {
    color: '#191919',
    fontSize: 22,
    fontWeight: '900',
  },
  deliveryTitle: {
    color: '#191919',
    fontSize: 22,
    fontWeight: '900',
  },
  bigOrderId: {
    color: '#191919',
    fontSize: 30,
    fontWeight: '900',
  },
  routeBox: {
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#ededed',
    borderRadius: 16,
    padding: 12,
    gap: 4,
  },
  routeLabel: {
    color: '#e11d2e',
    fontSize: 12,
    fontWeight: '900',
  },
  routeText: {
    color: '#191919',
    fontWeight: '800',
  },
  earningsText: {
    color: '#191919',
    fontSize: 18,
    fontWeight: '900',
  },
  profileName: {
    color: '#191919',
    fontSize: 26,
    fontWeight: '900',
  },
  online: {
    color: '#047857',
    fontWeight: '900',
    fontSize: 18,
  },
  offline: {
    color: '#e11d2e',
    fontWeight: '900',
    fontSize: 18,
  },
  bottomSpacer: {
    height: 92,
  },
  tabBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ededed',
    borderRadius: 28,
    padding: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
  },
  tabDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'transparent',
  },
  tabDotActive: {
    backgroundColor: '#e11d2e',
  },
  tabText: {
    color: '#71717a',
    fontWeight: '800',
  },
  tabTextActive: {
    color: '#191919',
  },
});
