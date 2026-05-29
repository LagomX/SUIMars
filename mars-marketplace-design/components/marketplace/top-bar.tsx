"use client"

import { useCurrentAccount, useConnectWallet, useDisconnectWallet, useWallets } from "@mysten/dapp-kit"
import { Search, Wallet, LogOut } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

interface TopBarProps {
  totalDatasets?: number
  datasetCount?: number
}

export function TopBar({ totalDatasets, datasetCount }: TopBarProps) {
  const account = useCurrentAccount()
  const wallets = useWallets()
  const { mutate: connect } = useConnectWallet()
  const { mutate: disconnect } = useDisconnectWallet()

  const count = totalDatasets ?? datasetCount ?? 0
  const shortAddress = account
    ? `${account.address.slice(0, 6)}...${account.address.slice(-4)}`
    : null

  const handleWalletClick = () => {
    if (account) {
      disconnect()
    } else if (wallets.length > 0) {
      connect({ wallet: wallets[0] })
    }
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-md lg:px-8">
      <div className="flex flex-1 items-center gap-4 pl-12 lg:pl-0">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search datasets..."
            className="h-10 bg-secondary border-0 pl-10 text-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
          <span className="font-medium text-foreground">{count}</span>
          <span>datasets available</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Badge
          variant="secondary"
          className="hidden gap-1.5 border border-border bg-secondary px-2.5 py-1 text-xs font-medium sm:flex"
        >
          <div className="h-1.5 w-1.5 rounded-full bg-accent" />
          Sui Testnet
        </Badge>

        <button
          onClick={handleWalletClick}
          className="flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-sm font-medium transition-colors hover:bg-secondary/80"
        >
          {account ? (
            <>
              <Wallet className="h-4 w-4 text-accent" />
              <span>{shortAddress}</span>
              <LogOut className="h-3 w-3 text-muted-foreground" />
            </>
          ) : (
            <>
              <Wallet className="h-4 w-4 text-muted-foreground" />
              <span>{wallets.length > 0 ? "Connect Wallet" : "No Wallet Found"}</span>
            </>
          )}
        </button>
      </div>
    </header>
  )
}
