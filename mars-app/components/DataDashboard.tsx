import { StyleSheet, Text, View } from 'react-native';

import {
  Card,
  EmptyState,
  SectionTitle,
  StatCard,
  StatGrid,
  appStyles,
} from '@/components/AppUI';
import {
  DashboardAsset,
  DashboardLicense,
  UserRole,
  getDataDashboard,
} from '@/services/mockDataService';

type DataDashboardProps = {
  role: UserRole;
  userId: string;
};

const DATA_LABELS: Record<string, string> = {
  rider_mobility: 'Rider mobility',
  merchant_operations: 'Merchant operations',
  consumer_behavior: 'Consumer behavior',
};

const shortId = (value: string, left = 10) =>
  value.length <= left + 6 ? value : `${value.slice(0, left)}...${value.slice(-6)}`;

const formatDate = (timestamp: number) => new Date(timestamp).toLocaleDateString();

export function DataDashboard({ role, userId }: DataDashboardProps) {
  const dashboard = getDataDashboard(role, userId);

  return (
    <View style={appStyles.content}>
      <View style={styles.headerBlock}>
        <Text style={styles.title}>My Data Assets</Text>
        <Text style={styles.subtitle}>
          Encrypted delivery data you own and license to AI buyers.
        </Text>
      </View>

      <StatGrid>
        <StatCard label="Total Data Assets" value={`${dashboard.total_assets}`} />
        <StatCard label="Licenses Sold" value={`${dashboard.licenses_sold}`} />
      </StatGrid>
      <StatGrid>
        <StatCard label="USDC Earned" value={`$${dashboard.total_earned_usdc.toFixed(2)}`} />
        <StatCard label="Access Grants" value={`${dashboard.access_grants}`} />
      </StatGrid>

      {dashboard.total_assets === 0 ? (
        <EmptyState text="No data assets yet · Complete deliveries to generate encrypted data assets." />
      ) : (
        <>
          <SectionTitle>DataAsset list</SectionTitle>
          {dashboard.assets.map((asset) => (
            <DataAssetCard key={asset.asset_id} asset={asset} />
          ))}

          <SectionTitle>License history</SectionTitle>
          {dashboard.licenses.length === 0 ? (
            <EmptyState text="No DataLicenses sold yet" />
          ) : (
            dashboard.licenses.map((license) => (
              <LicenseCard key={license.license_id} license={license} />
            ))
          )}

          <SectionTitle>Earnings summary</SectionTitle>
          <Card>
            <View style={appStyles.row}>
              <View style={styles.flex}>
                <Text style={styles.cardLabel}>Your earnings</Text>
                <Text style={styles.bigValue}>${dashboard.total_earned_usdc.toFixed(2)}</Text>
              </View>
              <View style={styles.rightSummary}>
                <Text style={styles.cardLabel}>Sold</Text>
                <Text style={styles.summaryValue}>{dashboard.licenses_sold}</Text>
              </View>
            </View>
            <Text style={appStyles.muted}>
              Role total: ${dashboard.role_earnings_usdc.toFixed(2)} across{' '}
              {dashboard.role_licenses_sold} license sales
            </Text>
          </Card>

          <SectionTitle>Access-control status</SectionTitle>
          <Card>
            <View style={appStyles.row}>
              <View style={styles.flex}>
                <Text style={styles.cardLabel}>Seal mock</Text>
                <Text style={styles.accessTitle}>License-gated access verified</Text>
              </View>
              <View style={styles.verifiedBadge}>
                <Text style={styles.verifiedText}>Verified</Text>
              </View>
            </View>
            <Text style={appStyles.text}>
              Successful access grants: {dashboard.access_grants}
            </Text>
            <Text style={appStyles.muted}>
              Rejected invalid attempts: {dashboard.rejected_access_attempts}
            </Text>
          </Card>
        </>
      )}

      <View style={styles.bottomSpacer} />
    </View>
  );
}

function DataAssetCard({ asset }: { asset: DashboardAsset }) {
  return (
    <Card>
      <View style={appStyles.row}>
        <View style={styles.flex}>
          <Text style={styles.assetTitle}>{asset.asset_id}</Text>
          <Text style={styles.cardLabel}>{DATA_LABELS[asset.data_type]}</Text>
        </View>
        <View style={asset.for_sale ? styles.saleBadge : styles.offSaleBadge}>
          <Text style={asset.for_sale ? styles.saleText : styles.offSaleText}>
            {asset.for_sale ? 'For sale' : 'Private'}
          </Text>
        </View>
      </View>
      <Text style={appStyles.muted}>blob: {shortId(asset.blob_id, 14)}</Text>
      <View style={styles.metricRow}>
        <MiniMetric label="Price" value={`$${asset.price_usdc}`} />
        <MiniMetric label="Licenses" value={`${asset.license_count}`} />
        <MiniMetric label="Earned" value={`$${asset.total_earned_usdc.toFixed(2)}`} />
        <MiniMetric label="Access" value={`${asset.access_grant_count}`} />
      </View>
    </Card>
  );
}

function LicenseCard({ license }: { license: DashboardLicense }) {
  return (
    <Card>
      <View style={appStyles.row}>
        <View style={styles.flex}>
          <Text style={styles.assetTitle}>{license.buyer_id}</Text>
          <Text style={appStyles.muted}>{shortId(license.license_id, 16)}</Text>
        </View>
        <Text style={styles.amount}>${license.usdc_paid.toFixed(2)}</Text>
      </View>
      <Text style={appStyles.text}>asset: {shortId(license.asset_id, 18)}</Text>
      <Text style={appStyles.muted}>
        {license.license_type} · {formatDate(license.purchased_at)}
      </Text>
    </Card>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.miniMetric}>
      <Text style={styles.miniLabel}>{label}</Text>
      <Text style={styles.miniValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerBlock: {
    gap: 6,
  },
  title: {
    color: '#191919',
    fontSize: 28,
    fontWeight: '900',
  },
  subtitle: {
    color: '#71717a',
    fontWeight: '700',
  },
  flex: {
    flex: 1,
  },
  cardLabel: {
    color: '#71717a',
    fontSize: 12,
    fontWeight: '800',
  },
  assetTitle: {
    color: '#191919',
    fontSize: 16,
    fontWeight: '900',
  },
  saleBadge: {
    backgroundColor: '#ecfdf5',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  offSaleBadge: {
    backgroundColor: '#f3f4f6',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  saleText: {
    color: '#047857',
    fontSize: 12,
    fontWeight: '900',
  },
  offSaleText: {
    color: '#71717a',
    fontSize: 12,
    fontWeight: '900',
  },
  metricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  miniMetric: {
    minWidth: 72,
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#ededed',
    borderRadius: 12,
    padding: 10,
    gap: 4,
  },
  miniLabel: {
    color: '#71717a',
    fontSize: 11,
    fontWeight: '800',
  },
  miniValue: {
    color: '#191919',
    fontWeight: '900',
  },
  amount: {
    color: '#191919',
    fontSize: 18,
    fontWeight: '900',
  },
  bigValue: {
    color: '#191919',
    fontSize: 26,
    fontWeight: '900',
    marginTop: 2,
  },
  rightSummary: {
    alignItems: 'flex-end',
  },
  summaryValue: {
    color: '#191919',
    fontSize: 22,
    fontWeight: '900',
  },
  accessTitle: {
    color: '#191919',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 2,
  },
  verifiedBadge: {
    backgroundColor: '#eff6ff',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  verifiedText: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '900',
  },
  bottomSpacer: {
    height: 92,
  },
});
