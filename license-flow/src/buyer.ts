import { simulatePurchases } from "./mock-chain";
import type { ListedAsset, Purchase } from "./types";

export const runBuyerSimulation = (listings: ListedAsset[]): Purchase[] => simulatePurchases(listings);
