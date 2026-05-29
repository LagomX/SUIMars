import { Sidebar } from "@/components/marketplace/sidebar"
import { TopBar } from "@/components/marketplace/top-bar"
import { DatasetCard } from "@/components/marketplace/dataset-card"
import { ProtocolStats } from "@/components/marketplace/protocol-stats"
import { getMarketplaceDatasets } from "@/lib/marketplace-data"

export default async function MarketplacePage() {
  const datasets = await getMarketplaceDatasets()

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content */}
      <div className="flex-1 lg:pl-64">
        <TopBar totalDatasets={datasets.length} />

        <main className="px-4 py-6 lg:px-8 lg:py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground lg:text-3xl">
              Marketplace
            </h1>
            <p className="mt-1 text-muted-foreground">
              Browse contributor-owned datasets for AI training and inference
            </p>
          </div>

          {/* Protocol Stats */}
          <div className="mb-8">
            <ProtocolStats datasets={datasets} />
          </div>

          {/* Filters */}
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <button className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background">
              All Datasets
            </button>
            <button className="rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
              Mobility
            </button>
            <button className="rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
              Consumer
            </button>
            <button className="rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
              Logistics
            </button>
            <button className="rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
              Healthcare
            </button>
            <button className="rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
              Seal Protected
            </button>
          </div>

          {/* Dataset Grid */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {datasets.map((dataset) => (
              <DatasetCard key={dataset.id} dataset={dataset} />
            ))}
          </div>

          {/* Footer info */}
          <div className="mt-12 text-center">
            <p className="text-sm text-muted-foreground">
              Showing {datasets.length} of {datasets.length} datasets
            </p>
          </div>
        </main>
      </div>
    </div>
  )
}
