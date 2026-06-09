import { notFound } from "next/navigation"
import {
  getMarketplaceDatasets,
  getMarketplaceDatasetById,
  marketplaceProductSlugs,
} from "@/lib/marketplace-data"
import { DatasetDetailClient } from "./dataset-detail-client"

export const dynamicParams = true

interface DatasetDetailPageProps {
  params: Promise<{
    id: string
  }>
}

export async function generateStaticParams() {
  const datasets = await getMarketplaceDatasets()
  const ids = new Set([...marketplaceProductSlugs, ...datasets.map((dataset) => dataset.id)])

  return Array.from(ids, (id) => ({ id }))
}

export default async function DatasetDetailPage({ params }: DatasetDetailPageProps) {
  const { id } = await params
  const dataset = await getMarketplaceDatasetById(id)

  if (!dataset) {
    notFound()
  }

  return <DatasetDetailClient dataset={dataset} />
}
