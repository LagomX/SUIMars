"use client"

import { useState, useCallback, useEffect } from "react"
import { Check, Loader2, Shield, AlertCircle, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  useCurrentAccount,
  useSuiClient,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit"
import { Transaction } from "@mysten/sui/transactions"
import {
  MARS_PACKAGE_ID,
  USDC_COIN_TYPE,
  SUI_CLOCK_OBJECT_ID,
} from "@/lib/sui-config"
import type { DatasetAsset } from "@/lib/sample-datasets"

interface PurchaseModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  datasetName: string
  assets: DatasetAsset[]
  onPurchaseComplete: () => void
}

type PurchaseStep = "idle" | "purchasing" | "confirming" | "done" | "error"

const STEPS = [
  { id: "purchasing", label: "Building batch PTB on Sui..." },
  { id: "confirming", label: "Confirming DataLicenses on-chain..." },
  { id: "done",       label: "DataLicenses minted — Seal access ready" },
] as const

const STEP_ORDER: PurchaseStep[] = ["purchasing", "confirming", "done"]

function stepIndex(step: PurchaseStep): number {
  return STEP_ORDER.indexOf(step)
}

export function PurchaseModal({
  open,
  onOpenChange,
  datasetName,
  assets,
  onPurchaseComplete,
}: PurchaseModalProps) {
  const account = useCurrentAccount()
  const suiClient = useSuiClient()
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction()

  const [step, setStep] = useState<PurchaseStep>("idle")
  const [txDigest, setTxDigest] = useState("")
  const [licenseCount, setLicenseCount] = useState(0)
  const [error, setError] = useState("")

  const totalMicroUsdc = assets.reduce((sum, a) => sum + a.priceMicroUsdc, 0)
  const totalUsdc = totalMicroUsdc / 1_000_000

  const resetState = useCallback(() => {
    setStep("idle")
    setTxDigest("")
    setLicenseCount(0)
    setError("")
  }, [])

  useEffect(() => {
    if (!open) resetState()
  }, [open, resetState])

  const handlePurchase = async () => {
    if (!account) {
      setError("Please connect your wallet using the button in the top bar.")
      setStep("error")
      return
    }
    if (assets.length === 0) {
      setError("No DataAssets found for this dataset.")
      setStep("error")
      return
    }
    if (!totalMicroUsdc) {
      setError("This dataset does not have prices set on-chain yet.")
      setStep("error")
      return
    }

    try {
      setStep("purchasing")

      const coins = await suiClient.getCoins({ owner: account.address, coinType: USDC_COIN_TYPE })
      if (!coins.data.length) {
        throw new Error(
          `No TestUSDC in wallet. Contact the Mars team to receive test tokens for ` +
            `${account.address.slice(0, 10)}...`,
        )
      }

      // One PTB with N purchase_access calls — one signature, N DataLicenses
      const tx = new Transaction()
      const usdcCoin = tx.object(coins.data[0].coinObjectId)

      for (const asset of assets) {
        const [payment] = tx.splitCoins(usdcCoin, [tx.pure.u64(asset.priceMicroUsdc)])
        tx.moveCall({
          target: `${MARS_PACKAGE_ID}::data_license::purchase_access`,
          arguments: [tx.object(asset.dataAssetObjectId), payment, tx.object(SUI_CLOCK_OBJECT_ID)],
        })
      }

      const { digest } = await signAndExecute({ transaction: tx })
      setTxDigest(digest)

      setStep("confirming")

      const txResult = await suiClient.waitForTransaction({
        digest,
        options: { showObjectChanges: true },
      })

      const licenses = txResult.objectChanges?.filter(
        c =>
          c.type === "created" &&
          (c as { objectType: string }).objectType === `${MARS_PACKAGE_ID}::data_license::DataLicense`,
      ) ?? []
      setLicenseCount(licenses.length)

      setStep("done")
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transaction failed"
      setError(msg.toLowerCase().includes("reject") ? "Transaction rejected by wallet." : msg)
      setStep("error")
    }
  }

  const currentIndex = stepIndex(step)
  const isProcessing = currentIndex >= 0 && step !== "idle" && step !== "error"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            {step === "idle"
              ? "Purchase Dataset"
              : step === "error"
                ? "Purchase Failed"
                : "Processing Transaction"}
          </DialogTitle>
        </DialogHeader>

        {step === "idle" && (
          <div className="space-y-6 py-4">
            <div className="rounded-lg border border-border bg-secondary/30 p-4">
              <p className="text-sm font-medium text-foreground">{datasetName}</p>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-2xl font-bold">
                  {totalUsdc < 1 ? totalUsdc.toFixed(4) : totalUsdc.toLocaleString()}
                </span>
                <span className="text-sm text-muted-foreground">USDC</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {assets.length} DataLicense{assets.length !== 1 ? "s" : ""} · {totalMicroUsdc.toLocaleString()} µUSDC total
              </p>
              {!account && (
                <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Wallet className="h-3 w-3" />
                  Connect your Sui wallet in the top bar to purchase
                </p>
              )}
            </div>

            <Button
              className="w-full bg-foreground text-background hover:bg-foreground/90"
              size="lg"
              onClick={handlePurchase}
              disabled={!account || !totalMicroUsdc}
            >
              {account ? `Purchase ${assets.length} DataLicense${assets.length !== 1 ? "s" : ""}` : "Connect Wallet First"}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              One transaction mints all DataLicenses. Seal releases decryption keys on-chain.
            </p>
          </div>
        )}

        {step === "error" && (
          <div className="space-y-6 py-4">
            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
            <Button variant="outline" className="w-full" onClick={resetState}>
              Try Again
            </Button>
          </div>
        )}

        {isProcessing && (
          <div className="space-y-6 py-4">
            <div className="space-y-4">
              {STEPS.map((s, index) => {
                const isActive = s.id === step
                const isCompleted = currentIndex > index
                return (
                  <div key={s.id} className="flex items-center gap-3">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
                        isCompleted ? "bg-accent" : isActive ? "bg-foreground" : "bg-muted"
                      }`}
                    >
                      {isCompleted ? (
                        <Check className="h-4 w-4 text-accent-foreground" />
                      ) : isActive ? (
                        <Loader2 className="h-4 w-4 animate-spin text-background" />
                      ) : (
                        <div className="h-2 w-2 rounded-full bg-muted-foreground" />
                      )}
                    </div>
                    <span
                      className={`text-sm ${
                        isActive ? "font-medium text-foreground" : isCompleted ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {s.label}
                    </span>
                  </div>
                )
              })}
            </div>

            {txDigest && (
              <div className="space-y-3 rounded-lg border border-border bg-secondary/30 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Transaction Digest</span>
                  <code className="font-mono text-xs text-foreground">{txDigest.slice(0, 12)}...</code>
                </div>
                {licenseCount > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">DataLicenses Minted</span>
                    <div className="flex items-center gap-1">
                      <Shield className="h-3 w-3 text-accent" />
                      <span className="text-xs font-medium text-accent">{licenseCount}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === "done" && (
              <Button
                className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
                onClick={() => {
                  onPurchaseComplete()
                  onOpenChange(false)
                }}
              >
                Access Licensed Dataset
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
