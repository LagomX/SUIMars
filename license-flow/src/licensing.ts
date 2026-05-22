import { mintLicenses } from "./mock-chain";
import type { DataLicense, Purchase } from "./types";

export const mintDataLicenses = (purchases: Purchase[]): DataLicense[] => mintLicenses(purchases);
