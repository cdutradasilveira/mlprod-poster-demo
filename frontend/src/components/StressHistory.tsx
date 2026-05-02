import type { ModelId, MethodId } from "@/lib/types";

export interface StressHistoryEntry {
  ts: number;
  model: ModelId;
  method: MethodId;
  n_requests: number;
  p50: number;
  p95: number;
  p99: number;
  hits: number;
  misses: number;
  errors: number;
}

interface Props {
  entries: StressHistoryEntry[];
}

function fmtMs(v: number) {
  if (v < 1) return `${(v).toFixed(3)} ms`;
  if (v < 10) return `${v.toFixed(2)} ms`;
  return `${v.toFixed(1)} ms`;
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString();
}

export function StressHistory({ entries }: Props) {
  if (entries.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
        Stress test history is empty. Run a stress test to start logging runs.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-xs">
        <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Time</th>
            <th className="px-3 py-2 text-left">Model</th>
            <th className="px-3 py-2 text-left">Method</th>
            <th className="px-3 py-2 text-right">N</th>
            <th className="px-3 py-2 text-right">p50</th>
            <th className="px-3 py-2 text-right">p95</th>
            <th className="px-3 py-2 text-right">p99</th>
            <th className="px-3 py-2 text-right">hits</th>
            <th className="px-3 py-2 text-right">misses</th>
            <th className="px-3 py-2 text-right">errors</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr
              key={`${e.ts}-${i}`}
              className="border-t border-border/60 hover:bg-muted/30"
            >
              <td className="px-3 py-2 font-mono text-muted-foreground">
                {fmtTime(e.ts)}
              </td>
              <td className="px-3 py-2 font-medium">{e.model}</td>
              <td className="px-3 py-2">{e.method}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {e.n_requests}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">
                {fmtMs(e.p50)}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">
                {fmtMs(e.p95)}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">
                {fmtMs(e.p99)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{e.hits}</td>
              <td className="px-3 py-2 text-right tabular-nums">{e.misses}</td>
              <td className="px-3 py-2 text-right tabular-nums">{e.errors}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
