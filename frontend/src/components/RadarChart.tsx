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

// Static axes for each method (paper §4). Canonical source of truth — keep
// CLAUDE.md §8 in sync if these values change.
//
// All six axes (including `latency`) are paper-sourced static scores; the
// chart renders them as-is, with no live measurement mixed in.
const STATIC_AXES: Record<
  MethodId,
  Record<"modeling_flexibility" | "input_space_flexibility" | "stack_flexibility" | "consistency" | "observability" | "latency", number>
> = {
  lookup: {
    modeling_flexibility: 0,
    input_space_flexibility: -1,
    stack_flexibility: 1,
    consistency: 0,
    observability: -1,
    latency: 1,
  },
  glm: {
    modeling_flexibility: -1,
    input_space_flexibility: 0,
    stack_flexibility: 1,
    consistency: -1,
    observability: 1,
    latency: 0,
  },
  native: {
    modeling_flexibility: 0,
    input_space_flexibility: 0,
    stack_flexibility: -1,
    consistency: 1,
    observability: 0,
    latency: 0,
  },
  scripted: {
    modeling_flexibility: 1,
    input_space_flexibility: 1,
    stack_flexibility: 0,
    consistency: 1,
    observability: -1,
    latency: -1,
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

interface Props {
  method: MethodId;
  height?: number;
}

export function MethodRadarChart({ method, height = 220 }: Props) {
  const data = useMemo(
    () =>
      Object.entries(STATIC_AXES[method]).map(([k, v]) => ({
        axis: AXIS_LABELS[k],
        value: v,
      })),
    [method],
  );

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
          formatter={(value: number) => [value, "score"]}
        />
      </RechartsRadar>
    </ResponsiveContainer>
  );
}
