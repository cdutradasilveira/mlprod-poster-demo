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

interface PRPoint {
  recall: number;
  logreg?: number;
  rf?: number;
  xgb?: number;
  mlp?: number;
}

export function PRChart({ data, height = 280 }: Props) {
  const points = useMemo(() => {
    // PR curve from sklearn comes in *decreasing recall* order. We sort by recall
    // ascending and then interpolate onto a shared grid for clean overlay.
    const grid: number[] = Array.from({ length: 51 }, (_, i) => i / 50);
    const interp = (recall: number[], precision: number[], target: number): number => {
      // assume recall sorted ascending
      if (target <= recall[0]) return precision[0];
      if (target >= recall[recall.length - 1]) return precision[precision.length - 1];
      for (let i = 0; i < recall.length - 1; i++) {
        if (recall[i] <= target && recall[i + 1] >= target) {
          const t = (target - recall[i]) / (recall[i + 1] - recall[i] || 1);
          return precision[i] + t * (precision[i + 1] - precision[i]);
        }
      }
      return precision[precision.length - 1];
    };

    return grid.map<PRPoint>((recall) => {
      const row: PRPoint = { recall };
      for (const id of MODEL_ORDER) {
        const m = data.models[id];
        if (!m) continue;
        const pairs = m.pr_curve.recall
          .map((r, i) => ({ r, p: m.pr_curve.precision[i] }))
          .sort((a, b) => a.r - b.r);
        const recalls = pairs.map((x) => x.r);
        const precisions = pairs.map((x) => x.p);
        row[id] = interp(recalls, precisions, recall);
      }
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
          dataKey="recall"
          type="number"
          domain={[0, 1]}
          ticks={[0, 0.25, 0.5, 0.75, 1]}
          tickFormatter={(v) => v.toFixed(2)}
          stroke="hsl(var(--muted-foreground))"
          tick={{ fontSize: 10 }}
          label={{
            value: "Recall",
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
            value: "Precision",
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
          labelFormatter={(v: number) => `Recall ${v.toFixed(3)}`}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
          formatter={(value) => MODEL_DISPLAY[value as ModelId] ?? value}
          iconType="line"
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
