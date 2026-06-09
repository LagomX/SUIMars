import { notFound } from "next/navigation"
import { getMarketplaceDatasets, getMarketplaceDatasetById } from "@/lib/marketplace-data"
import { DatasetDetailClient } from "./dataset-detail-client"

export const dynamicParams = false

interface DatasetDetailPageProps {
  params: Promise<{
    id: string
  }>
}

export async function generateStaticParams() {
  const datasets = await getMarketplaceDatasets()
  return datasets.map((dataset) => ({ id: dataset.id }))
}

export default async function DatasetDetailPage({ params }: DatasetDetailPageProps) {
  const { id } = await params
  const dataset = await getMarketplaceDatasetById(id)

  if (!dataset) {
    notFound()
  }

  return <DatasetDetailClient dataset={dataset} />
}
