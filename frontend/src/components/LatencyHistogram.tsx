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

// Fine bins below 5 ms (so we can resolve Lookup ~0.05 ms vs GLM ~0.05 ms vs Native MLP ~2 ms),
// coarser bins above so 1000-req stress tests don't explode the bar count.
const FINE_EDGES = Array.from({ length: 26 }, (_, i) => +(i * 0.2).toFixed(2)); // 0..5 step 0.2
const COARSE_EDGES = [6, 8, 10, 15, 20, 30, 50, 100];
const EDGES: number[] = [...FINE_EDGES, ...COARSE_EDGES];

interface Props {
  latencies: number[];
  height?: number;
}

interface Bin {
  label: string;
  midpoint: number;
  count: number;
}

function buildBins(latencies: number[]): Bin[] {
  const bins: Bin[] = [];
  for (let i = 0; i < EDGES.length - 1; i++) {
    const lo = EDGES[i];
    const hi = EDGES[i + 1];
    bins.push({
      label: hi <= 5 ? lo.toFixed(1) : `${lo.toFixed(0)}`,
      midpoint: (lo + hi) / 2,
      count: 0,
    });
  }
  for (const v of latencies) {
    if (v < EDGES[0]) {
      bins[0].count += 1;
      continue;
    }
    let placed = false;
    for (let i = 0; i < EDGES.length - 1; i++) {
      if (v >= EDGES[i] && v < EDGES[i + 1]) {
        bins[i].count += 1;
        placed = true;
        break;
      }
    }
    if (!placed) bins[bins.length - 1].count += 1; // overflow
  }
  return bins;
}

export function LatencyHistogram({ latencies, height = 160 }: Props) {
  const bins = useMemo(() => buildBins(latencies), [latencies]);
  const empty = latencies.length === 0;

  if (empty) {
    return (
      <div
        className="flex items-center justify-center rounded-md border border-dashed text-[11px] text-muted-foreground"
        style={{ height }}
      >
        Run a prediction to see the latency distribution.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={bins} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="hsl(var(--border))"
          vertical={false}
        />
        <XAxis
          dataKey="label"
          stroke="hsl(var(--muted-foreground))"
          tick={{ fontSize: 9 }}
          interval="preserveStartEnd"
          tickLine={false}
        />
        <YAxis
          stroke="hsl(var(--muted-foreground))"
          tick={{ fontSize: 10 }}
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
          width={28}
        />
        <Tooltip
          cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
          contentStyle={{
            background: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 6,
            fontSize: 11,
          }}
          formatter={(value: number) => [value, "count"]}
          labelFormatter={(label) => `${label} ms`}
        />
        <Bar dataKey="count" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
