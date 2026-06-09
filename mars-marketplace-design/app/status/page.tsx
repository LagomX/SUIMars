"use client"

import { Sidebar } from "@/components/marketplace/sidebar"
import { TopBar } from "@/components/marketplace/top-bar"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Activity,
  Database,
  Server,
  Zap,
  CheckCircle2,
  AlertCircle,
  Clock,
  Globe,
  Shield,
  HardDrive,
} from "lucide-react"

interface ServiceStatus {
  name: string
  status: "operational" | "degraded" | "outage"
  uptime: string
  latency: string
  lastChecked: string
}

interface RecentEvent {
  id: string
  type: "info" | "warning" | "success"
  title: string
  description: string
  timestamp: string
}

const services: ServiceStatus[] = [
  {
    name: "Sui Network",
    status: "operational",
    uptime: "99.98%",
    latency: "45ms",
    lastChecked: "30s ago",
  },
  {
    name: "Walrus Storage",
    status: "operational",
    uptime: "99.95%",
    latency: "120ms",
    lastChecked: "30s ago",
  },
  {
    name: "Seal Encryption",
    status: "operational",
    uptime: "99.99%",
    latency: "25ms",
    lastChecked: "30s ago",
  },
  {
    name: "Data Validator Nodes",
    status: "operational",
    uptime: "99.92%",
    latency: "85ms",
    lastChecked: "30s ago",
  },
  {
    name: "API Gateway",
    status: "operational",
    uptime: "99.97%",
    latency: "35ms",
    lastChecked: "30s ago",
  },
  {
    name: "Walrus Blob Replication",
    status: "operational",
    uptime: "99.90%",
    latency: "180ms",
    lastChecked: "30s ago",
  },
]

const recentEvents: RecentEvent[] = [
  {
    id: "1",
    type: "success",
    title: "Walrus Storage Sync Complete",
    description: "All pending blobs have been successfully synced to the network",
    timestamp: "5 minutes ago",
  },
  {
    id: "2",
    type: "warning",
    title: "IPFS Pinning Latency Increased",
    description: "Experiencing higher than normal latency on IPFS pinning operations",
    timestamp: "23 minutes ago",
  },
  {
    id: "3",
    type: "info",
    title: "Scheduled Maintenance Complete",
    description: "Validator node maintenance completed successfully",
    timestamp: "2 hours ago",
  },
  {
    id: "4",
    type: "success",
    title: "New Validator Node Online",
    description: "Validator node #47 has joined the network",
    timestamp: "4 hours ago",
  },
]

export default function StatusPage() {
  const operationalCount = services.filter((s) => s.status === "operational").length
  const allOperational = operationalCount === services.length

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <div className="flex flex-1 flex-col lg:pl-64">
        <TopBar datasetCount={8} />

        <main className="flex-1 p-4 lg:p-6">
          <div className="mx-auto max-w-7xl space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  Protocol Status
                </h1>
                <p className="text-sm text-muted-foreground">
                  Real-time health of Mars protocol infrastructure
                </p>
              </div>
              <Badge
                variant="secondary"
                className={
                  allOperational
                    ? "bg-green-500/10 text-green-600"
                    : "bg-yellow-500/10 text-yellow-600"
                }
              >
                {allOperational ? (
                  <>
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    All Systems Operational
                  </>
                ) : (
                  <>
                    <AlertCircle className="mr-1 h-3 w-3" />
                    Partial Degradation
                  </>
                )}
              </Badge>
            </div>

            {/* Overview Stats */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="border-border bg-card">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                      <Activity className="h-5 w-5 text-green-500" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Uptime (30d)</p>
                      <p className="text-xl font-semibold text-foreground">99.95%</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                      <Server className="h-5 w-5 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Active Nodes</p>
                      <p className="text-xl font-semibold text-foreground">47</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
                      <Zap className="h-5 w-5 text-accent" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Avg Latency</p>
                      <p className="text-xl font-semibold text-foreground">68ms</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
                      <HardDrive className="h-5 w-5 text-purple-500" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Data Stored</p>
                      <p className="text-xl font-semibold text-foreground">2.4 PB</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Services Grid */}
            <Card className="border-border bg-card">
              <CardHeader className="border-b border-border px-6 py-4">
                <div className="flex items-center gap-2">
                  <Globe className="h-5 w-5 text-muted-foreground" />
                  <h2 className="text-lg font-semibold text-foreground">
                    Service Status
                  </h2>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {services.map((service) => (
                    <div
                      key={service.name}
                      className="flex items-center justify-between px-6 py-4"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-2.5 w-2.5 rounded-full ${
                            service.status === "operational"
                              ? "bg-green-500"
                              : service.status === "degraded"
                              ? "bg-yellow-500"
                              : "bg-red-500"
                          }`}
                        />
                        <div>
                          <p className="font-medium text-foreground">
                            {service.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Last checked {service.lastChecked}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">Uptime</p>
                          <p className="font-medium text-foreground">
                            {service.uptime}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">Latency</p>
                          <p className="font-medium text-foreground">
                            {service.latency}
                          </p>
                        </div>
                        <Badge
                          variant="secondary"
                          className={
                            service.status === "operational"
                              ? "bg-green-500/10 text-green-600"
                              : service.status === "degraded"
                              ? "bg-yellow-500/10 text-yellow-600"
                              : "bg-red-500/10 text-red-600"
                          }
                        >
                          {service.status.charAt(0).toUpperCase() +
                            service.status.slice(1)}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Recent Events */}
            <Card className="border-border bg-card">
              <CardHeader className="border-b border-border px-6 py-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <h2 className="text-lg font-semibold text-foreground">
                    Recent Events
                  </h2>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {recentEvents.map((event) => (
                    <div key={event.id} className="flex items-start gap-3 px-6 py-4">
                      <div
                        className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full ${
                          event.type === "success"
                            ? "bg-green-500/10"
                            : event.type === "warning"
                            ? "bg-yellow-500/10"
                            : "bg-blue-500/10"
                        }`}
                      >
                        {event.type === "success" ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                        ) : event.type === "warning" ? (
                          <AlertCircle className="h-3.5 w-3.5 text-yellow-500" />
                        ) : (
                          <Activity className="h-3.5 w-3.5 text-blue-500" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-foreground">{event.title}</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {event.description}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {event.timestamp}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Network Info */}
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="border-border bg-card">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                      <Database className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">Sui Network</h3>
                      <p className="text-sm text-muted-foreground">Testnet</p>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Current Epoch</p>
                      <p className="font-medium text-foreground">847</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">TPS</p>
                      <p className="font-medium text-foreground">12,450</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total Txns</p>
                      <p className="font-medium text-foreground">1.2B</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Gas Price</p>
                      <p className="font-medium text-foreground">0.001 SUI</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                      <Shield className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">Seal Protocol</h3>
                      <p className="text-sm text-muted-foreground">Encryption Layer</p>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Protected Assets</p>
                      <p className="font-medium text-foreground">8,421</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Key Rotations</p>
                      <p className="font-medium text-foreground">Daily</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Encryption</p>
                      <p className="font-medium text-foreground">AES-256-GCM</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Threshold</p>
                      <p className="font-medium text-foreground">3-of-5</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
