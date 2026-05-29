import { notFound } from "next/navigation"
import { getMarketplaceDatasetById } from "@/lib/marketplace-data"
import { DatasetDetailClient } from "./dataset-detail-client"

interface DatasetDetailPageProps {
  params: Promise<{
    id: string
  }>
}

export default async function DatasetDetailPage({ params }: DatasetDetailPageProps) {
  const { id } = await params
  const dataset = await getMarketplaceDatasetById(id)

  if (!dataset) {
    notFound()
  }

  return <DatasetDetailClient dataset={dataset} />
}
