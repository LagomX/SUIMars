import { useEmbeddedSolanaWallet, usePrivy } from '@privy-io/expo';
import { Link, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  Modal,
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
  SectionTitle,
  StatusBadge,
  appStyles,
} from '@/components/AppUI';
import { DataDashboard } from '@/components/DataDashboard';
import {
  getUserRole,
  getWalletBalance,
  MIN_IDENTITY_BALANCE_LAMPORTS,
  OnChainRole,
  registerIdentity,
  transferSol,
} from '@/services/identity';
import { api } from '@/services/api';
import { connectOrderSocket } from '@/services/socket';
import { useAuthStore } from '@/store/authStore';
import { useRiderStore } from '@/store/riderStore';
import {
  CustomerProfile,
  Merchant,
  Order,
  useOrderStore,
} from '@/store/orderStore';

const CUSTOMER_ID = 'customer-1';
const DATA_CUSTOMER_ID = 'customer_01';
const CATEGORIES = ['All', 'Fast', 'Pizza', 'Cafe', 'Japanese', 'Deals'];
type CustomerTab = 'home' | 'orders' | 'profile' | 'data';

export default function CustomerHomeScreen() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<CustomerTab>('home');
  const [identityRole, setIdentityRole] = useState<OnChainRole | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [identityLoading, setIdentityLoading] = useState(false);
  const [identitySyncing, setIdentitySyncing] = useState(false);
  const [transferTo, setTransferTo] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferSending, setTransferSending] = useState(false);
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const user = useAuthStore((state) => state.user);
  const logoutLocal = useAuthStore((state) => state.logout);
  const { logout: logoutPrivy } = usePrivy();
  const embeddedWallet = useEmbeddedSolanaWallet();
  const customerId = user?.id ?? CUSTOMER_ID;
  const walletAddress = user?.walletAddress ?? null;
  const { onlineCount, setOnlineCount } = useRiderStore();
  const {
    customerProfile,
    merchants,
    orders,
    setCustomerProfile,
    setMerchants,
    setOrders,
  } = useOrderStore();

  const customerOrders = orders.filter((order) => order.customerId === customerId);
  const currentOrders = customerOrders.filter((order) => order.status !== 'delivered');
  const historyOrders = customerOrders.filter((order) => order.status === 'delivered');

  useEffect(() => {
    const cleanupSocket = connectOrderSocket();

    Promise.all([
      api.get<CustomerProfile>(`/customers/${customerId}/profile`),
      api.get<Merchant[]>('/merchants'),
      api.get<Order[]>(`/customers/${customerId}/orders`),
      api.get<{ count: number }>('/riders/online-count'),
    ])
      .then(([profileResponse, merchantsResponse, ordersResponse, ridersResponse]) => {
        setCustomerProfile(profileResponse.data);
        setMerchants(merchantsResponse.data);
        setOrders(ordersResponse.data);
        setOnlineCount(ridersResponse.data.count);
      })
      .catch(() => Alert.alert('错误', '无法获取商家列表，请检查 server 地址和 Wi-Fi'))
      .finally(() => setLoading(false));

    return cleanupSocket;
  }, [customerId, setCustomerProfile, setMerchants, setOnlineCount, setOrders]);

  const refreshIdentity = useCallback(async () => {
    if (!walletAddress) return;

    setIdentityLoading(true);
    try {
      const [role, balance] = await Promise.all([
        getUserRole(walletAddress),
        getWalletBalance(walletAddress),
      ]);
      setIdentityRole(role);
      setWalletBalance(balance);
    } catch {
      Alert.alert('错误', '无法刷新链上身份，请稍后重试');
    } finally {
      setIdentityLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    void refreshIdentity();
  }, [refreshIdentity]);

  const syncIdentity = async () => {
    if (!walletAddress || !user) {
      Alert.alert('提示', '请先完成 Privy 登录');
      return;
    }

    if (embeddedWallet.status !== 'connected') {
      Alert.alert('提示', '钱包还未连接，请稍后重试');
      return;
    }

    setIdentitySyncing(true);
    try {
      const balance = await getWalletBalance(walletAddress);
      setWalletBalance(balance);

      if (balance < MIN_IDENTITY_BALANCE_LAMPORTS) {
        Alert.alert('余额不足', '请先向该钱包转入 devnet SOL，再刷新余额。');
        return;
      }

      const wallet = embeddedWallet.wallets.find(
        (item) => item.address === walletAddress,
      );
      if (!wallet) {
        Alert.alert('提示', '无法读取当前 Privy 钱包，请重新登录后再试');
        return;
      }

      const provider = await wallet.getProvider();
      await registerIdentity(walletAddress, user.role, provider);
      await refreshIdentity();
      Alert.alert('完成', '链上身份已同步');
    } catch {
      Alert.alert('同步失败', '链上交易失败，请确认钱包有 devnet SOL 后重试。');
    } finally {
      setIdentitySyncing(false);
    }
  };

  const sendSol = async () => {
    if (!walletAddress) {
      Alert.alert('提示', '请先完成 Privy 登录');
      return;
    }

    if (embeddedWallet.status !== 'connected') {
      Alert.alert('提示', '钱包还未连接，请稍后重试');
      return;
    }

    const toAddress = transferTo.trim();
    const amount = Number(transferAmount);

    if (!toAddress || Number.isNaN(amount) || amount <= 0) {
      Alert.alert('提示', '请输入有效的钱包地址和 SOL 数量');
      return;
    }

    const lamports = Math.round(amount * 1_000_000_000);
    if (lamports <= 0) {
      Alert.alert('提示', '转账金额太小');
      return;
    }

    setTransferSending(true);
    try {
      const balance = await getWalletBalance(walletAddress);
      setWalletBalance(balance);

      if (balance <= lamports) {
        Alert.alert('余额不足', '请预留少量 SOL 支付交易手续费。');
        return;
      }

      const wallet = embeddedWallet.wallets.find(
        (item) => item.address === walletAddress,
      );
      if (!wallet) {
        Alert.alert('提示', '无法读取当前 Privy 钱包，请重新登录后再试');
        return;
      }

      const provider = await wallet.getProvider();
      await transferSol(walletAddress, toAddress, lamports, provider);
      setTransferTo('');
      setTransferAmount('');
      setTransferModalVisible(false);
      await refreshIdentity();
      Alert.alert('完成', 'SOL 转账已发送');
    } catch {
      Alert.alert('转账失败', '请检查收款地址、余额和 devnet 网络状态后重试。');
    } finally {
      setTransferSending(false);
    }
  };

  const logout = async () => {
    try {
      await logoutPrivy();
    } catch {
      Alert.alert('提示', 'Privy session 清理失败，已退出本地登录状态');
    } finally {
      logoutLocal();
      router.replace('/');
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={appStyles.screen}>
        {activeTab === 'home' ? (
          <HomeTab
            merchants={merchants}
            address={customerProfile?.address ?? '-'}
            onlineRiderCount={onlineCount}
          />
        ) : null}

        {activeTab === 'orders' ? (
          <OrdersTab
            currentOrders={currentOrders}
            historyOrders={historyOrders}
          />
        ) : null}

        {activeTab === 'profile' ? (
          <ProfileTab
            customerProfile={customerProfile}
            walletAddress={walletAddress}
            identityRole={identityRole}
            walletBalance={walletBalance}
            identityLoading={identityLoading}
            identitySyncing={identitySyncing}
            transferTo={transferTo}
            transferAmount={transferAmount}
            transferSending={transferSending}
            transferModalVisible={transferModalVisible}
            setTransferTo={setTransferTo}
            setTransferAmount={setTransferAmount}
            setTransferModalVisible={setTransferModalVisible}
            refreshIdentity={refreshIdentity}
            syncIdentity={syncIdentity}
            sendSol={sendSol}
            logout={logout}
          />
        ) : null}

        {activeTab === 'data' ? (
          <DataDashboard role="consumer" userId={DATA_CUSTOMER_ID} />
        ) : null}
      </ScrollView>

      <CustomerTabBar activeTab={activeTab} onChange={setActiveTab} />
    </View>
  );
}

function HomeTab({
  merchants,
  address,
  onlineRiderCount,
}: {
  merchants: Merchant[];
  address: string;
  onlineRiderCount: number;
}) {
  return (
    <>
      <View style={styles.header}>
        <Text style={styles.brand}>Mars</Text>
        <Text style={styles.kicker}>Deliver now</Text>
        <Text style={styles.address}>{address}</Text>
      </View>

      <View style={appStyles.content}>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            placeholder="Search stores, dishes, or cuisines"
            placeholderTextColor="#71717a"
            style={styles.searchInput}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRow}
        >
          {CATEGORIES.map((category, index) => (
            <View
              key={category}
              style={[styles.categoryChip, index === 0 ? styles.categoryChipActive : null]}
            >
              <Text
                style={[
                  styles.categoryText,
                  index === 0 ? styles.categoryTextActive : null,
                ]}
              >
                {category}
              </Text>
            </View>
          ))}
        </ScrollView>

        <Card>
          <Text style={styles.cardLabel}>Online Riders Nearby</Text>
          <Text style={styles.riderCount}>{onlineRiderCount} riders online near you</Text>
        </Card>

        <SectionTitle>附近商家</SectionTitle>
        {merchants.length === 0 ? (
          <EmptyState text="暂无在线商家" />
        ) : (
          merchants.map((merchant) => (
            <Link
              key={merchant.id}
              href={`/customer/merchant/${merchant.id}`}
              asChild
            >
              <TouchableOpacity>
                <Card>
                  <View style={styles.storeHero}>
                    <Text style={styles.storeInitial}>{merchant.name.slice(0, 1)}</Text>
                  </View>
                  <View style={appStyles.row}>
                    <View style={styles.flex}>
                      <Text style={appStyles.title}>{merchant.name}</Text>
                      <Text style={appStyles.muted}>{merchant.category}</Text>
                    </View>
                    <Text style={styles.rating}>★ {merchant.rating}</Text>
                  </View>
                  <Text style={appStyles.text}>
                    {merchant.deliveryTime} · ${merchant.deliveryFee.toFixed(2)} delivery
                  </Text>
                </Card>
              </TouchableOpacity>
            </Link>
          ))
        )}

        <View style={styles.bottomSpacer} />
      </View>
    </>
  );
}

function OrdersTab({
  currentOrders,
  historyOrders,
}: {
  currentOrders: Order[];
  historyOrders: Order[];
}) {
  return (
    <>
      <View style={styles.header}>
        <Text style={styles.brand}>Mars</Text>
        <Text style={styles.pageTitle}>我的订单</Text>
        <Text style={styles.identity}>实时同步订单状态</Text>
      </View>

      <View style={appStyles.content}>
        <SectionTitle>当前订单</SectionTitle>
        {currentOrders.length === 0 ? (
          <EmptyState text="暂无进行中的订单" />
        ) : (
          currentOrders.map((order) => <OrderCard key={order.id} order={order} />)
        )}

        <SectionTitle>历史订单</SectionTitle>
        {historyOrders.length === 0 ? (
          <EmptyState text="暂无历史订单" />
        ) : (
          historyOrders.map((order) => <OrderCard key={order.id} order={order} />)
        )}

        <View style={styles.bottomSpacer} />
      </View>
    </>
  );
}

function ProfileTab({
  customerProfile,
  walletAddress,
  identityRole,
  walletBalance,
  identityLoading,
  identitySyncing,
  transferTo,
  transferAmount,
  transferSending,
  transferModalVisible,
  setTransferTo,
  setTransferAmount,
  setTransferModalVisible,
  refreshIdentity,
  syncIdentity,
  sendSol,
  logout,
}: {
  customerProfile: CustomerProfile | null;
  walletAddress: string | null;
  identityRole: OnChainRole | null;
  walletBalance: number | null;
  identityLoading: boolean;
  identitySyncing: boolean;
  transferTo: string;
  transferAmount: string;
  transferSending: boolean;
  transferModalVisible: boolean;
  setTransferTo: (value: string) => void;
  setTransferAmount: (value: string) => void;
  setTransferModalVisible: (visible: boolean) => void;
  refreshIdentity: () => Promise<void>;
  syncIdentity: () => Promise<void>;
  sendSol: () => Promise<void>;
  logout: () => Promise<void>;
}) {
  const balanceText =
    walletBalance === null
      ? '-'
      : `${(walletBalance / 1_000_000_000).toFixed(4)} SOL`;

  const copyWalletAddress = () => {
    if (!walletAddress) return;
    Clipboard.setString(walletAddress);
    Alert.alert('已复制', '钱包地址已复制到剪贴板');
  };

  return (
    <>
      <View style={styles.header}>
        <Text style={styles.brand}>Mars</Text>
        <Text style={styles.pageTitle}>我的信息</Text>
        <Text style={styles.identity}>Customer profile</Text>
      </View>

      <View style={appStyles.content}>
        <Card>
          <Text style={styles.profileName}>{customerProfile?.name ?? 'Customer'}</Text>
          <Text style={appStyles.muted}>电话：{customerProfile?.phone ?? '-'}</Text>
          <Text style={styles.loginStatus}>Logged in</Text>
        </Card>

        <Card>
          <Text style={styles.cardLabel}>默认配送地址</Text>
          <Text style={styles.profileAddress}>{customerProfile?.address ?? '-'}</Text>
        </Card>

        <Card>
          <View style={appStyles.row}>
            <View style={styles.flex}>
              <Text style={styles.cardLabel}>链上身份</Text>
              <Text style={styles.identityTitle}>
                {identityRole ? '链上身份已激活' : '链上身份未激活'}
              </Text>
            </View>
            <Text style={identityRole ? styles.identityActive : styles.identityInactive}>
              {identityRole ?? 'inactive'}
            </Text>
          </View>

          <Text style={appStyles.muted}>钱包地址：</Text>
          <Text style={styles.walletAddress}>{walletAddress ?? '-'}</Text>
          <Text style={appStyles.muted}>余额：{balanceText}</Text>
          {!identityRole ? (
            <Text style={styles.identityHint}>请转入 devnet SOL 后刷新</Text>
          ) : null}

          <View style={styles.identityActions}>
            <TouchableOpacity
              style={[styles.identityButton, !walletAddress ? styles.identityButtonDisabled : null]}
              onPress={copyWalletAddress}
              disabled={!walletAddress}
            >
              <Text style={styles.identityButtonText}>复制地址</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.identityButton}
              onPress={() => void refreshIdentity()}
              disabled={identityLoading}
            >
              <Text style={styles.identityButtonText}>
                {identityLoading ? '刷新中' : '刷新余额'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.identityButton}
              onPress={() => setTransferModalVisible(true)}
              disabled={!walletAddress || transferSending}
            >
              <Text style={styles.identityButtonText}>转账</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.identityButton,
                styles.identityButtonPrimary,
                identitySyncing || !!identityRole ? styles.identityButtonDisabled : null,
              ]}
              onPress={() => void syncIdentity()}
              disabled={identitySyncing || !!identityRole}
            >
              <Text style={[styles.identityButtonText, styles.identityButtonTextPrimary]}>
                {identitySyncing ? '同步中' : '同步身份'}
              </Text>
            </TouchableOpacity>
          </View>
        </Card>

        <Modal
          animationType="fade"
          transparent
          visible={transferModalVisible}
          onRequestClose={() => setTransferModalVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.transferModal}>
              <Text style={styles.modalTitle}>转账 SOL</Text>
              <TextInput
                value={transferTo}
                onChangeText={setTransferTo}
                placeholder="收款钱包地址"
                placeholderTextColor="#71717a"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.transferInput}
              />
              <TextInput
                value={transferAmount}
                onChangeText={setTransferAmount}
                placeholder="数量，例如 0.01"
                placeholderTextColor="#71717a"
                keyboardType="decimal-pad"
                style={styles.transferInput}
              />
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={() => setTransferModalVisible(false)}
                  disabled={transferSending}
                >
                  <Text style={styles.modalCancelText}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.transferButton,
                    transferSending ? styles.identityButtonDisabled : null,
                  ]}
                  onPress={() => void sendSol()}
                  disabled={transferSending}
                >
                  <Text style={styles.transferButtonText}>
                    {transferSending ? '发送中' : '发送'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <TouchableOpacity style={styles.logoutButton} onPress={() => void logout()}>
          <Text style={styles.logoutButtonText}>退出登录</Text>
        </TouchableOpacity>

        <View style={styles.bottomSpacer} />
      </View>
    </>
  );
}

function OrderCard({ order }: { order: Order }) {
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
      <Text style={styles.orderTotal}>${order.totalAmount.toFixed(2)}</Text>
    </Card>
  );
}

function CustomerTabBar({
  activeTab,
  onChange,
}: {
  activeTab: CustomerTab;
  onChange: (tab: CustomerTab) => void;
}) {
  return (
    <View style={styles.tabBar}>
      <TabButton
        label="Home"
        active={activeTab === 'home'}
        onPress={() => onChange('home')}
      />
      <TabButton
        label="Orders"
        active={activeTab === 'orders'}
        onPress={() => onChange('orders')}
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

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f7f7f7',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  brand: {
    color: '#e11d2e',
    fontSize: 16,
    fontWeight: '900',
  },
  kicker: {
    color: '#71717a',
    marginTop: 14,
    fontWeight: '700',
  },
  address: {
    color: '#191919',
    fontSize: 25,
    fontWeight: '900',
    marginTop: 3,
  },
  pageTitle: {
    color: '#191919',
    fontSize: 28,
    fontWeight: '900',
    marginTop: 10,
  },
  identity: {
    color: '#71717a',
    marginTop: 6,
  },
  searchBox: {
    backgroundColor: '#fff',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ededed',
    paddingHorizontal: 14,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchIcon: {
    color: '#e11d2e',
    fontSize: 22,
    fontWeight: '900',
  },
  searchInput: {
    flex: 1,
    color: '#191919',
    fontSize: 15,
  },
  categoryRow: {
    gap: 10,
  },
  categoryChip: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ededed',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  categoryChipActive: {
    backgroundColor: '#191919',
    borderColor: '#191919',
  },
  categoryText: {
    color: '#3f3f46',
    fontWeight: '800',
  },
  categoryTextActive: {
    color: '#fff',
  },
  flex: {
    flex: 1,
  },
  storeHero: {
    height: 96,
    borderRadius: 16,
    backgroundColor: '#fff1f2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  storeInitial: {
    color: '#e11d2e',
    fontSize: 42,
    fontWeight: '900',
  },
  rating: {
    color: '#191919',
    fontWeight: '900',
  },
  orderTotal: {
    color: '#191919',
    fontWeight: '900',
    fontSize: 16,
  },
  profileName: {
    color: '#191919',
    fontSize: 24,
    fontWeight: '900',
  },
  loginStatus: {
    color: '#047857',
    fontWeight: '900',
  },
  cardLabel: {
    color: '#71717a',
    fontSize: 12,
    fontWeight: '800',
  },
  riderCount: {
    color: '#191919',
    fontSize: 22,
    fontWeight: '900',
  },
  profileAddress: {
    color: '#191919',
    fontSize: 20,
    fontWeight: '900',
  },
  identityTitle: {
    color: '#191919',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 4,
  },
  identityActive: {
    color: '#047857',
    fontSize: 12,
    fontWeight: '900',
  },
  identityInactive: {
    color: '#b91c1c',
    fontSize: 12,
    fontWeight: '900',
  },
  walletAddress: {
    color: '#191919',
    fontSize: 13,
    fontWeight: '800',
  },
  identityHint: {
    color: '#71717a',
    fontWeight: '800',
  },
  identityActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  identityButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d4d4d8',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  identityButtonPrimary: {
    backgroundColor: '#191919',
    borderColor: '#191919',
  },
  identityButtonDisabled: {
    opacity: 0.45,
  },
  identityButtonText: {
    color: '#191919',
    fontWeight: '900',
  },
  identityButtonTextPrimary: {
    color: '#fff',
  },
  transferInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d4d4d8',
    borderRadius: 10,
    color: '#191919',
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  transferModal: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    gap: 12,
  },
  modalTitle: {
    color: '#191919',
    fontSize: 20,
    fontWeight: '900',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d4d4d8',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#191919',
    fontWeight: '900',
  },
  transferButton: {
    flex: 1,
    backgroundColor: '#191919',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  transferButtonText: {
    color: '#fff',
    fontWeight: '900',
  },
  logoutButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#fecdd3',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#be123c',
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
