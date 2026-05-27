import type {
  ConsumerEvent,
  DataType,
  EncryptedAssetEnvelope,
  Grid,
  LicenseManifestEntry,
  Location,
  MerchantEvent,
  PersonalDataAsset,
  RiderEvent,
  Role,
  SimulationResult,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const WINDOW_MINUTES = 15;
const SIMULATION_DAYS = 7;
const START_TIME = Date.UTC(2026, 4, 26, 0, 0, 0);
const GRID_ROWS = ["A", "B", "C", "D"] as const;
const GRID_COLS = [1, 2, 3, 4] as const;
const MERCHANT_CATEGORIES = ["fast_food", "coffee", "grocery", "sushi", "pizza", "dessert"] as const;

class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }

  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  float(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length - 1)];
  }
}

const round = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const iso = (timestampMs: number): string => new Date(timestampMs).toISOString().replace(".000Z", "Z");

const createGrids = (): Grid[] => {
  const origin = { lat: 34.001, lng: -118.505 };
  const latStep = 0.0125;
  const lngStep = 0.0155;
  const grids: Grid[] = [];

  GRID_ROWS.forEach((row, rowIndex) => {
    GRID_COLS.forEach((col, colIndex) => {
      grids.push({
        grid_id: `SM_${row}${col}`,
        row: rowIndex,
        col: colIndex,
        center: {
          lat: round(origin.lat + rowIndex * latStep, 6),
          lng: round(origin.lng + colIndex * lngStep, 6),
        },
      });
    });
  });

  return grids;
};

const jitterLocation = (center: Location, rng: SeededRandom): Location => ({
  lat: round(center.lat + rng.float(-0.0045, 0.0045), 6),
  lng: round(center.lng + rng.float(-0.0045, 0.0045), 6),
});

const demandIntensity = (grid: Grid, timestampMs: number): number => {
  const date = new Date(timestampMs);
  const hour = date.getUTCHours();
  const day = date.getUTCDay();
  const mealPeak =
    Math.exp(-((hour - 12) ** 2) / 10) * 1.3 + Math.exp(-((hour - 19) ** 2) / 8) * 1.8;
  const weekendBoost = day === 0 || day === 6 ? 0.3 : 0;
  const beachBoost = grid.col <= 1 ? 0.25 : 0;
  const downtownBoost = grid.row >= 2 && grid.col >= 2 ? 0.35 : 0;
  return 0.25 + mealPeak + weekendBoost + beachBoost + downtownBoost;
};

const sampleOrderCount = (rng: SeededRandom, intensity: number): number => {
  const baseline = Math.floor(intensity);
  const fractional = intensity - baseline;
  const surge = rng.next() < 0.04 ? rng.int(2, 5) : 0;
  return Math.max(0, baseline + (rng.next() < fractional ? 1 : 0) + (rng.next() < 0.12 ? 1 : 0) + surge);
};

const neighborGrid = (grid: Grid, grids: Grid[], rng: SeededRandom): Grid => {
  const candidates = grids.filter(
    (candidate) =>
      Math.abs(candidate.row - grid.row) <= 1 &&
      Math.abs(candidate.col - grid.col) <= 1 &&
      candidate.grid_id !== grid.grid_id,
  );
  return rng.pick(candidates.length > 0 ? candidates : grids);
};

const pushAssetEvent = <TEvent extends RiderEvent | MerchantEvent | ConsumerEvent>(
  assetMap: Map<string, PersonalDataAsset<TEvent>>,
  asset: Omit<PersonalDataAsset<TEvent>, "events">,
  event: TEvent,
): void => {
  const existing = assetMap.get(asset.asset_id);
  if (existing) {
    existing.events.push(event);
    return;
  }

  assetMap.set(asset.asset_id, { ...asset, events: [event] });
};

const mockEncrypt = (asset: PersonalDataAsset): EncryptedAssetEnvelope => ({
  asset_id: asset.asset_id,
  owner_id: asset.owner_id,
  role: asset.role,
  data_type: asset.data_type,
  blob_id: `blob_${asset.asset_id}`,
  key_id: `mock_key_${asset.asset_id}`,
  ciphertext_base64: Buffer.from(JSON.stringify(asset), "utf8").toString("base64"),
  encryption: "mock-base64",
  created_at: asset.created_at,
});

const manifestPath = (dataType: DataType, assetId: string): string =>
  `mock_walrus/encrypted_assets/${dataType}/${assetId}.json`;

export const generateSimulation = (seed = 42): SimulationResult => {
  const rng = new SeededRandom(seed);
  const grids = createGrids();
  const riders = Array.from({ length: 32 }, (_, index) => `r_${String(index + 1).padStart(3, "0")}`);
  const merchants = Array.from({ length: 48 }, (_, index) => ({
    id: `m_${String(index + 1).padStart(3, "0")}`,
    grid: grids[index % grids.length],
    category: MERCHANT_CATEGORIES[index % MERCHANT_CATEGORIES.length],
  }));
  const consumers = Array.from({ length: 180 }, (_, index) => `c_${String(index + 1).padStart(3, "0")}`);

  const riderAssets = new Map<string, PersonalDataAsset<RiderEvent>>();
  const merchantAssets = new Map<string, PersonalDataAsset<MerchantEvent>>();
  const consumerAssets = new Map<string, PersonalDataAsset<ConsumerEvent>>();

  let orderNumber = 1;
  const windowCount = SIMULATION_DAYS * 24 * (60 / WINDOW_MINUTES);

  for (let windowIndex = 0; windowIndex < windowCount; windowIndex += 1) {
    const windowStart = START_TIME + windowIndex * WINDOW_MINUTES * MINUTE_MS;

    for (const grid of grids) {
      const orderCount = sampleOrderCount(rng, demandIntensity(grid, windowStart));

      for (let i = 0; i < orderCount; i += 1) {
        const createdAt = windowStart + rng.int(0, WINDOW_MINUTES - 1) * MINUTE_MS;
        const merchant = rng.pick(merchants.filter((candidate) => candidate.grid.grid_id === grid.grid_id));
        const riderId = rng.pick(riders);
        const consumerId = rng.pick(consumers);
        const dropoffGrid = neighborGrid(grid, grids, rng);
        const pickupLocation = jitterLocation(grid.center, rng);
        const acceptDelayMin = round(rng.float(0.5, 4.8), 1);
        const prepTimeMin = round(rng.float(5, 18), 1);
        const deliveryDurationMin = round(rng.float(12, 35) + demandIntensity(grid, createdAt), 1);
        const acceptedAt = createdAt + acceptDelayMin * MINUTE_MS;
        const readyAt = createdAt + prepTimeMin * MINUTE_MS;
        const pickedUpAt = Math.max(acceptedAt + rng.float(1, 4) * MINUTE_MS, readyAt);
        const deliveredAt = pickedUpAt + deliveryDurationMin * MINUTE_MS;
        const currentOrders = rng.next() < 0.22 ? 1 : 0;
        const idleTimeMin = currentOrders > 0 ? rng.int(0, 6) : rng.int(4, 36);
        const acceptanceRate = round(rng.float(0.72, 0.98), 2);
        const orderId = `ord_${String(orderNumber).padStart(6, "0")}`;
        orderNumber += 1;

        const createdAtIso = iso(createdAt);
        const acceptedAtIso = iso(acceptedAt);
        const readyAtIso = iso(readyAt);
        const deliveredAtIso = iso(deliveredAt);
        const createdForAsset = iso(START_TIME);

        pushAssetEvent(consumerAssets, {
          asset_id: `asset_${consumerId}_consumer_demand`,
          owner_id: consumerId,
          role: "consumer" as Role,
          data_type: "consumer_demand",
          created_at: createdForAsset,
        }, {
          order_id: orderId,
          timestamp: createdAtIso,
          grid_id: grid.grid_id,
          event_type: "order_created",
          order_value: round(rng.float(11, 64), 2),
          merchant_category: merchant.category,
          consumer_id: consumerId,
          pickup_grid: grid.grid_id,
          dropoff_grid: dropoffGrid.grid_id,
        });

        pushAssetEvent(merchantAssets, {
          asset_id: `asset_${merchant.id}_merchant_operations`,
          owner_id: merchant.id,
          role: "merchant" as Role,
          data_type: "merchant_operations",
          created_at: createdForAsset,
        }, {
          order_id: orderId,
          timestamp: readyAtIso,
          grid_id: grid.grid_id,
          event_type: "order_ready",
          prep_time_min: prepTimeMin,
          merchant_category: merchant.category,
          merchant_id: merchant.id,
        });

        const baseRiderAsset = {
          asset_id: `asset_${riderId}_rider_mobility`,
          owner_id: riderId,
          role: "rider" as Role,
          data_type: "rider_mobility" as DataType,
          created_at: createdForAsset,
        };
        pushAssetEvent(riderAssets, baseRiderAsset, {
          order_id: orderId,
          timestamp: acceptedAtIso,
          grid_id: grid.grid_id,
          event_type: "accepted",
          lat: pickupLocation.lat,
          lng: pickupLocation.lng,
          speed_kmh: round(rng.float(8, 28), 1),
          current_orders: currentOrders,
          idle_time_min: idleTimeMin,
          acceptance_rate: acceptanceRate,
          rider_id: riderId,
          pickup_grid: grid.grid_id,
          dropoff_grid: dropoffGrid.grid_id,
        });
        pushAssetEvent(riderAssets, baseRiderAsset, {
          order_id: orderId,
          timestamp: deliveredAtIso,
          grid_id: dropoffGrid.grid_id,
          event_type: "delivered",
          lat: jitterLocation(dropoffGrid.center, rng).lat,
          lng: jitterLocation(dropoffGrid.center, rng).lng,
          speed_kmh: round(rng.float(5, 22), 1),
          current_orders: 0,
          idle_time_min: 0,
          acceptance_rate: acceptanceRate,
          rider_id: riderId,
          pickup_grid: grid.grid_id,
          dropoff_grid: dropoffGrid.grid_id,
          delivery_duration_min: deliveryDurationMin,
        });
      }
    }
  }

  const rawAssets: PersonalDataAsset[] = [
    ...riderAssets.values(),
    ...merchantAssets.values(),
    ...consumerAssets.values(),
  ].map((asset) => ({
    ...asset,
    events: [...asset.events].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
  }));

  const encryptedAssets = rawAssets.map(mockEncrypt);
  const manifest: LicenseManifestEntry[] = encryptedAssets.map((asset) => ({
    asset_id: asset.asset_id,
    owner_id: asset.owner_id,
    role: asset.role,
    data_type: asset.data_type,
    blob_id: asset.blob_id,
    key_id: asset.key_id,
    path: manifestPath(asset.data_type, asset.asset_id),
  }));

  return {
    rawAssets,
    encryptedAssets,
    manifest,
    summary: {
      generated_at: iso(Date.now()),
      start_time: iso(START_TIME),
      days: SIMULATION_DAYS,
      window_minutes: WINDOW_MINUTES,
      grids: grids.length,
      grid_time_rows_expected: windowCount * grids.length,
      total_orders: orderNumber - 1,
      assets: {
        rider_mobility: riderAssets.size,
        merchant_operations: merchantAssets.size,
        consumer_demand: consumerAssets.size,
      },
    },
  };
};
