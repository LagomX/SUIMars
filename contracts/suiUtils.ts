/**
 * Shared Sui utility helpers for Mars contract scripts.
 *
 * Canonical implementation lives in seal-access/src/signers.ts.
 * Both register_data_assets.ts and prepare_data_license.ts import from here
 * so there is a single source of truth for keystore loading and package-id parsing.
 */

import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

// ─── Keystore / signer helpers ────────────────────────────────────────────────

export const activeSuiConfig = async (): Promise<{
  activeAddress: string;
  keystorePath: string;
}> => {
  const clientYamlPath = path.join(os.homedir(), ".sui", "sui_config", "client.yaml");
  const yaml = await readFile(clientYamlPath, "utf8");
  const activeAddress = yaml.match(/active_address:\s*"?([^"\n]+)"?/)?.[1]?.trim();
  const keystorePath =
    yaml.match(/keystore:\s*\n\s*File:\s*([^\n]+)/)?.[1]?.trim() ??
    path.join(os.homedir(), ".sui", "sui_config", "sui.keystore");

  if (!activeAddress?.startsWith("0x")) {
    throw new Error(`Could not find active_address in ${clientYamlPath}`);
  }

  return {
    activeAddress: activeAddress.toLowerCase(),
    keystorePath: keystorePath.replace(/^~/, os.homedir()),
  };
};

export const signerFromPrivateKey = (privateKey: string): Ed25519Keypair => {
  const decoded = decodeSuiPrivateKey(privateKey);
  if (decoded.scheme !== "ED25519") {
    throw new Error(`Only ED25519 private keys are supported, got ${decoded.scheme}`);
  }
  return Ed25519Keypair.fromSecretKey(decoded.secretKey);
};

export const signerFromSuiKeystore = async (): Promise<Ed25519Keypair> => {
  const { activeAddress, keystorePath } = await activeSuiConfig();
  const keys = JSON.parse(await readFile(keystorePath, "utf8")) as string[];

  for (const encoded of keys) {
    const bytes = Buffer.from(encoded, "base64");
    if (bytes[0] !== 0) {
      continue; // skip non-ED25519 scheme bytes
    }
    const keypair = Ed25519Keypair.fromSecretKey(bytes.subarray(1));
    if (keypair.getPublicKey().toSuiAddress().toLowerCase() === activeAddress) {
      return keypair;
    }
  }

  throw new Error(`Could not find the active ED25519 Sui address in ${keystorePath}`);
};

export const loadSigner = async (privateKey?: string): Promise<Ed25519Keypair> =>
  privateKey ? signerFromPrivateKey(privateKey) : signerFromSuiKeystore();

// ─── Package ID helpers ───────────────────────────────────────────────────────

/**
 * Read the published package ID from PACKAGE_ID env var or Published.toml.
 * @param contractsRoot  Absolute path to the contracts/ directory.
 */
export const parsePublishedPackageId = async (contractsRoot: string): Promise<string> => {
  const envId = process.env.PACKAGE_ID;
  if (envId?.startsWith("0x")) {
    return envId;
  }

  const tomlPath = path.join(contractsRoot, "mars", "Published.toml");
  const toml = await readFile(tomlPath, "utf8");
  const section = toml.match(/\[published\.testnet\]([\s\S]*?)(?:\n\[|$)/)?.[1];
  const packageId = section?.match(/published-at\s*=\s*"([^"]+)"/)?.[1];

  if (!packageId?.startsWith("0x")) {
    throw new Error(
      "PACKAGE_ID is unset and contracts/mars/Published.toml has no published.testnet package id",
    );
  }
  return packageId;
};
