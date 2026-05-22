import { Link, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { api } from '@/services/api';
import { connectOrderSocket } from '@/services/socket';
import { useCartStore } from '@/store/cartStore';
import { Merchant, MenuItem } from '@/store/orderStore';

export default function MerchantDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [loading, setLoading] = useState(true);
  const { items, merchantId, addItem, updateQuantity } = useCartStore();

  const quantities = useMemo(() => {
    const map = new Map<string, number>();

    if (merchantId === id) {
      for (const item of items) {
        map.set(item.menuItemId, item.quantity);
      }
    }

    return map;
  }, [id, items, merchantId]);

  useEffect(() => {
    const cleanupSocket = connectOrderSocket();

    api
      .get<Merchant>(`/merchants/${id}`)
      .then((response) => setMerchant(response.data))
      .catch(() => Alert.alert('错误', '无法获取商家详情'))
      .finally(() => setLoading(false));

    return cleanupSocket;
  }, [id]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!merchant) {
    return (
      <View style={styles.center}>
        <Text>商家不存在</Text>
      </View>
    );
  }

  const availableMenu = merchant.menu.filter((item) => item.available);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{merchant.name}</Text>
          <Text>{merchant.category}</Text>
          <Text>评分：{merchant.rating}</Text>
          <Text>配送费：${merchant.deliveryFee.toFixed(2)}</Text>
          <Text>配送时间：{merchant.deliveryTime}</Text>
          <Text>地址：{merchant.address}</Text>
        </View>

        <Link href="/customer/cart" asChild>
          <TouchableOpacity style={styles.cartButton}>
            <Text style={styles.cartButtonText}>购物车</Text>
          </TouchableOpacity>
        </Link>
      </View>

      <Text style={styles.sectionTitle}>菜单</Text>
      {availableMenu.map((item) => (
        <MenuRow
          key={item.id}
          item={item}
          quantity={quantities.get(item.id) ?? 0}
          onAdd={() => addItem(merchant.id, item)}
          onMinus={() => updateQuantity(item.id, (quantities.get(item.id) ?? 0) - 1)}
          onPlus={() => addItem(merchant.id, item)}
        />
      ))}
    </ScrollView>
  );
}

function MenuRow({
  item,
  quantity,
  onAdd,
  onMinus,
  onPlus,
}: {
  item: MenuItem;
  quantity: number;
  onAdd: () => void;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.menuText}>
        <Text style={styles.cardTitle}>{item.name}</Text>
        <Text style={styles.description}>{item.description}</Text>
        <Text>${item.price.toFixed(2)}</Text>
      </View>

      {quantity === 0 ? (
        <TouchableOpacity style={styles.addButton} onPress={onAdd}>
          <Text style={styles.buttonText}>加入</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.stepper}>
          <TouchableOpacity style={styles.stepButton} onPress={onMinus}>
            <Text style={styles.stepText}>-</Text>
          </TouchableOpacity>
          <Text style={styles.quantity}>{quantity}</Text>
          <TouchableOpacity style={styles.stepButton} onPress={onPlus}>
            <Text style={styles.stepText}>+</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  container: {
    padding: 16,
    gap: 12,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 8,
  },
  card: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  menuText: {
    gap: 4,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  description: {
    color: '#6b7280',
  },
  cartButton: {
    backgroundColor: '#111827',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignSelf: 'flex-start',
  },
  cartButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  addButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
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
});
