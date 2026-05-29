"use client"

import { SuiClientProvider, WalletProvider } from "@mysten/dapp-kit"
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

const testnetClient = new SuiJsonRpcClient({
  url: "https://fullnode.testnet.sui.io:443",
  network: "testnet",
})

const networks = { testnet: testnetClient } as const

const queryClient = new QueryClient()

export function SuiProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networks} defaultNetwork="testnet">
        <WalletProvider autoConnect>{children}</WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  )
}
