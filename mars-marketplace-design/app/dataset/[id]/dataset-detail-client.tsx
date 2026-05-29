"use client"

import { useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Sidebar } from "@/components/marketplace/sidebar"
import { ProtocolTrace } from "@/components/marketplace/protocol-trace"
import { DataPreview } from "@/components/marketplace/data-preview"
import { PurchaseModal } from "@/components/marketplace/purchase-modal"
import type { Dataset } from "@/lib/marketplace-data"
import {
  Shield,
  Lock,
  Users,
  ArrowLeft,
  Database,
  Clock,
  HardDrive,
  FileCheck,
  Sparkles,
  Zap,
} from "lucide-react"

interface DatasetDetailClientProps {
  dataset: Dataset
}

function getQualityColor(score: number) {
  if (score >= 90) return "text-accent"
  if (score >= 70) return "text-chart-3"
  return "text-chart-4"
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function DatasetDetailClient({ dataset }: DatasetDetailClientProps) {
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false)

  const handlePurchaseComplete = () => {
    window.location.href = "/purchases"
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <main className="flex-1 lg:ml-64">
        <div className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex h-16 items-center gap-4 px-6">
            <Link href="/">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to Marketplace
              </Button>
            </Link>
          </div>
        </div>

        <div className="p-6 lg:p-8">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-8 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                <Card className="border-border bg-card">
                  <CardContent className="p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex-1">
                        <h1 className="text-2xl font-bold tracking-tight text-card-foreground">
                          {dataset.name}
                        </h1>
                        <p className="mt-1 text-muted-foreground">{dataset.type}</p>

                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          {dataset.sealProtected && (
                            <div className="flex items-center gap-1 rounded-md bg-accent/10 px-2 py-1">
                              <Shield className="h-3 w-3 text-accent" />
                              <span className="text-xs font-medium text-accent">
                                Seal Protected
                              </span>
                            </div>
                          )}
                          {dataset.isEncrypted && (
                            <div className="flex items-center gap-1 rounded-md bg-secondary px-2 py-1">
                              <Lock className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs font-medium text-muted-foreground">
                                Encrypted
                              </span>
                            </div>
                          )}
                          <div className="flex items-center gap-1 rounded-md bg-secondary px-2 py-1">
                            <Users className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs font-medium text-muted-foreground">
                              Contributor-owned
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-center rounded-lg border border-border bg-secondary/30 px-6 py-4">
                        <div
                          className={`text-4xl font-bold tabular-nums ${getQualityColor(
                            dataset.qualityScore,
                          )}`}
                        >
                          {dataset.qualityScore}
                        </div>
                        <span className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
                          Quality Score
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border bg-card">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-base font-semibold">Dataset Metadata</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="flex items-start gap-3 sm:col-span-2">
                        <div className="rounded-md bg-secondary p-2 shrink-0">
                          <Database className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground">Walrus Blob ID</p>
                          <code className="block break-all font-mono text-sm text-foreground">{dataset.walrusBlobId}</code>
                          {dataset.assets.length > 1 && (
                            <p className="mt-0.5 text-xs text-muted-foreground">+{dataset.assets.length - 1} more</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-start gap-3 sm:col-span-2">
                        <div className="rounded-md bg-secondary p-2 shrink-0">
                          <FileCheck className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground">DataShard Object ID</p>
                          <code className="block break-all font-mono text-sm text-foreground">{dataset.dataAssetObjectId}</code>
                          {dataset.assets.length > 1 && (
                            <p className="mt-0.5 text-xs text-muted-foreground">+{dataset.assets.length - 1} more</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="rounded-md bg-secondary p-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Contributors</p>
                          <p className="text-sm font-medium text-foreground">
                            {dataset.contributorCount.toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="rounded-md bg-secondary p-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Last Updated</p>
                          <p className="text-sm font-medium text-foreground">
                            {formatDate(dataset.lastUpdated)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="rounded-md bg-secondary p-2">
                          <HardDrive className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Dataset Size</p>
                          <p className="text-sm font-medium text-foreground">{dataset.datasetSize}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="rounded-md bg-secondary p-2">
                          <Shield className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">License Status</p>
                          <p className="text-sm font-medium text-foreground">{dataset.licenseStatus}</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-6">
                      <p className="mb-3 text-xs text-muted-foreground">Supported AI Use Cases</p>
                      <div className="flex flex-wrap gap-2">
                        {dataset.useCaseTags.map((tag) => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className="border-0 bg-secondary px-3 py-1 text-xs font-medium text-foreground"
                          >
                            <Sparkles className="mr-1.5 h-3 w-3 text-muted-foreground" />
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <ProtocolTrace />
                <DataPreview />
              </div>

              <div className="lg:col-span-1">
                <div className="sticky top-24">
                  <Card className="border-border bg-card">
                    <CardContent className="p-6">
                      <div className="space-y-6">
                        <div>
                          <p className="text-xs text-muted-foreground">Price</p>
                          <div className="mt-1 flex items-baseline gap-1">
                            <span className="text-3xl font-bold text-foreground">
                              ${dataset.price.toLocaleString()}
                            </span>
                            <span className="text-sm text-muted-foreground">USDC</span>
                          </div>
                        </div>

                        <div className="space-y-3 border-t border-border pt-4">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Quality Score</span>
                            <span className={`font-semibold ${getQualityColor(dataset.qualityScore)}`}>
                              {dataset.qualityScore}/100
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Contributors</span>
                            <span className="font-semibold text-foreground">
                              {dataset.contributorCount.toLocaleString()}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Est. AI Training Value</span>
                            <div className="flex items-center gap-1">
                              <Zap className="h-3 w-3 text-chart-3" />
                              <span className="font-semibold text-foreground">High</span>
                            </div>
                          </div>
                        </div>

                        <Button
                          className="w-full bg-foreground text-background hover:bg-foreground/90"
                          size="lg"
                          onClick={() => setPurchaseModalOpen(true)}
                        >
                          Purchase {dataset.assets.length > 1 ? `${dataset.assets.length} DataLicenses` : "DataLicense"}
                        </Button>

                        <p className="text-center text-xs text-muted-foreground">
                          Seal will release decryption access only after valid on-chain DataLicense verification.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <PurchaseModal
        open={purchaseModalOpen}
        onOpenChange={setPurchaseModalOpen}
        datasetName={dataset.name}
        assets={dataset.assets}
        onPurchaseComplete={handlePurchaseComplete}
      />
    </div>
  )
}
