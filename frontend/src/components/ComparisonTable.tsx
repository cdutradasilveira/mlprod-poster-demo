import {
  MODEL_COLORS,
  MODEL_DISPLAY,
  MODEL_LIBRARY,
  fmtBytes,
  fmtNum,
  fmtPct,
  fmtSeconds,
} from "@/lib/theme";
import type { ModelId, ModelQualityResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  data: ModelQualityResponse;
}

const MODEL_ORDER: ModelId[] = ["logreg", "rf", "xgb", "mlp"];

function gapClass(gap: number): string {
  if (gap < 0.05)
    return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
  if (gap < 0.10)
    return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
  return "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30";
}

export function ComparisonTable({ data }: Props) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Model</th>
            <th className="px-3 py-2 text-right">AUC test</th>
            <th className="px-3 py-2 text-right">AUC train</th>
            <th className="px-3 py-2 text-right">Gap</th>
            <th className="px-3 py-2 text-right">Log-loss</th>
            <th className="px-3 py-2 text-right">Accuracy</th>
            <th className="px-3 py-2 text-right">Precision</th>
            <th className="px-3 py-2 text-right">Recall</th>
            <th className="px-3 py-2 text-right">F1</th>
            <th className="px-3 py-2 text-right">Train time</th>
            <th className="px-3 py-2 text-right">Artifact size</th>
          </tr>
        </thead>
        <tbody>
          {MODEL_ORDER.map((id) => {
            const m = data.models[id];
            if (!m) return null;
            const gap = m.auc_roc_train - m.auc_roc;
            return (
              <tr
                key={id}
                className="border-t border-border/60 transition-colors hover:bg-muted/30"
              >
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: MODEL_COLORS[id] }}
                      aria-hidden
                    />
                    <div>
                      <div className="font-medium leading-tight">
                        {MODEL_DISPLAY[id]}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {MODEL_LIBRARY[id]}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                  {fmtNum(m.auc_roc, 4)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                  {fmtNum(m.auc_roc_train, 4)}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <span
                    className={cn(
                      "inline-block rounded-md border px-2 py-0.5 font-mono text-xs tabular-nums",
                      gapClass(gap),
                    )}
                    title={
                      gap < 0.05
                        ? "Healthy generalization gap"
                        : gap < 0.1
                          ? "Mild overfitting"
                          : "Strong overfitting — model memorizes training noise"
                    }
                  >
                    {gap >= 0 ? "+" : ""}
                    {gap.toFixed(4)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                  {fmtNum(m.log_loss, 4)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                  {fmtPct(m.accuracy)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                  {fmtPct(m.precision)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                  {fmtPct(m.recall)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                  {fmtPct(m.f1)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                  {fmtSeconds(m.training_time_s)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                  {fmtBytes(m.artifact_size_bytes)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
