/**
 * Seal-access signer helpers.
 *
 * The keystore-parsing logic (activeSuiConfig / signerFromSuiKeystore) is also
 * present in contracts/suiUtils.ts (canonical) and
 * walrus-uploader/src/suiSealRegistration.ts — each lives in a separate npm
 * package so sharing requires a dedicated workspace package.  If you change
 * the parsing behaviour here, apply the same change to both other copies.
 */

import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { config } from "./config.js";

type SimulatorUser = {
  user_id: string;
  sui_address: string;
  private_key: string;
};

const readJson = async <T>(filePath: string): Promise<T> =>
  JSON.parse(await readFile(filePath, "utf8")) as T;

const signerFromPrivateKey = (privateKey: string): Ed25519Keypair => {
  const decoded = decodeSuiPrivateKey(privateKey);
  if (decoded.scheme !== "ED25519") {
    throw new Error(`Only ED25519 private keys are supported, got ${decoded.scheme}`);
  }
  return Ed25519Keypair.fromSecretKey(decoded.secretKey);
};

const activeSuiConfig = async (): Promise<{ activeAddress: string; keystorePath: string }> => {
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

export const signerFromSuiKeystore = async (): Promise<Ed25519Keypair> => {
  const { activeAddress, keystorePath } = await activeSuiConfig();
  const keys = await readJson<string[]>(keystorePath);

  for (const encoded of keys) {
    const bytes = Buffer.from(encoded, "base64");
    if (bytes[0] !== 0) {
      continue;
    }
    const keypair = Ed25519Keypair.fromSecretKey(bytes.subarray(1));
    if (keypair.getPublicKey().toSuiAddress().toLowerCase() === activeAddress) {
      return keypair;
    }
  }

  throw new Error(`Could not find the active ED25519 Sui address in ${keystorePath}`);
};

export const loadLicensedBuyerSigner = async (): Promise<Ed25519Keypair> => {
  if (config.buyerPrivateKey) {
    return signerFromPrivateKey(config.buyerPrivateKey);
  }
  return signerFromSuiKeystore();
};

export const loadUnlicensedSimulatorSigner = async (): Promise<Ed25519Keypair> => {
  const users = await readJson<SimulatorUser[]>(config.simulatorUsersPath);
  const candidate = users.find((user) => user.private_key && user.sui_address?.startsWith("0x"));
  if (!candidate) {
    throw new Error(`No simulator user with private_key found in ${config.simulatorUsersPath}`);
  }
  return signerFromPrivateKey(candidate.private_key);
};
