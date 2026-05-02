import { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { MODEL_COLORS, MODEL_DISPLAY } from "@/lib/theme";
import type { ModelId, ModelQualityResponse } from "@/lib/types";

interface Props {
  data: ModelQualityResponse;
  height?: number;
}

const MODEL_ORDER: ModelId[] = ["logreg", "rf", "xgb", "mlp"];

interface RocPoint {
  fpr: number;
  diagonal?: number;
  logreg?: number;
  rf?: number;
  xgb?: number;
  mlp?: number;
  [key: string]: number | undefined;
}

export function ROCChart({ data, height = 280 }: Props) {
  const points = useMemo(() => {
    // Each model has its own ROC fpr/tpr arrays. Merge by interpolating each model's
    // tpr at a shared grid of fpr values (51 points) so Recharts can render a single
    // dataset with one column per model.
    const grid: number[] = Array.from({ length: 51 }, (_, i) => i / 50);
    const interp = (fpr: number[], tpr: number[], target: number): number => {
      if (target <= fpr[0]) return tpr[0];
      if (target >= fpr[fpr.length - 1]) return tpr[fpr.length - 1];
      for (let i = 0; i < fpr.length - 1; i++) {
        if (fpr[i] <= target && fpr[i + 1] >= target) {
          const t = (target - fpr[i]) / (fpr[i + 1] - fpr[i] || 1);
          return tpr[i] + t * (tpr[i + 1] - tpr[i]);
        }
      }
      return tpr[tpr.length - 1];
    };
    return grid.map<RocPoint>((fpr) => {
      const row: RocPoint = { fpr };
      for (const id of MODEL_ORDER) {
        const m = data.models[id];
        if (!m) continue;
        row[id] = interp(m.roc_curve.fpr, m.roc_curve.tpr, fpr);
      }
      // diagonal reference
      row.diagonal = fpr;
      return row;
    });
  }, [data]);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart
        data={points}
        margin={{ top: 8, right: 12, left: -8, bottom: 4 }}
      >
        <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
        <XAxis
          dataKey="fpr"
          type="number"
          domain={[0, 1]}
          ticks={[0, 0.25, 0.5, 0.75, 1]}
          tickFormatter={(v) => v.toFixed(2)}
          stroke="hsl(var(--muted-foreground))"
          tick={{ fontSize: 10 }}
          label={{
            value: "False positive rate",
            position: "insideBottom",
            offset: -2,
            fill: "hsl(var(--muted-foreground))",
            fontSize: 10,
          }}
        />
        <YAxis
          domain={[0, 1]}
          ticks={[0, 0.25, 0.5, 0.75, 1]}
          tickFormatter={(v) => v.toFixed(2)}
          stroke="hsl(var(--muted-foreground))"
          tick={{ fontSize: 10 }}
          label={{
            value: "True positive rate",
            angle: -90,
            position: "insideLeft",
            offset: 16,
            fill: "hsl(var(--muted-foreground))",
            fontSize: 10,
          }}
        />
        <Tooltip
          contentStyle={{
            background: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 6,
            fontSize: 11,
          }}
          formatter={(value: number, name: string) => [
            value.toFixed(3),
            MODEL_DISPLAY[name as ModelId] ?? name,
          ]}
          labelFormatter={(v: number) => `FPR ${v.toFixed(3)}`}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
          formatter={(value) => MODEL_DISPLAY[value as ModelId] ?? value}
          iconType="line"
        />
        <Line
          type="monotone"
          dataKey="diagonal"
          stroke="hsl(var(--muted-foreground))"
          strokeDasharray="4 4"
          strokeWidth={1}
          dot={false}
          activeDot={false}
          isAnimationActive={false}
          legendType="none"
        />
        {MODEL_ORDER.map((id) => (
          <Line
            key={id}
            type="monotone"
            dataKey={id}
            stroke={MODEL_COLORS[id]}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
