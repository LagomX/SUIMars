import { Lock } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function DataPreview() {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-semibold">Data Preview</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-secondary/30 py-12">
          <div className="rounded-full bg-secondary p-3">
            <Lock className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">Dataset Encrypted</p>
          <p className="max-w-xs text-center text-xs text-muted-foreground">
            Full dataset is accessible only after purchasing a DataLicense and completing Seal verification.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
