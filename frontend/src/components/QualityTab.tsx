import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, RotateCw } from "lucide-react";

import { ComparisonTable } from "@/components/ComparisonTable";
import { ModelDetailCard } from "@/components/ModelDetailCard";
import { PRChart } from "@/components/PRChart";
import { ROCChart } from "@/components/ROCChart";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";
import type { ModelId, ModelQualityResponse } from "@/lib/types";

const MODEL_ORDER: ModelId[] = ["logreg", "rf", "xgb", "mlp"];

export function QualityTab() {
  const [data, setData] = useState<ModelQualityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .modelMetrics()
      .then(setData)
      .catch((e: ApiError) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading offline metrics…
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Could not load metrics. Is the backend running?
          </CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={fetchMetrics} variant="outline">
            <RotateCw className="h-4 w-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Comparison table</CardTitle>
          <CardDescription className="text-xs">
            All four models on the held-out test set (15% stratified split).
            <span className="ml-1 text-muted-foreground">
              Gap = AUC train − AUC test. The smaller the gap, the better the
              model generalizes; values above 0.10 indicate the model is
              memorizing training noise.
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ComparisonTable data={data} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">ROC curves</CardTitle>
            <CardDescription className="text-xs">
              True positive rate vs false positive rate. Diagonal = random.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ROCChart data={data} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Precision-recall curves</CardTitle>
            <CardDescription className="text-xs">
              More informative than ROC under class imbalance (positive rate
              ~17%).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PRChart data={data} />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold">Per-model detail</h3>
          <p className="text-xs text-muted-foreground">
            Click a row to expand confusion matrix, predicted-probability
            distribution, and feature importance.
          </p>
        </div>
        <div className="space-y-2">
          {MODEL_ORDER.map((id) => {
            const m = data.models[id];
            if (!m) return null;
            return (
              <ModelDetailCard
                key={id}
                modelId={id}
                metrics={m}
                featureOrder={data.feature_order}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
