import { Link } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type RoleRoute = '/customer' | '/merchant' | '/rider';

export default function RoleSelector() {
  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.brand}>Mars</Text>
        <Text style={styles.title}>User-owned delivery data infrastructure for AI.</Text>
        <Text style={styles.subtitle}>
          Explore the Mars V4 mock protocol from each owner perspective.
        </Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Open dashboard as</Text>
        <RoleButton href="/rider" label="Rider" detail="Own rider_mobility data and route earnings" />
        <RoleButton href="/merchant" label="Merchant" detail="Own merchant_operations data and license history" />
        <RoleButton href="/customer" label="Customer" detail="Own consumer_behavior data and access status" />
      </View>
    </View>
  );
}

function RoleButton({
  href,
  label,
  detail,
}: {
  href: RoleRoute;
  label: string;
  detail: string;
}) {
  return (
    <Link href={href} asChild>
      <TouchableOpacity style={styles.roleCard}>
        <View style={styles.flex}>
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
  flex: {
    flex: 1,
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
