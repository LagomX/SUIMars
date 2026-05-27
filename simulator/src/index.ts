import { generateSimulation } from "./generator";
import { writeSimulatorOutput } from "./output";

const main = async (): Promise<void> => {
  const simulation = generateSimulation(42);
  await writeSimulatorOutput(simulation);

  console.log("Mars simulator generated personal raw DataAssets");
  console.log(`Orders: ${simulation.summary.total_orders}`);
  console.log(`Order records include Sui owner addresses`);
  console.log(`Expected grid-time rows after aggregation: ${simulation.summary.grid_time_rows_expected}`);
  console.log(`Rider assets: ${simulation.summary.assets.rider_mobility}`);
  console.log(`Merchant assets: ${simulation.summary.assets.merchant_operations}`);
  console.log(`Consumer assets: ${simulation.summary.assets.consumer_demand}`);
  console.log("Output: simulator/output");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
