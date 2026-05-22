import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import * as ExpoCrypto from 'expo-crypto';

import { connection } from './solana';

export const PROGRAM_ID = new PublicKey(
  'FNd1E86zipKPhPLQNAFCUDXefH1Hjjc8AKGHwkFjuNVx',
);

export type OnChainRole = 'customer' | 'merchant' | 'rider';

const ROLE_MAP: Readonly<Record<number, OnChainRole>> = {
  0: 'customer',
  1: 'merchant',
  2: 'rider',
};

const ROLE_INDEX: Record<OnChainRole, 0 | 1 | 2> = {
  customer: 0,
  merchant: 1,
  rider: 2,
};

// NodeIdentity account 内存布局（Anchor）:
//  [0..8]   discriminator  — 8 bytes
//  [8..40]  wallet pubkey  — 32 bytes
//  [40]     role           — 1 byte
//  [41]     bump           — 1 byte
const ROLE_BYTE_OFFSET = 40;
export const MIN_IDENTITY_BALANCE_LAMPORTS = 10_000_000;

export function deriveIdentityPDA(walletAddress: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('identity'), new PublicKey(walletAddress).toBuffer()],
    PROGRAM_ID,
  );
}

export async function getUserRole(
  walletAddress: string,
): Promise<OnChainRole | null> {
  try {
    const [pda] = deriveIdentityPDA(walletAddress);
    const accountInfo = await connection.getAccountInfo(pda);
    if (!accountInfo) return null;
    const roleIndex = (accountInfo.data as Buffer).readUInt8(ROLE_BYTE_OFFSET);
    return ROLE_MAP[roleIndex] ?? null;
  } catch {
    return null;
  }
}

export async function getWalletBalance(walletAddress: string): Promise<number> {
  return connection.getBalance(new PublicKey(walletAddress));
}

// Privy embedded wallet provider 的最小接口
export interface SolanaProvider {
  request(args: {
    method: 'signAndSendTransaction';
    params: {
      transaction: Transaction;
      connection: Connection;
    };
  }): Promise<{ signature: string }>;
}

// 在链上为新用户创建 NodeIdentity 账户，绑定 wallet + role
// 每个 wallet 只能调用一次（PDA init，重复调用会报错）
export async function registerIdentity(
  walletAddress: string,
  role: OnChainRole,
  provider: SolanaProvider,
): Promise<void> {
  const walletKey = new PublicKey(walletAddress);

  const [identityPDA] = deriveIdentityPDA(walletAddress);

  // Anchor 指令 discriminator = SHA256("global:create_identity") 的前 8 字节
  const hashHex = await ExpoCrypto.digestStringAsync(
    ExpoCrypto.CryptoDigestAlgorithm.SHA256,
    'global:create_identity',
    { encoding: ExpoCrypto.CryptoEncoding.HEX },
  );
  const data = Buffer.concat([
    Buffer.from(hashHex.slice(0, 16), 'hex'),
    Buffer.from([ROLE_INDEX[role]]),
  ]);

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: identityPDA, isSigner: false, isWritable: true },
      { pubkey: walletKey,   isSigner: true,  isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const tx = new Transaction();
  tx.add(ix);
  tx.feePayer = walletKey;
  tx.recentBlockhash = blockhash;

  const { signature: sig } = await provider.request({
    method: 'signAndSendTransaction',
    params: {
      transaction: tx,
      connection,
    },
  });
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
}

export async function transferSol(
  fromWalletAddress: string,
  toWalletAddress: string,
  lamports: number,
  provider: SolanaProvider,
): Promise<string> {
  const fromWalletKey = new PublicKey(fromWalletAddress);
  const toWalletKey = new PublicKey(toWalletAddress);

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const tx = new Transaction();
  tx.add(
    SystemProgram.transfer({
      fromPubkey: fromWalletKey,
      toPubkey: toWalletKey,
      lamports,
    }),
  );
  tx.feePayer = fromWalletKey;
  tx.recentBlockhash = blockhash;

  const { signature } = await provider.request({
    method: 'signAndSendTransaction',
    params: {
      transaction: tx,
      connection,
    },
  });
  await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    'confirmed',
  );

  return signature;
}
