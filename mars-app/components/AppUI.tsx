import { ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { UserRole, useAuthStore } from '@/store/authStore';
import { OrderStatus } from '@/store/orderStore';

const ROLE_LABELS: Record<UserRole, string> = {
  customer: 'Customer',
  merchant: 'Merchant',
  rider: 'Rider',
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: '待商家接单',
  confirmed: '商家已接单',
  delivering: '配送中',
  delivered: '已完成',
};

const STATUS_COLORS: Record<OrderStatus, { backgroundColor: string; color: string }> = {
  pending: { backgroundColor: '#fff1e7', color: '#b45309' },
  confirmed: { backgroundColor: '#eff6ff', color: '#1d4ed8' },
  delivering: { backgroundColor: '#ecfdf5', color: '#047857' },
  delivered: { backgroundColor: '#f3f4f6', color: '#374151' },
};

export function AppHeader({
  title,
  role,
  online = true,
  subtitle,
}: {
  title: string;
  role: UserRole;
  online?: boolean;
  subtitle?: string;
}) {
  const user = useAuthStore((state) => state.user);
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);

  return (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <View>
          <Text style={styles.brand}>Mars</Text>
          <Text style={styles.headerTitle}>{title}</Text>
          {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
        </View>
        <View style={styles.headerMeta}>
          <Text style={styles.rolePill}>{ROLE_LABELS[role]}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, online ? styles.onlineDot : styles.offlineDot]} />
            <Text style={styles.headerStatus}>
              {online ? 'Online' : 'Offline'} · {isLoggedIn ? 'Logged in' : 'Guest'}
            </Text>
          </View>
        </View>
      </View>
      <Text style={styles.userText}>{user?.name ?? 'Welcome'}</Text>
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <View style={styles.statGrid}>{children}</View>;
}

export function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  const colors = STATUS_COLORS[status];

  return (
    <View style={[styles.badge, { backgroundColor: colors.backgroundColor }]}>
      <Text style={[styles.badgeText, { color: colors.color }]}>
        {STATUS_LABELS[status]}
      </Text>
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  danger,
  disabled,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.button,
        danger ? styles.dangerButton : null,
        disabled ? styles.disabledButton : null,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </TouchableOpacity>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <View style={styles.emptyBox}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

export const appStyles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    backgroundColor: '#f7f7f7',
  },
  content: {
    padding: 16,
    gap: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#191919',
  },
  text: {
    color: '#3f3f46',
  },
  muted: {
    color: '#71717a',
  },
});

const styles = StyleSheet.create({
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eeeeee',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  brand: {
    color: '#e11d2e',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0,
  },
  headerTitle: {
    color: '#191919',
    fontSize: 28,
    fontWeight: '900',
    marginTop: 2,
  },
  headerSubtitle: {
    color: '#71717a',
    marginTop: 4,
    maxWidth: 240,
  },
  headerMeta: {
    alignItems: 'flex-end',
    gap: 6,
    flexShrink: 1,
  },
  rolePill: {
    backgroundColor: '#fef2f2',
    color: '#e11d2e',
    fontWeight: '900',
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  onlineDot: {
    backgroundColor: '#22c55e',
  },
  offlineDot: {
    backgroundColor: '#ef4444',
  },
  headerStatus: {
    color: '#71717a',
    fontSize: 12,
  },
  userText: {
    color: '#3f3f46',
    marginTop: 10,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#191919',
  },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ededed',
    borderRadius: 18,
    padding: 16,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  statGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ededed',
    borderRadius: 18,
    padding: 14,
    gap: 6,
  },
  statLabel: {
    color: '#71717a',
    fontSize: 12,
    fontWeight: '700',
  },
  statValue: {
    color: '#191919',
    fontSize: 22,
    fontWeight: '900',
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '900',
  },
  button: {
    backgroundColor: '#e11d2e',
    borderRadius: 999,
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  dangerButton: {
    backgroundColor: '#191919',
  },
  disabledButton: {
    backgroundColor: '#a1a1aa',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '900',
  },
  emptyBox: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ededed',
    borderRadius: 18,
    padding: 18,
  },
  emptyText: {
    color: '#71717a',
    fontWeight: '700',
  },
});
