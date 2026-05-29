"use client"

import { Check, Lock } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface ProtocolStep {
  label: string
  completed: boolean
  locked?: boolean
}

interface ProtocolTraceProps {
  steps?: ProtocolStep[]
}

const defaultSteps: ProtocolStep[] = [
  { label: "Dataset encrypted locally", completed: true },
  { label: "Blob stored on Walrus", completed: true },
  { label: "DataShard registered on Sui", completed: true },
  { label: "Seal access control enabled", completed: true },
  { label: "DataLicense required for decrypt", completed: false, locked: true },
]

export function ProtocolTrace({ steps = defaultSteps }: ProtocolTraceProps) {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-semibold">Protocol Trace</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {steps.map((step, index) => (
            <div key={index} className="flex items-center gap-3">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full ${
                  step.locked
                    ? "bg-muted"
                    : step.completed
                    ? "bg-accent"
                    : "bg-muted"
                }`}
              >
                {step.locked ? (
                  <Lock className="h-3 w-3 text-muted-foreground" />
                ) : step.completed ? (
                  <Check className="h-3 w-3 text-accent-foreground" />
                ) : (
                  <div className="h-2 w-2 rounded-full bg-muted-foreground" />
                )}
              </div>
              <span
                className={`text-sm ${
                  step.locked
                    ? "font-medium text-muted-foreground"
                    : step.completed
                    ? "text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {step.label}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
