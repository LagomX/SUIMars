import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AccessResult, RejectedAccessAttempt } from "./types";

export const OUTPUT_DIR = path.resolve(process.cwd(), "output");

const writeJson = async (filePath: string, data: unknown): Promise<void> => {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
};

export const resetOutputDir = async (): Promise<void> => {
  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(OUTPUT_DIR, { recursive: true });
};

export const writeSealOutputs = async (
  accessResults: AccessResult[],
  rejectedAccessAttempts: RejectedAccessAttempt[],
): Promise<void> => {
  await writeJson(path.join(OUTPUT_DIR, "access_results.json"), accessResults);
  await writeJson(path.join(OUTPUT_DIR, "rejected_access_attempts.json"), rejectedAccessAttempts);
};
