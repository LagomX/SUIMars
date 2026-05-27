import { SealClient, SessionKey } from "@mysten/seal";
import type { KeyServerConfig, SealCompatibleClient } from "@mysten/seal";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Transaction } from "@mysten/sui/transactions";
import { fromHex } from "@mysten/sui/utils";
import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { config } from "./config.js";
import type {
  DataLicenseRegistryRecord,
  SealKeyRegistryRecord,
} from "./types.js";

export const createSuiClient = (): SealCompatibleClient =>
  new SuiGrpcClient({
    network: "testnet",
    baseUrl: config.suiRpcUrl,
  } as ConstructorParameters<typeof SuiGrpcClient>[0]) as SealCompatibleClient;

export const keyServerConfigs = (): KeyServerConfig[] => [
  {
    objectId: config.sealKeyServerObjectId,
    aggregatorUrl: config.sealAggregatorUrl,
    weight: 1,
  },
];

export const createSealClient = (suiClient: SealCompatibleClient): SealClient =>
  new SealClient({
    suiClient,
    serverConfigs: keyServerConfigs(),
    verifyKeyServers: config.sealVerifyKeyServers,
  });

export const requestDecryptKey = async (
  sealedKey: SealKeyRegistryRecord,
  license: DataLicenseRegistryRecord,
  buyerSigner: Ed25519Keypair,
): Promise<Buffer> => {
  const buyer = buyerSigner.getPublicKey().toSuiAddress();

  const suiClient = createSuiClient();
  const sealClient = createSealClient(suiClient);

  const sessionKey = await SessionKey.create({
    address: buyer,
    packageId: sealedKey.package_id,
    ttlMin: 10,
    signer: buyerSigner,
    suiClient,
  });
  const { signature } = await buyerSigner.signPersonalMessage(sessionKey.getPersonalMessage());
  await sessionKey.setPersonalMessageSignature(signature);

  const tx = new Transaction();
  tx.setSender(buyer);
  tx.moveCall({
    target: `${sealedKey.move_package_id ?? sealedKey.package_id}::data_license::seal_approve`,
    arguments: [
      tx.pure.vector("u8", Array.from(fromHex(sealedKey.data_asset_id))),
      tx.object(license.data_license_id),
      tx.object(sealedKey.data_asset_id),
    ],
  });
  const txBytes = await tx.build({ client: suiClient, onlyTransactionKind: true });

  const decrypted = await sealClient.decrypt({
    data: Buffer.from(sealedKey.encrypted_key_b64, "base64"),
    sessionKey,
    txBytes,
  });

  const aesKey = Buffer.from(decrypted);
  if (aesKey.length !== 32) {
    throw new Error(`Seal returned ${aesKey.length} key bytes, expected 32`);
  }
  return aesKey;
};
