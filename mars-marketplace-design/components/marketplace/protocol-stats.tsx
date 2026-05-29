"use client"

import { TrendingUp, Database, Users, DollarSign } from "lucide-react"
import type { Dataset } from "@/lib/marketplace-data"

interface ProtocolStatsProps {
  datasets?: Dataset[]
}

const formatUsdc = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 100 ? 2 : 0,
  }).format(value)

const buildStats = (datasets: Dataset[] = []) => [
  {
    label: "Listed Value",
    value: formatUsdc(datasets.reduce((sum, dataset) => sum + dataset.price, 0)),
    change: "Live",
    icon: DollarSign,
  },
  {
    label: "Active Datasets",
    value: datasets.filter((dataset) => dataset.walrusStatus === "active").length.toLocaleString(),
    change: "Walrus",
    icon: Database,
  },
  {
    label: "Contributors",
    value: datasets.reduce((sum, dataset) => sum + dataset.contributorCount, 0).toLocaleString(),
    change: "Owned",
    icon: Users,
  },
]

export function ProtocolStats({ datasets }: ProtocolStatsProps) {
  const stats = buildStats(datasets)

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="flex items-center gap-4 rounded-xl border border-border bg-card p-4"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
            <stat.icon className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{stat.label}</p>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-semibold text-card-foreground">
                {stat.value}
              </span>
              <span className="flex items-center text-xs font-medium text-accent">
                <TrendingUp className="mr-0.5 h-3 w-3" />
                {stat.change}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
