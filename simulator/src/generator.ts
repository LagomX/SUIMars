import type {
  ConsumerEvent,
  DataType,
  Grid,
  Location,
  MerchantEvent,
  OrderRecord,
  PersonalDataAsset,
  RiderEvent,
  Role,
  SimulationResult,
  SimulatedUser,
} from "./types";
import { readFile } from "node:fs/promises";
import path from "node:path";

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const WINDOW_MINUTES = 15;
const SIMULATION_DAYS = 7;
const START_TIME = Date.UTC(2026, 4, 26, 0, 0, 0);
const GRID_ROWS = ["A", "B", "C", "D"] as const;
const GRID_COLS = [1, 2, 3, 4] as const;
const MERCHANT_CATEGORIES = ["fast_food", "coffee", "grocery", "sushi", "pizza", "dessert"] as const;

interface MerchantProfile extends SimulatedUser {
  grid: Grid;
  category: string;
}

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

const assertContributorWeights = (asset: Omit<PersonalDataAsset, "events">): void => {
  const total = asset.contributors.reduce((sum, contributor) => sum + contributor.weight_bps, 0);
  if (total !== 10000) {
    throw new Error(`Contributor weights for ${asset.asset_id} must total 10000, got ${total}`);
  }
};

const createSingleOwnerAsset = (
  owner: SimulatedUser,
  dataType: DataType,
  createdAt: string,
): Omit<PersonalDataAsset, "events"> => {
  const asset = {
    asset_id: `asset_${owner.user_id}_${dataType}`,
    owner_id: owner.user_id,
    owner: owner.sui_address,
    role: owner.role,
    data_type: dataType,
    contributors: [
      {
        addr: owner.sui_address,
        role: owner.role,
        weight_bps: 10000,
      },
    ],
    created_at: createdAt,
  };
  assertContributorWeights(asset);
  return asset;
};

const loadGeneratedUsers = async (usersPath = path.resolve(process.cwd(), "users", "all_users.json")): Promise<SimulatedUser[]> => {
  try {
    return JSON.parse(await readFile(usersPath, "utf8")) as SimulatedUser[];
  } catch {
    throw new Error(`Missing generated Sui testnet users at ${usersPath}. Run: pnpm simulator:wallets`);
  }
};

const usersByRole = (users: SimulatedUser[], role: Role): SimulatedUser[] =>
  users.filter((user) => user.role === role);

export const generateSimulation = async (seed = 42): Promise<SimulationResult> => {
  const rng = new SeededRandom(seed);
  const grids = createGrids();
  const users = await loadGeneratedUsers();
  const riders = usersByRole(users, "rider");
  const consumers = usersByRole(users, "consumer");
  const merchants: MerchantProfile[] = usersByRole(users, "merchant").map((merchant, index) => ({
    ...merchant,
    grid: grids[index % grids.length],
    category: MERCHANT_CATEGORIES[index % MERCHANT_CATEGORIES.length],
  }));

  if (riders.length === 0 || merchants.length === 0 || consumers.length === 0) {
    throw new Error("Generated users must include riders, merchants, and consumers.");
  }

  const riderAssets = new Map<string, PersonalDataAsset<RiderEvent>>();
  const merchantAssets = new Map<string, PersonalDataAsset<MerchantEvent>>();
  const consumerAssets = new Map<string, PersonalDataAsset<ConsumerEvent>>();
  const orders: OrderRecord[] = [];

  let orderNumber = 1;
  const windowCount = SIMULATION_DAYS * 24 * (60 / WINDOW_MINUTES);

  for (let windowIndex = 0; windowIndex < windowCount; windowIndex += 1) {
    const windowStart = START_TIME + windowIndex * WINDOW_MINUTES * MINUTE_MS;

    for (const grid of grids) {
      const orderCount = sampleOrderCount(rng, demandIntensity(grid, windowStart));

      for (let i = 0; i < orderCount; i += 1) {
        const createdAt = windowStart + rng.int(0, WINDOW_MINUTES - 1) * MINUTE_MS;
        const merchant = rng.pick(merchants.filter((candidate) => candidate.grid.grid_id === grid.grid_id));
        const rider = rng.pick(riders);
        const consumer = rng.pick(consumers);
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

        orders.push({
          order_id: orderId,
          consumer_id: consumer.user_id,
          consumer_address: consumer.sui_address,
          merchant_id: merchant.user_id,
          merchant_address: merchant.sui_address,
          rider_id: rider.user_id,
          rider_address: rider.sui_address,
          pickup_grid: grid.grid_id,
          dropoff_grid: dropoffGrid.grid_id,
          created_at: createdAtIso,
        });

        pushAssetEvent(consumerAssets, createSingleOwnerAsset(consumer, "consumer_behavior", createdForAsset), {
          order_id: orderId,
          timestamp: createdAtIso,
          grid_id: grid.grid_id,
          event_type: "order_created",
          order_value: round(rng.float(11, 64), 2),
          merchant_category: merchant.category,
          consumer_id: consumer.user_id,
          pickup_grid: grid.grid_id,
          dropoff_grid: dropoffGrid.grid_id,
        });

        pushAssetEvent(merchantAssets, createSingleOwnerAsset(merchant, "merchant_operations", createdForAsset), {
          order_id: orderId,
          timestamp: readyAtIso,
          grid_id: grid.grid_id,
          event_type: "order_ready",
          prep_time_min: prepTimeMin,
          merchant_category: merchant.category,
          merchant_id: merchant.user_id,
        });

        const baseRiderAsset = createSingleOwnerAsset(rider, "rider_mobility", createdForAsset);
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
          rider_id: rider.user_id,
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
          rider_id: rider.user_id,
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

  return {
    orders,
    rawAssets,
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
        consumer_behavior: consumerAssets.size,
      },
    },
  };
};
