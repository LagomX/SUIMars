"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Shield, Database, Lock, Users, Sparkles } from "lucide-react"
import type { Dataset } from "@/lib/marketplace-data"

export type { Dataset }

interface DatasetCardProps {
  dataset: Dataset
}

function getQualityColor(score: number) {
  if (score >= 90) return "text-accent"
  if (score >= 70) return "text-chart-3"
  return "text-chart-4"
}

function getWalrusStatusColor(status: string) {
  switch (status) {
    case "active":
      return "bg-accent"
    case "syncing":
      return "bg-chart-3"
    default:
      return "bg-muted-foreground"
  }
}

export function DatasetCard({ dataset }: DatasetCardProps) {
  return (
    <Link href={`/dataset/${dataset.id}`} className="block">
      <Card className="group relative flex h-full cursor-pointer flex-col overflow-hidden border-border bg-card transition-all duration-200 hover:border-foreground/20 hover:shadow-lg">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <h3 className="font-semibold leading-tight tracking-tight text-card-foreground">
              {dataset.name}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">{dataset.type}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div
              className={`text-2xl font-bold tabular-nums ${getQualityColor(
                dataset.qualityScore
              )}`}
            >
              {dataset.qualityScore}
            </div>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Quality
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 pb-3">
        {/* Tags */}
        <div className="flex flex-wrap gap-1.5">
          {dataset.useCaseTags.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="border-0 bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
            >
              <Sparkles className="mr-1 h-3 w-3" />
              {tag}
            </Badge>
          ))}
        </div>

        {/* Stats */}
        <div className="mt-4 flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            <span>{dataset.contributorCount} contributors</span>
          </div>
        </div>

        {/* Protocol badges */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {dataset.isEncrypted && (
            <div className="flex items-center gap-1 rounded-md bg-secondary px-2 py-1">
              <Lock className="h-3 w-3 text-muted-foreground" />
              <span className="text-[11px] font-medium text-muted-foreground">
                Encrypted
              </span>
            </div>
          )}
          <div className="flex items-center gap-1.5 rounded-md bg-secondary px-2 py-1">
            <div
              className={`h-1.5 w-1.5 rounded-full ${getWalrusStatusColor(
                dataset.walrusStatus
              )}`}
            />
            <Database className="h-3 w-3 text-muted-foreground" />
            <span className="text-[11px] font-medium text-muted-foreground capitalize">
              {dataset.walrusStatus}
            </span>
          </div>
          {dataset.sealProtected && (
            <div className="flex items-center gap-1 rounded-md bg-accent/10 px-2 py-1">
              <Shield className="h-3 w-3 text-accent" />
              <span className="text-[11px] font-medium text-accent">
                Seal Protected
              </span>
            </div>
          )}
        </div>
      </CardContent>

      <CardFooter className="flex items-center justify-between border-t border-border bg-secondary/50 px-4 py-3">
        <div className="flex items-baseline gap-1">
          <span className="text-lg font-semibold text-card-foreground">
            ${dataset.price.toLocaleString()}
          </span>
          <span className="text-xs text-muted-foreground">USDC</span>
        </div>
        <span
          className="inline-flex h-8 items-center rounded-md bg-foreground px-4 text-xs font-medium text-background transition-colors group-hover:bg-foreground/90"
        >
          View Details
        </span>
      </CardFooter>
      </Card>
    </Link>
  )
}
