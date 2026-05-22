import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
  MenuItem,
  MerchantProfile,
  Order,
  RevenueSummary,
  useOrderStore,
} from '@/store/orderStore';

const MERCHANT_ID = '222';
const DATA_MERCHANT_ID = 'merchant_01';
type MerchantTab = 'orders' | 'store' | 'dashboard' | 'data';

export default function MerchantScreen() {
  const [activeTab, setActiveTab] = useState<MerchantTab>('orders');
  const [menuName, setMenuName] = useState('');
  const [menuPrice, setMenuPrice] = useState('');
  const user = useAuthStore((state) => state.user);
  const merchantId = user?.id ?? MERCHANT_ID;
  const { onlineCount, setOnlineCount } = useRiderStore();
  const {
    orders,
    merchantProfile,
    menu,
    revenue,
    setOrders,
    setMerchantProfile,
    setMenu,
    setRevenue,
    updateOrder,
    updateMenuItem,
  } = useOrderStore();

  const pendingOrders = orders.filter(
    (order) => order.status === 'pending' && order.merchantId === merchantId,
  );
  const merchantOrders = orders.filter((order) => order.merchantId === merchantId);
  const inProgressOrders = merchantOrders.filter(
    (order) => order.status === 'confirmed' || order.status === 'delivering',
  );
  const completedOrders = merchantOrders.filter((order) => order.status === 'delivered');
  const todayOrders = merchantOrders.length;
  const liveRevenue = useMemo(
    () =>
      merchantOrders
        .filter((order) => order.status === 'delivered')
        .reduce((sum, order) => sum + order.totalAmount, 0),
    [merchantOrders],
  );
  const averageOrderValue =
    completedOrders.length === 0 ? 0 : liveRevenue / completedOrders.length;

  useEffect(() => {
    let cleanupSocket: undefined | (() => void);

    Promise.all([
      api.get<Order[]>('/orders'),
      api.get<MerchantProfile>(`/merchants/${merchantId}/profile`),
      api.get<MenuItem[]>(`/merchants/${merchantId}/menu`),
      api.get<RevenueSummary>(`/merchants/${merchantId}/revenue`),
      api.get<{ count: number }>('/riders/online-count'),
    ])
      .then(
        ([
          ordersResponse,
          profileResponse,
          menuResponse,
          revenueResponse,
          ridersResponse,
        ]) => {
        setOrders(ordersResponse.data);
        setMerchantProfile(profileResponse.data);
        setMenu(menuResponse.data);
        setRevenue(revenueResponse.data);
          setOnlineCount(ridersResponse.data.count);
        },
      )
      .catch(() => Alert.alert('错误', '无法获取 Merchant 数据，请检查 server 地址和 Wi-Fi'));

    cleanupSocket = connectOrderSocket();

    return () => {
      cleanupSocket?.();
    };
  }, [merchantId, setMenu, setMerchantProfile, setOnlineCount, setOrders, setRevenue]);

  const confirmOrder = async (orderId: string) => {
    try {
      const response = await api.patch<Order>(`/orders/${orderId}/confirm`, {
        merchantId,
      });
      updateOrder(response.data);
    } catch {
      Alert.alert('错误', '接单失败');
    }
  };

  const addMenuItem = async () => {
    const name = menuName.trim();
    const price = Number(menuPrice);

    if (!name || Number.isNaN(price) || price <= 0) {
      Alert.alert('提示', '请输入有效菜品和价格');
      return;
    }

    try {
      const response = await api.post<MenuItem>(`/merchants/${merchantId}/menu`, {
        name,
        price,
      });
      setMenu([...menu, response.data]);
      setMenuName('');
      setMenuPrice('');
    } catch {
      Alert.alert('错误', '新增菜单失败');
    }
  };

  const toggleMenuItem = async (itemId: string) => {
    try {
      const response = await api.patch<MenuItem>(
        `/merchants/${merchantId}/menu/${itemId}/toggle`,
      );
      updateMenuItem(response.data);
    } catch {
      Alert.alert('错误', '更新菜单失败');
    }
  };

  const toggleOnline = async () => {
    try {
      const response = await api.patch<MerchantProfile>(
        `/merchants/${merchantId}/online`,
        {
          isOnline: !(merchantProfile?.isOnline ?? false),
        },
      );
      setMerchantProfile(response.data);
      setMenu(response.data.menu);
    } catch {
      Alert.alert('错误', '更新营业状态失败');
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={appStyles.screen}>
        <View style={styles.header}>
          <View style={appStyles.row}>
            <View style={styles.flex}>
              <Text style={styles.brand}>Mars Merchant</Text>
              <Text style={styles.storeName}>{merchantProfile?.name ?? '-'}</Text>
              <Text style={styles.storeMeta}>
                {merchantProfile?.category ?? '-'} · {merchantProfile?.address ?? '-'}
              </Text>
            </View>
            <View
              style={
                merchantProfile?.isOnline
                  ? styles.statusPillOnline
                  : styles.statusPillOffline
              }
            >
              <Text
                style={
                  merchantProfile?.isOnline
                    ? styles.statusPillTextOnline
                    : styles.statusPillTextOffline
                }
              >
                {merchantProfile?.isOnline ? 'Online' : 'Offline'}
              </Text>
            </View>
          </View>
        </View>

        {activeTab === 'orders' ? (
          <OrdersTab
            pendingOrders={pendingOrders}
            inProgressOrders={inProgressOrders}
            completedOrders={completedOrders}
            onlineRiderCount={onlineCount}
            confirmOrder={confirmOrder}
          />
        ) : null}

        {activeTab === 'store' ? (
          <StoreTab
            merchantProfile={merchantProfile}
            menu={menu}
            menuName={menuName}
            menuPrice={menuPrice}
            setMenuName={setMenuName}
            setMenuPrice={setMenuPrice}
            addMenuItem={addMenuItem}
            toggleMenuItem={toggleMenuItem}
            toggleOnline={toggleOnline}
          />
        ) : null}

        {activeTab === 'dashboard' ? (
          <DashboardTab
            todayOrders={todayOrders}
            liveRevenue={liveRevenue}
            completedOrders={completedOrders}
            averageOrderValue={averageOrderValue}
            revenue={revenue}
          />
        ) : null}

        {activeTab === 'data' ? (
          <DataDashboard role="merchant" userId={DATA_MERCHANT_ID} />
        ) : null}
      </ScrollView>

      <MerchantTabBar activeTab={activeTab} onChange={setActiveTab} />
    </View>
  );
}

function OrdersTab({
  pendingOrders,
  inProgressOrders,
  completedOrders,
  onlineRiderCount,
  confirmOrder,
}: {
  pendingOrders: Order[];
  inProgressOrders: Order[];
  completedOrders: Order[];
  onlineRiderCount: number;
  confirmOrder: (orderId: string) => void;
}) {
  return (
    <View style={appStyles.content}>
      <Card>
        <Text style={styles.cardKicker}>Online Riders Nearby</Text>
        <Text style={styles.riderCount}>{onlineRiderCount} riders available</Text>
      </Card>

      <SectionTitle>待接单</SectionTitle>
      {pendingOrders.length === 0 ? (
        <EmptyState text="暂无待接订单" />
      ) : (
        pendingOrders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            actionLabel="接单"
            onAction={() => confirmOrder(order.id)}
          />
        ))
      )}

      <SectionTitle>进行中</SectionTitle>
      {inProgressOrders.length === 0 ? (
        <EmptyState text="暂无进行中的订单" />
      ) : (
        inProgressOrders.map((order) => <OrderCard key={order.id} order={order} />)
      )}

      <SectionTitle>已完成</SectionTitle>
      {completedOrders.length === 0 ? (
        <EmptyState text="暂无已完成订单" />
      ) : (
        completedOrders.map((order) => <OrderCard key={order.id} order={order} />)
      )}

      <View style={styles.bottomSpacer} />
    </View>
  );
}

function StoreTab({
  merchantProfile,
  menu,
  menuName,
  menuPrice,
  setMenuName,
  setMenuPrice,
  addMenuItem,
  toggleMenuItem,
  toggleOnline,
}: {
  merchantProfile: MerchantProfile | null;
  menu: MenuItem[];
  menuName: string;
  menuPrice: string;
  setMenuName: (value: string) => void;
  setMenuPrice: (value: string) => void;
  addMenuItem: () => void;
  toggleMenuItem: (itemId: string) => void;
  toggleOnline: () => void;
}) {
  return (
    <View style={appStyles.content}>
      <Card>
        <Text style={styles.cardKicker}>店铺资料</Text>
        <Text style={appStyles.title}>{merchantProfile?.name ?? '-'}</Text>
        <Text style={appStyles.text}>地址：{merchantProfile?.address ?? '-'}</Text>
        <Text style={appStyles.text}>分类：{merchantProfile?.category ?? '-'}</Text>
        <Text style={appStyles.text}>评分：{merchantProfile?.rating ?? '-'}</Text>
      </Card>

      <Card>
        <Text style={styles.cardKicker}>营业状态</Text>
        <Text style={merchantProfile?.isOnline ? styles.online : styles.offline}>
          {merchantProfile?.isOnline ? 'Online' : 'Offline'}
        </Text>
        <PrimaryButton
          label={merchantProfile?.isOnline ? '下线' : '上线'}
          onPress={toggleOnline}
          danger={merchantProfile?.isOnline}
        />
      </Card>

      <SectionTitle>菜单</SectionTitle>
      <Card>
        <View style={styles.inputRow}>
          <TextInput
            value={menuName}
            onChangeText={setMenuName}
            placeholder="菜品"
            style={[styles.input, styles.nameInput]}
          />
          <TextInput
            value={menuPrice}
            onChangeText={setMenuPrice}
            placeholder="价格"
            keyboardType="decimal-pad"
            style={[styles.input, styles.priceInput]}
          />
        </View>
        <PrimaryButton label="新增菜单" onPress={addMenuItem} />
      </Card>

      {menu.map((item) => (
        <Card key={item.id}>
          <View style={appStyles.row}>
            <View style={styles.flex}>
              <Text style={appStyles.title}>{item.name}</Text>
              <Text style={appStyles.muted}>${item.price.toFixed(2)}</Text>
            </View>
            <Text style={item.available ? styles.online : styles.offline}>
              {item.available ? 'available' : 'unavailable'}
            </Text>
          </View>
          <PrimaryButton label="切换上下架" onPress={() => toggleMenuItem(item.id)} />
        </Card>
      ))}

      <View style={styles.bottomSpacer} />
    </View>
  );
}

function DashboardTab({
  todayOrders,
  liveRevenue,
  completedOrders,
  averageOrderValue,
  revenue,
}: {
  todayOrders: number;
  liveRevenue: number;
  completedOrders: Order[];
  averageOrderValue: number;
  revenue: RevenueSummary | null;
}) {
  return (
    <View style={appStyles.content}>
      <StatGrid>
        <StatCard label="今日收入" value={`$${liveRevenue.toFixed(2)}`} />
        <StatCard label="今日订单" value={`${todayOrders}`} />
      </StatGrid>
      <StatGrid>
        <StatCard label="已完成" value={`${completedOrders.length}`} />
        <StatCard label="平均客单价" value={`$${averageOrderValue.toFixed(2)}`} />
      </StatGrid>

      <Card>
        <Text style={appStyles.title}>Revenue summary</Text>
        <Text style={appStyles.text}>接口完成订单：{revenue?.deliveredOrders ?? 0}</Text>
        <Text style={appStyles.text}>
          接口收入：${(revenue?.grossRevenue ?? 0).toFixed(2)}
        </Text>
      </Card>

      <View style={styles.bottomSpacer} />
    </View>
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
      <Text style={appStyles.text}>下单时间：{formatOrderTime(order.createdAt)}</Text>
      <Text style={styles.amount}>${order.totalAmount.toFixed(2)}</Text>
      {actionLabel && onAction ? (
        <PrimaryButton label={actionLabel} onPress={onAction} />
      ) : null}
    </Card>
  );
}

function MerchantTabBar({
  activeTab,
  onChange,
}: {
  activeTab: MerchantTab;
  onChange: (tab: MerchantTab) => void;
}) {
  return (
    <View style={styles.tabBar}>
      <TabButton
        label="Orders"
        active={activeTab === 'orders'}
        onPress={() => onChange('orders')}
      />
      <TabButton
        label="Store"
        active={activeTab === 'store'}
        onPress={() => onChange('store')}
      />
      <TabButton
        label="Dashboard"
        active={activeTab === 'dashboard'}
        onPress={() => onChange('dashboard')}
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

function formatOrderTime(createdAt: number) {
  if (!createdAt) {
    return '-';
  }

  return new Date(createdAt * 1000).toLocaleString();
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
  storeName: {
    color: '#191919',
    fontSize: 28,
    fontWeight: '900',
    marginTop: 6,
  },
  storeMeta: {
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
  riderCount: {
    color: '#191919',
    fontSize: 22,
    fontWeight: '900',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e4e4e7',
    borderRadius: 16,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fafafa',
  },
  nameInput: {
    flex: 1,
  },
  priceInput: {
    width: 96,
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
  amount: {
    color: '#191919',
    fontSize: 18,
    fontWeight: '900',
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
