import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { ConfusionMatrix } from "@/components/ConfusionMatrix";
import { FeatureImportanceChart } from "@/components/FeatureImportanceChart";
import { PredictedProbHistogram } from "@/components/PredictedProbHistogram";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  MODEL_COLORS,
  MODEL_DISPLAY,
  MODEL_LIBRARY,
  fmtNum,
} from "@/lib/theme";
import type { ModelId, ModelQualityMetrics } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  modelId: ModelId;
  metrics: ModelQualityMetrics;
  featureOrder: string[];
  defaultOpen?: boolean;
}

export function ModelDetailCard({
  modelId,
  metrics,
  featureOrder,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card>
      <CardHeader className="pb-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 text-left"
          aria-expanded={open}
        >
          <CardTitle className="flex items-center gap-2 text-sm">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: MODEL_COLORS[modelId] }}
              aria-hidden
            />
            <span>{MODEL_DISPLAY[modelId]}</span>
            <span className="text-xs font-normal text-muted-foreground">
              · {MODEL_LIBRARY[modelId]}
            </span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono">
              AUC {fmtNum(metrics.auc_roc, 4)}
            </Badge>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
            />
          </div>
        </button>
      </CardHeader>
      {open && (
        <CardContent className="grid gap-6 pt-2 lg:grid-cols-3">
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Confusion matrix @ 0.5
            </div>
            <ConfusionMatrix matrix={metrics.confusion_matrix} />
          </div>
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Predicted probability by true class
            </div>
            <PredictedProbHistogram
              binEdges={metrics.predicted_probability_histogram.bin_edges}
              positive={metrics.predicted_probability_histogram.positive}
              negative={metrics.predicted_probability_histogram.negative}
            />
          </div>
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Feature importance
            </div>
            <FeatureImportanceChart
              featureOrder={featureOrder}
              importances={metrics.feature_importance}
              model={modelId}
            />
          </div>
        </CardContent>
      )}
    </Card>
  );
}
