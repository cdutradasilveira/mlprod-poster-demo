import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Props {
  binEdges: number[];
  positive: number[];
  negative: number[];
  height?: number;
}

interface Bin {
  label: string;
  positive: number;
  negative: number;
}

export function PredictedProbHistogram({
  binEdges,
  positive,
  negative,
  height = 220,
}: Props) {
  const data = useMemo<Bin[]>(() => {
    const out: Bin[] = [];
    for (let i = 0; i < positive.length; i++) {
      const lo = binEdges[i];
      const hi = binEdges[i + 1];
      const mid = (lo + hi) / 2;
      out.push({
        label: mid.toFixed(2),
        positive: positive[i] ?? 0,
        negative: negative[i] ?? 0,
      });
    }
    return out;
  }, [binEdges, positive, negative]);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 4 }}>
        <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          stroke="hsl(var(--muted-foreground))"
          tick={{ fontSize: 10 }}
          interval={2}
          tickLine={false}
          label={{
            value: "Predicted probability",
            position: "insideBottom",
            offset: -2,
            fill: "hsl(var(--muted-foreground))",
            fontSize: 10,
          }}
        />
        <YAxis
          stroke="hsl(var(--muted-foreground))"
          tick={{ fontSize: 10 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          contentStyle={{
            background: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 6,
            fontSize: 11,
          }}
          labelFormatter={(label) => `prob ≈ ${label}`}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
          formatter={(value) =>
            value === "positive" ? "True positive (booked)" : "True negative (not booked)"
          }
        />
        <Bar
          dataKey="negative"
          fill="hsl(0, 65%, 60%)"
          fillOpacity={0.55}
          stackId="overlay"
          isAnimationActive={false}
        />
        <Bar
          dataKey="positive"
          fill="hsl(160, 65%, 45%)"
          fillOpacity={0.55}
          stackId="overlay2"
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
