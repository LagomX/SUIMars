import { generateOrders, groupIntoPackages } from "./generator";
import { writeSimulatorOutput } from "./output";

const main = async (): Promise<void> => {
  const orders = generateOrders(100);
  const packages = groupIntoPackages(orders, 10);
  const summary = await writeSimulatorOutput(orders, packages);

  console.log("Generated 100 orders");
  console.log("Created 10 data packages");
  console.log("Summary stats");
  console.log(`Total distance: ${summary.total_distance_km} km`);
  console.log(`Average delivery time: ${summary.avg_delivery_time_seconds} seconds`);
  console.log(`Average order amount: ${summary.avg_order_amount_usdc} USDC`);
  console.log(`Timestamp: ${summary.timestamp}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
