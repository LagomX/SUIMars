import { notFound } from "next/navigation"
import { getMarketplaceDatasetById } from "@/lib/marketplace-data"
import { sampleDatasets } from "@/lib/sample-datasets"
import { DatasetDetailClient } from "./dataset-detail-client"

export const dynamicParams = false

interface DatasetDetailPageProps {
  params: Promise<{
    id: string
  }>
}

export function generateStaticParams() {
  return sampleDatasets.map((dataset) => ({ id: dataset.id }))
}

export default async function DatasetDetailPage({ params }: DatasetDetailPageProps) {
  const { id } = await params
  const dataset = await getMarketplaceDatasetById(id)

  if (!dataset) {
    notFound()
  }

  return <DatasetDetailClient dataset={dataset} />
}
