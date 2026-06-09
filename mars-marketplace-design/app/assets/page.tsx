"use client"

import { Sidebar } from "@/components/marketplace/sidebar"
import { TopBar } from "@/components/marketplace/top-bar"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Database,
  Shield,
  Upload,
  TrendingUp,
  DollarSign,
  Eye,
  MoreHorizontal,
  Plus,
} from "lucide-react"

interface MyDataset {
  id: string
  name: string
  type: string
  status: "active" | "pending" | "archived"
  qualityScore: number
  totalEarnings: number
  totalPurchases: number
  lastUpdated: string
  sealProtected: boolean
}

const myDatasets: MyDataset[] = [
  {
    id: "rider_mobility",
    name: "Rider Mobility Dataset",
    type: "Mobility & Transportation",
    status: "active",
    qualityScore: 90,
    totalEarnings: 135000,
    totalPurchases: 1,
    lastUpdated: "2026-06-09",
    sealProtected: true,
  },
  {
    id: "merchant_operations",
    name: "Merchant Operations Dataset",
    type: "Retail Operations",
    status: "active",
    qualityScore: 90,
    totalEarnings: 108000,
    totalPurchases: 1,
    lastUpdated: "2026-06-09",
    sealProtected: true,
  },
  {
    id: "consumer_behavior",
    name: "Consumer Behavior Dataset",
    type: "Consumer Behavior",
    status: "active",
    qualityScore: 88,
    totalEarnings: 88000,
    totalPurchases: 1,
    lastUpdated: "2026-06-09",
    sealProtected: true,
  },
]

export default function AssetsPage() {
  const totalEarnings = myDatasets.reduce((sum, d) => sum + d.totalEarnings, 0)
  const totalPurchases = myDatasets.reduce((sum, d) => sum + d.totalPurchases, 0)
  const activeDatasets = myDatasets.filter((d) => d.status === "active").length

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <div className="flex flex-1 flex-col lg:pl-64">
        <TopBar datasetCount={myDatasets.length} />

        <main className="flex-1 p-4 lg:p-6">
          <div className="mx-auto max-w-7xl space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  My Assets
                </h1>
                <p className="text-sm text-muted-foreground">
                  Manage your contributed datasets and track earnings
                </p>
              </div>
              <Button className="gap-2 bg-foreground text-background hover:bg-foreground/90">
                <Plus className="h-4 w-4" />
                Upload Dataset
              </Button>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="border-border bg-card">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
                      <DollarSign className="h-5 w-5 text-accent" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total Earnings</p>
                      <p className="text-xl font-semibold text-foreground">
                        {totalEarnings.toLocaleString()} µUSDC
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                      <Eye className="h-5 w-5 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total Purchases</p>
                      <p className="text-xl font-semibold text-foreground">
                        {totalPurchases}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                      <Database className="h-5 w-5 text-green-500" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Active Datasets</p>
                      <p className="text-xl font-semibold text-foreground">
                        {activeDatasets}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
                      <TrendingUp className="h-5 w-5 text-purple-500" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Avg. Quality Score</p>
                      <p className="text-xl font-semibold text-foreground">
                        {Math.round(
                          myDatasets
                            .filter((d) => d.qualityScore > 0)
                            .reduce((sum, d) => sum + d.qualityScore, 0) /
                            myDatasets.filter((d) => d.qualityScore > 0).length
                        )}
                        %
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Datasets Table */}
            <Card className="border-border bg-card">
              <CardHeader className="border-b border-border px-6 py-4">
                <h2 className="text-lg font-semibold text-foreground">Your Datasets</h2>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="pl-6">Dataset</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Quality</TableHead>
                      <TableHead>Purchases</TableHead>
                      <TableHead>Earnings</TableHead>
                      <TableHead className="pr-6 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {myDatasets.map((dataset) => (
                      <TableRow key={dataset.id} className="border-border">
                        <TableCell className="pl-6">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary">
                              <Database className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div>
                              <p className="font-medium text-foreground">
                                {dataset.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {dataset.type}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={
                              dataset.status === "active"
                                ? "bg-green-500/10 text-green-600"
                                : dataset.status === "pending"
                                ? "bg-yellow-500/10 text-yellow-600"
                                : "bg-muted text-muted-foreground"
                            }
                          >
                            {dataset.status.charAt(0).toUpperCase() +
                              dataset.status.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {dataset.qualityScore > 0 ? (
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-16 overflow-hidden rounded-full bg-secondary">
                                <div
                                  className="h-full bg-accent"
                                  style={{ width: `${dataset.qualityScore}%` }}
                                />
                              </div>
                              <span className="text-sm text-muted-foreground">
                                {dataset.qualityScore}%
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              Pending
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-foreground">
                          {dataset.totalPurchases}
                        </TableCell>
                        <TableCell className="font-medium text-foreground">
                          {dataset.totalEarnings.toLocaleString()} µUSDC
                        </TableCell>
                        <TableCell className="pr-6 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {dataset.sealProtected && (
                              <Shield className="h-4 w-4 text-accent" />
                            )}
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Upload CTA */}
            <Card className="border-dashed border-border bg-card">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
                  <Upload className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-foreground">
                  Contribute More Data
                </h3>
                <p className="mt-1 text-center text-sm text-muted-foreground">
                  Upload your datasets to earn rewards when AI models train on your
                  data
                </p>
                <Button className="mt-4 gap-2 bg-foreground text-background hover:bg-foreground/90">
                  <Plus className="h-4 w-4" />
                  Upload Dataset
                </Button>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  )
}
