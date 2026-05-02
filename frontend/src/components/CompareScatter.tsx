import { useMemo } from "react";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

import {
  METHOD_COLORS,
  MODEL_COLORS,
  MODEL_DISPLAY,
  fmtMs,
  fmtNum,
} from "@/lib/theme";
import type { CompareRow, MethodId, ModelId } from "@/lib/types";

interface Props {
  rows: CompareRow[];
  height?: number;
}

const METHOD_ORDER: MethodId[] = ["lookup", "glm", "native", "scripted"];

const MODEL_SHAPES: Record<ModelId, "circle" | "square" | "triangle" | "diamond"> = {
  logreg: "circle",
  rf: "square",
  xgb: "triangle",
  mlp: "diamond",
};

interface Point {
  model: ModelId;
  method: MethodId;
  p95: number;
  auc: number;
  pareto: boolean;
}

function paretoFrontier(points: Point[]): Point[] {
  // A point dominates another if it has lower or equal p95 AND higher or equal AUC,
  // with strict inequality in at least one. The frontier = non-dominated points.
  const frontier: Point[] = [];
  for (const p of points) {
    const dominated = points.some(
      (q) =>
        q !== p &&
        q.p95 <= p.p95 &&
        q.auc >= p.auc &&
        (q.p95 < p.p95 || q.auc > p.auc),
    );
    if (!dominated) frontier.push(p);
  }
  return frontier.sort((a, b) => a.p95 - b.p95);
}

export function CompareScatter({ rows, height = 360 }: Props) {
  const { points, frontierPoints } = useMemo(() => {
    const pts: Point[] = rows
      .filter((r) => r.auc !== null && r.p95 > 0)
      .map((r) => ({
        model: r.model,
        method: r.method,
        p95: r.p95,
        auc: r.auc!,
        pareto: false,
      }));
    const front = paretoFrontier(pts);
    const frontKeys = new Set(front.map((p) => `${p.model}:${p.method}`));
    for (const p of pts) {
      if (frontKeys.has(`${p.model}:${p.method}`)) p.pareto = true;
    }
    return { points: pts, frontierPoints: front };
  }, [rows]);

  // Recharts groups Scatter series by `data` prop. Group by method so each method
  // renders with its own color. Within each group, individual shapes encode model.
  const seriesByMethod = METHOD_ORDER.map((method) => ({
    method,
    data: points.filter((p) => p.method === method),
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 16, right: 32, bottom: 28, left: 16 }}>
        <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
        <XAxis
          type="number"
          dataKey="p95"
          name="p95 latency"
          scale="log"
          domain={["auto", "auto"]}
          stroke="hsl(var(--muted-foreground))"
          tick={{ fontSize: 10 }}
          tickFormatter={(v: number) => `${v.toFixed(v < 1 ? 2 : 1)}ms`}
          label={{
            value: "p95 latency (log scale, ms)",
            position: "insideBottom",
            offset: -8,
            fill: "hsl(var(--muted-foreground))",
            fontSize: 11,
          }}
        />
        <YAxis
          type="number"
          dataKey="auc"
          name="AUC"
          domain={[
            (dataMin: number) => Math.max(0.5, dataMin - 0.02),
            (dataMax: number) => Math.min(1, dataMax + 0.02),
          ]}
          stroke="hsl(var(--muted-foreground))"
          tick={{ fontSize: 10 }}
          tickFormatter={(v: number) => v.toFixed(2)}
          label={{
            value: "AUC (offline test)",
            angle: -90,
            position: "insideLeft",
            offset: 16,
            fill: "hsl(var(--muted-foreground))",
            fontSize: 11,
          }}
        />
        <ZAxis range={[80, 80]} />
        <Tooltip
          cursor={{ strokeDasharray: "3 3" }}
          contentStyle={{
            background: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 6,
            fontSize: 11,
          }}
          formatter={(value: number, name: string) => {
            if (name === "p95") return [fmtMs(value), "p95 latency"];
            if (name === "auc") return [fmtNum(value, 4), "AUC"];
            return [value, name];
          }}
          labelFormatter={() => ""}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload as Point;
            return (
              <div className="rounded-md border bg-popover p-2 text-[11px] shadow-md">
                <div className="mb-1 font-semibold">
                  {MODEL_DISPLAY[d.model]} × {d.method}
                </div>
                <div className="text-muted-foreground">
                  p95 latency: <span className="font-mono">{fmtMs(d.p95)}</span>
                </div>
                <div className="text-muted-foreground">
                  AUC: <span className="font-mono">{fmtNum(d.auc, 4)}</span>
                </div>
                {d.pareto && (
                  <div className="mt-1 text-emerald-500">
                    ★ on Pareto frontier
                  </div>
                )}
              </div>
            );
          }}
        />
        {/* Pareto frontier line drawn as a dedicated zero-opacity scatter with line */}
        {frontierPoints.length >= 2 && (
          <Scatter
            data={frontierPoints}
            line={{ stroke: "hsl(160, 70%, 45%)", strokeWidth: 1.5, strokeDasharray: "4 3" }}
            shape={() => <></>}
            isAnimationActive={false}
            legendType="none"
          />
        )}
        {seriesByMethod.map((s) =>
          s.data.length === 0 ? null : (
            <Scatter
              key={s.method}
              name={s.method}
              data={s.data}
              fill={METHOD_COLORS[s.method]}
              fillOpacity={0.85}
              stroke="hsl(var(--background))"
              strokeWidth={1}
              shape={(props: { cx?: number; cy?: number; payload?: Point }) => {
                const { cx, cy, payload } = props;
                if (cx === undefined || cy === undefined || !payload) return <g />;
                const shape = MODEL_SHAPES[payload.model];
                const r = 7;
                const fill = METHOD_COLORS[payload.method];
                const stroke = MODEL_COLORS[payload.model];
                const ring = payload.pareto ? (
                  <circle cx={cx} cy={cy} r={r + 4} fill="none" stroke="hsl(160, 70%, 45%)" strokeDasharray="2 2" />
                ) : null;
                let glyph: JSX.Element;
                if (shape === "circle")
                  glyph = <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={1.5} />;
                else if (shape === "square")
                  glyph = (
                    <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} fill={fill} stroke={stroke} strokeWidth={1.5} />
                  );
                else if (shape === "triangle")
                  glyph = (
                    <polygon
                      points={`${cx},${cy - r} ${cx - r},${cy + r * 0.8} ${cx + r},${cy + r * 0.8}`}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth={1.5}
                    />
                  );
                else
                  glyph = (
                    <polygon
                      points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth={1.5}
                    />
                  );
                return (
                  <g>
                    {ring}
                    {glyph}
                  </g>
                );
              }}
              isAnimationActive={false}
            />
          ),
        )}
      </ScatterChart>
    </ResponsiveContainer>
  );
}

export function CompareLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
      <div className="flex items-center gap-3">
        <span className="font-semibold uppercase tracking-wide">Method (color):</span>
        {METHOD_ORDER.map((m) => (
          <span key={m} className="flex items-center gap-1">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: METHOD_COLORS[m] }}
            />
            {m}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <span className="font-semibold uppercase tracking-wide">Model (shape):</span>
        <span>● LogReg</span>
        <span>■ RF</span>
        <span>▲ XGB</span>
        <span>◆ MLP</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded-full border-2 border-dashed border-emerald-500" />
        <span>Pareto frontier</span>
      </div>
    </div>
  );
}
