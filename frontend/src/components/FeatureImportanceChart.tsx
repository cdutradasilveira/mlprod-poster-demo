import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { MODEL_COLORS } from "@/lib/theme";
import type { ModelId } from "@/lib/types";

interface Props {
  featureOrder: string[];
  importances: number[];
  model: ModelId;
  height?: number;
}

interface Row {
  feature: string;
  importance: number;
}

export function FeatureImportanceChart({
  featureOrder,
  importances,
  model,
  height = 260,
}: Props) {
  const rows = useMemo<Row[]>(() => {
    return featureOrder
      .map((f, i) => ({ feature: f, importance: importances[i] ?? 0 }))
      .sort((a, b) => Math.abs(b.importance) - Math.abs(a.importance));
  }, [featureOrder, importances]);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={rows}
        layout="vertical"
        margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
      >
        <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" horizontal={false} />
        <XAxis
          type="number"
          stroke="hsl(var(--muted-foreground))"
          tick={{ fontSize: 10 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          type="category"
          dataKey="feature"
          stroke="hsl(var(--muted-foreground))"
          tick={{ fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          width={140}
        />
        <Tooltip
          cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
          contentStyle={{
            background: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 6,
            fontSize: 11,
          }}
          formatter={(value: number) => [value.toFixed(4), "importance"]}
        />
        <Bar
          dataKey="importance"
          fill={MODEL_COLORS[model]}
          fillOpacity={0.85}
          radius={[0, 3, 3, 0]}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
