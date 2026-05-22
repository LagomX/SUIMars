import { Link } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useAuthStore, UserRole } from '@/store/authStore';

export default function RoleSelector() {
  const setSelectedRole = useAuthStore((state) => state.setSelectedRole);

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.brand}>Mars</Text>
        <Text style={styles.title}>Delivery, made simple.</Text>
        <Text style={styles.subtitle}>Choose how you want to enter the delivery network.</Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Continue as</Text>
        <RoleButton role="customer" label="Customer" detail="Browse restaurants and track orders" onSelect={setSelectedRole} />
        <RoleButton role="merchant" label="Merchant" detail="Manage your store and accept orders" onSelect={setSelectedRole} />
        <RoleButton role="rider" label="Rider" detail="Claim deliveries and view earnings" onSelect={setSelectedRole} />
      </View>
    </View>
  );
}

function RoleButton({
  role,
  label,
  detail,
  onSelect,
}: {
  role: UserRole;
  label: string;
  detail: string;
  onSelect: (role: UserRole) => void;
}) {
  return (
    <Link href={{ pathname: '/login', params: { role } }} asChild>
      <TouchableOpacity style={styles.roleCard} onPress={() => onSelect(role)}>
        <View>
          <Text style={styles.roleTitle}>{label}</Text>
          <Text style={styles.roleDetail}>{detail}</Text>
        </View>
        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>
    </Link>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7f7f7',
  },
  hero: {
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingTop: 72,
    paddingBottom: 34,
    borderBottomWidth: 1,
    borderBottomColor: '#eeeeee',
  },
  brand: {
    color: '#e11d2e',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 12,
  },
  title: {
    color: '#191919',
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 39,
  },
  subtitle: {
    color: '#71717a',
    fontSize: 16,
    marginTop: 10,
    lineHeight: 23,
  },
  panel: {
    padding: 16,
    gap: 12,
  },
  panelTitle: {
    color: '#191919',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 2,
  },
  roleCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ededed',
    borderRadius: 20,
    padding: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  roleTitle: {
    color: '#191919',
    fontSize: 18,
    fontWeight: '900',
  },
  roleDetail: {
    color: '#71717a',
    marginTop: 4,
  },
  arrow: {
    color: '#e11d2e',
    fontSize: 32,
    fontWeight: '500',
  },
});
