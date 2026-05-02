import { cn } from "@/lib/utils";

interface Props {
  matrix: number[][]; // sklearn convention with labels=[0, 1] → [[TN, FP], [FN, TP]]
}

interface CellProps {
  count: number;
  total: number;
  max: number;
  kind: "tp" | "tn" | "fp" | "fn";
}

function Cell({ count, total, max, kind }: CellProps) {
  const intensity = max > 0 ? count / max : 0;
  const positive = kind === "tp" || kind === "tn";
  return (
    <div
      className={cn(
        "flex h-24 flex-col items-center justify-center rounded-md border p-2 text-center transition-colors",
      )}
      style={{
        background: positive
          ? `hsl(160, 70%, 45% / ${0.05 + intensity * 0.4})`
          : `hsl(0, 70%, 55% / ${0.05 + intensity * 0.4})`,
        borderColor: positive
          ? "hsl(160, 60%, 45% / 0.4)"
          : "hsl(0, 60%, 55% / 0.4)",
      }}
    >
      <div className="font-mono text-2xl font-semibold tabular-nums">
        {count.toLocaleString()}
      </div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {kind.toUpperCase()}
      </div>
      <div className="text-[10px] text-muted-foreground">
        {total > 0 ? `${((count / total) * 100).toFixed(1)}%` : "—"}
      </div>
    </div>
  );
}

export function ConfusionMatrix({ matrix }: Props) {
  const [[tn, fp], [fn, tp]] = matrix;
  const total = tn + fp + fn + tp;
  const max = Math.max(tn, fp, fn, tp);

  return (
    <div className="grid grid-cols-[auto_1fr_1fr] gap-2 text-[11px]">
      <div />
      <div className="text-center text-muted-foreground">Predicted 0</div>
      <div className="text-center text-muted-foreground">Predicted 1</div>

      <div className="flex items-center justify-end pr-2 text-muted-foreground">
        Actual 0
      </div>
      <Cell count={tn} total={total} max={max} kind="tn" />
      <Cell count={fp} total={total} max={max} kind="fp" />

      <div className="flex items-center justify-end pr-2 text-muted-foreground">
        Actual 1
      </div>
      <Cell count={fn} total={total} max={max} kind="fn" />
      <Cell count={tp} total={total} max={max} kind="tp" />
    </div>
  );
}
