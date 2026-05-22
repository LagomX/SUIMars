import { Connection, clusterApiUrl } from '@solana/web3.js';

// 在 .env 里设置 EXPO_PUBLIC_SOLANA_RPC_URL 可以切换 RPC
// 默认使用 devnet
const rpcUrl =
  process.env.EXPO_PUBLIC_SOLANA_RPC_URL ?? clusterApiUrl('devnet');

export const connection = new Connection(rpcUrl, 'confirmed');
