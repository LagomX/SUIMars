"use client"

import { Sidebar } from "@/components/marketplace/sidebar"
import { TopBar } from "@/components/marketplace/top-bar"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Gift,
  Coins,
  Trophy,
  Target,
  ArrowRight,
  CheckCircle2,
  Clock,
  Sparkles,
} from "lucide-react"

interface Reward {
  id: string
  title: string
  description: string
  points: number
  status: "claimed" | "available" | "locked"
  category: "contribution" | "milestone" | "referral"
  claimedAt?: string
}

interface Quest {
  id: string
  title: string
  description: string
  reward: number
  progress: number
  target: number
  expiresIn?: string
}

const rewards: Reward[] = [
  {
    id: "1",
    title: "First Dataset Upload",
    description: "Upload your first dataset to the marketplace",
    points: 500,
    status: "claimed",
    category: "milestone",
    claimedAt: "2024-01-10",
  },
  {
    id: "2",
    title: "Quality Champion",
    description: "Maintain a quality score above 90% for 30 days",
    points: 1000,
    status: "available",
    category: "milestone",
  },
  {
    id: "3",
    title: "Data Pioneer",
    description: "Contribute 10GB of validated data",
    points: 2500,
    status: "locked",
    category: "contribution",
  },
  {
    id: "4",
    title: "Community Builder",
    description: "Refer 5 new data contributors",
    points: 1500,
    status: "available",
    category: "referral",
  },
  {
    id: "5",
    title: "AI Training Partner",
    description: "Have your data used in 10 AI model trainings",
    points: 3000,
    status: "locked",
    category: "contribution",
  },
]

const quests: Quest[] = [
  {
    id: "1",
    title: "Weekly Upload Streak",
    description: "Upload data for 7 consecutive days",
    reward: 750,
    progress: 5,
    target: 7,
    expiresIn: "2 days",
  },
  {
    id: "2",
    title: "Quality Boost",
    description: "Improve dataset quality score by 5%",
    reward: 500,
    progress: 3,
    target: 5,
    expiresIn: "5 days",
  },
  {
    id: "3",
    title: "Marketplace Explorer",
    description: "Purchase 3 different datasets",
    reward: 400,
    progress: 1,
    target: 3,
  },
]

export default function RewardsPage() {
  const totalPoints = 4250
  const claimedRewards = rewards.filter((r) => r.status === "claimed").length
  const availableRewards = rewards.filter((r) => r.status === "available").length

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <div className="flex flex-1 flex-col lg:pl-64">
        <TopBar datasetCount={8} />

        <main className="flex-1 p-4 lg:p-6">
          <div className="mx-auto max-w-7xl space-y-6">
            {/* Header */}
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Rewards
              </h1>
              <p className="text-sm text-muted-foreground">
                Earn points and unlock rewards for contributing to the protocol
              </p>
            </div>

            {/* Points Summary */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="border-border bg-card">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
                      <Coins className="h-5 w-5 text-accent" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total Points</p>
                      <p className="text-xl font-semibold text-foreground">
                        {totalPoints.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Claimed Rewards</p>
                      <p className="text-xl font-semibold text-foreground">
                        {claimedRewards}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                      <Gift className="h-5 w-5 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Available</p>
                      <p className="text-xl font-semibold text-foreground">
                        {availableRewards}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
                      <Trophy className="h-5 w-5 text-purple-500" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Rank</p>
                      <p className="text-xl font-semibold text-foreground">
                        Pioneer
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Active Quests */}
            <Card className="border-border bg-card">
              <CardHeader className="border-b border-border px-6 py-4">
                <div className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-accent" />
                  <h2 className="text-lg font-semibold text-foreground">
                    Active Quests
                  </h2>
                </div>
              </CardHeader>
              <CardContent className="divide-y divide-border p-0">
                {quests.map((quest) => (
                  <div
                    key={quest.id}
                    className="flex items-center justify-between p-4"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-foreground">{quest.title}</h3>
                        {quest.expiresIn && (
                          <Badge
                            variant="secondary"
                            className="bg-yellow-500/10 text-yellow-600"
                          >
                            <Clock className="mr-1 h-3 w-3" />
                            {quest.expiresIn}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {quest.description}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-2 w-32 overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full bg-accent transition-all"
                            style={{
                              width: `${(quest.progress / quest.target) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {quest.progress}/{quest.target}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-medium text-foreground">
                          +{quest.reward}
                        </p>
                        <p className="text-xs text-muted-foreground">points</p>
                      </div>
                      {quest.progress === quest.target && (
                        <Button
                          size="sm"
                          className="gap-1 bg-accent text-accent-foreground hover:bg-accent/90"
                        >
                          Claim
                          <ArrowRight className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Rewards Grid */}
            <div>
              <h2 className="mb-4 text-lg font-semibold text-foreground">
                All Rewards
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {rewards.map((reward) => (
                  <Card
                    key={reward.id}
                    className={`border-border bg-card ${
                      reward.status === "locked" ? "opacity-60" : ""
                    }`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                          {reward.category === "milestone" ? (
                            <Trophy className="h-5 w-5 text-muted-foreground" />
                          ) : reward.category === "contribution" ? (
                            <Sparkles className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <Gift className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        <Badge
                          variant="secondary"
                          className={
                            reward.status === "claimed"
                              ? "bg-green-500/10 text-green-600"
                              : reward.status === "available"
                              ? "bg-blue-500/10 text-blue-600"
                              : "bg-muted text-muted-foreground"
                          }
                        >
                          {reward.status.charAt(0).toUpperCase() +
                            reward.status.slice(1)}
                        </Badge>
                      </div>
                      <h3 className="mt-3 font-medium text-foreground">
                        {reward.title}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {reward.description}
                      </p>
                      <div className="mt-4 flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <Coins className="h-4 w-4 text-accent" />
                          <span className="font-medium text-foreground">
                            {reward.points.toLocaleString()}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            points
                          </span>
                        </div>
                        {reward.status === "available" && (
                          <Button
                            size="sm"
                            className="h-8 bg-foreground text-background hover:bg-foreground/90"
                          >
                            Claim
                          </Button>
                        )}
                        {reward.status === "claimed" && reward.claimedAt && (
                          <span className="text-xs text-muted-foreground">
                            Claimed {reward.claimedAt}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
