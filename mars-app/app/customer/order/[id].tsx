import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  AppHeader,
  Card,
  StatusBadge,
  appStyles,
} from '@/components/AppUI';
import { api } from '@/services/api';
import { connectOrderSocket } from '@/services/socket';
import { Order, OrderStatus, useOrderStore } from '@/store/orderStore';

const STEPS: OrderStatus[] = ['pending', 'confirmed', 'delivering', 'delivered'];
const STEP_LABELS: Record<OrderStatus, string> = {
  pending: '待商家接单',
  confirmed: '商家已接单',
  delivering: '配送中',
  delivered: '已完成',
};

export default function OrderTrackingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orders, updateOrder } = useOrderStore();
  const order = useMemo(
    () => orders.find((item) => item.id === id),
    [id, orders],
  );

  useEffect(() => {
    const cleanupSocket = connectOrderSocket();

    api
      .get<Order>(`/orders/${id}`)
      .then((response) => updateOrder(response.data))
      .catch(() => Alert.alert('错误', '无法获取订单追踪信息'));

    return cleanupSocket;
  }, [id, updateOrder]);

  if (!order) {
    return (
      <View style={styles.center}>
        <Text>正在加载订单...</Text>
      </View>
    );
  }

  const currentStepIndex = STEPS.indexOf(order.status);

  return (
    <ScrollView contentContainerStyle={appStyles.screen}>
      <AppHeader title="Tracking" role="customer" online />

      <View style={appStyles.content}>
        <Card>
          <View style={appStyles.row}>
            <View style={styles.flex}>
              <Text style={appStyles.title}>订单追踪</Text>
              <Text style={appStyles.muted}>订单：{order.id}</Text>
            </View>
            <StatusBadge status={order.status} />
          </View>
        </Card>

        <Card>
          {STEPS.map((step, index) => (
            <View key={step} style={styles.stepRow}>
              <View
                style={[
                  styles.dot,
                  index <= currentStepIndex ? styles.activeDot : null,
                ]}
              />
              <Text
                style={[
                  styles.stepText,
                  index <= currentStepIndex ? styles.activeStepText : null,
                ]}
              >
                {STEP_LABELS[step]}
              </Text>
            </View>
          ))}
        </Card>

        <Card>
          <Text style={appStyles.title}>商品</Text>
          {order.items.map((item) => (
            <Text key={item.menuItemId} style={appStyles.text}>
              {item.name} x {item.quantity} - $
              {(item.price * item.quantity).toFixed(2)}
            </Text>
          ))}
          <Text style={appStyles.muted}>小计：${order.subtotal.toFixed(2)}</Text>
          <Text style={appStyles.muted}>配送费：${order.deliveryFee.toFixed(2)}</Text>
          <Text style={styles.total}>总价：${order.totalAmount.toFixed(2)}</Text>
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
  },
  flex: {
    flex: 1,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#d1d5db',
  },
  activeDot: {
    backgroundColor: '#16a34a',
  },
  stepText: {
    color: '#6b7280',
    fontSize: 16,
  },
  activeStepText: {
    color: '#111827',
    fontWeight: '800',
  },
  total: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
});
