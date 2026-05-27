export type Role = "rider" | "merchant" | "consumer";
export type DataType = "rider_mobility" | "merchant_operations" | "consumer_demand";

export interface Location {
  lat: number;
  lng: number;
}

export interface Grid {
  grid_id: string;
  row: number;
  col: number;
  center: Location;
}

export interface RiderEvent {
  order_id: string;
  timestamp: string;
  grid_id: string;
  event_type: "accepted" | "picked_up" | "delivered";
  lat: number;
  lng: number;
  speed_kmh: number;
  current_orders: number;
  idle_time_min: number;
  acceptance_rate: number;
  rider_id: string;
  pickup_grid: string;
  dropoff_grid: string;
  delivery_duration_min?: number;
}

export interface MerchantEvent {
  order_id: string;
  timestamp: string;
  grid_id: string;
  event_type: "order_ready";
  prep_time_min: number;
  merchant_category: string;
  merchant_id: string;
}

export interface ConsumerEvent {
  order_id: string;
  timestamp: string;
  grid_id: string;
  event_type: "order_created";
  order_value: number;
  merchant_category: string;
  consumer_id: string;
  pickup_grid: string;
  dropoff_grid: string;
}

export type PersonalEvent = RiderEvent | MerchantEvent | ConsumerEvent;

export interface PersonalDataAsset<TEvent extends PersonalEvent = PersonalEvent> {
  asset_id: string;
  owner_id: string;
  role: Role;
  data_type: DataType;
  events: TEvent[];
  created_at: string;
}

export interface EncryptedAssetEnvelope {
  asset_id: string;
  owner_id: string;
  role: Role;
  data_type: DataType;
  blob_id: string;
  key_id: string;
  ciphertext_base64: string;
  encryption: "mock-base64";
  created_at: string;
}

export interface LicenseManifestEntry {
  asset_id: string;
  owner_id: string;
  role: Role;
  data_type: DataType;
  blob_id: string;
  key_id: string;
  path: string;
}

export interface SimulationResult {
  rawAssets: PersonalDataAsset[];
  encryptedAssets: EncryptedAssetEnvelope[];
  manifest: LicenseManifestEntry[];
  summary: SimulationSummary;
}

export interface SimulationSummary {
  generated_at: string;
  start_time: string;
  days: number;
  window_minutes: number;
  grids: number;
  grid_time_rows_expected: number;
  total_orders: number;
  assets: {
    rider_mobility: number;
    merchant_operations: number;
    consumer_demand: number;
  };
}
