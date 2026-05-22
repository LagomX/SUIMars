import { ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export function AppHeader({
  title,
  subtitle,
  role,
}: {
  title: string;
  subtitle?: string;
  role: string;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <View style={styles.flex}>
          <Text style={styles.brand}>Mars</Text>
          <Text style={styles.headerTitle}>{title}</Text>
          {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
        </View>
        <Text style={styles.rolePill}>{role}</Text>
      </View>
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

export function EmptyState({ text }: { text: string }) {
  return (
    <View style={styles.emptyBox}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

export function TabButton({
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
      <Text style={[styles.tabText, active ? styles.tabTextActive : null]}>{label}</Text>
    </TouchableOpacity>
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

export const sharedStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f7f7f7',
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
});

const styles = StyleSheet.create({
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#eeeeee',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  flex: {
    flex: 1,
  },
  brand: {
    color: '#e11d2e',
    fontSize: 16,
    fontWeight: '900',
  },
  headerTitle: {
    color: '#191919',
    fontSize: 28,
    fontWeight: '900',
    marginTop: 6,
  },
  headerSubtitle: {
    color: '#71717a',
    marginTop: 5,
    lineHeight: 20,
  },
  rolePill: {
    backgroundColor: '#fef2f2',
    color: '#e11d2e',
    fontWeight: '900',
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
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
