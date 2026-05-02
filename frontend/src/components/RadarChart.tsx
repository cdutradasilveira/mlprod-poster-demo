import { useMemo } from "react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart as RechartsRadar,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import type { MethodId } from "@/lib/types";

// Static axes for each method (paper §4 + CLAUDE.md §8). Mirrors
// backend/app/metrics/radar.py — kept in sync manually.
const STATIC_AXES: Record<
  MethodId,
  Record<"modeling_flexibility" | "input_space_flexibility" | "stack_flexibility" | "consistency" | "observability", number>
> = {
  lookup: {
    modeling_flexibility: 1,
    input_space_flexibility: -1,
    stack_flexibility: 1,
    consistency: 0,
    observability: 1,
  },
  glm: {
    modeling_flexibility: -1,
    input_space_flexibility: 1,
    stack_flexibility: 1,
    consistency: -1,
    observability: 1,
  },
  native: {
    modeling_flexibility: 1,
    input_space_flexibility: 1,
    stack_flexibility: -1,
    consistency: 1,
    observability: 0,
  },
  scripted: {
    modeling_flexibility: 1,
    input_space_flexibility: 1,
    stack_flexibility: -1,
    consistency: 0,
    observability: -1,
  },
};

const AXIS_LABELS: Record<string, string> = {
  modeling_flexibility: "Modeling",
  input_space_flexibility: "Input space",
  stack_flexibility: "Stack",
  consistency: "Consistency",
  observability: "Observability",
  latency: "Latency",
};

function latencyAxis(p95Ms: number | null): number | null {
  if (p95Ms === null) return null;
  if (p95Ms <= 2) return 1;
  if (p95Ms <= 10) return 0;
  return -1;
}

interface Props {
  method: MethodId;
  p95Ms: number | null;
  height?: number;
}

export function MethodRadarChart({ method, p95Ms, height = 220 }: Props) {
  const data = useMemo(() => {
    const axes = STATIC_AXES[method];
    const lat = latencyAxis(p95Ms);
    return [
      ...Object.entries(axes).map(([k, v]) => ({
        axis: AXIS_LABELS[k],
        value: v,
        kind: "static",
      })),
      {
        axis: AXIS_LABELS.latency,
        value: lat ?? 0,
        kind: lat === null ? "no-data" : "dynamic",
      },
    ];
  }, [method, p95Ms]);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsRadar data={data} outerRadius="72%">
        <PolarGrid stroke="hsl(var(--border))" />
        <PolarAngleAxis
          dataKey="axis"
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
        />
        <PolarRadiusAxis
          angle={90}
          domain={[-1, 1]}
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
          stroke="hsl(var(--border))"
        />
        <Radar
          dataKey="value"
          stroke="hsl(var(--primary))"
          fill="hsl(var(--primary))"
          fillOpacity={0.25}
        />
        <Tooltip
          contentStyle={{
            background: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 6,
            fontSize: 11,
          }}
          formatter={(value: number, _name: string, payload: { payload?: { kind?: string } } | undefined) => {
            const kind = payload?.payload?.kind;
            if (kind === "no-data") return ["not yet measured", "value"];
            return [value, "score"];
          }}
        />
      </RechartsRadar>
    </ResponsiveContainer>
  );
}
