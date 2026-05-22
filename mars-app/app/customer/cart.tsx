import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { api } from '@/services/api';
import { getUserRole } from '@/services/identity';
import { connectOrderSocket } from '@/services/socket';
import { useAuthStore } from '@/store/authStore';
import { useCartStore } from '@/store/cartStore';
import { Merchant, Order, useOrderStore } from '@/store/orderStore';

const CUSTOMER_ID = 'customer-1';

export default function CartScreen() {
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const user = useAuthStore((state) => state.user);
  const customerId = user?.id ?? CUSTOMER_ID;
  const { items, merchantId, updateQuantity, clearCart, total } = useCartStore();
  const { updateOrder } = useOrderStore();

  const subtotal = total();
  const deliveryFee = merchant?.deliveryFee ?? 0;
  const grandTotal = useMemo(
    () => subtotal + deliveryFee,
    [deliveryFee, subtotal],
  );

  useEffect(() => {
    const cleanupSocket = connectOrderSocket();

    if (merchantId) {
      api
        .get<Merchant>(`/merchants/${merchantId}`)
        .then((response) => setMerchant(response.data))
        .catch(() => Alert.alert('错误', '无法获取购物车商家'));
    } else {
      setMerchant(null);
    }

    return cleanupSocket;
  }, [merchantId]);

  const submitOrder = async () => {
    if (!merchantId || items.length === 0) {
      Alert.alert('提示', '购物车为空');
      return;
    }

    setSubmitting(true);
    try {
      const role = await getUserRole(customerId);
      if (role !== 'customer') {
        Alert.alert('链上身份未激活', '请先在 Profile 中完成链上身份同步。');
        return;
      }

      const response = await api.post<Order>('/orders', {
        customerId,
        merchantId,
        items: items.map((item) => ({
          menuItemId: item.menuItemId,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
        })),
        subtotal,
        deliveryFee,
        totalAmount: grandTotal,
      });

      updateOrder(response.data);
      clearCart();
      router.replace(`/customer/order/${response.data.id}`);
    } catch {
      Alert.alert('错误', '下单失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>购物车</Text>
      {merchant ? <Text style={styles.subtitle}>{merchant.name}</Text> : null}

      {items.length === 0 ? (
        <Text style={styles.empty}>购物车为空</Text>
      ) : (
        items.map((item) => (
          <View key={item.menuItemId} style={styles.card}>
            <View style={styles.itemText}>
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Text>${item.price.toFixed(2)}</Text>
            </View>

            <View style={styles.stepper}>
              <TouchableOpacity
                style={styles.stepButton}
                onPress={() => updateQuantity(item.menuItemId, item.quantity - 1)}
              >
                <Text style={styles.stepText}>-</Text>
              </TouchableOpacity>
              <Text style={styles.quantity}>{item.quantity}</Text>
              <TouchableOpacity
                style={styles.stepButton}
                onPress={() => updateQuantity(item.menuItemId, item.quantity + 1)}
              >
                <Text style={styles.stepText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}

      <View style={styles.summary}>
        <Text>小计：${subtotal.toFixed(2)}</Text>
        <Text>配送费：${deliveryFee.toFixed(2)}</Text>
        <Text style={styles.total}>总价：${grandTotal.toFixed(2)}</Text>
      </View>

      <TouchableOpacity
        style={[styles.submitButton, items.length === 0 ? styles.disabled : null]}
        onPress={submitOrder}
        disabled={items.length === 0 || submitting}
      >
        <Text style={styles.buttonText}>
          {submitting ? '下单中...' : '确认下单'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 12,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: '#6b7280',
  },
  card: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    gap: 10,
  },
  itemText: {
    gap: 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  quantity: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
  },
  summary: {
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 12,
    gap: 6,
  },
  total: {
    fontSize: 18,
    fontWeight: '700',
  },
  submitButton: {
    backgroundColor: '#16a34a',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  disabled: {
    backgroundColor: '#9ca3af',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
  },
  empty: {
    color: '#6b7280',
  },
});
