export interface GpsPoint {
  lat: number;
  lng: number;
  timestamp: number; // unix ms
}

export interface OrderEvent {
  order_id: string;
  customer_id: string;
  merchant_id: string;
  rider_id: string;
  merchant_location: GpsPoint;
  delivery_location: GpsPoint;
  gps_track: GpsPoint[]; // rider movement, one point every 30 seconds
  order_created_at: number;
  picked_up_at: number;
  delivered_at: number;
  delivery_time_seconds: number;
  distance_km: number;
  order_amount_usdc: number; // 8-25 USDC
  items: OrderItem[];
  confirmations: {
    customer_confirmed: boolean;
    merchant_confirmed: boolean;
    rider_confirmed: boolean;
  };
}

export interface OrderItem {
  name: string;
  price_usdc: number;
  quantity: number;
}

export interface DataPackage {
  package_id: string;
  rider_id: string;
  merchant_id: string;
  orders: OrderEvent[]; // 10 orders per package
  aggregated_metrics: {
    total_distance_km: number;
    avg_delivery_time_seconds: number;
    avg_order_amount_usdc: number;
    peak_hour_distribution: Record<string, number>; // "09": 3, "12": 5 etc
    gps_point_count: number;
  };
  created_at: number;
}

export interface Summary {
  total_orders: number;
  total_distance_km: number;
  avg_delivery_time_seconds: number;
  avg_order_amount_usdc: number;
  total_packages: number;
  timestamp: number;
}
