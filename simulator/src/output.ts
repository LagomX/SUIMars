import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DataPackage, OrderEvent, Summary } from "./types";

const writeJson = async (filePath: string, data: unknown): Promise<void> => {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
};

export const createSummary = (orders: OrderEvent[], packages: DataPackage[]): Summary => {
  const totalDistance = orders.reduce((sum, order) => sum + order.distance_km, 0);
  const totalDeliveryTime = orders.reduce((sum, order) => sum + order.delivery_time_seconds, 0);
  const totalAmount = orders.reduce((sum, order) => sum + order.order_amount_usdc, 0);

  return {
    total_orders: orders.length,
    total_distance_km: Math.round(totalDistance * 1000) / 1000,
    avg_delivery_time_seconds: Math.round(totalDeliveryTime / orders.length),
    avg_order_amount_usdc: Math.round((totalAmount / orders.length) * 100) / 100,
    total_packages: packages.length,
    timestamp: Date.now(),
  };
};

export const writeSimulatorOutput = async (
  orders: OrderEvent[],
  packages: DataPackage[],
  outputDir = path.resolve(process.cwd(), "output"),
): Promise<Summary> => {
  const packagesDir = path.join(outputDir, "packages");
  await mkdir(packagesDir, { recursive: true });

  await writeJson(path.join(outputDir, "all_orders.json"), orders);

  for (const dataPackage of packages) {
    await writeJson(path.join(packagesDir, `${dataPackage.package_id}.json`), dataPackage);
  }

  const summary = createSummary(orders, packages);
  await writeJson(path.join(outputDir, "summary.json"), summary);

  return summary;
};
