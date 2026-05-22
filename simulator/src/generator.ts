import { v5 as uuidv5 } from "uuid";
import type { DataPackage, GpsPoint, OrderEvent, OrderItem } from "./types";

const UUID_NAMESPACE = "7f4f87f8-675d-4a17-82f2-2c20a64a85bf";
const EARTH_RADIUS_KM = 6371;
const MS_PER_MINUTE = 60_000;
const GPS_INTERVAL_SECONDS = 30;

const MERCHANTS = [
  { id: "merchant_01", location: { lat: 34.0522, lng: -118.2437 } }, // Downtown LA
  { id: "merchant_02", location: { lat: 34.0195, lng: -118.4912 } }, // Santa Monica
  { id: "merchant_03", location: { lat: 34.0674, lng: -118.3990 } }, // West Hollywood
] as const;

const RIDERS = ["rider_01", "rider_02", "rider_03"] as const;
const CUSTOMERS = ["customer_01", "customer_02", "customer_03", "customer_04", "customer_05"] as const;
const ITEM_NAMES = ["Burger", "Pizza", "Sushi", "Tacos", "Pasta", "Salad", "Ramen", "Sandwich"] as const;

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

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
const toDegrees = (radians: number): number => (radians * 180) / Math.PI;

const assertValidPoint = (point: GpsPoint): void => {
  if (
    !Number.isFinite(point.lat) ||
    !Number.isFinite(point.lng) ||
    point.lat < -90 ||
    point.lat > 90 ||
    point.lng < -180 ||
    point.lng > 180
  ) {
    throw new Error(`Invalid GPS point: ${JSON.stringify(point)}`);
  }
};

export const distanceKm = (a: Pick<GpsPoint, "lat" | "lng">, b: Pick<GpsPoint, "lat" | "lng">): number => {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const destinationPoint = (
  origin: Pick<GpsPoint, "lat" | "lng">,
  distance: number,
  bearing: number,
): Pick<GpsPoint, "lat" | "lng"> => {
  const angularDistance = distance / EARTH_RADIUS_KM;
  const bearingRad = toRadians(bearing);
  const lat1 = toRadians(origin.lat);
  const lng1 = toRadians(origin.lng);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearingRad),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
    );

  return {
    lat: round(toDegrees(lat2), 6),
    lng: round(((toDegrees(lng2) + 540) % 360) - 180, 6),
  };
};

const createGpsPoint = (point: Pick<GpsPoint, "lat" | "lng">, timestamp: number): GpsPoint => {
  const gpsPoint = {
    lat: round(point.lat, 6),
    lng: round(point.lng, 6),
    timestamp,
  };
  assertValidPoint(gpsPoint);
  return gpsPoint;
};

const generateDeliveryLocation = (
  merchantLocation: Pick<GpsPoint, "lat" | "lng">,
  rng: SeededRandom,
): Pick<GpsPoint, "lat" | "lng"> => {
  const radiusKm = rng.float(3, 5);
  const bearing = rng.float(0, 360);
  return destinationPoint(merchantLocation, radiusKm, bearing);
};

const generateGpsTrack = (
  merchantLocation: Pick<GpsPoint, "lat" | "lng">,
  deliveryLocation: Pick<GpsPoint, "lat" | "lng">,
  pickedUpAt: number,
  deliveryTimeSeconds: number,
  rng: SeededRandom,
): GpsPoint[] => {
  const pointCount = Math.max(2, deliveryTimeSeconds / GPS_INTERVAL_SECONDS);
  const points: GpsPoint[] = [];

  for (let i = 0; i < pointCount; i += 1) {
    const progress = pointCount === 1 ? 1 : i / (pointCount - 1);
    const isEndpoint = i === 0 || i === pointCount - 1;
    const latNoise = isEndpoint ? 0 : rng.float(-0.001, 0.001);
    const lngNoise = isEndpoint ? 0 : rng.float(-0.001, 0.001);

    points.push(
      createGpsPoint(
        {
          lat: merchantLocation.lat + (deliveryLocation.lat - merchantLocation.lat) * progress + latNoise,
          lng: merchantLocation.lng + (deliveryLocation.lng - merchantLocation.lng) * progress + lngNoise,
        },
        pickedUpAt + i * GPS_INTERVAL_SECONDS * 1000,
      ),
    );
  }

  return points;
};

const generateItems = (rng: SeededRandom): OrderItem[] => {
  const count = rng.int(1, 3);
  const available = [...ITEM_NAMES];
  const items: OrderItem[] = [];

  for (let i = 0; i < count; i += 1) {
    const itemIndex = rng.int(0, available.length - 1);
    const [name] = available.splice(itemIndex, 1);
    items.push({
      name,
      price_usdc: round(rng.float(5, 15), 2),
      quantity: rng.int(1, 2),
    });
  }

  return items;
};

const createOrderAmount = (items: OrderItem[], rng: SeededRandom): number => {
  const itemTotal = items.reduce((sum, item) => sum + item.price_usdc * item.quantity, 0);
  return round(Math.min(25, Math.max(8, itemTotal + rng.float(0.75, 2.5))), 2);
};

export const generateOrders = (count = 100, seed = 42): OrderEvent[] => {
  const rng = new SeededRandom(seed);
  const orders: OrderEvent[] = [];
  const baseTimestamp = Date.UTC(2026, 4, 21, 8, 0, 0);

  for (let i = 0; i < count; i += 1) {
    const packageIndex = Math.floor(i / 10);
    const merchant = MERCHANTS[packageIndex % MERCHANTS.length];
    const riderId = RIDERS[packageIndex % RIDERS.length];
    const customerId = CUSTOMERS[i % CUSTOMERS.length];
    const deliveryLocation = generateDeliveryLocation(merchant.location, rng);
    const distance = distanceKm(merchant.location, deliveryLocation);
    const rawDeliverySeconds = rng.int(600, 1200) + distance * 180 + rng.int(-120, 120);
    const deliveryTimeSeconds = Math.max(600, Math.round(rawDeliverySeconds / GPS_INTERVAL_SECONDS) * GPS_INTERVAL_SECONDS);
    const orderCreatedAt = baseTimestamp + i * 17 * MS_PER_MINUTE + rng.int(0, 6) * MS_PER_MINUTE;
    const pickedUpAt = orderCreatedAt + rng.int(8, 18) * MS_PER_MINUTE;
    const deliveredAt = pickedUpAt + deliveryTimeSeconds * 1000;
    const items = generateItems(rng);

    const merchantLocation = createGpsPoint(merchant.location, orderCreatedAt);
    const deliveryGpsPoint = createGpsPoint(deliveryLocation, deliveredAt);
    const gpsTrack = generateGpsTrack(merchant.location, deliveryLocation, pickedUpAt, deliveryTimeSeconds, rng);

    orders.push({
      order_id: `order_${String(i + 1).padStart(3, "0")}_${uuidv5(`order-${i + 1}`, UUID_NAMESPACE)}`,
      customer_id: customerId,
      merchant_id: merchant.id,
      rider_id: riderId,
      merchant_location: merchantLocation,
      delivery_location: deliveryGpsPoint,
      gps_track: gpsTrack,
      order_created_at: orderCreatedAt,
      picked_up_at: pickedUpAt,
      delivered_at: deliveredAt,
      delivery_time_seconds: deliveryTimeSeconds,
      distance_km: round(distance, 3),
      order_amount_usdc: createOrderAmount(items, rng),
      items,
      confirmations: {
        customer_confirmed: true,
        merchant_confirmed: true,
        rider_confirmed: true,
      },
    });
  }

  return orders;
};

const packageMetrics = (orders: OrderEvent[]): DataPackage["aggregated_metrics"] => {
  const totalDistance = orders.reduce((sum, order) => sum + order.distance_km, 0);
  const totalDeliveryTime = orders.reduce((sum, order) => sum + order.delivery_time_seconds, 0);
  const totalAmount = orders.reduce((sum, order) => sum + order.order_amount_usdc, 0);
  const gpsPointCount = orders.reduce((sum, order) => sum + order.gps_track.length, 0);
  const peakHourDistribution: Record<string, number> = {};

  for (const order of orders) {
    const hour = new Date(order.order_created_at).getUTCHours().toString().padStart(2, "0");
    peakHourDistribution[hour] = (peakHourDistribution[hour] ?? 0) + 1;
  }

  return {
    total_distance_km: round(totalDistance, 3),
    avg_delivery_time_seconds: Math.round(totalDeliveryTime / orders.length),
    avg_order_amount_usdc: round(totalAmount / orders.length, 2),
    peak_hour_distribution: peakHourDistribution,
    gps_point_count: gpsPointCount,
  };
};

export const groupIntoPackages = (orders: OrderEvent[], packageSize = 10): DataPackage[] => {
  const packages: DataPackage[] = [];

  for (let start = 0; start < orders.length; start += packageSize) {
    const packageOrders = orders.slice(start, start + packageSize);
    const firstOrder = packageOrders[0];
    const packageNumber = packages.length + 1;

    packages.push({
      package_id: `package_${String(packageNumber).padStart(2, "0")}`,
      rider_id: firstOrder.rider_id,
      merchant_id: firstOrder.merchant_id,
      orders: packageOrders,
      aggregated_metrics: packageMetrics(packageOrders),
      created_at: Math.max(...packageOrders.map((order) => order.delivered_at)) + MS_PER_MINUTE,
    });
  }

  return packages;
};
