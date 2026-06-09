"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Sidebar } from "@/components/marketplace/sidebar"
import {
  Shield,
  Download,
  Check,
  Sparkles,
  TrendingUp,
  Clock,
  Cpu,
  BarChart3,
  Route,
  Target,
} from "lucide-react"

// Mock licensed datasets
const licensedDatasets = [
  {
    id: "1",
    name: "Santa Monica Rider Mobility",
    type: "Mobility & Transportation",
    qualityScore: 94,
    purchaseDate: "2024-01-15T10:30:00Z",
    licenseObjectId: "0x9e4d1a7f3c8b5e2d6a9f1c4b7e8d3a2f5c6b9e1d",
    sealVerified: true,
    decryptEnabled: true,
  },
  {
    id: "4",
    name: "Urban ETA Signals",
    type: "Logistics & Delivery",
    qualityScore: 96,
    purchaseDate: "2024-01-14T08:15:00Z",
    licenseObjectId: "0x6f1b3a5c8e2d9f4b7c1a5e8d3f6b9c2a5e8d1f4b",
    sealVerified: true,
    decryptEnabled: true,
  },
]

// Mock AI training outputs
const aiTrainingOutputs = [
  {
    id: "1",
    name: "Demand Prediction Model",
    type: "Predictive Model",
    accuracy: 94.2,
    status: "trained",
    lastUpdated: "2024-01-15T14:30:00Z",
    icon: BarChart3,
    metrics: [
      { label: "RMSE", value: "2.3" },
      { label: "MAE", value: "1.8" },
    ],
  },
  {
    id: "2",
    name: "Dispatch Optimization Model",
    type: "Optimization Engine",
    accuracy: 91.8,
    status: "training",
    lastUpdated: "2024-01-15T16:00:00Z",
    icon: Route,
    metrics: [
      { label: "Efficiency", value: "+18%" },
      { label: "Cost Reduction", value: "12%" },
    ],
  },
  {
    id: "3",
    name: "ETA Calibration Signals",
    type: "Real-time Signals",
    accuracy: 97.1,
    status: "active",
    lastUpdated: "2024-01-15T16:45:00Z",
    icon: Target,
    metrics: [
      { label: "Latency", value: "45ms" },
      { label: "Accuracy", value: "97.1%" },
    ],
  },
]

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function getStatusColor(status: string) {
  switch (status) {
    case "trained":
      return "bg-accent text-accent-foreground"
    case "training":
      return "bg-chart-3/10 text-chart-3"
    case "active":
      return "bg-chart-1/10 text-chart-1"
    default:
      return "bg-muted text-muted-foreground"
  }
}

export default function PurchasesPage() {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <main className="flex-1 lg:ml-64">
        {/* Top Bar */}
        <div className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex h-16 items-center justify-between px-6">
            <h1 className="text-xl font-semibold">Licensed Datasets</h1>
            <Badge variant="secondary" className="text-xs">
              {licensedDatasets.length} Active Licenses
            </Badge>
          </div>
        </div>

        <div className="p-6 lg:p-8">
          <div className="mx-auto max-w-5xl space-y-8">
            {/* Licensed Datasets Section */}
            <section>
              <div className="mb-4 flex items-center gap-2">
                <Shield className="h-5 w-5 text-accent" />
                <h2 className="text-lg font-semibold">Your Licensed Datasets</h2>
              </div>

              <div className="space-y-4">
                {licensedDatasets.map((dataset) => (
                  <Card key={dataset.id} className="border-border bg-card">
                    <CardContent className="p-6">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <h3 className="font-semibold text-card-foreground">
                              {dataset.name}
                            </h3>
                            <Badge
                              variant="secondary"
                              className="bg-accent/10 text-accent"
                            >
                              <Check className="mr-1 h-3 w-3" />
                              Licensed
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {dataset.type}
                          </p>

                          {/* Protocol Status */}
                          <div className="mt-4 flex flex-wrap items-center gap-4">
                            <div className="flex items-center gap-2">
                              <Check className="h-4 w-4 text-accent" />
                              <span className="text-xs text-muted-foreground">
                                Licensed
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Shield className="h-4 w-4 text-accent" />
                              <span className="text-xs text-muted-foreground">
                                Seal Verified
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Download className="h-4 w-4 text-accent" />
                              <span className="text-xs text-muted-foreground">
                                Decrypted Access Enabled
                              </span>
                            </div>
                          </div>

                          {/* Metadata */}
                          <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
                            <span>Purchased {formatDate(dataset.purchaseDate)}</span>
                            <span>
                              License:{" "}
                              <code className="font-mono">
                                {dataset.licenseObjectId.slice(0, 12)}...
                              </code>
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="text-2xl font-bold text-accent tabular-nums">
                              {dataset.qualityScore}
                            </div>
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              Quality
                            </span>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                          >
                            <Download className="h-4 w-4" />
                            Download
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>

            {/* AI Training Outputs Section */}
            <section>
              <div className="mb-4 flex items-center gap-2">
                <Cpu className="h-5 w-5 text-chart-1" />
                <h2 className="text-lg font-semibold">AI Training Outputs</h2>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {aiTrainingOutputs.map((output) => (
                  <Card key={output.id} className="border-border bg-card">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="rounded-lg bg-secondary p-2">
                            <output.icon className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <div>
                            <CardTitle className="text-sm font-semibold">
                              {output.name}
                            </CardTitle>
                            <p className="text-xs text-muted-foreground">
                              {output.type}
                            </p>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex items-center justify-between">
                        <Badge
                          variant="secondary"
                          className={`text-xs capitalize ${getStatusColor(
                            output.status
                          )}`}
                        >
                          {output.status}
                        </Badge>
                        <div className="flex items-center gap-1 text-accent">
                          <TrendingUp className="h-3 w-3" />
                          <span className="text-sm font-semibold">
                            {output.accuracy}%
                          </span>
                        </div>
                      </div>

                      {/* Metrics */}
                      <div className="mt-4 flex items-center gap-4">
                        {output.metrics.map((metric, i) => (
                          <div key={i} className="flex-1">
                            <p className="text-xs text-muted-foreground">
                              {metric.label}
                            </p>
                            <p className="font-mono text-sm font-medium text-foreground">
                              {metric.value}
                            </p>
                          </div>
                        ))}
                      </div>

                      {/* Footer */}
                      <div className="mt-4 flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>Updated {formatDate(output.lastUpdated)}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>

            {/* AI Ready Badge */}
            <Card className="border-accent/20 bg-accent/5">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="rounded-full bg-accent/10 p-3">
                  <Sparkles className="h-6 w-6 text-accent" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground">
                    AI-Ready Datasets
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Your licensed datasets are verified, decrypted, and ready for AI
                    model training. All data has passed Seal verification and is
                    optimized for machine learning workflows.
                  </p>
                </div>
                <Button variant="outline" size="sm" className="shrink-0">
                  View Documentation
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}
